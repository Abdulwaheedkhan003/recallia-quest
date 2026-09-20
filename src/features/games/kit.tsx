import { motion } from 'framer-motion'
import { Volume2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Progress } from '../../components/ui'
import type { GameProps } from './GameFrame'
import { stopAll } from './audio'

/**
 * Small shared helpers for the activity library. Each game still has its own mechanic;
 * these only handle rounds, scoring and big, clear answer buttons.
 */

/** Round-based scoring: call `answer(ok)` once per round. Finishes after `total` rounds. */
export function useRounds(total: number, { finish, cheer }: Pick<GameProps, 'finish' | 'cheer'>, pause = 1100) {
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [last, setLast] = useState<boolean | null>(null)
  const busy = useRef(false)
  const answer = (ok: boolean, points = 1) => {
    if (busy.current) return
    busy.current = true
    cheer(ok ? 'good' : 'retry')
    setLast(ok)
    const s = score + (ok ? points : 0)
    setScore(s)
    setTimeout(() => {
      busy.current = false
      setLast(null)
      if (round + 1 >= total) finish(Math.min(s, total * points), total * points)
      else setRound(round + 1)
    }, pause)
  }
  return { round, score, answer, last, locked: last !== null }
}

export function RoundBar({ round, total, label = 'Round' }: { round: number; total: number; label?: string }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <div className="flex-1"><Progress value={round} max={total} label="Game progress" /></div>
      <span className="text-lg font-bold">{label} {Math.min(round + 1, total)} / {total}</span>
    </div>
  )
}

export function Prompt({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5 text-center">
      <h3 className="text-3xl font-bold leading-snug">{children}</h3>
      {sub && <p className="mt-2 text-xl text-ink-soft">{sub}</p>}
    </div>
  )
}

/** A big answer tile. `state` colours it after answering. */
export function Choice({ onClick, children, state, disabled, label, className = '' }: { onClick: () => void; children: ReactNode; state?: 'right' | 'wrong' | 'picked' | null; disabled?: boolean; label?: string; className?: string }) {
  const ring = state === 'right' ? 'bg-leaf/25 ring-4 ring-leaf' : state === 'wrong' ? 'bg-coral/20 ring-4 ring-coral' : state === 'picked' ? 'bg-amber/25 ring-4 ring-amber' : 'bg-white'
  return (
    <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={state === 'picked' || undefined}
      className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-[28px] p-3 text-center text-2xl font-bold shadow-lg transition-colors disabled:cursor-default ${ring} ${className}`}>
      {children}
    </motion.button>
  )
}

/** "Listen" button with a pulsing state while sound plays. */
export function ListenButton({ onPlay, playing, label = 'Listen', again = 'Listen again' }: { onPlay: () => void; playing: boolean; label?: string; again?: string }) {
  const [used, setUsed] = useState(false)
  return (
    <div className="my-4 flex justify-center">
      <Button big disabled={playing} onClick={() => { setUsed(true); onPlay() }} className={playing ? 'animate-pulse' : ''}>
        <Volume2 aria-hidden /> {playing ? 'Listening…' : used ? again : label}
      </Button>
    </div>
  )
}

/** Stop any game audio when the game closes. */
export function useStopAudioOnExit() {
  useEffect(() => () => stopAll(), [])
}

export const rnd = (n: number) => Math.floor(Math.random() * n)
export const range = (n: number) => Array.from({ length: n }, (_, i) => i)
