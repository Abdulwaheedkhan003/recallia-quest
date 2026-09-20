import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { speak } from '../../../lib/speech'
import { useSettings } from '../../../state/settings'
import { OBJECTS, pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, Prompt, range, RoundBar, rnd, useRounds } from '../kit'

/* ======================= What's missing? ======================= */
export function WhatsMissing(p: GameProps) {
  const { t } = useSettings()
  const total = 4
  const r = useRounds(total, p)
  const n = [4, 6, 8][p.level - 1]
  const rounds = useMemo(() => range(total).map(() => { const items = pick(OBJECTS, n); return { items, gone: rnd(n) } }), [n])
  const cur = rounds[r.round]
  const [phase, setPhase] = useState<'look' | 'cover' | 'ask'>('look')
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { setPhase('look'); setPicked(null) }, [r.round])
  const hide = () => { setPhase('cover'); setTimeout(() => setPhase('ask'), 1400) }
  const opts = useMemo(() => shuffle([cur.gone, ...pick(range(OBJECTS.length).filter((i) => !cur.items.includes(OBJECTS[i])), 3).map((i) => -1 - i)]), [cur])
  const nameOf = (o: number) => (o >= 0 ? cur.items[o] : OBJECTS[-1 - o])
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={phase === 'look' ? 'Take your time. Tap "Ready" when you have looked.' : undefined}>{phase === 'ask' ? 'Something is gone. What was it?' : `Look at these ${n} things on the table`}</Prompt>
      <div className="relative mx-auto mb-6 grid max-w-2xl grid-cols-4 gap-3 rounded-[40px] bg-[#c08a55] p-5 shadow-inner">
        {cur.items.map((o, i) => (
          <div key={i} className="grid aspect-square place-items-center rounded-3xl bg-white/85 text-5xl sm:text-6xl">
            <AnimatePresence>{!(phase === 'ask' && i === cur.gone) && <motion.span exit={{ opacity: 0, scale: 0.4 }} aria-label={t(o.k)}>{o.e}</motion.span>}</AnimatePresence>
          </div>
        ))}
        {phase === 'cover' && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center rounded-[40px] bg-[#fff8ec] text-3xl font-bold">🧺 …</motion.div>}
      </div>
      {phase === 'look' && <Button big onClick={hide}>I'm ready</Button>}
      {phase === 'ask' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {opts.map((o) => { const it = nameOf(o); return (
            <Choice key={o} disabled={r.locked} state={picked === o ? (o === cur.gone ? 'right' : 'wrong') : r.locked && o === cur.gone ? 'right' : null} onClick={() => { setPicked(o); r.answer(o === cur.gone) }}>
              <span className="text-5xl">{it.e}</span><span className="text-lg">{t(it.k)}</span>
            </Choice>) })}
        </div>
      )}
    </div>
  )
}

/* ======================= Friendly faces (face–name association) ======================= */
const PEOPLE: { e: string; name: string; job: string }[] = [
  { e: '👩‍🍳', name: 'Rosa', job: 'bakes bread' }, { e: '👨‍🌾', name: 'Tom', job: 'grows vegetables' }, { e: '👮‍♀️', name: 'Priya', job: 'keeps the street safe' },
  { e: '👨‍⚕️', name: 'Dr Ahmed', job: 'is the family doctor' }, { e: '👵', name: 'Lakshmi', job: 'lives next door' }, { e: '👴', name: 'George', job: 'plays chess in the park' },
  { e: '👩‍🏫', name: 'Mrs Chen', job: 'teaches music' }, { e: '🧑‍🔧', name: 'Sam', job: 'fixes bicycles' }, { e: '👨‍🎨', name: 'Paulo', job: 'paints pictures' },
  { e: '💁‍♀️', name: 'Anita', job: 'runs the flower shop' }, { e: '🧔', name: 'Ravi', job: 'drives the bus' }, { e: '👩‍🦳', name: 'Margaret', job: 'knits scarves' },
]
export function FaceName(p: GameProps) {
  const { lang } = useSettings()
  const n = [3, 4, 5][p.level - 1]
  const people = useMemo(() => pick(PEOPLE, n), [n])
  const [meet, setMeet] = useState(0)
  const r = useRounds(n, p)
  const order = useMemo(() => shuffle(range(n)), [n])
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => setPicked(null), [r.round])
  const say = (i: number) => speak(`This is ${people[i].name}. ${people[i].name} ${people[i].job}.`, lang).catch(() => {})
  useEffect(() => { if (meet < n) void say(meet) }, [meet]) // eslint-disable-line react-hooks/exhaustive-deps

  if (meet < n) {
    const x = people[meet]
    return (
      <div className="mx-auto max-w-xl text-center">
        <Prompt sub={`Neighbour ${meet + 1} of ${n}`}>Meet your neighbour</Prompt>
        <motion.div key={meet} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="rounded-[40px] bg-white p-8 shadow-xl">
          <div className="text-9xl" aria-hidden>{x.e}</div>
          <p className="mt-3 text-4xl font-bold">{x.name}</p>
          <p className="text-2xl text-ink-soft">{x.name} {x.job}.</p>
        </motion.div>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => say(meet)}>🔊 Hear again</Button>
          <Button big onClick={() => setMeet(meet + 1)}>{meet + 1 < n ? 'Next neighbour' : "I've met them all"}</Button>
        </div>
      </div>
    )
  }
  const who = people[order[r.round]]
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={n} />
      <Prompt sub={p.level === 1 ? `Hint: this person ${who.job}.` : undefined}>What is this person's name?</Prompt>
      <div className="mb-5 text-9xl" aria-hidden>{who.e}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {people.map((x) => <Choice key={x.name} disabled={r.locked} state={picked === x.name ? (x === who ? 'right' : 'wrong') : r.locked && x === who ? 'right' : null} onClick={() => { setPicked(x.name); r.answer(x === who) }}>{x.name}</Choice>)}
      </div>
    </div>
  )
}

/* ======================= Find the ball (visual tracking) ======================= */
export function ShellGame(p: GameProps) {
  const total = 4
  const r = useRounds(total, p, 1400)
  const cups = [3, 3, 4][p.level - 1]
  const swaps = [3, 5, 7][p.level - 1]
  const speed = [900, 700, 550][p.level - 1]
  const [slots, setSlots] = useState(() => range(cups)) // slots[cup] = position
  const [ball, setBall] = useState(0)
  const [phase, setPhase] = useState<'show' | 'shuffle' | 'pick' | 'reveal'>('show')
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { setSlots(range(cups)); setBall(rnd(cups)); setPhase('show'); setPicked(null) }, [r.round, cups])

  const go = async () => {
    setPhase('shuffle')
    let s = range(cups)
    for (let k = 0; k < swaps; k++) {
      await new Promise((res) => setTimeout(res, speed))
      const a = rnd(cups); let b = rnd(cups); while (b === a) b = rnd(cups)
      s = s.map((pos) => (pos === a ? b : pos === b ? a : pos))
      setSlots(s)
    }
    await new Promise((res) => setTimeout(res, speed))
    setPhase('pick')
  }
  const choose = (cup: number) => { setPicked(cup); setPhase('reveal'); r.answer(cup === ball) }
  const w = 100 / cups
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt>{phase === 'show' ? 'The ball is under this cup. Keep your eyes on it!' : phase === 'shuffle' ? 'Watch closely…' : phase === 'pick' ? 'Which cup has the ball?' : ''}</Prompt>
      <div className="relative mx-auto h-56 max-w-xl" style={{ perspective: 800 }}>
        {range(cups).map((c) => {
          const up = phase === 'show' || (phase === 'reveal' && (c === picked || c === ball))
          return (
            <motion.button key={c} disabled={phase !== 'pick'} onClick={() => choose(c)} aria-label={`Cup ${slots[c] + 1}`}
              className="absolute bottom-4 flex flex-col items-center" style={{ width: `${w}%` }}
              animate={{ left: `${slots[c] * w}%` }} transition={{ duration: speed / 1000 * 0.8, ease: 'easeInOut' }}>
              <motion.div animate={{ y: up ? -70 : 0, rotateX: up ? 15 : 0 }} className="relative z-10 h-28 w-24 rounded-t-[40px] rounded-b-xl bg-gradient-to-b from-coral to-[#b91c1c] shadow-xl ring-4 ring-white/40" />
              <div className={`-mt-10 size-12 rounded-full ${c === ball ? 'bg-[radial-gradient(circle_at_30%_30%,#fde68a,#d97706)]' : ''}`} />
            </motion.button>
          )
        })}
      </div>
      {phase === 'show' && <Button big onClick={go}>Start moving the cups</Button>}
    </div>
  )
}

/* ======================= Spot the change (two scenes) ======================= */
const SCENE_POOL = ['🌳', '🏠', '🐕', '🌻', '🚗', '☀️', '🐦', '⛲', '🪑', '🚲', '🌷', '🐈', '🍎', '🏮', '🧺', '🦆']
const SWAPS: Record<string, string> = { '🌳': '🌲', '🏠': '🏡', '🐕': '🐩', '🌻': '🌼', '🚗': '🚙', '☀️': '🌤️', '🐦': '🐤', '⛲': '🗿', '🪑': '🛋️', '🚲': '🛵', '🌷': '🌹', '🐈': '🐈‍⬛', '🍎': '🍏', '🏮': '💡', '🧺': '🎁', '🦆': '🦢' }
export function SpotDifference(p: GameProps) {
  const total = 3
  const r = useRounds(total, p, 1500)
  const cells = [9, 12, 16][p.level - 1]
  const diffs = [2, 3, 4][p.level - 1]
  const rounds = useMemo(() => range(total).map(() => {
    const left = range(cells).map(() => SCENE_POOL[rnd(SCENE_POOL.length)])
    const changed = pick(range(cells), diffs)
    return { left, right: left.map((e, i) => (changed.includes(i) ? SWAPS[e] : e)), changed }
  }), [cells, diffs])
  const cur = rounds[r.round]
  const [found, setFound] = useState<number[]>([])
  const [misses, setMisses] = useState(0)
  useEffect(() => { setFound([]); setMisses(0) }, [r.round])
  const tap = (i: number) => {
    if (found.includes(i) || r.locked) return
    if (!cur.changed.includes(i)) { setMisses(misses + 1); p.cheer('retry'); if (misses + 1 >= 4) r.answer(false); return }
    const f = [...found, i]; setFound(f)
    if (f.length === diffs) r.answer(true)
  }
  const cols = cells === 9 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <div className="mx-auto max-w-4xl">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`${found.length} of ${diffs} found`}>Tap what is different in the right picture</Prompt>
      <div className="grid gap-4 sm:grid-cols-2">
        {[cur.left, cur.right].map((side, s) => (
          <div key={s} className={`grid ${cols} gap-2 rounded-[32px] p-3 shadow-inner ${s ? 'bg-[#dff5e3]' : 'bg-[#e6f0ff]'}`}>
            {side.map((e, i) => {
              const hit = found.includes(i) || (r.locked && cur.changed.includes(i))
              return s === 0
                ? <div key={i} className={`grid aspect-square place-items-center rounded-2xl text-4xl ${hit ? 'ring-4 ring-leaf' : ''}`} aria-hidden>{e}</div>
                : <button key={i} onClick={() => tap(i)} aria-label={`Picture ${i + 1}`} className={`grid aspect-square place-items-center rounded-2xl bg-white/50 text-4xl ${hit ? 'ring-4 ring-leaf' : ''}`}>{e}</button>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ======================= Odd one out ======================= */
const ODD: [string, string][] = [['🍎', '🍅'], ['🐶', '🐺'], ['🌕', '🍪'], ['⚽', '🏐'], ['🌲', '🎄'], ['😀', '😃'], ['🔵', '🟣'], ['🐟', '🐠'], ['🍋', '🍌'], ['🌸', '🌺'], ['🥄', '🍴'], ['🕐', '🕑'], ['☕', '🍵'], ['🐄', '🐂'], ['📕', '📙']]
export function OddOneOut(p: GameProps) {
  const total = 5
  const r = useRounds(total, p)
  const cells = [6, 9, 16][p.level - 1]
  const rounds = useMemo(() => pick(ODD.slice(p.level === 1 ? 0 : 3), total).map(([same, odd]) => ({ same, odd, at: rnd(cells) })), [cells, p.level])
  const cur = rounds[r.round]
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [r.round])
  return (
    <div className="mx-auto max-w-2xl">
      <RoundBar round={r.round} total={total} />
      <Prompt>Which one is different?</Prompt>
      <div className={`grid gap-3 ${cells === 6 ? 'grid-cols-3' : cells === 9 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {range(cells).map((i) => <Choice key={i} disabled={r.locked} state={picked === i ? (i === cur.at ? 'right' : 'wrong') : r.locked && i === cur.at ? 'right' : null} onClick={() => { setPicked(i); r.answer(i === cur.at) }} label={`Picture ${i + 1}`} className="aspect-square"><span className="text-5xl sm:text-6xl">{i === cur.at ? cur.odd : cur.same}</span></Choice>)}
      </div>
    </div>
  )
}

/* ======================= Catch the stars (go / no-go) ======================= */
const DISTRACT = ['🌙', '☁️', '🎈', '🍂', '🦋', '🌸']
export function CatchStars(p: GameProps) {
  const { motionOK } = useSettings()
  const count = [12, 16, 20][p.level - 1]
  const every = [1700, 1400, 1100][p.level - 1]
  const life = [4200, 3600, 3000][p.level - 1]
  const [items, setItems] = useState<{ id: number; e: string; star: boolean; y: number; born: number; done?: boolean }[]>([])
  const [started, setStarted] = useState(false)
  const stats = useRef({ hit: 0, falseTap: 0, stars: 0 })
  const spawned = useRef(0)
  useEffect(() => {
    if (!started) return
    const iv = setInterval(() => {
      if (spawned.current >= count) {
        clearInterval(iv)
        setTimeout(() => { const s = stats.current; p.finish(Math.max(0, s.hit - s.falseTap), Math.max(1, s.stars)) }, life + 200)
        return
      }
      const star = Math.random() < 0.5
      if (star) stats.current.stars++
      const id = spawned.current++
      setItems((xs) => [...xs.filter((x) => Date.now() - x.born < life + 500), { id, e: star ? '⭐' : DISTRACT[rnd(DISTRACT.length)], star, y: 10 + rnd(65), born: Date.now() }])
    }, every)
    return () => clearInterval(iv)
  }, [started]) // eslint-disable-line react-hooks/exhaustive-deps
  const tap = (id: number) => {
    setItems((xs) => xs.map((x) => {
      if (x.id !== id || x.done) return x
      if (x.star) { stats.current.hit++; p.cheer('good') } else { stats.current.falseTap++; p.cheer('retry') }
      return { ...x, done: true }
    }))
  }
  return (
    <div className="mx-auto max-w-4xl text-center">
      <Prompt sub="Let the moons, clouds and balloons float by.">Tap only the ⭐ stars</Prompt>
      {!started && <Button big onClick={() => setStarted(true)}>Start</Button>}
      <div className="relative mt-4 h-[420px] overflow-hidden rounded-[40px] bg-gradient-to-b from-[#1e3a8a] to-[#6d28d9] shadow-inner">
        {items.map((x) => (
          <motion.button key={x.id} onClick={() => tap(x.id)} aria-label={x.star ? 'Star' : 'Not a star'}
            initial={{ left: '-12%', opacity: 0 }} animate={x.done ? { scale: 1.6, opacity: 0 } : { left: '105%', opacity: 1 }}
            transition={x.done ? { duration: 0.4 } : { duration: motionOK ? life / 1000 : life / 1000, ease: 'linear' }}
            className="absolute grid size-24 place-items-center text-6xl" style={{ top: `${x.y}%` }}>{x.e}</motion.button>
        ))}
      </div>
    </div>
  )
}
