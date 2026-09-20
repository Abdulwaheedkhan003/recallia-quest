import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { speak } from '../../../lib/speech'
import { useSettings } from '../../../state/settings'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, Prompt, range, RoundBar, rnd, useRounds } from '../kit'

/* ======================= Choose the story (branching, then recall your own choices) ======================= */
type Node = { text: string; ask: string; opts: { e: string; label: string; next?: string; note: string }[] }
const STORY: Record<string, Node> = {
  start: { text: 'It is a lovely Saturday morning. You decide to go out.', ask: 'Where do you go?', opts: [{ e: '🏖️', label: 'To the seaside', next: 'sea', note: 'the seaside' }, { e: '🌾', label: 'To the market', next: 'market', note: 'the market' }, { e: '🏞️', label: 'To the park', next: 'park', note: 'the park' }] },
  sea: { text: 'The sea is sparkling and the gulls are calling.', ask: 'What do you do first?', opts: [{ e: '🍦', label: 'Buy an ice cream', next: 'friend', note: 'an ice cream' }, { e: '🐚', label: 'Collect shells', next: 'friend', note: 'shells' }] },
  market: { text: 'The market is busy and colourful.', ask: 'What do you buy?', opts: [{ e: '🥭', label: 'Sweet mangoes', next: 'friend', note: 'mangoes' }, { e: '💐', label: 'A bunch of flowers', next: 'friend', note: 'flowers' }] },
  park: { text: 'The park is green and peaceful.', ask: 'What do you do?', opts: [{ e: '🦆', label: 'Feed the ducks', next: 'friend', note: 'feeding the ducks' }, { e: '🪁', label: 'Watch the kites', next: 'friend', note: 'watching kites' }] },
  friend: { text: 'You meet an old friend! They are so happy to see you.', ask: 'Who is it?', opts: [{ e: '👩‍🦳', label: 'Your school friend Meena', next: 'lunch', note: 'Meena' }, { e: '👨‍🦲', label: 'Your old neighbour Frank', next: 'lunch', note: 'Frank' }, { e: '👩‍🍳', label: 'Your cousin Asha', next: 'lunch', note: 'Asha' }] },
  lunch: { text: 'Your friend says, "Let us have something to eat together."', ask: 'What do you eat?', opts: [{ e: '🥪', label: 'Sandwiches', next: 'home', note: 'sandwiches' }, { e: '🍛', label: 'Rice and curry', next: 'home', note: 'rice and curry' }, { e: '🍰', label: 'Tea and cake', next: 'home', note: 'tea and cake' }] },
  home: { text: 'The sun begins to set. It is time to go home.', ask: 'How do you travel home?', opts: [{ e: '🚌', label: 'By bus', note: 'the bus' }, { e: '🚶', label: 'Walking slowly', note: 'walking' }, { e: '🚕', label: 'In a taxi', note: 'a taxi' }] },
}
const QUESTION: Record<string, string> = { start: 'Where did you go this morning?', sea: 'What did you do first at the seaside?', market: 'What did you buy at the market?', park: 'What did you do at the park?', friend: 'Who did you meet?', lunch: 'What did you eat together?', home: 'How did you travel home?' }
export function StoryChoice(p: GameProps) {
  const { lang } = useSettings()
  const [node, setNode] = useState('start')
  const [path, setPath] = useState<{ node: string; chose: number }[]>([])
  const [asking, setAsking] = useState(false)
  const n = STORY[node]
  useEffect(() => { if (!asking) speak(`${n.text} ${n.ask}`, lang).catch(() => {}) }, [node]) // eslint-disable-line react-hooks/exhaustive-deps
  const qs = useMemo(() => (asking ? shuffle(path).slice(0, [2, 3, 4][p.level - 1]) : []), [asking]) // eslint-disable-line react-hooks/exhaustive-deps
  const r = useRounds(Math.max(1, qs.length), p, 1300)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => setPicked(null), [r.round])
  if (!asking) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <motion.div key={node} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="mb-3 rounded-[32px] bg-white p-6 text-2xl leading-relaxed shadow">{n.text}</p>
          <Prompt>{n.ask}</Prompt>
          <div className={`grid gap-4 ${n.opts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {n.opts.map((o, i) => (
              <Choice key={o.label} onClick={() => { const pa = [...path, { node, chose: i }]; setPath(pa); if (o.next) setNode(o.next); else setAsking(true) }} className="min-h-36">
                <span className="text-6xl">{o.e}</span><span className="text-xl">{o.label}</span>
              </Choice>
            ))}
          </div>
        </motion.div>
      </div>
    )
  }
  const q = qs[r.round]
  const opts = STORY[q.node].opts
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={r.round} total={qs.length} label="Question" />
      <Prompt sub="It was your story — what did you choose?">{QUESTION[q.node]}</Prompt>
      <div className={`grid gap-4 ${opts.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {opts.map((o, i) => <Choice key={o.label} disabled={r.locked} state={picked === i ? (i === q.chose ? 'right' : 'wrong') : r.locked && i === q.chose ? 'right' : null} onClick={() => { setPicked(i); r.answer(i === q.chose) }}><span className="text-5xl">{o.e}</span><span className="text-lg">{o.label}</span></Choice>)}
      </div>
    </div>
  )
}

/* ======================= Then and now (reminiscence) ======================= */
const THEN_NOW: { then: string; thenName: string; now: string; nowName: string; ask: string }[] = [
  { then: '📻', thenName: 'Valve radio', now: '📱', nowName: 'Smartphone', ask: 'Which programme did your family listen to?' },
  { then: '☎️', thenName: 'Dial telephone', now: '📲', nowName: 'Mobile phone', ask: 'Do you remember your old phone number?' },
  { then: '✉️', thenName: 'Handwritten letter', now: '📧', nowName: 'Email', ask: 'Who did you write letters to?' },
  { then: '📷', thenName: 'Film camera', now: '🤳', nowName: 'Phone camera', ask: 'What did you like to photograph?' },
  { then: '🕯️', thenName: 'Oil lamp', now: '💡', nowName: 'Electric light', ask: 'Did you read by lamplight?' },
  { then: '🐎', thenName: 'Horse cart', now: '🚗', nowName: 'Car', ask: 'What was your first car or bicycle?' },
  { then: '📼', thenName: 'Video cassette', now: '📺', nowName: 'Streaming TV', ask: 'What was your favourite film?' },
  { then: '💿', thenName: 'Record player', now: '🎧', nowName: 'Headphones and music apps', ask: 'Which singer did you love?' },
  { then: '🧮', thenName: 'Abacus', now: '🔢', nowName: 'Calculator', ask: 'Were you good at sums at school?' },
  { then: '🗺️', thenName: 'Paper map', now: '🧭', nowName: 'Phone navigation', ask: 'Where was your favourite journey?' },
  { then: '⌨️', thenName: 'Typewriter', now: '💻', nowName: 'Computer', ask: 'Did you ever use a typewriter?' },
  { then: '🪣', thenName: 'Washboard and bucket', now: '🫧', nowName: 'Washing machine', ask: 'Who did the washing in your home?' },
]
export function ThenNow(p: GameProps) {
  const total = 5
  const n = [3, 4, 4][p.level - 1]
  const rounds = useMemo(() => pick(THEN_NOW, total).map((ans) => ({ ans, opts: shuffle([ans, ...pick(THEN_NOW.filter((x) => x !== ans), n - 1)]) })), [n])
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const cur = rounds[i]
  const choose = (o: typeof cur.ans) => { if (picked) return; setPicked(o.nowName); const ok = o === cur.ans; if (ok) setScore(score + 1); p.cheer(ok ? 'good' : 'retry') }
  const next = () => { if (i + 1 >= total) p.finish(score, total); else { setI(i + 1); setPicked(null) } }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={i} total={total} />
      <div className="mx-auto mb-4 w-fit rounded-[32px] bg-[#fef3c7] px-10 py-5 shadow-lg ring-4 ring-[#d97706]/40">
        <p className="text-lg font-bold uppercase tracking-wide text-[#92400e]">In the old days</p>
        <div className="text-8xl" aria-hidden>{cur.ans.then}</div><p className="text-3xl font-bold">{cur.ans.thenName}</p>
      </div>
      <Prompt>What do we use for this today?</Prompt>
      <div className="grid grid-cols-2 gap-4">
        {cur.opts.map((o) => <Choice key={o.nowName} disabled={!!picked} state={picked === o.nowName ? (o === cur.ans ? 'right' : 'wrong') : picked && o === cur.ans ? 'right' : null} onClick={() => choose(o)}><span className="text-5xl">{o.now}</span><span className="text-lg">{o.nowName}</span></Choice>)}
      </div>
      {picked && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-[28px] bg-white p-5 shadow">
          <p className="text-2xl">💭 {cur.ans.ask}</p>
          <p className="mt-1 text-lg text-ink-soft">Take a moment to remember, or tell someone nearby.</p>
          <Button big className="mt-3" onClick={next}>{i + 1 >= total ? 'Finish' : 'Next'}</Button>
        </motion.div>
      )}
    </div>
  )
}

/* ======================= Trace the shape (drawing) ======================= */
const SHAPES: Record<string, string> = {
  circle: 'M150 40 A110 110 0 1 1 149.9 40',
  wave: 'M20 150 Q70 60 120 150 T220 150 T280 150',
  house: 'M60 260 V140 L150 60 L240 140 V260 Z',
  heart: 'M150 260 C40 180 40 80 105 70 C135 65 150 90 150 105 C150 90 165 65 195 70 C260 80 260 180 150 260 Z',
  star: 'M150 30 L180 115 L270 115 L197 168 L225 255 L150 202 L75 255 L103 168 L30 115 L120 115 Z',
  spiral: 'M150 150 m0 -10 a10 10 0 1 1 -1 0 m1 -20 a30 30 0 1 1 -1 0 m1 -20 a50 50 0 1 1 -1 0 m1 -20 a70 70 0 1 1 -1 0',
}
export function TraceShape(p: GameProps) {
  const list = [['circle', 'wave', 'house'], ['house', 'heart', 'wave'], ['heart', 'star', 'spiral']][p.level - 1]
  const [i, setI] = useState(0)
  const [scores, setScores] = useState<number[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const guide = useRef<SVGPathElement>(null)
  const pts = useRef<{ x: number; y: number; hit: boolean }[]>([])
  const [ink, setInk] = useState<string>('')
  const [cov, setCov] = useState(0)
  const drawing = useRef(false)
  const tol = [26, 20, 16][p.level - 1]
  useEffect(() => {
    const el = guide.current!
    const L = el.getTotalLength()
    pts.current = range(80).map((k) => { const q = el.getPointAtLength((k / 80) * L); return { x: q.x, y: q.y, hit: false } })
    setInk(''); setCov(0)
  }, [i])
  const local = (e: React.PointerEvent) => { const b = svg.current!.getBoundingClientRect(); return { x: ((e.clientX - b.left) / b.width) * 300, y: ((e.clientY - b.top) / b.height) * 300 } }
  const mark = (e: React.PointerEvent) => {
    const q = local(e)
    let changed = false
    for (const pt of pts.current) if (!pt.hit && Math.hypot(pt.x - q.x, pt.y - q.y) < tol) { pt.hit = true; changed = true }
    setInk((s) => `${s}${s ? ' L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
    if (changed) setCov(pts.current.filter((x) => x.hit).length / pts.current.length)
  }
  const done = () => {
    const s = [...scores, cov]
    setScores(s)
    p.cheer(cov > 0.8 ? 'good' : 'retry')
    if (i + 1 >= list.length) setTimeout(() => p.finish(Math.round(s.reduce((a, b) => a + b, 0) * 10), list.length * 10), 700)
    else setTimeout(() => setI(i + 1), 700)
  }
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={i} total={list.length} label="Shape" />
      <Prompt sub={`${Math.round(cov * 100)}% traced`}>Follow the dotted line</Prompt>
      <svg ref={svg} viewBox="0 0 300 300" className="mx-auto w-full max-w-md touch-none rounded-[32px] bg-white shadow-lg"
        onPointerDown={(e) => { drawing.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setInk((s) => `${s} M${local(e).x} ${local(e).y}`) }}
        onPointerMove={(e) => drawing.current && mark(e)} onPointerUp={() => (drawing.current = false)} role="img" aria-label="Tracing area">
        <path ref={guide} d={SHAPES[list[i]]} fill="none" stroke="#c4b5fd" strokeWidth={tol * 1.4} strokeLinecap="round" strokeLinejoin="round" opacity=".35" />
        <path d={SHAPES[list[i]]} fill="none" stroke="#6d28d9" strokeWidth="4" strokeDasharray="8 10" strokeLinecap="round" />
        {pts.current.filter((x) => x.hit).map((x, k) => <circle key={k} cx={x.x} cy={x.y} r="5" fill="#16a34a" />)}
        <path d={ink} fill="none" stroke="#e0533d" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-4 flex justify-center gap-3">
        <Button variant="secondary" onClick={() => { pts.current.forEach((x) => (x.hit = false)); setInk(''); setCov(0) }}>↺ Start again</Button>
        <Button big disabled={cov < 0.3} onClick={done}>✓ Done</Button>
      </div>
    </div>
  )
}

/* ======================= Paint by colour ======================= */
const PAL: Record<number, { c: string; name: string }> = { 1: { c: '#60a5fa', name: 'Blue' }, 2: { c: '#facc15', name: 'Yellow' }, 3: { c: '#ef4444', name: 'Red' }, 4: { c: '#22c55e', name: 'Green' }, 5: { c: '#92400e', name: 'Brown' }, 6: { c: '#f9a8d4', name: 'Pink' } }
const PICTURES: { name: string; regions: { d: string; n: number; lx: number; ly: number }[] }[] = [
  { name: 'A little house', regions: [
    { d: 'M0 0H300V190H0Z', n: 1, lx: 30, ly: 30 }, { d: 'M0 190H300V300H0Z', n: 4, lx: 30, ly: 270 },
    { d: 'M230 60m-26 0a26 26 0 1 0 52 0a26 26 0 1 0 -52 0', n: 2, lx: 230, ly: 66 }, { d: 'M70 130L150 70L230 130Z', n: 3, lx: 150, ly: 115 },
    { d: 'M85 130H215V240H85Z', n: 2, lx: 110, ly: 160 }, { d: 'M135 180H165V240H135Z', n: 5, lx: 150, ly: 215 },
    { d: 'M180 150H205V175H180Z', n: 1, lx: 192, ly: 167 }, { d: 'M20 250 q15 -40 30 0Z', n: 6, lx: 35, ly: 243 },
  ] },
  { name: 'A flower pot', regions: [
    { d: 'M0 0H300V300H0Z', n: 2, lx: 25, ly: 30 }, { d: 'M148 110H156V220H148Z', n: 4, lx: 152, ly: 200 },
    { d: 'M156 170q40 -30 50 -5q-25 20 -50 5Z', n: 4, lx: 185, ly: 172 }, { d: 'M152 90m-50 0a50 50 0 1 0 100 0a50 50 0 1 0 -100 0', n: 6, lx: 120, ly: 80 },
    { d: 'M152 90m-20 0a20 20 0 1 0 40 0a20 20 0 1 0 -40 0', n: 3, lx: 152, ly: 96 }, { d: 'M100 215H204L190 290H114Z', n: 5, lx: 152, ly: 258 },
    { d: 'M95 205H209V222H95Z', n: 3, lx: 110, ly: 218 },
  ] },
]
export function PaintNumber(p: GameProps) {
  const pics = p.level === 1 ? [PICTURES[1]] : PICTURES
  const [k, setK] = useState(0)
  const pic = pics[k]
  const [fill, setFill] = useState<Record<number, number>>({})
  const [brush, setBrush] = useState<number | null>(null)
  const [miss, setMiss] = useState(0)
  const [total, setTotal] = useState({ right: 0, all: 0 })
  const used = [...new Set(pic.regions.map((r) => r.n))]
  const paint = (idx: number) => {
    if (brush === null || fill[idx] !== undefined) return
    if (pic.regions[idx].n !== brush) { setMiss(miss + 1); p.cheer('retry'); return }
    const f = { ...fill, [idx]: brush }
    setFill(f)
    if (Object.keys(f).length === pic.regions.length) {
      p.cheer('good')
      const t = { right: total.right + Math.max(1, pic.regions.length - miss), all: total.all + pic.regions.length }
      setTotal(t)
      setTimeout(() => { if (k + 1 >= pics.length) p.finish(t.right, t.all); else { setK(k + 1); setFill({}); setMiss(0) } }, 1200)
    }
  }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Prompt sub="Choose a colour, then tap the parts with the same number.">{pic.name}</Prompt>
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        {used.map((n) => <button key={n} onClick={() => setBrush(n)} aria-pressed={brush === n} className={`flex min-h-16 items-center gap-2 rounded-full px-5 text-xl font-bold shadow ${brush === n ? 'ring-4 ring-ink' : ''}`} style={{ background: PAL[n].c }}><span className="grid size-9 place-items-center rounded-full bg-white">{n}</span>{PAL[n].name}</button>)}
      </div>
      <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-md rounded-[32px] bg-white shadow-lg">
        {pic.regions.map((r, i) => (
          <g key={i} onClick={() => paint(i)} className="cursor-pointer">
            <path d={r.d} fill={fill[i] !== undefined ? PAL[fill[i]].c : '#ffffff'} stroke="#2b2350" strokeWidth="2" />
            {fill[i] === undefined && <text x={r.lx} y={r.ly} textAnchor="middle" fontSize="16" fontWeight="bold" fill="#2b2350" pointerEvents="none">{r.n}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ======================= Join the dots ======================= */
const DOT_PICS: { name: string; e: string; pts: [number, number][] }[] = [
  { name: 'a house', e: '🏠', pts: [[60, 250], [60, 140], [150, 60], [240, 140], [240, 250], [60, 250]] },
  { name: 'a star', e: '⭐', pts: [[150, 30], [180, 115], [270, 115], [197, 168], [225, 255], [150, 202], [75, 255], [103, 168], [30, 115], [120, 115], [150, 30]] },
  { name: 'a fish', e: '🐟', pts: [[40, 150], [90, 100], [170, 90], [230, 130], [280, 90], [270, 150], [280, 210], [230, 170], [170, 210], [90, 200], [40, 150]] },
  { name: 'a boat', e: '⛵', pts: [[40, 200], [260, 200], [220, 250], [80, 250], [40, 200], [150, 200], [150, 40], [230, 180], [150, 180]] },
  { name: 'a diamond', e: '💎', pts: [[150, 40], [240, 130], [150, 260], [60, 130], [150, 40]] },
]
export function ConnectDots(p: GameProps) {
  const pics = useMemo(() => (p.level === 1 ? [DOT_PICS[4], DOT_PICS[0]] : p.level === 2 ? [DOT_PICS[0], DOT_PICS[3]] : [DOT_PICS[1], DOT_PICS[2]]), [p.level])
  const [k, setK] = useState(0)
  const [next, setNext] = useState(1)
  const [miss, setMiss] = useState(0)
  const [score, setScore] = useState(0)
  const pic = pics[k]
  // repeated points (closing the loop) are drawn but not numbered twice
  const dots = pic.pts.map((q, i) => ({ q, i })).filter(({ q, i }) => pic.pts.findIndex((x) => x[0] === q[0] && x[1] === q[1]) === i)
  const tap = (i: number) => {
    if (i !== next - 1) { setMiss(miss + 1); p.cheer('retry'); return }
    const n = next + 1
    // skip over repeated points automatically
    let nn = n
    while (nn - 1 < pic.pts.length && !dots.some((d) => d.i === nn - 1)) nn++
    setNext(nn)
    if (nn - 1 >= pic.pts.length) {
      p.cheer('good')
      const s = score + Math.max(1, dots.length - miss)
      setScore(s)
      setTimeout(() => { if (k + 1 >= pics.length) p.finish(s, pics.reduce((a, x) => a + new Set(x.pts.map(String)).size, 0)); else { setK(k + 1); setNext(1); setMiss(0) } }, 1400)
    }
  }
  const drawnTo = Math.min(next - 1, pic.pts.length - 1)
  const complete = next - 1 >= pic.pts.length
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Prompt sub={complete ? `It's ${pic.name}! ${pic.e}` : `Next: ${dots.findIndex((d) => d.i === next - 1) + 1}`}>Tap the dots in order</Prompt>
      <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-md rounded-[32px] bg-white shadow-lg">
        <polyline points={pic.pts.slice(0, complete ? pic.pts.length : drawnTo).map((q) => q.join(',')).join(' ')} fill={complete ? '#fde68a' : 'none'} stroke="#6d28d9" strokeWidth="5" strokeLinejoin="round" />
        {dots.map(({ q, i }, n) => {
          const isNext = i === next - 1
          return (
            <g key={i} onClick={() => tap(i)} className="cursor-pointer" role="button" aria-label={`Dot ${n + 1}`}>
              <circle cx={q[0]} cy={q[1]} r="22" fill="transparent" />
              <circle cx={q[0]} cy={q[1]} r={isNext && p.level === 1 ? 13 : 10} fill={i < next - 1 ? '#16a34a' : isNext && p.level === 1 ? '#f59e0b' : '#2b2350'} />
              <text x={q[0] + 16} y={q[1] - 12} fontSize="20" fontWeight="bold" fill="#2b2350">{n + 1}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ======================= Turn the tiles (spatial rotation puzzle) ======================= */
function Scene() {
  return (
    <>
      <rect width="300" height="300" fill="#bfdbfe" /><circle cx="235" cy="65" r="35" fill="#facc15" />
      <path d="M0 210 Q80 150 160 200 T300 190 V300 H0Z" fill="#4ade80" /><rect x="50" y="130" width="90" height="80" fill="#fb923c" />
      <path d="M40 135 L95 85 L150 135Z" fill="#dc2626" /><rect x="85" y="165" width="22" height="45" fill="#78350f" />
      <rect x="205" y="150" width="12" height="60" fill="#78350f" /><circle cx="211" cy="140" r="30" fill="#16a34a" /><path d="M20 40 q20 -20 40 0 q20 -20 40 0" stroke="#fff" strokeWidth="8" fill="none" />
    </>
  )
}
export function RotateTiles(p: GameProps) {
  const n = [2, 3, 3][p.level - 1]
  const [rot, setRot] = useState<number[]>(() => range(n * n).map(() => (p.level === 3 ? 1 + rnd(3) : rnd(4))))
  const [moves, setMoves] = useState(0)
  const [done, setDone] = useState(false)
  useEffect(() => { if (rot.every((r) => r === 0)) setRot((x) => x.map((v, i) => (i === 0 ? 1 : v))) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const minimum = useMemo(() => rot.reduce((a, r) => a + ((4 - r) % 4), 0), []) // eslint-disable-line react-hooks/exhaustive-deps
  const turn = (i: number) => {
    if (done) return
    const r = rot.map((v, k) => (k === i ? (v + 1) % 4 : v))
    setRot(r); setMoves(moves + 1)
    if (r.every((v) => v === 0)) { setDone(true); p.cheer('good'); setTimeout(() => p.finish(Math.max(1, 10 - Math.max(0, moves + 1 - minimum)), 10), 1200) }
  }
  const s = 300 / n
  return (
    <div className="mx-auto max-w-xl text-center">
      <Prompt sub={`Turns: ${moves}`}>Tap tiles to turn them until the picture is whole</Prompt>
      <div className="mx-auto grid w-full max-w-md gap-1 rounded-[24px] bg-ink/10 p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {range(n * n).map((i) => (
          <motion.button key={i} onClick={() => turn(i)} animate={{ rotate: rot[i] * 90 }} transition={{ duration: 0.3 }} aria-label={`Tile ${i + 1}${rot[i] === 0 ? ', the right way up' : ''}`}
            className={`aspect-square overflow-hidden rounded-xl ${done ? '' : 'shadow-md'}`}>
            <svg viewBox={`${(i % n) * s} ${Math.floor(i / n) * s} ${s} ${s}`} className="size-full"><Scene /></svg>
          </motion.button>
        ))}
      </div>
      {done && <p className="mt-4 text-2xl font-bold text-teal">A sunny house! 🏡</p>}
      <details className="mx-auto mt-4 max-w-xs text-lg"><summary className="cursor-pointer font-bold">👀 Peek at the picture</summary><svg viewBox="0 0 300 300" className="mt-2 w-full rounded-xl"><Scene /></svg></details>
    </div>
  )
}

/* ======================= Turn the box (3D cube orientation) ======================= */
type Faces = { front: string; back: string; left: string; right: string; top: string; bottom: string }
const START: Faces = { front: '🍎', back: '🌙', left: '🐟', right: '🌻', top: '⭐', bottom: '🏠' }
const NAMES: Record<string, string> = { '🍎': 'apple', '🌙': 'moon', '🐟': 'fish', '🌻': 'sunflower', '⭐': 'star', '🏠': 'house' }
const TURN = {
  left: (f: Faces): Faces => ({ ...f, front: f.right, right: f.back, back: f.left, left: f.front }),
  right: (f: Faces): Faces => ({ ...f, front: f.left, left: f.back, back: f.right, right: f.front }),
  up: (f: Faces): Faces => ({ ...f, front: f.bottom, bottom: f.back, back: f.top, top: f.front }),
  down: (f: Faces): Faces => ({ ...f, front: f.top, top: f.back, back: f.bottom, bottom: f.front }),
}
const MAT = { left: 'rotateY(-90deg)', right: 'rotateY(90deg)', up: 'rotateX(90deg)', down: 'rotateX(-90deg)' }
export function TurnCube(p: GameProps) {
  const total = 4
  const r = useRounds(total, p, 1300)
  const targets = useMemo(() => shuffle(Object.values(START).filter((e) => e !== START.front)).slice(0, total), [])
  const [faces, setFaces] = useState<Faces>(START)
  const [xf, setXf] = useState('')
  const [moves, setMoves] = useState(0)
  const target = targets[r.round]
  useEffect(() => setMoves(0), [r.round])
  const turn = (d: keyof typeof TURN) => {
    if (r.locked) return
    const f = TURN[d](faces)
    setFaces(f); setXf(`${MAT[d]} ${xf}`); setMoves(moves + 1)
    if (f.front === target) r.answer(moves + 1 <= (p.level === 3 ? 2 : 4))
  }
  const face = (e: string, t: string) => <div className="absolute inset-0 grid place-items-center rounded-2xl border-4 border-white/70 bg-gradient-to-br from-[#ede9fe] to-[#c4b5fd] text-7xl" style={{ transform: `${t} translateZ(80px)`, backfaceVisibility: 'hidden' }}>{e}</div>
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={p.level === 3 ? 'Use as few turns as you can (2 or fewer).' : `Turns this time: ${moves}`}>Turn the box so the <b>{NAMES[target]}</b> {target} faces you</Prompt>
      <div className="mx-auto my-8 size-40" style={{ perspective: 700 }}>
        <div className="relative size-40 transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: `rotateX(-18deg) rotateY(22deg) ${xf}` }}>
          {face(START.front, '')}{face(START.back, 'rotateY(180deg)')}{face(START.right, 'rotateY(90deg)')}{face(START.left, 'rotateY(-90deg)')}{face(START.top, 'rotateX(90deg)')}{face(START.bottom, 'rotateX(-90deg)')}
        </div>
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        <span /><Button big aria-label="Tip the box up" onClick={() => turn('up')}>⤒</Button><span />
        <Button big aria-label="Turn the box left" onClick={() => turn('left')}>↶</Button><span className="grid place-items-center text-4xl">📦</span><Button big aria-label="Turn the box right" onClick={() => turn('right')}>↷</Button>
        <span /><Button big aria-label="Tip the box down" onClick={() => turn('down')}>⤓</Button><span />
      </div>
      {p.level === 1 && <p className="mt-4 text-lg text-ink-soft">Now facing you: {faces.front} · on top: {faces.top}</p>}
    </div>
  )
}

/* ======================= Breathing bubble (paced breathing, calm) ======================= */
export function Breathe(p: GameProps) {
  const secs = [4, 5, 6][p.level - 1]
  const breaths = 5
  const [on, setOn] = useState(false)
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const [n, setN] = useState(0)
  const holding = useRef(false)
  const sync = useRef({ good: 0, all: 0 })
  useEffect(() => {
    if (!on) return
    let t = 0
    const iv = setInterval(() => {
      t += 100
      const cyc = Math.floor(t / (secs * 1000))
      const ph = cyc % 2 === 0 ? 'in' : 'out'
      setPhase(ph)
      const intoPhase = t % (secs * 1000)
      if (intoPhase > 700) { sync.current.all++; if (holding.current === (ph === 'in')) sync.current.good++ }
      const b = Math.floor(cyc / 2)
      setN(b)
      if (b >= breaths) { clearInterval(iv); setOn(false); p.finish(Math.round((sync.current.good / Math.max(1, sync.current.all)) * 10), 10) }
    }, 100)
    return () => clearInterval(iv)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const press = (v: boolean) => { holding.current = v }
  return (
    <div className="mx-auto max-w-xl text-center">
      <Prompt sub={on ? `Breath ${Math.min(n + 1, breaths)} of ${breaths}` : `${breaths} slow breaths, ${secs} seconds in and ${secs} seconds out.`}>{!on ? 'Breathe with the bubble' : phase === 'in' ? 'Breathe in… hold the button' : 'Breathe out… let go'}</Prompt>
      <div className="relative mx-auto grid size-72 place-items-center">
        <motion.div animate={{ scale: on ? (phase === 'in' ? 1 : 0.45) : 0.6 }} transition={{ duration: on ? secs : 0.5, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#a5f3fc_40%,#38bdf8)] opacity-90 shadow-[0_0_60px_#7dd3fc]" />
        <span className="relative text-3xl font-bold text-[#075985]">{on ? (phase === 'in' ? 'In' : 'Out') : '🫧'}</span>
      </div>
      {!on ? <Button big className="mt-6" onClick={() => { sync.current = { good: 0, all: 0 }; setOn(true) }}>Start</Button> : (
        <button onPointerDown={() => press(true)} onPointerUp={() => press(false)} onPointerLeave={() => press(false)} onKeyDown={(e) => e.key === ' ' && press(true)} onKeyUp={(e) => e.key === ' ' && press(false)}
          className="mt-6 min-h-24 w-full max-w-sm rounded-full bg-[#0ea5e9] text-2xl font-bold text-white shadow-xl active:scale-95">Hold while breathing in</button>
      )}
    </div>
  )
}

/* ======================= Little garden (gentle sustained attention) ======================= */
export function Garden(p: GameProps) {
  const count = [3, 4, 5][p.level - 1]
  const seconds = [45, 60, 75][p.level - 1]
  const [water, setWater] = useState(() => range(count).map(() => 60 + rnd(30)))
  const [growth, setGrowth] = useState(() => range(count).map(() => 0))
  const [left, setLeft] = useState(seconds)
  const [on, setOn] = useState(false)
  const healthy = useRef({ ok: 0, all: 0 })
  const rates = useMemo(() => range(count).map(() => 2 + Math.random() * [2, 3, 4][p.level - 1]), [count, p.level])
  useEffect(() => {
    if (!on) return
    const iv = setInterval(() => {
      setWater((w) => {
        const nw = w.map((v, i) => Math.max(0, v - rates[i]))
        nw.forEach((v) => { healthy.current.all++; if (v >= 30 && v <= 100) healthy.current.ok++ })
        setGrowth((g) => g.map((x, i) => Math.min(100, x + (nw[i] >= 30 && nw[i] <= 100 ? 2 : 0))))
        return nw
      })
      setLeft((l) => {
        if (l <= 1) { clearInterval(iv); setOn(false); p.finish(Math.round((healthy.current.ok / Math.max(1, healthy.current.all)) * 10), 10) }
        return l - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  const pour = (i: number) => { if (!on) return; setWater((w) => w.map((v, k) => (k === i ? Math.min(130, v + 35) : v))); if (water[i] > 90) p.cheer('retry') }
  const FLOWERS = ['🌷', '🌻', '🌹', '🌼', '🪻']
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Prompt sub={on ? `${left} seconds left` : 'Droopy flowers need water. Too much water is not good either!'}>Look after your garden</Prompt>
      {!on && left === seconds && <Button big onClick={() => setOn(true)}>🌱 Start</Button>}
      <div className="mt-6 flex flex-wrap items-end justify-center gap-6 rounded-[40px] bg-gradient-to-b from-[#e0f2fe] to-[#bbf7d0] p-6">
        {range(count).map((i) => {
          const w = water[i]
          const thirsty = w < 30, soggy = w > 100
          return (
            <button key={i} onClick={() => pour(i)} aria-label={`Flower ${i + 1}: ${thirsty ? 'thirsty' : soggy ? 'too wet' : 'happy'}. Tap to water.`} className="flex flex-col items-center">
              <motion.span animate={{ rotate: thirsty ? 35 : soggy ? -15 : 0, scale: 0.8 + growth[i] / 250 }} className="text-7xl" style={{ filter: thirsty ? 'grayscale(.7)' : undefined }}>{FLOWERS[i]}</motion.span>
              <span className="text-3xl">🪴</span>
              <div className="mt-2 h-3 w-20 overflow-hidden rounded-full bg-white"><div className={`h-full ${thirsty ? 'bg-coral' : soggy ? 'bg-[#1d4ed8]' : 'bg-[#38bdf8]'}`} style={{ width: `${Math.min(100, w / 1.3)}%` }} /></div>
              <span className="mt-1 text-lg font-bold">{thirsty ? '💧 Thirsty' : soggy ? '🌊 Too wet' : '😊 Happy'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ======================= Pebble path (seriation by size) ======================= */
export function SortPebbles(p: GameProps) {
  const n = [4, 6, 8][p.level - 1]
  const step = [18, 11, 7][p.level - 1]
  const sizes = useMemo(() => shuffle(range(n).map((i) => 40 + i * step)), [n, step])
  const colors = useMemo(() => range(n).map(() => ['#a8a29e', '#78716c', '#d6d3d1', '#94a3b8', '#b8a18c'][rnd(5)]), [n])
  const [path, setPath] = useState<number[]>([])
  const [miss, setMiss] = useState(0)
  const sorted = [...sizes].sort((a, b) => a - b)
  const tap = (i: number) => {
    if (path.includes(i)) return
    if (sizes[i] !== sorted[path.length]) { setMiss(miss + 1); p.cheer('retry'); return }
    const np = [...path, i]; setPath(np)
    if (np.length === n) { p.cheer('good'); setTimeout(() => p.finish(Math.max(1, n - miss), n), 900) }
  }
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Prompt sub="Tap the smallest pebble first.">Make a path from smallest to biggest</Prompt>
      <div className="mb-6 flex min-h-40 flex-wrap items-center justify-center gap-4 rounded-[40px] bg-[#e7e5e4] p-5">
        {sizes.map((s, i) => !path.includes(i) && (
          <motion.button key={i} layoutId={`peb${i}`} onClick={() => tap(i)} aria-label={`Pebble, size ${Math.round(s / 10)}`}
            className="rounded-[45%] shadow-lg" style={{ width: s + 30, height: s * 0.75 + 20, background: `radial-gradient(circle at 35% 30%, #fff8, ${colors[i]})` }} />
        ))}
      </div>
      <div className="flex min-h-36 items-end justify-center gap-2 rounded-[40px] bg-gradient-to-r from-[#bbf7d0] to-[#86efac] p-4" aria-label={`Path: ${path.length} of ${n} pebbles`}>
        {path.map((i) => <motion.div key={i} layoutId={`peb${i}`} className="rounded-[45%] shadow" style={{ width: sizes[i] + 30, height: sizes[i] * 0.75 + 20, background: `radial-gradient(circle at 35% 30%, #fff8, ${colors[i]})` }} />)}
        {!path.length && <span className="self-center text-xl text-ink-soft">Your path starts here →</span>}
      </div>
    </div>
  )
}
