import { motion } from 'framer-motion'
import { ArrowLeft, Heart, LogIn, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import type { ApiError } from '../../api/client'
import ComfortMenu from '../../components/ComfortMenu'
import Mascot from '../../components/Mascot'
import { Button, Field, inputCls, translated } from '../../components/ui'
import { navigate } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useT } from '../../state/settings'

export default function AuthPage() {
  const t = useT()
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [role, setRole] = useState<'patient' | 'family'>('patient')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    setBusy(true)
    setError('')
    try {
      if (mode === 'in') await login(f.email, f.password)
      else await register({ email: f.email, password: f.password, displayName: f.name, role })
      navigate('/hub')
    } catch (err) {
      setError(translated(t, err as ApiError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main" className="min-h-screen bg-[radial-gradient(ellipse_at_top,#ffe1b0_0%,#fff8ec_55%,#e9e2ff_100%)] px-4 py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <button onClick={() => navigate('/')} className="flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-bold shadow-sm">
          <ArrowLeft aria-hidden /> {t('auth.backHome')}
        </button>
        <ComfortMenu />
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl items-center gap-10 md:grid-cols-[1fr_1.1fr]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center md:text-left">
          <Mascot size={200} mood={mode === 'in' ? 'happy' : 'encouraging'} />
          <h1 className="mt-4 text-5xl font-bold">{mode === 'in' ? t('auth.welcomeBack') : t('auth.join')}</h1>
          <p className="mt-3 text-xl text-ink-soft">{t('auth.intro')}</p>
        </motion.div>

        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5 rounded-[36px] bg-white p-7 shadow-xl sm:p-9">
          <div className="grid grid-cols-2 gap-2 rounded-full bg-ink/5 p-1.5" role="tablist">
            {(['in', 'up'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError('') }}
                className={`min-h-14 rounded-full text-lg font-bold transition ${mode === m ? 'bg-ink text-cream' : 'text-ink-soft'}`}>
                {m === 'in' ? t('auth.signIn') : t('auth.create')}
              </button>
            ))}
          </div>

          {mode === 'up' && (
            <>
              <fieldset>
                <legend className="text-lg font-bold">{t('auth.whoFor')}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {([['patient', Heart, t('auth.forMe'), t('auth.forMeHint')], ['family', Users, t('auth.forFamily'), t('auth.forFamilyHint')]] as const).map(([r, I, label, hint]) => (
                    <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}
                      className={`rounded-3xl border-2 p-4 text-left transition ${role === r ? 'border-teal bg-teal/10' : 'border-ink/10'}`}>
                      <I className="text-teal" aria-hidden />
                      <span className="mt-1 block text-lg font-bold">{label}</span>
                      <span className="block text-base text-ink-soft">{hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label={t('auth.name')}><input name="name" required maxLength={60} autoComplete="name" className={inputCls} /></Field>
            </>
          )}
          <Field label={t('auth.email')}><input name="email" type="email" required autoComplete="email" className={inputCls} /></Field>
          <Field label={t('auth.password')} hint={mode === 'up' ? t('auth.passwordHint') : undefined}>
            <input name="password" type="password" required minLength={mode === 'up' ? 8 : 1} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} className={inputCls} />
          </Field>
          {error && <p role="alert" className="rounded-2xl bg-coral/10 p-4 text-lg font-bold text-[#9a3412]">{error}</p>}
          <Button big busy={busy} className="w-full">
            {mode === 'in' ? <><LogIn aria-hidden /> {t('auth.signIn')}</> : <><UserPlus aria-hidden /> {t('auth.create')}</>}
          </Button>
        </motion.form>
      </div>
    </main>
  )
}
