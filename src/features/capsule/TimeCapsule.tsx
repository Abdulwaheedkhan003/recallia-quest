import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Hourglass, MapPin, Mic, Plus, Users, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, mediaUrl, type ApiError } from '../../api/client'
import type { Memory } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Button, Empty, ErrorView, Loading } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { speak, useSpeechInput } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'
import AddMemory from './AddMemory'

const KIND_EMOJI = { photo: '📷', audio: '🎙️', video: '🎞️', note: '💌' }
const TONES = ['from-amber to-coral', 'from-teal to-leaf', 'from-lavender to-[#6f5ee8]', 'from-[#2563eb] to-sky', 'from-coral to-[#be185d]']

export function MemoryMedia({ m, className = '' }: { m: Memory; className?: string }) {
  if (!m.media_id) return null
  const src = mediaUrl(m.media_id)
  if (m.kind === 'photo') return <img src={src} alt={m.title} className={`w-full rounded-3xl object-contain ${className}`} />
  if (m.kind === 'video') return <video src={src} controls className={`w-full rounded-3xl ${className}`} />
  return <audio src={src} controls className="w-full" />
}

export default function TimeCapsule() {
  const { t, lang } = useSettings()
  const { data, error, loading, reload } = useApi<{ memories: Memory[] }>('/memories', ['memories:changed'])
  const [open, setOpen] = useState<Memory | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <AppShell title={t('hub.capsule')} icon={<Hourglass className="text-teal" aria-hidden />} tone="bg-[linear-gradient(180deg,#e3f5ef_0%,#fdf3e1_100%)]">
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {data && !open && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl text-ink-soft">{t('capsule.intro')}</p>
            <Button variant="secondary" onClick={() => setAdding(true)}><Plus aria-hidden /> {t('capsule.add')}</Button>
          </div>
          {data.memories.length === 0 ? (
            <Empty title={t('capsule.emptyTitle')} body={t('capsule.emptyBody')}><Button big onClick={() => setAdding(true)}><Plus aria-hidden /> {t('capsule.add')}</Button></Empty>
          ) : (
            /* The memory journey: a winding path of stepping stones through time */
            <ol className="relative flex snap-x gap-8 overflow-x-auto px-4 pb-10 pt-6" aria-label={t('capsule.journey')}>
              <div aria-hidden className="pointer-events-none absolute left-0 right-0 top-[55%] h-3 rounded-full bg-[repeating-linear-gradient(90deg,#d9b36c_0_24px,transparent_24px_40px)]" style={{ minWidth: data.memories.length * 260 }} />
              {data.memories.map((m, i) => (
                <motion.li key={m.id} className="relative shrink-0 snap-center" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: i % 2 ? 40 : 0 }} transition={{ delay: i * 0.07 }}>
                  <button onClick={() => setOpen(m)} className="group w-56 rounded-[32px] bg-white p-3 text-left shadow-xl transition hover:-translate-y-2 hover:rotate-[-1deg]">
                    <div className={`grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl bg-gradient-to-br ${TONES[i % TONES.length]}`}>
                      {m.kind === 'photo' && m.media_id ? <img src={mediaUrl(m.media_id)} alt="" loading="lazy" className="size-full object-cover" /> : <span className="text-6xl" aria-hidden>{KIND_EMOJI[m.kind]}</span>}
                    </div>
                    <p className="mt-3 text-xl font-bold leading-tight">{m.title}</p>
                    <p className="text-base text-ink-soft">{m.happened_on ? fmtDate(m.happened_on, lang) : t('capsule.anytime')}</p>
                    {m.last_answer && <p className="mt-1 flex items-center gap-1 text-sm font-bold text-teal"><Check size={16} aria-hidden /> {t('capsule.visited')}</p>}
                  </button>
                </motion.li>
              ))}
            </ol>
          )}
        </>
      )}
      <AnimatePresence>{open && <MemoryJourney key={open.id} m={open} onBack={() => { setOpen(null); reload() }} />}</AnimatePresence>
      <AddMemory open={adding} onClose={() => setAdding(false)} onSaved={reload} />
    </AppShell>
  )
}

function MemoryJourney({ m, onBack }: { m: Memory; onBack: () => void }) {
  const { t, lang } = useSettings()
  const questions: { q: TKey; reveal: string }[] = [
    ...(m.people ? [{ q: 'capsule.qWho' as TKey, reveal: m.people }] : []),
    ...(m.place ? [{ q: 'capsule.qWhere' as TKey, reveal: m.place }] : []),
    { q: 'capsule.qRemember', reveal: m.description },
  ]
  const [step, setStep] = useState(0)
  const [answer, setAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const mic = useSpeechInput(lang, (s) => setAnswer((a) => (a ? a + ' ' : '') + s))
  const cur = questions[step]

  useEffect(() => { api.post(`/memories/${m.id}/visit`).catch(() => {}) }, [m.id])

  const submit = async () => {
    try {
      if (answer.trim()) await api.post(`/memories/${m.id}/answer`, { question: t(cur.q), answer: answer.trim() })
      setRevealed(true)
      setErr(null)
    } catch (e) {
      setErr(e as ApiError)
    }
  }
  const next = () => { setStep((s) => s + 1); setAnswer(''); setRevealed(false) }

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="grid gap-6 lg:grid-cols-2">
      <div>
        <Button variant="secondary" onClick={onBack}><ArrowLeft aria-hidden /> {t('capsule.back')}</Button>
        <div className="mt-4 rounded-[36px] bg-white p-4 shadow-xl">
          <MemoryMedia m={m} className="max-h-[60vh]" />
          {m.kind === 'note' && <p className="p-4 text-2xl leading-relaxed">{m.description}</p>}
          <h2 className="mt-4 px-2 text-3xl font-bold">{m.title}</h2>
          <div className="mt-2 flex flex-wrap gap-3 px-2 pb-2 text-lg text-ink-soft">
            {m.happened_on && <span>🗓️ {fmtDate(m.happened_on, lang)}</span>}
            <span>{t('capsule.sharedBy', { name: m.author_name })}</span>
          </div>
        </div>
      </div>

      <div className="rounded-[36px] bg-[linear-gradient(135deg,#fdf1d8,#f8e3bb)] p-6 shadow-[inset_0_0_0_6px_#e9c98a]">
        {cur ? (
          <>
            <p className="text-lg font-bold text-[#8a5a12]">{t('capsule.question', { n: step + 1, total: questions.length })}</p>
            <p className="mt-2 flex items-center gap-3 text-3xl font-bold">
              {cur.q === 'capsule.qWho' ? <Users aria-hidden /> : cur.q === 'capsule.qWhere' ? <MapPin aria-hidden /> : null}{t(cur.q)}
              <button onClick={() => speak(t(cur.q), lang).catch(() => {})} aria-label={t('common.readAloud')} className="grid size-12 place-items-center rounded-full bg-white"><Volume2 aria-hidden /></button>
            </p>
            {!revealed ? (
              <>
                <div className="mt-5 flex gap-2">
                  {mic.supported && <button onClick={mic.listening ? mic.stop : mic.start} aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
                    className={`grid size-16 shrink-0 place-items-center rounded-full text-white ${mic.listening ? 'animate-pulse bg-coral' : 'bg-teal'}`}><Mic size={28} /></button>}
                  <textarea value={mic.listening ? mic.interim || answer : answer} onChange={(e) => setAnswer(e.target.value)} rows={3} maxLength={1000}
                    aria-label={t(cur.q)} placeholder={t('capsule.answerPh')} className="flex-1 rounded-2xl bg-white p-4 text-xl" />
                </div>
                {mic.error && <p role="alert" className="mt-2 font-bold text-coral">{t(`voice.err.${mic.error}` as TKey)}</p>}
                {err && <div className="mt-3"><ErrorView error={err} /></div>}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button big onClick={submit}><Check aria-hidden /> {answer.trim() ? t('capsule.saveAnswer') : t('capsule.showMe')}</Button>
                </div>
              </>
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                {cur.reveal && <p className="rounded-2xl bg-white p-4 text-2xl"><span className="font-bold text-teal">{t('capsule.itWas')}</span> {cur.reveal}</p>}
                <p className="mt-3 text-xl font-bold">{t('capsule.thankYou')}</p>
                <Button big className="mt-4" onClick={next}>{step + 1 < questions.length ? t('common.next') : t('capsule.finish')}</Button>
              </motion.div>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-3xl font-bold">🌟 {t('capsule.journeyDone')}</p>
            <Button big className="mt-6" onClick={onBack}>{t('capsule.back')}</Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
