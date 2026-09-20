/**
 * Monitoring data + observational PDF report.
 * Everything here is computed from stored rows (activities, game_results, remembrance_sessions,
 * remembrance_interactions, monitoring_events). Nothing is estimated or invented, and the wording is
 * deliberately non-clinical: "recorded", "observed in the app", never "improved"/"declined" as health claims.
 */
import { completeJsonPrivate, type JsonSchema } from './ai.ts'
import type { User } from './auth.ts'
import { q } from './db.ts'
import { currentActivity } from './monitor.ts'
import { Pdf, type RGB } from './pdf.ts'
import { isOnline } from './realtime.ts'
import { localDate } from './time.ts'
import { log } from './util.ts'

const AREA_LABELS: Record<string, string> = {
  hub: 'Home screen', remember: 'Remembrance Story', games: 'Games', facilitate: 'Adventure World', routine: 'Daily routine', companion: 'Talking with Lumi',
  capsule: 'Time Capsule', stories: 'Story Time', song: "Today's Song", relax: 'Relax', interact: 'Friends', 'home-sim': 'Home practice', agent: 'Doctor Helper', settings: 'Settings',
}
export const areaLabel = (a: string) => AREA_LABELS[a] ?? a

interface SessionRow { id: number; person_name: string; person_id: number | null; recognition: string | null; started_at: number; completed_at: number | null }

export function monitoringData(patientId: number, daysRaw: number) {
  const days = Math.min(365, Math.max(1, Math.floor(daysRaw) || 30))
  const now = Date.now()
  const since = now - days * 864e5
  const u = q.get<{ display_name: string; timezone: string }>('SELECT display_name, timezone FROM users WHERE id = ?', patientId)!
  const day = (ms: number) => localDate(u.timezone, ms)

  const sessions = q.all<SessionRow>('SELECT id, person_name, person_id, recognition, started_at, completed_at FROM remembrance_sessions WHERE patient_id = ? AND started_at >= ? ORDER BY started_at DESC', patientId, since)
  const inter = q.all<{ session_id: number; response: string; via: string }>(
    `SELECT i.session_id, i.response, i.via FROM remembrance_interactions i JOIN remembrance_sessions s ON s.id = i.session_id WHERE s.patient_id = ? AND s.started_at >= ?`, patientId, since)
  const bySession = new Map<number, { yes: number; no: number; not_sure: number; text: number; voice: number; total: number }>()
  for (const i of inter) {
    const c = bySession.get(i.session_id) ?? { yes: 0, no: 0, not_sure: 0, text: 0, voice: 0, total: 0 }
    c.total++
    if (i.response === 'yes' || i.response === 'no' || i.response === 'not_sure' || i.response === 'text') c[i.response]++
    if (i.via === 'voice') c.voice++
    bySession.set(i.session_id, c)
  }
  const sessionList = sessions.map((s) => ({
    id: s.id, person: s.person_name, recognition: s.recognition, startedAt: s.started_at, completedAt: s.completed_at,
    durationMs: s.completed_at ? s.completed_at - s.started_at : null, responses: bySession.get(s.id) ?? { yes: 0, no: 0, not_sure: 0, text: 0, voice: 0, total: 0 },
  }))

  // Per-day series (patient's local calendar).
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) dates.push(day(now - i * 864e5))
  const series = new Map(dates.map((d) => [d, { date: d, sessions: 0, presented: 0, recognized: 0, activities: 0, games: 0 }]))
  for (const s of sessions) {
    const e = series.get(day(s.started_at)); if (!e) continue
    e.sessions++
    if (s.recognition) { e.presented++; if (s.recognition === 'yes') e.recognized++ }
  }
  const acts = q.all<{ local_date: string; kind: string; n: number }>('SELECT local_date, kind, COUNT(*) n FROM activities WHERE user_id = ? AND created_at >= ? GROUP BY local_date, kind', patientId, since)
  for (const a of acts) { const e = series.get(a.local_date); if (e) { e.activities += a.n; if (a.kind === 'game_completed') e.games += a.n } }
  const activityKinds: Record<string, number> = {}
  for (const a of acts) activityKinds[a.kind] = (activityKinds[a.kind] ?? 0) + a.n

  const games = q.all<{ game: string; level: number; score: number; max_score: number; duration_ms: number; created_at: number }>(
    'SELECT game, level, score, max_score, duration_ms, created_at FROM game_results WHERE user_id = ? AND created_at >= ? ORDER BY id DESC', patientId, since)
  const events = q.all<{ id: number; type: string; meta: string; created_at: number }>('SELECT id, type, meta, created_at FROM monitoring_events WHERE patient_id = ? ORDER BY id DESC LIMIT 60', patientId)
    .map((e) => ({ ...e, meta: JSON.parse(e.meta || '{}') }))

  // Per person: how the first ("do you remember…?") answer was recorded over time.
  const perPerson = new Map<string, { person: string; sessions: number; yes: number; no: number; not_sure: number; last: number }>()
  for (const s of sessions) {
    const k = s.person_name
    const p = perPerson.get(k) ?? { person: k, sessions: 0, yes: 0, no: 0, not_sure: 0, last: 0 }
    p.sessions++
    if (s.recognition === 'yes' || s.recognition === 'no' || s.recognition === 'not_sure') p[s.recognition]++
    p.last = Math.max(p.last, s.started_at)
    perPerson.set(k, p)
  }

  const completed = sessionList.filter((s) => s.durationMs)
  const activeDays = [...series.values()].filter((d) => d.sessions || d.activities).length
  const totals = {
    remembranceSessions: sessions.length,
    completedSessions: completed.length,
    remembranceMinutes: Math.round(completed.reduce((n, s) => n + (s.durationMs ?? 0), 0) / 60000),
    avgSessionMinutes: completed.length ? Math.round(completed.reduce((n, s) => n + (s.durationMs ?? 0), 0) / completed.length / 6000) / 10 : 0,
    recognitionPresented: sessions.filter((s) => s.recognition).length,
    recognitionYes: sessions.filter((s) => s.recognition === 'yes').length,
    responses: inter.length,
    voiceResponses: inter.filter((i) => i.via === 'voice').length,
    textResponses: inter.filter((i) => i.via === 'text').length,
    games: games.length,
    activities: acts.reduce((n, a) => n + a.n, 0),
    activeDays,
  }

  // Change over time: first half vs second half of the period (only when both halves have data).
  const half = Math.floor(dates.length / 2)
  const sum = (arr: typeof dates, k: 'sessions' | 'presented' | 'recognized' | 'activities' | 'games') => arr.reduce((n, d) => n + series.get(d)![k], 0)
  const A = dates.slice(0, half)
  const B = dates.slice(half)
  const rate = (arr: typeof dates) => { const p = sum(arr, 'presented'); return p ? sum(arr, 'recognized') / p : null }
  const changes: { label: string; before: string; after: string; direction: 'up' | 'down' | 'same' }[] = []
  const cmp = (label: string, a: number, b: number, fmt = (n: number) => String(n)) => {
    if (a === 0 && b === 0) return
    changes.push({ label, before: fmt(a), after: fmt(b), direction: b > a ? 'up' : b < a ? 'down' : 'same' })
  }
  if (days >= 4) {
    cmp('Remembrance sessions', sum(A, 'sessions'), sum(B, 'sessions'))
    const ra = rate(A), rb = rate(B)
    if (ra !== null && rb !== null) cmp('"Yes, I remember" answers (share of people shown)', Math.round(ra * 100), Math.round(rb * 100), (n) => `${n}%`)
    cmp('App activities recorded', sum(A, 'activities'), sum(B, 'activities'))
    cmp('Games completed', sum(A, 'games'), sum(B, 'games'))
  }

  return {
    patient: { id: patientId, name: u.display_name, online: isOnline(patientId), current: currentActivity(patientId) },
    period: { days, from: since, to: now },
    totals,
    series: [...series.values()],
    sessions: sessionList.slice(0, 30),
    perPerson: [...perPerson.values()].sort((a, b) => b.last - a.last),
    games: games.slice(0, 15),
    activityKinds,
    changes,
    halves: { firstHalf: { from: A[0], to: A[A.length - 1] }, secondHalf: { from: B[0], to: B[B.length - 1] } },
    events,
  }
}
export type MonitoringData = ReturnType<typeof monitoringData>

/* ======================= AI summary (private model only) ======================= */

const SUMMARY_SCHEMA: JsonSchema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false }

function plainSummary(d: MonitoringData) {
  const t = d.totals
  const parts = [
    `During the ${d.period.days}-day observation period the app recorded ${t.activities} activities on ${t.activeDays} day(s).`,
    t.remembranceSessions ? `${t.remembranceSessions} remembrance session(s) were started and ${t.completedSessions} completed, with ${t.responses} recorded responses (${t.voiceResponses} by voice, ${t.textResponses} typed).` : 'No remembrance sessions were recorded in this period.',
    t.recognitionPresented ? `At the first "Do you remember this person?" question, "yes" was recorded in ${t.recognitionYes} of ${t.recognitionPresented} sessions.` : '',
    t.games ? `${t.games} game(s) were completed.` : '',
    d.changes.length ? `Compared with the first half of the period, the second half recorded: ${d.changes.map((c) => `${c.label.toLowerCase()} ${c.before} -> ${c.after}`).join('; ')}.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

async function aiSummary(d: MonitoringData): Promise<{ text: string; by: string }> {
  // Aggregates only — no memories, names of family members or free-text answers.
  const facts = { periodDays: d.period.days, totals: d.totals, changes: d.changes, perPerson: d.perPerson.map((p, i) => ({ person: `Person ${i + 1}`, sessions: p.sessions, yes: p.yes, no: p.no, notSure: p.not_sure })) }
  try {
    const r = await completeJsonPrivate<{ summary: string }>(
      `You write a short neutral summary (4-6 sentences) of app ACTIVITY data for a family caretaker. Use ONLY the numbers given. Use wording like "recorded", "observed in the app", "engagement trend", "recognition response trend". NEVER diagnose, never mention dementia stages, never say a condition improved or worsened, never give medical advice, never estimate anything not given. Respond as JSON {"summary": string}.`,
      [{ role: 'user', content: JSON.stringify(facts) }], SUMMARY_SCHEMA, 600)
    const s = r.data?.summary?.trim()
    if (s && !/diagnos|dementia (has|is) (improv|wors)|clinical(ly)? (improv|signific)|recover(ed|y)/i.test(s)) return { text: s.slice(0, 1500), by: `AI summary (private model: ${r.via})` }
  } catch (e) {
    log.info('report summary without AI', { reason: (e as Error).message.slice(0, 80) })
  }
  return { text: plainSummary(d), by: 'Automatic summary (computed from recorded data; no AI model was available)' }
}

/* ======================= PDF ======================= */

const INK: RGB = [43, 33, 64]
const SOFT: RGB = [90, 80, 110]
const TEAL: RGB = [31, 138, 126]
const CREAM: RGB = [255, 248, 236]
const LINE: RGB = [220, 214, 228]
const WARN_BG: RGB = [253, 238, 211]
const DISCLAIMER = 'This is an AI-generated observational report based on application activity. It is not a medical diagnosis, clinical assessment, or clinically validated medical report.'

export async function buildReport(patientId: number, days: number, caretaker: User): Promise<Buffer> {
  const d = monitoringData(patientId, days)
  const profile = (() => { try { return JSON.parse(q.get<{ data: string }>('SELECT data FROM patient_profiles WHERE patient_id = ?', patientId)?.data ?? '{}') } catch { return {} } })()
  const summary = await aiSummary(d)
  const tz = q.get<{ timezone: string }>('SELECT timezone FROM users WHERE id = ?', patientId)!.timezone
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(ms)
  const fmtT = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)

  const pdf = new Pdf()
  const M = 48
  const CW = pdf.width - M * 2
  let y = 0
  let page = 1
  const footer = () => {
    pdf.line(M, pdf.height - 40, pdf.width - M, pdf.height - 40, LINE)
    pdf.text(M, pdf.height - 26, 'Recallia Quest - observational activity report - not a medical document', { size: 8, color: SOFT })
    pdf.text(pdf.width - M, pdf.height - 26, `Page ${page}`, { size: 8, color: SOFT, align: 'right' })
  }
  const ensure = (h: number) => { if (y + h > pdf.height - 60) { footer(); pdf.addPage(); page++; y = 56 } }
  const heading = (s: string) => { ensure(90); y += 14; pdf.text(M, y, s, { size: 14, bold: true, color: TEAL }); y += 8; pdf.line(M, y, pdf.width - M, y, LINE); y += 16 }
  const para = (s: string, size = 10.5, color: RGB = INK) => { for (const l of pdf.wrap(s, CW, size)) { ensure(size + 5); pdf.text(M, y, l, { size, color }); y += size + 4.5 } y += 2 }
  const kv = (rows: [string, string][]) => {
    for (const [k, v] of rows) {
      const lines = pdf.wrap(v || '-', CW - 170, 10.5)
      ensure(lines.length * 15 + 4)
      pdf.text(M, y, k, { size: 10.5, bold: true, color: SOFT })
      lines.forEach((l, i) => pdf.text(M + 170, y + i * 15, l, { size: 10.5 }))
      y += lines.length * 15 + 3
    }
  }
  const disclaimerBox = () => {
    const lines = pdf.wrap(DISCLAIMER, CW - 24, 10, true)
    const h = lines.length * 14 + 20
    ensure(h + 6)
    pdf.rect(M, y, CW, h, WARN_BG, [230, 190, 120])
    lines.forEach((l, i) => pdf.text(M + 12, y + 18 + i * 14, l, { size: 10, bold: true, color: [120, 70, 0] }))
    y += h + 12
  }

  // Header band
  pdf.rect(0, 0, pdf.width, 96, INK)
  pdf.text(M, 44, 'Observational Activity Report', { size: 22, bold: true, color: CREAM })
  pdf.text(M, 68, 'Recallia Quest - generated from recorded app activity', { size: 11, color: [230, 224, 245] })
  pdf.text(pdf.width - M, 44, fmt(Date.now()), { size: 11, color: CREAM, align: 'right' })
  y = 120
  disclaimerBox()

  heading('Patient Information')
  const b = profile.basic ?? {}
  kv([
    ['Name', b.fullName || d.patient.name],
    ['Preferred name', b.preferredName || '-'],
    ['Age (as entered)', b.age || '-'],
    ['Languages', b.languages || '-'],
    ['Report requested by', `${caretaker.display_name} (caretaker)`],
  ])

  heading('Observation Period')
  kv([['From', fmt(d.period.from)], ['To', fmt(d.period.to)], ['Length', `${d.period.days} days`], ['Days with recorded activity', String(d.totals.activeDays)]])

  heading('Activity Summary')
  const t = d.totals
  // Stat tiles
  const tiles: [string, string][] = [[String(t.remembranceSessions), 'Remembrance sessions'], [String(t.completedSessions), 'Completed'], [String(t.games), 'Games completed'], [String(t.activities), 'Activities recorded']]
  ensure(70)
  const tw = (CW - 18) / 4
  tiles.forEach(([v, l], i) => {
    const x = M + i * (tw + 6)
    pdf.rect(x, y, tw, 58, [240, 247, 245])
    pdf.text(x + 12, y + 28, v, { size: 20, bold: true, color: TEAL })
    pdf.text(x + 12, y + 46, l, { size: 9, color: SOFT })
  })
  y += 72
  const kinds = Object.entries(d.activityKinds).sort((a, b2) => b2[1] - a[1]).map(([k, n]) => `${k.replace(/_/g, ' ')}: ${n}`).join(', ')
  if (kinds) para(`Recorded activity types: ${kinds}.`, 10, SOFT)

  heading('Engagement')
  kv([
    ['Time in remembrance sessions', `${t.remembranceMinutes} min (completed sessions)`],
    ['Average completed session', `${t.avgSessionMinutes} min`],
    ['Responses recorded', `${t.responses} (${t.voiceResponses} voice, ${t.textResponses} typed, ${t.responses - t.voiceResponses - t.textResponses} buttons)`],
  ])
  // Daily activity bars
  const maxAct = Math.max(1, ...d.series.map((s) => s.activities + s.sessions))
  ensure(110)
  pdf.text(M, y, 'Recorded activity per day', { size: 10, bold: true, color: SOFT }); y += 8
  const bw = CW / d.series.length
  pdf.line(M, y + 80, M + CW, y + 80, LINE)
  d.series.forEach((s, i) => {
    const v = s.activities + s.sessions
    const h = (v / maxAct) * 72
    if (h > 0) pdf.rect(M + i * bw + bw * 0.15, y + 80 - h, Math.max(1, bw * 0.7), h, TEAL)
  })
  pdf.text(M, y + 94, d.series[0]?.date ?? '', { size: 8, color: SOFT })
  pdf.text(M + CW, y + 94, d.series[d.series.length - 1]?.date ?? '', { size: 8, color: SOFT, align: 'right' })
  pdf.text(M + CW, y + 6, `max ${maxAct}/day`, { size: 8, color: SOFT, align: 'right' })
  y += 110

  heading('Recognition Responses')
  para('At the start of each remembrance session the app shows a photo and asks "Do you remember this person?". These are the recorded answers. They describe responses in the app only.', 10, SOFT)
  if (!d.perPerson.length) para('No remembrance sessions were recorded in this period.')
  else {
    ensure(24)
    const cols = [M, M + 200, M + 280, M + 340, M + 400, M + 470]
    ;['Person', 'Sessions', 'Yes', 'No', 'Not sure', 'Last'].forEach((h, i) => pdf.text(cols[i], y, h, { size: 9.5, bold: true, color: SOFT }))
    y += 6; pdf.line(M, y, M + CW, y, LINE); y += 14
    for (const p of d.perPerson.slice(0, 20)) {
      ensure(16)
      pdf.text(cols[0], y, p.person.slice(0, 32), { size: 10 })
      pdf.text(cols[1], y, String(p.sessions), { size: 10 })
      pdf.text(cols[2], y, String(p.yes), { size: 10 })
      pdf.text(cols[3], y, String(p.no), { size: 10 })
      pdf.text(cols[4], y, String(p.not_sure), { size: 10 })
      pdf.text(cols[5], y, fmt(p.last), { size: 9, color: SOFT })
      y += 16
    }
    y += 4
  }

  heading('Changes Over Time')
  if (!d.changes.length) para('Not enough recorded data in both halves of the period to compare.', 10.5, SOFT)
  else {
    para(`Comparing ${d.halves.firstHalf.from} to ${d.halves.firstHalf.to} with ${d.halves.secondHalf.from} to ${d.halves.secondHalf.to} (recorded counts, not health measures):`, 10, SOFT)
    for (const c of d.changes) { ensure(16); pdf.text(M + 8, y, `- ${c.label}: ${c.before} -> ${c.after}`, { size: 10.5 }); y += 16 }
  }

  heading('Recent Sessions')
  if (!d.sessions.length) para('None recorded.', 10.5, SOFT)
  for (const s of d.sessions.slice(0, 12)) {
    ensure(16)
    const r = s.responses
    pdf.text(M, y, `${fmtT(s.startedAt)} - ${s.person}`, { size: 10 })
    pdf.text(M + 260, y, `first answer: ${s.recognition?.replace('_', ' ') ?? '-'} | yes ${r.yes} / no ${r.no} / not sure ${r.not_sure}${s.durationMs ? ` | ${Math.max(1, Math.round(s.durationMs / 60000))} min` : ' | not finished'}`, { size: 9, color: SOFT })
    y += 16
  }

  heading('AI Summary')
  para(summary.text)
  para(summary.by, 9, SOFT)

  heading('Important Notice')
  disclaimerBox()
  para('Figures come only from what was recorded while the app was used; days without use are not observations of the person. Please discuss any health concerns with a qualified professional.', 10, SOFT)
  footer()
  return pdf.toBuffer()
}
