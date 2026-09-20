/**
 * Caretaker space: patients, profile, gallery (people + photos + audio + memories), stories, monitoring, report.
 * Every route checks an explicit caretaker → patient link (circle_links), so caretaker A can never read
 * or change patient B. Phone numbers are encrypted at rest and only ever returned here.
 */
import { randomInt } from 'node:crypto'
import { unlink } from 'node:fs'
import { join } from 'node:path'
import { Router, type Request } from 'express'
import { z } from 'zod'
import { LANGUAGES } from '../shared/languages.ts'
import { createManagedPatient, hashPairCode, me, type User } from './auth.ts'
import { config } from './config.ts'
import { q, tx } from './db.ts'
import { discardUpload, saveMedia, upload } from './media.ts'
import { ensureLocalAi, localAiStatus } from './local-ai.ts'
import { careChanged, currentActivity, recordEvent } from './monitor.ts'
import { isOnline } from './realtime.ts'
import { buildReport, monitoringData } from './report.ts'
import { getOrBuildStory, storyStatus } from './remembrance.ts'
import { progress as storyProgress } from './story-worker.ts'
import { decrypt, encrypt, maskPhone } from './secure.ts'
import { HttpError, idParam, log, parse, rateLimit, wrap } from './util.ts'

export const careRouter = Router()

/* ---------------- access control ---------------- */

/** The caller must be a linked caretaker of this patient (not the patient themself). */
export function assertCaretaker(req: Request, patientId: number) {
  const u = me(req)
  if (!Number.isInteger(patientId) || u.id === patientId || !q.get('SELECT 1 FROM circle_links WHERE patient_id = ? AND member_id = ?', patientId, u.id))
    throw new HttpError(404, 'NOT_FOUND', 'Patient not found.')
  return patientId
}
const personFor = (req: Request, personId: number) => {
  const p = q.get<{ id: number; patient_id: number }>('SELECT id, patient_id FROM people WHERE id = ?', personId)
  if (!p) throw new HttpError(404, 'NOT_FOUND', 'Person not found.')
  assertCaretaker(req, p.patient_id)
  return p
}
const itemFor = (req: Request, itemId: number) => {
  const it = q.get<{ id: number; person_id: number; patient_id: number; media_id: string | null }>('SELECT id, person_id, patient_id, media_id FROM person_items WHERE id = ?', itemId)
  if (!it) throw new HttpError(404, 'NOT_FOUND', 'Item not found.')
  assertCaretaker(req, it.patient_id)
  return it
}
const pid = (req: Request) => assertCaretaker(req, idParam(req, 'pid'))

function deleteMediaFile(mediaId: string | null) {
  if (!mediaId) return
  const f = q.get<{ file: string }>('SELECT file FROM media WHERE id = ?', mediaId)
  q.run('DELETE FROM media WHERE id = ?', mediaId)
  if (f) unlink(join(config.storageDir, f.file), () => {})
}

/* ---------------- profile (progressive, everything optional) ---------------- */

const txt = (max = 1000) => z.string().trim().max(max).optional()
export const PROFILE_SECTIONS = {
  basic: z.object({ fullName: txt(100), preferredName: txt(60), age: txt(10), languages: txt(200) }),
  personality: z.object({ likes: txt(), dislikes: txt(), activities: txt(), foods: txt(), music: txt(), places: txt(), hobbies: txt(), happy: txt(), uncomfortable: txt() }),
  memories: z.object({ places: txt(), events: txt(), childhood: txt(), traditions: txt(), people: txt(), experiences: txt() }),
  communication: z.object({ preferredLanguage: txt(10), respondsBetter: z.enum(['', 'text', 'audio', 'both']).optional(), voiceStyle: txt(200), notes: txt() }),
} as const
type Section = keyof typeof PROFILE_SECTIONS

const profileData = (patientId: number) => {
  try { return JSON.parse(q.get<{ data: string }>('SELECT data FROM patient_profiles WHERE patient_id = ?', patientId)?.data ?? '{}') as Record<string, Record<string, string>> } catch { return {} }
}
function ensureProfile(patientId: number, createdBy: number | null, managed = false) {
  q.run('INSERT OR IGNORE INTO patient_profiles (patient_id, managed, created_by, data, updated_at) VALUES (?,?,?,?,?)', patientId, Number(managed), createdBy, '{}', Date.now())
}
function completeness(data: Record<string, Record<string, string>>) {
  const filled = Object.values(data).flatMap((s) => Object.values(s ?? {})).filter((v) => String(v ?? '').trim()).length
  const total = Object.values(PROFILE_SECTIONS).reduce((n, s) => n + Object.keys(s.shape).length, 0)
  return { filled, total }
}

/* ---------------- patients ---------------- */

careRouter.get('/patients', (req, res) => {
  const u = me(req)
  const rows = q.all<{ id: number; display_name: string; relation: string; managed: number | null; photo_media_id: string | null; data: string | null }>(
    `SELECT u.id, u.display_name, c.relation, pp.managed, pp.photo_media_id, pp.data FROM circle_links c JOIN users u ON u.id = c.patient_id
     LEFT JOIN patient_profiles pp ON pp.patient_id = u.id WHERE c.member_id = ? AND u.role = 'patient' ORDER BY c.id`, u.id)
  res.json({
    patients: rows.map((r) => {
      const data = r.data ? JSON.parse(r.data) : {}
      return {
        id: r.id, name: r.display_name, preferredName: data.basic?.preferredName || '', relation: r.relation, managed: Boolean(r.managed),
        photo: r.photo_media_id ? `/api/media/${r.photo_media_id}` : null,
        online: isOnline(r.id), current: currentActivity(r.id),
        people: q.get<{ n: number }>('SELECT COUNT(*) n FROM people WHERE patient_id = ? AND is_demo = 0', r.id)!.n,
        completeness: completeness(data),
      }
    }),
  })
})

const zRelation = z.string().trim().max(40).default('')
careRouter.post('/patients', wrap(async (req, res) => {
  const u = me(req)
  if (u.role !== 'family') throw new HttpError(403, 'FORBIDDEN', 'Only caretaker accounts can create patient profiles.')
  const b = parse(z.object({ name: z.string().trim().min(1).max(60), preferredName: z.string().trim().max(60).default(''), relation: zRelation }), req.body)
  const id = await createManagedPatient(b.name, u.lang, u.timezone)
  tx(() => {
    q.run('INSERT INTO circle_links (patient_id, member_id, relation, created_at) VALUES (?,?,?,?)', id, u.id, b.relation || 'caretaker', Date.now())
    ensureProfile(id, u.id, true)
    q.run('UPDATE patient_profiles SET data = ? WHERE patient_id = ?', JSON.stringify({ basic: { fullName: b.name, preferredName: b.preferredName } }), id)
  })
  recordEvent(id, 'profile_created', { by: u.display_name })
  res.status(201).json({ patient: { id, name: b.name } })
}))

/** Link an existing patient account (they share an invite code from their Settings). */
careRouter.post('/patients/link', rateLimit({ name: 'care-link', windowMs: 60_000, max: 10, key: (r) => String(r.user?.id) }), wrap((req, res) => {
  const u = me(req)
  const b = parse(z.object({ code: z.string().trim().toUpperCase().length(8), relation: zRelation }), req.body)
  const inv = q.get<{ patient_id: number; expires_at: number; used_by: number | null }>('SELECT * FROM invites WHERE code = ?', b.code)
  if (!inv || inv.used_by || inv.expires_at < Date.now()) throw new HttpError(404, 'INVITE_INVALID', 'This invite code is not valid or has expired.')
  if (inv.patient_id === u.id) throw new HttpError(400, 'SELF', 'You cannot link to yourself.')
  q.run('INSERT OR IGNORE INTO circle_links (patient_id, member_id, relation, created_at) VALUES (?,?,?,?)', inv.patient_id, u.id, b.relation || 'caretaker', Date.now())
  q.run('UPDATE invites SET used_by = ? WHERE code = ?', u.id, b.code)
  ensureProfile(inv.patient_id, null)
  res.json({ patient: { id: inv.patient_id } })
}))

careRouter.get('/patients/:pid', (req, res) => {
  const id = pid(req)
  const u = q.get<User>('SELECT id, display_name, lang, timezone FROM users WHERE id = ?', id)!
  ensureProfile(id, null)
  const pp = q.get<{ managed: number; photo_media_id: string | null; updated_at: number }>('SELECT managed, photo_media_id, updated_at FROM patient_profiles WHERE patient_id = ?', id)!
  const data = profileData(id)
  res.json({
    patient: { id, name: u.display_name, lang: u.lang, managed: Boolean(pp.managed), photo: pp.photo_media_id ? `/api/media/${pp.photo_media_id}` : null, updatedAt: pp.updated_at, online: isOnline(id), current: currentActivity(id) },
    profile: data,
    completeness: completeness(data),
    languages: LANGUAGES.map((l) => ({ code: l.code, name: l.name, native: l.native })),
  })
})

careRouter.patch('/patients/:pid/profile', wrap((req, res) => {
  const id = pid(req)
  const b = parse(z.object({ section: z.enum(Object.keys(PROFILE_SECTIONS) as [Section, ...Section[]]), values: z.record(z.string(), z.unknown()) }), req.body)
  const values = parse(PROFILE_SECTIONS[b.section], b.values) as Record<string, string | undefined>
  ensureProfile(id, null)
  const data = profileData(id)
  data[b.section] = { ...(data[b.section] ?? {}), ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) } as Record<string, string>
  tx(() => {
    q.run('UPDATE patient_profiles SET data = ?, updated_at = ? WHERE patient_id = ?', JSON.stringify(data), Date.now(), id)
    if (b.section === 'basic' && values.fullName) q.run('UPDATE users SET display_name = ? WHERE id = ?', values.fullName, id)
    if (b.section === 'communication' && values.preferredLanguage && LANGUAGES.some((l) => l.code === values.preferredLanguage))
      q.run('UPDATE users SET lang = ? WHERE id = ?', values.preferredLanguage, id)
  })
  careChanged(id, 'profile')
  res.json({ profile: data, completeness: completeness(data) })
}))

careRouter.post('/patients/:pid/photo', upload.single('file'), wrap((req, res) => {
  try {
    const id = pid(req)
    if (!req.file?.mimetype.startsWith('image/')) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Please choose a photo.')
    const mediaId = saveMedia(req, id)!
    ensureProfile(id, null)
    const old = q.get<{ photo_media_id: string | null }>('SELECT photo_media_id FROM patient_profiles WHERE patient_id = ?', id)?.photo_media_id ?? null
    q.run('UPDATE patient_profiles SET photo_media_id = ?, updated_at = ? WHERE patient_id = ?', mediaId, Date.now(), id)
    deleteMediaFile(old)
    careChanged(id, 'profile')
    res.status(201).json({ photo: `/api/media/${mediaId}` })
  } catch (e) { discardUpload(req); throw e }
}))

/** One-time code that signs the patient's own device in (no password for the patient). */
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
careRouter.post('/patients/:pid/pair-code', rateLimit({ name: 'pair-code', windowMs: 60_000, max: 6, key: (r) => String(r.user?.id) }), wrap((req, res) => {
  const id = pid(req)
  const code = Array.from({ length: 6 }, () => PAIR_ALPHABET[randomInt(PAIR_ALPHABET.length)]).join('')
  const expiresAt = Date.now() + 15 * 60_000
  q.run('DELETE FROM pair_codes WHERE patient_id = ? AND (used_at IS NOT NULL OR expires_at < ?)', id, Date.now())
  q.run('INSERT INTO pair_codes (code_hash, patient_id, created_by, expires_at) VALUES (?,?,?,?)', hashPairCode(code), id, me(req).id, expiresAt)
  res.status(201).json({ code: `${code.slice(0, 3)}-${code.slice(3)}`, expiresAt })
}))

/** Remove: a caretaker-created profile is deleted with all its data; a linked account is only unlinked. */
careRouter.delete('/patients/:pid', wrap((req, res) => {
  const id = pid(req)
  const u = me(req)
  const pp = q.get<{ managed: number; created_by: number | null }>('SELECT managed, created_by FROM patient_profiles WHERE patient_id = ?', id)
  if (pp?.managed && pp.created_by === u.id) {
    const files = q.all<{ file: string }>('SELECT file FROM media WHERE owner_id = ?', id)
    q.run('DELETE FROM memories WHERE patient_id = ?', id)
    q.run('DELETE FROM songs WHERE user_id = ?', id)
    q.run('DELETE FROM users WHERE id = ?', id)
    for (const f of files) unlink(join(config.storageDir, f.file), () => {})
    return void res.json({ deleted: true })
  }
  q.run('DELETE FROM circle_links WHERE patient_id = ? AND member_id = ?', id, u.id)
  res.json({ unlinked: true })
}))

/* ---------------- people ("avatars") ---------------- */

const zDetails = z.object({ whyImportant: txt(), usuallyTogether: txt(), firstMet: txt(), meaningfulPlace: txt(), notes: txt() })
const zMeta = z.object({ whatHappening: txt(), funMoment: txt(), place: txt(200), when: txt(100), description: txt(), group: z.boolean().optional() })
const zPhone = z.string().trim().max(30).regex(/^[+\d][\d\s()-]{3,}$/, 'phone number').or(z.literal(''))

const itemUrl = (it: { media_id: string | null; demo_asset: string | null }) => (it.media_id ? `/api/media/${it.media_id}` : it.demo_asset ? `/demo/${it.demo_asset}` : null)

export function personSummary(p: { id: number; name: string; relationship: string; avatar_item_id: number | null; is_demo: number; phone_enc?: string | null; updated_at: number }) {
  const avatar = p.avatar_item_id ? q.get<{ media_id: string | null; demo_asset: string | null }>('SELECT media_id, demo_asset FROM person_items WHERE id = ?', p.avatar_item_id) : null
  const counts = q.get<{ photos: number; audio: number; memories: number }>(
    `SELECT (SELECT COUNT(*) FROM person_items WHERE person_id = ?1 AND kind = 'photo') photos, (SELECT COUNT(*) FROM person_items WHERE person_id = ?1 AND kind = 'audio') audio,
      (SELECT COUNT(*) FROM person_memories WHERE person_id = ?1) memories`, p.id)!
  return { id: p.id, name: p.name, relationship: p.relationship, avatar: avatar ? itemUrl(avatar) : null, isDemo: Boolean(p.is_demo), updatedAt: p.updated_at, ...counts }
}

careRouter.get('/patients/:pid/people', (req, res) => {
  const id = pid(req)
  const rows = q.all<Parameters<typeof personSummary>[0]>('SELECT * FROM people WHERE patient_id = ? ORDER BY is_demo, id', id)
  res.json({ people: rows.map((p) => ({ ...personSummary(p), phone: maskPhone(decrypt(p.phone_enc ?? null)), story: storyStatus(p.id) })) })
})

/** Quick add: PHOTO → NAME → RELATIONSHIP → SAVE (photo optional; everything else later). */
careRouter.post('/patients/:pid/people', upload.single('file'), wrap((req, res) => {
  try {
    const id = pid(req)
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), relationship: z.string().trim().max(60).default(''), phone: zPhone.optional() }), req.body)
    if (req.file && !req.file.mimetype.startsWith('image/')) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Please choose a photo.')
    const u = me(req)
    const mediaId = saveMedia(req, id)
    const now = Date.now()
    const personId = tx(() => {
      const r = q.run('INSERT INTO people (patient_id, name, relationship, phone_enc, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        id, b.name, b.relationship, b.phone ? encrypt(b.phone) : null, u.id, now, now)
      const pid2 = Number(r.lastInsertRowid)
      if (mediaId) {
        const it = q.run('INSERT INTO person_items (person_id, patient_id, kind, media_id, meta, created_by, created_at) VALUES (?,?,?,?,?,?,?)', pid2, id, 'photo', mediaId, '{}', u.id, now)
        q.run('UPDATE people SET avatar_item_id = ? WHERE id = ?', Number(it.lastInsertRowid), pid2)
      }
      return pid2
    })
    careChanged(id, 'people')
    res.status(201).json({ person: personSummary(q.get('SELECT * FROM people WHERE id = ?', personId)!) })
  } catch (e) { discardUpload(req); throw e }
}))

careRouter.get('/people/:id', (req, res) => {
  const p = personFor(req, idParam(req))
  const row = q.get<Parameters<typeof personSummary>[0] & { details: string; phone_enc: string | null }>('SELECT * FROM people WHERE id = ?', p.id)!
  const items = q.all<{ id: number; kind: string; media_id: string | null; demo_asset: string | null; meta: string; is_demo: number; created_at: number }>('SELECT * FROM person_items WHERE person_id = ? ORDER BY id', p.id)
  const memories = q.all<{ id: number; type: string; content: string; related_item_id: number | null; source: string; created_at: number; author: string | null }>(
    'SELECT m.id, m.type, m.content, m.related_item_id, m.source, m.created_at, u.display_name author FROM person_memories m LEFT JOIN users u ON u.id = m.created_by WHERE m.person_id = ? ORDER BY m.id', p.id)
  res.json({
    person: { ...personSummary(row), avatarItemId: row.avatar_item_id, phone: decrypt(row.phone_enc), details: JSON.parse(row.details || '{}') },
    items: items.map((i) => ({ id: i.id, kind: i.kind, url: itemUrl(i), meta: JSON.parse(i.meta || '{}'), isDemo: Boolean(i.is_demo), createdAt: i.created_at })),
    memories,
    story: storyStatus(p.id),
  })
})

careRouter.patch('/people/:id', wrap((req, res) => {
  const p = personFor(req, idParam(req))
  const b = parse(z.object({
    name: z.string().trim().min(1).max(80).optional(), relationship: z.string().trim().max(60).optional(), phone: zPhone.optional(),
    details: zDetails.optional(), avatarItemId: z.number().int().nullable().optional(),
  }), req.body)
  if (b.avatarItemId && !q.get("SELECT 1 FROM person_items WHERE id = ? AND person_id = ? AND kind = 'photo'", b.avatarItemId, p.id)) throw new HttpError(400, 'VALIDATION', 'That photo does not belong to this person.')
  const cur = q.get<{ details: string }>('SELECT details FROM people WHERE id = ?', p.id)!
  const details = b.details ? { ...JSON.parse(cur.details || '{}'), ...b.details } : null
  q.run(`UPDATE people SET name = COALESCE(?, name), relationship = COALESCE(?, relationship), details = COALESCE(?, details),
    phone_enc = CASE WHEN ? THEN ? ELSE phone_enc END, avatar_item_id = CASE WHEN ? THEN ? ELSE avatar_item_id END, updated_at = ? WHERE id = ?`,
    b.name ?? null, b.relationship ?? null, details ? JSON.stringify(details) : null,
    b.phone === undefined ? 0 : 1, b.phone ? encrypt(b.phone) : null,
    b.avatarItemId === undefined ? 0 : 1, b.avatarItemId ?? null, Date.now(), p.id)
  careChanged(p.patient_id, 'people')
  res.json({ ok: true })
}))

careRouter.delete('/people/:id', wrap((req, res) => {
  const p = personFor(req, idParam(req))
  const media = q.all<{ media_id: string | null }>('SELECT media_id FROM person_items WHERE person_id = ?', p.id)
  q.run('DELETE FROM people WHERE id = ?', p.id)
  for (const m of media) deleteMediaFile(m.media_id)
  careChanged(p.patient_id, 'people')
  res.json({ ok: true })
}))

/* ---------------- photos + audio ---------------- */

careRouter.post('/people/:id/items', upload.single('file'), wrap((req, res) => {
  try {
    const p = personFor(req, idParam(req))
    if (!req.file) throw new HttpError(400, 'VALIDATION', 'Choose a photo or an audio recording.')
    const kind = req.file.mimetype.startsWith('image/') ? 'photo' : req.file.mimetype.startsWith('audio/') || req.file.mimetype === 'video/webm' ? 'audio' : null
    if (!kind) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Please choose a photo or an audio recording.')
    const meta = parse(zMeta, typeof req.body.meta === 'string' ? JSON.parse(req.body.meta || '{}') : {})
    const mediaId = saveMedia(req, p.patient_id)!
    const r = q.run('INSERT INTO person_items (person_id, patient_id, kind, media_id, meta, created_by, created_at) VALUES (?,?,?,?,?,?,?)', p.id, p.patient_id, kind, mediaId, JSON.stringify(meta), me(req).id, Date.now())
    const itemId = Number(r.lastInsertRowid)
    if (kind === 'photo' && !q.get<{ avatar_item_id: number | null }>('SELECT avatar_item_id FROM people WHERE id = ?', p.id)!.avatar_item_id)
      q.run('UPDATE people SET avatar_item_id = ? WHERE id = ?', itemId, p.id)
    q.run('UPDATE people SET updated_at = ? WHERE id = ?', Date.now(), p.id)
    careChanged(p.patient_id, 'people')
    res.status(201).json({ item: { id: itemId, kind, url: `/api/media/${mediaId}`, meta } })
  } catch (e) {
    discardUpload(req)
    if (e instanceof SyntaxError) throw new HttpError(400, 'VALIDATION', 'Invalid details.')
    throw e
  }
}))

careRouter.patch('/items/:id', wrap((req, res) => {
  const it = itemFor(req, idParam(req))
  const meta = parse(zMeta, req.body.meta ?? {})
  const cur = JSON.parse(q.get<{ meta: string }>('SELECT meta FROM person_items WHERE id = ?', it.id)!.meta || '{}')
  q.run('UPDATE person_items SET meta = ? WHERE id = ?', JSON.stringify({ ...cur, ...meta }), it.id)
  careChanged(it.patient_id, 'people')
  res.json({ ok: true })
}))

careRouter.delete('/items/:id', wrap((req, res) => {
  const it = itemFor(req, idParam(req))
  q.run('UPDATE people SET avatar_item_id = NULL WHERE avatar_item_id = ?', it.id)
  q.run('DELETE FROM person_items WHERE id = ?', it.id)
  deleteMediaFile(it.media_id)
  careChanged(it.patient_id, 'people')
  res.json({ ok: true })
}))

/* ---------------- memories (evidence with source) ---------------- */

const zMemType = z.enum(['memory', 'fun_moment', 'place', 'event', 'together', 'first_met', 'importance', 'timeline'])
careRouter.post('/people/:id/memories', wrap((req, res) => {
  const p = personFor(req, idParam(req))
  const b = parse(z.object({ type: zMemType.default('memory'), content: z.string().trim().min(1).max(1000), relatedItemId: z.number().int().nullable().optional() }), req.body)
  if (b.relatedItemId && !q.get('SELECT 1 FROM person_items WHERE id = ? AND person_id = ?', b.relatedItemId, p.id)) throw new HttpError(400, 'VALIDATION', 'That photo does not belong to this person.')
  const r = q.run('INSERT INTO person_memories (person_id, patient_id, type, content, related_item_id, source, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    p.id, p.patient_id, b.type, b.content, b.relatedItemId ?? null, 'caretaker', me(req).id, Date.now())
  q.run('UPDATE people SET updated_at = ? WHERE id = ?', Date.now(), p.id)
  careChanged(p.patient_id, 'people')
  res.status(201).json({ memory: q.get('SELECT * FROM person_memories WHERE id = ?', Number(r.lastInsertRowid)) })
}))

const memFor = (req: Request) => {
  const m = q.get<{ id: number; patient_id: number }>('SELECT id, patient_id FROM person_memories WHERE id = ?', idParam(req))
  if (!m) throw new HttpError(404, 'NOT_FOUND', 'Memory not found.')
  assertCaretaker(req, m.patient_id)
  return m
}
careRouter.patch('/memories/:id', wrap((req, res) => {
  const m = memFor(req)
  const b = parse(z.object({ content: z.string().trim().min(1).max(1000).optional(), type: zMemType.optional() }), req.body)
  q.run('UPDATE person_memories SET content = COALESCE(?, content), type = COALESCE(?, type) WHERE id = ?', b.content ?? null, b.type ?? null, m.id)
  careChanged(m.patient_id, 'people')
  res.json({ ok: true })
}))
careRouter.delete('/memories/:id', wrap((req, res) => {
  const m = memFor(req)
  q.run('DELETE FROM person_memories WHERE id = ?', m.id)
  careChanged(m.patient_id, 'people')
  res.json({ ok: true })
}))

/* ---------------- stories ---------------- */

/** Live state of the private (local) AI that writes stories. Pushed live as "ai:local"; this is the initial read. */
careRouter.get('/ai/local', (req, res) => {
  if (me(req).role !== 'family') throw new HttpError(403, 'FORBIDDEN', 'For caretakers only.')
  res.json(localAiStatus())
})
careRouter.post('/ai/local/check', wrap(async (req, res) => {
  if (me(req).role !== 'family') throw new HttpError(403, 'FORBIDDEN', 'For caretakers only.')
  await ensureLocalAi()
  res.json(localAiStatus())
}))

careRouter.post('/people/:id/story', rateLimit({ name: 'story', windowMs: 60_000, max: 6, key: (r) => String(r.user?.id) }), wrap(async (req, res) => {
  const p = personFor(req, idParam(req))
  let last = 0
  storyProgress(p.id, 'writing', { chars: 0 })
  const s = await getOrBuildStory(p.id, req.body?.force === true, (chars) => { if (chars - last >= 40) { last = chars; storyProgress(p.id, 'writing', { chars }) } })
    .catch((e) => { storyProgress(p.id, 'failed'); throw e })
  storyProgress(p.id, 'done', { generator: s.generator })
  careChanged(p.patient_id, 'story')
  res.json({ story: s.story, generator: s.generator, createdAt: s.created_at, status: storyStatus(p.id) })
}))

/* ---------------- sample (demo) family — separate from real data ---------------- */

careRouter.post('/patients/:pid/demo', wrap((req, res) => {
  const id = pid(req)
  if (q.get('SELECT 1 FROM people WHERE patient_id = ? AND is_demo = 1', id)) return void res.json({ ok: true })
  const u = me(req)
  const now = Date.now()
  tx(() => {
    const r = q.run('INSERT INTO people (patient_id, name, relationship, details, is_demo, created_by, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?)',
      id, 'Sample: Asha', 'Granddaughter', JSON.stringify({ usuallyTogether: 'Watering the garden plants every morning' }), u.id, now, now)
    const person = Number(r.lastInsertRowid)
    const item = (asset: string, meta: object) => Number(q.run('INSERT INTO person_items (person_id, patient_id, kind, demo_asset, meta, is_demo, created_by, created_at) VALUES (?,?,?,?,?,1,?,?)', person, id, 'photo', asset, JSON.stringify(meta), u.id, now).lastInsertRowid)
    const portrait = item('asha-portrait.svg', { description: 'A drawing of Asha smiling' })
    const garden = item('garden.svg', { whatHappening: 'Watering the plants together', place: 'The garden at home' })
    const kite = item('kite.svg', { funMoment: 'Flying a kite on the terrace', place: 'The terrace' })
    q.run('UPDATE people SET avatar_item_id = ? WHERE id = ?', portrait, person)
    const mem = (type: string, content: string, rel: number | null) => q.run('INSERT INTO person_memories (person_id, patient_id, type, content, related_item_id, source, is_demo, created_by, created_at) VALUES (?,?,?,?,?,?,1,?,?)', person, id, type, content, rel, 'demo', u.id, now)
    mem('together', 'Asha and you water the garden plants together every morning.', garden)
    mem('fun_moment', 'You both flew a bright yellow kite on the terrace.', kite)
  })
  careChanged(id, 'people')
  res.status(201).json({ ok: true })
}))
careRouter.delete('/patients/:pid/demo', wrap((req, res) => {
  const id = pid(req)
  q.run('DELETE FROM people WHERE patient_id = ? AND is_demo = 1', id)
  careChanged(id, 'people')
  res.json({ ok: true })
}))

/* ---------------- monitoring + report ---------------- */

careRouter.get('/patients/:pid/monitor', wrap((req, res) => {
  const id = pid(req)
  res.json(monitoringData(id, Number(req.query.days ?? 30)))
}))

careRouter.get('/patients/:pid/report.pdf', rateLimit({ name: 'report', windowMs: 60_000, max: 5, key: (r) => String(r.user?.id) }), wrap(async (req, res) => {
  const id = pid(req)
  const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30))
  const pdf = await buildReport(id, days, me(req))
  log.info('report generated', { days })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Disposition', `attachment; filename="recallia-observation-report.pdf"`)
  res.end(pdf)
}))
