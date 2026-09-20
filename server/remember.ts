/**
 * Patient side of the remembrance system. The patient only ever acts on THEMSELVES (req.user.id);
 * phone numbers, caretaker notes and raw questionnaire answers are never sent here.
 */
import { Router, type Request } from 'express'
import { z } from 'zod'
import { me } from './auth.ts'
import { q } from './db.ts'
import { careChanged, recordEvent, setCurrentArea } from './monitor.ts'
import { areaLabel } from './report.ts'
import { composeStory, gatherEvidence, getOrBuildStory, latestStory, saveComposed, storyStatus, type Story } from './remembrance.ts'
import { localAiStatus } from './local-ai.ts'
import { enqueue } from './story-worker.ts'
import { HttpError, idParam, parse, rateLimit, wrap } from './util.ts'

export const rememberRouter = Router()

const patient = (req: Request) => {
  const u = me(req)
  if (u.role !== 'patient') throw new HttpError(403, 'FORBIDDEN', 'This part of Recallia is for the person using it.')
  return u
}

rememberRouter.get('/people', (req, res) => {
  const u = patient(req)
  const rows = q.all<{ id: number; name: string; relationship: string; avatar_item_id: number | null; is_demo: number }>(
    'SELECT id, name, relationship, avatar_item_id, is_demo FROM people WHERE patient_id = ? ORDER BY is_demo, id', u.id)
  const pp = q.get<{ photo_media_id: string | null; data: string }>('SELECT photo_media_id, data FROM patient_profiles WHERE patient_id = ?', u.id)
  let preferred = ''
  try { preferred = JSON.parse(pp?.data ?? '{}').basic?.preferredName ?? '' } catch { /* empty */ }
  res.json({
    me: { name: preferred || u.display_name, photo: pp?.photo_media_id ? `/api/media/${pp.photo_media_id}` : null },
    people: rows.map((p) => {
      const av = p.avatar_item_id ? q.get<{ media_id: string | null; demo_asset: string | null }>('SELECT media_id, demo_asset FROM person_items WHERE id = ?', p.avatar_item_id) : null
      const photos = q.get<{ n: number }>("SELECT COUNT(*) n FROM person_items WHERE person_id = ? AND kind = 'photo'", p.id)!.n
      const memories = q.get<{ n: number }>('SELECT COUNT(*) n FROM person_memories WHERE person_id = ?', p.id)!.n
      return {
        id: p.id, name: p.name, relationship: p.relationship, isSample: Boolean(p.is_demo),
        avatar: av ? (av.media_id ? `/api/media/${av.media_id}` : `/demo/${av.demo_asset}`) : null,
        ready: photos + memories > 0, story: storyStatus(p.id),
      }
    }),
    syncedAt: Date.now(),
  })
})

/** Resolve the item ids a story refers to into URLs the patient's browser may load. */
function assets(patientId: number, story: Story) {
  const ids = new Set<number>()
  if (story.recognition.itemId) ids.add(story.recognition.itemId)
  for (const s of story.steps) if ('itemId' in s && s.itemId) ids.add(s.itemId)
  const out: Record<number, { url: string; kind: string }> = {}
  for (const id of ids) {
    const it = q.get<{ kind: string; media_id: string | null; demo_asset: string | null }>('SELECT kind, media_id, demo_asset FROM person_items WHERE id = ? AND patient_id = ?', id, patientId)
    if (it) out[id] = { kind: it.kind, url: it.media_id ? `/api/media/${it.media_id}` : `/demo/${it.demo_asset}` }
  }
  // Extra photos for the gentle "let me show you" moment when the answer is "no".
  return out
}

/**
 * Real-time: the patient never waits for the AI.
 *  - A story already exists → it is shown at once; if it is out of date the private AI rewrites it in the background.
 *  - First time ever → the private AI gets a short head start; if it is still writing, a story made only from the
 *    caretaker's own words is shown now and the AI version replaces it for next time.
 */
async function storyForPatient(personId: number) {
  const latest = latestStory(personId)
  if (latest) {
    if (!storyStatus(personId).upToDate || localAiStatus().state === 'ready') enqueue(personId) // no-op when nothing to do
    return latest
  }
  if (localAiStatus().state !== 'ready') return getOrBuildStory(personId)
  const ai = getOrBuildStory(personId)
  const quick = await Promise.race([ai, new Promise<null>((r) => setTimeout(() => r(null), 12_000))])
  if (quick) return quick
  ai.then(() => { const pid = q.get<{ patient_id: number }>('SELECT patient_id FROM people WHERE id = ?', personId)?.patient_id; if (pid) careChanged(pid, 'story') }).catch(() => {})
  const ev = gatherEvidence(personId)!
  return { id: saveComposed(personId, ev), story: composeStory(ev), generator: 'composer', created_at: Date.now(), fresh: true }
}

rememberRouter.post('/people/:id/story', rateLimit({ name: 'remember-story', windowMs: 60_000, max: 10, key: (r) => String(r.user?.id) }), wrap(async (req, res) => {
  const u = patient(req)
  const person = q.get<{ id: number }>('SELECT id FROM people WHERE id = ? AND patient_id = ?', idParam(req), u.id)
  if (!person) throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  const s = await storyForPatient(person.id)
  const extra = q.all<{ id: number; media_id: string | null; demo_asset: string | null }>("SELECT id, media_id, demo_asset FROM person_items WHERE person_id = ? AND kind = 'photo' ORDER BY id", person.id)
    .map((i) => ({ id: i.id, url: i.media_id ? `/api/media/${i.media_id}` : `/demo/${i.demo_asset}` }))
  res.json({ storyId: s.id, story: s.story, assets: assets(u.id, s.story), photos: extra })
}))

rememberRouter.post('/sessions', wrap((req, res) => {
  const u = patient(req)
  const b = parse(z.object({ personId: z.number().int(), storyId: z.number().int() }), req.body)
  const person = q.get<{ id: number; name: string }>('SELECT id, name FROM people WHERE id = ? AND patient_id = ?', b.personId, u.id)
  const story = q.get<{ id: number }>('SELECT id FROM remembrance_stories WHERE id = ? AND patient_id = ?', b.storyId, u.id)
  if (!person || !story) throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  const r = q.run('INSERT INTO remembrance_sessions (patient_id, story_id, person_id, person_name, started_at) VALUES (?,?,?,?,?)', u.id, story.id, person.id, person.name, Date.now())
  const id = Number(r.lastInsertRowid)
  setCurrentArea(u.id, 'remember')
  recordEvent(u.id, 'remembrance_started', { sessionId: id, person: person.name })
  res.status(201).json({ sessionId: id })
}))

const ownSession = (req: Request, uid: number) => {
  const s = q.get<{ id: number; person_name: string; recognition: string | null; started_at: number; completed_at: number | null }>(
    'SELECT id, person_name, recognition, started_at, completed_at FROM remembrance_sessions WHERE id = ? AND patient_id = ?', idParam(req), uid)
  if (!s) throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  return s
}

rememberRouter.post('/sessions/:id/interactions', rateLimit({ name: 'remember-int', windowMs: 60_000, max: 120, key: (r) => String(r.user?.id) }), wrap((req, res) => {
  const u = patient(req)
  const s = ownSession(req, u.id)
  if (s.completed_at) throw new HttpError(409, 'SESSION_DONE', 'This session has finished.')
  const b = parse(z.object({
    stepIndex: z.number().int().min(-1).max(100),
    stepType: z.enum(['recognition', 'question', 'audio', 'memory', 'photo']),
    prompt: z.string().max(300).default(''),
    response: z.enum(['yes', 'no', 'not_sure', 'text', 'listened', 'skip']),
    text: z.string().trim().max(1000).optional(),
    via: z.enum(['button', 'voice', 'text']).default('button'),
  }), req.body)
  q.run('INSERT INTO remembrance_interactions (session_id, step_index, step_type, prompt, response, text, via, created_at) VALUES (?,?,?,?,?,?,?,?)',
    s.id, b.stepIndex, b.stepType, b.prompt, b.response, b.text ?? null, b.via, Date.now())
  if (b.stepType === 'recognition' && !s.recognition && ['yes', 'no', 'not_sure'].includes(b.response))
    q.run('UPDATE remembrance_sessions SET recognition = ? WHERE id = ?', b.response, s.id)
  recordEvent(u.id, 'remembrance_response', { sessionId: s.id, person: s.person_name, stepType: b.stepType, prompt: b.prompt, response: b.response, text: b.text ?? null, via: b.via })
  res.status(201).json({ ok: true })
}))

rememberRouter.post('/sessions/:id/complete', wrap((req, res) => {
  const u = patient(req)
  const s = ownSession(req, u.id)
  if (s.completed_at) return void res.json({ ok: true })
  const c = q.all<{ response: string; n: number }>('SELECT response, COUNT(*) n FROM remembrance_interactions WHERE session_id = ? GROUP BY response', s.id)
  const count = (r: string) => c.find((x) => x.response === r)?.n ?? 0
  const now = Date.now()
  const summary = { person: s.person_name, recognition: s.recognition, yes: count('yes'), no: count('no'), notSure: count('not_sure'), typedOrSpoken: count('text'), audioPlayed: count('listened'), durationMs: now - s.started_at }
  q.run('UPDATE remembrance_sessions SET completed_at = ?, summary = ? WHERE id = ?', now, JSON.stringify(summary), s.id)
  recordEvent(u.id, 'remembrance_completed', { sessionId: s.id, ...summary })
  res.json({ ok: true, summary })
}))

/** Where the patient is in the app right now (drives "currently using…" on the caretaker side). */
rememberRouter.post('/presence', rateLimit({ name: 'presence', windowMs: 60_000, max: 60, key: (r) => String(r.user?.id) }), wrap((req, res) => {
  const u = me(req)
  if (u.role !== 'patient') return void res.json({ ok: true })
  const { area } = parse(z.object({ area: z.string().regex(/^[a-z-]{1,24}$/) }), req.body)
  if (setCurrentArea(u.id, area)) recordEvent(u.id, 'area', { area, label: areaLabel(area) })
  res.json({ ok: true })
}))

