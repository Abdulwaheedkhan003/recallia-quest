import { CalendarCheck, CalendarHeart, CheckCircle2, Circle, Hospital, Mic, RotateCcw, Search, Send, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import type { Appointment, Slot } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { Button, ErrorView, Loading, Sheet } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { navigate } from '../../lib/router'
import { speak, useSpeechInput } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'
import { EmergencyCard } from '../companion/Companion'

interface AgentState { reason?: string; specialty?: string; preferredDate?: string; readyToSearch?: boolean; urgent?: boolean }
interface AgentData {
  messages: { id: number; role: 'user' | 'assistant'; content: string }[]
  state: AgentState
  aiReady: boolean
  bookingReady: boolean
  hasPatientId: boolean
  required: { ai: string[]; booking: string[] }
  appointments: Appointment[]
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center gap-2 text-lg">{ok ? <CheckCircle2 className="text-teal" aria-hidden /> : <Circle className="text-ink/30" aria-hidden />}<span className={ok ? 'font-bold' : ''}>{label}</span><span className="sr-only">{ok ? '✓' : '✗'}</span></li>
}

export default function Agent() {
  const { t, lang } = useSettings()
  const { data, error, loading, reload, setData } = useApi<AgentData>('/agent')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotErr, setSlotErr] = useState<ApiError | null>(null)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<Slot | null>(null)
  const [booking, setBooking] = useState(false)
  const [result, setResult] = useState<{ appointment: Appointment; confirmed: boolean; reminders: unknown[] } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const mic = useSpeechInput(lang, (s) => void send(s))

  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight }, [data?.messages.length, busy])

  const send = async (msg: string) => {
    if (!msg.trim()) return
    setBusy(true)
    setErr(null)
    setData((d) => d && { ...d, messages: [...d.messages, { id: -Date.now(), role: 'user', content: msg }] })
    try {
      const r = await api.post<{ reply: string; state: AgentState }>('/agent/message', { text: msg, lang })
      setData((d) => d && { ...d, state: r.state, messages: [...d.messages, { id: Date.now(), role: 'assistant', content: r.reply }] })
      speak(r.reply, lang).catch(() => {})
    } catch (e) {
      setErr(e as ApiError)
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    setSearching(true)
    setSlotErr(null)
    try { setSlots((await api.get<{ slots: Slot[] }>('/agent/slots')).slots) } catch (e) { setSlotErr(e as ApiError); setSlots(null) } finally { setSearching(false) }
  }

  const book = async () => {
    if (!chosen) return
    setBooking(true)
    setSlotErr(null)
    try {
      const r = await api.post<{ appointment: Appointment; confirmed: boolean; reminders: unknown[] }>('/agent/book', { slotId: chosen.id, confirmed: true })
      setResult(r)
      setChosen(null)
      setSlots(null)
      reload()
    } catch (e) {
      setSlotErr(e as ApiError)
      setChosen(null)
    } finally {
      setBooking(false)
    }
  }

  const reset = async () => { await api.post('/agent/reset'); setSlots(null); setResult(null); reload() }

  return (
    <AppShell title={t('hub.agent')} icon={<CalendarHeart className="text-coral" aria-hidden />} tone="bg-[linear-gradient(180deg,#ffe4dc,#fff8ec)]">
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="flex min-h-[60vh] flex-col rounded-[36px] bg-white/85 p-4 shadow-lg sm:p-6" aria-label={t('agent.conversation')}>
            {!data.aiReady && <ErrorView error={new ApiError(503, 'AI_NOT_CONFIGURED', t('agent.aiMissing'), { required: data.required.ai })} />}
            {data.state.urgent && <EmergencyCard />}
            <div ref={list} className="max-h-[55vh] flex-1 space-y-4 overflow-y-auto py-3" aria-live="polite">
              <div className="flex items-end gap-3">
                <Mascot size={70} mood="explaining" label="" />
                <p className="max-w-[85%] rounded-[28px] rounded-bl-md bg-cream px-6 py-4 text-2xl shadow-sm">{t('agent.opening')}</p>
              </div>
              {data.messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <p className={`max-w-[85%] whitespace-pre-wrap rounded-[28px] px-6 py-4 text-2xl ${m.role === 'user' ? 'rounded-br-md bg-coral text-white' : 'rounded-bl-md bg-cream shadow-sm'}`}>{m.content}</p>
                </div>
              ))}
              {busy && <p className="text-xl text-ink-soft">{t('companion.thinking')}…</p>}
              
            </div>

            {data.state.readyToSearch && !result && (
              <div className="mb-4 rounded-3xl bg-coral/10 p-4">
                <p className="text-lg font-bold">{t('agent.summary', { specialty: data.state.specialty ?? '', reason: data.state.reason ?? '' })}</p>
                <Button big className="mt-3" busy={searching} onClick={search}><Search aria-hidden /> {t('agent.findTimes')}</Button>
              </div>
            )}
            {slotErr && (
              <div className="mb-4 space-y-2">
                <ErrorView error={slotErr} />
                <p className="font-bold text-ink-soft">{t('agent.notBooked')}</p>
                {slotErr.code === 'NEEDS_PATIENT_ID' && <Button variant="secondary" onClick={() => navigate('/settings')}>{t('hub.settings')}</Button>}
              </div>
            )}
            {slots && (
              <div className="mb-4">
                <h2 className="text-2xl font-bold">{t('agent.available')}</h2>
                {slots.length === 0 ? <p className="mt-2 text-lg">{t('agent.noSlots')}</p> : (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {slots.map((s) => (
                      <li key={s.id}>
                        <button onClick={() => setChosen(s)} className="w-full rounded-3xl bg-white p-4 text-left shadow ring-2 ring-ink/10 hover:ring-coral">
                          <span className="block text-xl font-bold">{fmtDateTime(Date.parse(s.start), lang)}</span>
                          <span className="block text-lg">{s.practitioner || s.service || t('agent.doctor')}</span>
                          <span className="block text-ink-soft"><Hospital className="mr-1 inline" size={18} aria-hidden />{s.location}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {result && (
              <div role="status" className={`mb-4 rounded-3xl p-5 ${result.confirmed ? 'bg-leaf/20 ring-4 ring-leaf' : 'bg-amber/20 ring-4 ring-amber'}`}>
                <p className="flex items-center gap-2 text-2xl font-bold">
                  {result.confirmed ? <CalendarCheck className="text-teal" aria-hidden /> : <XCircle className="text-amber-deep" aria-hidden />}
                  {result.confirmed ? t('agent.confirmed') : t('agent.pending', { status: result.appointment.status })}
                </p>
                <p className="mt-1 text-lg">{result.appointment.description} — {fmtDateTime(result.appointment.start_at, lang)}</p>
                <p className="text-ink-soft">{t('agent.reference', { id: result.appointment.external_id })}</p>
                {result.confirmed && <p className="mt-1 font-bold text-teal">{t('agent.remindersMade', { n: result.reminders.length })}</p>}
              </div>
            )}
            {err && <ErrorView error={err} />}
            {mic.error && <p role="alert" className="font-bold text-coral">{t(`voice.err.${mic.error}` as TKey)}</p>}

            <form onSubmit={(e) => { e.preventDefault(); void send(text); setText('') }} className="mt-2 flex items-center gap-3">
              {mic.supported && (
                <button type="button" onClick={mic.listening ? mic.stop : mic.start} disabled={!data.aiReady || busy} aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
                  className={`grid size-20 shrink-0 place-items-center rounded-full text-white disabled:opacity-40 ${mic.listening ? 'animate-pulse bg-[#b3261e]' : 'bg-coral'}`}><Mic size={34} /></button>
              )}
              <label className="sr-only" htmlFor="agent-in">{t('agent.type')}</label>
              <input id="agent-in" value={mic.listening ? mic.interim : text} onChange={(e) => setText(e.target.value)} disabled={!data.aiReady} maxLength={1000}
                placeholder={t('agent.type')} className="min-h-20 flex-1 rounded-full bg-white px-6 text-xl ring-2 ring-ink/10" />
              <Button big disabled={!text.trim() || busy || !data.aiReady} aria-label={t('interact.send')}><Send aria-hidden /></Button>
            </form>
            <p className="mt-3 text-sm text-ink-soft">{t('safety.notMedical')}</p>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[28px] bg-white p-5 shadow">
              <h2 className="text-xl font-bold">{t('agent.status')}</h2>
              <ul className="mt-3 space-y-2">
                <Check ok={data.aiReady} label={t('agent.statusAi')} />
                <Check ok={data.bookingReady} label={t('agent.statusBooking')} />
                <Check ok={data.hasPatientId} label={t('agent.statusPatient')} />
              </ul>
              {!data.bookingReady && (
                <div className="mt-3 rounded-2xl bg-lavender/10 p-3 text-base">
                  <p className="font-bold">{t('agent.bookingMissing')}</p>
                  <ul className="mt-1 list-disc pl-5">{data.required.booking.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              <Button variant="ghost" className="mt-3" onClick={reset}><RotateCcw aria-hidden /> {t('agent.startOver')}</Button>
            </div>
            <div className="rounded-[28px] bg-white p-5 shadow">
              <h2 className="text-xl font-bold">{t('agent.myAppointments')}</h2>
              {data.appointments.length === 0 ? <p className="mt-2 text-ink-soft">{t('agent.noneYet')}</p> : (
                <ul className="mt-2 space-y-2">
                  {data.appointments.map((a) => (
                    <li key={a.id} className="rounded-2xl bg-cream p-3"><p className="font-bold">{fmtDateTime(a.start_at, lang)}</p><p>{a.description}</p><p className="text-sm text-ink-soft">{a.status} · {a.external_id}</p></li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      <Sheet open={Boolean(chosen)} onClose={() => setChosen(null)} title={t('agent.confirmTitle')}>
        {chosen && (
          <>
            <p className="text-2xl">{t('agent.confirmQ', { when: fmtDateTime(Date.parse(chosen.start), lang), who: chosen.practitioner || chosen.service || t('agent.doctor'), where: chosen.location })}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button big variant="success" busy={booking} onClick={book}>{t('agent.yesBook')}</Button>
              <Button big variant="secondary" onClick={() => setChosen(null)}>{t('agent.noBack')}</Button>
            </div>
          </>
        )}
      </Sheet>
    </AppShell>
  )
}
