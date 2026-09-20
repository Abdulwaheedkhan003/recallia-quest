import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { SCREENS, ScreenChat, ScreenHub, ScreenMemory, ScreenRoutine, ScreenSong } from './MockScreens'
import Mascot from '../../components/Mascot'
import { useSettings } from '../../state/settings'

const STRIP = [ScreenHub, ScreenRoutine, ScreenSong, ScreenMemory]
const SPOT = [ScreenChat, ScreenSong, ScreenRoutine, ScreenMemory, ScreenHub]
const H = 400 // px height of one screen in the tablet strip (incl. gap)

/**
 * Product reveal: a tilted tablet with a slowly scrolling strip of screens,
 * a phone in front that flips between screens, and floating notification
 * cards — all layered in 3D with gentle pointer parallax.
 * Transform-only animation → GPU friendly. Fully static when motion is reduced.
 */
export default function ProductReveal() {
  const { t, motionOK } = useSettings()
  const [spot, setSpot] = useState(0)

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 18 })
  const sy = useSpring(my, { stiffness: 40, damping: 18 })
  const back = { x: useTransform(sx, (v) => v * -10), y: useTransform(sy, (v) => v * -10) }
  const mid = { x: useTransform(sx, (v) => v * 8), y: useTransform(sy, (v) => v * 8) }
  const front = { x: useTransform(sx, (v) => v * 22), y: useTransform(sy, (v) => v * 22) }

  useEffect(() => {
    if (!motionOK) return
    const id = setInterval(() => setSpot((s) => (s + 1) % SPOT.length), 4500)
    return () => clearInterval(id)
  }, [motionOK])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!motionOK || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }

  const Spot = SPOT[spot]

  return (
    <div
      className="relative mx-auto h-[520px] w-full max-w-[560px] sm:h-[600px]"
      style={{ perspective: 1400 }}
      onPointerMove={onMove}
      onPointerLeave={() => { mx.set(0); my.set(0) }}
      role="img"
      aria-label={t('reveal.label')}
    >
      <div aria-hidden className="absolute inset-0">
        {/* ambient light */}
        <motion.div style={back} className="absolute inset-8 rounded-full bg-gradient-to-br from-amber/40 via-coral/25 to-lavender/40 blur-3xl" />
        <motion.div style={back} className="drift absolute left-6 top-10 size-16 rounded-full bg-sky" />
        <motion.div style={back} className="drift absolute bottom-16 right-2 size-10 rounded-full bg-leaf/60 [animation-delay:-3s]" />

        {/* tablet with auto-scrolling screens */}
        <motion.div
          style={{ ...mid, rotateY: -16, rotateX: 8, transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-2 top-6 h-[440px] w-[300px] rounded-[34px] bg-ink p-3 shadow-[0_40px_80px_-20px_rgba(43,33,64,0.55)] sm:right-6 sm:h-[480px] sm:w-[330px]"
        >
          <div className="relative h-full overflow-hidden rounded-[24px] bg-cream">
            <motion.div
              className="space-y-3 p-0"
              animate={motionOK ? { y: [0, -H * STRIP.length] } : undefined}
              transition={{ duration: 36, ease: 'linear', repeat: Infinity }}
            >
              {[...STRIP, ...STRIP].map((S, i) => (
                <div key={i} style={{ height: H - 12 }}><S /></div>
              ))}
            </motion.div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-ink/25 to-transparent" />
          </div>
        </motion.div>

        {/* phone in front — flips between screens */}
        <motion.div
          style={{ ...front, rotateY: 10, rotateX: 4, transformStyle: 'preserve-3d' }}
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-4 left-0 h-[330px] w-[190px] rounded-[30px] bg-ink p-2.5 shadow-[0_30px_60px_-15px_rgba(43,33,64,0.6)] sm:left-4 sm:h-[360px] sm:w-[210px]"
        >
          <div className="h-full overflow-hidden rounded-[22px]" style={{ perspective: 800 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={spot}
                className="h-full"
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                exit={{ rotateY: -90, opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeInOut' }}
              >
                <Spot />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* floating reminder toast */}
        <motion.div
          style={front}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="absolute left-[34%] top-0 flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-5 shadow-xl backdrop-blur sm:left-[30%]"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-amber/20 text-amber-deep"><Bell size={20} /></span>
          <span className="text-sm font-bold leading-tight">6:00 PM<br /><span className="font-normal text-ink-soft">Call Anu 💛</span></span>
        </motion.div>

        {/* mascot peeking */}
        <motion.div style={front} className="absolute -bottom-2 right-0 sm:right-4">
          <Mascot size={110} label="" mood="happy" />
        </motion.div>
      </div>

      {/* screen index dots — also show that content cycles */}
      <div aria-hidden className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {SCREENS.map((_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === spot ? 'w-6 bg-ink' : 'w-2 bg-ink/25'}`} />
        ))}
      </div>
    </div>
  )
}
