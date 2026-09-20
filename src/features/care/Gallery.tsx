import { motion } from 'framer-motion'
import { Camera, Check, Image as ImageIcon, Mic, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { useApi } from '../../api/useApi'
import { Button, ErrorView, Field, inputCls, Loading, Sheet, translated } from '../../components/ui'
import { navigate } from '../../lib/router'
import { useT } from '../../state/settings'
import type { PersonSummary } from './types'

/** Gallery = people who matter + their photos, audio and memories (evidence for remembrance stories). */
export default function Gallery({ pid, patientName }: { pid: number; patientName: string }) {
  const { data, error, loading, reload } = useApi<{ people: PersonSummary[] }>(`/care/patients/${pid}/people`, ['care:changed'])
  const [adding, setAdding] = useState(false)
  const [demoErr, setDemoErr] = useState<ApiError | null>(null)
  const real = data?.people.filter((p) => !p.isDemo) ?? []
  const hasDemo = data?.people.some((p) => p.isDemo)

  const demo = async (on: boolean) => {
    try { if (on) await api.post(`/care/patients/${pid}/demo`); else await api.del(`/care/patients/${pid}/demo`); setDemoErr(null); void reload() } catch (e) { setDemoErr(e as ApiError) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-3xl font-bold">Gallery</h3>
          <p className="text-lg text-ink-soft">People who matter to {patientName}. A photo, a name and how they are related is enough to start.</p>
        </div>
        <Button big onClick={() => setAdding(true)}><Plus aria-hidden /> Add Avatar</Button>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}

      <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <button onClick={() => setAdding(true)} className="flex h-full min-h-64 w-full flex-col items-center justify-center gap-3 rounded-[32px] border-2 border-dashed border-teal/40 bg-white/60 p-6 text-center hover:bg-white">
            <span className="grid size-20 place-items-center rounded-full bg-teal/10 text-teal"><Camera size={36} aria-hidden /></span>
            <span className="text-2xl font-bold">Add Avatar</span>
            <span className="text-base text-ink-soft">Photo → name → relationship → save</span>
          </button>
        </li>
        {data?.people.map((p, i) => (
          <motion.li key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <button onClick={() => navigate(`/care/p/${pid}/person/${p.id}`)} className="h-full w-full overflow-hidden rounded-[32px] bg-white text-left shadow-sm ring-2 ring-transparent hover:ring-teal/40">
              <div className="aspect-[4/3] bg-sky">
                {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : <div className="grid size-full place-items-center text-6xl" aria-hidden>🙂</div>}
              </div>
              <div className="p-5">
                <p className="text-2xl font-bold">{p.name}</p>
                <p className="text-lg text-ink-soft">{p.relationship || 'Relationship not added yet'}</p>
                <p className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
                  <span className="flex items-center gap-1 rounded-full bg-cream px-3 py-1"><ImageIcon size={14} aria-hidden /> {p.photos}</span>
                  <span className="flex items-center gap-1 rounded-full bg-cream px-3 py-1"><Mic size={14} aria-hidden /> {p.audio}</span>
                  <span className="rounded-full bg-cream px-3 py-1">{p.memories} memories</span>
                  {p.isDemo && <span className="rounded-full bg-amber/25 px-3 py-1 text-amber-deep">Sample data</span>}
                </p>
                <p className="mt-2 text-base font-bold text-teal">
                  {p.photos + p.memories === 0 ? 'Add a photo or a memory to start' : p.memories === 0 ? `${p.name.replace(/^Sample: /, '')}'s profile is ready — add memories whenever you want` : 'Ready for a remembrance story'}
                </p>
              </div>
            </button>
          </motion.li>
        ))}
      </ul>

      <div className="mt-8 rounded-[24px] bg-white/60 p-5">
        {hasDemo ? (
          <p className="flex flex-wrap items-center gap-3 text-lg">Sample data is shown with an orange label and is kept separate from your real photos.
            <Button variant="secondary" onClick={() => demo(false)}><Trash2 aria-hidden /> Remove sample</Button></p>
        ) : real.length === 0 ? (
          <p className="flex flex-wrap items-center gap-3 text-lg">Want to see how it works first?
            <Button variant="secondary" onClick={() => demo(true)}><Sparkles aria-hidden /> Add a sample person</Button>
            <span className="text-base text-ink-soft">Uses illustrations made for Recallia, never real photos.</span></p>
        ) : null}
        {demoErr && <div className="mt-2"><ErrorView error={demoErr} /></div>}
      </div>

      <QuickAdd open={adding} pid={pid} onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); navigate(`/care/p/${pid}/person/${id}?new=1`) }} />
    </div>
  )
}

function QuickAdd({ open, pid, onClose, onDone }: { open: boolean; pid: number; onClose: () => void; onDone: (id: number) => void }) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const pick = (f: File | null) => { setFile(f); if (preview) URL.revokeObjectURL(preview); setPreview(f ? URL.createObjectURL(f) : null) }
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (file) fd.append('file', file)
    setBusy(true); setError('')
    try {
      const r = await api.post<{ person: { id: number } }>(`/care/patients/${pid}/people`, fd)
      pick(null)
      onDone(r.person.id)
    } catch (err) { setError(translated(t, err as ApiError)) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add Avatar">
      <form onSubmit={submit} className="space-y-5">
        <button type="button" onClick={() => input.current?.click()} className="flex w-full items-center gap-5 rounded-[28px] border-2 border-dashed border-ink/20 bg-white p-4 text-left">
          {preview ? <img src={preview} alt="" className="size-28 rounded-2xl object-cover" /> : <span className="grid size-28 place-items-center rounded-2xl bg-sky"><Camera size={40} aria-hidden /></span>}
          <span><span className="block text-xl font-bold">{preview ? 'Change photo' : 'Choose a photo'}</span><span className="text-base text-ink-soft">Optional — you can add it later</span></span>
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        <Field label="Name"><input name="name" required maxLength={80} className={inputCls} placeholder="e.g. John" /></Field>
        <Field label="Relationship to them" hint="e.g. brother, daughter, best friend"><input name="relationship" maxLength={60} className={inputCls} /></Field>
        {error && <p role="alert" className="font-bold text-[#b3261e]">{error}</p>}
        <Button big busy={busy} className="w-full"><Check aria-hidden /> Save</Button>
        <p className="text-base text-ink-soft">Photos are private: only you, other linked caretakers and the person you care for can see them.</p>
      </form>
    </Sheet>
  )
}
