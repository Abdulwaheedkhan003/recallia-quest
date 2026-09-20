/** Timezone helpers built on Intl — no dependencies. */

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function parts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  })
  const o: Record<string, string> = {}
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value
  return {
    y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, s: +o.second,
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday),
  }
}

/** Offset (ms) of tz from UTC at the given instant. */
function offset(ms: number, tz: string) {
  const p = parts(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000
}

/** Convert a wall-clock time in tz to a UTC timestamp. */
export function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess - offset(guess, tz)
  const o2 = offset(t, tz)
  t = guess - o2
  return t
}

export function localDate(tz: string, ms = Date.now()) {
  const p = parts(ms, tz)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export function localNow(tz: string, ms = Date.now()) {
  const p = parts(ms, tz)
  return { date: localDate(tz, ms), time: `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`, weekday: p.wd, hour: p.h }
}

export function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

const weekdayOf = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay()

export interface Schedule {
  date: string | null
  time: string
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly'
  days: string
  timezone: string
}

/** Next UTC fire time strictly after `after`, or null when a one-off is in the past. */
export function nextFire(s: Schedule, after = Date.now()): number | null {
  if (s.recurrence === 'none') {
    if (!s.date) return null
    const t = zonedToUtc(s.date, s.time, s.timezone)
    return t > after ? t : null
  }
  const today = localDate(s.timezone, after)
  for (let i = 0; i < 9; i++) {
    const day = addDays(today, i)
    const wd = weekdayOf(day)
    if (s.recurrence === 'weekdays' && (wd === 0 || wd === 6)) continue
    if (s.recurrence === 'weekly' && !s.days.includes(String(wd))) continue
    const t = zonedToUtc(day, s.time, s.timezone)
    if (t > after) return t
  }
  return null
}
