import { motion } from 'framer-motion'
import { useId } from 'react'

export type MascotMood = 'idle' | 'happy' | 'thinking' | 'encouraging' | 'celebrating' | 'explaining'

interface Props {
  mood?: MascotMood
  size?: number
  className?: string
  /** Accessible name. Pass '' when the mascot is purely decorative. */
  label?: string
}

/**
 * Lumi — the Recallia Quest companion. A soft, glowing seed-spirit.
 * Pure SVG + framer-motion so it is tiny, crisp and reusable everywhere.
 */
export default function Mascot({ mood = 'idle', size = 160, className = '', label = 'Lumi, your companion' }: Props) {
  const id = useId().replace(/:/g, '')
  const happyEyes = mood === 'happy' || mood === 'celebrating'
  const lookUp = mood === 'thinking'

  return (
    <motion.div
      className={`relative inline-block select-none ${className}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      whileHover={{ rotate: [0, -4, 4, 0], transition: { duration: 0.8 } }}
      whileTap={{ scale: 0.94 }}
    >
      <motion.svg
        viewBox="0 0 200 200"
        width="100%"
        height="100%"
        style={{ originY: 1 }}
        animate={
          mood === 'celebrating'
            ? { y: [0, -18, 0], scaleY: [1, 1.04, 0.97, 1] }
            : { scaleY: [1, 1.025, 1], y: [0, -2, 0] }
        }
        transition={{ duration: mood === 'celebrating' ? 0.9 : 3.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <defs>
          <radialGradient id={`b${id}`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#FFE3A3" />
            <stop offset="55%" stopColor="#F9B94A" />
            <stop offset="100%" stopColor="#EE8B3A" />
          </radialGradient>
          <radialGradient id={`g${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD37A" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFD37A" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* soft glow */}
        <circle cx="100" cy="112" r="96" fill={`url(#g${id})`} />
        {/* ground shadow */}
        <ellipse cx="100" cy="188" rx="46" ry="7" fill="#2B2140" opacity="0.12" />

        {/* sprout + star */}
        <path d="M100 52 C 98 38, 100 30, 104 22" stroke="#4E9A5A" strokeWidth="5" fill="none" strokeLinecap="round" />
        <motion.path
          d="M103 34 C 118 22, 134 26, 138 34 C 126 44, 112 42, 103 34 Z"
          fill="#6DBF73"
          style={{ originX: '103px', originY: '34px' }}
          animate={{ rotate: [0, 8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.path
          d="M104 10 l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z"
          fill="#FFF3C4"
          stroke="#F5A524"
          strokeWidth="2"
          animate={{ opacity: [0.7, 1, 0.7], scale: [0.95, 1.08, 0.95] }}
          style={{ originX: '104px', originY: '22px' }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />

        {/* arms */}
        <motion.path
          d="M42 130 C 28 128, 24 116, 30 108"
          stroke="#EE8B3A" strokeWidth="11" strokeLinecap="round" fill="none"
          style={{ originX: '42px', originY: '130px' }}
          animate={mood === 'celebrating' ? { rotate: [0, 40, 0] } : { rotate: 0 }}
          transition={{ duration: 0.9, repeat: mood === 'celebrating' ? Infinity : 0 }}
        />
        <motion.path
          d="M158 130 C 172 128, 176 116, 170 108"
          stroke="#EE8B3A" strokeWidth="11" strokeLinecap="round" fill="none"
          style={{ originX: '158px', originY: '130px' }}
          animate={
            mood === 'explaining' || mood === 'encouraging'
              ? { rotate: [-30, -45, -30] }
              : mood === 'celebrating' ? { rotate: [0, -40, 0] } : { rotate: 0 }
          }
          transition={{ duration: 1.2, repeat: mood === 'idle' || mood === 'happy' || mood === 'thinking' ? 0 : Infinity }}
        />

        {/* body */}
        <path d="M100 50 C 150 50, 170 95, 166 132 C 162 170, 134 186, 100 186 C 66 186, 38 170, 34 132 C 30 95, 50 50, 100 50 Z" fill={`url(#b${id})`} />
        <ellipse cx="78" cy="84" rx="18" ry="10" fill="#fff" opacity="0.35" transform="rotate(-25 78 84)" />

        {/* cheeks */}
        <ellipse cx="62" cy="136" rx="11" ry="7" fill="#F27F5B" opacity={mood === 'encouraging' || happyEyes ? 0.75 : 0.45} />
        <ellipse cx="138" cy="136" rx="11" ry="7" fill="#F27F5B" opacity={mood === 'encouraging' || happyEyes ? 0.75 : 0.45} />

        {/* eyes */}
        {happyEyes ? (
          <g stroke="#2B2140" strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M68 118 q 12 -14 24 0" />
            <path d="M108 118 q 12 -14 24 0" />
          </g>
        ) : (
          <motion.g
            style={{ originY: '118px' }}
            animate={{ scaleY: [1, 1, 0.1, 1] }}
            transition={{ duration: 4.5, times: [0, 0.92, 0.96, 1], repeat: Infinity }}
          >
            <ellipse cx="80" cy="118" rx="10" ry="12" fill="#2B2140" />
            <ellipse cx="120" cy="118" rx="10" ry="12" fill="#2B2140" />
            <circle cx={lookUp ? 85 : 83} cy={lookUp ? 110 : 113} r="4" fill="#fff" />
            <circle cx={lookUp ? 125 : 123} cy={lookUp ? 110 : 113} r="4" fill="#fff" />
          </motion.g>
        )}

        {/* mouth */}
        {mood === 'explaining' ? (
          <ellipse cx="100" cy="146" rx="8" ry="7" fill="#7A2E3A" />
        ) : mood === 'thinking' ? (
          <path d="M92 148 q 8 -3 16 0" stroke="#2B2140" strokeWidth="5" strokeLinecap="round" fill="none" />
        ) : (
          <path
            d={happyEyes ? 'M84 140 q 16 20 32 0 z' : 'M88 142 q 12 12 24 0'}
            stroke="#2B2140" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
            fill={happyEyes ? '#7A2E3A' : 'none'}
          />
        )}
      </motion.svg>

      {/* thought bubble */}
      {mood === 'thinking' && (
        <motion.div
          aria-hidden
          className="absolute -top-2 -right-4 rounded-full bg-white px-3 py-1 font-display text-ink shadow-md"
          style={{ fontSize: size * 0.12 }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          …
        </motion.div>
      )}

      {/* celebration sparkles */}
      {mood === 'celebrating' &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute text-amber"
            style={{ left: `${10 + i * 20}%`, top: '10%', fontSize: size * 0.12 }}
            animate={{ y: [0, -size * 0.35], opacity: [1, 0], rotate: [0, 90] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
          >
            ✦
          </motion.span>
        ))}
    </motion.div>
  )
}
