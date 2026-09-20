import { lazy, Suspense, useEffect, useState } from 'react'
import Mascot from './components/Mascot'
import { ReminderToasts } from './components/Notifications'
import WorldTransition from './components/WorldTransition'
import RoleModal from './features/landing/RoleModal'
import { api } from './api/client'
import { refreshPush } from './lib/push'
import { navigate, useRoute } from './lib/router'
import { AuthProvider, useAuth } from './state/auth'
import { RealtimeProvider } from './state/realtime'
import { SettingsProvider, useSettings } from './state/settings'

// Each area is code-split so only the current world is downloaded.
const LandingPage = lazy(() => import('./features/landing/LandingPage'))
const AuthPage = lazy(() => import('./features/auth/AuthPage'))
const ROUTES: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  hub: lazy(() => import('./features/hub/Hub')),
  facilitate: lazy(() => import('./features/facilitate/Facilitate')),
  routine: lazy(() => import('./features/routine/Routine')),
  interact: lazy(() => import('./features/interact/Interact')),
  song: lazy(() => import('./features/song/TodaySong')),
  games: lazy(() => import('./features/games/GamesHome')),
  relax: lazy(() => import('./features/relax/Relax')),
  companion: lazy(() => import('./features/companion/Companion')),
  capsule: lazy(() => import('./features/capsule/TimeCapsule')),
  stories: lazy(() => import('./features/stories/StoryTime')),
  'home-sim': lazy(() => import('./features/simulation/HomeSim')),
  agent: lazy(() => import('./features/agent/Agent')),
  practice: lazy(() => import('./features/scenarios/ScenariosHome')),
  care: lazy(() => import('./features/care/CareApp')),
  remember: lazy(() => import('./features/remember/Remember')),
  patient: lazy(() => import('./features/remember/PatientStart')),
  settings: lazy(() => import('./features/settings/Settings')),
}

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <Mascot size={120} mood="thinking" label="" />
    </div>
  )
}

function Shell() {
  const { t } = useSettings()
  const { status, user } = useAuth()
  const { path } = useRoute()
  const [entering, setEntering] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const section = path.split('/')[1]
  const Page = ROUTES[section]

  useEffect(() => { if (status === 'authed') void refreshPush() }, [status])

  // Tell the caretaker side which area the patient is using (history is kept server-side).
  useEffect(() => {
    if (status !== 'authed' || user?.role !== 'patient' || !section) return
    void api.post('/remember/presence', { area: section }).catch(() => {})
  }, [status, user?.role, section])

  // "Try Recallia" → who is using it?
  const start = () => setChoosing(true)
  const asPatient = () => {
    setChoosing(false)
    if (status === 'authed' && user?.role === 'patient') setEntering(true)
    else navigate('/patient')
  }
  const asCaretaker = () => { setChoosing(false); navigate('/care') }

  let content: React.ReactNode
  if (path === '/' || !section) content = <LandingPage onStart={start} />
  else if (status === 'loading') content = <Loading />
  else if (status === 'guest' && (section === 'care' || section === 'patient')) content = <Page />
  else if (status === 'guest' || section === 'login') content = status === 'authed' ? <Redirect to="/hub" /> : <AuthPage />
  else if (Page) content = <Page />
  else content = <Redirect to="/hub" />

  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); m?.setAttribute('tabindex', '-1'); m?.focus() }}>
        {t('common.skip')}
      </a>
      <Suspense fallback={<Loading />}>{content}</Suspense>
      {status === 'authed' && <ReminderToasts />}
      <RoleModal open={choosing} onClose={() => setChoosing(false)} onPatient={asPatient} onCaretaker={asCaretaker} />
      <WorldTransition active={entering} title={t('transition.line2')} subtitle={t('transition.line1')} onCovered={() => navigate('/hub')} onDone={() => setEntering(false)} />
    </>
  )
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to), [to])
  return null
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <RealtimeProvider>
          <Shell />
        </RealtimeProvider>
      </AuthProvider>
    </SettingsProvider>
  )
}
