import { Bell, BellPlus, Globe, Hospital, KeyRound, Lock, Settings as Cog, Shield, Trash2, User, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, type ApiError } from '../../api/client'
import type { CircleData, Reminder } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Button, ErrorView, Field, inputCls, Toggle } from '../../components/ui'
import { getLanguage } from '../../i18n/languages'
import { fmtDateTime } from '../../lib/format'
import { enablePush, pushPermission } from '../../lib/push'
import { sttSupported, ttsSupported, useVoiceFor } from '../../lib/speech'
import { navigate } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useSettings, type TKey } from '../../state/settings'

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[32px] bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-3 text-2xl font-bold">{icon}{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export default function Settings() {
  const { t, lang } = useSettings()
  const { user, updateProfile } = useAuth()
  const [err, setErr] = useState<ApiError | null>(null)
  const [saved, setSaved] = useState('')
  const voice = useVoiceFor(lang)
  const L = getLanguage(lang)

  const save = async (patch: Record<string, unknown>) => {
    try { await updateProfile(patch); setSaved(t('settings.saved')); setErr(null); setTimeout(() => setSaved(''), 2500) } catch (e) { setErr(e as ApiError) }
  }
  if (!user) return null

  return (
    <AppShell title={t('hub.settings')} icon={<Cog aria-hidden />}>
      <div className="mx-auto max-w-3xl space-y-5">
        {err && <ErrorView error={err} />}
        {saved && <p role="status" className="rounded-2xl bg-leaf/20 p-3 text-lg font-bold text-teal">✓ {saved}</p>}

        <Card icon={<User aria-hidden />} title={t('settings.profile')}>
          <form onSubmit={(e) => { e.preventDefault(); save({ displayName: new FormData(e.currentTarget).get('name') }) }} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1"><Field label={t('auth.name')}><input name="name" defaultValue={user.display_name} maxLength={60} required className={inputCls} /></Field></div>
            <Button>{t('common.save')}</Button>
          </form>
          <p className="text-lg text-ink-soft">{t('settings.timezone', { tz: user.timezone })}</p>
        </Card>

        <Card icon={<Globe aria-hidden />} title={t('settings.language')}>
          <p className="text-lg">{t('settings.current', { name: `${L.native} (${L.name})` })}</p>
          <ul className="space-y-1 text-lg">
            <li>{t('settings.uiStatus')}: <b>{t(`settings.status.${L.status}` as TKey)}</b></li>
            <li>{t('settings.voiceOut')}: <b>{ttsSupported() && voice ? t('settings.available') : t('settings.unavailable')}</b></li>
            <li>{t('settings.voiceIn')}: <b>{sttSupported() ? t('settings.browserDecides') : t('settings.unavailable')}</b></li>
          </ul>
          <p className="text-base text-ink-soft">{t('settings.languageHint')}</p>
        </Card>

        <NotificationsCard />

        <Card icon={<Shield aria-hidden />} title={t('settings.privacy')}>
          <Toggle on={Boolean(user.discoverable)} onChange={(v) => save({ discoverable: v })} label={t('interact.findMe')} hint={t('interact.findMeHint')} />
          <Toggle on={Boolean(user.show_presence)} onChange={(v) => save({ showPresence: v })} label={t('settings.presence')} hint={t('settings.presenceHint')} />
        </Card>

        <CircleCard />

        <AccountCard />

        <Card icon={<Hospital aria-hidden />} title={t('settings.hospital')}>
          <p className="text-lg text-ink-soft">{t('settings.hospitalHint')}</p>
          <form onSubmit={(e) => { e.preventDefault(); save({ fhirPatientId: String(new FormData(e.currentTarget).get('pid') ?? '').trim() || null }) }} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1"><Field label={t('settings.patientId')}><input name="pid" defaultValue={user.fhir_patient_id ?? ''} maxLength={100} className={inputCls} /></Field></div>
            <Button>{t('common.save')}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  )
}

function NotificationsCard() {
  const { t, lang } = useSettings()
  const [perm, setPerm] = useState(pushPermission())
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const { data, reload } = useApi<{ reminders: Reminder[] }>('/reminders', ['reminders:changed'])

  const enable = async () => {
    setBusy(true)
    try { setPerm(await enablePush()); setErr(null) } catch (e) { setErr(e as ApiError) } finally { setBusy(false) }
  }
  const test = async () => {
    try { await api.post('/push/test'); setMsg(t('settings.testSent')); setErr(null) } catch (e) { setErr(e as ApiError) }
  }
  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    try {
      await api.post('/reminders', { text: f.text, time: f.time, date: f.recurrence === 'none' ? f.date || null : null, recurrence: f.recurrence })
      form.reset()
      setErr(null)
      reload()
    } catch (er) { setErr(er as ApiError) }
  }
  const remove = async (id: number) => { try { await api.del(`/reminders/${id}`); reload() } catch (e) { setErr(e as ApiError) } }

  return (
    <Card icon={<Bell aria-hidden />} title={t('settings.reminders')}>
      <p className="text-lg">
        {perm === 'granted' ? `✓ ${t('settings.pushOn')}` : perm === 'denied' ? t('settings.pushDenied') : perm === 'unsupported' ? t('settings.pushUnsupported') : perm === 'insecure' ? t('settings.pushInsecure') : t('settings.pushOff')}
      </p>
      <div className="flex flex-wrap gap-3">
        {perm === 'default' && <Button busy={busy} onClick={enable}><Bell aria-hidden /> {t('settings.enablePush')}</Button>}
        {perm === 'granted' && <Button variant="secondary" onClick={test}>{t('settings.testPush')}</Button>}
      </div>
      {msg && <p role="status" className="font-bold text-teal">{msg}</p>}
      <p className="text-base text-ink-soft">{t('settings.pushHint')}</p>

      <form onSubmit={add} className="grid gap-3 rounded-3xl bg-cream p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label={t('settings.reminderText')}><input name="text" required maxLength={200} className={inputCls} /></Field></div>
        <Field label={t('routine.time')}><input name="time" type="time" required className={inputCls} /></Field>
        <Field label={t('settings.repeat')}>
          <select name="recurrence" className={inputCls} defaultValue="none">
            <option value="none">{t('settings.once')}</option><option value="daily">{t('settings.daily')}</option><option value="weekdays">{t('settings.weekdays')}</option>
          </select>
        </Field>
        <Field label={t('settings.date')} hint={t('settings.dateHint')}><input name="date" type="date" className={inputCls} /></Field>
        <div className="flex items-end"><Button className="w-full"><BellPlus aria-hidden /> {t('settings.addReminder')}</Button></div>
      </form>
      {err && <ErrorView error={err} />}
      <ul className="space-y-2">
        {data?.reminders.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-cream p-3">
            <span className="flex-1"><b className="text-lg">{r.text}</b><br /><span className="text-ink-soft">{r.next_fire_at ? fmtDateTime(r.next_fire_at, lang) : ''} · {t(`settings.rec.${r.recurrence}` as TKey)}</span></span>
            <Button variant="ghost" onClick={() => remove(r.id)} aria-label={`${t('routine.remove')}: ${r.text}`}><Trash2 aria-hidden /></Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function CircleCard() {
  const { t } = useSettings()
  const { user } = useAuth()
  const { data, reload } = useApi<CircleData>('/circle')
  const [code, setCode] = useState<string | null>(null)
  const [err, setErr] = useState<ApiError | null>(null)
  const invite = async () => { try { setCode((await api.post<{ code: string }>('/circle/invite')).code) } catch (e) { setErr(e as ApiError) } }
  const unlink = async (id: number) => { try { await api.del(`/circle/${id}`); reload() } catch (e) { setErr(e as ApiError) } }
  return (
    <Card icon={<Users aria-hidden />} title={t('settings.family')}>
      <p className="text-lg text-ink-soft">{t('settings.familyHint')}</p>
      {user?.role === 'patient' && <Button onClick={invite}><KeyRound aria-hidden /> {t('settings.makeInvite')}</Button>}
      {code && <p className="rounded-2xl bg-amber/20 p-4 text-xl">{t('settings.inviteCode')} <b className="font-mono text-3xl tracking-widest">{code}</b><br /><span className="text-base">{t('settings.inviteHint')}</span></p>}
      {err && <ErrorView error={err} />}
      <ul className="space-y-2">
        {[...(data?.members ?? []), ...(data?.patients ?? [])].map((m) => (
          <li key={m.link_id} className="flex items-center gap-3 rounded-2xl bg-cream p-3">
            <span className="flex-1 text-lg font-bold">{m.display_name}{m.relation && <span className="font-normal text-ink-soft"> · {m.relation}</span>}</span>
            <Button variant="ghost" onClick={() => unlink(m.link_id)}>{t('settings.unlink')}</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function AccountCard() {
  const { t } = useSettings()
  const { logout } = useAuth()
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState<ApiError | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const change = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>
    try { await api.post('/auth/password', { current: f.current, next: f.next }); form.reset(); setMsg(t('settings.passwordChanged')); setErr(null) } catch (er) { setErr(er as ApiError) }
  }
  const del = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const pw = String(new FormData(e.currentTarget).get('password') ?? '')
    try { await api.post('/auth/delete-account', { password: pw }); await logout(); navigate('/') } catch (er) { setErr(er as ApiError) }
  }
  return (
    <Card icon={<Lock aria-hidden />} title={t('settings.account')}>
      <form onSubmit={change} className="grid gap-3 sm:grid-cols-2">
        <Field label={t('settings.currentPassword')}><input name="current" type="password" required autoComplete="current-password" className={inputCls} /></Field>
        <Field label={t('settings.newPassword')} hint={t('auth.passwordHint')}><input name="next" type="password" required minLength={8} autoComplete="new-password" className={inputCls} /></Field>
        <div className="sm:col-span-2"><Button variant="secondary">{t('settings.changePassword')}</Button></div>
      </form>
      {msg && <p role="status" className="font-bold text-teal">✓ {msg}</p>}
      {err && <ErrorView error={err} />}
      {!confirmDelete ? (
        <Button variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden /> {t('settings.deleteAccount')}</Button>
      ) : (
        <form onSubmit={del} className="space-y-3 rounded-3xl bg-coral/10 p-4">
          <p className="text-lg font-bold">{t('settings.deleteWarning')}</p>
          <Field label={t('auth.password')}><input name="password" type="password" required autoComplete="current-password" className={inputCls} /></Field>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger">{t('settings.deleteForever')}</Button>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>{t('agent.noBack')}</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
