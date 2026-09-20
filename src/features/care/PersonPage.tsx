import { motion } from 'framer-motion'
import { ArrowLeft, BookOpen, Camera, Check, Lock, Mic, Pencil, RefreshCw, Square, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Button, ErrorView, Field, inputCls, Loading, Sheet } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import { MEMORY_TYPES, type PersonDetail, type PersonItem } from './types'
import { useLive } from '../../state/realtime'
import { PrivateAiCard } from './PrivateAi'

const DETAIL_FIELDS: [string, string, string][] = [
  ['whyImportant', 'Why is this person important?', 'e.g. They raised each other after their father passed'],
  ['usuallyTogether', 'What did they usually do together?', 'e.g. Played cricket every Sunday'],
  ['firstMet', 'Where did they first meet?', ''],
  ['meaningfulPlace', 'A meaningful place connected with them', 'e.g. Marina beach'],
  ['notes', 'Anything else', ''],
]
const PHOTO_FIELDS: [string, string][] = [
  ['whatHappening', 'What was happening in this photo?'],
  ['funMoment', 'What fun moment does it represent?'],
  ['place', 'Where was it taken?'],
  ['when', 'When was it taken?'],
]

/** One important person ("avatar"): profile, photos, audio, memories and the remembrance story built from them. */
export default function PersonPage({ pid, personId }: { pid: number; personId: number }) {
  const { query } = useRoute()
  const { data, error, loading, reload } = useApi<PersonDetail>(`/care/people/${personId}`, ['care:changed'])
  const [err, setErr] = useState<ApiError | null>(null)
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); setErr(null); await reload() } catch (e) { setErr(e as ApiError) } }

  return (
    <AppShell title="Gallery" icon={<Camera className="text-teal" aria-hidden />} home={`/care/p/${pid}/gallery`} homeLabel="Gallery" story={false} tone="bg-[linear-gradient(180deg,#eef5f3,#fff8ec)]">
      <button onClick={() => navigate(`/care/p/${pid}/gallery`)} className="mb-4 flex min-h-12 items-center gap-1 rounded-full bg-white px-5 text-lg font-bold shadow-sm"><ArrowLeft aria-hidden /> All people</button>
      {loading && !data && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {err && <div className="mb-4"><ErrorView error={err} /></div>}
      {data && (
        <div className="space-y-6">
          {query.get('new') && <p className="rounded-[24px] bg-teal/10 p-4 text-lg"><b>{data.person.name}'s profile is ready.</b> Add more photos, a voice recording or memories whenever you want — each one is saved straight away.</p>}
          <Header d={data} act={act} />
          <Photos d={data} act={act} />
          <Audio d={data} act={act} />
          <Memories d={data} act={act} />
          <StoryPanel d={data} onChanged={reload} />
          <div className="pt-4">
            <Button variant="danger" onClick={() => { if (confirm(`Remove ${data.person.name} and all their photos, audio and memories?`)) void act(async () => { await api.del(`/care/people/${personId}`); navigate(`/care/p/${pid}/gallery`) }) }}>
              <Trash2 aria-hidden /> Remove {data.person.name}
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  )
}

type Act = (fn: () => Promise<unknown>) => Promise<void>

function Header({ d, act }: { d: PersonDetail; act: Act }) {
  const p = d.person
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState({ name: p.name, relationship: p.relationship, phone: p.phone ?? '', details: p.details })
  useEffect(() => setV({ name: p.name, relationship: p.relationship, phone: p.phone ?? '', details: p.details }), [p.name, p.relationship, p.phone, p.details])
  const save = (e: React.FormEvent) => { e.preventDefault(); void act(async () => { await api.patch(`/care/people/${p.id}`, v); setEdit(false) }) }
  return (
    <section className="rounded-[32px] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-5">
        {p.avatar ? <img src={p.avatar} alt="" className="size-28 rounded-[28px] object-cover" /> : <span className="grid size-28 place-items-center rounded-[28px] bg-sky text-5xl" aria-hidden>🙂</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-4xl font-bold">{p.name}</h2>
          <p className="text-xl text-ink-soft">{p.relationship || 'Relationship not added'}</p>
          {p.isDemo && <p className="mt-1 text-sm font-bold text-amber-deep">Sample data — separate from your real family photos</p>}
        </div>
        {!edit && <Button variant="secondary" onClick={() => setEdit(true)}><Pencil aria-hidden /> Edit details</Button>}
      </div>
      {!edit && (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {DETAIL_FIELDS.filter(([k]) => p.details[k]).map(([k, label]) => (
            <div key={k} className="rounded-2xl bg-cream p-4"><dt className="text-base font-bold text-ink-soft">{label}</dt><dd className="text-lg">{p.details[k]}</dd></div>
          ))}
          {p.phone && <div className="rounded-2xl bg-cream p-4"><dt className="flex items-center gap-1 text-base font-bold text-ink-soft"><Lock size={14} aria-hidden /> Phone (caretakers only)</dt><dd className="text-lg">{p.phone}</dd></div>}
        </dl>
      )}
      {edit && (
        <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={80} className={inputCls} /></Field>
          <Field label="Relationship"><input value={v.relationship} onChange={(e) => setV({ ...v, relationship: e.target.value })} maxLength={60} className={inputCls} /></Field>
          {DETAIL_FIELDS.map(([k, label, ph]) => (
            <label key={k} className="block text-lg font-bold sm:col-span-2">{label} <span className="text-sm font-normal text-ink-soft">(optional)</span>
              <textarea value={v.details[k] ?? ''} onChange={(e) => setV({ ...v, details: { ...v.details, [k]: e.target.value } })} rows={2} maxLength={1000} placeholder={ph} className={`${inputCls} py-3`} /></label>
          ))}
          <Field label="Phone number (optional)" hint="Encrypted. Only caretakers can see it — never shown on the patient's screen.">
            <input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" maxLength={30} className={inputCls} /></Field>
          <div className="flex gap-3 sm:col-span-2"><Button>Save</Button><Button type="button" variant="ghost" onClick={() => setEdit(false)}>Cancel</Button></div>
        </form>
      )}
    </section>
  )
}

function Photos({ d, act }: { d: PersonDetail; act: Act }) {
  const photos = d.items.filter((i) => i.kind === 'photo')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PersonItem | null>(null)
  return (
    <section className="rounded-[32px] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-bold">Photos <span className="text-ink-soft">({photos.length})</span></h3>
        <Button onClick={() => setAdding(true)}><Upload aria-hidden /> Add photo</Button>
      </div>
      <p className="text-base text-ink-soft">Portraits, group photos, special days. Tell us about a photo whenever you like.</p>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((ph) => (
          <li key={ph.id} className="overflow-hidden rounded-[24px] bg-cream">
            <div className="relative">
              {ph.url && <img src={ph.url} alt={String(ph.meta.whatHappening || ph.meta.description || '')} className="aspect-square w-full object-cover" />}
              {d.person.avatarItemId === ph.id && <span className="absolute left-2 top-2 rounded-full bg-ink px-3 py-1 text-sm font-bold text-cream">Profile photo</span>}
            </div>
            <div className="space-y-1 p-3 text-base">
              {PHOTO_FIELDS.filter(([k]) => ph.meta[k]).slice(0, 2).map(([k]) => <p key={k} className="line-clamp-2">{String(ph.meta[k])}</p>)}
              <div className="flex flex-wrap gap-1 pt-1">
                <button onClick={() => setEditing(ph)} className="min-h-10 rounded-full bg-white px-3 text-sm font-bold">About this photo</button>
                {d.person.avatarItemId !== ph.id && <button onClick={() => act(() => api.patch(`/care/people/${d.person.id}`, { avatarItemId: ph.id }))} className="flex min-h-10 items-center gap-1 rounded-full bg-white px-3 text-sm font-bold"><Star size={14} aria-hidden /> Use as profile</button>}
                <button onClick={() => { if (confirm('Delete this photo?')) void act(() => api.del(`/care/items/${ph.id}`)) }} aria-label="Delete photo" className="grid size-10 place-items-center rounded-full bg-white text-[#b3261e]"><Trash2 size={16} /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <UploadSheet open={adding} kind="photo" personId={d.person.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void act(async () => {}) }} />
      <MetaSheet item={editing} onClose={() => setEditing(null)} onSave={(meta) => act(async () => { await api.patch(`/care/items/${editing!.id}`, { meta }); setEditing(null) })} />
    </section>
  )
}

function UploadSheet({ open, kind, personId, onClose, onDone, file: presetFile }: { open: boolean; kind: 'photo' | 'audio'; personId: number; onClose: () => void; onDone: () => void; file?: File | null }) {
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  useEffect(() => { if (open) { setFile(presetFile ?? null); setMeta({}); setErr(null) } }, [open, presetFile])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    const fd = new FormData()
    fd.append('meta', JSON.stringify(meta))
    fd.append('file', file)
    setBusy(true)
    try { await api.post(`/care/people/${personId}/items`, fd); onDone() } catch (x) { setErr(x as ApiError) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={kind === 'photo' ? 'Add a photo' : 'Add a recording'}>
      <form onSubmit={submit} className="space-y-4">
        {!presetFile && (
          <Field label={kind === 'photo' ? 'Photo' : 'Audio file'}>
            <input type="file" required accept={kind === 'photo' ? 'image/*' : 'audio/*'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputCls} py-3`} />
          </Field>
        )}
        {presetFile && <p className="rounded-2xl bg-teal/10 p-3 text-lg font-bold">Recording ready ({Math.round(presetFile.size / 1024)} KB)</p>}
        {kind === 'photo' ? PHOTO_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} hint="Optional"><input value={String(meta[k] ?? '')} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} maxLength={k === 'when' ? 100 : 500} className={inputCls} /></Field>
        )) : (
          <Field label="What is this recording?" hint="Optional — e.g. 'John telling the story of the cricket match'"><input value={String(meta.description ?? '')} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={500} className={inputCls} /></Field>
        )}
        {kind === 'photo' && (
          <label className="flex min-h-14 items-center gap-3 text-lg font-bold"><input type="checkbox" checked={Boolean(meta.group)} onChange={(e) => setMeta({ ...meta, group: e.target.checked })} className="size-6" /> This is a group photo</label>
        )}
        {err && <ErrorView error={err} />}
        <Button big busy={busy} disabled={!file} className="w-full"><Check aria-hidden /> Save</Button>
      </form>
    </Sheet>
  )
}

function MetaSheet({ item, onClose, onSave }: { item: PersonItem | null; onClose: () => void; onSave: (meta: Record<string, string>) => void }) {
  const [meta, setMeta] = useState<Record<string, string>>({})
  useEffect(() => { if (item) setMeta(Object.fromEntries(Object.entries(item.meta).filter(([, v]) => typeof v === 'string')) as Record<string, string>) }, [item])
  return (
    <Sheet open={Boolean(item)} onClose={onClose} title="About this photo">
      <form onSubmit={(e) => { e.preventDefault(); onSave(meta) }} className="space-y-4">
        {item?.url && <img src={item.url} alt="" className="max-h-64 rounded-2xl object-cover" />}
        {PHOTO_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} hint="Optional"><input value={meta[k] ?? ''} onChange={(e) => setMeta({ ...meta, [k]: e.target.value })} maxLength={500} className={inputCls} /></Field>
        ))}
        <Button big className="w-full">Save</Button>
      </form>
    </Sheet>
  )
}

function Audio({ d, act }: { d: PersonDetail; act: Act }) {
  const audio = d.items.filter((i) => i.kind === 'audio')
  const [adding, setAdding] = useState(false)
  const [recorded, setRecorded] = useState<File | null>(null)
  return (
    <section className="rounded-[32px] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-bold">Voice &amp; audio <span className="text-ink-soft">({audio.length})</span></h3>
        <div className="flex flex-wrap gap-2">
          <Recorder onDone={(f) => setRecorded(f)} />
          <Button variant="secondary" onClick={() => setAdding(true)}><Upload aria-hidden /> Upload audio</Button>
        </div>
      </div>
      <p className="text-base text-ink-soft">A description of the person, a memory, a short story — or their own voice, if they are happy for it to be shared.</p>
      <ul className="mt-4 space-y-3">
        {audio.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream p-3">
            {a.url && <audio src={a.url} controls preload="none" className="max-w-full" />}
            <span className="min-w-0 flex-1 text-lg">{String(a.meta.description || 'Recording')}</span>
            <button onClick={() => { if (confirm('Delete this recording?')) void act(() => api.del(`/care/items/${a.id}`)) }} aria-label="Delete recording" className="grid size-12 place-items-center rounded-full bg-white text-[#b3261e]"><Trash2 size={18} /></button>
          </li>
        ))}
      </ul>
      <UploadSheet open={adding || Boolean(recorded)} kind="audio" personId={d.person.id} file={recorded}
        onClose={() => { setAdding(false); setRecorded(null) }} onDone={() => { setAdding(false); setRecorded(null); void act(async () => {}) }} />
    </section>
  )
}

/** Record in the browser (MediaRecorder). The file is uploaded only to this Recallia server. */
function Recorder({ onDone }: { onDone: (f: File) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState('')
  const chunks = useRef<Blob[]>([])
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t) }, [rec])
  if (typeof MediaRecorder === 'undefined') return null
  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const mime = (r.mimeType || type || 'audio/webm').split(';')[0]
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm'
        onDone(new File(chunks.current, `recording.${ext}`, { type: mime }))
        setRec(null)
      }
      r.start()
      setSecs(0)
      setRec(r)
    } catch { setErr('The microphone could not be used. Check the browser permission.') }
  }
  return (
    <span className="flex items-center gap-2">
      {rec
        ? <Button variant="danger" onClick={() => rec.stop()}><Square aria-hidden /> Stop ({secs}s)</Button>
        : <Button onClick={start}><Mic aria-hidden /> Record</Button>}
      {err && <span role="alert" className="text-base font-bold text-[#b3261e]">{err}</span>}
    </span>
  )
}

function Memories({ d, act }: { d: PersonDetail; act: Act }) {
  const [type, setType] = useState('memory')
  const [content, setContent] = useState('')
  const [related, setRelated] = useState<number | ''>('')
  const photos = d.items.filter((i) => i.kind === 'photo')
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    void act(async () => { await api.post(`/care/people/${d.person.id}/memories`, { type, content, relatedItemId: related || null }); setContent(''); setRelated('') })
  }
  return (
    <section className="rounded-[32px] bg-white p-6 shadow-sm">
      <h3 className="text-2xl font-bold">Memories <span className="text-ink-soft">({d.memories.length})</span></h3>
      <p className="text-base text-ink-soft">Write it the way you would tell it. The story will use only what you write here — nothing is made up.</p>
      <ul className="mt-4 space-y-3">
        {d.memories.map((m) => (
          <motion.li key={m.id} layout className="flex items-start gap-3 rounded-2xl bg-cream p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold uppercase tracking-wide text-teal">{MEMORY_TYPES.find((t) => t.id === m.type)?.label ?? m.type}</p>
              <p className="text-lg">{m.content}</p>
              <p className="text-sm text-ink-soft">Added by {m.source === 'demo' ? 'sample data' : m.author ?? 'a caretaker'} · {new Date(m.created_at).toLocaleDateString()}</p>
            </div>
            {m.related_item_id && photos.find((p) => p.id === m.related_item_id)?.url && <img src={photos.find((p) => p.id === m.related_item_id)!.url!} alt="" className="size-16 rounded-xl object-cover" />}
            <button onClick={() => act(() => api.del(`/care/memories/${m.id}`))} aria-label="Delete memory" className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#b3261e]"><Trash2 size={16} /></button>
          </motion.li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-5 grid gap-3 rounded-[24px] bg-teal/5 p-4 sm:grid-cols-2">
        <label className="block text-lg font-bold">Kind of memory
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>{MEMORY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        </label>
        <label className="block text-lg font-bold">Related photo <span className="text-sm font-normal text-ink-soft">(optional)</span>
          <select value={related} onChange={(e) => setRelated(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
            <option value="">None</option>
            {photos.map((p, i) => <option key={p.id} value={p.id}>Photo {i + 1}{p.meta.whatHappening ? ` — ${String(p.meta.whatHappening).slice(0, 30)}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-lg font-bold sm:col-span-2">{MEMORY_TYPES.find((t) => t.id === type)?.hint}
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={1000} className={`${inputCls} py-3`} placeholder="e.g. They played cricket together every Sunday." /></label>
        <div className="sm:col-span-2"><Button disabled={!content.trim()}>Add memory</Button></div>
      </form>
    </section>
  )
}

function StoryPanel({ d, onChanged }: { d: PersonDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [preview, setPreview] = useState<{ story: { title: string; introduction: string; onYes: string; onNo: string; closing: string; steps: { type: string; text?: string; caption?: string }[] }; generator: string } | null>(null)
  const s = d.story
  // Live progress from the private AI writing this person's story (background or preview).
  const [live, setLive] = useState<{ phase: string; chars: number } | null>(null)
  useLive(['story:progress'], (e) => {
    if (e.type !== 'story:progress' || e.personId !== d.person.id) return
    setLive(e.phase === 'done' || e.phase === 'failed' ? null : { phase: String(e.phase), chars: Number(e.chars ?? 0) })
  })
  const build = async (force: boolean) => {
    setBusy(true); setErr(null)
    try { setPreview(await api.post(`/care/people/${d.person.id}/story`, { force })); onChanged() } catch (e) { setErr(e as ApiError) } finally { setBusy(false) }
  }
  const enough = d.memories.length + d.items.length > 0
  const by = (g: string | null) => (!g ? '' : g.startsWith('local:') ? `written by the private AI on this computer (${g.slice(6)})` : g.startsWith('cloud:') ? 'written by the cloud AI (allowed by the administrator)' : 'built directly from your notes (the local AI model was not running)')
  return (
    <section className="rounded-[32px] bg-gradient-to-br from-[#fff1d6] to-[#f3edff] p-6 shadow-sm">
      <h3 className="flex items-center gap-2 text-2xl font-bold"><BookOpen aria-hidden /> Remembrance story</h3>
      <p className="mt-1 text-lg">
        {!enough ? 'Add a photo or a memory and a gentle story will be made from it.'
          : s.ready && s.upToDate ? `Ready on their device — ${by(s.generator)}.`
          : s.ready ? 'You added new things — the story is being updated automatically.'
          : 'The story is being prepared automatically. You can preview it now.'}
      </p>
      {live && (
        <p role="status" className="mt-2 flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-lg font-bold text-teal">
          <span className="size-3 animate-pulse rounded-full bg-teal" aria-hidden />
          {live.phase === 'queued' ? 'Waiting for the private AI…' : `Private AI is writing the story${live.chars ? ` — about ${Math.max(1, Math.round(live.chars / 6))} words so far` : '…'}`}
        </p>
      )}
      <div className="mt-3"><PrivateAiCard compact /></div>
      <p className="mt-1 text-base text-ink-soft">Stories use only what you added here. Private memories stay on your own server and are sent only to the local AI model.</p>
      {enough && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button busy={busy} onClick={() => build(false)}><BookOpen aria-hidden /> Preview story</Button>
          {s.ready && <Button variant="secondary" busy={busy} onClick={() => build(true)}><RefreshCw aria-hidden /> Rebuild</Button>}
        </div>
      )}
      {err && <div className="mt-3"><ErrorView error={err} /></div>}
      {preview && (
        <ol className="mt-5 space-y-2 rounded-[24px] bg-white/80 p-5 text-lg">
          <li className="text-2xl font-bold">{preview.story.title}</li>
          <li className="text-sm text-ink-soft">{by(preview.generator)}</li>
          <li>{preview.story.introduction}</li>
          <li>📷 "Do you remember this person?" → yes: <i>{preview.story.onYes}</i> · no: <i>{preview.story.onNo}</i></li>
          {preview.story.steps.map((st, i) => (
            <li key={i}>{st.type === 'photo' ? '📷' : st.type === 'audio' ? '🔊' : st.type === 'question' ? '❓' : '💬'} {st.text || st.caption || (st.type === 'photo' ? 'Photo' : 'Recording')}</li>
          ))}
          <li>{preview.story.closing}</li>
        </ol>
      )}
    </section>
  )
}
