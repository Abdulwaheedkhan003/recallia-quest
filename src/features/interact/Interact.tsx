import { ArrowLeft, Check, CheckCheck, Mic, Send, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import type { Message, Person } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Button, Empty, ErrorView, Loading, Toggle } from '../../components/ui'
import { fmtTime } from '../../lib/format'
import { useSpeechInput } from '../../lib/speech'
import { useAuth } from '../../state/auth'
import { useLive } from '../../state/realtime'
import { useSettings } from '../../state/settings'

export default function Interact() {
  const { t } = useSettings()
  const { user, updateProfile } = useAuth()
  const { data, error, loading, reload, setData } = useApi<{ discoverable: boolean; people: Person[] }>('/interact/people', ['message'])
  const [openId, setOpenId] = useState<number | null>(null)

  useLive(['presence'], (e) => {
    if (e.type !== 'presence') return
    setData((d) => d && { ...d, people: d.people.map((p) => (p.id === e.userId ? { ...p, online: p.online === null ? null : Boolean(e.online) } : p)) })
  })

  const person = data?.people.find((p) => p.id === openId)

  return (
    <AppShell title={t('area.interact')} icon={<Users className="text-lavender" aria-hidden />} home="/facilitate" homeLabel={t('shell.world')} tone="bg-[linear-gradient(180deg,#ece8ff,#fff8ec)]">
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className={person ? 'hidden lg:block' : ''} aria-label={t('interact.people')}>
            {!user?.discoverable && (
              <div className="mb-4 rounded-3xl bg-white p-4">
                <Toggle on={false} onChange={(v) => updateProfile({ discoverable: v }).then(reload)} label={t('interact.findMe')} hint={t('interact.findMeHint')} />
              </div>
            )}
            {data.people.length === 0 ? (
              <Empty title={t('interact.noneTitle')} body={t('interact.noneBody')} />
            ) : (
              <ul className="space-y-3">
                {data.people.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setOpenId(p.id)} aria-current={p.id === openId}
                      className={`flex w-full items-center gap-4 rounded-3xl p-4 text-left transition ${p.id === openId ? 'bg-lavender text-white' : 'bg-white shadow-sm hover:shadow-md'}`}>
                      <span className="relative grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber to-coral font-display text-2xl font-bold text-white">
                        {p.name.slice(0, 1).toUpperCase()}
                        {p.online !== null && <span className={`absolute bottom-0 right-0 size-5 rounded-full ring-4 ring-white ${p.online ? 'bg-leaf' : 'bg-ink/30'}`} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xl font-bold">{p.name}</span>
                        <span className="block text-base opacity-80">
                          {p.circle ? t('interact.family') : t('interact.friend')}
                          {p.online !== null && ` · ${p.online ? t('interact.online') : t('interact.away')}`}
                        </span>
                      </span>
                      {p.unread > 0 && <span className="grid min-w-8 place-items-center rounded-full bg-coral px-2 py-1 font-bold text-white" aria-label={t('interact.unread', { n: p.unread })}>{p.unread}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {person ? <ChatPanel key={person.id} person={person} onBack={() => { setOpenId(null); reload() }} /> : (
            <div className="hidden lg:block"><Empty title={t('interact.pick')} mood="happy" /></div>
          )}
        </div>
      )}
    </AppShell>
  )
}

function ChatPanel({ person, onBack }: { person: Person; onBack: () => void }) {
  const { t, lang } = useSettings()
  const { user } = useAuth()
  const { data, error, loading, reload, setData } = useApi<{ messages: Message[] }>(`/interact/messages/${person.id}`)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<ApiError | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const mic = useSpeechInput(lang, (s) => setText((x) => (x ? x + ' ' : '') + s))

  useLive(['message'], (e) => {
    if (e.type === 'resync') return void reload()
    const m = e.message as Message & { kind?: string; by?: number }
    if (m.kind === 'read') { if (m.by === person.id) void reload(); return }
    if (m.sender_id !== person.id && m.recipient_id !== person.id) return
    setData((d) => (d && !d.messages.some((x) => x.id === m.id) ? { messages: [...d.messages, m] } : d))
    if (m.sender_id === person.id) void api.get(`/interact/messages/${person.id}`) // marks as read
  })
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight }, [data?.messages.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const r = await api.post<{ message: Message }>(`/interact/messages/${person.id}`, { body: text.trim() })
      setData((d) => (d && !d.messages.some((x) => x.id === r.message.id) ? { messages: [...d.messages, r.message] } : d))
      setText('')
    } catch (err) {
      setSendError(err as ApiError)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="flex h-[calc(100vh-160px)] min-h-[480px] flex-col rounded-[32px] bg-white shadow-lg" aria-label={t('interact.chatWith', { name: person.name })}>
      <header className="flex items-center gap-3 border-b-2 border-ink/5 p-4">
        <button onClick={onBack} className="grid size-14 place-items-center rounded-full bg-ink/5 lg:hidden" aria-label={t('common.back')}><ArrowLeft /></button>
        <h2 className="text-2xl font-bold">{person.name}</h2>
        {person.online !== null && <span className="text-lg text-ink-soft">· {person.online ? t('interact.online') : t('interact.away')}</span>}
      </header>
      <div ref={list} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {loading && <Loading />}
        {error && <ErrorView error={error} onRetry={reload} />}
        {data?.messages.length === 0 && <p className="py-10 text-center text-xl text-ink-soft">{t('interact.sayHello', { name: person.name })}</p>}
        {data?.messages.map((m) => {
          const mine = m.sender_id === user?.id
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-3xl px-5 py-3 text-xl ${mine ? 'rounded-br-md bg-lavender text-white' : 'rounded-bl-md bg-ink/5'}`}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-1 flex items-center gap-1 text-sm ${mine ? 'text-white/85' : 'text-ink-soft'}`}>
                  {fmtTime(m.created_at, lang)}
                  {mine && (m.read_at ? <><CheckCheck size={16} aria-hidden /> {t('interact.seen')}</> : <Check size={16} aria-label={t('interact.sent')} />)}
                </p>
              </div>
            </div>
          )
        })}
        
      </div>
      {sendError && <div className="px-4"><ErrorView error={sendError} /></div>}
      {mic.error && <p role="alert" className="px-4 font-bold text-coral">{t(`voice.err.${mic.error}` as never)}</p>}
      <form onSubmit={send} className="flex items-center gap-2 border-t-2 border-ink/5 p-3">
        {mic.supported && (
          <button type="button" onClick={mic.listening ? mic.stop : mic.start} aria-pressed={mic.listening} aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
            className={`grid size-16 shrink-0 place-items-center rounded-full ${mic.listening ? 'animate-pulse bg-coral text-white' : 'bg-ink/5'}`}><Mic size={28} /></button>
        )}
        <label className="sr-only" htmlFor="msg">{t('interact.write')}</label>
        <input id="msg" value={mic.listening ? mic.interim || text : text} onChange={(e) => setText(e.target.value)} maxLength={2000}
          placeholder={t('interact.write')} className="min-h-16 flex-1 rounded-full bg-ink/5 px-5 text-xl" />
        <Button big busy={sending} disabled={!text.trim()} aria-label={t('interact.send')}><Send aria-hidden /> <span className="hidden sm:inline">{t('interact.send')}</span></Button>
      </form>
    </section>
  )
}
