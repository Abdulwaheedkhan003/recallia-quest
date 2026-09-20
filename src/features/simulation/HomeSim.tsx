import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BellPlus, Check, Clock, Home, Pill, Volume2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useApi } from '../../api/useApi'
import { Loading } from '../../components/ui'
import { api, type ApiError } from '../../api/client'
import type { Reminder, RoutineData, Task } from '../../api/types'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { Button, ErrorView } from '../../components/ui'

const UnrealHome = lazy(() => import('./UnrealHome'))
const Home3D = lazy(() => import('./sim3d/Walkthrough'))
import { fmtDateTime, fmtTime } from '../../lib/format'
import { navigate } from '../../lib/router'
import { speak } from '../../lib/speech'
import { useSettings } from '../../state/settings'
import { useTaskTitle } from '../routine/Routine'
import { ROOMS, type Room, type SimAction, type SimObject } from './rooms'

const LAYOUT = [['bedroom', 'bathroom', 'toilet', 'medicine'], ['living', 'kitchen', 'dining', 'entrance'], ['hallway', 'laundry', 'study', 'garden']]

export default function HomeSim() {
  const { t } = useSettings()
  const [room, setRoom] = useState<Room | null>(null)
  const { data: cfg } = useApi<{ unrealSignallingUrl: string | null }>('/sim/config')
  const [view, setMode] = useState<'3d' | '2d' | 'unreal'>('3d')
  const modes = (cfg?.unrealSignallingUrl ? ['3d', 'unreal', '2d'] : ['3d', '2d']) as ('3d' | '2d' | 'unreal')[]

  return (
    <AppShell title={t('area.sim')} icon={<Home className="text-[#2563eb]" aria-hidden />} home={room ? '/home-sim' : '/facilitate'} homeLabel={t('shell.world')} tone="bg-[linear-gradient(180deg,#cfe8ff,#fff8ec)]">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3" role="group" aria-label={t('sim.view')}>
        {modes.map((m) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={view === m}
            className={`min-h-14 rounded-full px-6 text-lg font-bold ${view === m ? 'bg-ink text-cream' : 'bg-white shadow-sm'}`}>
            {m === '3d' ? t('sim.home3d') : m === 'unreal' ? t('sim.unreal3d') : t('sim.simple2d')}
          </button>
        ))}
      </div>
      {view === 'unreal' && cfg?.unrealSignallingUrl ? (
        <Suspense fallback={<Loading />}><UnrealHome signallingUrl={cfg.unrealSignallingUrl} /></Suspense>
      ) : view === '3d' ? (
        <Suspense fallback={<Loading />}><Home3D /></Suspense>
      ) : (
      <AnimatePresence mode="wait">
        {!room ? (
          <motion.div key="house" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
            <p className="mb-4 text-center text-xl text-ink-soft">{t('sim.intro')}</p>
            {/* Dollhouse cut-away */}
            <div className="mx-auto max-w-4xl">
              <div aria-hidden className="mx-auto h-24 w-[92%] bg-[#c2410c] [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
              <div className="space-y-3 rounded-b-[24px] bg-[#8a5a12] p-3 shadow-2xl">
                {LAYOUT.map((row, r) => (
                  <div key={r} className={`grid gap-3 ${'grid-cols-2 sm:grid-cols-4'}`}>
                    {row.map((id) => {
                      const rm = ROOMS.find((x) => x.id === id)!
                      return (
                        <motion.button key={id} layoutId={`room-${id}`} onClick={() => setRoom(rm)} whileHover={{ y: -4 }}
                          className="relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-2xl text-center shadow-inner" style={{ background: `linear-gradient(180deg, ${rm.wall} 60%, ${rm.floor} 60%)` }}>
                          <span className="text-5xl sm:text-6xl" aria-hidden>{rm.emoji}</span>
                          <span className="mt-1 rounded-full bg-white/90 px-3 py-1 text-base font-bold sm:text-lg">{t(rm.label)}</span>
                        </motion.button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <RoomView key={room.id} room={room} onBack={() => setRoom(null)} />
        )}
      </AnimatePresence>
      )}
    </AppShell>
  )
}

function RoomView({ room, onBack }: { room: Room; onBack: () => void }) {
  const { t, lang } = useSettings()
  const [sel, setSel] = useState<SimObject | null>(null)
  useEffect(() => { api.post('/routine/activity', { kind: 'simulation_visit', ref: room.id }).catch(() => {}) }, [room.id])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="mb-3 flex items-center gap-3">
          <Button variant="secondary" onClick={onBack}><ArrowLeft aria-hidden /> {t('sim.house')}</Button>
          <h2 className="text-3xl font-bold">{room.emoji} {t(room.label)}</h2>
        </div>
        {/* 2.5D room: back wall, perspective floor, objects placed in depth */}
        <motion.div layoutId={`room-${room.id}`} className="relative aspect-[16/11] overflow-hidden rounded-[36px] shadow-2xl" style={{ background: room.wall }}>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[45%]" style={{ background: room.floor, clipPath: 'polygon(10% 0, 90% 0, 100% 100%, 0 100%)' }} />
          <div aria-hidden className="absolute bottom-0 left-0 h-[45%] w-[10%] bg-black/10" style={{ clipPath: 'polygon(100% 0, 100% 0, 0 100%, 0 100%)' }} />
          <div aria-hidden className="absolute bottom-[45%] inset-x-[10%] h-2 bg-black/10" />
          <div aria-hidden className="absolute left-[8%] top-[10%] h-[28%] w-[16%] rounded-xl bg-sky/80 ring-8 ring-white/80" />
          {room.objects.map((o) => {
            const active = sel?.id === o.id
            const depth = 0.75 + (o.y / 100) * 0.5
            return (
              <motion.button key={o.id} onClick={() => { setSel(o); speak(t(o.label), lang).catch(() => {}) }} aria-pressed={active}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${o.x}%`, top: `${o.y}%`, zIndex: Math.round(o.y) }}
                whileHover={{ scale: 1.12 }} whileFocus={{ scale: 1.12 }} animate={{ scale: active ? 1.18 : 1 }}>
                <span className={`grid place-items-center rounded-full transition ${active ? 'bg-amber/40 shadow-[0_0_0_8px_rgba(245,165,36,0.5)]' : 'bg-white/40 hover:bg-white/70'}`}
                  style={{ fontSize: `${(o.size ?? 5) * depth}vmin`, width: `${(o.size ?? 5) * depth * 1.5}vmin`, height: `${(o.size ?? 5) * depth * 1.5}vmin` }} aria-hidden>{o.emoji}</span>
                <span className={`mt-1 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold shadow sm:text-base ${active ? 'bg-ink text-cream' : 'bg-white/95'}`}>{t(o.label)}</span>
              </motion.button>
            )
          })}
        </motion.div>
      </div>
      <aside aria-live="polite">
        {sel ? <ObjectPanel key={sel.id} o={sel} /> : (
          <div className="flex flex-col items-center rounded-[32px] bg-white/80 p-6 text-center">
            <Mascot size={130} mood="explaining" label="" />
            <p className="mt-3 text-2xl font-bold">{t('sim.tapSomething')}</p>
          </div>
        )}
      </aside>
    </motion.div>
  )
}

export function ObjectPanel({ o, onResult }: { o: SimObject; onResult?: (ok: boolean, message: string) => void }) {
  const { t, lang } = useSettings()
  const taskTitle = useTaskTitle()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<ApiError | null>(null)
  const [meds, setMeds] = useState<{ tasks: Task[]; done: Set<number> } | null>(null)
  const steps = o.steps ? t(o.steps).split('|') : []

  const ok = (m: string) => { setMsg(m); setErr(null); onResult?.(true, m); speak(m, lang).catch(() => {}) }

  const run = async (a: SimAction) => {
    try {
      if (a.type === 'go') return navigate(a.route)
      if (a.type === 'time') return ok(t('sim.timeNow', { time: fmtTime(Date.now(), lang) }))
      if (a.type === 'complete' || a.type === 'meal') {
        const h = new Date().getHours()
        const keys = a.type === 'meal' ? [h < 11 ? 'breakfast' : h < 17 ? 'lunch' : 'dinner'] : a.keys
        const r = await api.post<{ task: Task }>('/routine/complete-key', { keys })
        return ok(t('sim.markedDone', { task: taskTitle(r.task) }))
      }
      if (a.type === 'remind') {
        const now = new Date()
        let when = new Date(now.getTime() + (a.inMinutes ?? 0) * 60_000)
        if (a.at) {
          const [hh, mm] = a.at.split(':').map(Number)
          when = new Date(now); when.setHours(hh, mm, 0, 0)
          if (when <= now) when.setDate(when.getDate() + 1)
        }
        const pad = (n: number) => String(n).padStart(2, '0')
        const r = await api.post<{ reminder: Reminder }>('/reminders', {
          text: t(a.text),
          time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
          date: a.daily ? null : `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
          recurrence: a.daily ? 'daily' : 'none',
        })
        return ok(t('sim.reminderSet', { when: fmtDateTime(r.reminder.next_fire_at ?? when.getTime(), lang) }))
      }
      if (a.type === 'meds') {
        const r = await api.get<RoutineData>('/routine')
        setMeds({ tasks: r.tasks.filter((x) => x.is_medication && x.days.includes(String(r.weekday))), done: new Set(r.completions.map((c) => c.task_id)) })
      }
    } catch (e) {
      setErr(e as ApiError)
      setMsg(null)
      onResult?.(false, (e as ApiError).code)
    }
  }

  const takeMed = async (task: Task) => {
    try {
      await api.post(`/routine/tasks/${task.id}/complete`)
      setMeds((m) => m && { ...m, done: new Set(m.done).add(task.id) })
      ok(t('sim.markedDone', { task: task.title }))
    } catch (e) { setErr(e as ApiError) }
  }

  const label = (a: SimAction): { text: string; icon: typeof Check } => {
    switch (a.type) {
      case 'go': return { text: t('sim.open'), icon: ArrowLeft }
      case 'time': return { text: t('sim.sayTime'), icon: Clock }
      case 'remind': return { text: t(a.text), icon: BellPlus }
      case 'meds': return { text: t('sim.showMeds'), icon: Pill }
      default: return { text: t('sim.didIt'), icon: Check }
    }
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="rounded-[32px] bg-white p-6 shadow-xl">
      <div className="flex items-center gap-4">
        <span className="grid size-24 place-items-center rounded-3xl bg-amber/20 text-6xl" aria-hidden>{o.emoji}</span>
        <h3 className="text-3xl font-bold">{t(o.label)}</h3>
      </div>
      <p className="mt-4 text-xl">{t(o.info)}</p>
      {steps.length > 0 && (
        <>
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }} className="flex items-center gap-3 rounded-2xl bg-cream p-3 text-xl">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-bold text-cream">{i + 1}</span>{s}
              </motion.li>
            ))}
          </ol>
          <Button variant="secondary" className="mt-3" onClick={() => speak(steps.join('. '), lang).catch(() => {})}><Volume2 aria-hidden /> {t('sim.readSteps')}</Button>
        </>
      )}
      <div className="mt-5 grid gap-3">
        {o.actions.map((a, i) => { const l = label(a); return <Button key={i} big variant={a.type === 'complete' || a.type === 'meal' ? 'success' : 'primary'} onClick={() => run(a)}><l.icon aria-hidden /> {l.text}</Button> })}
      </div>
      {meds && (
        meds.tasks.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-lavender/10 p-4">
            <p className="text-lg font-bold">{t('sim.noMeds')}</p>
            <Button variant="secondary" className="mt-2" onClick={() => navigate('/routine')}>{t('area.routine')}</Button>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {meds.tasks.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-cream p-3">
                <Pill className="text-[#be185d]" aria-hidden /><span className="flex-1 text-lg font-bold">{m.title}{m.time && ` · ${m.time}`}</span>
                {meds.done.has(m.id) ? <span className="font-bold text-teal">✓ {t('routine.doneLabel')}</span> : <Button variant="success" onClick={() => takeMed(m)}>{t('sim.taken')}</Button>}
              </li>
            ))}
          </ul>
        )
      )}
      {msg && <p role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-leaf/20 p-4 text-xl font-bold text-teal"><Check aria-hidden /> {msg}</p>}
      {err && <div className="mt-4">{err.code === 'NO_TASK' ? <p className="rounded-2xl bg-amber/20 p-4 text-lg font-bold">{t('sim.notInRoutine')}</p> : <ErrorView error={err} />}</div>}
    </motion.div>
  )
}
