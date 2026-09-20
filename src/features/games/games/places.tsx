import { motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '../../../components/ui'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, Prompt, range, RoundBar, rnd, useRounds } from '../kit'

/* ---------- Famous landmarks, drawn as simple silhouettes ---------- */
const INK = '#2b2350'
const LANDMARKS: { id: string; name: string; where: string; svg: ReactNode }[] = [
  { id: 'eiffel', name: 'Eiffel Tower', where: 'Paris, France', svg: <><path d="M50 6 L56 40 L64 70 L78 94 H62 L56 78 H44 L38 94 H22 L36 70 L44 40 Z" fill={INK} /><rect x="38" y="66" width="24" height="5" fill="#fff" opacity=".5" /></> },
  { id: 'taj', name: 'Taj Mahal', where: 'Agra, India', svg: <><ellipse cx="50" cy="44" rx="18" ry="20" fill={INK} /><path d="M50 16 v8" stroke={INK} strokeWidth="3" /><rect x="26" y="52" width="48" height="36" fill={INK} /><path d="M44 88 v-18 a6 6 0 0 1 12 0 v18z" fill="#fff" opacity=".6" /><rect x="10" y="30" width="5" height="58" fill={INK} /><rect x="85" y="30" width="5" height="58" fill={INK} /></> },
  { id: 'bigben', name: 'Big Ben', where: 'London, England', svg: <><path d="M50 4 L58 24 H42 Z" fill={INK} /><rect x="40" y="24" width="20" height="70" fill={INK} /><circle cx="50" cy="36" r="7" fill="#fff" /><path d="M50 36 v-5 M50 36 h4" stroke={INK} strokeWidth="1.5" /></> },
  { id: 'pyramids', name: 'Pyramids of Giza', where: 'Egypt', svg: <><path d="M8 92 L38 40 L68 92 Z" fill={INK} /><path d="M52 92 L72 58 L92 92 Z" fill={INK} opacity=".75" /><circle cx="80" cy="20" r="8" fill="#f59e0b" /></> },
  { id: 'liberty', name: 'Statue of Liberty', where: 'New York, USA', svg: <><path d="M60 6 l4 14 h-6z" fill="#f59e0b" /><rect x="58" y="18" width="4" height="22" fill={INK} /><circle cx="50" cy="34" r="7" fill={INK} /><path d="M42 30 l-4 -6 M50 26 v-7 M58 30 l4 -6" stroke={INK} strokeWidth="2" /><path d="M40 42 H60 L64 76 H36 Z" fill={INK} /><rect x="30" y="76" width="40" height="18" fill={INK} opacity=".8" /></> },
  { id: 'opera', name: 'Sydney Opera House', where: 'Sydney, Australia', svg: <><path d="M10 80 Q24 30 40 80 Z M30 80 Q48 20 64 80 Z M54 80 Q70 36 88 80 Z" fill={INK} /><rect x="6" y="80" width="88" height="10" fill={INK} opacity=".7" /><path d="M0 94 h100" stroke="#3b82f6" strokeWidth="6" /></> },
  { id: 'pisa', name: 'Leaning Tower of Pisa', where: 'Pisa, Italy', svg: <g transform="rotate(8 50 94)">{range(7).map((i) => <rect key={i} x="36" y={16 + i * 11} width="28" height="9" rx="2" fill={INK} />)}<rect x="40" y="8" width="20" height="8" fill={INK} /></g> },
  { id: 'wall', name: 'Great Wall of China', where: 'China', svg: <><path d="M0 80 Q25 50 50 62 T100 40 V56 Q75 70 50 76 T0 94 Z" fill={INK} />{range(5).map((i) => <rect key={i} x={8 + i * 20} y={62 - i * 5} width="8" height="12" fill={INK} />)}</> },
  { id: 'colosseum', name: 'Colosseum', where: 'Rome, Italy', svg: <><path d="M8 88 V36 Q50 16 92 30 V88 Z" fill={INK} />{range(3).map((row) => range(6).map((c) => <rect key={`${row}${c}`} x={14 + c * 13} y={40 + row * 16} width="7" height="10" rx="3.5" fill="#fff" opacity=".6" />))}</> },
  { id: 'fuji', name: 'Mount Fuji', where: 'Japan', svg: <><path d="M4 92 L40 30 H60 L96 92 Z" fill={INK} /><path d="M40 30 H60 L68 44 L58 40 L50 46 L42 40 L32 44 Z" fill="#fff" /><circle cx="80" cy="18" r="8" fill="#ef4444" /></> },
  { id: 'windmill', name: 'Dutch Windmill', where: 'The Netherlands', svg: <><path d="M40 94 L44 44 H56 L60 94 Z" fill={INK} /><path d="M50 44 L30 12 M50 44 L82 26 M50 44 L70 76 M50 44 L18 62" stroke={INK} strokeWidth="6" /></> },
  { id: 'golden', name: 'Golden Gate Bridge', where: 'San Francisco, USA', svg: <><rect x="22" y="20" width="6" height="66" fill="#dc2626" /><rect x="72" y="20" width="6" height="66" fill="#dc2626" /><path d="M0 28 Q25 70 25 22 Q50 72 75 22 Q75 70 100 28" stroke="#dc2626" strokeWidth="2.5" fill="none" /><rect x="0" y="62" width="100" height="5" fill="#dc2626" /><path d="M0 92 h100" stroke="#3b82f6" strokeWidth="8" /></> },
]
const Mark = ({ id, size = 96 }: { id: string; size?: number }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>{LANDMARKS.find((l) => l.id === id)!.svg}</svg>
)

/* ---------- Everyday town places ---------- */
const PLACES: { e: string; name: string; clue: string }[] = [
  { e: '🏥', name: 'Hospital', clue: 'You feel very unwell and need a doctor right away.' },
  { e: '🏤', name: 'Post office', clue: 'You want to send a letter and buy stamps.' },
  { e: '🏫', name: 'School', clue: 'Children go here to learn to read and write.' },
  { e: '🏦', name: 'Bank', clue: 'You want to take out some money from your account.' },
  { e: '🛕', name: 'Temple', clue: 'You go here to pray and ring the bell.' },
  { e: '⛪', name: 'Church', clue: 'People go here on Sunday to sing hymns.' },
  { e: '🏪', name: 'Corner shop', clue: 'You need milk and bread quickly.' },
  { e: '🚉', name: 'Railway station', clue: 'You are catching a train to visit family.' },
  { e: '🏞️', name: 'Park', clue: 'You want to sit on a bench and feed the ducks.' },
  { e: '🥖', name: 'Bakery', clue: 'It smells of fresh bread and cakes.' },
  { e: '💈', name: 'Barber', clue: 'Your hair is getting long and needs a trim.' },
  { e: '📚', name: 'Library', clue: 'You want to borrow a book for free.' },
  { e: '🎬', name: 'Cinema', clue: 'You want to watch a film on a big screen.' },
  { e: '💊', name: 'Pharmacy', clue: 'You need to collect your medicine.' },
  { e: '🌾', name: 'Market', clue: 'Many stalls sell fruit, vegetables and flowers.' },
  { e: '☕', name: 'Tea shop', clue: 'You meet a friend for a hot cup of chai.' },
]

/* ======================= Landmark match (pairs by tapping) ======================= */
export function LandmarkMatch(p: GameProps) {
  const n = [3, 4, 6][p.level - 1]
  const set = useMemo(() => pick(LANDMARKS, n), [n])
  const names = useMemo(() => shuffle(set), [set])
  const [sel, setSel] = useState<string | null>(null)
  const [done, setDone] = useState<string[]>([])
  const [miss, setMiss] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)
  const pickName = (id: string) => {
    if (!sel || done.includes(id)) return
    if (id === sel) {
      const d = [...done, id]; setDone(d); setSel(null); p.cheer('good')
      if (d.length === n) setTimeout(() => p.finish(Math.max(1, n * 2 - miss), n * 2), 700)
    } else { setMiss(miss + 1); setWrong(id); p.cheer('retry'); setTimeout(() => setWrong(null), 700) }
  }
  return (
    <div className="mx-auto max-w-4xl">
      <Prompt sub="Tap a picture, then tap its name.">Match each famous place to its name</Prompt>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {set.map((l) => (
            <Choice key={l.id} disabled={done.includes(l.id)} state={done.includes(l.id) ? 'right' : sel === l.id ? 'picked' : null} onClick={() => setSel(l.id)} label={done.includes(l.id) ? l.name : 'Landmark picture'} className="bg-[#e6f0ff]">
              <Mark id={l.id} />
            </Choice>
          ))}
        </div>
        <div className="grid content-start gap-3">
          {names.map((l) => (
            <Choice key={l.id} disabled={done.includes(l.id) || !sel} state={done.includes(l.id) ? 'right' : wrong === l.id ? 'wrong' : null} onClick={() => pickName(l.id)} className="min-h-16">
              <span className="text-xl">{l.name}</span><span className="text-base font-normal text-ink-soft">{l.where}</span>
            </Choice>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ======================= Town map shared ======================= */
function Town({ cols, cells, onCell, children, highlight }: { cols: number; cells: (ReactNode | null)[]; onCell?: (i: number) => void; children?: ReactNode; highlight?: number[] }) {
  return (
    <div className="relative mx-auto max-w-xl rounded-[36px] bg-[#cfe9c2] p-3 shadow-inner">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {cells.map((c, i) => (
          <button key={i} type="button" onClick={() => onCell?.(i)} disabled={!onCell} aria-label={`Map square ${i + 1}`}
            className={`grid aspect-square place-items-center rounded-2xl text-4xl sm:text-5xl ${highlight?.includes(i) ? 'bg-amber/60 ring-4 ring-amber' : 'bg-[#f3efe6]'} ${onCell ? 'hover:ring-4 hover:ring-lavender' : ''}`}>
            {c}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}

/* ======================= Landmark memory (where was it?) ======================= */
export function LandmarkMemory(p: GameProps) {
  const cols = 4
  const n = [3, 4, 6][p.level - 1]
  const set = useMemo(() => pick(PLACES, n), [n])
  const spots = useMemo(() => pick(range(cols * cols), n), [n])
  const [phase, setPhase] = useState<'look' | 'ask'>('look')
  const order = useMemo(() => shuffle(range(n)), [n])
  const r = useRounds(n, p, 1200)
  const [tapped, setTapped] = useState<number | null>(null)
  useEffect(() => setTapped(null), [r.round])
  const target = order[r.round]
  const cells = range(cols * cols).map((i) => {
    const k = spots.indexOf(i)
    if (k < 0) return null
    if (phase === 'look') return <span aria-label={set[k].name}>{set[k].e}</span>
    if (r.locked && k === target) return set[k].e
    return null
  })
  return (
    <div className="mx-auto max-w-2xl text-center">
      {phase === 'ask' && <RoundBar round={r.round} total={n} />}
      <Prompt sub={phase === 'look' ? set.map((s) => `${s.e} ${s.name}`).join(' · ') : undefined}>
        {phase === 'look' ? 'Remember where each place is on the map' : <>Where was the <b>{set[target].name}</b> {set[target].e}?</>}
      </Prompt>
      <Town cols={cols} cells={cells} highlight={tapped !== null ? [tapped] : []} onCell={phase === 'ask' && !r.locked ? (i) => { setTapped(i); r.answer(i === spots[target]) } : undefined} />
      {phase === 'look' && <Button big className="mt-5" onClick={() => setPhase('ask')}>I remember — hide them</Button>}
    </div>
  )
}

/* ======================= Place the landmark (build the street from clues) ======================= */
export function PlaceLandmark(p: GameProps) {
  const n = [3, 4, 5][p.level - 1]
  const [answer] = useState(() => pick(PLACES, n))
  const clues = useMemo(() => {
    const c = [`The ${answer[0].name} ${answer[0].e} is first, on the far left.`]
    for (let i = 1; i < n; i++) c.push(`The ${answer[i].name} ${answer[i].e} is just to the right of the ${answer[i - 1].name}.`)
    return p.level === 3 ? shuffle(c) : c
  }, [answer, n, p.level])
  const [street, setStreet] = useState<(number | null)[]>(() => Array(n).fill(null))
  const [held, setHeld] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [trayOrder] = useState(() => shuffle(range(n)))
  const put = (slot: number) => {
    if (checked) return
    const s = [...street]
    if (held === null) { if (s[slot] !== null) { setHeld(s[slot]); s[slot] = null; setStreet(s) } return }
    const prev = s.indexOf(held); if (prev >= 0) s[prev] = null
    s[slot] = held; setStreet(s); setHeld(null)
  }
  const check = () => {
    setChecked(true)
    const right = street.filter((x, i) => x === i).length
    p.cheer(right === n ? 'good' : 'retry')
    setTimeout(() => p.finish(right, n), 1600)
  }
  return (
    <div className="mx-auto max-w-4xl">
      <Prompt sub="Tap a building, then tap a spot on the street.">Build the street from the clues</Prompt>
      <ol className="mb-4 space-y-1 rounded-[28px] bg-white p-4 text-xl shadow">{clues.map((c) => <li key={c}>📜 {c}</li>)}</ol>
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        {trayOrder.filter((k) => !street.includes(k)).map((k) => (
          <Choice key={k} state={held === k ? 'picked' : null} onClick={() => setHeld(k)} className="min-h-20 w-36"><span className="text-4xl">{answer[k].e}</span><span className="text-base">{answer[k].name}</span></Choice>
        ))}
      </div>
      <div className="rounded-[28px] bg-[#9ca3af] p-3">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {street.map((k, i) => (
            <button key={i} onClick={() => put(i)} aria-label={k === null ? `Empty spot ${i + 1}` : `${answer[k].name}, spot ${i + 1}`}
              className={`flex min-h-32 flex-col items-center justify-center rounded-2xl text-center ${k === null ? 'border-4 border-dashed border-white/70 bg-white/20' : checked ? (k === i ? 'bg-leaf/40 ring-4 ring-leaf' : 'bg-coral/40 ring-4 ring-coral') : 'bg-white'}`}>
              {k !== null ? <><span className="text-5xl">{answer[k].e}</span><span className="text-sm font-bold">{answer[k].name}</span></> : <span className="text-white">{i + 1}</span>}
            </button>
          ))}
        </div>
        <div className="mt-2 h-3 rounded-full bg-[repeating-linear-gradient(90deg,#fff_0_30px,transparent_30px_60px)]" aria-hidden />
      </div>
      <div className="mt-5 flex justify-center"><Button big disabled={street.includes(null) || checked} onClick={check}>✓ Check my street</Button></div>
    </div>
  )
}

/* ======================= Where is this? (clue → place) ======================= */
export function WhereIsThis(p: GameProps) {
  const total = 5
  const r = useRounds(total, p)
  const n = [3, 4, 6][p.level - 1]
  const rounds = useMemo(() => pick(PLACES, total).map((ans) => ({ ans, opts: shuffle([ans, ...pick(PLACES.filter((x) => x !== ans), n - 1)]) })), [n])
  const cur = rounds[r.round]
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => setPicked(null), [r.round])
  return (
    <div className="mx-auto max-w-3xl">
      <RoundBar round={r.round} total={total} />
      <div className="mb-5 rounded-[32px] bg-white p-6 text-center text-3xl font-bold shadow-lg">“{cur.ans.clue}”</div>
      <Prompt>Where would you go?</Prompt>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {cur.opts.map((o) => <Choice key={o.name} disabled={r.locked} state={picked === o.name ? (o === cur.ans ? 'right' : 'wrong') : r.locked && o === cur.ans ? 'right' : null} onClick={() => { setPicked(o.name); r.answer(o === cur.ans) }}><span className="text-5xl">{o.e}</span><span className="text-xl">{o.name}</span></Choice>)}
      </div>
    </div>
  )
}

/* ======================= Travel route (navigate a street grid) ======================= */
const G = 7 // 7×7: roads on even rows/cols, buildings on odd×odd
const isRoad = (x: number, y: number) => x % 2 === 0 || y % 2 === 0
function bfs(from: [number, number], to: [number, number]) {
  const key = (x: number, y: number) => y * G + x
  const dist = new Map([[key(...from), 0]])
  const q = [from]
  while (q.length) {
    const [x, y] = q.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= G || ny >= G || !isRoad(nx, ny) || dist.has(key(nx, ny))) continue
      dist.set(key(nx, ny), dist.get(key(x, y))! + 1)
      q.push([nx, ny])
    }
  }
  return dist.get(key(...to)) ?? 99
}
export function TravelRoute(p: GameProps) {
  const total = 3
  const [round, setRound] = useState(0)
  const [points, setPoints] = useState(0)
  const make = () => {
    const blocks = range(G * G).filter((i) => !isRoad(i % G, Math.floor(i / G)))
    const places = pick(PLACES, blocks.length)
    const target = rnd(blocks.length)
    const tb = blocks[target]
    // the door of the target building: the road square just below it
    const door: [number, number] = [tb % G, Math.floor(tb / G) + 1]
    const minSteps = bfs([0, 0], door)
    return { blocks, places, target, door, minSteps }
  }
  const [map, setMap] = useState(make)
  const [pos, setPos] = useState<[number, number]>([0, 0])
  const [steps, setSteps] = useState(0)
  const [trail, setTrail] = useState<number[]>([0])
  const [arrived, setArrived] = useState(false)
  const move = (dx: number, dy: number) => {
    if (arrived) return
    const nx = pos[0] + dx, ny = pos[1] + dy
    if (nx < 0 || ny < 0 || nx >= G || ny >= G || !isRoad(nx, ny)) { p.cheer('retry'); return }
    setPos([nx, ny]); setSteps(steps + 1); setTrail([...trail, ny * G + nx])
    if (nx === map.door[0] && ny === map.door[1]) {
      setArrived(true)
      const eff = steps + 1 <= map.minSteps + (p.level === 1 ? 4 : 2) ? 2 : 1
      p.cheer('good')
      const total2 = points + eff
      setPoints(total2)
      setTimeout(() => {
        if (round + 1 >= total) p.finish(total2, total * 2)
        else { setRound(round + 1); setMap(make()); setPos([0, 0]); setSteps(0); setTrail([0]); setArrived(false) }
      }, 1300)
    }
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const d = ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<string, number[]>)[e.key]; if (d) { e.preventDefault(); move(d[0], d[1]) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  const tb = map.blocks[map.target]
  const tapCell = (i: number) => {
    const x = i % G, y = Math.floor(i / G)
    if (Math.abs(x - pos[0]) + Math.abs(y - pos[1]) === 1) move(x - pos[0], y - pos[1])
  }
  const target = map.places[map.target]
  return (
    <div className="mx-auto max-w-4xl">
      <RoundBar round={round} total={total} label="Trip" />
      <Prompt sub={`Shortest way: ${map.minSteps} steps · you have walked ${steps}`}>Walk from 🏠 home to the <b>{target.name}</b> {target.e}</Prompt>
      <div className="grid items-start gap-6 md:grid-cols-[1fr_auto]">
        <div className="mx-auto grid w-full max-w-lg gap-1 rounded-[28px] bg-[#86c07a] p-2" style={{ gridTemplateColumns: `repeat(${G}, minmax(0,1fr))` }}>
          {range(G * G).map((i) => {
            const x = i % G, y = Math.floor(i / G)
            const road = isRoad(x, y)
            const here = pos[0] === x && pos[1] === y
            const bi = map.blocks.indexOf(i)
            return (
              <button key={i} onClick={() => tapCell(i)} aria-label={road ? `Road ${x + 1},${y + 1}` : map.places[bi]?.name}
                className={`relative grid aspect-square place-items-center rounded-lg text-2xl sm:text-3xl ${road ? (trail.includes(i) ? 'bg-[#fde68a]' : 'bg-[#d6d3d1]') : i === tb ? 'bg-white ring-4 ring-coral' : 'bg-[#f5f5f4]'}`}>
                {!road && map.places[bi]?.e}
                {road && x === 0 && y === 0 && !here && '🏠'}
                {road && x === map.door[0] && y === map.door[1] && !here && <span className="text-xl">🚩</span>}
                {here && <motion.span layoutId="walker" className="text-3xl">🚶</motion.span>}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-3 gap-2 justify-self-center">
          <span /><Button big aria-label="Up" onClick={() => move(0, -1)}><ArrowUp /></Button><span />
          <Button big aria-label="Left" onClick={() => move(-1, 0)}><ArrowLeft /></Button><span className="grid place-items-center text-3xl">🚶</span><Button big aria-label="Right" onClick={() => move(1, 0)}><ArrowRight /></Button>
          <span /><Button big aria-label="Down" onClick={() => move(0, 1)}><ArrowDown /></Button><span />
        </div>
      </div>
      {arrived && <p className="mt-4 text-center text-2xl font-bold text-teal">You arrived at the {target.name}! 🎉</p>}
    </div>
  )
}

/* ======================= Landmark sequence (bus tour order) ======================= */
export function LandmarkSequence(p: GameProps) {
  const cols = 4
  const n = [3, 4, 5][p.level - 1]
  const total = 2
  const r = useRounds(total, p, 1500)
  const rounds = useMemo(() => range(total).map(() => {
    const set = pick(PLACES, 6)
    const spots = pick(range(cols * cols), 6)
    return { set, spots, route: pick(range(6), n) }
  }), [n])
  const cur = rounds[r.round]
  const [bus, setBus] = useState(-1)
  const [phase, setPhase] = useState<'ready' | 'tour' | 'ask'>('ready')
  const [got, setGot] = useState<number[]>([])
  useEffect(() => { setPhase('ready'); setGot([]); setBus(-1) }, [r.round])
  const tour = async () => {
    setPhase('tour')
    for (const k of cur.route) { setBus(k); await new Promise((res) => setTimeout(res, 1500)) }
    setBus(-1); setPhase('ask')
  }
  const tap = (k: number) => {
    if (got.includes(k) || r.locked) return
    const g = [...got, k]; setGot(g)
    if (cur.route[g.length - 1] !== k) return r.answer(false)
    if (g.length === n) r.answer(true)
  }
  const cells = range(cols * cols).map((i) => {
    const k = cur.spots.indexOf(i)
    if (k < 0) return null
    return (
      <span className="relative" aria-label={cur.set[k].name}>
        {cur.set[k].e}
        {bus === k && <motion.span layoutId="bus" className="absolute -right-4 -top-5 text-3xl">🚌</motion.span>}
        {got.includes(k) && <span className="absolute -right-3 -top-3 grid size-7 place-items-center rounded-full bg-leaf text-sm font-bold text-white">{got.indexOf(k) + 1}</span>}
      </span>
    )
  })
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} label="Tour" />
      <Prompt sub={phase === 'ask' ? `${got.length} of ${n}` : `The bus will stop at ${n} places.`}>{phase === 'ask' ? 'Tap the places in the order the bus visited' : 'Watch the bus tour the town'}</Prompt>
      <Town cols={cols} cells={cells} highlight={bus >= 0 ? [cur.spots[bus]] : []} onCell={phase === 'ask' ? (i) => { const k = cur.spots.indexOf(i); if (k >= 0) tap(k) } : undefined} />
      {phase === 'ready' && <Button big className="mt-5" onClick={tour}>🚌 Start the tour</Button>}
      {phase === 'tour' && bus >= 0 && <p className="mt-4 text-2xl font-bold">Stop: {cur.set[bus].name}</p>}
    </div>
  )
}
