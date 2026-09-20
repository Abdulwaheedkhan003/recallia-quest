import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { click, playMelody, playNote, playSound, wait } from '../audio'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, ListenButton, Prompt, range, RoundBar, rnd, useRounds, useStopAudioOnExit } from '../kit'

/* ======================= Copy the beat (rhythm timing) ======================= */
const RHYTHMS: number[][] = [
  // gaps between taps, in beats
  [1, 1, 1], [1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1], [1, 1, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5, 1], [1, 0.5, 0.5, 0.5, 0.5], [0.5, 1, 0.5, 1],
]
export function RhythmCopy(p: GameProps) {
  useStopAudioOnExit()
  const total = 4
  const r = useRounds(total, p, 1600)
  const beat = [0.7, 0.55, 0.45][p.level - 1]
  const rounds = useMemo(() => range(total).map((i) => RHYTHMS[Math.min(RHYTHMS.length - 1, rnd(3) + (p.level - 1) * 2 + (i > 1 ? 1 : 0))]), [p.level])
  const gaps = rounds[r.round]
  const [phase, setPhase] = useState<'ready' | 'listen' | 'tap'>('ready')
  const [hit, setHit] = useState(false)
  const taps = useRef<number[]>([])
  const [count, setCount] = useState(0)
  useEffect(() => { setPhase('ready'); setCount(0); taps.current = [] }, [r.round])
  const drum = () => { setHit(true); setTimeout(() => setHit(false), 120); void playSound('drum', { vol: 0.9 }) }

  const listen = async () => {
    setPhase('listen')
    const times = [0, ...gaps.slice(0, -1).map((_, i) => gaps.slice(0, i + 1).reduce((a, b) => a + b, 0))]
    for (let i = 0; i < times.length; i++) {
      await wait((i === 0 ? 0 : times[i] - times[i - 1]) * beat * 1000)
      setHit(true); setTimeout(() => setHit(false), 120); click(0, 180)
    }
    await wait(600)
    taps.current = []; setCount(0); setPhase('tap')
  }
  const tap = () => {
    if (phase !== 'tap' || r.locked) return
    drum()
    taps.current.push(performance.now())
    setCount(taps.current.length)
    if (taps.current.length === gaps.length) {
      const t = taps.current
      const played = t.slice(1).map((x, i) => (x - t[i]) / 1000 / beat)
      const want = gaps.slice(0, -1)
      const tol = [0.45, 0.35, 0.28][p.level - 1]
      const ok = want.every((w, i) => Math.abs(played[i] - w) <= tol * Math.max(0.6, w))
      r.answer(ok)
    }
  }
  return (
    <div className="mx-auto max-w-xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`${gaps.length} beats. Keep the same long and short gaps.`}>Listen, then tap the drum the same way</Prompt>
      {phase === 'ready' && <Button big onClick={listen}>▶ Hear the beat</Button>}
      {phase === 'listen' && <p className="text-2xl font-bold">👂 Listen…</p>}
      {phase === 'tap' && <p className="text-2xl font-bold">Your turn — {count} of {gaps.length}</p>}
      <motion.button type="button" onPointerDown={tap} animate={{ scale: hit ? 0.9 : 1 }} disabled={phase !== 'tap'} aria-label="Drum"
        className="mx-auto mt-6 grid size-56 place-items-center rounded-full bg-[radial-gradient(circle,#fde68a,#d97706)] text-8xl shadow-2xl ring-8 ring-[#92400e]/40 disabled:opacity-70">🥁</motion.button>
    </div>
  )
}

/* ======================= High or low (pitch) ======================= */
export function HighLow(p: GameProps) {
  useStopAudioOnExit()
  const total = 6
  const r = useRounds(total, p)
  const semis = [[7, 12], [3, 5], [1, 2]][p.level - 1]
  const rounds = useMemo(() => range(total).map(() => {
    const base = 220 * 2 ** (rnd(12) / 12)
    const up = Math.random() < 0.5
    const d = semis[rnd(semis.length)]
    return { a: base, b: base * 2 ** ((up ? d : -d) / 12), up }
  }), [p.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rounds[r.round]
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  useEffect(() => setHeard(false), [r.round])
  const listen = async () => { setPlaying(true); playNote(cur.a, 0.7); await wait(900); playNote(cur.b, 0.7); await wait(900); setPlaying(false); setHeard(true) }
  return (
    <div className="mx-auto max-w-xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt>Is the second note higher or lower?</Prompt>
      <ListenButton onPlay={listen} playing={playing} />
      <div className="grid grid-cols-2 gap-4">
        <Choice disabled={!heard || r.locked} state={r.locked && cur.up ? 'right' : null} onClick={() => r.answer(cur.up)}><span className="text-5xl">⬆️</span>Higher</Choice>
        <Choice disabled={!heard || r.locked} state={r.locked && !cur.up ? 'right' : null} onClick={() => r.answer(!cur.up)}><span className="text-5xl">⬇️</span>Lower</Choice>
      </div>
    </div>
  )
}

/* ======================= Name that tune (public-domain melodies) ======================= */
const TUNES: { name: string; e: string; notes: [string, number][] }[] = [
  { name: 'Twinkle, Twinkle, Little Star', e: '⭐', notes: [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]] },
  { name: 'Happy Birthday', e: '🎂', notes: [['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2]] },
  { name: 'Jingle Bells', e: '🔔', notes: [['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4]] },
  { name: 'Ode to Joy', e: '🎻', notes: [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2]] },
  { name: 'Mary Had a Little Lamb', e: '🐑', notes: [['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2], ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2]] },
  { name: 'Frère Jacques', e: '🛎️', notes: [['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['E4', 1], ['F4', 1], ['G4', 2]] },
  { name: 'London Bridge Is Falling Down', e: '🌉', notes: [['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['D4', 1], ['E4', 1], ['F4', 2], ['E4', 1], ['F4', 1], ['G4', 2]] },
  { name: 'Row, Row, Row Your Boat', e: '🚣', notes: [['C4', 1.5], ['C4', 1.5], ['C4', 1], ['D4', 0.5], ['E4', 1.5], ['E4', 1], ['D4', 0.5], ['E4', 1], ['F4', 0.5], ['G4', 3]] },
]
export function NameTune(p: GameProps) {
  useStopAudioOnExit()
  const total = 4
  const r = useRounds(total, p)
  const n = [3, 4, 4][p.level - 1]
  const rounds = useMemo(() => pick(TUNES, total).map((ans) => ({ ans, opts: shuffle([ans, ...pick(TUNES.filter((x) => x !== ans), n - 1)]) })), [n])
  const cur = rounds[r.round]
  // Harder level plays only the opening notes.
  const notes = p.level === 3 ? cur.ans.notes.slice(0, 6) : cur.ans.notes
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => { setHeard(false); setPicked(null) }, [r.round])
  const listen = async () => { setPlaying(true); await playMelody(notes, 110); setPlaying(false); setHeard(true) }
  return (
    <div className="mx-auto max-w-2xl">
      <RoundBar round={r.round} total={total} />
      <Prompt sub="Sing along if you like!">Which song is this?</Prompt>
      <ListenButton onPlay={listen} playing={playing} label="Play the tune" again="Play it again" />
      <div className="grid gap-3 sm:grid-cols-2">
        {cur.opts.map((o) => (
          <Choice key={o.name} disabled={!heard || r.locked} state={picked === o.name ? (o === cur.ans ? 'right' : 'wrong') : r.locked && o === cur.ans ? 'right' : null}
            onClick={() => { setPicked(o.name); r.answer(o === cur.ans) }}><span className="text-4xl">{o.e}</span><span className="text-xl">{o.name}</span></Choice>
        ))}
      </div>
    </div>
  )
}

