import { motion } from 'framer-motion'
import { useState } from 'react'
import { navigate } from '../lib/router'
import { useT } from '../state/settings'
import Mascot from './Mascot'

/** Lumi waits on the right edge; tap to open Story Time. */
export default function StoryButton() {
  const t = useT()
  const [hover, setHover] = useState(false)
  return (
    <motion.button
      onClick={() => navigate('/stories')}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="fixed bottom-4 right-3 z-30 flex flex-col items-center rounded-[28px] bg-white/90 p-2 pb-3 shadow-xl ring-2 ring-amber/40 backdrop-blur sm:right-5"
      aria-label={t('story.open')}
      initial={{ x: 120 }}
      animate={{ x: 0 }}
      transition={{ delay: 0.6, type: 'spring', stiffness: 80 }}
    >
      <Mascot size={68} mood={hover ? "happy" : "idle"} label="" />
      <span className="font-display text-base font-semibold">{t('story.button')}</span>
    </motion.button>
  )
}
