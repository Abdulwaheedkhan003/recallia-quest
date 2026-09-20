import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import Mascot from '../../components/Mascot'
import ComfortMenu from '../../components/ComfortMenu'
import { scrollToId } from '../../lib/router'
import { useT, type TKey } from '../../state/settings'

const LINKS: [string, TKey][] = [
  ['top', 'nav.home'], ['about', 'nav.about'], ['impact', 'nav.impact'], ['how', 'nav.how'], ['contact', 'nav.contact'],
]

export default function Nav({ onStart }: { onStart: () => void }) {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const go = (id: string) => { setOpen(false); scrollToId(id) }

  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? 'bg-cream/85 shadow-[0_6px_24px_-12px_rgba(43,33,64,0.25)] backdrop-blur-md' : ''}`}>
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6" aria-label="Main">
        <button onClick={() => go('top')} className="flex items-center gap-2" aria-label={t('brand')}>
          <Mascot size={48} label="" />
          <span className="whitespace-nowrap font-display text-xl font-bold tracking-tight sm:text-2xl">Recallia<span className="text-amber-deep"> Quest</span></span>
        </button>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map(([id, key]) => (
            <li key={id}>
              <button onClick={() => go(id)} className="min-h-12 whitespace-nowrap rounded-full px-3 text-lg font-bold text-ink-soft transition hover:bg-parchment hover:text-ink">
                {t(key)}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ComfortMenu />
          <button
            onClick={onStart}
            className="hidden min-h-12 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-5 text-lg font-bold text-cream shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:flex"
          >
            <Sparkles size={20} aria-hidden /> {t('nav.try')}
          </button>
          <button onClick={() => setOpen(true)} className="grid size-12 place-items-center rounded-full bg-white shadow-sm lg:hidden" aria-label={t('nav.menu')}>
            <Menu size={24} />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-cream p-6 lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label={t('nav.menu')}
          >
            <button onClick={() => setOpen(false)} className="ml-auto grid size-14 place-items-center rounded-full bg-white shadow" aria-label={t('common.close')}>
              <X size={28} />
            </button>
            <ul className="mt-6 space-y-3">
              {LINKS.map(([id, key]) => (
                <li key={id}>
                  <button onClick={() => go(id)} className="min-h-16 w-full rounded-3xl bg-white px-6 text-left font-display text-2xl font-semibold shadow-sm">
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
            <button onClick={() => { setOpen(false); onStart() }} className="mt-auto min-h-16 rounded-full bg-ink text-xl font-bold text-cream">
              {t('nav.try')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
