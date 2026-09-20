import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Heart, MessageSquareText, Smile, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { api, type ApiError } from '../../api/client'
import { Button, ErrorView, inputCls } from '../../components/ui'
import type { PatientDetail, Profile } from './types'

type SectionId = 'basic' | 'personality' | 'memories' | 'communication'
interface FieldDef { key: string; label: string; ph?: string; long?: boolean; kind?: 'language' | 'responds' }
const SECTIONS: { id: SectionId; title: string; blurb: string; icon: typeof Smile; fields: FieldDef[] }[] = [
  { id: 'basic', title: 'Basic information', blurb: 'Name, age and languages', icon: Smile, fields: [
    { key: 'fullName', label: 'Full name' }, { key: 'preferredName', label: 'Preferred name', ph: 'What they like to be called' },
    { key: 'age', label: 'Age' }, { key: 'languages', label: 'Languages they are comfortable with', ph: 'e.g. Tamil, English' },
  ] },
  { id: 'personality', title: 'Personality', blurb: 'Likes, dislikes, favourites, what brings joy', icon: Sparkles, fields: [
    { key: 'likes', label: 'Things they like', long: true }, { key: 'dislikes', label: 'Things they dislike', long: true },
    { key: 'activities', label: 'Favourite activities' }, { key: 'foods', label: 'Favourite foods' }, { key: 'music', label: 'Favourite music' },
    { key: 'places', label: 'Favourite places' }, { key: 'hobbies', label: 'Hobbies' },
    { key: 'happy', label: 'Things that make them happy', long: true }, { key: 'uncomfortable', label: 'Things that make them uncomfortable', long: true },
  ] },
  { id: 'memories', title: 'Personal memories', blurb: 'Places, events, traditions and people', icon: Heart, fields: [
    { key: 'places', label: 'Important places', long: true }, { key: 'events', label: 'Important events', long: true },
    { key: 'childhood', label: 'Favourite childhood memories', long: true }, { key: 'traditions', label: 'Family traditions', long: true },
    { key: 'people', label: 'Important people', long: true }, { key: 'experiences', label: 'Meaningful experiences', long: true },
  ] },
  { id: 'communication', title: 'Communication preferences', blurb: 'Language, text or audio, voice style', icon: MessageSquareText, fields: [
    { key: 'preferredLanguage', label: 'Preferred language for Recallia', kind: 'language' },
    { key: 'respondsBetter', label: 'They respond better to', kind: 'responds' },
    { key: 'voiceStyle', label: 'Preferred voice style', ph: 'e.g. slow and cheerful' },
    { key: 'notes', label: 'Anything else that helps when talking with them', long: true },
  ] },
]

export default function ProfileTab({ pid, detail, onSaved }: { pid: number; detail: PatientDetail; onSaved: (p: Profile, c: PatientDetail['completeness']) => void }) {
  const [open, setOpen] = useState<SectionId | null>(detail.completeness.filled <= 2 ? 'basic' : null)
  const filled = (id: SectionId) => Object.values(detail.profile[id] ?? {}).filter((v) => String(v ?? '').trim()).length

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] bg-white/70 p-5">
        <p className="text-xl font-bold">Add anything you think would help.</p>
        <p className="text-lg text-ink-soft">Nothing here is required. Each section saves on its own, so you can stop any time and continue later. {detail.completeness.filled > 0 && <span className="font-bold text-teal">{detail.completeness.filled} details added so far.</span>}</p>
      </div>
      {SECTIONS.map((s) => (
        <section key={s.id} className="overflow-hidden rounded-[28px] bg-white shadow-sm">
          <button onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} className="flex w-full items-center gap-4 p-5 text-left">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-teal/10 text-teal"><s.icon aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-2xl font-bold">{s.title}</span>
              <span className="block text-base text-ink-soft">{s.blurb}{filled(s.id) ? ` · ${filled(s.id)} added` : ''}</span>
            </span>
            <ChevronDown className={`shrink-0 transition ${open === s.id ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {open === s.id && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <SectionForm pid={pid} section={s} values={detail.profile[s.id] ?? {}} languages={detail.languages}
                  onSaved={(p, c) => { onSaved(p, c) }} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      ))}
    </div>
  )
}

function SectionForm({ pid, section, values, languages, onSaved }: {
  pid: number; section: (typeof SECTIONS)[number]; values: Record<string, string>; languages: PatientDetail['languages']; onSaved: (p: Profile, c: PatientDetail['completeness']) => void
}) {
  const [v, setV] = useState<Record<string, string>>(values)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api.patch<{ profile: Profile; completeness: PatientDetail['completeness'] }>(`/care/patients/${pid}/profile`, { section: section.id, values: v })
      onSaved(r.profile, r.completeness)
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (x) { setErr(x as ApiError) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="grid gap-4 border-t-2 border-ink/5 p-5 sm:grid-cols-2">
      {section.fields.map((f) => (
        <label key={f.key} className={`block text-lg font-bold ${f.long ? 'sm:col-span-2' : ''}`}>
          {f.label} <span className="text-sm font-normal text-ink-soft">(optional)</span>
          {f.kind === 'language' ? (
            <select value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={inputCls}>
              <option value="">Not set</option>
              {languages.map((l) => <option key={l.code} value={l.code}>{l.name} — {l.native}</option>)}
            </select>
          ) : f.kind === 'responds' ? (
            <select value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={inputCls}>
              <option value="">Not sure yet</option><option value="text">Reading text</option><option value="audio">Listening to audio</option><option value="both">Both</option>
            </select>
          ) : f.long ? (
            <textarea value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} maxLength={1000} rows={3} placeholder={f.ph} className={`${inputCls} py-3`} />
          ) : (
            <input value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} maxLength={f.key === 'age' ? 10 : 200} placeholder={f.ph} className={inputCls} />
          )}
        </label>
      ))}
      {err && <div className="sm:col-span-2"><ErrorView error={err} /></div>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button busy={busy}>Save</Button>
        {saved && <span role="status" className="flex items-center gap-1 text-lg font-bold text-teal"><Check aria-hidden /> Saved and synced</span>}
      </div>
    </form>
  )
}
