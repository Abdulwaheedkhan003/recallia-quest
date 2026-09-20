import { motion } from 'framer-motion'
import { ChevronLeft, Star } from 'lucide-react'
import { SCENARIO_CATEGORIES, categoryById, scenarioById, scenariosIn } from '../../../shared/scenarios'
import { ApiError } from '../../api/client'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { ErrorView, Loading } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import ScenarioPlayer from './ScenarioPlayer'
import type { ScenarioOverview } from './types'

const DIFFICULTY = ['', 'Gentle start', 'Some challenge', 'More challenging']

/**
 * "What Would You Do?" — routes:
 *   #/practice                 → 31 situation categories
 *   #/practice/c/<category>    → scenarios in a category
 *   #/practice/play/<scenario> → the AI scenario player
 */
export default function ScenariosHome() {
  const { path } = useRoute()
  const [, , kind, id] = path.split('/')
  const overview = useApi<ScenarioOverview>('/scenarios')

  if (kind === 'play' && id && scenarioById(id)) return <ScenarioPlayer key={id} scenarioId={id} overview={overview.data} onProgress={overview.reload} />

  const category = kind === 'c' && id ? categoryById(id) : undefined
  const best = (sid: string) => overview.data?.progress.find((p) => p.scenario_id === sid)

  return (
    <AppShell title="What Would You Do?" icon={<span aria-hidden>🗣️</span>} tone="bg-[linear-gradient(180deg,#e6f4f1,#fff8ec)]">
      {overview.error && <ErrorView error={overview.error} onRetry={overview.reload} />}
      {overview.data && !overview.data.aiReady && (
        <div className="mb-6">
          <ErrorView error={new ApiError(503, 'AI_NOT_CONFIGURED', 'The practice partner needs the AI service (Groq) to be connected.', { required: overview.data.required })} />
        </div>
      )}

      {!category ? (
        <>
          <section className="rounded-[36px] bg-white/80 p-6 shadow-sm sm:p-8">
            <p className="text-4xl font-bold sm:text-5xl">🗣️ What Would You Do?</p>
            <p className="mt-3 text-2xl">Practise everyday conversations.</p>
            <p className="mt-1 text-xl text-ink-soft">Talk to someone, see how they respond, and learn what may help.</p>
            <p className="mt-4 text-base text-ink-soft">Everyone is different. These are practice situations — not every person living with memory changes experiences them. There is no single right answer.</p>
          </section>

          <h2 className="mt-8 text-2xl font-bold">Choose a situation to practise</h2>
          {overview.loading && !overview.data && <Loading />}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCENARIO_CATEGORIES.map((c, i) => {
              const list = scenariosIn(c.id)
              const done = list.filter((s) => best(s.id)?.attempts).length
              return (
                <li key={c.id}>
                  <motion.button onClick={() => navigate(`/practice/c/${c.id}`)}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }} whileHover={{ y: -3 }}
                    className="flex min-h-28 w-full items-center gap-4 rounded-[28px] bg-white p-5 text-left shadow-sm ring-2 ring-transparent hover:ring-teal/40">
                    <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl bg-cream text-4xl">{c.emoji}</span>
                    <span className="min-w-0">
                      <span className="block text-xl font-bold">{c.title}</span>
                      <span className="block text-base text-ink-soft">{c.blurb}</span>
                      <span className="mt-1 block text-sm font-bold text-teal">{list.length} situations{done ? ` · ${done} practised` : ''}</span>
                    </span>
                  </motion.button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <button onClick={() => navigate('/practice')} className="mb-4 flex min-h-12 items-center gap-1 rounded-full bg-white px-5 text-lg font-bold shadow-sm">
            <ChevronLeft aria-hidden /> All situations
          </button>
          <h2 className="flex items-center gap-3 text-4xl font-bold"><span aria-hidden>{category.emoji}</span>{category.title}</h2>
          <p className="mt-1 text-xl text-ink-soft">{category.blurb}</p>
          <ul className="mt-6 grid gap-5 md:grid-cols-2">
            {scenariosIn(category.id).map((s) => {
              const p = best(s.id)
              return (
                <li key={s.id}>
                  <button onClick={() => navigate(`/practice/play/${s.id}`)} className="flex h-full w-full flex-col gap-3 rounded-[32px] bg-white p-6 text-left shadow-sm ring-2 ring-transparent hover:ring-teal/40">
                    <span className="flex items-center gap-4">
                      <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-full bg-sky text-5xl">{s.character.portrait}</span>
                      <span>
                        <span className="block text-2xl font-bold">{s.title}</span>
                        <span className="block text-lg text-ink-soft">{s.character.name}, {s.relationship}</span>
                      </span>
                    </span>
                    <span className="text-lg">{s.description}</span>
                    <span className="flex flex-wrap gap-2 text-sm font-bold">
                      <span className="rounded-full bg-cream px-3 py-1">{DIFFICULTY[s.difficulty]}</span>
                      {p?.best != null && <span className="flex items-center gap-1 rounded-full bg-teal/15 px-3 py-1 text-teal"><Star size={14} aria-hidden /> Best {p.best}/100</span>}
                      {p?.attempts ? <span className="rounded-full bg-ink/5 px-3 py-1">{p.attempts} {p.attempts === 1 ? 'try' : 'tries'}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </AppShell>
  )
}
