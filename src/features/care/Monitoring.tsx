import { AnimatePresence, motion } from 'framer-motion'
import { Activity, Download, FileText, Gamepad2, Heart, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '../../api/useApi'
import { ErrorView, Loading } from '../../components/ui'
import { useLive } from '../../state/realtime'
import { areaLabel } from './types'

interface Monitor {
  patient: { id: number; name: string; online: boolean; current: { area: string; since: number } | null }
  period: { days: number; from: number; to: number }
  totals: { remembranceSessions: number; completedSessions: number; remembranceMinutes: number; avgSessionMinutes: number; recognitionPresented: number; recognitionYes: number; responses: number; voiceResponses: number; textResponses: number; games: number; activities: number; activeDays: number }
  series: { date: string; sessions: number; presented: number; recognized: number; activities: number; games: number }[]
  sessions: { id: number; person: string; recognition: string | null; startedAt: number; completedAt: number | null; durationMs: number | null; responses: { yes: number; no: number; not_sure: number; text: number; voice: number; total: number } }[]
  perPerson: { person: string; sessions: number; yes: number; no: number; not_sure: number; last: number }[]
  games: { game: string; level: number; score: number; max_score: number; created_at: number }[]
  changes: { label: string; before: string; after: string; direction: 'up' | 'down' | 'same' }[]
  events: { id: number | null; type: string; meta: Record<string, unknown>; created_at: number }[]
}
type Live = { id: number | null; type: string; meta: Record<string, unknown>; created_at: number }

const time = (ms: number) => new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const ANSWER: Record<string, string> = { yes: 'Yes', no: 'No', not_sure: 'Not sure', text: 'Answered in own words', listened: 'Listened to audio', skip: 'Skipped' }

function describe(e: Live): string {
  const m = e.meta as Record<string, string | number | null>
  switch (e.type) {
    case 'area': return `Opened ${m.label ?? areaLabel(String(m.area))}`
    case 'remembrance_started': return `Started a remembrance story about ${m.person}`
    case 'remembrance_response': return `${m.stepType === 'recognition' ? `"Do you remember ${m.person}?"` : m.prompt ? `"${m.prompt}"` : 'Story step'} → ${ANSWER[String(m.response)] ?? m.response}${m.text ? `: "${m.text}"` : ''}${m.via === 'voice' ? ' (voice)' : m.via === 'text' ? ' (typed)' : ''}`
    case 'remembrance_completed': return `Finished the story about ${m.person} — yes ${m.yes}, no ${m.no}, not sure ${m.notSure}`
    case 'activity': return `Activity: ${String(m.kind).replace(/_/g, ' ')}${m.ref ? ` (${m.ref})` : ''}`
    case 'profile_created': return 'Profile created'
    default: return e.type.replace(/_/g, ' ')
  }
}

/** What is happening on the patient's side — live, plus simple history from stored data only. */
export default function Monitoring({ pid, patientName }: { pid: number; patientName: string }) {
  const [days, setDays] = useState(30)
  const { data, error, loading, reload } = useApi<Monitor>(`/care/patients/${pid}/monitor?days=${days}`)
  const [live, setLive] = useState<Live[]>([])
  useLive(['monitor', 'presence'], (e) => {
    if (e.type === 'monitor' && e.patientId === pid) {
      setLive((l) => [e.event as Live, ...l].slice(0, 30))
      const t = (e.event as Live).type
      if (t === 'remembrance_completed' || t === 'area' || t === 'remembrance_started') void reload()
    } else if (e.type === 'presence' && e.userId === pid) void reload()
    else if (e.type === 'resync') void reload()
  })

  if (error) return <ErrorView error={error} onRetry={reload} />
  if (loading || !data) return <Loading />
  const t = data.totals
  const current = data.patient.online ? data.patient.current : null
  const liveIds = new Set(live.map((l) => l.id).filter(Boolean))
  const feed = [...live, ...data.events.filter((e) => !liveIds.has(e.id))].slice(0, 25)
  const maxAct = Math.max(1, ...data.series.map((s) => s.activities + s.sessions))

  return (
    <div className="space-y-6">
      {/* Now */}
      <section className={`flex flex-wrap items-center gap-4 rounded-[28px] p-5 ${data.patient.online ? 'bg-teal/10' : 'bg-white'}`}>
        <span className="relative grid size-14 place-items-center rounded-full bg-white">
          <Activity className={data.patient.online ? 'text-teal' : 'text-ink-soft'} aria-hidden />
          {data.patient.online && <span aria-hidden className="absolute right-1 top-1 size-3 animate-ping rounded-full bg-teal" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold">{data.patient.online ? (current ? `${patientName} is currently using ${areaLabel(current.area)}` : `${patientName}'s device is connected`) : `${patientName} is not using Recallia right now`}</p>
          {current && <p className="text-base text-ink-soft">since {new Date(current.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-base font-bold">Period
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-2 min-h-12 rounded-full border-2 border-ink/10 bg-white px-3">
              <option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
            </select>
          </label>
          <a href={`/api/care/patients/${pid}/report.pdf?days=${days}`} download className="inline-flex min-h-14 items-center gap-2 rounded-full bg-ink px-6 text-lg font-bold text-cream"><FileText aria-hidden /> Generate Report</a>
        </div>
      </section>

      {/* Summary tiles */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Heart} value={t.remembranceSessions} label="Remembrance sessions" sub={`${t.completedSessions} finished · ${t.remembranceMinutes} min`} />
        <Tile icon={Heart} value={t.recognitionPresented ? `${t.recognitionYes}/${t.recognitionPresented}` : '—'} label='"Yes, I remember" at the first photo' sub="recorded answers" />
        <Tile icon={Gamepad2} value={t.games} label="Games completed" sub={`${t.activities} activities in total`} />
        <Tile icon={Activity} value={t.activeDays} label="Days with activity" sub={`of the last ${data.period.days}`} />
      </ul>

      {/* Activity chart */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <h4 className="text-xl font-bold">Recorded activity per day</h4>
        <div className="mt-4 flex h-36 items-end gap-[2px]" role="img" aria-label={`Activity per day over ${data.period.days} days, highest ${maxAct}`}>
          {data.series.map((s) => {
            const v = s.activities + s.sessions
            return (
              <div key={s.date} className="group relative flex-1">
                <div className={`w-full rounded-t ${s.sessions ? 'bg-coral' : 'bg-teal'}`} style={{ height: `${Math.max(v ? 4 : 0, (v / maxAct) * 136)}px` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs text-cream group-hover:block">{s.date}: {s.activities} activities, {s.sessions} stories</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 flex justify-between text-sm text-ink-soft"><span>{data.series[0]?.date}</span><span><span className="inline-block size-3 rounded bg-coral align-middle" /> days with a remembrance story</span><span>{data.series.at(-1)?.date}</span></p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recognition by person */}
        <section className="rounded-[28px] bg-white p-5 shadow-sm">
          <h4 className="text-xl font-bold">Recognition responses</h4>
          <p className="text-sm text-ink-soft">Answers to "Do you remember this person?" — recorded in the app, not a medical measure.</p>
          {data.perPerson.length === 0 && <p className="mt-3 text-lg text-ink-soft">No remembrance stories yet.</p>}
          <ul className="mt-3 space-y-3">
            {data.perPerson.map((p) => (
              <li key={p.person}>
                <p className="flex justify-between text-lg font-bold"><span>{p.person}</span><span className="text-base text-ink-soft">{p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}</span></p>
                <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-ink/10" aria-label={`yes ${p.yes}, not sure ${p.not_sure}, no ${p.no}`}>
                  <div className="bg-teal" style={{ width: `${(p.yes / p.sessions) * 100}%` }} />
                  <div className="bg-amber" style={{ width: `${(p.not_sure / p.sessions) * 100}%` }} />
                  <div className="bg-coral/70" style={{ width: `${(p.no / p.sessions) * 100}%` }} />
                </div>
                <p className="text-sm text-ink-soft">yes {p.yes} · not sure {p.not_sure} · no {p.no}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Changes */}
        <section className="rounded-[28px] bg-white p-5 shadow-sm">
          <h4 className="text-xl font-bold">Observed changes</h4>
          <p className="text-sm text-ink-soft">First half of the period compared with the second half. Counts of app activity only.</p>
          {data.changes.length === 0 && <p className="mt-3 text-lg text-ink-soft">Not enough recorded activity yet to compare.</p>}
          <ul className="mt-3 space-y-2">
            {data.changes.map((c) => (
              <li key={c.label} className="flex items-center gap-3 rounded-2xl bg-cream p-3 text-lg">
                {c.direction === 'up' ? <TrendingUp className="text-teal" aria-hidden /> : c.direction === 'down' ? <TrendingDown className="text-coral" aria-hidden /> : <Minus aria-hidden />}
                <span className="flex-1">{c.label}</span><b>{c.before} → {c.after}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Timeline */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <h4 className="flex items-center gap-2 text-xl font-bold">Timeline {live.length > 0 && <span className="rounded-full bg-teal/15 px-3 py-0.5 text-sm text-teal">live</span>}</h4>
        {feed.length === 0 && <p className="mt-3 text-lg text-ink-soft">Nothing recorded yet. Activity appears here as it happens.</p>}
        <ol className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {feed.map((e, i) => (
              <motion.li key={`${e.id ?? 'l'}-${e.created_at}-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-3 border-l-4 border-teal/30 pl-3">
                <span className="w-28 shrink-0 text-sm text-ink-soft">{time(e.created_at)}</span>
                <span className="text-base">{describe(e)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </section>

      {/* Sessions */}
      <section className="rounded-[28px] bg-white p-5 shadow-sm">
        <h4 className="text-xl font-bold">Recent remembrance sessions</h4>
        {data.sessions.length === 0 && <p className="mt-3 text-lg text-ink-soft">None yet.</p>}
        <ul className="mt-3 divide-y-2 divide-ink/5">
          {data.sessions.slice(0, 12).map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-base">
              <span className="w-36 text-ink-soft">{time(s.startedAt)}</span>
              <span className="font-bold">{s.person}</span>
              <span>first answer: <b>{s.recognition ? ANSWER[s.recognition] : '—'}</b></span>
              <span className="text-ink-soft">yes {s.responses.yes} · no {s.responses.no} · not sure {s.responses.not_sure}{s.responses.voice ? ` · ${s.responses.voice} by voice` : ''}</span>
              <span className="ml-auto text-ink-soft">{s.durationMs ? `${Math.max(1, Math.round(s.durationMs / 60000))} min` : 'not finished'}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.games.length > 0 && (
        <section className="rounded-[28px] bg-white p-5 shadow-sm">
          <h4 className="text-xl font-bold">Games</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {data.games.slice(0, 8).map((g, i) => <li key={i} className="rounded-2xl bg-cream p-3 text-base"><b className="capitalize">{g.game.replace(/-/g, ' ')}</b> · level {g.level} · {g.score}/{g.max_score} <span className="text-ink-soft">· {time(g.created_at)}</span></li>)}
          </ul>
        </section>
      )}

      <p className="flex items-start gap-2 text-sm text-ink-soft"><Download size={16} className="mt-0.5 shrink-0" aria-hidden /> The report is generated from this stored activity. It is an observational summary of app use — not a medical diagnosis or clinical assessment.</p>
    </div>
  )
}

function Tile({ icon: I, value, label, sub }: { icon: typeof Heart; value: number | string; label: string; sub: string }) {
  return (
    <li className="rounded-[24px] bg-white p-4 shadow-sm">
      <I className="text-teal" size={22} aria-hidden />
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="text-base font-bold">{label}</p>
      <p className="text-sm text-ink-soft">{sub}</p>
    </li>
  )
}
