import { AnimatePresence, motion } from 'framer-motion'
import { Check, Globe, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '../i18n/languages'
import { useSettings, type Settings } from '../state/settings'

/** Language + accessibility controls. Reused on every screen, always top-right. */
export default function ComfortMenu({ dark = false }: { dark?: boolean }) {
  const s = useSettings()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick) }
  }, [open])

  const groups = [...new Set(LANGUAGES.map((l) => l.group))]
  const toggles: { key: keyof Settings; label: string }[] = [
    { key: 'reduceMotion', label: s.t('common.reduceMotion') },
    { key: 'largeText', label: s.t('common.largerText') },
    { key: 'highContrast', label: s.t('common.highContrast') },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={s.t('common.settings')}
        className={`flex min-h-12 items-center gap-2 rounded-full px-4 font-bold transition ${dark ? 'bg-white/15 text-cream hover:bg-white/25' : 'bg-white text-ink shadow-sm hover:shadow-md'}`}
      >
        <SlidersHorizontal size={22} aria-hidden />
        <span className="hidden whitespace-nowrap 2xl:inline">{s.t('common.settings')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 z-50 mt-3 w-[min(92vw,360px)] rounded-3xl bg-white p-5 text-ink shadow-2xl ring-1 ring-ink/10"
            role="dialog"
            aria-label={s.t('common.settings')}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{s.t('common.settings')}</h2>
              <button onClick={() => setOpen(false)} aria-label={s.t('common.close')} className="grid size-11 place-items-center rounded-full hover:bg-parchment">
                <X size={22} />
              </button>
            </div>

            <label className="mb-1 flex items-center gap-2 font-bold" htmlFor="lang"><Globe size={20} aria-hidden /> {s.t('common.language')}</label>
            <select
              id="lang"
              value={s.lang}
              onChange={(e) => s.set({ lang: e.target.value })}
              className="mb-4 min-h-12 w-full rounded-2xl border-2 border-ink/15 bg-cream px-3 text-lg font-bold"
            >
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {LANGUAGES.filter((l) => l.group === g).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.native === l.name ? l.name : `${l.native} — ${l.name}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="space-y-2">
              {toggles.map(({ key, label }) => {
                const on = Boolean(s[key])
                return (
                  <button
                    key={key}
                    role="switch"
                    aria-checked={on}
                    onClick={() => s.set({ [key]: !on })}
                    className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-4 text-lg font-bold transition ${on ? 'border-teal bg-teal/10' : 'border-ink/10'}`}
                  >
                    {label}
                    <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${on ? 'bg-teal text-white' : 'bg-ink/10'}`}>
                      {on && <Check size={16} strokeWidth={3} aria-hidden />}{on ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
