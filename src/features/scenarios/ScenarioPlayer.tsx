import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronLeft, Flag, Keyboard, Lightbulb, Mic, Phone, RotateCcw, Send, ShieldAlert, Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SCENARIOS, categoryById, scenarioById, type Scenario } from '../../../shared/scenarios'
import { api, ApiError } from '../../api/client'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { Button, ErrorView, Toggle } from '../../components/ui'
import { navigate } from '../../lib/router'
import { speak, stopSpeaking, useSpeechInput, useVoiceFor } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'
import { DIMENSION_LABELS, LEVEL_LABELS, feelingLabel, feelingTone, type Level, type ScenarioMode, type ScenarioOverview, type ScenarioSession, type ScenarioTurn } from './types'

const MODES: { id: ScenarioMode; label: string; hint: string }[] = [
  { id: 'natural', label: 'Natural', hint: 'Say or type anything. Ask for an idea if you get stuck.' },
  { id: 'guided', label: 'Guided', hint: 'See a few possible replies to choose from — or use your own words.' },
  { id: 'practice', label: 'Practice', hint: 'No suggestions, feelings hidden until the end — like real life.' },
]

type Pending = { kind: 'start' } | { kind: 'turn'; text: string } | { kind: 'evaluate' }

export default function ScenarioPlayer({ scenarioId, overview, onProgress }: { scenarioId: string; overview: ScenarioOverview | null; onProgress: () => void }) {
  const s = scenarioById(scenarioId)!
  const { lang, t } = useSettings()
  const [mode, setMode] = useState<ScenarioMode>(() => {
    try { return (localStorage.getItem('rq:wwyd-mode') as ScenarioMode) || 'natural' } catch { return 'natural' }
  })
  const [session, setSession] = useState<ScenarioSession | null>(null)
  const [busy, setBusy] = useState<Pending | null>(null)
  const [err, setErr] = useState<{ error: ApiError; retry: Pending } | null>(null)
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [showIdeas, setShowIdeas] = useState(false)
  const [readAloud, setReadAloud] = useState(true)
  const hasVoice = useVoiceFor(lang)
  const bottom = useRef<HTMLDivElement>(null)
  const spokenUpTo = useRef(0)

  useEffect(() => { try { localStorage.setItem('rq:wwyd-mode', mode) } catch { /* private mode */ } }, [mode])
  useEffect(() => () => stopSpeaking(), [])

  // Read each new character line aloud (captions are always on screen).
  useEffect(() => {
    if (!session) return
    const turns = session.turns
    const lastIdx = turns.length - 1
    if (lastIdx >= spokenUpTo.current && turns[lastIdx]?.role === 'character') {
      spokenUpTo.current = lastIdx + 1
      if (readAloud && hasVoice) speak(turns[lastIdx].text, lang).catch(() => {})
    }
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session?.turns.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (p: Pending) => {
    setBusy(p)
    setErr(null)
    try {
      let r: { session: ScenarioSession }
      if (p.kind === 'start') {
        spokenUpTo.current = 0
        r = await api.post('/scenarios/sessions', { scenarioId: s.id, mode, lang })
      } else if (p.kind === 'turn') {
        r = await api.post(`/scenarios/sessions/${session!.id}/turn`, { text: p.text, mode })
        setText('')
      } else {
        r = await api.post(`/scenarios/sessions/${session!.id}/evaluate`)
        onProgress()
      }
      setSession(r.session)
      setShowIdeas(false)
    } catch (e) {
      setErr({ error: e as ApiError, retry: p })
    } finally {
      setBusy(null)
    }
  }

  // When the scene ends on its own, go straight to coaching.
  const ended = session && (session.status === 'ended' || session.status === 'safety')
  useEffect(() => { if (ended && !busy && !err) void run({ kind: 'evaluate' }) }, [ended]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = (value: string) => {
    const v = value.trim()
    if (!v || busy || !session || session.status !== 'active') return
    stopSpeaking()
    // Show the reply immediately; the server confirms it with the character's reaction.
    setSession({ ...session, turns: [...session.turns, { role: 'carer', text: v, at: Date.now() }], suggestions: [] })
    void run({ kind: 'turn', text: v })
  }
  const mic = useSpeechInput(lang, (said) => send(said))

  const retry = () => {
    // The reply stays on screen (not yet confirmed) and is simply sent again.
    if (err) void run(err.retry)
  }
  const restart = () => { stopSpeaking(); setSession(null); setErr(null); setText(''); void run({ kind: 'start' }) }
  const next = nextScenario(s)
  const aiReady = overview?.aiReady !== false

  const lastCharacter = session ? [...session.turns].reverse().find((x) => x.role === 'character') : undefined
  const pendingReply = busy?.kind === 'turn'

  return (
    <AppShell title="What Would You Do?" icon={<span aria-hidden>🗣️</span>} home="/practice" homeLabel="All situations" tone="bg-[linear-gradient(180deg,#e6f4f1,#fff8ec)]">
      <button onClick={() => navigate(`/practice/c/${s.category}`)} className="mb-4 flex min-h-12 items-center gap-1 rounded-full bg-white px-5 text-lg font-bold shadow-sm">
        <ChevronLeft aria-hidden /> {categoryById(s.category)?.emoji} {categoryById(s.category)?.title}
      </button>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* ---------- Scenario context: always visible ---------- */}
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <section className="rounded-[32px] bg-white p-5 shadow-sm" aria-label="The situation">
            <div className="flex items-center gap-4">
              <span aria-hidden className="grid size-24 shrink-0 place-items-center rounded-full bg-sky text-6xl">{s.character.portrait}</span>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-teal">You are talking to</p>
                <p className="text-2xl font-bold">{s.character.name}</p>
                <p className="text-lg text-ink-soft">{cap(s.relationship)}, {s.character.age}</p>
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{s.title}</h2>
            <p className="mt-2 text-lg"><b>What is happening:</b> {s.context}</p>
            <p className="mt-2 text-base text-ink-soft"><b>Where:</b> {s.environment}</p>
          </section>

          <FeelingMeter s={s} session={session} mode={mode} />

          <section className="rounded-[28px] bg-white p-4 shadow-sm">
            <p className="text-lg font-bold">How would you like to practise?</p>
            <div role="radiogroup" aria-label="Practice mode" className="mt-2 grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); setShowIdeas(false) }}
                  className={`min-h-14 rounded-2xl text-lg font-bold ${mode === m.id ? 'bg-teal text-white' : 'bg-cream'}`}>{m.label}</button>
              ))}
            </div>
            <p className="mt-2 text-base text-ink-soft">{MODES.find((m) => m.id === mode)!.hint}</p>
            <div className="mt-3"><Toggle on={readAloud} onChange={(v) => { setReadAloud(v); if (!v) stopSpeaking() }} label={`Read ${s.character.name}'s words aloud`} /></div>
            {!hasVoice && <p className="mt-1 text-sm text-ink-soft">{t('voice.noVoice')}</p>}
          </section>
        </aside>

        {/* ---------- Main stage ---------- */}
        <section className="min-w-0">
          {!aiReady && overview && <ErrorView error={new ApiError(503, 'AI_NOT_CONFIGURED', 'The practice partner needs the AI service (Groq) to be connected.', { required: overview.required })} />}

          {!session && (
            <div className="rounded-[36px] bg-white/85 p-6 shadow-lg sm:p-8">
              <p className="text-sm font-bold uppercase tracking-wider text-teal">Scenario</p>
              <p className="mt-1 text-3xl font-bold">{s.title}</p>
              <p className="mt-3 text-xl">{s.context}</p>
              <ol className="mt-5 grid gap-2 text-lg sm:grid-cols-2">
                <Step n={1} text={`${s.character.name} speaks`} />
                <Step n={2} text="You respond in your own words" />
                <Step n={3} text={`${s.character.name} reacts to what you said`} />
                <Step n={4} text="You get friendly coaching and a score" />
              </ol>
              <p className="mt-4 text-base text-ink-soft">There is no single right answer. Try what feels natural — you can always try again.</p>
              {!busy && !err && <Button big className="mt-6" disabled={!aiReady} onClick={() => run({ kind: 'start' })}>Start the conversation <ArrowRight aria-hidden /></Button>}
              {busy?.kind === 'start' && <Thinking who={s.character.name} />}
              {err?.retry.kind === 'start' && <div className="mt-4"><ErrorView error={err.error} onRetry={retry} /></div>}
            </div>
          )}

          {session && (
            <div className="rounded-[36px] bg-white/85 p-4 shadow-lg sm:p-6">
              {session.evaluation ? (
                <Coaching s={s} session={session} onReplay={(line) => hasVoice && speak(line, lang).catch(() => {})} />
              ) : (
                <>
                  <ol className="space-y-5" aria-live="polite" aria-label="Conversation">
                    <AnimatePresence initial={false}>
                      {session.turns.map((turn, i) => (
                        <motion.li key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                          <Bubble s={s} turn={turn} showFeelings={mode !== 'practice'} onReplay={hasVoice ? () => speak(turn.text, lang).catch(() => {}) : undefined} />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                    {pendingReply && <li><Thinking who={s.character.name} /></li>}
                  </ol>
                  <div ref={bottom} />

                  {err && err.retry.kind !== 'start' && <div className="mt-4"><ErrorView error={err.error} onRetry={retry} /></div>}

                  {session.status === 'safety' && <SafetyCard />}
                  {(ended || busy?.kind === 'evaluate') && !err && (
                    <div role="status" className="mt-6 flex items-center gap-4 rounded-[28px] bg-teal/10 p-5">
                      <Mascot size={80} mood="thinking" label="" />
                      <p className="text-xl font-bold">{session.status === 'safety' ? 'The situation needs safety first. Preparing your coaching…' : 'The conversation has reached a stable point. Preparing your coaching…'}</p>
                    </div>
                  )}

                  {session.status === 'active' && !pendingReply && (
                    <div className="mt-6 rounded-[28px] bg-cream p-4 sm:p-5">
                      <p className="text-xl font-bold">What would you say to {s.character.name}?</p>

                      {(mode === 'guided' || (mode === 'natural' && showIdeas)) && session.suggestions.length > 0 && (
                        <div className="mt-3 grid gap-2">
                          <p className="text-base text-ink-soft">Some possible replies — none is the only right one:</p>
                          {session.suggestions.map((x) => (
                            <button key={x} onClick={() => send(x)} className="min-h-16 rounded-2xl bg-white px-5 py-3 text-left text-xl shadow-sm ring-2 ring-transparent hover:ring-teal/50">“{x}”</button>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {mic.supported && (
                          <button type="button" onClick={mic.listening ? mic.stop : () => { stopSpeaking(); mic.start() }} aria-pressed={mic.listening}
                            className={`flex min-h-16 items-center gap-2 rounded-full px-6 text-xl font-bold text-white shadow ${mic.listening ? 'animate-pulse bg-coral' : 'bg-teal'}`}>
                            {mic.listening ? <><Square aria-hidden /> Stop</> : <><Mic aria-hidden /> 🎙️ Speak</>}
                          </button>
                        )}
                        {lastCharacter && hasVoice && (
                          <Button variant="secondary" onClick={() => speak(lastCharacter.text, lang).catch(() => {})}><Volume2 aria-hidden /> 🔊 Replay</Button>
                        )}
                        {mic.supported && !typing && (
                          <Button variant="secondary" onClick={() => setTyping(true)}><Keyboard aria-hidden /> ⌨️ Type instead</Button>
                        )}
                        {mode === 'natural' && !showIdeas && session.suggestions.length > 0 && (
                          <Button variant="ghost" onClick={() => setShowIdeas(true)}><Lightbulb aria-hidden /> Need an idea?</Button>
                        )}
                      </div>
                      {mic.listening && <p className="mt-3 rounded-2xl bg-white p-3 text-xl" aria-live="polite">{mic.interim || 'Listening…'}</p>}
                      {mic.error && <p role="alert" className="mt-2 text-lg font-bold text-coral">{t(`voice.err.${mic.error}` as TKey)}</p>}

                      {(typing || !mic.supported) && (
                        <form onSubmit={(e) => { e.preventDefault(); send(text) }} className="mt-3 flex items-center gap-3">
                          <label htmlFor="wwyd-input" className="sr-only">Your reply</label>
                          <input id="wwyd-input" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={600}
                            placeholder={`Type what you would say to ${s.character.name}…`} className="min-h-16 flex-1 rounded-full bg-white px-6 text-xl shadow-inner ring-2 ring-ink/10" />
                          <Button big disabled={!text.trim()} aria-label="Send reply"><Send aria-hidden /></Button>
                        </form>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-base text-ink-soft">
                        <span>Reply {session.carerTurns + 1} · usually {session.minTurns}–{session.maxTurns} replies</span>
                        {session.carerTurns >= 2 && (
                          <button onClick={() => run({ kind: 'evaluate' })} className="flex min-h-12 items-center gap-1 rounded-full px-4 font-bold text-ink hover:bg-ink/5"><Flag size={18} aria-hidden /> Finish &amp; get coaching</button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {session.evaluation && (
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button big onClick={restart}><RotateCcw aria-hidden /> Try again</Button>
                  <Button big variant="secondary" onClick={() => navigate(`/practice/play/${next.id}`)}>Next situation <ArrowRight aria-hidden /></Button>
                  <Button big variant="ghost" onClick={() => navigate('/practice')}>Choose another topic</Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

/* ---------------- pieces ---------------- */

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

function nextScenario(s: Scenario) {
  const i = SCENARIOS.findIndex((x) => x.id === s.id)
  return SCENARIOS[(i + 1) % SCENARIOS.length]
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-cream p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal text-lg font-bold text-white">{n}</span>{text}
    </li>
  )
}

function Thinking({ who }: { who: string }) {
  return (
    <p role="status" className="mt-4 flex items-center gap-3 text-xl text-ink-soft">
      <span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <motion.span key={i} className="size-3 rounded-full bg-teal" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)}</span>
      {who} is responding…
    </p>
  )
}

function FeelingMeter({ s, session, mode }: { s: Scenario; session: ScenarioSession | null; mode: ScenarioMode }) {
  const n = session?.intensity ?? s.initialIntensity
  const emotion = session?.emotion ?? s.initialEmotion
  const hidden = mode === 'practice' && session && !session.evaluation
  return (
    <section className="rounded-[28px] bg-white p-4 shadow-sm" aria-label={`How ${s.character.name} feels`}>
      <p className="text-lg font-bold">How {s.character.name} feels</p>
      {hidden ? (
        <p className="mt-1 text-base text-ink-soft">Hidden in Practice mode — notice how {s.character.pronoun} responds. You will see it at the end.</p>
      ) : (
        <>
          <p className="mt-1 text-xl"><span className="font-bold capitalize">{emotion}</span> · {feelingLabel(n)}</p>
          <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n} aria-label="Emotional intensity" className="mt-2 h-4 overflow-hidden rounded-full bg-ink/10">
            <motion.div className={`h-full rounded-full ${feelingTone(n)}`} initial={false} animate={{ width: `${n}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
          </div>
          <p className="mt-1 flex justify-between text-sm text-ink-soft"><span>Calm</span><span>{n}/100</span><span>Very upset</span></p>
        </>
      )}
    </section>
  )
}

function Bubble({ s, turn, showFeelings, onReplay }: { s: Scenario; turn: ScenarioTurn; showFeelings: boolean; onReplay?: () => void }) {
  if (turn.role === 'carer') {
    return (
      <div className="flex flex-col items-end">
        <p className="mb-1 text-sm font-bold uppercase tracking-wider text-lavender">You responded</p>
        <p className="max-w-[88%] rounded-[28px] rounded-br-md bg-lavender px-6 py-4 text-2xl leading-snug text-white">{turn.text}</p>
      </div>
    )
  }
  const d = turn.intensity !== undefined ? turn.intensity : null
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-sky text-3xl">{s.character.portrait}</span>
      <div className="min-w-0 max-w-[88%]">
        <p className="mb-1 text-sm font-bold uppercase tracking-wider text-teal">{s.character.name} ({s.relationship}) says</p>
        <div className="rounded-[28px] rounded-tl-md bg-cream px-6 py-4 shadow-sm">
          <p className="text-2xl leading-snug">“{turn.text}”</p>
          {turn.narration && <p className="mt-2 text-lg italic text-ink-soft">{turn.narration}</p>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {onReplay && <button onClick={onReplay} className="flex min-h-10 items-center gap-1 rounded-full px-3 text-base font-bold text-ink-soft hover:bg-ink/5" aria-label="Replay"><Volume2 size={18} aria-hidden /> Replay</button>}
          {showFeelings && d !== null && turn.emotion && <span className="rounded-full bg-white px-3 py-1 text-sm font-bold ring-1 ring-ink/10">Feeling: {turn.emotion} · {feelingLabel(d)}</span>}
        </div>
      </div>
    </div>
  )
}

function DeltaChip({ delta }: { delta?: number }) {
  if (delta === undefined) return null
  const [label, cls] = delta < 0 ? ['Helped them feel calmer', 'bg-teal/15 text-teal'] : delta > 0 ? ['May have raised distress', 'bg-coral/15 text-[#a2442a]'] : ['Little change', 'bg-ink/5 text-ink-soft']
  return <span className={`rounded-full px-3 py-1 text-sm font-bold ${cls}`}>{label}</span>
}

function SafetyCard() {
  return (
    <div role="alert" className="mt-6 rounded-[28px] bg-[#b3261e] p-5 text-white">
      <p className="flex items-center gap-2 text-2xl font-bold"><ShieldAlert aria-hidden /> Safety comes first</p>
      <p className="mt-1 text-lg">In real life, words alone may not be enough when someone is in danger.</p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-lg">
        <li>Stay calm and give the person space.</li>
        <li>Move away from the danger, or guide them away gently if it is safe to do so.</li>
        <li>Call another person to help.</li>
        <li>If someone is hurt or in immediate danger, call emergency services.</li>
      </ul>
      <a href="tel:112" className="mt-3 inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-6 text-xl font-bold text-[#b3261e]"><Phone aria-hidden /> Call 112</a>
    </div>
  )
}

const LEVEL_STYLE: Record<Level, string> = { needs_practice: 'bg-coral/15 text-[#a2442a]', developing: 'bg-amber/25 text-amber-deep', good: 'bg-leaf/20 text-[#2f7a35]', strong: 'bg-teal/15 text-teal' }

function Coaching({ s, session, onReplay }: { s: Scenario; session: ScenarioSession; onReplay: (line: string) => void }) {
  const e = session.evaluation!
  const [showTranscript, setShowTranscript] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-5">
      {session.endReason === 'safety' && <SafetyCard />}
      <div className="flex flex-col items-center gap-5 rounded-[32px] bg-teal/10 p-6 text-center sm:flex-row sm:text-left">
        <div className="grid size-36 shrink-0 place-items-center rounded-full bg-white shadow-inner">
          <div><p className="text-5xl font-bold text-teal">{e.score}</p><p className="text-lg text-ink-soft">/100</p></div>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-teal">Communication score</p>
          <p className="text-3xl font-bold sm:text-4xl">{e.score}/100 — {e.band}</p>
          {e.summary && <p className="mt-2 text-xl">{e.summary}</p>}
          <p className="mt-2 text-lg text-ink-soft">{s.character.name} went from <b>{feelingLabel(e.startIntensity).toLowerCase()} ({e.startIntensity})</b> to <b>{feelingLabel(e.endIntensity).toLowerCase()} ({e.endIntensity})</b>.</p>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Score by skill">
        {Object.entries(DIMENSION_LABELS).map(([k, label]) => e.dimensions[k] && (
          <li key={k} className="flex items-center justify-between rounded-2xl bg-white p-3 text-lg shadow-sm">
            <span className="font-bold">{label}</span>
            <span className={`rounded-full px-3 py-1 text-base font-bold ${LEVEL_STYLE[e.dimensions[k]]}`}>{LEVEL_LABELS[e.dimensions[k]]}</span>
          </li>
        ))}
      </ul>

      <Card title="What you did well" tone="bg-leaf/15">{e.strengths.map((x) => <li key={x}>{x}</li>)}</Card>
      {e.improvements.length > 0 && <Card title="What could be improved" tone="bg-amber/15">{e.improvements.map((x) => <li key={x}>{x}</li>)}</Card>}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <h3 className="text-2xl font-bold">Why</h3>
        <p className="mt-2 text-xl">{e.explanation}</p>
      </section>
      {e.key_moment?.quote && (
        <section className="rounded-[28px] bg-white p-5 shadow-sm">
          <h3 className="text-2xl font-bold">A key moment</h3>
          <p className="mt-2 text-xl">You said: “{e.key_moment.quote}”</p>
          <p className="mt-1 text-xl text-ink-soft">{e.key_moment.likely_effect}</p>
        </section>
      )}
      <section className="rounded-[28px] bg-lavender/10 p-5 ring-2 ring-lavender/30">
        <h3 className="text-2xl font-bold">A possible response</h3>
        <p className="mt-2 text-2xl">“{e.suggested_response}”</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={() => onReplay(e.suggested_response)} className="flex min-h-12 items-center gap-1 rounded-full bg-white px-4 text-lg font-bold shadow-sm"><Volume2 size={20} aria-hidden /> Hear it</button>
          <p className="text-base text-ink-soft">One example — there are many good ways to respond.</p>
        </div>
      </section>

      <button onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript} className="min-h-12 rounded-full px-4 text-lg font-bold text-ink-soft hover:bg-ink/5">
        {showTranscript ? 'Hide' : 'Show'} the conversation, step by step
      </button>
      {showTranscript && (
        <ol className="space-y-4">
          {session.turns.map((turn, i) => (
            <li key={i}>
              <Bubble s={s} turn={turn} showFeelings onReplay={turn.role === 'character' ? () => onReplay(turn.text) : undefined} />
              {turn.role === 'carer' && <div className="mt-1 flex justify-end"><DeltaChip delta={turn.delta} /></div>}
            </li>
          ))}
        </ol>
      )}
      <p className="text-sm text-ink-soft">This score describes one practice conversation — not you. Real people vary, and what works can change from day to day.</p>
    </motion.div>
  )
}

function Card({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-[28px] p-5 ${tone}`}>
      <h3 className="text-2xl font-bold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-xl">{children}</ul>
    </section>
  )
}
