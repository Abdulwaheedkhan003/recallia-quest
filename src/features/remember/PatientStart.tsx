import { motion } from 'framer-motion'
import { ArrowLeft, KeyRound, LogIn } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import type { User } from '../../api/types'
import ComfortMenu from '../../components/ComfortMenu'
import Mascot from '../../components/Mascot'
import { Button, translated } from '../../components/ui'
import { navigate } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useT } from '../../state/settings'

/** Patient entry: a caretaker-created profile is opened on this device with a short code (no password to remember). */
export default function PatientStart() {
  const t = useT()
  const { status, user } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (status === 'authed' && user?.role === 'patient') navigate('/hub') }, [status, user?.role])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post<{ user: User }>('/auth/pair', { code })
      // A full reload makes every part of the app start fresh as this person.
      window.location.hash = '/hub'
      window.location.reload()
    } catch (err) {
      const ae = err as ApiError
      setError(ae.code === 'PAIR_INVALID' ? t('pair.invalid') : translated(t, ae))
    } finally {
      setBusy(false)
    }
  }
  const pretty = (v: string) => {
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    return c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3)}` : c
  }

  return (
    <main id="main" className="min-h-screen bg-[radial-gradient(ellipse_at_top,#ffe1b0_0%,#fff8ec_55%,#e9e2ff_100%)] px-4 py-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <button onClick={() => navigate('/')} className="flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-bold shadow-sm"><ArrowLeft aria-hidden /> {t('auth.backHome')}</button>
        <ComfortMenu />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-10 max-w-2xl rounded-[40px] bg-white p-8 text-center shadow-xl sm:p-12">
        <div className="mx-auto w-fit"><Mascot size={140} mood="happy" label="" /></div>
        <h1 className="mt-4 text-5xl font-bold">{t('pair.welcome')}</h1>
        <p className="mt-3 text-2xl text-ink-soft">{t('pair.ask')}</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label htmlFor="pair-code" className="sr-only">{t('pair.code')}</label>
          <input id="pair-code" value={code} onChange={(e) => setCode(pretty(e.target.value))} autoComplete="one-time-code" autoCapitalize="characters" inputMode="text"
            placeholder="ABC-123" className="mx-auto block min-h-24 w-full max-w-sm rounded-3xl border-4 border-amber/50 bg-cream text-center font-mono text-5xl font-bold tracking-[0.2em] focus:border-amber" />
          {error && <p role="alert" className="text-xl font-bold text-[#b3261e]">{error}</p>}
          <Button big busy={busy} disabled={code.replace('-', '').length !== 6} className="w-full max-w-sm"><KeyRound aria-hidden /> {t('pair.open')}</Button>
        </form>
        <div className="mt-8 border-t-2 border-ink/5 pt-6">
          <p className="text-lg text-ink-soft">{t('pair.own')}</p>
          <Button variant="secondary" className="mt-2" onClick={() => navigate('/login')}><LogIn aria-hidden /> {t('pair.signIn')}</Button>
        </div>
      </motion.div>
    </main>
  )
}
