import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ClipboardList, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import Mascot from '../../components/Mascot'
import { useT } from '../../state/settings'

/**
 * "Who is using Recallia Quest?" — the patient choice is the hero (warm glow, gentle breathing light);
 * the caretaker choice is clearly available but quieter.
 */
export default function RoleModal({ open, onClose, onPatient, onCaretaker }: { open: boolean; onClose: () => void; onPatient: () => void; onCaretaker: () => void }) {
  const calm = useReducedMotion()
  const t = useT()
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    setTimeout(() => first.current?.focus(), 350)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-[#1c1631]/55 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="role-title" onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl overflow-hidden rounded-[44px] bg-[radial-gradient(ellipse_at_top,#fff3dc_0%,#fff8ec_45%,#f3edff_100%)] p-6 shadow-[0_40px_120px_-30px_rgba(28,22,49,0.8)] sm:p-10"
            initial={{ opacity: 0, y: 40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
            {/* soft drifting light behind the content */}
            {!calm && (
              <>
                <motion.div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-amber/30 blur-3xl"
                  animate={{ x: [0, 40, 0], y: [0, 30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
                <motion.div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 size-80 rounded-full bg-lavender/25 blur-3xl"
                  animate={{ x: [0, -30, 0], y: [0, -20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
              </>
            )}

            <button onClick={onClose} aria-label={t('common.close')} className="absolute right-5 top-5 z-10 grid size-14 place-items-center rounded-full bg-white/90 shadow"><X size={26} /></button>

            <div className="relative text-center">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15, type: 'spring' }} className="mx-auto w-fit">
                <Mascot size={96} mood="happy" label="" />
              </motion.div>
              <h2 id="role-title" className="mt-2 font-display text-4xl font-bold text-ink sm:text-5xl">{t('role.title')}</h2>
              <p className="mt-2 text-xl text-ink-soft">{t('role.sub')}</p>
            </div>

            <div className="relative mt-8 grid items-stretch gap-5 md:grid-cols-[1.45fr_1fr]">
              {/* ---------- Patient: the primary, glowing choice ---------- */}
              <motion.div className="relative" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }}>
                {!calm && (
                  <motion.div aria-hidden className="absolute -inset-[3px] rounded-[40px] bg-[conic-gradient(from_0deg,#f5a524,#f27f5b,#ffd98a,#f5a524)]"
                    animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} style={{ filter: 'blur(6px)', opacity: 0.85 }} />
                )}
                {!calm && (
                  <motion.div aria-hidden className="absolute -inset-3 rounded-[48px] bg-amber/40 blur-2xl"
                    animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.98, 1.02, 0.98] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }} />
                )}
                <motion.button ref={first} onClick={onPatient} whileHover={calm ? undefined : { y: -6, scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  className="group relative flex h-full min-h-[300px] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[38px] bg-gradient-to-br from-[#fff1d6] via-[#ffe0bf] to-[#ffc9a8] p-8 text-center text-ink shadow-[0_30px_60px_-20px_rgba(242,127,91,0.65)] ring-4 ring-white/70">
                  {!calm && (
                    <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  )}
                  <motion.div aria-hidden className="relative grid size-32 place-items-center rounded-full bg-white/80 shadow-inner"
                    animate={calm ? undefined : { y: [0, -8, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}>
                    <svg viewBox="0 0 120 120" className="size-24">
                      <circle cx="60" cy="60" r="56" fill="#fff4dc" />
                      <circle cx="48" cy="52" r="18" fill="#c98a62" /><path d="M30 48c0-22 36-22 36 0" fill="#e9e3dc" />
                      <path d="M24 100c2-18 12-28 24-28s22 10 24 28z" fill="#8b7cf6" />
                      <circle cx="80" cy="58" r="14" fill="#b8764f" /><path d="M66 54c0-18 28-18 28 0" fill="#2b2140" />
                      <path d="M62 102c2-14 10-22 18-22s16 8 18 22z" fill="#1f8a7e" />
                      <path d="M86 26c-4-6-14-2-10 6l10 10 10-10c4-8-6-12-10-6z" fill="#f27f5b" />
                    </svg>
                  </motion.div>
                  <span className="relative block font-display text-4xl font-bold sm:text-5xl">{t('role.patient')}</span>
                  <span className="relative block text-xl text-ink-soft">{t('role.patientBody')}</span>
                  <span className="relative mt-2 inline-flex min-h-16 items-center gap-2 rounded-full bg-ink px-8 text-xl font-bold text-cream shadow-lg">
                    {t('role.start')} <ArrowRight aria-hidden />
                  </span>
                </motion.button>
              </motion.div>

              {/* ---------- Caretaker: secondary, calm ---------- */}
              <motion.button onClick={onCaretaker} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}
                whileHover={calm ? undefined : { y: -2 }} whileTap={{ scale: 0.98 }}
                className="flex h-full min-h-[220px] w-full flex-col items-start justify-center gap-3 self-center rounded-[32px] border-2 border-ink/10 bg-white/85 p-7 text-left text-ink shadow-sm hover:border-ink/25">
                <span aria-hidden className="grid size-16 place-items-center rounded-2xl bg-ink/5"><ClipboardList size={32} className="text-ink-soft" /></span>
                <span className="block text-3xl font-bold">{t('role.caretaker')}</span>
                <span className="block text-lg text-ink-soft">{t('role.caretakerBody')}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-lg font-bold text-teal">{t('role.continue')} <ArrowRight size={20} aria-hidden /></span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
