import { motion } from 'framer-motion'
import { Gamepad2, Home, Music, Sparkles, Sun, Users, Waves } from 'lucide-react'
import { useState } from 'react'
import AppShell from '../../components/AppShell'
import WorldTransition from '../../components/WorldTransition'
import { navigate } from '../../lib/router'
import { useT, type TKey } from '../../state/settings'
import Handbook from './Handbook'

const AREAS: { route: string; icon: typeof Sun; label: TKey; hint: TKey; tone: string }[] = [
  { route: '/routine', icon: Sun, label: 'area.routine', hint: 'area.routineHint', tone: 'from-amber/90 to-[#f7c96a]' },
  { route: '/games', icon: Gamepad2, label: 'area.games', hint: 'area.gamesHint', tone: 'from-teal to-[#3fb59b]' },
  { route: '/song', icon: Music, label: 'area.song', hint: 'area.songHint', tone: 'from-[#c2410c] to-coral' },
  { route: '/interact', icon: Users, label: 'area.interact', hint: 'area.interactHint', tone: 'from-lavender to-[#a99cff]' },
  { route: '/home-sim', icon: Home, label: 'area.sim', hint: 'area.simHint', tone: 'from-[#2563eb] to-[#60a5fa]' },
  { route: '/relax', icon: Waves, label: 'area.relax', hint: 'area.relaxHint', tone: 'from-[#0e7490] to-[#22d3ee]' },
]

let enteredThisSession = false

export default function Facilitate() {
  const t = useT()
  const [entering, setEntering] = useState(!enteredThisSession)
  const [ready, setReady] = useState(enteredThisSession)

  return (
    <>
      <WorldTransition
        active={entering}
        title={t('facilitate.enterTitle')}
        subtitle={t('facilitate.enterSub')}
        tone="#cdeccf"
        onCovered={() => { setReady(true); enteredThisSession = true }}
        onDone={() => setEntering(false)}
      />
      {ready && (
        <AppShell title={t('hub.facilitate')} icon={<Sparkles className="text-amber-deep" aria-hidden />} tone="bg-[linear-gradient(180deg,#cfe8ff_0%,#e9f7e4_45%,#fff8ec_100%)]">
          {/* floating world decoration */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden">
            <div className="drift absolute left-[6%] top-28 h-16 w-40 rounded-full bg-white/80 blur-sm" />
            <div className="drift absolute right-[10%] top-44 h-12 w-32 rounded-full bg-white/70 blur-sm [animation-delay:-3s]" />
          </div>

          <div className="relative grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Handbook />
            <nav aria-label={t('facilitate.places')}>
              <h2 className="mb-3 text-2xl font-bold">{t('facilitate.places')}</h2>
              <ul className="grid grid-cols-2 gap-4">
                {AREAS.map((a, i) => (
                  <motion.li key={a.route} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 + i * 0.06 }}>
                    <button onClick={() => navigate(a.route)}
                      className={`flex min-h-[150px] w-full flex-col justify-between rounded-[28px] bg-gradient-to-br ${a.tone} p-5 text-left text-white shadow-lg transition hover:-translate-y-1`}>
                      <a.icon size={40} aria-hidden />
                      <span>
                        <span className="block text-2xl font-bold">{t(a.label)}</span>
                        <span className="block text-base text-white/95">{t(a.hint)}</span>
                      </span>
                    </button>
                  </motion.li>
                ))}
              </ul>
            </nav>
          </div>
        </AppShell>
      )}
    </>
  )
}
