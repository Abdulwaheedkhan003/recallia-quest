import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Moon, Pencil, Pill, Plus, Sun, Sunset, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import type { Period, RoutineData, Task } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import TaskIcon, { ICON_CHOICES } from '../../components/TaskIcon'
import { Button, ErrorView, Field, inputCls, Loading, Progress, Sheet, Toggle } from '../../components/ui'
import { fmtHHMM } from '../../lib/format'
import { useRoute } from '../../lib/router'
import { speak } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'

const PERIODS: { id: Period; icon: typeof Sun; tone: string; bg: string }[] = [
  { id: 'morning', icon: Sun, tone: 'bg-amber', bg: 'bg-[linear-gradient(180deg,#ffe7b8,#fff8ec)]' },
  { id: 'afternoon', icon: Sunset, tone: 'bg-coral', bg: 'bg-[linear-gradient(180deg,#ffd6c4,#fff8ec)]' },
  { id: 'night', icon: Moon, tone: 'bg-lavender', bg: 'bg-[linear-gradient(180deg,#dcd6ff,#f4f1ff)]' },
]

export function useTaskTitle() {
  const { t } = useSettings()
  return (task: Pick<Task, 'key' | 'title'>) => {
    if (!task.key) return task.title
    const k = `task.${task.key}` as TKey
    const v = t(k)
    return v === k ? task.title : v
  }
}

export default function Routine() {
  const { t, lang } = useSettings()
  const title = useTaskTitle()
  const { query } = useRoute()
  const { data, error, loading, reload } = useApi<RoutineData>('/routine', ['tasks:changed'])
  const [period, setPeriod] = useState<Period | null>((query.get('p') as Period) || null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<ApiError | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => { if (!period && data) setPeriod(data.currentPeriod) }, [data, period])

  const doneIds = useMemo(() => new Set(data?.completions.map((c) => c.task_id)), [data])
  const today = data ? String(data.weekday) : ''
  const list = useMemo(() => (data?.tasks ?? []).filter((x) => x.period === period && x.days.includes(today)), [data, period, today])
  const notToday = useMemo(() => (data?.tasks ?? []).filter((x) => x.period === period && !x.days.includes(today)), [data, period, today])

  // Jump to the first unfinished task when the list changes.
  useEffect(() => {
    const first = list.findIndex((x) => !doneIds.has(x.id))
    setIndex(first === -1 ? 0 : first)
  }, [period, list.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = list[Math.min(index, list.length - 1)]
  const doneCount = list.filter((x) => doneIds.has(x.id)).length
  const P = PERIODS.find((p) => p.id === period) ?? PERIODS[0]

  const toggle = async (task: Task) => {
    setBusy(true)
    setActionError(null)
    try {
      if (doneIds.has(task.id)) await api.del(`/routine/tasks/${task.id}/complete`)
      else {
        await api.post(`/routine/tasks/${task.id}/complete`)
        setCelebrate(true)
        speak(t('routine.wellDone'), lang).catch(() => {})
        setTimeout(() => setCelebrate(false), 1800)
        const nextIdx = list.findIndex((x, i) => i > index && !doneIds.has(x.id))
        if (nextIdx !== -1) setTimeout(() => setIndex(nextIdx), 1200)
      }
      await reload()
    } catch (e) {
      setActionError(e as ApiError)
    } finally {
      setBusy(false)
    }
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80) setIndex((i) => Math.min(list.length - 1, i + 1))
    if (info.offset.x > 80) setIndex((i) => Math.max(0, i - 1))
  }

  return (
    <AppShell title={t('area.routine')} icon={<P.icon className="text-amber-deep" aria-hidden />} home="/facilitate" homeLabel={t('shell.world')} tone={P.bg}>
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {data && period && (
        <>
          <div role="tablist" aria-label={t('routine.partOfDay')} className="grid grid-cols-3 gap-2 rounded-full bg-white/70 p-1.5">
            {PERIODS.map((p) => (
              <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}
                className={`flex min-h-16 items-center justify-center gap-2 rounded-full text-lg font-bold transition sm:text-xl ${period === p.id ? `${p.tone} text-white shadow` : 'text-ink-soft'}`}>
                <p.icon aria-hidden /> {t(`routine.${p.id}` as TKey)}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <div className="flex-1"><Progress value={doneCount} max={list.length || 1} label={t('routine.progress')} /></div>
            <p className="text-lg font-bold">{t('handbook.steps', { done: doneCount, total: list.length })}</p>
          </div>

          {actionError && <div className="mt-4"><ErrorView error={actionError} /></div>}

          {list.length === 0 ? (
            <p className="mt-10 text-center text-xl text-ink-soft">{t('routine.empty')}</p>
          ) : (
            <>
              {/* Current step — swipe or use the arrows */}
              <div className="relative mt-6 flex items-center gap-3">
                <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} aria-label={t('common.previous')}
                  className="grid size-16 shrink-0 place-items-center rounded-full bg-white shadow disabled:opacity-30"><ChevronLeft size={36} /></button>
                <AnimatePresence mode="wait">
                  {current && (
                    <motion.article key={current.id} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.4} onDragEnd={onDragEnd}
                      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
                      className={`relative flex-1 cursor-grab touch-pan-y rounded-[40px] p-8 text-center shadow-xl ${doneIds.has(current.id) ? 'bg-leaf/20 ring-4 ring-leaf' : 'bg-white'}`}>
                      <span className={`mx-auto grid size-28 place-items-center rounded-[32px] text-white ${current.is_medication ? 'bg-[#be185d]' : P.tone}`}>
                        <TaskIcon name={current.icon} size={60} />
                      </span>
                      <h2 className="mt-5 text-4xl font-bold">{title(current)}</h2>
                      {current.time && <p className="mt-1 text-xl font-bold text-ink-soft">{fmtHHMM(current.time, lang)}</p>}
                      <Button big variant={doneIds.has(current.id) ? 'secondary' : 'success'} busy={busy} className="mt-6 min-w-[240px]" onClick={() => toggle(current)}>
                        {doneIds.has(current.id) ? <><Undo2 aria-hidden /> {t('routine.undo')}</> : <><Check size={28} aria-hidden /> {t('routine.markDone')}</>}
                      </Button>
                      {doneIds.has(current.id) && <p className="mt-3 flex items-center justify-center gap-2 text-xl font-bold text-teal"><Check aria-hidden /> {t('routine.doneLabel')}</p>}
                    </motion.article>
                  )}
                </AnimatePresence>
                <button onClick={() => setIndex((i) => Math.min(list.length - 1, i + 1))} disabled={index >= list.length - 1} aria-label={t('common.next')}
                  className="grid size-16 shrink-0 place-items-center rounded-full bg-white shadow disabled:opacity-30"><ChevronRight size={36} /></button>

                <AnimatePresence>
                  {celebrate && (
                    <motion.div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Mascot size={180} mood="celebrating" label="" />
                      {Array.from({ length: 14 }).map((_, i) => (
                        <motion.span key={i} className="absolute text-3xl"
                          initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(i) * 220, y: Math.sin(i * 1.7) * 160, opacity: 0, rotate: 180 }} transition={{ duration: 1.4 }}>
                          {['✦', '★', '❀'][i % 3]}
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* The path of stepping stones */}
              <ol className="mt-8 flex gap-3 overflow-x-auto pb-4" aria-label={t('routine.path')}>
                {list.map((task, i) => {
                  const done = doneIds.has(task.id)
                  return (
                    <li key={task.id} className="shrink-0">
                      <button onClick={() => setIndex(i)} aria-current={i === index}
                        className={`flex w-32 flex-col items-center gap-2 rounded-3xl p-3 text-center transition ${i === index ? 'bg-white shadow-lg ring-4 ring-ink/20' : 'bg-white/60'}`}>
                        <span className={`relative grid size-16 place-items-center rounded-full ${done ? 'bg-leaf text-white' : 'bg-ink/10'}`}>
                          <TaskIcon name={task.icon} size={30} />
                          {done && <Check className="absolute -right-1 -top-1 rounded-full bg-teal p-0.5 text-white" size={22} aria-hidden />}
                        </span>
                        <span className="text-base font-bold leading-tight">{title(task)}</span>
                        <span className="sr-only">{done ? t('routine.doneLabel') : t('handbook.waiting')}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden /> {t('routine.add')}</Button>
            <Button variant="ghost" onClick={() => setEditing(true)}><Pencil aria-hidden /> {t('routine.edit')}</Button>
          </div>
          {notToday.length > 0 && <p className="mt-4 text-center text-ink-soft">{t('routine.notToday', { n: notToday.length })}</p>}

          <TaskForm open={adding} period={period} onClose={() => setAdding(false)} onSaved={reload} />
          <EditList open={editing} tasks={(data.tasks ?? []).filter((x) => x.period === period)} onClose={() => setEditing(false)} onChanged={reload} />
        </>
      )}
    </AppShell>
  )
}

const DAY_KEYS: TKey[] = ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat']

function TaskForm({ open, period, onClose, onSaved }: { open: boolean; period: Period; onClose: () => void; onSaved: () => void }) {
  const t = useSettings().t
  const [med, setMed] = useState(false)
  const [remind, setRemind] = useState(true)
  const [days, setDays] = useState('0123456')
  const [icon, setIcon] = useState('star')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    setBusy(true)
    try {
      await api.post('/routine/tasks', { period, title: f.title, time: f.time || null, days, icon, isMedication: med, remind: remind && Boolean(f.time) })
      onSaved()
      onClose()
      setError(null)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }
  const toggleDay = (d: number) => setDays((s) => (s.includes(String(d)) ? s.replace(String(d), '') : [...s, String(d)].sort().join('')))

  return (
    <Sheet open={open} onClose={onClose} title={t('routine.add')}>
      <form onSubmit={submit} className="space-y-5">
        <Toggle on={med} onChange={setMed} label={t('routine.isMedication')} hint={t('routine.medicationHint')} />
        <Field label={med ? t('routine.medName') : t('routine.taskName')}><input name="title" required maxLength={80} className={inputCls} /></Field>
        {!med && (
          <fieldset>
            <legend className="text-lg font-bold">{t('routine.icon')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICON_CHOICES.filter((i) => i !== 'pill').map((i) => (
                <button key={i} type="button" aria-pressed={icon === i} aria-label={i} onClick={() => setIcon(i)}
                  className={`grid size-14 place-items-center rounded-2xl ${icon === i ? 'bg-ink text-cream' : 'bg-white ring-2 ring-ink/10'}`}><TaskIcon name={i} size={26} /></button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label={t('routine.time')} hint={t('routine.timeHint')}><input name="time" type="time" className={inputCls} /></Field>
        <fieldset>
          <legend className="text-lg font-bold">{t('routine.days')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAY_KEYS.map((k, d) => (
              <button key={k} type="button" aria-pressed={days.includes(String(d))} onClick={() => toggleDay(d)}
                className={`min-h-14 min-w-16 rounded-2xl px-3 font-bold ${days.includes(String(d)) ? 'bg-teal text-white' : 'bg-white ring-2 ring-ink/10'}`}>{t(k)}</button>
            ))}
          </div>
        </fieldset>
        <Toggle on={remind} onChange={setRemind} label={t('routine.remindMe')} hint={t('routine.remindHint')} />
        {error && <ErrorView error={error} />}
        <Button big busy={busy} disabled={!days} className="w-full">{med ? <Pill aria-hidden /> : <Plus aria-hidden />} {t('common.save')}</Button>
      </form>
    </Sheet>
  )
}

function EditList({ open, tasks, onClose, onChanged }: { open: boolean; tasks: Task[]; onClose: () => void; onChanged: () => void }) {
  const t = useSettings().t
  const title = useTaskTitle()
  const [error, setError] = useState<ApiError | null>(null)
  const archive = async (task: Task) => {
    try {
      await api.patch(`/routine/tasks/${task.id}`, { archived: true })
      onChanged()
    } catch (e) {
      setError(e as ApiError)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('routine.edit')}>
      {error && <ErrorView error={error} />}
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
            <TaskIcon name={task.icon} size={28} />
            <span className="flex-1 text-lg font-bold">{title(task)}{task.time && <span className="ml-2 font-normal text-ink-soft">{task.time}</span>}</span>
            <Button variant="ghost" onClick={() => archive(task)} aria-label={`${t('routine.remove')}: ${title(task)}`}><Trash2 aria-hidden /> {t('routine.remove')}</Button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
