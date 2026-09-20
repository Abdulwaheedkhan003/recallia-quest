import { Router } from 'express'
import { z } from 'zod'
import { me, type User } from './auth.ts'
import { q, tx } from './db.ts'
import { emit } from './realtime.ts'
import { pushLive } from './monitor.ts'
import { createReminder } from './reminders.ts'
import { localDate, localNow } from './time.ts'
import { HttpError, idParam, parse, wrap, zDays, zTime } from './util.ts'

type Period = 'morning' | 'afternoon' | 'night'
interface Task {
  id: number; user_id: number; period: Period; key: string | null; title: string; icon: string; sort: number
  days: string; time: string | null; is_medication: number; remind: number; archived: number
}

/** Default starter routine for a new patient account. Fully editable by the user. */
const TEMPLATE: [Period, string, string, string, string | null][] = [
  ['morning', 'wake_up', 'Wake up', 'sunrise', '07:00'],
  ['morning', 'brush_am', 'Brush teeth', 'smile', null],
  ['morning', 'wash_face', 'Wash face', 'droplets', null],
  ['morning', 'bath', 'Take a bath', 'bath', null],
  ['morning', 'dress', 'Get dressed', 'shirt', null],
  ['morning', 'breakfast', 'Breakfast', 'coffee', '08:30'],
  ['afternoon', 'lunch', 'Lunch', 'utensils', '13:00'],
  ['afternoon', 'water', 'Drink water', 'glass-water', null],
  ['afternoon', 'rest', 'Rest', 'sofa', null],
  ['afternoon', 'brain', 'Play a brain game', 'puzzle', null],
  ['afternoon', 'walk', 'Take a short walk', 'footprints', null],
  ['night', 'dinner', 'Dinner', 'soup', '19:30'],
  ['night', 'brush_pm', 'Brush teeth', 'smile', null],
  ['night', 'prepare_sleep', 'Get ready for bed', 'bed', null],
  ['night', 'relax', 'Relax and unwind', 'moon', null],
]

export function seedRoutine(userId: number) {
  TEMPLATE.forEach(([period, key, title, icon, time], i) =>
    q.run('INSERT INTO routine_tasks (user_id, period, key, title, icon, sort, time, created_at) VALUES (?,?,?,?,?,?,?,?)', userId, period, key, title, icon, i, time, Date.now()),
  )
}

export function logActivity(u: User, kind: string, ref: string | null = null) {
  q.run('INSERT INTO activities (user_id, kind, ref, local_date, created_at) VALUES (?,?,?,?,?)', u.id, kind, ref, localDate(u.timezone), Date.now())
  emit(u.id, { type: 'handbook:changed' })
  if (u.role === 'patient') pushLive(u.id, 'activity', { kind, ref })
}

const periodOfHour = (h: number): Period => (h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'night')

function syncTaskReminder(u: User, t: Task) {
  q.run('UPDATE reminders SET active = 0 WHERE task_id = ?', t.id)
  if (!t.remind || !t.time || t.archived || !t.days) return
  const daily = t.days.length === 7
  createReminder(u.id, u.timezone, { text: t.title, time: t.time, recurrence: daily ? 'daily' : 'weekly', days: daily ? '' : t.days, kind: t.is_medication ? 'medication' : 'routine', date: null }, 'routine', t.id)
}

function completeTask(u: User, taskId: number) {
  const date = localDate(u.timezone)
  q.run('INSERT OR IGNORE INTO task_completions (task_id, user_id, local_date, completed_at) VALUES (?,?,?,?)', taskId, u.id, date, Date.now())
  emit(u.id, { type: 'tasks:changed' })
  emit(u.id, { type: 'handbook:changed' })
}

const ownTask = (u: User, id: number) => {
  const t = q.get<Task>('SELECT * FROM routine_tasks WHERE id = ? AND user_id = ?', id, u.id)
  if (!t) throw new HttpError(404, 'NOT_FOUND', 'Task not found.')
  return t
}

export const routineRouter = Router()

routineRouter.get('/', (req, res) => {
  const u = me(req)
  const now = localNow(u.timezone)
  const tasks = q.all<Task>('SELECT * FROM routine_tasks WHERE user_id = ? AND archived = 0 ORDER BY period, sort, id', u.id)
  const done = q.all<{ task_id: number; completed_at: number }>('SELECT task_id, completed_at FROM task_completions WHERE user_id = ? AND local_date = ?', u.id, now.date)
  res.json({ date: now.date, weekday: now.weekday, currentPeriod: periodOfHour(now.hour), tasks, completions: done })
})

const zTask = z.object({
  period: z.enum(['morning', 'afternoon', 'night']),
  title: z.string().trim().min(1).max(80),
  icon: z.string().max(30).default('star'),
  time: zTime.nullable().default(null),
  days: zDays.default('0123456'),
  isMedication: z.boolean().default(false),
  remind: z.boolean().default(false),
})

routineRouter.post('/tasks', wrap((req, res) => {
  const u = me(req)
  const b = parse(zTask, req.body)
  const t = tx(() => {
    const r = q.run(
      'INSERT INTO routine_tasks (user_id, period, title, icon, sort, days, time, is_medication, remind, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      u.id, b.period, b.title, b.isMedication ? 'pill' : b.icon, 100, b.days, b.time, b.isMedication ? 1 : 0, b.remind ? 1 : 0, Date.now(),
    )
    const task = ownTask(u, Number(r.lastInsertRowid))
    syncTaskReminder(u, task)
    return task
  })
  emit(u.id, { type: 'tasks:changed' })
  res.status(201).json({ task: t })
}))

routineRouter.patch('/tasks/:id', wrap((req, res) => {
  const u = me(req)
  const cur = ownTask(u, idParam(req))
  const b = parse(zTask.partial().extend({ archived: z.boolean().optional() }), req.body)
  const next: Task = {
    ...cur,
    title: b.title ?? cur.title,
    time: b.time === undefined ? cur.time : b.time,
    days: b.days ?? cur.days,
    remind: b.remind === undefined ? cur.remind : b.remind ? 1 : 0,
    archived: b.archived === undefined ? cur.archived : b.archived ? 1 : 0,
  }
  if (b.title && b.title !== cur.title) next.key = null // user renamed → stop auto-translating
  tx(() => {
    q.run('UPDATE routine_tasks SET title=?, key=?, time=?, days=?, remind=?, archived=? WHERE id=?', next.title, next.key, next.time, next.days, next.remind, next.archived, cur.id)
    syncTaskReminder(u, next)
  })
  emit(u.id, { type: 'tasks:changed' })
  emit(u.id, { type: 'handbook:changed' })
  res.json({ task: ownTask(u, cur.id) })
}))

routineRouter.post('/tasks/:id/complete', wrap((req, res) => {
  const u = me(req)
  completeTask(u, ownTask(u, idParam(req)).id)
  res.json({ ok: true })
}))

routineRouter.delete('/tasks/:id/complete', wrap((req, res) => {
  const u = me(req)
  const t = ownTask(u, idParam(req))
  q.run('DELETE FROM task_completions WHERE task_id = ? AND local_date = ?', t.id, localDate(u.timezone))
  emit(u.id, { type: 'tasks:changed' })
  emit(u.id, { type: 'handbook:changed' })
  res.json({ ok: true })
}))

/** Complete a task by template key (used by Home Simulation objects). Picks the one for the current part of day. */
routineRouter.post('/complete-key', wrap((req, res) => {
  const u = me(req)
  const { keys } = parse(z.object({ keys: z.array(z.string().max(30)).min(1).max(5) }), req.body)
  const now = localNow(u.timezone)
  const candidates = q.all<Task>(
    `SELECT * FROM routine_tasks WHERE user_id = ? AND archived = 0 AND key IN (${keys.map(() => '?').join(',')})`,
    u.id, ...keys,
  ).filter((t) => t.days.includes(String(now.weekday)))
  const task = candidates.find((t) => t.period === periodOfHour(now.hour)) ?? candidates[0]
  if (!task) throw new HttpError(404, 'NO_TASK', 'This activity is not part of your routine.')
  completeTask(u, task.id)
  res.json({ ok: true, task })
}))

/* ---------- Adventure Handbook: today's quests, derived from real activity ---------- */
routineRouter.get('/handbook', (req, res) => {
  const u = me(req)
  const now = localNow(u.timezone)
  const tasks = q.all<Task>('SELECT * FROM routine_tasks WHERE user_id = ? AND archived = 0', u.id).filter((t) => t.days.includes(String(now.weekday)))
  const doneIds = new Set(q.all<{ task_id: number }>('SELECT task_id FROM task_completions WHERE user_id = ? AND local_date = ?', u.id, now.date).map((r) => r.task_id))
  const acts = q.all<{ kind: string; n: number }>('SELECT kind, COUNT(*) n FROM activities WHERE user_id = ? AND local_date = ? GROUP BY kind', u.id, now.date)
  const count = (k: string) => acts.find((a) => a.kind === k)?.n ?? 0

  const quests = (['morning', 'afternoon', 'night'] as Period[]).map((p) => {
    const list = tasks.filter((t) => t.period === p)
    return { id: `routine_${p}`, kind: 'routine', period: p, done: list.filter((t) => doneIds.has(t.id)).length, total: list.length, route: `/routine?p=${p}` }
  }).filter((x) => x.total > 0)

  const extra = [
    { id: 'game', kind: 'game', done: Math.min(count('game_completed'), 1), total: 1, route: '/games' },
    { id: 'song', kind: 'song', done: Math.min(count('song_played'), 1), total: 1, route: '/song' },
    { id: 'companion', kind: 'companion', done: Math.min(count('companion_talk'), 1), total: 1, route: '/companion' },
    { id: 'memory', kind: 'memory', done: Math.min(count('memory_visit'), 1), total: 1, route: '/capsule' },
  ]
  res.json({ date: now.date, currentPeriod: periodOfHour(now.hour), quests: [...quests, ...extra] })
})

routineRouter.post('/activity', wrap((req, res) => {
  const b = parse(z.object({ kind: z.enum(['song_played', 'memory_visit', 'story_listened', 'stimulation', 'simulation_visit']), ref: z.string().max(50).nullable().default(null) }), req.body)
  logActivity(me(req), b.kind, b.ref)
  res.json({ ok: true })
}))
