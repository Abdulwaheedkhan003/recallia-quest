import { Activity, Camera, HeartHandshake, Images, MonitorSmartphone, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import SyncPill from '../../components/SyncPill'
import { Button, ErrorView, Loading, Sheet } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import { useLive } from '../../state/realtime'
import Gallery from './Gallery'
import Monitoring from './Monitoring'
import ProfileTab from './ProfileTab'
import { areaLabel, type PatientDetail } from './types'

const TABS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'monitor', label: 'Monitoring', icon: Activity },
] as const

export default function PatientSpace({ pid, tab }: { pid: number; tab: 'profile' | 'gallery' | 'monitor' }) {
  const { query } = useRoute()
  const { data, error, loading, reload, setData } = useApi<PatientDetail>(`/care/patients/${pid}`, ['care:changed'])
  const [pairOpen, setPairOpen] = useState(false)
  const [online, setOnline] = useState<boolean | null>(null)
  useLive(['presence'], (e) => { if (e.userId === pid) setOnline(Boolean(e.online)) })
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoErr, setPhotoErr] = useState<ApiError | null>(null)

  if (error) return <AppShell title="Caretaker space" home="/care" story={false}><ErrorView error={error} onRetry={reload} /></AppShell>
  if (loading || !data) return <AppShell title="Caretaker space" home="/care" story={false}><Loading /></AppShell>
  const p = data.patient
  const isOnline = online ?? p.online
  const name = data.profile.basic?.preferredName || p.name

  const uploadPhoto = async (f: File) => {
    const fd = new FormData(); fd.append('file', f)
    try { const r = await api.post<{ photo: string }>(`/care/patients/${pid}/photo`, fd); setData({ ...data, patient: { ...p, photo: r.photo } }); setPhotoErr(null) } catch (e) { setPhotoErr(e as ApiError) }
  }

  return (
    <AppShell title="Caretaker space" icon={<HeartHandshake className="text-teal" aria-hidden />} home="/care" homeLabel="All" story={false} tone="bg-[linear-gradient(180deg,#eef5f3,#fff8ec)]">
      <section className="flex flex-wrap items-center gap-5 rounded-[32px] bg-white p-5 shadow-sm">
        <button onClick={() => photoInput.current?.click()} className="group relative shrink-0" aria-label="Change profile photo">
          {p.photo ? <img src={p.photo} alt="" className="size-24 rounded-full object-cover" /> : <span className="grid size-24 place-items-center rounded-full bg-sky text-5xl" aria-hidden>🙂</span>}
          <span className="absolute -bottom-1 -right-1 grid size-10 place-items-center rounded-full bg-ink text-cream shadow"><Camera size={18} aria-hidden /></span>
        </button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = '' }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-3xl font-bold">{name}</h2>
          <p className="text-base text-ink-soft">{isOnline && p.current ? `Currently using ${areaLabel(p.current.area)}` : isOnline ? 'Recallia is open on their device' : 'Not using Recallia right now'}</p>
          <div className="mt-2"><SyncPill variant="caretaker" patientOnline={isOnline} /></div>
        </div>
        {p.managed && <Button variant="secondary" onClick={() => setPairOpen(true)}><MonitorSmartphone aria-hidden /> Open on their device</Button>}
      </section>
      {photoErr && <div className="mt-3"><ErrorView error={photoErr} /></div>}

      {query.get('welcome') && tab === 'profile' && (
        <p className="mt-4 rounded-[24px] bg-teal/10 p-4 text-lg"><b>{name}'s profile is ready.</b> Add anything you think would help — a few details are plenty to start. Then add people in the <button className="font-bold underline" onClick={() => navigate(`/care/p/${pid}/gallery`)}>Gallery</button>.</p>
      )}

      <nav className="mt-6 grid grid-cols-3 gap-2 rounded-full bg-white p-1.5 shadow-sm" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => navigate(`/care/p/${pid}/${t.id}`)} aria-current={tab === t.id ? 'page' : undefined}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-full text-lg font-bold transition ${tab === t.id ? 'bg-ink text-cream' : 'text-ink-soft hover:bg-ink/5'}`}>
            <t.icon size={20} aria-hidden /> <span className="hidden sm:inline">{t.label}</span><span className="sm:hidden">{t.label.slice(0, 7)}</span>
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'profile' && <ProfileTab pid={pid} detail={data} onSaved={(profile, completeness) => setData({ ...data, profile, completeness })} />}
        {tab === 'gallery' && <Gallery pid={pid} patientName={name} />}
        {tab === 'monitor' && <Monitoring pid={pid} patientName={name} />}
      </div>

      <PairSheet open={pairOpen} onClose={() => setPairOpen(false)} pid={pid} name={name} />
    </AppShell>
  )
}

function PairSheet({ open, onClose, pid, name }: { open: boolean; onClose: () => void; pid: number; name: string }) {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null)
  const [err, setErr] = useState<ApiError | null>(null)
  const make = async () => { try { setCode(await api.post(`/care/patients/${pid}/pair-code`)); setErr(null) } catch (e) { setErr(e as ApiError) } }
  return (
    <Sheet open={open} onClose={() => { setCode(null); onClose() }} title={`Open Recallia on ${name}'s device`}>
      <ol className="list-decimal space-y-2 pl-6 text-lg">
        <li>On their tablet or computer, open Recallia and press <b>Try Recallia</b> → <b>Dementia Patient</b>.</li>
        <li>Type this code. It works once and expires in 15 minutes.</li>
      </ol>
      {code ? (
        <p className="mt-5 rounded-[24px] bg-amber/20 p-6 text-center font-mono text-6xl font-bold tracking-[0.2em]">{code.code}</p>
      ) : (
        <Button big className="mt-5 w-full" onClick={make}>Create a code</Button>
      )}
      {code && <p className="mt-2 text-center text-base text-ink-soft">Valid until {new Date(code.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
      {err && <div className="mt-3"><ErrorView error={err} /></div>}
      <p className="mt-5 text-base text-ink-soft">Their device stays signed in. They never need a password.</p>
    </Sheet>
  )
}
