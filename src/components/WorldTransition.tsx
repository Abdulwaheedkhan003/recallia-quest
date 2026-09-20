import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import Mascot from './Mascot'
import { useSettings } from '../state/settings'

type Phase = 'in' | 'hold' | 'out'

interface Props {
  active: boolean
  /** Called when the screen is fully covered — swap the page underneath here. */
  onCovered: () => void
  onDone: () => void
  title: string
  subtitle?: string
  /** Sky tint behind the clouds. */
  tone?: string
}

/** A soft wall of clouds, built from overlapping circles (no image assets). */
function CloudWall({ side }: { side: 'left' | 'right' }) {
  const puffs = [
    [10, 12, 46], [35, 5, 38], [60, 18, 50], [22, 40, 55], [55, 48, 48], [12, 70, 50], [45, 78, 56], [75, 70, 40], [80, 32, 44],
  ]
  return (
    <div className={`absolute inset-y-[-10%] w-[75%] ${side === 'left' ? 'left-0' : 'right-0 scale-x-[-1]'}`}>
      {puffs.map(([x, y, s], i) => (
        <div
          key={i}
          className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#fff6e8_55%,#f3e6ff_100%)]"
          style={{ left: `${x}%`, top: `${y}%`, width: `${s}vmax`, height: `${s}vmax`, transform: 'translate(-30%,-30%)' }}
        />
      ))}
    </div>
  )
}

/**
 * Cinematic but lightweight "entering the world" transition.
 * Clouds close in → glow + mascot greeting → clouds part to reveal the new page.
 * With calm-motion on, it becomes a simple cross-fade.
 */
export default function WorldTransition({ active, onCovered, onDone, title, subtitle, tone = '#ffe7c2' }: Props) {
  const { motionOK } = useSettings()
  const [phase, setPhase] = useState<Phase>('in')

  useEffect(() => {
    if (!active) return
    setPhase('in')
    const d = motionOK ? [1000, 2400, 3500] : [300, 1300, 1700]
    const a = setTimeout(() => { setPhase('hold'); onCovered() }, d[0])
    const b = setTimeout(() => setPhase('out'), d[1])
    const c = setTimeout(onDone, d[2])
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const closed = phase !== 'out'
  const ease = [0.65, 0, 0.35, 1] as const

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[90] overflow-hidden"
          role="status"
          aria-live="polite"
          initial={{ opacity: motionOK ? 1 : 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* warm sky */}
          <motion.div
            className="absolute inset-0"
            style={{ background: `radial-gradient(circle at 50% 45%, #fffaf0 0%, ${tone} 45%, #d9c9ff 100%)` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: closed ? 1 : 0 }}
            transition={{ duration: motionOK ? 0.8 : 0.3, delay: closed ? 0.2 : 0.35 }}
          />

          {motionOK && (
            <>
              <motion.div className="absolute inset-0" initial={{ x: '-100%' }} animate={{ x: closed ? '-18%' : '-110%' }} transition={{ duration: 1, ease }}>
                <CloudWall side="left" />
              </motion.div>
              <motion.div className="absolute inset-0" initial={{ x: '100%' }} animate={{ x: closed ? '18%' : '110%' }} transition={{ duration: 1, ease }}>
                <CloudWall side="right" />
              </motion.div>
              {/* floating light motes */}
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="absolute size-2 rounded-full bg-amber shadow-[0_0_12px_4px_rgba(245,165,36,0.6)]"
                  style={{ left: `${8 + ((i * 37) % 84)}%`, top: '100%' }}
                  animate={{ y: ['0vh', '-110vh'], opacity: [0, 1, 0] }}
                  transition={{ duration: 3 + (i % 3), delay: (i % 5) * 0.2, ease: 'easeOut' }}
                />
              ))}
            </>
          )}

          {/* centre greeting */}
          <motion.div
            className="absolute inset-0 grid place-items-center text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: phase === 'hold' ? 1 : 0, scale: phase === 'hold' ? 1 : 0.94 }}
            transition={{ duration: 0.5 }}
          >
            <div>
              <Mascot size={180} mood="happy" label="" />
              <p className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">{title}</p>
              {subtitle && <p className="mt-2 text-xl font-bold text-ink-soft">{subtitle}</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
