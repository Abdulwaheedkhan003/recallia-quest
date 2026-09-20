import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { speak } from '../../../lib/speech'
import { useSettings } from '../../../state/settings'
import { EVENT_SOUNDS, movingTone, playScene, playSeries, playSound, SOUNDS, wait, type SoundId } from '../audio'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, ListenButton, Prompt, range, RoundBar, rnd, useRounds, useStopAudioOnExit } from '../kit'

const Pic = ({ id, big }: { id: SoundId; big?: boolean }) => (
  <>
    <span className={big ? 'text-6xl' : 'text-5xl'} aria-hidden>{SOUNDS[id].e}</span>
    <span className="text-lg">{SOUNDS[id].name}</span>
  </>
)

/* ======================= Sound Focus — detect a target in a busy scene ======================= */
const FOCUS_TARGETS: SoundId[] = ['bell', 'doorbell', 'phone', 'dog', 'knock', 'kettle', 'cat']
const FILLERS: SoundId[] = ['footsteps', 'utensils', 'bird', 'clock', 'water', 'horn', 'clap', 'cough']
export function SoundFocus(p: GameProps) {
  useStopAudioOnExit()
  const total = [4, 5, 6][p.level - 1]
  const r = useRounds(total, p)
  const rounds = useMemo(() => range(total).map(() => ({ target: FOCUS_TARGETS[rnd(FOCUS_TARGETS.length)], present: Math.random() < 0.5 })), [total])
  const cur = rounds[r.round]
  const [phase, setPhase] = useState<'intro' | 'playing' | 'ask'>('intro')
  useEffect(() => setPhase('intro'), [r.round])

  const beds: SoundId[] = [['rain', 'traffic'], ['rain', 'traffic', 'tv'], ['rain', 'traffic', 'tv', 'wind']][p.level - 1] as SoundId[]
  const seconds = [8, 10, 12][p.level - 1]
  const run = async () => {
    setPhase('playing')
    const fillers = FILLERS.filter((f) => f !== cur.target)
    await playScene({
      beds, fillers: fillers.slice(0, 3 + p.level * 2), seconds,
      targets: cur.present ? [{ id: cur.target, at: 2 + Math.random() * (seconds - 5), vol: [0.85, 0.6, 0.45][p.level - 1] }] : [],
    })
    setPhase('ask')
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`A busy place: ${beds.map((b) => SOUNDS[b].name.toLowerCase()).join(', ')} and more.`}>
        Listen for the <span className="text-coral">{SOUNDS[cur.target].name.toLowerCase()}</span> {SOUNDS[cur.target].e}
      </Prompt>
      {phase === 'intro' && (
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant="secondary" big onClick={() => playSound(cur.target)}>{SOUNDS[cur.target].e} Hear the {SOUNDS[cur.target].name.toLowerCase()} first</Button>
          <Button big onClick={run}>▶ Start listening</Button>
        </div>
      )}
      {phase === 'playing' && <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="text-3xl font-bold">👂 Listening…</motion.p>}
      {phase === 'ask' && (
        <>
          <p className="mb-4 text-3xl font-bold">Did you hear the {SOUNDS[cur.target].name.toLowerCase()}?</p>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-4">
            <Choice disabled={r.locked} state={r.last !== null && cur.present ? 'right' : null} onClick={() => r.answer(cur.present)}><span className="text-5xl">👍</span>YES</Choice>
            <Choice disabled={r.locked} state={r.last !== null && !cur.present ? 'right' : null} onClick={() => r.answer(!cur.present)}><span className="text-5xl">👎</span>NO</Choice>
          </div>
          {r.last !== null && <p className="mt-4 text-xl">{cur.present ? 'It was there.' : 'It was not there this time.'}</p>}
        </>
      )}
    </div>
  )
}

/* ======================= Sound identification ======================= */
export function SoundId_(p: GameProps) {
  useStopAudioOnExit()
  const total = 5
  const r = useRounds(total, p)
  const n = [3, 4, 6][p.level - 1]
  const rounds = useMemo(() => pick(EVENT_SOUNDS, total).map((ans) => ({ ans, opts: shuffle([ans, ...pick(EVENT_SOUNDS.filter((x) => x !== ans), n - 1)]) })), [n])
  const cur = rounds[r.round]
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  const [picked, setPicked] = useState<SoundId | null>(null)
  useEffect(() => { setHeard(false); setPicked(null) }, [r.round])
  const listen = async () => { setPlaying(true); await playSound(cur.ans); setPlaying(false); setHeard(true) }
  return (
    <div className="mx-auto max-w-3xl">
      <RoundBar round={r.round} total={total} />
      <Prompt>What made this sound?</Prompt>
      <ListenButton onPlay={listen} playing={playing} />
      <div className={`grid gap-4 ${n <= 3 ? 'grid-cols-3' : n === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {cur.opts.map((o) => (
          <Choice key={o} disabled={!heard || r.locked} state={picked === o ? (o === cur.ans ? 'right' : 'wrong') : r.locked && o === cur.ans ? 'right' : null}
            onClick={() => { setPicked(o); r.answer(o === cur.ans) }}><Pic id={o} /></Choice>
        ))}
      </div>
    </div>
  )
}

/* ======================= Sound sequence ======================= */
export function SoundSequence(p: GameProps) {
  useStopAudioOnExit()
  const total = 3
  const r = useRounds(total, p, 1500)
  const len = p.level + 1
  const rounds = useMemo(() => range(total).map(() => { const seq = pick(EVENT_SOUNDS, len); return { seq, opts: shuffle([...seq, ...pick(EVENT_SOUNDS.filter((x) => !seq.includes(x)), 2)]) } }), [len])
  const cur = rounds[r.round]
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  const [lit, setLit] = useState(-1)
  const [got, setGot] = useState<SoundId[]>([])
  useEffect(() => { setHeard(false); setGot([]) }, [r.round])
  const listen = async () => { setPlaying(true); setGot([]); await playSeries(cur.seq, 0.5, setLit); setLit(-1); setPlaying(false); setHeard(true) }
  const tap = (s: SoundId) => {
    if (got.includes(s)) return
    const g = [...got, s]
    setGot(g)
    void playSound(s, { vol: 0.5 })
    if (s !== cur.seq[got.length]) return r.answer(false)
    if (g.length === len) r.answer(true)
  }
  return (
    <div className="mx-auto max-w-3xl">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`${len} sounds will play. Remember the order.`}>Tap the sounds in the order you heard them</Prompt>
      <div className="mb-3 flex justify-center gap-3" aria-hidden>
        {cur.seq.map((_, i) => <div key={i} className={`grid size-14 place-items-center rounded-2xl text-2xl font-bold ${lit === i ? 'bg-amber' : got[i] ? 'bg-leaf/30' : 'bg-white/70'}`}>{got[i] ? SOUNDS[got[i]].e : i + 1}</div>)}
      </div>
      <ListenButton onPlay={listen} playing={playing} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cur.opts.map((o) => <Choice key={o} disabled={!heard || r.locked || playing} state={got.includes(o) ? 'picked' : null} onClick={() => tap(o)}><Pic id={o} /></Choice>)}
      </div>
    </div>
  )
}

/* ======================= Sound counting ======================= */
export function SoundCount(p: GameProps) {
  useStopAudioOnExit()
  const total = 4
  const r = useRounds(total, p)
  const max = [3, 4, 5][p.level - 1]
  const rounds = useMemo(() => range(total).map(() => 1 + rnd(max)), [max])
  const n = rounds[r.round]
  const [phase, setPhase] = useState<'ready' | 'playing' | 'ask'>('ready')
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { setPhase('ready'); setPicked(null) }, [r.round])
  const run = async () => {
    setPhase('playing')
    const seconds = 4 + n * 2.4
    const slot = (seconds - 2) / n
    await playScene({
      beds: p.level > 1 ? ['rain', 'tv'] : ['rain'], fillers: p.level > 2 ? ['doorbell', 'utensils', 'bird', 'phone'] : ['utensils', 'bird', 'footsteps'],
      targets: range(n).map((i) => ({ id: 'bell' as SoundId, at: 1 + i * slot + Math.random() * (slot - 1.7), vol: 0.8 })), seconds,
    })
    setPhase('ask')
  }
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub="Other sounds will play too. Only count the bell 🔔.">How many times does the bell ring?</Prompt>
      {phase === 'ready' && <div className="flex flex-wrap justify-center gap-3"><Button variant="secondary" big onClick={() => playSound('bell')}>🔔 This is the bell</Button><Button big onClick={run}>▶ Start</Button></div>}
      {phase === 'playing' && <motion.p animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="text-3xl font-bold">👂 Counting…</motion.p>}
      {phase === 'ask' && (
        <div className="mx-auto grid max-w-lg grid-cols-3 gap-4 sm:grid-cols-6">
          {range(max + 1).map((k) => <Choice key={k} disabled={r.locked} state={picked === k ? (k === n ? 'right' : 'wrong') : r.locked && k === n ? 'right' : null} onClick={() => { setPicked(k); r.answer(k === n) }}><span className="text-4xl">{k}</span></Choice>)}
        </div>
      )}
    </div>
  )
}

/* ======================= Sound direction ======================= */
export function SoundDirection(p: GameProps) {
  useStopAudioOnExit()
  const total = 6
  const r = useRounds(total, p)
  const sides = p.level === 1 ? [-1, 1] : [-1, 0, 1]
  const rounds = useMemo(() => range(total).map(() => ({ side: sides[rnd(sides.length)], id: EVENT_SOUNDS[rnd(EVENT_SOUNDS.length)] })), [p.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rounds[r.round]
  const [playing, setPlaying] = useState(false)
  const [heard, setHeard] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => { setHeard(false); setPicked(null) }, [r.round])
  const vol = [1, 0.8, 0.6][p.level - 1]
  const listen = async () => { setPlaying(true); await playSound(cur.id, { pan: cur.side * (p.level === 3 ? 0.7 : 1), vol }); setPlaying(false); setHeard(true) }
  const label = (s: number) => (s < 0 ? '⬅️ Left' : s > 0 ? 'Right ➡️' : '⬆️ Middle')
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub="🎧 Headphones work best.">Where is the {SOUNDS[cur.id].name.toLowerCase()} coming from?</Prompt>
      <ListenButton onPlay={listen} playing={playing} />
      <div className={`grid gap-4 ${sides.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {sides.map((s) => <Choice key={s} disabled={!heard || r.locked} state={picked === s ? (s === cur.side ? 'right' : 'wrong') : r.locked && s === cur.side ? 'right' : null} onClick={() => { setPicked(s); r.answer(s === cur.side) }}><span className="text-3xl">{label(s)}</span></Choice>)}
      </div>
    </div>
  )
}

/* ======================= Same or different ======================= */
const LOOKALIKE: [SoundId, SoundId][] = [['bell', 'doorbell'], ['knock', 'footsteps'], ['clap', 'drum'], ['dog', 'cat'], ['phone', 'kettle'], ['utensils', 'bell'], ['cough', 'clap']]
export function SoundMatch(p: GameProps) {
  useStopAudioOnExit()
  const total = 6
  const r = useRounds(total, p)
  const rounds = useMemo(() => range(total).map(() => {
    const same = Math.random() < 0.5
    if (p.level >= 2 && !same) { const pair = LOOKALIKE[rnd(LOOKALIKE.length)]; return { a: pair[0], b: pair[1], same } }
    const a = EVENT_SOUNDS[rnd(EVENT_SOUNDS.length)]
    return { a, b: same ? a : pick(EVENT_SOUNDS.filter((x) => x !== a), 1)[0], same }
  }), [p.level])
  const cur = rounds[r.round]
  const [playing, setPlaying] = useState<0 | 1 | 2>(0)
  const [heard, setHeard] = useState(false)
  useEffect(() => setHeard(false), [r.round])
  const listen = async () => {
    setPlaying(1); await playSound(cur.a, { pan: -0.3 }); await wait(p.level === 3 ? 1500 : 500)
    setPlaying(2); await playSound(cur.b, { pan: 0.3 }); setPlaying(0); setHeard(true)
  }
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt>Are these two sounds the same?</Prompt>
      <div className="mb-2 flex justify-center gap-6" aria-hidden>
        {[1, 2].map((k) => <motion.div key={k} animate={{ scale: playing === k ? 1.2 : 1 }} className={`grid size-24 place-items-center rounded-full text-4xl font-bold ${playing === k ? 'bg-amber' : 'bg-white'}`}>{k === 1 ? 'A' : 'B'}</motion.div>)}
      </div>
      <ListenButton onPlay={listen} playing={playing !== 0} />
      <div className="mx-auto grid max-w-md grid-cols-2 gap-4">
        <Choice disabled={!heard || r.locked} state={r.locked && cur.same ? 'right' : null} onClick={() => r.answer(cur.same)}><span className="text-5xl">🟰</span>Same</Choice>
        <Choice disabled={!heard || r.locked} state={r.locked && !cur.same ? 'right' : null} onClick={() => r.answer(!cur.same)}><span className="text-5xl">≠</span>Different</Choice>
      </div>
      {r.locked && <p className="mt-3 text-xl">{SOUNDS[cur.a].e} {SOUNDS[cur.a].name} · {SOUNDS[cur.b].e} {SOUNDS[cur.b].name}</p>}
    </div>
  )
}

/* ======================= Change detection ======================= */
export function SoundChange(p: GameProps) {
  useStopAudioOnExit()
  const total = 4
  const r = useRounds(total, p)
  const size = p.level + 1
  const rounds = useMemo(() => range(total).map(() => {
    const first = pick(EVENT_SOUNDS, size + 1)
    const before = first.slice(0, size)
    const swap = rnd(size)
    const after = before.map((s, i) => (i === swap ? first[size] : s))
    return { before, after, fresh: first[size] }
  }), [size])
  const cur = rounds[r.round]
  const [phase, setPhase] = useState<'ready' | 'one' | 'mid' | 'two' | 'ask'>('ready')
  const [picked, setPicked] = useState<SoundId | null>(null)
  useEffect(() => { setPhase('ready'); setPicked(null) }, [r.round])
  const layer = (ids: SoundId[]) => Promise.all(ids.map((id, i) => playSound(id, { pan: -0.8 + (1.6 * i) / Math.max(1, ids.length - 1), vol: 0.6, delay: i * 0.35 })))
  const run = async () => { setPhase('one'); await layer(cur.before); setPhase('mid'); await wait(1500); setPhase('two'); await layer(cur.after); setPhase('ask') }
  const opts = useMemo(() => shuffle(cur.after), [cur])
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`You will hear the room twice. One of the ${size} sounds changes.`}>Which sound is new the second time?</Prompt>
      {phase === 'ready' && <Button big onClick={run}>▶ Play the room</Button>}
      {(phase === 'one' || phase === 'two') && <p className="text-3xl font-bold">{phase === 'one' ? '1️⃣ First time…' : '2️⃣ Second time…'}</p>}
      {phase === 'mid' && <p className="text-3xl font-bold">Now listen again…</p>}
      {phase === 'ask' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {opts.map((o) => <Choice key={o} disabled={r.locked} state={picked === o ? (o === cur.fresh ? 'right' : 'wrong') : r.locked && o === cur.fresh ? 'right' : null} onClick={() => { setPicked(o); r.answer(o === cur.fresh) }}><Pic id={o} /></Choice>)}
        </div>
      )}
    </div>
  )
}

/* ======================= Follow the moving sound ======================= */
export function FollowSound(p: GameProps) {
  useStopAudioOnExit()
  const sides = p.level === 1 ? [-1, 1] : [-1, 0, 1]
  const segs = 8
  const ms = [3200, 2600, 2000][p.level - 1]
  const [running, setRunning] = useState(false)
  const [seg, setSeg] = useState(0)
  const [hits, setHits] = useState(0)
  const pos = useRef(0)
  const tapped = useRef<number | null>(null)
  const toneRef = useRef<ReturnType<typeof movingTone> | null>(null)
  useEffect(() => () => toneRef.current?.stop(), [])

  const start = () => {
    setRunning(true)
    const tone = movingTone(p.level === 3 ? 600 : 480)
    toneRef.current = tone
    let i = 0, score = 0
    const next = () => {
      if (i > 0 && tapped.current === pos.current) score++
      setHits(score)
      if (i >= segs) { tone.stop(); setRunning(false); p.finish(score, segs); return }
      let n = sides[rnd(sides.length)]
      while (n === pos.current && i > 0) n = sides[rnd(sides.length)]
      pos.current = n
      tapped.current = null
      tone.pan(n)
      setSeg(i + 1)
      i++
      setTimeout(next, ms)
    }
    next()
  }
  const tap = (s: number) => {
    tapped.current = s
    if (s === pos.current) p.cheer('good')
  }
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Prompt sub="🎧 Headphones help. The hum moves every few seconds.">Tap the side where you hear the hum now</Prompt>
      {!running ? <Button big onClick={start}>▶ Start the hum</Button> : <p className="mb-4 text-xl font-bold">Move {seg} of {segs} · {hits} followed</p>}
      <div className={`mt-6 grid gap-4 ${sides.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {sides.map((s) => <Choice key={s} disabled={!running} onClick={() => tap(s)} className="min-h-40"><span className="text-5xl">{s < 0 ? '⬅️' : s > 0 ? '➡️' : '⬆️'}</span>{s < 0 ? 'Left' : s > 0 ? 'Right' : 'Middle'}</Choice>)}
      </div>
    </div>
  )
}

/* ======================= Sound pairs (memory) ======================= */
export function SoundMemory({ level, finish, cheer }: GameProps) {
  useStopAudioOnExit()
  const pairs = [3, 4, 6][level - 1]
  const cards = useMemo(() => shuffle(pick(EVENT_SOUNDS, pairs).flatMap((s) => [s, s])), [pairs])
  const [open, setOpen] = useState<number[]>([])
  const [found, setFound] = useState<Set<SoundId>>(new Set())
  const [tries, setTries] = useState(0)
  const lock = useRef(false)
  const flip = async (i: number) => {
    if (lock.current || open.includes(i) || found.has(cards[i])) return
    const next = [...open, i]
    setOpen(next)
    lock.current = true
    await playSound(cards[i], { vol: 0.8 })
    lock.current = false
    if (next.length < 2) return
    setTries((t) => t + 1)
    if (cards[next[0]] === cards[next[1]]) {
      const f = new Set(found).add(cards[i])
      setFound(f); setOpen([]); cheer('good')
      if (f.size === pairs) finish(Math.max(1, Math.min(pairs * 2, pairs * 3 - (tries + 1))), pairs * 2)
    } else { setTimeout(() => setOpen([]), 400) }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Prompt sub={`${found.size} of ${pairs} pairs found`}>Open two boxes. Do the sounds match?</Prompt>
      <div className={`grid gap-4 ${pairs === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {cards.map((c, i) => {
          const done = found.has(c), isOpen = open.includes(i)
          return (
            <motion.button key={i} whileTap={{ scale: 0.95 }} onClick={() => flip(i)} aria-label={done ? SOUNDS[c].name : `Sound box ${i + 1}`}
              className={`grid aspect-square place-items-center rounded-[28px] text-5xl shadow-lg ${done ? 'bg-leaf/30 ring-4 ring-leaf' : isOpen ? 'bg-amber' : 'bg-gradient-to-br from-coral to-amber'}`}>
              {done ? SOUNDS[c].e : isOpen ? '🔊' : <span className="text-white/80">♪</span>}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

/* ======================= Sound story ======================= */
const STORIES: { title: string; steps: { text: string; s: SoundId }[]; qs: { q: string; a: SoundId }[] }[] = [
  {
    title: "Mary's Morning",
    steps: [
      { text: 'Mary woke up early. Outside her window, a bird was singing.', s: 'bird' },
      { text: 'She went to the kitchen and put the kettle on.', s: 'kettle' },
      { text: 'While she waited, the telephone rang. It was her daughter.', s: 'phone' },
      { text: 'After the call, she heard a knock at the door. The postman had a parcel!', s: 'knock' },
      { text: 'Mary laughed, and the dog next door started barking.', s: 'dog' },
    ],
    qs: [{ q: 'What did Mary hear when she woke up?', a: 'bird' }, { q: 'Who called Mary on the telephone?', a: 'phone' }, { q: 'What sound did the postman make?', a: 'knock' }, { q: 'What did she put on in the kitchen?', a: 'kettle' }],
  },
  {
    title: 'A Rainy Afternoon',
    steps: [
      { text: 'It was a grey afternoon, and the rain began to fall.', s: 'rain' },
      { text: 'Grandpa Ravi sat by the old clock, listening to it tick.', s: 'clock' },
      { text: 'Footsteps came down the hall. His grandson was home from school.', s: 'footsteps' },
      { text: 'They laid the table together for tea.', s: 'utensils' },
      { text: 'Then the doorbell rang — Grandma was back with warm samosas!', s: 'doorbell' },
    ],
    qs: [{ q: 'What was the weather like?', a: 'rain' }, { q: 'What was Grandpa listening to?', a: 'clock' }, { q: 'How did Grandma let them know she was home?', a: 'doorbell' }, { q: 'What did they do before tea?', a: 'utensils' }],
  },
  {
    title: 'The Village Fair',
    steps: [
      { text: 'Everyone walked to the fair. Cars honked on the busy road.', s: 'horn' },
      { text: 'At the fair, a big drum was playing.', s: 'drum' },
      { text: 'The crowd clapped for the dancers.', s: 'clap' },
      { text: 'Near the temple, a bell was ringing.', s: 'bell' },
      { text: 'On the way home, a little cat followed them, meowing.', s: 'cat' },
      { text: 'The wind blew softly as they reached home.', s: 'wind' },
    ],
    qs: [{ q: 'What was playing at the fair?', a: 'drum' }, { q: 'What did the crowd do for the dancers?', a: 'clap' }, { q: 'Who followed them home?', a: 'cat' }, { q: 'What did they hear near the temple?', a: 'bell' }],
  },
]
export function SoundStory(p: GameProps) {
  useStopAudioOnExit()
  const { lang } = useSettings()
  const story = useMemo(() => STORIES[(p.level - 1 + rnd(2)) % STORIES.length], [p.level])
  const steps = story.steps.slice(0, p.level === 1 ? 4 : story.steps.length)
  const qs = story.qs.filter((q) => steps.some((s) => s.s === q.a)).slice(0, 3)
  const [step, setStep] = useState(-1)
  const [asking, setAsking] = useState(false)
  const r = useRounds(qs.length, p)
  const [picked, setPicked] = useState<SoundId | null>(null)
  useEffect(() => setPicked(null), [r.round])

  const tell = async () => {
    for (let i = 0; i < steps.length; i++) {
      setStep(i)
      await speak(steps[i].text, lang).catch(() => wait(2600))
      await playSound(steps[i].s)
      await wait(400)
    }
    setAsking(true)
  }
  if (!asking) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <Prompt sub="Listen to the story. The sounds are part of it.">{story.title}</Prompt>
        {step < 0 ? <Button big onClick={tell}>▶ Tell me the story</Button> : (
          <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[32px] bg-white p-6 shadow-lg">
            <div className="text-6xl" aria-hidden>{SOUNDS[steps[step].s].e}</div>
            <p className="mt-3 text-2xl leading-relaxed">{steps[step].text}</p>
            <p className="mt-3 text-lg text-ink-soft">Part {step + 1} of {steps.length}</p>
          </motion.div>
        )}
      </div>
    )
  }
  const q = qs[r.round]
  const opts = shuffle(steps.map((s) => s.s)).slice(0, 4)
  if (!opts.includes(q.a)) opts[0] = q.a
  return (
    <div className="mx-auto max-w-3xl">
      <RoundBar round={r.round} total={qs.length} label="Question" />
      <Prompt>{q.q}</Prompt>
      <QOpts key={r.round} opts={opts} ans={q.a} picked={picked} setPicked={setPicked} r={r} />
    </div>
  )
}
function QOpts({ opts, ans, picked, setPicked, r }: { opts: SoundId[]; ans: SoundId; picked: SoundId | null; setPicked: (s: SoundId) => void; r: ReturnType<typeof useRounds> }) {
  const [o] = useState(() => shuffle(opts))
  return (
    <div className="grid grid-cols-2 gap-4">
      {o.map((s) => (
        <Choice key={s} disabled={r.locked} state={picked === s ? (s === ans ? 'right' : 'wrong') : r.locked && s === ans ? 'right' : null}
          onClick={() => { setPicked(s); void playSound(s, { vol: 0.5 }); r.answer(s === ans) }}><Pic id={s} /></Choice>
      ))}
    </div>
  )
}
