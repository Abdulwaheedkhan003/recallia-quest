import { Cpu, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import { useApi } from '../../api/useApi'
import { useLive } from '../../state/realtime'

export interface LocalAi {
  state: 'off' | 'offline' | 'checking' | 'downloading' | 'building' | 'loading' | 'ready' | 'error'
  model: string | null
  fineTuned: boolean
  progress: number | null
  detail: string
}

/** Live state of the private AI on this computer (initial read + "ai:local" pushes). */
export function usePrivateAi() {
  const { data, setData } = useApi<LocalAi>('/care/ai/local')
  useLive(['ai:local'], (e) => { if (e.type === 'ai:local' && e.status) setData(e.status as LocalAi) })
  return { ai: data, setAi: setData }
}

const LABEL: Record<LocalAi['state'], string> = {
  off: 'Private AI is off',
  offline: 'Private AI is not running',
  checking: 'Checking private AI…',
  downloading: 'Downloading private AI',
  building: 'Installing your fine-tuned model',
  loading: 'Starting private AI…',
  ready: 'Private AI ready',
  error: 'Private AI needs attention',
}

/** Small card: which private model writes stories right now, with live download / install progress. */
export function PrivateAiCard({ compact = false }: { compact?: boolean }) {
  const { ai, setAi } = usePrivateAi()
  const [busy, setBusy] = useState(false)
  if (!ai) return null
  const good = ai.state === 'ready'
  const working = ['checking', 'downloading', 'building', 'loading'].includes(ai.state)
  const recheck = async () => { setBusy(true); try { setAi(await api.post<LocalAi>('/care/ai/local/check')) } catch { /* shown by state */ } finally { setBusy(false) } }
  return (
    <div role="status" aria-live="polite" className={`rounded-[24px] p-4 ${good ? 'bg-teal/10' : working ? 'bg-amber/15' : 'bg-white/80'} ${compact ? 'text-base' : 'text-lg'}`}>
      <p className="flex items-center gap-2 font-bold">
        <Cpu aria-hidden className={good ? 'text-teal' : 'text-ink-soft'} />
        <span className={`size-3 rounded-full ${good ? 'bg-teal' : working ? 'animate-pulse bg-amber-deep' : 'bg-ink/30'}`} aria-hidden />
        {LABEL[ai.state]}{good && ai.model ? ` — ${ai.fineTuned ? 'fine-tuned recallia-remember' : ai.model}` : ''}
      </p>
      {ai.progress !== null && working && (
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white" aria-label={`${ai.progress}%`}><div className="h-full bg-teal transition-all" style={{ width: `${ai.progress}%` }} /></div>
      )}
      {!compact && <p className="mt-1 text-base text-ink-soft">{ai.detail}</p>}
      {!compact && !good && !working && (
        <button onClick={recheck} disabled={busy} className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-base font-bold shadow-sm">
          <RefreshCw aria-hidden className={busy ? 'animate-spin' : ''} /> Check again
        </button>
      )}
      {!compact && <p className="mt-1 text-sm text-ink-soft">Runs on this computer only — family memories are never sent to the cloud.</p>}
    </div>
  )
}
