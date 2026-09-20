import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Progress } from '../../components/ui'
import { useSettings } from '../../state/settings'
import type { GameProps } from './GameFrame'
import { DAY_STEPS, OBJECTS, pick, shuffle } from './data'

const shake = { x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } }

/* ======================= Memory Match ======================= */
export function MemoryMatch({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const pairs = [3, 4, 6][level - 1]
  const cards = useMemo(() => shuffle(pick(OBJECTS, pairs).flatMap((o, i) => [{ ...o, pair: i, uid: i * 2 }, { ...o, pair: i, uid: i * 2 + 1 }])), [pairs])
  const [open, setOpen] = useState<number[]>([])
  const [found, setFound] = useState<Set<number>>(new Set())
  const [moves, setMoves] = useState(0)
  const lock = useRef(false)

  const flip = (i: number) => {
    if (lock.current || open.includes(i) || found.has(cards[i].pair)) return
    const next = [...open, i]
    setOpen(next)
    if (next.length < 2) return
    setMoves((m) => m + 1)
    const [a, b] = next
    if (cards[a].pair === cards[b].pair) {
      const f = new Set(found).add(cards[a].pair)
      setFound(f)
      setOpen([])
      cheer('good')
      if (f.size === pairs) {
        const m = moves + 1
        setTimeout(() => finish(Math.max(pairs, Math.min(pairs * 3, pairs * 3 - (m - pairs))), pairs * 3), 700)
      }
    } else {
      lock.current = true
      setTimeout(() => { setOpen([]); lock.current = false }, 1300)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4"><div className="flex-1"><Progress value={found.size} max={pairs} label={t('games.progress')} /></div><span className="text-lg font-bold">{t('games.pairs', { n: found.size, total: pairs })}</span></div>
      <div className={`mx-auto grid max-w-3xl gap-4 ${pairs <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {cards.map((c, i) => {
          const shown = open.includes(i) || found.has(c.pair)
          return (
            <motion.button key={c.uid} onClick={() => flip(i)} aria-label={shown ? t(c.k) : t('games.hiddenCard', { n: i + 1 })} aria-pressed={shown}
              animate={{ scale: shown ? 1 : 0.95 }} transition={{ duration: 0.25 }}
              className={`grid aspect-square place-items-center rounded-[28px] text-6xl shadow-lg sm:text-7xl ${found.has(c.pair) ? 'bg-leaf/30 ring-4 ring-leaf' : shown ? 'bg-white' : 'bg-gradient-to-br from-lavender to-[#6f5ee8]'}`}>
              <span>{shown ? c.e : <span className="text-4xl text-white/70">✦</span>}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ======================= Sequence (watch, then repeat) ======================= */
const PADS = [
  { shape: '●', color: 'bg-coral', k: 'games.padRed' as const },
  { shape: '▲', color: 'bg-amber', k: 'games.padYellow' as const },
  { shape: '■', color: 'bg-teal', k: 'games.padGreen' as const },
  { shape: '★', color: 'bg-lavender', k: 'games.padPurple' as const },
]
export function Sequence({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const rounds = 3
  const startLen = level + 1
  const [round, setRound] = useState(0)
  const [seq, setSeq] = useState<number[]>(() => Array.from({ length: startLen }, () => Math.floor(Math.random() * 4)))
  const [lit, setLit] = useState<number | null>(null)
  const [showing, setShowing] = useState(true)
  const [pos, setPos] = useState(0)
  const [mistakes, setMistakes] = useState(0)

  const play = (s: number[]) => {
    setShowing(true)
    setPos(0)
    s.forEach((p, i) => {
      setTimeout(() => setLit(p), 900 + i * 1000)
      setTimeout(() => setLit(null), 900 + i * 1000 + 650)
    })
    setTimeout(() => setShowing(false), 900 + s.length * 1000)
  }
  useEffect(() => { play(seq) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const press = (p: number) => {
    if (showing) return
    setLit(p)
    setTimeout(() => setLit(null), 250)
    if (p !== seq[pos]) {
      setMistakes((m) => m + 1)
      cheer('retry')
      setTimeout(() => play(seq), 800)
      return
    }
    if (pos + 1 < seq.length) return setPos(pos + 1)
    cheer('good')
    if (round + 1 >= rounds) return setTimeout(() => finish(Math.max(1, rounds * 2 - mistakes), rounds * 2), 600)
    const next = [...seq, Math.floor(Math.random() * 4)]
    setRound(round + 1)
    setSeq(next)
    setTimeout(() => play(next), 900)
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <Progress value={round} max={rounds} label={t('games.progress')} />
      <p className="mt-4 text-2xl font-bold" aria-live="polite">{showing ? t('games.watch') : t('games.yourTurn', { n: pos + 1, total: seq.length })}</p>
      <div className="mt-6 grid grid-cols-2 gap-5">
        {PADS.map((pad, i) => (
          <motion.button key={i} onClick={() => press(i)} disabled={showing} aria-label={t(pad.k)}
            animate={{ scale: lit === i ? 1.08 : 1, opacity: lit === i || lit === null ? 1 : 0.55 }}
            className={`grid aspect-square place-items-center rounded-[36px] text-7xl text-white shadow-xl ${pad.color} ${lit === i ? 'ring-8 ring-white' : ''}`}>
            {pad.shape}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ======================= Name the object ======================= */
export function ObjectsGame({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const total = 8
  const nOpts = level + 1
  const rounds = useMemo(() => pick(OBJECTS, total).map((ans) => ({ ans, opts: shuffle([ans, ...pick(OBJECTS.filter((o) => o.k !== ans.k), nOpts - 1)]) })), [nOpts])
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [missed, setMissed] = useState(false)
  const [wrong, setWrong] = useState<string | null>(null)

  const choose = (k: string) => {
    if (k !== rounds[i].ans.k) { setMissed(true); setWrong(k); cheer('retry'); return }
    const s = score + (missed ? 0 : 1)
    setScore(s)
    cheer('good')
    setMissed(false)
    setWrong(null)
    if (i + 1 >= total) setTimeout(() => finish(s, total), 500)
    else setI(i + 1)
  }
  const r = rounds[i]
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Progress value={i} max={total} label={t('games.progress')} />
      <p className="mt-4 text-2xl font-bold">{t('games.whatIsThis')}</p>
      <motion.div key={i} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto mt-4 grid size-52 place-items-center rounded-[48px] bg-white text-[8rem] shadow-xl" aria-hidden>{r.ans.e}</motion.div>
      <div className={`mt-8 grid gap-4 ${nOpts > 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2'}`}>
        {r.opts.map((o) => (
          <motion.div key={o.k} animate={wrong === o.k ? shake : {}}>
            <Button big variant="secondary" className={`w-full text-2xl ${wrong === o.k ? 'opacity-50' : ''}`} onClick={() => choose(o.k)}>{t(o.k)}</Button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ======================= Remember the basket ======================= */
export function Recall({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const n = level + 2
  const shown = useMemo(() => pick(OBJECTS, n), [n])
  const grid = useMemo(() => shuffle([...shown, ...pick(OBJECTS.filter((o) => !shown.includes(o)), n)]), [shown, n])
  const [phase, setPhase] = useState<'study' | 'pick'>('study')
  const [sel, setSel] = useState<string[]>([])

  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < n ? [...s, k] : s))
  const done = () => {
    const right = sel.filter((k) => shown.some((o) => o.k === k)).length
    cheer(right === n ? 'good' : 'retry')
    setTimeout(() => finish(right, n), 700)
  }

  if (phase === 'study') {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-2xl font-bold">{t('games.lookCarefully', { n })}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {shown.map((o) => (
            <div key={o.k} className="w-36 rounded-[32px] bg-white p-4 shadow-lg"><div className="text-7xl" aria-hidden>{o.e}</div><p className="mt-2 text-xl font-bold">{t(o.k)}</p></div>
          ))}
        </div>
        <Button big className="mt-8" onClick={() => setPhase('pick')}>{t('games.remembered')}</Button>
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-2xl font-bold">{t('games.whichWere', { n })}</p>
      <p className="mt-1 text-lg text-ink-soft">{t('games.chosen', { n: sel.length, total: n })}</p>
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4">
        {grid.map((o) => (
          <button key={o.k} onClick={() => toggle(o.k)} aria-pressed={sel.includes(o.k)}
            className={`rounded-[28px] p-3 shadow ${sel.includes(o.k) ? 'bg-teal text-white ring-4 ring-teal' : 'bg-white'}`}>
            <span className="block text-6xl" aria-hidden>{o.e}</span><span className="text-lg font-bold">{t(o.k)}</span>
            {sel.includes(o.k) && <span className="sr-only">✓</span>}
          </button>
        ))}
      </div>
      <Button big className="mt-8" disabled={sel.length !== n} onClick={done}>{t('games.check')}</Button>
    </div>
  )
}

/* ======================= What comes next? ======================= */
const SHAPES = [
  { s: '●', c: 'text-coral', k: 'games.circle' as const },
  { s: '▲', c: 'text-amber', k: 'games.triangle' as const },
  { s: '■', c: 'text-teal', k: 'games.square' as const },
  { s: '★', c: 'text-lavender', k: 'games.starShape' as const },
]
function makePattern(level: number) {
  const units = level === 1 ? [[0, 1]] : level === 2 ? [[0, 1, 2], [0, 0, 1]] : [[0, 1, 2, 3], [0, 1, 1], [0, 0, 1, 2]]
  const unit = units[Math.floor(Math.random() * units.length)]
  const map = shuffle([0, 1, 2, 3])
  const seq = Array.from({ length: unit.length * 2 + 1 }, (_, i) => map[unit[i % unit.length]])
  const answer = seq.pop()!
  const opts = shuffle([answer, ...shuffle([0, 1, 2, 3].filter((x) => x !== answer)).slice(0, 2)])
  return { seq, answer, opts }
}
export function Pattern({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const total = 6
  const rounds = useMemo(() => Array.from({ length: total }, () => makePattern(level)), [level])
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [missed, setMissed] = useState(false)
  const [wrong, setWrong] = useState<number | null>(null)
  const r = rounds[i]
  const choose = (o: number) => {
    if (o !== r.answer) { setMissed(true); setWrong(o); cheer('retry'); return }
    const s = score + (missed ? 0 : 1)
    setScore(s); setMissed(false); setWrong(null); cheer('good')
    if (i + 1 >= total) setTimeout(() => finish(s, total), 500)
    else setI(i + 1)
  }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Progress value={i} max={total} label={t('games.progress')} />
      <p className="mt-4 text-2xl font-bold">{t('games.whatNext')}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 rounded-[36px] bg-white p-6 shadow-lg">
        {r.seq.map((x, j) => <span key={j} className={`text-6xl ${SHAPES[x].c}`} role="img" aria-label={t(SHAPES[x].k)}>{SHAPES[x].s}</span>)}
        <span className="grid size-20 place-items-center rounded-2xl border-4 border-dashed border-ink/30 text-4xl font-bold text-ink/40" aria-label="?">?</span>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4">
        {r.opts.map((o) => (
          <motion.button key={o} animate={wrong === o ? shake : {}} onClick={() => choose(o)} aria-label={t(SHAPES[o].k)}
            className={`grid aspect-square place-items-center rounded-[32px] bg-white text-7xl shadow-lg ${SHAPES[o].c} ${wrong === o ? 'opacity-40' : ''}`}>
            {SHAPES[o].s}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

/* ======================= Put the day in order ======================= */
export function DayOrder({ level, finish, cheer }: GameProps) {
  const { t } = useSettings()
  const n = level + 2
  const steps = useMemo(() => {
    const idx = shuffle(DAY_STEPS.map((_, i) => i)).slice(0, n).sort((a, b) => a - b)
    return idx.map((i) => DAY_STEPS[i])
  }, [n])
  const cards = useMemo(() => shuffle(steps), [steps])
  const [placed, setPlaced] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)

  const tap = (k: string) => {
    if (placed.includes(k)) return
    if (steps[placed.length].k !== k) { setMistakes((m) => m + 1); setWrong(k); cheer('retry'); return }
    const p = [...placed, k]
    setPlaced(p); setWrong(null)
    if (p.length === n) { cheer('good'); setTimeout(() => finish(Math.max(0, n - mistakes), n), 700) }
  }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-2xl font-bold">{t('games.whatFirst')}</p>
      <ol className="mt-5 flex min-h-32 flex-wrap justify-center gap-3 rounded-[32px] bg-white/70 p-4" aria-label={t('games.yourDay')}>
        {steps.map((s, i) => (
          <li key={i} className={`grid w-28 place-items-center rounded-3xl p-3 ${placed[i] ? 'bg-leaf/25 ring-4 ring-leaf' : 'border-4 border-dashed border-ink/15'}`}>
            <span className="text-lg font-bold text-ink-soft">{i + 1}</span>
            {placed[i] && <><span className="text-5xl" aria-hidden>{s.e}</span><span className="font-bold">{t(s.k)}</span></>}
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap justify-center gap-4">
        {cards.filter((c) => !placed.includes(c.k)).map((c) => (
          <motion.button key={c.k} animate={wrong === c.k ? shake : {}} onClick={() => tap(c.k)} className="w-36 rounded-[28px] bg-white p-4 shadow-lg">
            <span className="block text-6xl" aria-hidden>{c.e}</span><span className="text-xl font-bold">{t(c.k)}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
