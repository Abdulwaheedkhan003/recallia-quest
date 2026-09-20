import { CloudOff, RefreshCw, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRealtime } from '../state/realtime'
import { useT } from '../state/settings'

const ago = (ms: number, t: ReturnType<typeof useT>) => {
  const s = Math.round((Date.now() - ms) / 1000)
  return s < 45 ? t('sync.justNow') : s < 3600 ? t('sync.minAgo', { n: Math.round(s / 60) }) : t('sync.hAgo', { n: Math.round(s / 3600) })
}

/** Subtle sync status. Patient: "Synced just now". Caretaker: "Patient device connected". */
export default function SyncPill({ lastSync, patientOnline, variant = 'patient' }: { lastSync?: number | null; patientOnline?: boolean; variant?: 'patient' | 'caretaker' }) {
  const { status } = useRealtime()
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t) }, [])
  const down = status === 'offline' || status === 'reconnecting'

  if (down)
    return (
      <p role="status" className="inline-flex items-center gap-2 rounded-full bg-amber/20 px-4 py-2 text-base font-bold text-amber-deep">
        <CloudOff size={18} aria-hidden /> {t('sync.interrupted')}
      </p>
    )
  if (variant === 'caretaker')
    return (
      <p role="status" className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-bold ${patientOnline ? 'bg-teal/15 text-teal' : 'bg-ink/5 text-ink-soft'}`}>
        <span aria-hidden className={`size-2.5 rounded-full ${patientOnline ? 'bg-teal' : 'bg-ink/30'}`} />
        {patientOnline ? t('sync.patientOn') : t('sync.patientOff')}
      </p>
    )
  return (
    <p role="status" className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-base font-bold text-ink-soft shadow-sm">
      {status === 'online' ? <Wifi size={18} aria-hidden className="text-teal" /> : <RefreshCw size={18} aria-hidden className="animate-spin" />}
      {lastSync ? t('sync.synced', { ago: ago(lastSync, t) }) : t('sync.syncing')}
    </p>
  )
}
