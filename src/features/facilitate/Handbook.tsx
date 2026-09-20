import { motion } from 'framer-motion'
import { BookOpen, Check, Hourglass, Moon, MessageCircleHeart, Music, Puzzle, Sun, Sunset, Volume2 } from 'lucide-react'
import type { Quest } from '../../api/types'
import { useApi } from '../../api/useApi'
import Mascot from '../../components/Mascot'
import { ErrorView, Loading, Progress } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { navigate } from '../../lib/router'
import { speak } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'

const META: Record<string, { icon: typeof Sun; title: TKey; nudge: TKey; tone: string }> = {
  routine_morning: { icon: Sun, title: 'quest.morning', nudge: 'quest.nudgeMorning', tone: 'bg-amber' },
  routine_afternoon: { icon: Sunset, title: 'quest.afternoon', nudge: 'quest.nudgeAfternoon', tone: 'bg-coral' },
  routine_night: { icon: Moon, title: 'quest.night', nudge: 'quest.nudgeNight', tone: 'bg-lavender' },
  game: { icon: Puzzle, title: 'quest.game', nudge: 'quest.nudgeGame', tone: 'bg-teal' },
  song: { icon: Music, title: 'quest.song', nudge: 'quest.nudgeSong', tone: 'bg-[#c2410c]' },
  companion: { icon: MessageCircleHeart, title: 'quest.companion', nudge: 'quest.nudgeCompanion', tone: 'bg-[#6f5ee8]' },
  memory: { icon: Hourglass, title: 'quest.memory', nudge: 'quest.nudgeMemory', tone: 'bg-[#2f9e6a]' },
}

/** The Adventure Handbook — today's quests, computed by the server from real activity. */
export default function Handbook() {
  const { t, lang } = useSettings()
  const { data, error, loading, reload } = useApi<{ date: string; currentPeriod: string; quests: Quest[] }>('/routine/handbook', ['handbook:changed', 'tasks:changed'])

  if (loading) return <Loading />
  if (error) return <ErrorView error={error} onRetry={reload} />
  if (!data) return null

  const complete = (q: Quest) => q.total > 0 && q.done >= q.total
  const open = data.quests.filter((q) => !complete(q))
  // Suggest the current part of the day first, then anything else waiting.
  const next = open.find((q) => q.id === `routine_${data.currentPeriod}`) ?? open.find((q) => q.kind !== 'routine') ?? open[0]
  const doneCount = data.quests.filter(complete).length

  return (
    <section aria-labelledby="hb-title" className="relative overflow-hidden rounded-[40px] bg-[linear-gradient(135deg,#fdf1d8,#f8e3bb)] p-5 shadow-[inset_0_0_0_6px_#e9c98a,0_30px_60px_-30px_rgba(120,70,0,0.5)] sm:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-[#8a5a12] text-[#fdf1d8]"><BookOpen size={30} aria-hidden /></span>
        <div className="flex-1">
          <h2 id="hb-title" className="text-3xl font-bold text-[#5b3a06]">{t('handbook.title')}</h2>
          <p className="text-lg font-bold text-[#8a5a12]">{fmtDate(data.date, lang)} · {t('handbook.count', { done: doneCount, total: data.quests.length })}</p>
        </div>
      </header>

      {/* Lumi's gentle guidance */}
      <div className="mt-5 flex items-center gap-4 rounded-3xl bg-white/80 p-4">
        <Mascot size={96} mood={next ? 'encouraging' : 'celebrating'} label="" />
        <div className="flex-1">
          <p className="text-xl font-bold">{next ? t(META[next.id]?.nudge ?? 'quest.nudgeGame') : t('handbook.allDone')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {next && <button onClick={() => navigate(next.route)} className="min-h-14 rounded-full bg-ink px-6 text-lg font-bold text-cream">{t('handbook.go')}</button>}
            <button onClick={() => speak(next ? t(META[next.id]?.nudge ?? 'quest.nudgeGame') : t('handbook.allDone'), lang).catch(() => {})}
              className="flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-bold ring-2 ring-ink/10" aria-label={t('common.readAloud')}>
              <Volume2 aria-hidden /> <span className="hidden sm:inline">{t('common.readAloud')}</span>
            </button>
          </div>
        </div>
      </div>

      <ul className="mt-6 grid gap-4">
        {data.quests.map((q, i) => {
          const m = META[q.id] ?? META.game
          const done = complete(q)
          return (
            <motion.li key={q.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
              <button onClick={() => navigate(q.route)}
                className={`flex w-full items-center gap-4 rounded-3xl p-4 text-left transition hover:-translate-y-0.5 ${done ? 'border-4 border-leaf bg-leaf/20' : 'border-4 border-dashed border-amber bg-white/90'}`}>
                <span className={`grid size-16 shrink-0 place-items-center rounded-2xl text-white ${m.tone}`}><m.icon size={32} aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold">{t(m.title)}</span>
                  {q.total > 1 && <span className="mt-2 block"><Progress value={q.done} max={q.total} label={t(m.title)} /></span>}
                  <span className="mt-1 block text-base font-bold text-ink-soft">
                    {q.total > 1 ? t('handbook.steps', { done: q.done, total: q.total }) : done ? t('handbook.questDone') : t('handbook.waiting')}
                  </span>
                </span>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-leaf px-3 py-1.5 font-bold text-white"><Check size={20} aria-hidden /> {t('handbook.doneChip')}</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber/25 px-3 py-1.5 font-bold text-amber-deep">⏳ {t('handbook.waitingChip')}</span>
                )}
              </button>
            </motion.li>
          )
        })}
      </ul>
    </section>
  )
}
