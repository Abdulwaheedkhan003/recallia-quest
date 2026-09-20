import { Router } from 'express'
import { z } from 'zod'
import { AI_REQUIREMENTS, completeJson, languageName, type ChatMsg, type JsonSchema } from './ai.ts'
import { me, type User } from './auth.ts'
import { BOOKING_REQUIREMENTS, bookSlot, searchSlots } from './booking.ts'
import { aiConfigured, bookingConfigured, config } from './config.ts'
import { q } from './db.ts'
import { createReminder, zReminderInput, type Reminder } from './reminders.ts'
import { logActivity } from './routine.ts'
import { addDays, localDate, localNow, zonedToUtc } from './time.ts'
import { HttpError, idParam, log, parse, rateLimit, wrap } from './util.ts'

const aiLimiter = rateLimit({ name: 'ai', windowMs: 60_000, max: 20, key: (r) => String(r.user?.id) })
const zLang = z.string().max(10).default('en')
const langName = languageName
const S = (type: string | string[], extra: Record<string, unknown> = {}) => ({ type, ...extra })
const obj = (properties: Record<string, unknown>): JsonSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

const COMPANION_SCHEMA = obj({
  reply: S('string'),
  urgent: S('boolean'),
  reminder: {
    anyOf: [
      { type: 'null' },
      obj({ text: S('string'), date: S(['string', 'null'], { description: 'YYYY-MM-DD or null' }), time: S('string', { description: 'HH:MM 24h' }), recurrence: S('string', { enum: ['none', 'daily', 'weekdays', 'weekly'] }), days: S('string', { description: 'weekly days 0-6, Sunday=0, else empty' }) }),
    ],
  },
})
const STORY_SCHEMA = obj({
  title: S('string'),
  scenes: { type: 'array', items: obj({ text: S('string'), setting: S('string'), memoryId: S(['integer', 'null']) }) },
})
const AGENT_SCHEMA = obj({
  reply: S('string'),
  urgent: S('boolean'),
  readyToSearch: S('boolean'),
  collected: obj({ reason: S(['string', 'null']), specialty: S(['string', 'null']), preferredDate: S(['string', 'null'], { description: 'YYYY-MM-DD or null' }) }),
})

function userContext(u: User) {
  const now = localNow(u.timezone)
  const reminders = q.all<{ text: string; next_fire_at: number }>('SELECT text, next_fire_at FROM reminders WHERE user_id = ? AND active = 1 ORDER BY next_fire_at LIMIT 5', u.id)
  const memories = q.all<{ id: number; title: string; description: string; place: string; people: string; happened_on: string | null; kind: string }>(
    'SELECT id, title, description, place, people, happened_on, kind FROM memories WHERE patient_id = ? ORDER BY id DESC LIMIT 8', u.id)
  const doneToday = q.get<{ n: number }>('SELECT COUNT(*) n FROM task_completions WHERE user_id = ? AND local_date = ?', u.id, now.date)!.n
  return { now, reminders, memories, doneToday }
}

const SAFETY = `Safety rules: You are not a doctor. Never diagnose or suggest treatments or medicine doses. For health questions, give simple general information and suggest speaking to their doctor or family. If the user mentions an emergency (chest pain, trouble breathing, a fall with injury, stroke signs, thoughts of self-harm, being lost or in danger), set "urgent": true and tell them kindly to call emergency services (112 in India) or a family member right now.`

/* ======================= Companion ======================= */
export const companionRouter = Router()

companionRouter.get('/', (req, res) => {
  const u = me(req)
  const messages = q.all(
    `SELECT c.id, c.role, c.content, c.created_at, c.reminder_id, r.text AS reminder_text, r.next_fire_at AS reminder_at, r.active AS reminder_active, r.last_fired_at AS reminder_fired
     FROM companion_messages c LEFT JOIN reminders r ON r.id = c.reminder_id WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 60`, u.id).reverse()
  res.json({ messages, aiReady: aiConfigured(), required: aiConfigured() ? [] : AI_REQUIREMENTS })
})

interface CompanionReply {
  reply: string
  urgent?: boolean
  reminder?: { text: string; date?: string | null; time: string; recurrence?: string; days?: string } | null
}

companionRouter.post('/message', aiLimiter, wrap(async (req, res) => {
  const u = me(req)
  const b = parse(z.object({ text: z.string().trim().max(2000).default(''), start: z.boolean().default(false), lang: zLang }), req.body)
  if (!b.start && !b.text) throw new HttpError(400, 'VALIDATION', 'Say or type something first.')
  const ctx = userContext(u)

  const system = `You are Lumi, a warm, patient companion inside "Recallia Quest", an app for a person living with memory changes. The user's name is ${u.display_name}.
Speak ${langName(b.lang)} (reply in the language the user uses if different). Use short, simple sentences (max 3), one idea at a time, never rush, never correct harshly. Ask one gentle question to keep the conversation going (for example how they feel, what they would like to do today, a happy memory).
Current local date/time for the user: ${ctx.now.date} ${ctx.now.time} (weekday ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ctx.now.weekday]}, timezone ${u.timezone}).
Routine tasks completed today: ${ctx.doneToday}. Upcoming reminders: ${ctx.reminders.map((r) => r.text).join('; ') || 'none'}.
Family memories you may mention gently: ${ctx.memories.map((m) => `${m.title}${m.place ? ' at ' + m.place : ''}${m.people ? ' with ' + m.people : ''}`).join('; ') || 'none yet'}.
${SAFETY}
If the user clearly asks to be reminded of something or states a task with a time ("remind me to call my daughter tomorrow at 5", "I need to take my tablet at 9 every day"), fill "reminder" with: text (short, in the user's language), date (YYYY-MM-DD in the user's local calendar, null for recurring), time (HH:MM 24h local), recurrence ("none"|"daily"|"weekdays"|"weekly"), days (for weekly: digits 0-6, Sunday=0, e.g. "135"). If the time is unclear, do NOT create a reminder; ask for the time instead. Confirm the reminder in your reply.
Respond ONLY with JSON: {"reply": string, "urgent": boolean, "reminder": null | {"text": string, "date": string|null, "time": string, "recurrence": string, "days": string}}`

  const history = q.all<ChatMsg>('SELECT role, content FROM companion_messages WHERE user_id = ? ORDER BY id DESC LIMIT 16', u.id).reverse()
  const messages: ChatMsg[] = b.start
    ? [...history, { role: 'user', content: history.length ? '(The user opened the chat again. Greet them warmly and ask how they are feeling today.)' : '(The user opened the chat for the first time. Introduce yourself in one sentence and ask how they are feeling today.)' }]
    : [...history, { role: 'user', content: b.text }]
  // Anthropic requires alternating roles starting with user.
  while (messages.length && messages[0].role !== 'user') messages.shift()

  if (!b.start) {
    q.run('INSERT INTO companion_messages (user_id, role, content, created_at) VALUES (?,?,?,?)', u.id, 'user', b.text, Date.now())
    logActivity(u, 'companion_talk')
  }

  const parsed = await completeJson<CompanionReply>(system, merge(messages), COMPANION_SCHEMA, 700)
  if (!parsed?.reply) throw new HttpError(502, 'AI_BAD_OUTPUT', 'Lumi could not answer just now. Please try again.')
  let reminder: Reminder | null = null
  let reminderError: string | null = null
  if (parsed.reminder && !b.start) {
    const rin = zReminderInput.safeParse({ ...parsed.reminder, date: parsed.reminder.date || null, days: parsed.reminder.days ?? '', kind: 'custom' })
    if (rin.success) {
      try {
        reminder = createReminder(u.id, u.timezone, rin.data, 'companion')
      } catch (e) {
        reminderError = (e as Error).message
      }
    } else reminderError = 'invalid reminder details'
    if (reminderError) log.warn('companion reminder rejected', { reason: reminderError })
  }
  const r = q.run('INSERT INTO companion_messages (user_id, role, content, reminder_id, created_at) VALUES (?,?,?,?,?)', u.id, 'assistant', parsed.reply, reminder?.id ?? null, Date.now())
  res.json({
    message: { id: Number(r.lastInsertRowid), role: 'assistant', content: parsed.reply, created_at: Date.now(), reminder_id: reminder?.id ?? null, reminder_text: reminder?.text ?? null, reminder_at: reminder?.next_fire_at ?? null, reminder_active: reminder ? 1 : null },
    urgent: Boolean(parsed.urgent),
    reminderError,
  })
}))

/** Collapse consecutive same-role turns (required by some providers). */
function merge(msgs: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = []
  for (const m of msgs) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) last.content += '\n' + m.content
    else out.push({ ...m })
  }
  return out
}

/* ======================= Story Time ======================= */
export const storiesRouter = Router()
const SETTINGS = ['garden', 'beach', 'village', 'kitchen', 'night', 'mountains', 'market', 'river', 'home', 'festival'] as const

storiesRouter.get('/', (req, res) => {
  res.json({ stories: q.all('SELECT id, title, lang, created_at FROM stories WHERE user_id = ? ORDER BY id DESC LIMIT 30', me(req).id), aiReady: aiConfigured(), required: aiConfigured() ? [] : AI_REQUIREMENTS })
})

storiesRouter.get('/:id', wrap((req, res) => {
  const s = q.get<{ scenes: string }>('SELECT * FROM stories WHERE id = ? AND user_id = ?', idParam(req), me(req).id)
  if (!s) throw new HttpError(404, 'NOT_FOUND', 'Story not found.')
  res.json({ story: { ...s, scenes: JSON.parse(s.scenes) } })
}))

storiesRouter.post('/', aiLimiter, wrap(async (req, res) => {
  const u = me(req)
  const b = parse(z.object({ theme: z.string().trim().max(200).default(''), lang: zLang }), req.body)
  const ctx = userContext(u)
  const photos = ctx.memories.filter((m) => m.kind === 'photo')
  const system = `You write short, gentle, comforting picture stories for an older adult living with memory changes, named ${u.display_name}.
Write in ${langName(b.lang)}. 5 scenes, each 2-3 short simple sentences, warm and calm, no conflict or danger, no sad endings. Use familiar everyday joys.
${ctx.memories.length ? `You may weave in these real family memories respectfully (do not invent private facts beyond them): ${ctx.memories.map((m) => `[id ${m.id}] "${m.title}" ${m.description} ${m.place ? 'place: ' + m.place : ''} ${m.people ? 'people: ' + m.people : ''}`).join(' | ')}` : ''}
For each scene choose "setting" from: ${SETTINGS.join(', ')}. ${photos.length ? `If a scene is about one of these photo memories, set "memoryId" to its id: ${photos.map((p) => p.id).join(', ')}.` : ''}
Respond ONLY with JSON: {"title": string, "scenes": [{"text": string, "setting": string, "memoryId": number|null}]}`
  const parsed = await completeJson<{ title: string; scenes: { text: string; setting: string; memoryId?: number | null }[] }>(
    system, [{ role: 'user', content: b.theme ? `Theme: ${b.theme}` : 'Please tell me a new story.' }], STORY_SCHEMA, 2000)
  if (!parsed?.title || !Array.isArray(parsed.scenes) || !parsed.scenes.length) throw new HttpError(502, 'AI_BAD_OUTPUT', 'The story could not be written this time. Please try again.')
  const photoIds = new Set(photos.map((p) => p.id))
  const scenes = parsed.scenes.slice(0, 8).map((s) => ({
    text: String(s.text).slice(0, 800),
    setting: (SETTINGS as readonly string[]).includes(s.setting) ? s.setting : 'home',
    memoryId: s.memoryId && photoIds.has(Number(s.memoryId)) ? Number(s.memoryId) : null,
  }))
  const r = q.run('INSERT INTO stories (user_id, title, lang, scenes, created_at) VALUES (?,?,?,?,?)', u.id, String(parsed.title).slice(0, 120), b.lang, JSON.stringify(scenes), Date.now())
  res.status(201).json({ story: { id: Number(r.lastInsertRowid), title: parsed.title, lang: b.lang, scenes } })
}))

/* ======================= Appointment Agent ======================= */
export const agentRouter = Router()

interface AgentState {
  reason?: string
  specialty?: string
  preferredDate?: string
  readyToSearch?: boolean
  urgent?: boolean
}
const getState = (uid: number): AgentState => JSON.parse(q.get<{ state: string }>('SELECT state FROM agent_state WHERE user_id = ?', uid)?.state ?? '{}')
const setState = (uid: number, s: AgentState) =>
  q.run('INSERT INTO agent_state (user_id, state, updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at', uid, JSON.stringify(s), Date.now())

agentRouter.get('/', (req, res) => {
  const u = me(req)
  res.json({
    messages: q.all('SELECT id, role, content, created_at FROM agent_messages WHERE user_id = ? ORDER BY id', u.id),
    state: getState(u.id),
    aiReady: aiConfigured(),
    bookingReady: bookingConfigured(),
    hasPatientId: Boolean(u.fhir_patient_id),
    required: { ai: aiConfigured() ? [] : AI_REQUIREMENTS, booking: bookingConfigured() ? [] : BOOKING_REQUIREMENTS },
    appointments: q.all('SELECT * FROM appointments WHERE user_id = ? ORDER BY start_at DESC LIMIT 10', u.id),
  })
})

agentRouter.post('/reset', (req, res) => {
  q.run('DELETE FROM agent_messages WHERE user_id = ?', me(req).id)
  q.run('DELETE FROM agent_state WHERE user_id = ?', me(req).id)
  res.json({ ok: true })
})

agentRouter.post('/message', aiLimiter, wrap(async (req, res) => {
  const u = me(req)
  const b = parse(z.object({ text: z.string().trim().min(1).max(1000), lang: zLang }), req.body)
  const state = getState(u.id)
  const now = localNow(u.timezone)
  q.run('INSERT INTO agent_messages (user_id, role, content, created_at) VALUES (?,?,?,?)', u.id, 'user', b.text, Date.now())
  const history = q.all<ChatMsg>('SELECT role, content FROM agent_messages WHERE user_id = ? ORDER BY id DESC LIMIT 14', u.id).reverse()
  while (history.length && history[0].role !== 'user') history.shift()

  const system = `You are Lumi's appointment helper in "Recallia Quest", helping ${u.display_name}, an older adult with memory changes, find a doctor's appointment. Speak ${langName(b.lang)} in short simple sentences, one question at a time.
Today is ${now.date} (${u.timezone}).
Your job: understand what they need, gently ask the basic questions (the main reason or symptom in their own words, how long it has been going on, preferred day), then choose a suitable kind of clinic (e.g. General Physician, Dentist, Eye clinic, Cardiology, Orthopaedics, ENT, Dermatology, Neurology). Do not diagnose; say a doctor will check.
When you know the reason, the specialty and a preferred date, set readyToSearch true and tell them you will look for available times.
You cannot book by yourself — the app will show real available times from the hospital system and the user must confirm.
${SAFETY}
Known so far: ${JSON.stringify(state)}
Respond ONLY with JSON: {"reply": string, "urgent": boolean, "collected": {"reason": string|null, "specialty": string|null, "preferredDate": "YYYY-MM-DD"|null}, "readyToSearch": boolean}`

  const p = await completeJson<{ reply: string; urgent?: boolean; readyToSearch?: boolean; collected?: { reason?: string | null; specialty?: string | null; preferredDate?: string | null } }>(system, merge(history), AGENT_SCHEMA, 700)
  if (!p?.reply) throw new HttpError(502, 'AI_BAD_OUTPUT', 'The helper could not answer just now. Please try again.')
  const reply = p.reply
  const c = p?.collected ?? {}
  const next: AgentState = {
    reason: c.reason ?? state.reason,
    specialty: c.specialty ?? state.specialty,
    preferredDate: c.preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(c.preferredDate) ? c.preferredDate : state.preferredDate,
    urgent: Boolean(p?.urgent),
  }
  next.readyToSearch = Boolean(p?.readyToSearch && next.reason && next.specialty)
  setState(u.id, next)
  q.run('INSERT INTO agent_messages (user_id, role, content, created_at) VALUES (?,?,?,?)', u.id, 'assistant', reply, Date.now())
  res.json({ reply, state: next })
}))

agentRouter.get('/slots', wrap(async (req, res) => {
  const u = me(req)
  const s = getState(u.id)
  if (!s.readyToSearch) throw new HttpError(409, 'NOT_READY', 'Tell the helper a little more first.')
  const from = s.preferredDate && s.preferredDate >= localDate(u.timezone) ? s.preferredDate : localDate(u.timezone)
  const slots = await searchSlots({ from, specialty: s.specialty })
  res.json({ slots, from })
}))

agentRouter.post('/book', rateLimit({ name: 'book', windowMs: 60_000, max: 5, key: (r) => String(r.user?.id) }), wrap(async (req, res) => {
  const u = me(req)
  const b = parse(z.object({ slotId: z.string().min(1).max(100), confirmed: z.literal(true) }), req.body)
  if (!u.fhir_patient_id) throw new HttpError(409, 'NEEDS_PATIENT_ID', 'Add your hospital patient ID in Settings before booking.')
  const s = getState(u.id)
  const result = await bookSlot(b.slotId, u.fhir_patient_id, `${s.specialty ?? ''}: ${s.reason ?? ''}`)
  const startMs = Date.parse(result.start)
  const desc = `${s.specialty ?? 'Doctor'} — ${config.booking.providerName}`
  const r = q.run('INSERT INTO appointments (user_id, provider, external_id, status, start_at, description, created_at) VALUES (?,?,?,?,?,?,?)', u.id, 'fhir', result.externalId, result.status, startMs, desc, Date.now())

  // Real reminders: evening before at 18:00 and 1 hour before.
  const reminders: Reminder[] = []
  if (result.status === 'booked' && Number.isFinite(startMs)) {
    const apptDate = localDate(u.timezone, startMs)
    const apptTime = localNow(u.timezone, startMs).time
    const hourBefore = localNow(u.timezone, startMs - 36e5)
    const candidates = [
      { date: addDays(apptDate, -1), time: '18:00', text: `Tomorrow: ${desc} at ${apptTime}` },
      { date: hourBefore.date, time: hourBefore.time, text: `In 1 hour: ${desc}` },
    ]
    for (const c of candidates) {
      if (zonedToUtc(c.date, c.time, u.timezone) <= Date.now()) continue
      reminders.push(createReminder(u.id, u.timezone, { text: c.text, date: c.date, time: c.time, recurrence: 'none', days: '', kind: 'appointment' }, 'agent'))
    }
    q.run('DELETE FROM agent_state WHERE user_id = ?', u.id)
  }
  res.status(201).json({ appointment: q.get('SELECT * FROM appointments WHERE id = ?', Number(r.lastInsertRowid)), confirmed: result.status === 'booked', reminders })
}))
