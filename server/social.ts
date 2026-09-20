import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { me, USER_COLS, type User } from './auth.ts'
import { q } from './db.ts'
import { emit, isOnline } from './realtime.ts'
import { retimezoneReminders } from './reminders.ts'
import { isValidTz } from './time.ts'
import { HttpError, idParam, parse, rateLimit, wrap } from './util.ts'

/* ---------- relationships / permissions ---------- */
export function inCircle(a: number, b: number) {
  return Boolean(q.get('SELECT 1 FROM circle_links WHERE (patient_id = ? AND member_id = ?) OR (patient_id = ? AND member_id = ?)', a, b, b, a))
}

/** Patients whose Time Capsule / songs the user may manage: themselves + patients they're linked to. */
export function canManagePatient(userId: number, patientId: number) {
  return userId === patientId || Boolean(q.get('SELECT 1 FROM circle_links WHERE patient_id = ? AND member_id = ?', patientId, userId))
}

function canMessage(from: number, to: number) {
  if (from === to) return false
  if (inCircle(from, to)) return true
  const t = q.get<{ discoverable: number }>('SELECT discoverable FROM users WHERE id = ?', to)
  const f = q.get<{ discoverable: number }>('SELECT discoverable FROM users WHERE id = ?', from)
  return Boolean(t?.discoverable && f?.discoverable)
}

/* ---------- profile ---------- */
export const profileRouter = Router()

profileRouter.patch('/', wrap((req, res) => {
  const u = me(req)
  const b = parse(
    z.object({
      displayName: z.string().trim().min(1).max(60).optional(),
      lang: z.string().max(10).optional(),
      timezone: z.string().max(60).refine(isValidTz, 'unknown timezone').optional(),
      discoverable: z.boolean().optional(),
      showPresence: z.boolean().optional(),
      fhirPatientId: z.string().trim().max(100).nullable().optional(),
    }),
    req.body,
  )
  q.run(
    `UPDATE users SET display_name = COALESCE(?, display_name), lang = COALESCE(?, lang), timezone = COALESCE(?, timezone),
     discoverable = COALESCE(?, discoverable), show_presence = COALESCE(?, show_presence), fhir_patient_id = CASE WHEN ? THEN ? ELSE fhir_patient_id END WHERE id = ?`,
    b.displayName ?? null, b.lang ?? null, b.timezone ?? null,
    b.discoverable === undefined ? null : Number(b.discoverable), b.showPresence === undefined ? null : Number(b.showPresence),
    b.fhirPatientId === undefined ? 0 : 1, b.fhirPatientId || null, u.id,
  )
  if (b.timezone && b.timezone !== u.timezone) retimezoneReminders(u.id, b.timezone)
  res.json({ user: q.get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, u.id) })
}))

/* ---------- family circle ---------- */
export const circleRouter = Router()

circleRouter.get('/', (req, res) => {
  const u = me(req)
  const members = q.all(
    `SELECT c.id link_id, c.relation, u.id, u.display_name, u.role FROM circle_links c JOIN users u ON u.id = c.member_id WHERE c.patient_id = ?`, u.id)
  const patients = q.all(
    `SELECT c.id link_id, c.relation, u.id, u.display_name FROM circle_links c JOIN users u ON u.id = c.patient_id WHERE c.member_id = ?`, u.id)
  res.json({ members, patients })
})

circleRouter.post('/invite', wrap((req, res) => {
  const u = me(req)
  if (u.role !== 'patient') throw new HttpError(403, 'FORBIDDEN', 'Only the main account holder can invite family.')
  const code = randomBytes(4).toString('hex').toUpperCase()
  const expires = Date.now() + 7 * 864e5
  q.run('INSERT INTO invites (code, patient_id, expires_at) VALUES (?,?,?)', code, u.id, expires)
  res.status(201).json({ code, expiresAt: expires })
}))

circleRouter.post('/join', rateLimit({ name: 'join', windowMs: 60_000, max: 10, key: (r) => String(r.user?.id) }), wrap((req, res) => {
  const u = me(req)
  const b = parse(z.object({ code: z.string().trim().toUpperCase().length(8), relation: z.string().trim().max(40).default('') }), req.body)
  const inv = q.get<{ patient_id: number; expires_at: number; used_by: number | null }>('SELECT * FROM invites WHERE code = ?', b.code)
  if (!inv || inv.used_by || inv.expires_at < Date.now()) throw new HttpError(404, 'INVITE_INVALID', 'This invite code is not valid or has expired.')
  if (inv.patient_id === u.id) throw new HttpError(400, 'SELF', 'You cannot join your own circle.')
  q.run('INSERT OR IGNORE INTO circle_links (patient_id, member_id, relation, created_at) VALUES (?,?,?,?)', inv.patient_id, u.id, b.relation, Date.now())
  q.run('UPDATE invites SET used_by = ? WHERE code = ?', u.id, b.code)
  res.json({ ok: true })
}))

circleRouter.delete('/:linkId', wrap((req, res) => {
  const u = me(req)
  const r = q.run('DELETE FROM circle_links WHERE id = ? AND (patient_id = ? OR member_id = ?)', idParam(req, 'linkId'), u.id, u.id)
  if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Link not found.')
  res.json({ ok: true })
}))

/* ---------- Interact: discovery + direct messages ---------- */
export const interactRouter = Router()

interactRouter.get('/people', (req, res) => {
  const u = me(req)
  const rows = q.all<{ id: number; display_name: string; show_presence: number; circle: number }>(
    `SELECT id, display_name, show_presence, 1 AS circle FROM users WHERE id IN (
        SELECT member_id FROM circle_links WHERE patient_id = ?1 UNION SELECT patient_id FROM circle_links WHERE member_id = ?1)
     UNION
     SELECT id, display_name, show_presence, 0 FROM users WHERE ?2 = 1 AND discoverable = 1 AND id != ?1
       AND id NOT IN (SELECT member_id FROM circle_links WHERE patient_id = ?1 UNION SELECT patient_id FROM circle_links WHERE member_id = ?1)
     LIMIT 100`,
    u.id, u.discoverable,
  )
  const unread = q.all<{ sender_id: number; n: number }>('SELECT sender_id, COUNT(*) n FROM messages WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id', u.id)
  res.json({
    discoverable: Boolean(u.discoverable),
    people: rows.map((r) => ({
      id: r.id,
      name: r.display_name,
      circle: Boolean(r.circle),
      online: r.show_presence ? isOnline(r.id) : null,
      unread: unread.find((x) => x.sender_id === r.id)?.n ?? 0,
    })),
  })
})

interactRouter.get('/messages/:userId', wrap((req, res) => {
  const u = me(req)
  const other = idParam(req, 'userId')
  if (!canMessage(u.id, other) && !q.get('SELECT 1 FROM messages WHERE sender_id = ? AND recipient_id = ?', other, u.id))
    throw new HttpError(403, 'FORBIDDEN', 'You cannot message this person.')
  const msgs = q.all(
    `SELECT * FROM (SELECT * FROM messages WHERE (sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1) ORDER BY id DESC LIMIT 200) ORDER BY id`,
    u.id, other,
  )
  const r = q.run('UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL', Date.now(), other, u.id)
  if (r.changes) emit(other, { type: 'message', message: { kind: 'read', by: u.id } })
  res.json({ messages: msgs })
}))

const msgLimiter = rateLimit({ name: 'msg', windowMs: 60_000, max: 30, key: (r) => String(r.user?.id) })

interactRouter.post('/messages/:userId', msgLimiter, wrap((req, res) => {
  const u = me(req)
  const other = idParam(req, 'userId')
  if (!canMessage(u.id, other)) throw new HttpError(403, 'FORBIDDEN', 'You cannot message this person.')
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body)
  const r = q.run('INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?,?,?,?)', u.id, other, body, Date.now())
  const message = q.get('SELECT * FROM messages WHERE id = ?', Number(r.lastInsertRowid))
  emit(other, { type: 'message', message })
  emit(u.id, { type: 'message', message })
  res.status(201).json({ message })
}))
