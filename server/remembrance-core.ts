/**
 * Remembrance story core — pure functions (no database), shared by the server and the
 * fine-tuning tools in /finetune so training data uses EXACTLY the prompt + validator used in production.
 */
import { z } from 'zod'
import { getLanguage } from '../shared/languages.ts'
import type { JsonSchema } from './ai.ts'
import { log } from './util.ts'

/* ---------------- evidence ---------------- */

export const PERSON_DETAIL_LABELS: Record<string, string> = {
  whyImportant: 'Why this person is important',
  usuallyTogether: 'What they usually did together',
  firstMet: 'Where they first met',
  meaningfulPlace: 'A meaningful place connected with this person',
  notes: 'Other notes',
}
export const PHOTO_META_LABELS: Record<string, string> = {
  whatHappening: 'What was happening',
  funMoment: 'Fun moment it represents',
  place: 'Where it was taken',
  when: 'When it was taken',
  description: 'Description',
}

export interface PersonRow { id: number; patient_id: number; name: string; relationship: string; avatar_item_id: number | null; details: string; is_demo: number }
export interface ItemRow { id: number; kind: 'photo' | 'audio'; media_id: string | null; demo_asset: string | null; meta: string }
export interface MemoryRow { id: number; type: string; content: string; related_item_id: number | null }

export interface Evidence {
  person: { id: number; name: string; relationship: string }
  patient: { preferredName: string; lang: string; prefersAudio: boolean; voiceStyle: string }
  facts: { code: string; text: string; itemId: number | null }[] // M<id> memories, D:<field> details, P<id> photo context
  photos: { id: number; context: string }[]
  audio: { id: number; context: string }[]
  memoryIds: number[]
  hash: string
}

export const jsonObj = (s: string | null | undefined): Record<string, string> => {
  try { const o = JSON.parse(s || '{}'); return o && typeof o === 'object' ? o : {} } catch { return {} }
}


export interface EvidenceInput {
  person: { id: number; name: string; relationship: string; avatarItemId: number | null; details: Record<string, string> }
  patient: { preferredName: string; lang: string; respondsBetter?: string; voiceStyle?: string }
  items: { id: number; kind: 'photo' | 'audio'; meta: Record<string, string> }[]
  memories: { id: number; content: string; relatedItemId: number | null }[]
}

/** Turn caretaker data into the evidence list the model sees (codes: M<id> memory, D:<field> person detail, P<id> photo context). */
export function buildEvidence(inp: EvidenceInput): Omit<Evidence, 'hash'> {
  const facts: Evidence['facts'] = []
  for (const m of inp.memories) facts.push({ code: `M${m.id}`, text: m.content, itemId: m.relatedItemId })
  for (const [k, label] of Object.entries(PERSON_DETAIL_LABELS)) if (inp.person.details[k]?.trim()) facts.push({ code: `D:${k}`, text: `${label}: ${inp.person.details[k].trim()}`, itemId: null })
  const describe = (meta: Record<string, string>) => Object.entries(PHOTO_META_LABELS).filter(([k]) => typeof meta[k] === 'string' && meta[k].trim()).map(([k, l]) => `${l}: ${meta[k].trim()}`).join('. ')
  const photos = inp.items.filter((i) => i.kind === 'photo').map((i) => ({ id: i.id, context: describe(i.meta) }))
  const audio = inp.items.filter((i) => i.kind === 'audio').map((i) => ({ id: i.id, context: describe(i.meta) }))
  for (const ph of photos) if (ph.context) facts.push({ code: `P${ph.id}`, text: ph.context, itemId: ph.id })
  // Avatar first so the recognition moment uses the caretaker's chosen portrait.
  const av = inp.person.avatarItemId
  if (av) photos.sort((a, b) => (a.id === av ? -1 : b.id === av ? 1 : 0))
  return {
    person: { id: inp.person.id, name: inp.person.name, relationship: inp.person.relationship },
    patient: { preferredName: inp.patient.preferredName, lang: inp.patient.lang, prefersAudio: /audio|voice|listen/i.test(inp.patient.respondsBetter ?? ''), voiceStyle: inp.patient.voiceStyle ?? '' },
    facts, photos, audio, memoryIds: inp.memories.map((m) => m.id),
  }
}

export const isLatinLang = (lang: string) => storyLanguage(lang) === 'English' || !/^(hi|ta|te|kn|ml|bn|mr|gu|pa|ur|ar|zh|ja|ko|ru|as|ne|mni|brx)$/.test(lang)

/**
 * Languages the story model can write well. For languages the app lists but does not support yet
 * (many Northeast languages are 'placeholder'), stories are written in simple English — far better than broken text.
 */
const STORY_LANGS = new Set(['en', 'hi', 'ta', 'as', 'ne'])
export function storyLanguage(code: string) {
  const l = getLanguage(code)
  return l.code === code && STORY_LANGS.has(code) ? l.name : 'English'
}

/** The exact user message sent to the model. */
export function storyUserMessage(ev: Omit<Evidence, 'hash'>) {
  const evidence = {
    person: ev.person,
    patient: ev.patient.preferredName,
    facts: ev.facts.map((f) => ({ code: f.code, text: f.text, photoId: f.itemId })),
    photos: ev.photos.map((p) => ({ itemId: p.id, context: p.context || '(no description given)' })),
    audio: ev.audio.map((a) => ({ itemId: a.id, context: a.context || '(no description given)' })),
  }
  return `EVIDENCE:\n${JSON.stringify(evidence, null, 1)}\n\nWrite the remembrance story as JSON.`
}

/* ---------------- story structure (the ONLY thing the patient app renders) ---------------- */

const zStep = z.discriminatedUnion('type', [
  z.object({ type: z.literal('photo'), itemId: z.number().int(), caption: z.string().max(300).default('') }),
  z.object({ type: z.literal('memory'), text: z.string().min(1).max(400), evidence: z.array(z.string()).default([]), itemId: z.number().int().nullable().default(null) }),
  z.object({ type: z.literal('audio'), itemId: z.number().int(), caption: z.string().max(300).default('') }),
  z.object({ type: z.literal('question'), text: z.string().min(1).max(250), ifYes: z.string().max(300).default(''), ifNo: z.string().max(400).default(''), evidence: z.array(z.string()).default([]), itemId: z.number().int().nullable().default(null) }),
])
export type Step = z.infer<typeof zStep>
export const zStory = z.object({
  title: z.string().min(1).max(120),
  introduction: z.string().max(300),
  recognition: z.object({ itemId: z.number().int().nullable(), question: z.string().min(1).max(200) }),
  onYes: z.string().max(200),
  onNo: z.string().max(300),
  steps: z.array(zStep).max(20),
  closing: z.string().max(300),
})
export type Story = z.infer<typeof zStory> & { person: { id: number; name: string; relationship: string } }

/* ---------------- grounding checks ---------------- */

const STOP = new Set('a an the and or but of to in on at for with you your yours he she they them his her their we our us i me my it its is are was were be been used use would will do did does this that these those there here as by from so very just all also some any together remember recall do not no yes okay ok love loved lovely always often every each one who what when where why how about into up out like happy fun time times day days'.split(' '))
const words = (s: string) => s.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}']+/gu) ?? []
const content = (s: string) => words(s).filter((w) => w.length > 2 && !STOP.has(w))

/** Reject text that introduces capitalised names or numbers that are not in the evidence (likely invented). */
function grounded(text: string, allowed: string, latinOnly: boolean) {
  const allowedWords = new Set(words(allowed))
  for (const n of text.match(/\d+/g) ?? []) if (!allowed.includes(n)) return false
  if (latinOnly) {
    // Capitalised words that are not sentence starts must come from the evidence.
    const tokens = text.split(/\s+/)
    for (let i = 1; i < tokens.length; i++) {
      const w = tokens[i].replace(/[^\p{L}']/gu, '')
      const prev = tokens[i - 1]
      if (w.length > 1 && /^\p{Lu}/u.test(w) && !/[.!?…]$/.test(prev) && !allowedWords.has(w.toLowerCase()) && !['I'].includes(w)) return false
    }
  }
  return true
}
function overlaps(text: string, evidenceText: string) {
  const a = content(text)
  if (!a.length) return true
  const e = new Set(content(evidenceText))
  return a.filter((w) => e.has(w)).length / a.length >= 0.25
}

/* ---------------- deterministic composer (no AI; caretaker's own words) ---------------- */

export function composeStory(ev: Omit<Evidence, 'hash'>): Story {
  const { name, relationship } = ev.person
  const rel = relationship ? `your ${relationship.toLowerCase()}` : ''
  const first = ev.photos[0]?.id ?? null
  const steps: Step[] = []
  const usedPhotos = new Set<number>(first ? [first] : [])
  const nextPhoto = (prefer: number | null) => {
    if (prefer && ev.photos.some((p) => p.id === prefer) && !usedPhotos.has(prefer)) { usedPhotos.add(prefer); return prefer }
    const p = ev.photos.find((x) => !usedPhotos.has(x.id))
    if (p) usedPhotos.add(p.id)
    return p?.id ?? null
  }
  for (const f of ev.facts.filter((x) => x.code.startsWith('M') || x.code.startsWith('D:'))) {
    const photo = nextPhoto(f.itemId)
    if (photo) steps.push({ type: 'photo', itemId: photo, caption: ev.photos.find((p) => p.id === photo)?.context.split('. ')[0]?.replace(/^[^:]+: /, '') ?? '' })
    const text = f.code.startsWith('D:') ? f.text.replace(/^[^:]+: /, '') : f.text
    steps.push({ type: 'memory', text, evidence: [f.code], itemId: null })
    if (steps.filter((s) => s.type === 'question').length < 3 && f.code.startsWith('M'))
      steps.push({ type: 'question', text: 'Do you remember that?', ifYes: 'That is lovely.', ifNo: `That's okay. Let's keep looking together.`, evidence: [f.code], itemId: null })
  }
  for (const p of ev.photos) if (!usedPhotos.has(p.id)) steps.push({ type: 'photo', itemId: p.id, caption: p.context.split('. ')[0]?.replace(/^[^:]+: /, '') ?? '' })
  for (const a of ev.audio) steps.push({ type: 'audio', itemId: a.id, caption: a.context.replace(/^[^:]+: /, '') || `A recording about ${name}` })
  return {
    title: `Remembering ${name}`,
    person: ev.person,
    introduction: `Hello ${ev.patient.preferredName}. Let's look at some photos together.`,
    recognition: { itemId: first, question: first ? 'Do you remember this person?' : `Do you remember ${name}?` },
    onYes: `Yes, that's ${name} ❤️`,
    onNo: `That's okay. This is ${name}${rel ? `, ${rel}` : ''}.`,
    steps: steps.slice(0, 20),
    closing: 'Thank you for looking at these photos with me.',
  }
}

/* ---------------- local model ---------------- */

const S = (type: string | string[], extra: Record<string, unknown> = {}) => ({ type, ...extra })
const obj = (properties: Record<string, unknown>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
export const STORY_SCHEMA = obj({
  title: S('string'),
  introduction: S('string'),
  recognition: obj({ itemId: S(['integer', 'null']), question: S('string') }),
  onYes: S('string'),
  onNo: S('string'),
  steps: {
    type: 'array',
    items: obj({
      type: S('string', { enum: ['photo', 'memory', 'audio', 'question'] }),
      itemId: S(['integer', 'null']),
      text: S('string'),
      caption: S('string'),
      ifYes: S('string'),
      ifNo: S('string'),
      evidence: { type: 'array', items: S('string') },
    }),
  },
  closing: S('string'),
})

export function systemPrompt(ev: Omit<Evidence, 'hash'>) {
  const lang = storyLanguage(ev.patient.lang)
  const requested = getLanguage(ev.patient.lang)
  return `You turn a caretaker's notes into a gentle, interactive remembrance story for ${ev.patient.preferredName}, an older adult living with memory changes. The story helps them look at photos of someone they love. It must feel like a warm story, never like a test.

STRICT EVIDENCE RULES (most important):
- Use ONLY the facts listed in EVIDENCE. Never invent people, relationships, events, places, dates, numbers, quotes, jokes or feelings that are not in the evidence.
- Every "memory" and "question" step must list the evidence codes it is based on in "evidence" (e.g. ["M12"]).
- Use photos and audio ONLY by the item ids given. Do not describe what is in a photo unless its context says so.
- If something is unknown, use neutral words ("this photo", "a special day") instead of guessing.
- The person's name is exactly "${ev.person.name}" and the relationship is exactly "${ev.person.relationship || 'not stated'}".

STYLE: ${lang}${lang === 'English' && requested.code !== 'en' && requested.code === ev.patient.lang ? ` (stories in ${requested.name} are not supported yet, so use simple English)` : ''}. Very short, simple, warm sentences (max 15 words), speak to ${ev.patient.preferredName} as "you". Never say "wrong", never quiz or pressure. ${ev.patient.voiceStyle ? `Preferred tone: ${ev.patient.voiceStyle}.` : ''}

STRUCTURE (JSON only):
- title; introduction (1 sentence);
- recognition: {itemId: the best portrait photo id or null, question: e.g. "Do you remember this person?"}
- onYes: a happy confirmation using the name (e.g. "Yes, that's ${ev.person.name} ❤️")
- onNo: kind reassurance that introduces the person with the relationship (e.g. "That's okay. This is ${ev.person.name}${ev.person.relationship ? `, your ${ev.person.relationship.toLowerCase()}` : ''}.")
- steps (4–12): mix of {type:"photo", itemId, caption}, {type:"memory", text, evidence, itemId (optional photo)}, {type:"question", text (gentle "Do you remember…?"), ifYes (warm), ifNo (gently restates the evidence as a fact), evidence}, {type:"audio", itemId, caption}. Put photos next to the memories they relate to. Unused fields: "" or null or [].
- closing: a warm thank-you that adds no new facts.`
}

export function validateStory(raw: unknown, ev: Omit<Evidence, 'hash'>, latin: boolean, stats?: { dropped: number; kept: number; invalidSteps: number }): Story | null {
  // Normalise the flat model output into the discriminated union.
  const r = raw as { steps?: Record<string, unknown>[] } & Record<string, unknown>
  if (!r || typeof r !== 'object') return null
  const steps = (Array.isArray(r.steps) ? r.steps : []).map((s) => {
    const t = s.type
    if (t === 'photo' || t === 'audio') return { type: t, itemId: s.itemId, caption: s.caption ?? '' }
    if (t === 'memory') return { type: t, text: s.text, evidence: s.evidence ?? [], itemId: s.itemId ?? null }
    if (t === 'question') return { type: t, text: s.text, ifYes: s.ifYes ?? '', ifNo: s.ifNo ?? '', evidence: s.evidence ?? [], itemId: s.itemId ?? null }
    return null
  }).filter(Boolean)
  const okSteps = steps.filter((s) => zStep.safeParse(s).success)
  if (stats) stats.invalidSteps = steps.length - okSteps.length
  const parsed = zStory.safeParse({ ...r, steps: okSteps })
  if (!parsed.success) return null
  const st = parsed.data

  const photoIds = new Set(ev.photos.map((p) => p.id))
  const audioIds = new Set(ev.audio.map((a) => a.id))
  const factText = new Map(ev.facts.map((f) => [f.code, f.text]))
  const all = [ev.person.name, ev.person.relationship, ev.patient.preferredName, ...ev.facts.map((f) => f.text), ...ev.photos.map((p) => p.context), ...ev.audio.map((a) => a.context)].join(' \n ')
  const ok = (text: string, codes: string[]) => {
    const cited = codes.filter((c) => factText.has(c))
    if (!cited.length) return false
    const src = cited.map((c) => factText.get(c)).join(' ') + ' ' + ev.person.name + ' ' + ev.person.relationship
    return grounded(text, all, latin) && (!latin || overlaps(text, src))
  }
  const clean: Step[] = []
  let dropped = 0
  for (const s of st.steps) {
    if (s.type === 'photo') { if (photoIds.has(s.itemId) && grounded(s.caption, all, latin)) clean.push(s); else dropped++; continue }
    if (s.type === 'audio') { if (audioIds.has(s.itemId) && grounded(s.caption, all, latin)) clean.push(s); else dropped++; continue }
    const itemId = s.itemId && photoIds.has(s.itemId) ? s.itemId : null
    if (s.type === 'memory') { if (ok(s.text, s.evidence)) clean.push({ ...s, itemId }); else dropped++; continue }
    if (s.type === 'question') {
      if (!ok(s.text + ' ' + s.ifNo, s.evidence) && !ok(s.ifNo, s.evidence)) { dropped++; continue }
      clean.push({ ...s, itemId, ifYes: grounded(s.ifYes, all, latin) ? s.ifYes : 'That is lovely.' })
    }
  }
  if (stats) { stats.dropped = dropped; stats.kept = clean.length }
  if (dropped) log.info('story steps dropped by grounding check', { dropped, kept: clean.length })
  if (clean.filter((s) => s.type !== 'photo').length < 1) return null
  // Audio the caretaker supplied should always be offered.
  for (const a of ev.audio) if (!clean.some((s) => s.type === 'audio' && s.itemId === a.id)) clean.push({ type: 'audio', itemId: a.id, caption: '' })
  const rel = ev.person.relationship ? `your ${ev.person.relationship.toLowerCase()}` : ''
  return {
    title: grounded(st.title, all, latin) ? st.title : `Remembering ${ev.person.name}`,
    person: ev.person,
    introduction: grounded(st.introduction, all, latin) ? st.introduction : `Let's look at some photos together.`,
    recognition: { itemId: st.recognition.itemId && photoIds.has(st.recognition.itemId) ? st.recognition.itemId : ev.photos[0]?.id ?? null, question: st.recognition.question },
    onYes: grounded(st.onYes, all, latin) ? st.onYes : `Yes, that's ${ev.person.name} ❤️`,
    onNo: grounded(st.onNo, all, latin) ? st.onNo : `That's okay. This is ${ev.person.name}${rel ? `, ${rel}` : ''}.`,
    steps: clean.slice(0, 20),
    closing: grounded(st.closing, all, latin) ? st.closing : 'Thank you for looking at these photos with me.',
  }
}

