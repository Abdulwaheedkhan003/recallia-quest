import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, HeartHandshake, KeyRound, LogOut, Mail, Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import ComfortMenu from '../../components/ComfortMenu'
import Mascot from '../../components/Mascot'
import { Button, ErrorView, Field, inputCls, Loading, translated } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useT } from '../../state/settings'
import PatientSpace from './PatientSpace'
import PersonPage from './PersonPage'
import { areaLabel, type CarePatient } from './types'
import { PrivateAiCard } from './PrivateAi'

/**
 * Caretaker experience (#/care…). Shares the same accounts, database and realtime socket as the patient app.
 *   /care                   patients you care for (or onboarding)
 *   /care/new               add a patient profile / link an existing account
 *   /care/p/:pid/:tab       profile · gallery · monitoring
 *   /care/p/:pid/person/:id one person ("avatar")
 */
export default function CareApp() {
  const { status, user } = useAuth()
  const { path } = useRoute()
  const seg = path.split('/').slice(2)

  if (status === 'loading') return <Loading />
  if (status !== 'authed') return <Onboarding />
  if (user?.role !== 'family') return <PatientAccountNotice />

  if (seg[0] === 'new') return <NewPatient />
  if (seg[0] === 'p' && Number(seg[1])) {
    const pid = Number(seg[1])
    if (seg[2] === 'person' && Number(seg[3])) return <PersonPage pid={pid} personId={Number(seg[3])} />
    return <PatientSpace pid={pid} tab={(seg[2] as 'profile' | 'gallery' | 'monitor') || 'profile'} />
  }
  return <Overview />
}

/* ---------------- onboarding: email first, then sign in or create ---------------- */

function Onboarding() {
  const t = useT()
  const { login, register } = useAuth()
  const [step, setStep] = useState<'email' | 'signin' | 'create'>('email')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(translated(t, e as ApiError)) } finally { setBusy(false) }
  }
  const onEmail = (e: React.FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const r = await api.post<{ exists: boolean }>('/auth/email-status', { email })
      setStep(r.exists ? 'signin' : 'create')
    })
  }
  const onSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    void run(async () => { await login(email, String(f.get('password'))); navigate('/care') })
  }
  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    void run(async () => { await register({ email, password: String(f.get('password')), displayName: String(f.get('name')), role: 'family' }); navigate('/care/new') })
  }

  return (
    <main id="main" className="min-h-screen bg-[linear-gradient(180deg,#eef5f3,#fff8ec)] px-4 py-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        <button onClick={() => (step === 'email' ? navigate('/') : setStep('email'))} className="flex min-h-14 items-center gap-2 rounded-full bg-white px-5 text-lg font-bold shadow-sm"><ArrowLeft aria-hidden /> Back</button>
        <ComfortMenu />
      </div>
      <motion.div key={step} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-10 max-w-xl rounded-[36px] bg-white p-8 shadow-xl sm:p-10">
        <p className="text-sm font-bold uppercase tracking-wider text-teal">Caretaker</p>
        {step === 'email' && (
          <form onSubmit={onEmail} className="space-y-5">
            <h1 className="text-4xl font-bold">What's your email address?</h1>
            <p className="text-lg text-ink-soft">It keeps your caretaker space private to you.</p>
            <label className="block"><span className="sr-only">Email</span>
              <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" /></label>
            {error && <p role="alert" className="font-bold text-[#b3261e]">{error}</p>}
            <Button big busy={busy} className="w-full"><Mail aria-hidden /> Continue</Button>
          </form>
        )}
        {step === 'signin' && (
          <form onSubmit={onSignIn} className="space-y-5">
            <h1 className="text-4xl font-bold">Welcome back</h1>
            <p className="text-lg text-ink-soft">{email}</p>
            <Field label="Password"><input name="password" type="password" required autoFocus autoComplete="current-password" className={inputCls} /></Field>
            {error && <p role="alert" className="font-bold text-[#b3261e]">{error}</p>}
            <Button big busy={busy} className="w-full"><KeyRound aria-hidden /> Sign in</Button>
          </form>
        )}
        {step === 'create' && (
          <form onSubmit={onCreate} className="space-y-5">
            <h1 className="text-4xl font-bold">Create your caretaker account</h1>
            <p className="text-lg text-ink-soft">{email}</p>
            <Field label="Your name"><input name="name" required maxLength={60} autoFocus autoComplete="name" className={inputCls} /></Field>
            <Field label="Choose a password" hint="At least 8 characters."><input name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} /></Field>
            {error && <p role="alert" className="font-bold text-[#b3261e]">{error}</p>}
            <Button big busy={busy} className="w-full"><UserPlus aria-hidden /> Create account</Button>
          </form>
        )}
      </motion.div>
    </main>
  )
}

function PatientAccountNotice() {
  const { logout } = useAuth()
  return (
    <AppShell title="Caretaker space" icon={<HeartHandshake className="text-teal" aria-hidden />} story={false}>
      <div className="mx-auto mt-10 max-w-xl rounded-[32px] bg-white p-8 text-center shadow-sm">
        <Mascot size={110} mood="encouraging" label="" />
        <h2 className="mt-3 text-3xl font-bold">This device is signed in for the person using Recallia.</h2>
        <p className="mt-2 text-lg text-ink-soft">To set things up as a caretaker, sign out and continue with your own email.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => navigate('/hub')}>Go to Recallia</Button>
          <Button variant="secondary" onClick={() => logout().then(() => navigate('/care'))}><LogOut aria-hidden /> Sign out</Button>
        </div>
      </div>
    </AppShell>
  )
}

/* ---------------- patients ---------------- */

function Overview() {
  const { user, logout } = useAuth()
  const { data, error, loading, reload } = useApi<{ patients: CarePatient[] }>('/care/patients', ['care:changed', 'presence', 'monitor'])
  if (data && data.patients.length === 0) return <NewPatient first />
  return (
    <AppShell title="Caretaker space" icon={<HeartHandshake className="text-teal" aria-hidden />} story={false} tone="bg-[linear-gradient(180deg,#eef5f3,#fff8ec)]">
      <p className="text-3xl font-bold">Hello, {user?.display_name}</p>
      <p className="mt-1 text-lg text-ink-soft">Choose who you are setting things up for.</p>
      {loading && !data && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      <ul className="mt-6 grid gap-5 md:grid-cols-2">
        {data?.patients.map((p) => (
          <li key={p.id}>
            <button onClick={() => navigate(`/care/p/${p.id}`)} className="flex w-full items-center gap-5 rounded-[32px] bg-white p-6 text-left shadow-sm ring-2 ring-transparent hover:ring-teal/40">
              <span className="relative">
                {p.photo ? <img src={p.photo} alt="" className="size-24 rounded-full object-cover" /> : <span className="grid size-24 place-items-center rounded-full bg-sky text-5xl" aria-hidden>🙂</span>}
                <span aria-hidden className={`absolute bottom-1 right-1 size-5 rounded-full ring-4 ring-white ${p.online ? 'bg-teal' : 'bg-ink/25'}`} />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-bold">{p.preferredName || p.name}</span>
                <span className="block text-base text-ink-soft">{p.online ? (p.current ? `Using ${areaLabel(p.current.area)} now` : 'Device connected') : 'Device not connected'}</span>
                <span className="mt-1 block text-base font-bold text-teal">{p.people} {p.people === 1 ? 'person' : 'people'} in the gallery · {p.completeness.filled} profile details</span>
              </span>
              <ArrowRight className="ml-auto shrink-0 text-ink-soft" aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <button onClick={() => navigate('/care/new')} className="flex min-h-36 w-full items-center justify-center gap-3 rounded-[32px] border-2 border-dashed border-ink/20 text-xl font-bold text-ink-soft hover:bg-white/60">
            <Plus aria-hidden /> Add someone you care for
          </button>
        </li>
      </ul>
      <div className="mt-8 max-w-2xl"><PrivateAiCard /></div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => navigate('/hub')}>Family sharing &amp; practice</Button>
        <Button variant="ghost" onClick={() => logout().then(() => navigate('/'))}><LogOut aria-hidden /> Sign out</Button>
      </div>
    </AppShell>
  )
}

function NewPatient({ first }: { first?: boolean }) {
  const t = useT()
  const [mode, setMode] = useState<'new' | 'link'>('new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    setBusy(true); setError('')
    try {
      const r = mode === 'new'
        ? await api.post<{ patient: { id: number } }>('/care/patients', { name: f.name, preferredName: f.preferredName, relation: f.relation })
        : await api.post<{ patient: { id: number } }>('/care/patients/link', { code: f.code, relation: f.relation })
      navigate(`/care/p/${r.patient.id}/profile?welcome=1`)
    } catch (err) { setError(translated(t, err as ApiError)) } finally { setBusy(false) }
  }
  return (
    <AppShell title="Caretaker space" icon={<HeartHandshake className="text-teal" aria-hidden />} home="/care" story={false} tone="bg-[linear-gradient(180deg,#eef5f3,#fff8ec)]">
      <div className="mx-auto max-w-xl">
        <h2 className="text-4xl font-bold">{first ? 'Who are you caring for?' : 'Add someone you care for'}</h2>
        <p className="mt-2 text-lg text-ink-soft">Just a name to begin. You can add everything else later, whenever you like.</p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-full bg-ink/5 p-1.5" role="tablist">
          <button role="tab" aria-selected={mode === 'new'} onClick={() => setMode('new')} className={`min-h-14 rounded-full text-lg font-bold ${mode === 'new' ? 'bg-ink text-cream' : 'text-ink-soft'}`}>New profile</button>
          <button role="tab" aria-selected={mode === 'link'} onClick={() => setMode('link')} className={`min-h-14 rounded-full text-lg font-bold ${mode === 'link' ? 'bg-ink text-cream' : 'text-ink-soft'}`}>They already use Recallia</button>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-5 rounded-[32px] bg-white p-7 shadow-sm">
          {mode === 'new' ? (
            <>
              <Field label="Their name"><input name="name" required maxLength={60} autoFocus className={inputCls} placeholder="e.g. Raghavan Iyer" /></Field>
              <Field label="What do they like to be called?" hint="Optional"><input name="preferredName" maxLength={60} className={inputCls} placeholder="e.g. Appa" /></Field>
            </>
          ) : (
            <Field label="Invite code" hint="On their device: Settings → Family circle → create invite code."><input name="code" required minLength={8} maxLength={8} className={`${inputCls} font-mono uppercase tracking-widest`} /></Field>
          )}
          <Field label="You are their…" hint="Optional"><input name="relation" maxLength={40} className={inputCls} placeholder="e.g. daughter, son, carer" /></Field>
          {error && <p role="alert" className="font-bold text-[#b3261e]">{error}</p>}
          <Button big busy={busy} className="w-full">Continue <ArrowRight aria-hidden /></Button>
        </form>
      </div>
    </AppShell>
  )
}
