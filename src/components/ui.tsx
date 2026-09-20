import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Loader2, Plug, RotateCcw, X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { ApiError } from '../api/client'
import { useT, type TKey } from '../state/settings'
import Mascot, { type MascotMood } from './Mascot'

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-cream hover:bg-ink-soft',
  secondary: 'bg-white text-ink shadow-sm ring-2 ring-ink/10 hover:ring-ink/25',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'bg-[#b3261e] text-white hover:bg-[#8c1d18]',
  success: 'bg-teal text-white hover:bg-[#17695f]',
}

export function Button({ variant = 'primary', big, busy, className = '', children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean; busy?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-bold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${big ? 'min-h-16 px-8 text-xl' : 'min-h-14 px-6 text-lg'} ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Loader2 className="animate-spin" size={22} aria-hidden />}
      {children}
    </button>
  )
}

/* ---------- Status views ---------- */
export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
      <Mascot size={110} mood="thinking" label="" />
      <p className="text-xl font-bold text-ink-soft">{label ?? t('status.loading')}</p>
    </div>
  )
}

export function Empty({ title, body, mood = 'encouraging', children }: { title: string; body?: string; mood?: MascotMood; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[32px] bg-white/70 px-6 py-12 text-center">
      <Mascot size={120} mood={mood} label="" />
      <h2 className="text-2xl font-semibold">{title}</h2>
      {body && <p className="max-w-lg text-lg text-ink-soft">{body}</p>}
      {children}
    </div>
  )
}

/** Translate an API error by its code; fall back to the server's (English) message. */
export function translated(t: ReturnType<typeof useT>, error: ApiError) {
  const key = `errors.${error.code}` as TKey
  const v = t(key)
  return v === key ? error.message : v
}

/** Shows a real error. Integration errors list exactly what must be configured. */
export function ErrorView({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const t = useT()
  const integration = ['AI_NOT_CONFIGURED', 'BOOKING_NOT_CONFIGURED'].includes(error.code)
  return (
    <div role="alert" className={`rounded-[28px] p-6 ${integration ? 'bg-lavender/10 ring-2 ring-lavender/40' : 'bg-coral/10 ring-2 ring-coral/40'}`}>
      <p className="flex items-center gap-3 text-xl font-bold">
        {integration ? <Plug className="shrink-0 text-lavender" aria-hidden /> : <AlertCircle className="shrink-0 text-coral" aria-hidden />}
        {integration ? error.message : translated(t, error)}
      </p>
      {integration && (
        <div className="mt-3 text-base text-ink-soft">
          <p className="font-bold">{t('status.needsSetup')}</p>
          <ul className="mt-1 list-disc pl-6">{error.required.map((r) => <li key={r}><code className="break-words">{r}</code></li>)}</ul>
        </div>
      )}
      {onRetry && !integration && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}><RotateCcw size={20} aria-hidden /> {t('status.retry')}</Button>
      )}
    </div>
  )
}

/* ---------- Progress ---------- */
export function Progress({ value, max, tone = 'bg-leaf', label }: { value: number; max: number; tone?: string; label: string }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className="h-4 w-full overflow-hidden rounded-full bg-ink/10">
      <motion.div className={`h-full rounded-full ${tone}`} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
    </div>
  )
}

/* ---------- Sheet / modal ---------- */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useT()
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[32px] bg-cream p-6 shadow-2xl sm:rounded-[32px] sm:p-8"
            initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-3xl font-semibold">{title}</h2>
              <button onClick={onClose} aria-label={t('common.close')} className="grid size-14 shrink-0 place-items-center rounded-full bg-white shadow"><X size={26} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Form fields ---------- */
export const inputCls = 'mt-2 min-h-14 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 text-lg focus:border-lavender'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-lg font-bold">
      {label}
      {hint && <span className="block text-base font-normal text-ink-soft">{hint}</span>}
      {children}
    </label>
  )
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const t = useT()
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`flex min-h-16 w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-3 text-left text-lg font-bold transition ${on ? 'border-teal bg-teal/10' : 'border-ink/10 bg-white'}`}>
      <span>{label}{hint && <span className="block text-base font-normal text-ink-soft">{hint}</span>}</span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-sm ${on ? 'bg-teal text-white' : 'bg-ink/10'}`}>{on ? t('common.on') : t('common.off')}</span>
    </button>
  )
}
