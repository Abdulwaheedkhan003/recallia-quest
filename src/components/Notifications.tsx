import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellRing, Check, Clock } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { AppNotification } from '../api/types'
import { useApi } from '../api/useApi'
import { fmtTime } from '../lib/format'
import { speak } from '../lib/speech'
import { useLive } from '../state/realtime'
import { useSettings } from '../state/settings'
import Mascot from './Mascot'
import { Button, Sheet } from './ui'

async function act(n: AppNotification, kind: 'done' | 'snooze') {
  await api.post(`/notifications/${n.id}/${kind}`, kind === 'snooze' ? { minutes: 10 } : {})
}

/** Big, friendly pop-up when a reminder fires (delivered by the server scheduler over the realtime socket). */
export function ReminderToasts() {
  const { t, lang } = useSettings()
  const [queue, setQueue] = useState<AppNotification[]>([])
  const [err, setErr] = useState('')
  useLive(['notification'], (e) => {
    const n = e.notification as AppNotification | undefined
    if (!n) return
    setQueue((q) => [...q.filter((x) => x.id !== n.id), n])
    speak(`${t('notify.reminder')}: ${n.title}`, lang).catch(() => {})
  })
  const current = queue[0]
  const handle = async (kind: 'done' | 'snooze') => {
    try {
      await act(current, kind)
      setErr('')
      setQueue((q) => q.slice(1))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <AnimatePresence>
      {current && (
        <motion.div
          role="alertdialog" aria-live="assertive" aria-label={t('notify.reminder')}
          className="fixed inset-x-3 top-3 z-[95] mx-auto max-w-xl rounded-[32px] bg-white p-6 shadow-2xl ring-4 ring-amber sm:top-6"
          initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
        >
          <div className="flex items-center gap-4">
            <Mascot size={90} mood="explaining" label="" />
            <div>
              <p className="flex items-center gap-2 font-bold text-amber-deep"><BellRing size={20} aria-hidden /> {t('notify.reminder')}</p>
              <p className="text-2xl font-bold">{current.title}</p>
            </div>
          </div>
          {err && <p role="alert" className="mt-3 font-bold text-coral">{err}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="success" big onClick={() => handle('done')}><Check aria-hidden /> {t('notify.done')}</Button>
            <Button variant="secondary" big onClick={() => handle('snooze')}><Clock aria-hidden /> {t('notify.later')}</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Bell with the list of recent reminders. */
export function NotificationBell({ dark }: { dark?: boolean }) {
  const { t, lang } = useSettings()
  const [open, setOpen] = useState(false)
  const { data, reload } = useApi<{ notifications: AppNotification[] }>('/notifications', ['notification'])
  const pending = data?.notifications.filter((n) => !n.done_at) ?? []
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={`${t('notify.title')} (${pending.length})`}
        className={`relative grid size-12 place-items-center rounded-full ${dark ? 'bg-white/15 text-cream' : 'bg-white text-ink shadow-sm'}`}>
        <Bell size={24} aria-hidden />
        {pending.length > 0 && <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-coral text-sm font-bold text-white">{pending.length}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('notify.title')}>
        {!data?.notifications.length && <p className="text-lg text-ink-soft">{t('notify.none')}</p>}
        <ul className="space-y-3">
          {data?.notifications.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-center gap-3 rounded-2xl p-4 ${n.done_at ? 'bg-ink/5' : 'bg-white shadow-sm'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{n.title}</p>
                <p className="text-ink-soft">{fmtTime(n.created_at, lang)}</p>
              </div>
              {n.done_at ? <span className="flex items-center gap-1 font-bold text-teal"><Check size={18} aria-hidden /> {t('notify.handled')}</span> : (
                <>
                  <Button variant="success" onClick={() => act(n, 'done').then(reload)}>{t('notify.done')}</Button>
                  <Button variant="secondary" onClick={() => act(n, 'snooze').then(reload)}>{t('notify.later')}</Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
