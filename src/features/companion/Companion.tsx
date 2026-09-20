import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, MessageCircleHeart, Mic, Phone, Send, Square, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { ChatMessage } from '../../api/types'
import AppShell from '../../components/AppShell'
import Mascot, { type MascotMood } from '../../components/Mascot'
import { Button, ErrorView, Loading, Toggle } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { speak, stopSpeaking, useSpeechInput, useVoiceFor } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'

interface History { messages: ChatMessage[]; aiReady: boolean; required: string[] }

export function EmergencyCard() {
  const { t } = useSettings()
  return (
    <div role="alert" className="rounded-[28px] bg-[#b3261e] p-5 text-white shadow-xl">
      <p className="text-2xl font-bold">{t('safety.urgentTitle')}</p>
      <p className="mt-1 text-lg">{t('safety.urgentBody')}</p>
      <a href="tel:112" className="mt-3 inline-flex min-h-16 items-center gap-2 rounded-full bg-white px-6 text-xl font-bold text-[#b3261e]"><Phone aria-hidden /> {t('safety.call')}</a>
    </div>
  )
}

export default function Companion() {
  const { t, lang } = useSettings()
  const [data, setData] = useState<History | null>(null)
  const [loadErr, setLoadErr] = useState<ApiError | null>(null)
  const [text, setText] = useState('')
  const [thinking, setThinking] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [urgent, setUrgent] = useState(false)
  const [reminderWarn, setReminderWarn] = useState<string | null>(null)
  const [talking, setTalking] = useState(false)
  const [readAloud, setReadAloud] = useState(true)
  const hasVoice = useVoiceFor(lang)
  const list = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const say = (s: string) => {
    if (!readAloud || !hasVoice) return
    setTalking(true)
    speak(s, lang).catch(() => {}).finally(() => setTalking(false))
  }

  const send = async (body: { text?: string; start?: boolean }) => {
    setThinking(true)
    setErr(null)
    if (body.text) setData((d) => d && { ...d, messages: [...d.messages, { id: -Date.now(), role: 'user', content: body.text!, created_at: Date.now() }] })
    try {
      const r = await api.post<{ message: ChatMessage; urgent: boolean; reminderError: string | null }>('/companion/message', { ...body, lang })
      setData((d) => d && { ...d, messages: [...d.messages, r.message] })
      if (r.urgent) setUrgent(true)
      setReminderWarn(r.reminderError)
      say(r.message.content)
    } catch (e) {
      setErr(e as ApiError)
    } finally {
      setThinking(false)
    }
  }

  useEffect(() => {
    api.get<History>('/companion').then((h) => {
      setData(h)
      const last = h.messages[h.messages.length - 1]
      if (h.aiReady && !started.current && (!last || Date.now() - last.created_at > 3 * 36e5)) {
        started.current = true
        void send({ start: true })
      }
    }).catch((e) => setLoadErr(e as ApiError))
    return () => stopSpeaking()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight }, [data?.messages.length, thinking])

  const mic = useSpeechInput(lang, (s) => { void send({ text: s }) })

  const cancelReminder = async (m: ChatMessage) => {
    try {
      await api.del(`/reminders/${m.reminder_id}`)
      setData((d) => d && { ...d, messages: d.messages.map((x) => (x.id === m.id ? { ...x, reminder_active: 0 } : x)) })
    } catch (e) {
      setErr(e as ApiError)
    }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() || thinking) return
    void send({ text: text.trim() })
    setText('')
  }

  const mood: MascotMood = thinking ? 'thinking' : talking ? 'explaining' : mic.listening ? 'encouraging' : 'happy'

  return (
    <AppShell title={t('hub.companion')} icon={<MessageCircleHeart className="text-lavender" aria-hidden />} tone="bg-[linear-gradient(180deg,#ebe6ff,#fff8ec)]">
      {loadErr && <ErrorView error={loadErr} />}
      {!data && !loadErr && <Loading />}
      {data && !data.aiReady && <ErrorView error={new ApiError(503, 'AI_NOT_CONFIGURED', t('companion.notConnected'), { required: data.required })} />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="flex flex-col items-center gap-3 text-center lg:sticky lg:top-28 lg:self-start">
            <Mascot size={200} mood={mood} />
            <p className="text-xl font-bold" aria-live="polite">{thinking ? t('companion.thinking') : mic.listening ? t('companion.listening') : talking ? t('companion.speaking') : t('companion.ready')}</p>
            {talking && <Button variant="secondary" onClick={() => { stopSpeaking(); setTalking(false) }}><Square size={18} aria-hidden /> {t('companion.stopVoice')}</Button>}
            <div className="w-full"><Toggle on={readAloud} onChange={setReadAloud} label={t('companion.readAloud')} /></div>
            {!hasVoice && <p className="text-base text-ink-soft">{t('voice.noVoice')}</p>}
          </aside>

          <section className="flex min-h-[60vh] flex-col rounded-[36px] bg-white/80 p-4 shadow-lg sm:p-6" aria-label={t('companion.conversation')}>
            {urgent && <EmergencyCard />}
            <div ref={list} className="max-h-[58vh] flex-1 space-y-4 overflow-y-auto py-2" aria-live="polite">
              {data.messages.length === 0 && !thinking && data.aiReady && <p className="py-10 text-center text-xl text-ink-soft">{t('companion.empty')}</p>}
              <AnimatePresence initial={false}>
                {data.messages.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-[28px] px-6 py-4 text-2xl leading-snug ${m.role === 'user' ? 'rounded-br-md bg-lavender text-white' : 'rounded-bl-md bg-cream shadow-sm'}`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.reminder_text && (
                        <div className={`mt-3 rounded-2xl p-3 text-lg font-bold ${m.reminder_active ? 'bg-teal/15 text-teal' : 'bg-ink/5 text-ink-soft'}`}>
                          <p className="flex items-start gap-2">
                            <BellRing className="mt-1 shrink-0" size={20} aria-hidden />
                            <span>
                              {m.reminder_active ? t('companion.reminderSaved') : m.reminder_fired ? t('companion.reminderDelivered') : t('companion.reminderCancelled')}: {m.reminder_text}
                              {m.reminder_active && m.reminder_at ? ` — ${fmtDateTime(m.reminder_at, lang)}` : ''}
                            </span>
                          </p>
                          {Boolean(m.reminder_active) && m.reminder_id && (
                            <button onClick={() => cancelReminder(m)} className="mt-2 min-h-12 rounded-full bg-white px-4 text-base text-ink ring-2 ring-ink/10">{t('companion.cancelReminder')}</button>
                          )}
                        </div>
                      )}
                      {m.role === 'assistant' && hasVoice && (
                        <button onClick={() => say(m.content)} className="mt-2 flex items-center gap-1 text-base font-bold text-ink-soft" aria-label={t('common.readAloud')}><Volume2 size={18} aria-hidden /> {t('common.readAloud')}</button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {thinking && <p className="text-xl text-ink-soft">{t('companion.thinking')}…</p>}
              
            </div>

            {reminderWarn && <p role="alert" className="mb-2 rounded-2xl bg-amber/25 p-3 text-lg font-bold">{t('companion.reminderNotSaved')}</p>}
            {err && <ErrorView error={err} onRetry={() => setErr(null)} />}
            {mic.error && <p role="alert" className="mb-2 text-lg font-bold text-coral">{t(`voice.err.${mic.error}` as TKey)}</p>}

            <form onSubmit={submit} className="mt-3 flex items-center gap-3">
              {mic.supported ? (
                <button type="button" onClick={mic.listening ? mic.stop : mic.start} disabled={!data.aiReady || thinking} aria-pressed={mic.listening}
                  aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
                  className={`grid size-20 shrink-0 place-items-center rounded-full text-white shadow-lg disabled:opacity-40 ${mic.listening ? 'animate-pulse bg-coral' : 'bg-lavender'}`}>
                  <Mic size={36} />
                </button>
              ) : null}
              <label htmlFor="companion-input" className="sr-only">{t('companion.type')}</label>
              <input id="companion-input" value={mic.listening ? mic.interim : text} onChange={(e) => setText(e.target.value)} disabled={!data.aiReady} maxLength={2000}
                placeholder={mic.listening ? t('companion.listening') : t('companion.type')} className="min-h-20 flex-1 rounded-full bg-white px-6 text-xl shadow-inner ring-2 ring-ink/10" />
              <Button big disabled={!text.trim() || thinking || !data.aiReady} aria-label={t('interact.send')}><Send aria-hidden /></Button>
            </form>
            {!mic.supported && <p className="mt-2 text-base text-ink-soft">{t('voice.err.unsupported')}</p>}
            <p className="mt-3 text-sm text-ink-soft">{t('safety.notMedical')}</p>
          </section>
        </div>
      )}
    </AppShell>
  )
}
