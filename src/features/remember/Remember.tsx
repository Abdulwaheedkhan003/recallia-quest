import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import SyncPill from '../../components/SyncPill'
import { ErrorView, Loading } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import { useT } from '../../state/settings'
import StoryPlayer from './StoryPlayer'
import type { RememberPerson } from './types'

interface Data { me: { name: string; photo: string | null }; people: RememberPerson[]; syncedAt: number }

/**
 * Patient: "Let's remember together". Everything shown here comes from what the caretaker added,
 * fetched from the server (the source of truth) and refreshed live when they add something.
 */
export default function Remember() {
  const { path } = useRoute()
  const t = useT()
  const personId = Number(path.split('/')[2]) || null
  const { data, error, loading, reload } = useApi<Data>('/remember/people', ['care:changed'])
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  useEffect(() => { if (data) setSyncedAt(Date.now()) }, [data])

  const person = data?.people.find((p) => p.id === personId)
  if (personId && person) return <StoryPlayer key={person.id} person={person} onExit={() => navigate('/remember')} />

  return (
    <AppShell title={t('hub.remember')} icon={<Heart className="text-coral" aria-hidden />} tone="bg-[radial-gradient(ellipse_at_top,#ffe7c2_0%,#fff8ec_50%,#f1ecff_100%)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Mascot size={96} mood="happy" label="" />
          <div>
            <p className="text-4xl font-bold">{t('remember.heading')}</p>
            <p className="mt-1 text-xl text-ink-soft">{t('remember.sub')}</p>
          </div>
        </div>
        <SyncPill lastSync={syncedAt} />
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}

      {data && data.people.length === 0 && (
        <div className="mt-10 rounded-[36px] bg-white/80 p-10 text-center shadow-sm">
          <p className="text-3xl font-bold">{t('remember.emptyTitle')}</p>
          <p className="mt-2 text-xl text-ink-soft">{t('remember.emptyBody')}</p>
        </div>
      )}

      <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data?.people.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 30, rotate: i % 2 ? 1.5 : -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.08, type: 'spring', stiffness: 120 }}>
            <button onClick={() => navigate(`/remember/${p.id}`)} disabled={!p.ready}
              className="group w-full overflow-hidden rounded-[36px] bg-white p-4 text-left shadow-[0_20px_40px_-18px_rgba(43,33,64,0.45)] transition hover:-translate-y-1 disabled:opacity-60">
              <div className="aspect-square overflow-hidden rounded-[28px] bg-sky">
                {p.avatar
                  ? <img src={p.avatar} alt="" className="size-full object-cover transition duration-700 group-hover:scale-105" />
                  : <div className="grid size-full place-items-center text-8xl" aria-hidden>🙂</div>}
              </div>
              <p className="mt-4 px-2 text-3xl font-bold">{p.name.replace(/^Sample: /, '')}</p>
              {p.relationship && <p className="px-2 text-xl text-ink-soft">{p.relationship}</p>}
              {p.isSample && <p className="mt-1 px-2 text-sm font-bold text-amber-deep">{t('remember.sample')}</p>}
              {!p.ready && <p className="px-2 text-base text-ink-soft">{t('remember.soon')}</p>}
            </button>
          </motion.li>
        ))}
      </ul>
    </AppShell>
  )
}
