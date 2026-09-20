import { Router } from 'express'
import webpush from 'web-push'
import { z } from 'zod'
import { me } from './auth.ts'
import { config } from './config.ts'
import { q } from './db.ts'
import { emit } from './realtime.ts'
import { localDate, localNow, nextFire, type Schedule } from './time.ts'
import { HttpError, idParam, log, parse, wrap, zDate, zDays, zTime } from './util.ts'

export interface Reminder {
  id: number
  user_id: number
  text: string
  kind: string
  source: string
  task_id: number | null
  date: string | null
  time: string
  recurrence: Schedule['recurrence']
  days: string
  timezone: string
  next_fire_at: number | null
  last_fired_at: number | null
  active: number
  created_at: number
}

export const zReminderInput = z.object({
  text: z.string().trim().min(1).max(200),
  date: zDate.nullable().optional(),
  time: zTime,
  recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly']).default('none'),
  days: zDays.default(''),
  kind: z.enum(['custom', 'medication', 'appointment', 'routine']).default('custom'),
})
export type ReminderInput = z.infer<typeof zReminderInput>

export function createReminder(userId: number, tz: string, input: ReminderInput, source: string, taskId: number | null = null): Reminder {
  const s: Schedule = { date: input.date ?? null, time: input.time, recurrence: input.recurrence, days: input.days, timezone: tz }
  if (s.recurrence === 'none' && !s.date) s.date = localDate(tz)
  if (s.recurrence === 'weekly' && !s.days) throw new HttpError(400, 'VALIDATION', 'Pick at least one day for a weekly reminder.')
  const next = nextFire(s)
  if (next === null) throw new HttpError(400, 'IN_PAST', 'That time has already passed.')
  const r = q.run(
    `INSERT INTO reminders (user_id, text, kind, source, task_id, date, time, recurrence, days, timezone, next_fire_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId, input.text, input.kind, source, taskId, s.date, s.time, s.recurrence, s.days, tz, next, Date.now(),
  )
  emit(userId, { type: 'reminders:changed' })
  return q.get<Reminder>('SELECT * FROM reminders WHERE id = ?', Number(r.lastInsertRowid))!
}

/* ---------- Web Push (VAPID keys generated once and stored) ---------- */
function vapidKeys() {
  if (config.push.publicKey && config.push.privateKey) return { publicKey: config.push.publicKey, privateKey: config.push.privateKey }
  const row = q.get<{ value: string }>("SELECT value FROM app_kv WHERE key = 'vapid'")
  if (row) return JSON.parse(row.value) as { publicKey: string; privateKey: string }
  const keys = webpush.generateVAPIDKeys()
  q.run("INSERT INTO app_kv (key, value) VALUES ('vapid', ?)", JSON.stringify(keys))
  return keys
}
const VAPID = vapidKeys()
// Push services require a contact for the sender; configure VAPID_SUBJECT in production.
webpush.setVapidDetails(config.push.subject || 'mailto:admin@localhost', VAPID.publicKey, VAPID.privateKey)

/** Re-anchor a user's reminders when their time zone changes (e.g. travel or a corrected setting). */
export function retimezoneReminders(userId: number, tz: string) {
  const rows = q.all<Reminder>('SELECT * FROM reminders WHERE user_id = ? AND active = 1 AND timezone != ?', userId, tz)
  for (const r of rows) {
    const next = nextFire({ ...r, timezone: tz })
    q.run('UPDATE reminders SET timezone = ?, next_fire_at = ?, active = ? WHERE id = ?', tz, next, next === null ? 0 : 1, r.id)
  }
  if (rows.length) emit(userId, { type: 'reminders:changed' })
}

/** Hourly housekeeping: expired sessions/invites and old handled notifications. */
export function housekeeping(now = Date.now()) {
  q.run('DELETE FROM sessions WHERE expires_at < ?', now)
  q.run('DELETE FROM invites WHERE expires_at < ? AND used_by IS NULL', now)
  q.run('DELETE FROM notifications WHERE done_at IS NOT NULL AND created_at < ?', now - 30 * 864e5)
}

async function sendPush(userId: number, payload: object) {
  const subs = q.all<{ id: number; endpoint: string; p256dh: string; auth: string }>('SELECT * FROM push_subscriptions WHERE user_id = ?', userId)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 })
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) q.run('DELETE FROM push_subscriptions WHERE id = ?', s.id)
        else log.warn('push failed', { code })
      }
    }),
  )
}

/* ---------- Scheduler: runs in the server, independent of any open browser ---------- */
export function fireDue(now = Date.now()) {
  const due = q.all<Reminder>('SELECT * FROM reminders WHERE active = 1 AND next_fire_at IS NOT NULL AND next_fire_at <= ? LIMIT 200', now)
  for (const r of due) {
    // Routine reminders are skipped when the task was already completed today.
    const skip = r.task_id && q.get('SELECT 1 FROM task_completions WHERE task_id = ? AND local_date = ?', r.task_id, localDate(r.timezone, now))
    const next = r.recurrence === 'none' ? null : nextFire(r, now)
    q.run('UPDATE reminders SET last_fired_at = ?, next_fire_at = ?, active = ? WHERE id = ?', now, next, next === null ? 0 : 1, r.id)
    emit(r.user_id, { type: 'reminders:changed' })
    if (skip) continue
    // After long downtime, don't flood the person with stale alerts: only deliver if at most 6 h late.
    if (r.next_fire_at && now - r.next_fire_at > 6 * 36e5) { log.warn('stale reminder skipped', { id: r.id }); continue }
    const n = q.run('INSERT INTO notifications (user_id, reminder_id, title, body, created_at) VALUES (?,?,?,?,?)', r.user_id, r.id, r.text, r.kind, now)
    const notification = q.get('SELECT * FROM notifications WHERE id = ?', Number(n.lastInsertRowid))
    emit(r.user_id, { type: 'notification', notification })
    void sendPush(r.user_id, { title: r.text, body: '', tag: `rem-${r.id}`, url: '/#/hub', notificationId: Number(n.lastInsertRowid) })
  }
  if (due.length) log.info('reminders fired', { n: due.length })
}

export function startScheduler() {
  fireDue()
  housekeeping()
  setInterval(() => { try { housekeeping() } catch (e) { log.error('housekeeping', { err: (e as Error).message }) } }, 36e5).unref()
  setInterval(() => {
    try { fireDue() } catch (e) { log.error('scheduler', { err: (e as Error).message }) }
  }, 15_000).unref()
}

/* ---------- Routes ---------- */
export const remindersRouter = Router()

remindersRouter.get('/', (req, res) => {
  res.json({ reminders: q.all<Reminder>('SELECT * FROM reminders WHERE user_id = ? AND active = 1 ORDER BY next_fire_at', me(req).id) })
})

remindersRouter.post('/', wrap((req, res) => {
  const u = me(req)
  res.status(201).json({ reminder: createReminder(u.id, u.timezone, parse(zReminderInput, req.body), 'user') })
}))

remindersRouter.delete('/:id', wrap((req, res) => {
  const r = q.run('UPDATE reminders SET active = 0 WHERE id = ? AND user_id = ?', idParam(req), me(req).id)
  if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Reminder not found.')
  emit(me(req).id, { type: 'reminders:changed' })
  res.json({ ok: true })
}))

export const notificationsRouter = Router()

notificationsRouter.get('/', (req, res) => {
  res.json({
    notifications: q.all('SELECT * FROM notifications WHERE user_id = ? AND (done_at IS NULL OR created_at > ?) ORDER BY created_at DESC LIMIT 30', me(req).id, Date.now() - 864e5),
  })
})

notificationsRouter.post('/:id/done', wrap((req, res) => {
  const u = me(req)
  const r = q.run('UPDATE notifications SET done_at = ? WHERE id = ? AND user_id = ?', Date.now(), idParam(req), u.id)
  if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.')
  // "Done" on a routine/medication reminder also ticks that step off for today.
  const link = q.get<{ task_id: number | null }>('SELECT r.task_id FROM notifications n JOIN reminders r ON r.id = n.reminder_id WHERE n.id = ?', idParam(req))
  if (link?.task_id && q.get('SELECT 1 FROM routine_tasks WHERE id = ? AND user_id = ?', link.task_id, u.id)) {
    q.run('INSERT OR IGNORE INTO task_completions (task_id, user_id, local_date, completed_at) VALUES (?,?,?,?)', link.task_id, u.id, localDate(u.timezone), Date.now())
    emit(u.id, { type: 'tasks:changed' })
    emit(u.id, { type: 'handbook:changed' })
  }
  res.json({ ok: true, taskCompleted: Boolean(link?.task_id) })
}))

notificationsRouter.post('/:id/snooze', wrap((req, res) => {
  const u = me(req)
  const n = q.get<{ title: string }>('SELECT title FROM notifications WHERE id = ? AND user_id = ?', idParam(req), u.id)
  if (!n) throw new HttpError(404, 'NOT_FOUND', 'Notification not found.')
  const minutes = parse(z.object({ minutes: z.number().int().min(5).max(120).default(10) }), req.body ?? {}).minutes
  const at = Date.now() + minutes * 60_000
  q.run('UPDATE notifications SET done_at = ? WHERE id = ?', Date.now(), idParam(req))
  const r = q.run(
    `INSERT INTO reminders (user_id, text, kind, source, date, time, recurrence, timezone, next_fire_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    u.id, n.title, 'custom', 'snooze', localDate(u.timezone, at), localNow(u.timezone, at).time, 'none', u.timezone, at, Date.now(),
  )
  emit(u.id, { type: 'reminders:changed' })
  res.json({ ok: true, reminderId: Number(r.lastInsertRowid), at })
}))

export const pushRouter = Router()
pushRouter.get('/key', (_req, res) => res.json({ publicKey: VAPID.publicKey }))
pushRouter.post('/subscribe', wrap((req, res) => {
  const b = parse(z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) }), req.body)
  q.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    me(req).id, b.endpoint, b.keys.p256dh, b.keys.auth, Date.now(),
  )
  res.json({ ok: true })
}))
pushRouter.post('/test', wrap(async (req, res) => {
  const count = q.get<{ n: number }>('SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?', me(req).id)!.n
  if (!count) throw new HttpError(409, 'NO_SUBSCRIPTION', 'Notifications are not switched on for this device yet.')
  await sendPush(me(req).id, { title: 'Recallia Quest', body: 'Notifications are working.', tag: 'test', url: '/#/hub' })
  res.json({ ok: true, devices: count })
}))
