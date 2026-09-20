import { motion } from 'framer-motion'
import { CalendarHeart, Gamepad2, Heart, Hourglass, LogOut, MessageCircleHeart, MessagesSquare, Settings, Sparkles } from 'lucide-react'
import { useState } from 'react'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { navigate } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useT, type TKey } from '../../state/settings'
import FamilyHome from '../family/FamilyHome'

const CARDS: { route: string; icon: typeof Gamepad2; title: TKey; body: TKey; tone: string; preview: string[] }[] = [
  { route: '/remember', icon: Heart, title: 'hub.remember', body: 'hub.rememberBody', tone: 'from-[#f7a26b] to-[#e0607e]', preview: ['📷', '💞', '🎙️'] },
  { route: '/facilitate', icon: Gamepad2, title: 'hub.facilitate', body: 'hub.facilitateBody', tone: 'from-amber to-coral', preview: ['🧩', '🎵', '🌅', '🃏'] },
  { route: '/companion', icon: MessageCircleHeart, title: 'hub.companion', body: 'hub.companionBody', tone: 'from-lavender to-[#6f5ee8]', preview: ['💬', '🎙️', '🌍'] },
  { route: '/capsule', icon: Hourglass, title: 'hub.capsule', body: 'hub.capsuleBody', tone: 'from-teal to-[#2f9e6a]', preview: ['📷', '💌', '🎞️'] },
  { route: '/agent', icon: CalendarHeart, title: 'hub.agent', body: 'hub.agentBody', tone: 'from-coral to-[#d9534f]', preview: ['🏥', '📅', '⏰'] },
  { route: '/practice', icon: MessagesSquare, title: 'hub.practice', body: 'hub.practiceBody', tone: 'from-teal to-[#1d5f8a]', preview: ['🗣️', '💬', '🌱'] },
]

function greetingKey(): TKey {
  const h = new Date().getHours()
  return h < 12 ? 'hub.morning' : h < 17 ? 'hub.afternoon' : 'hub.evening'
}

export default function Hub() {
  const t = useT()
  const { user, logout } = useAuth()
  const [hover, setHover] = useState<string | null>(null)
  if (user?.role === 'family') return <FamilyHome />

  return (
    <AppShell title={t('brand')} icon={<Sparkles className="text-amber-deep" aria-hidden />} home="/hub" story tone="bg-gradient-to-b from-sky/70 via-cream to-cream">
      <section className="flex flex-col items-center gap-4 py-4 text-center sm:flex-row sm:text-left">
        <Mascot size={130} mood="happy" />
        <div>
          <p className="text-4xl font-bold sm:text-5xl">{t(greetingKey(), { name: user?.display_name ?? '' })}</p>
          <p className="mt-2 text-xl text-ink-soft">{t('hub.question')}</p>
        </div>
      </section>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {CARDS.map((c, i) => (
          <motion.button
            key={c.route}
            onClick={() => navigate(c.route)}
            onHoverStart={() => setHover(c.route)}
            onHoverEnd={() => setHover(null)}
            onFocus={() => setHover(c.route)}
            onBlur={() => setHover(null)}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -6 }}
            whileTap={{ scale: 0.98 }}
            className={`group relative min-h-[220px] overflow-hidden rounded-[36px] bg-gradient-to-br ${c.tone} p-7 text-left text-white shadow-[0_24px_50px_-20px_rgba(43,33,64,0.55)]`}
          >
            <div aria-hidden className="absolute -right-10 -top-10 size-48 rounded-full bg-white/15" />
            <div aria-hidden className="absolute right-6 top-6 flex gap-2 text-4xl">
              {c.preview.map((p, j) => (
                <motion.span key={p} animate={hover === c.route ? { y: [0, -14, 0] } : { y: 0 }} transition={{ duration: 1.2, repeat: hover === c.route ? Infinity : 0, delay: j * 0.15 }}>{p}</motion.span>
              ))}
            </div>
            <span className="grid size-20 place-items-center rounded-3xl bg-white/25 backdrop-blur"><c.icon size={44} aria-hidden /></span>
            <h2 className="mt-5 text-3xl font-bold">{t(c.title)}</h2>
            <p className="mt-1 max-w-[80%] text-lg text-white/95">{t(c.body)}</p>
          </motion.button>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button onClick={() => navigate('/settings')} className="flex min-h-14 items-center gap-2 rounded-full bg-white px-6 text-lg font-bold shadow-sm"><Settings aria-hidden /> {t('hub.settings')}</button>
        <button onClick={() => logout().then(() => navigate('/'))} className="flex min-h-14 items-center gap-2 rounded-full px-6 text-lg font-bold text-ink-soft"><LogOut aria-hidden /> {t('hub.signOut')}</button>
      </div>
    </AppShell>
  )
}
