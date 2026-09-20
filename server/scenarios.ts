/**
 * "What Would You Do?" — AI scenario engine.
 *
 * One engine for every scenario in shared/scenarios.ts:
 *   start   → AI character delivers the opening (in its own words) + suggested replies
 *   turn    → AI classifies the carer's reply, plays the character's reaction; the SERVER applies
 *             a fixed rule table to move the emotional intensity (never random), and decides
 *             when the scene ends (resolved / turn limit / safety escalation)
 *   evaluate→ AI coach scores the interaction (not the person) and explains why
 *
 * All AI output is structured JSON, validated with zod, retried once, and fails gracefully.
 */
import { Router } from 'express'
import { z } from 'zod'
import { SCENARIOS, scenarioById, type Scenario, type ScenarioMode } from '../shared/scenarios.ts'
import { AI_REQUIREMENTS, completeJson, languageName, type JsonSchema } from './ai.ts'
import { me } from './auth.ts'
import { aiConfigured } from './config.ts'
import { q } from './db.ts'
import { HttpError, idParam, log, parse, rateLimit, wrap } from './util.ts'

export const scenariosRouter = Router()
const limiter = rateLimit({ name: 'scenario-ai', windowMs: 60_000, max: 30, key: (r) => String(r.user?.id) })

/* ======================= Emotion dynamics (deterministic) ======================= */

export const RESPONSE_STYLES = [
  'validating', 'reassuring', 'redirecting', 'practical_help', 'joining',
  'neutral', 'unclear', 'over_explaining', 'quizzing', 'correcting',
  'dismissive', 'commanding', 'arguing', 'blaming', 'unsafe',
] as const
export type ResponseStyle = (typeof RESPONSE_STYLES)[number]

/** Change in emotional intensity for a CLEAR example of each style (halved when "slight"). */
export const STYLE_EFFECT: Record<ResponseStyle, number> = {
  validating: -20, // names/accepts the feeling ("I can see you're scared")
  reassuring: -20, // calm safety/comfort ("You're safe, I'm here")
  joining: -12, // enters their reality kindly ("Tell me about the village")
  redirecting: -12, // gentle shift to something calming/meaningful
  practical_help: -10, // solves the real need (glasses, water, seat)
  neutral: 0,
  unclear: 0,
  over_explaining: 5, // long reasoning / too much information
  quizzing: 8, // testing memory ("Who is this? Don't you remember?")
  dismissive: 10, // "Stop worrying", "it's nothing"
  correcting: 12, // bluntly correcting facts
  commanding: 12, // orders, rushing
  arguing: 20, // arguing with their belief
  blaming: 20, // blaming, scolding, shaming
  unsafe: 20, // restraint, threats, deception that risks harm, leaving them in danger
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

export function nextIntensity(current: number, style: ResponseStyle, strength: 'slight' | 'clear') {
  let d = STYLE_EFFECT[style] * (strength === 'slight' ? 0.5 : 1)
  if (d < 0 && current < 30) d = d / 2 // settling slows as they get calm
  return { intensity: clamp(current + d, 5, 100), delta: Math.round(d) }
}

export const scoreBand = (s: number) => (s >= 90 ? 'Excellent' : s >= 75 ? 'Good' : s >= 55 ? 'Getting there' : 'Keep practising')

/* ======================= Session state ======================= */

export interface Turn {
  role: 'character' | 'carer'
  text: string
  narration?: string
  emotion?: string
  intensity?: number
  delta?: number
  style?: ResponseStyle
  at: number
}
export interface SessionState {
  emotion: string
  intensity: number
  turns: Turn[]
  suggestions: string[]
  carerTurns: number
  endReason: null | 'resolved' | 'max_turns' | 'safety' | 'finished_early'
}
type Status = 'active' | 'ended' | 'safety' | 'evaluated'
interface Row { id: number; user_id: number; scenario_id: string; mode: ScenarioMode; lang: string; status: Status; state: string; evaluation: string | null; score: number | null; created_at: number }

/* ======================= AI schemas ======================= */

const S = (type: string, extra: Record<string, unknown> = {}) => ({ type, ...extra })
const obj = (properties: Record<string, unknown>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const LEVELS = ['needs_practice', 'developing', 'good', 'strong'] as const
export const DIMENSIONS = ['calmness', 'reassurance', 'listening', 'validation', 'clarity', 'de_escalation', 'safety_awareness'] as const

const TURN_SCHEMA = obj({
  assessment: obj({
    style: S('string', { enum: [...RESPONSE_STYLES] }),
    strength: S('string', { enum: ['slight', 'clear'] }),
    note: S('string', { description: 'one short sentence: what the carer did and how it landed' }),
  }),
  character_response: S('string'),
  narration: S('string', { description: 'short third-person stage direction of body language, or empty' }),
  emotion: S('string', { description: 'one or two words' }),
  resolved: S('boolean'),
  safety_escalation: S('boolean'),
  should_continue: S('boolean'),
  suggestions: { type: 'array', items: S('string') },
})

const EVAL_SCHEMA = obj({
  score: S('integer'),
  summary: S('string'),
  dimensions: obj(Object.fromEntries(DIMENSIONS.map((d) => [d, S('string', { enum: [...LEVELS] })]))),
  strengths: { type: 'array', items: S('string') },
  improvements: { type: 'array', items: S('string') },
  explanation: S('string'),
  suggested_response: S('string'),
  key_moment: obj({ quote: S('string'), likely_effect: S('string') }),
})

const zTurnOut = z.object({
  assessment: z.object({
    style: z.enum(RESPONSE_STYLES).catch('neutral'),
    strength: z.enum(['slight', 'clear']).catch('clear'),
    note: z.string().catch(''),
  }).catch({ style: 'neutral', strength: 'clear', note: '' }),
  character_response: z.string().trim().min(1).max(600),
  narration: z.string().max(300).catch(''),
  emotion: z.string().trim().max(40).catch(''),
  resolved: z.boolean().catch(false),
  safety_escalation: z.boolean().catch(false),
  should_continue: z.boolean().catch(true),
  suggestions: z.array(z.string().trim().min(1).max(220)).catch([]),
})
type TurnOut = z.infer<typeof zTurnOut>

const zLevel = z.enum(LEVELS).catch('developing')
const zEvalOut = z.object({
  score: z.coerce.number().min(0).max(100),
  summary: z.string().max(300).catch(''),
  dimensions: z.object(Object.fromEntries(DIMENSIONS.map((d) => [d, zLevel])) as Record<(typeof DIMENSIONS)[number], typeof zLevel>),
  strengths: z.array(z.string().max(300)).min(1),
  improvements: z.array(z.string().max(300)).catch([]),
  explanation: z.string().min(1).max(900),
  suggested_response: z.string().min(1).max(300),
  key_moment: z.object({ quote: z.string().max(300), likely_effect: z.string().max(400) }).catch({ quote: '', likely_effect: '' }),
})
export type Evaluation = z.infer<typeof zEvalOut> & { band: string; aiScore: number; outcomeScore: number; startIntensity: number; endIntensity: number }

/** Structured call + validation; one retry with a stricter nudge; then a graceful, translated error. */
async function askJson<T>(system: string, user: string, schema: JsonSchema, validator: z.ZodType<T>, maxTokens: number): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await completeJson<unknown>(system, [{ role: 'user', content: attempt ? user + '\n\nIMPORTANT: reply with ONE valid JSON object exactly matching the requested fields, nothing else.' : user }], schema, maxTokens)
    const r = validator.safeParse(raw)
    if (r.success) return r.data
    log.warn('scenario ai output invalid', { attempt, issues: r.error.issues.slice(0, 3).map((i) => i.path.join('.') + ':' + i.code) })
  }
  throw new HttpError(502, 'AI_BAD_OUTPUT', 'The practice partner could not answer just now. Please try again.')
}

/* ======================= Prompts ======================= */

const who = (s: Scenario) => `${s.character.name} (${s.relationship}, ${s.character.age})`

function transcript(s: Scenario, st: SessionState) {
  return st.turns.map((t) => t.role === 'character'
    ? `${s.character.name.toUpperCase()}: "${t.text}"${t.narration ? ` [${t.narration}]` : ''} {feeling: ${t.emotion ?? st.emotion} ${t.intensity ?? ''}/100}`
    : `CARER: "${t.text}"${t.style ? ` {classified: ${t.style}${t.delta ? `, intensity ${t.delta > 0 ? '+' : ''}${t.delta}` : ''}}` : ''}`).join('\n')
}

function characterSystem(s: Scenario, lang: string) {
  return `You are the character in "What Would You Do?", a communication-practice simulation for family carers inside the Recallia Quest app. You are NOT an assistant, coach or therapist during the scene: you ARE ${who(s)}, reacting like a real person.

SCENARIO: ${s.title} (category: ${s.category})
CHARACTER: ${s.character.name}, ${s.character.age}, ${s.relationship} of the carer (the user). Pronoun: ${s.character.pronoun}.
ENVIRONMENT: ${s.environment}
WHAT THE CARER KNOWS: ${s.context}
HIDDEN TRUTH (shapes your reactions, reveal only naturally): ${s.background}
WHAT YOU NEED: ${s.characterGoal}
SAFETY NOTES: ${s.safetyNotes}

HOW TO PLAY
- Speak only as ${s.character.name}, in ${languageName(lang)}. 1–3 short spoken sentences, simple everyday words, like a real older adult. No lists, no emojis, no stage directions inside character_response.
- React to what the carer ACTUALLY said and HOW they said it, remembering everything said earlier. Never repeat an earlier line word for word. Different carer replies must lead to different reactions.
- Do not praise or coach the carer, do not mention scores, AI or this being practice. If the carer says something off-topic or odd, react in character (puzzled, distracted).
- Your feelings must follow the carer's communication, using this fixed rule table on your current intensity (0 = calm, 100 = extremely distressed):
  validating −20, reassuring −20, joining their reality −12, gentle redirecting −12, practical help −10, neutral/unclear 0, over-explaining +5, quizzing memory +8, dismissive +10, correcting bluntly +12, commanding/rushing +12, arguing +20, blaming/scolding +20, unsafe +20. A "slight" example counts half.
  First classify the carer's latest message into ONE style (the most important one) and strength, then speak at the resulting intensity: high = short, agitated, repetitive; lower = softer, more trusting, may accept help.
- "narration": one short third-person line of visible body language/situation change (e.g. "He loosens his grip on the gate."), or "".
- "resolved": true when you have clearly settled (intensity about 25 or below) or the immediate problem is solved.
- "safety_escalation": true ONLY if there is immediate physical danger now (e.g. heading into traffic, a fall, a medical emergency, aggression with an object, the carer suggesting restraint or harm). Then react realistically; dialogue alone does not solve danger.
- "should_continue": false when the scene has reached a natural stable point.
- "suggestions": exactly 3 things the carer could say NEXT (each under 20 words, in ${languageName(lang)}), each a DIFFERENT approach: one that validates/reassures, one practical or gently redirecting, and one common reply that may be less helpful (e.g. correcting, reasoning or rushing). Mix the order. No labels. Never suggest anything unsafe.
Respond ONLY with JSON: {"assessment":{"style","strength","note"},"character_response","narration","emotion","resolved","safety_escalation","should_continue","suggestions":[...]}`
}

const EVAL_SYSTEM = (s: Scenario, lang: string) => `You are a warm, practical communication coach for family carers in Recallia Quest's "What Would You Do?" practice. Write in ${languageName(lang)}, plain words, short sentences.

You evaluate the INTERACTION, never the person: do not judge personality, intelligence, empathy, morality or mental health. There is no single correct response; human behaviour varies. Never say "wrong" or "correct answer"; describe the likely effect ("this may have helped him feel safer", "this may have increased her worry"). Never shame. Encourage.

SCENARIO: ${s.title} — ${s.context}
CHARACTER: ${who(s)}. What they needed: ${s.characterGoal}
Strategies that often help here (a guide, not a checklist): ${s.goals.join('; ')}
Safety notes: ${s.safetyNotes}

Score 0–100 for how well the carer's communication helped the situation (calm, reassuring, listening, validating, clear and short, de-escalating, safety-aware). Consider the emotional trajectory shown. If safety escalation happened, focus coaching on safety: creating space, staying calm, moving away from danger, getting another person's help, and calling emergency services (112 in India) when needed — never dangerous instructions.
Rate each dimension: needs_practice | developing | good | strong.
- strengths: 1–3 specific things the carer did that may have helped (quote or paraphrase their words). If little went well, name a genuine effort (e.g. staying in the conversation).
- improvements: 1–3 specific, kind, actionable ideas.
- explanation: 2–3 sentences on WHY these approaches tend to help in this kind of situation.
- suggested_response: ONE example of something the carer could say at the hardest moment, in quotes-free plain text. It is an example, not the only option.
- key_moment: the carer line that most changed the situation (quote it exactly) and its likely effect.
- summary: one encouraging sentence.
Respond ONLY with JSON: {"score","summary","dimensions":{${DIMENSIONS.join(',')}},"strengths":[],"improvements":[],"explanation","suggested_response","key_moment":{"quote","likely_effect"}}`

/* ======================= Helpers ======================= */

const getRow = (id: number, uid: number) => {
  const r = q.get<Row>('SELECT * FROM scenario_sessions WHERE id = ? AND user_id = ?', id, uid)
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'Practice session not found.')
  return r
}
const scenarioOf = (id: string) => {
  const s = scenarioById(id)
  if (!s) throw new HttpError(404, 'NOT_FOUND', 'Scenario not found.')
  return s
}
const save = (id: number, status: Status, st: SessionState, mode?: ScenarioMode) =>
  q.run('UPDATE scenario_sessions SET status = ?, state = ?, mode = COALESCE(?, mode), updated_at = ? WHERE id = ?', status, JSON.stringify(st), mode ?? null, Date.now(), id)

function view(r: Row) {
  const s = scenarioOf(r.scenario_id)
  const st = JSON.parse(r.state) as SessionState
  return {
    id: r.id, scenarioId: r.scenario_id, mode: r.mode, lang: r.lang, status: r.status,
    emotion: st.emotion, intensity: st.intensity, startIntensity: s.initialIntensity,
    turns: st.turns, suggestions: st.suggestions, carerTurns: st.carerTurns, endReason: st.endReason,
    minTurns: s.turns.min, maxTurns: s.turns.max,
    evaluation: r.evaluation ? (JSON.parse(r.evaluation) as Evaluation) : null,
  }
}

const cleanSuggestions = (xs: string[]) => [...new Set(xs.map((x) => x.replace(/^["“]|["”]$/g, '').trim()).filter(Boolean))].slice(0, 4)
const zMode = z.enum(['natural', 'guided', 'practice'])
const zLang = z.string().max(10).default('en')

/* ======================= Routes ======================= */

scenariosRouter.get('/', (req, res) => {
  const u = me(req)
  const progress = q.all<{ scenario_id: string; best: number | null; attempts: number }>(
    `SELECT scenario_id, MAX(score) best, COUNT(*) attempts FROM scenario_sessions WHERE user_id = ? GROUP BY scenario_id`, u.id)
  res.json({ aiReady: aiConfigured(), required: aiConfigured() ? [] : AI_REQUIREMENTS, progress, total: SCENARIOS.length })
})

scenariosRouter.get('/sessions/:id', (req, res) => {
  res.json({ session: view(getRow(idParam(req), me(req).id)) })
})

/** Start a scene: the AI character opens, in its own words. Nothing is stored unless the AI answers. */
scenariosRouter.post('/sessions', limiter, wrap(async (req, res) => {
  const u = me(req)
  const b = parse(z.object({ scenarioId: z.string().max(80), mode: zMode.default('natural'), lang: zLang }), req.body)
  const s = scenarioOf(b.scenarioId)
  const out = await askJson<TurnOut>(characterSystem(s, b.lang),
    `The scene begins. Current feeling: ${s.initialEmotion} ${s.initialIntensity}/100. Deliver ${s.character.name}'s OPENING line, based on this idea but in your own natural words (vary it): "${s.opening}".
There is no carer message yet: set assessment to {"style":"neutral","strength":"slight","note":""}, resolved false, safety_escalation false, should_continue true. Give 3 suggestions for the carer's first reply.`,
    TURN_SCHEMA, zTurnOut, 700)
  const st: SessionState = {
    emotion: out.emotion || s.initialEmotion,
    intensity: s.initialIntensity,
    turns: [{ role: 'character', text: out.character_response, narration: out.narration, emotion: out.emotion || s.initialEmotion, intensity: s.initialIntensity, at: Date.now() }],
    suggestions: cleanSuggestions(out.suggestions),
    carerTurns: 0,
    endReason: null,
  }
  const now = Date.now()
  const r = q.run('INSERT INTO scenario_sessions (user_id, scenario_id, mode, lang, status, state, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    u.id, s.id, b.mode, b.lang, 'active', JSON.stringify(st), now, now)
  res.status(201).json({ session: view(getRow(Number(r.lastInsertRowid), u.id)) })
}))

/** The carer replies; the character reacts; the server moves the emotion by rule and decides if the scene ends. */
scenariosRouter.post('/sessions/:id/turn', limiter, wrap(async (req, res) => {
  const u = me(req)
  const row = getRow(idParam(req), u.id)
  const b = parse(z.object({ text: z.string().trim().min(1).max(600), mode: zMode.optional() }), req.body)
  if (row.status !== 'active') throw new HttpError(409, 'SCENE_ENDED', 'This conversation has finished. See your coaching or try again.')
  const s = scenarioOf(row.scenario_id)
  const st = JSON.parse(row.state) as SessionState
  const turnNo = st.carerTurns + 1
  const last = turnNo >= s.turns.max

  const out = await askJson<TurnOut>(characterSystem(s, row.lang),
    `CONVERSATION SO FAR:
${transcript(s, st)}

Current feeling: ${st.emotion} ${st.intensity}/100.
The carer now says: "${b.text}"

This is carer reply ${turnNo} of at most ${s.turns.max} (the scene needs at least ${s.turns.min}).${turnNo < s.turns.min ? ' Keep the scene going (should_continue true) unless there is a safety emergency.' : ''}${last ? ` This is the LAST reply: give ${s.character.name}'s closing line wherever things now stand, should_continue false.` : ''}
Classify the carer's reply, then respond as ${s.character.name}.`,
    TURN_SCHEMA, zTurnOut, 700)

  const { intensity, delta } = nextIntensity(st.intensity, out.assessment.style, out.assessment.strength)
  const now = Date.now()
  st.turns.push({ role: 'carer', text: b.text, style: out.assessment.style, delta, at: now })
  st.turns.push({ role: 'character', text: out.character_response, narration: out.narration, emotion: out.emotion || st.emotion, intensity, at: now })
  st.emotion = out.emotion || st.emotion
  st.intensity = intensity
  st.carerTurns = turnNo
  st.suggestions = cleanSuggestions(out.suggestions)

  let status: Status = 'active'
  const safety = out.safety_escalation || out.assessment.style === 'unsafe' && intensity >= 85 || intensity >= 95
  if (safety) { status = 'safety'; st.endReason = 'safety' }
  else if (last) { status = 'ended'; st.endReason = 'max_turns' }
  else if (turnNo >= s.turns.min && (out.resolved || !out.should_continue || intensity <= 25)) { status = 'ended'; st.endReason = 'resolved' }
  if (status !== 'active') st.suggestions = []

  save(row.id, status, st, b.mode)
  res.json({ session: view(getRow(row.id, u.id)) })
}))

/** AI coaching + communication score. Allowed once the scene ends, or early after two replies. */
scenariosRouter.post('/sessions/:id/evaluate', limiter, wrap(async (req, res) => {
  const u = me(req)
  const row = getRow(idParam(req), u.id)
  if (row.evaluation) return void res.json({ session: view(row) })
  const s = scenarioOf(row.scenario_id)
  const st = JSON.parse(row.state) as SessionState
  if (st.carerTurns < 1) throw new HttpError(400, 'VALIDATION', 'Reply at least once before asking for coaching.')
  if (row.status === 'active') {
    if (st.carerTurns < 2) throw new HttpError(400, 'VALIDATION', 'Try at least two replies before finishing.')
    st.endReason = 'finished_early'
  }

  const out = await askJson(EVAL_SYSTEM(s, row.lang),
    `TRANSCRIPT (intensity 0 = calm, 100 = extremely distressed):
${transcript(s, st)}

Start intensity: ${s.initialIntensity}. End intensity: ${st.intensity}. Ended because: ${st.endReason}.${st.endReason === 'safety' ? ' A SAFETY ESCALATION happened: coach on safety first.' : ''}${st.endReason === 'finished_early' ? ' The carer chose to finish early; evaluate what happened so far.' : ''}
Evaluate the carer's communication.`,
    EVAL_SCHEMA, zEvalOut, 1200)

  // Blend the coach's judgement with the observed outcome (how the person's feelings actually moved).
  const aiScore = clamp(out.score)
  const outcomeScore = clamp(50 + (s.initialIntensity - st.intensity) * 1.25)
  const score = clamp(aiScore * 0.75 + outcomeScore * 0.25)
  const evaluation: Evaluation = {
    ...out,
    score,
    band: scoreBand(score),
    aiScore,
    outcomeScore,
    startIntensity: s.initialIntensity,
    endIntensity: st.intensity,
    strengths: out.strengths.slice(0, 3),
    improvements: out.improvements.slice(0, 3),
  }
  q.run('UPDATE scenario_sessions SET status = ?, state = ?, evaluation = ?, score = ?, updated_at = ? WHERE id = ?',
    'evaluated', JSON.stringify(st), JSON.stringify(evaluation), score, Date.now(), row.id)
  res.json({ session: view(getRow(row.id, u.id)) })
}))
