import { motion } from 'framer-motion'
import { ArrowDown, Globe2, Hand, Leaf, Sparkles } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { scrollToId } from '../../lib/router'
import { useT } from '../../state/settings'

const ProductReveal = lazy(() => import('./ProductReveal'))

const rise = (d = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay: d, ease: [0.22, 1, 0.36, 1] as const },
})

export default function Hero({ onStart }: { onStart: () => void }) {
  const t = useT()
  const trust = [
    { icon: Hand, label: t('hero.trust1') },
    { icon: Globe2, label: t('hero.trust2') },
    { icon: Leaf, label: t('hero.trust3') },
  ]

  return (
    <section id="top" className="relative overflow-hidden">
      {/* soft sky backdrop */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#ffe1b0_0%,transparent_55%),radial-gradient(ellipse_at_bottom_left,#e4dcff_0%,transparent_50%)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-bold text-amber-deep shadow-sm">
            <Sparkles size={18} aria-hidden /> {t('hero.eyebrow')}
          </motion.p>
          <motion.h1 {...rise(0.1)} className="mt-6 text-[2.6rem] font-bold leading-[1.05] text-ink sm:text-6xl xl:text-7xl">
            {t('hero.title')}
          </motion.h1>
          <motion.p {...rise(0.2)} className="mt-6 max-w-xl text-xl text-ink-soft sm:text-[1.35rem]">
            {t('hero.body')}
          </motion.p>

          <motion.div {...rise(0.3)} className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={onStart}
              className="group relative inline-flex min-h-[72px] items-center gap-3 overflow-hidden rounded-full bg-gradient-to-r from-amber to-coral px-7 font-display text-xl font-semibold sm:px-9 sm:text-2xl text-ink shadow-[0_18px_40px_-12px_rgba(242,127,91,0.7)] transition hover:-translate-y-1"
            >
              <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Sparkles size={26} aria-hidden /> {t('hero.cta')}
            </button>
            <button onClick={() => scrollToId('how')} className="inline-flex min-h-[72px] items-center gap-2 rounded-full px-6 text-xl font-bold text-ink underline-offset-4 hover:underline">
              {t('hero.secondary')} <ArrowDown size={22} aria-hidden />
            </button>
          </motion.div>

          <motion.ul {...rise(0.4)} className="mt-10 flex flex-wrap gap-3">
            {trust.map(({ icon: I, label }) => (
              <li key={label} className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 font-bold text-ink-soft">
                <I size={20} className="text-teal" aria-hidden /> {label}
              </li>
            ))}
          </motion.ul>
        </div>

        <Suspense fallback={<div className="h-[520px]" />}>
          <ProductReveal />
        </Suspense>
      </div>
    </section>
  )
}
