import { motion } from 'framer-motion'
import { Home, LogIn, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { navigate } from '../lib/router'
import { useAuth } from '../state/auth'
import { useRealtime } from '../state/realtime'
import { useT } from '../state/settings'
import ComfortMenu from './ComfortMenu'
import { NotificationBell } from './Notifications'
import StoryButton from './StoryButton'
import { Button } from './ui'

interface Props {
  title: string
  icon?: ReactNode
  children: ReactNode
  /** Where the big "home" button goes. */
  home?: string
  homeLabel?: string
  story?: boolean
  tone?: string
  dark?: boolean
}

/**
 * Consistent frame for every in-app screen: the home button is always top-left,
 * reminders + comfort settings always top-right. Shows connection + session problems honestly.
 */
export default function AppShell({ title, icon, children, home = '/hub', homeLabel, story = true, tone = 'bg-cream', dark }: Props) {
  const t = useT()
  const { status } = useRealtime()
  const { expired } = useAuth()

  return (
    <div className={`min-h-screen ${tone} ${dark ? 'text-cream' : 'text-ink'}`}>
      <header className={`sticky top-0 z-40 backdrop-blur-md ${dark ? 'bg-night/70' : 'bg-cream/75'}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => navigate(home)} className={`flex min-h-14 items-center gap-2 rounded-full px-5 text-lg font-bold ${dark ? 'bg-white/15' : 'bg-white shadow-sm'}`}>
            <Home size={24} aria-hidden /> <span className="hidden sm:inline">{homeLabel ?? t('shell.home')}</span>
          </button>
          <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate text-2xl font-bold sm:text-3xl">{icon}<span className="truncate">{title}</span></h1>
          <NotificationBell dark={dark} />
          <ComfortMenu dark={dark} />
        </div>
        {status !== 'online' && status !== 'connecting' && (
          <p role="status" className="flex items-center justify-center gap-2 bg-amber px-4 py-2 text-center font-bold text-ink">
            <WifiOff size={20} aria-hidden /> {status === 'offline' ? t('shell.offline') : t('shell.reconnecting')}
          </p>
        )}
      </header>

      <motion.main id="main" className={`mx-auto max-w-6xl px-4 pb-32 pt-4 sm:px-6 ${story ? "pr-24 sm:pr-28 2xl:pr-6" : ""}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {children}
      </motion.main>

      {story && <StoryButton />}

      {expired && (
        <div role="alertdialog" aria-label={t('shell.expired')} className="fixed inset-0 z-[99] grid place-items-center bg-ink/50 p-4">
          <div className="max-w-md rounded-[32px] bg-cream p-8 text-center text-ink">
            <p className="text-2xl font-bold">{t('shell.expired')}</p>
            <Button big className="mt-6" onClick={() => { window.location.hash = '/login'; window.location.reload() }}><LogIn aria-hidden /> {t('auth.signIn')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
