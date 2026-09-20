import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, Prompt, range, RoundBar, rnd, useRounds } from '../kit'

/* ======================= Set the table (spatial placement) ======================= */
const PLACE_ITEMS: { id: string; e: string; name: string; slot: string }[] = [
  { id: 'fork', e: '🍴', name: 'Fork', slot: 'left' },
  { id: 'knife', e: '🔪', name: 'Knife', slot: 'right' },
  { id: 'spoon', e: '🥄', name: 'Spoon', slot: 'farRight' },
  { id: 'glass', e: '🥛', name: 'Glass of water', slot: 'topRight' },
  { id: 'napkin', e: '🧻', name: 'Napkin', slot: 'farLeft' },
  { id: 'bread', e: '🍞', name: 'Bread plate', slot: 'topLeft' },
]
const SLOTS: Record<string, { x: number; y: number; label: string }> = {
  farLeft: { x: 8, y: 50, label: 'far left' }, left: { x: 26, y: 50, label: 'left of the plate' },
  right: { x: 74, y: 50, label: 'right of the plate' }, farRight: { x: 90, y: 50, label: 'far right' },
  topLeft: { x: 22, y: 14, label: 'top left' }, topRight: { x: 78, y: 14, label: 'top right' },
}
export function SetTable(p: GameProps) {
  const items = PLACE_ITEMS.slice(0, [3, 4, 6][p.level - 1])
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<string | null>(null)
  const [miss, setMiss] = useState(0)
  const [wrongSlot, setWrongSlot] = useState<string | null>(null)
  const drop = (slot: string) => {
    if (!held) return
    const it = items.find((i) => i.id === held)!
    if (it.slot !== slot) { setMiss(miss + 1); setWrongSlot(slot); p.cheer('retry'); setTimeout(() => setWrongSlot(null), 600); return }
    const next = { ...placed, [held]: slot }
    setPlaced(next); setHeld(null); p.cheer('good')
    if (Object.keys(next).length === items.length) setTimeout(() => p.finish(Math.max(1, items.length * 2 - miss), items.length * 2), 900)
  }
  const hint: Record<string, string> = { fork: 'Forks go on the left.', knife: 'The knife goes on the right, blade facing the plate.', spoon: 'The spoon sits on the far right, beside the knife.', glass: 'The glass goes above the knife.', napkin: 'The napkin goes on the far left.', bread: 'The small bread plate goes top left.' }
  return (
    <div className="mx-auto max-w-4xl">
      <Prompt sub={held ? hint[held] : 'Tap an item, then tap where it goes.'}>Set the table for dinner</Prompt>
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        {items.filter((i) => !placed[i.id]).map((i) => (
          <Choice key={i.id} state={held === i.id ? 'picked' : null} onClick={() => setHeld(i.id)} className="w-32"><span className="text-5xl">{i.e}</span><span className="text-base">{i.name}</span></Choice>
        ))}
      </div>
      <div className="relative mx-auto aspect-[16/9] max-w-3xl rounded-[40px] bg-[#b45309] p-4 shadow-inner">
        <div className="absolute inset-4 rounded-[32px] bg-[repeating-linear-gradient(45deg,#fef3c7_0_20px,#fde68a_20px_40px)]" />
        <div className="absolute left-1/2 top-1/2 grid size-40 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg ring-8 ring-[#e0f2fe] text-6xl">🍛</div>
        {Object.entries(SLOTS).filter(([s]) => items.some((i) => i.slot === s) || p.level > 1).map(([s, pos]) => {
          const it = items.find((i) => placed[i.id] === s)
          return (
            <button key={s} onClick={() => drop(s)} aria-label={it ? `${it.name} at ${pos.label}` : `Empty place, ${pos.label}`}
              className={`absolute grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-3xl text-5xl ${it ? 'bg-white/80' : wrongSlot === s ? 'bg-coral/50' : held ? 'border-4 border-dashed border-ink/40 bg-white/40 animate-pulse' : 'border-4 border-dashed border-ink/20'}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
              {it?.e}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ======================= At the shop (pay the exact amount) ======================= */
const COINS = [1, 2, 5, 10, 20, 50]
const GOODS: [string, string][] = [['🍞', 'Bread'], ['🥛', 'Milk'], ['🍌', 'Bananas'], ['🧼', 'Soap'], ['🍵', 'Tea leaves'], ['🥚', 'Eggs'], ['🍪', 'Biscuits'], ['🕯️', 'Candles'], ['🧀', 'Cheese'], ['🌹', 'Flowers']]
export function PayShop(p: GameProps) {
  const total = 4
  const r = useRounds(total, p, 1400)
  const coins = p.level === 1 ? [1, 2, 5, 10] : COINS
  const rounds = useMemo(() => pick(GOODS, total).map(([e, name]) => ({ e, name, price: p.level === 1 ? 3 + rnd(15) : p.level === 2 ? 12 + rnd(40) : 35 + rnd(60) })), [p.level])
  const cur = rounds[r.round]
  const [paid, setPaid] = useState<number[]>([])
  useEffect(() => setPaid([]), [r.round])
  const sum = paid.reduce((a, b) => a + b, 0)
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={r.round} total={total} label="Customer" />
      <div className="mx-auto mb-4 flex max-w-md items-center justify-center gap-4 rounded-[32px] bg-white p-5 shadow-lg">
        <span className="text-7xl" aria-hidden>{cur.e}</span>
        <div className="text-left"><p className="text-2xl font-bold">{cur.name}</p><p className="text-4xl font-bold text-teal">₹{cur.price}</p></div>
      </div>
      <Prompt sub="Tap a coin on the counter to take it back.">Pay exactly ₹{cur.price}</Prompt>
      <div className="mx-auto mb-4 flex min-h-24 max-w-2xl flex-wrap items-center justify-center gap-2 rounded-[28px] bg-[#a16207]/20 p-3" aria-label={`On the counter: ₹${sum}`}>
        {paid.map((c, i) => <motion.button key={i} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={() => setPaid(paid.filter((_, k) => k !== i))} disabled={r.locked} className="grid size-14 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#fde68a,#b45309)] font-bold text-white shadow" aria-label={`Take back ₹${c}`}>₹{c}</motion.button>)}
        {!paid.length && <span className="text-lg text-ink-soft">Counter</span>}
      </div>
      <p className={`mb-4 text-3xl font-bold ${sum > cur.price ? 'text-coral' : ''}`}>On the counter: ₹{sum} {sum > cur.price && '— too much!'}</p>
      <div className="mb-5 flex flex-wrap justify-center gap-3">
        {coins.map((c) => <motion.button key={c} whileTap={{ scale: 0.9 }} disabled={r.locked} onClick={() => setPaid([...paid, c])} className="grid size-20 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#fef3c7,#d97706)] text-2xl font-bold shadow-lg ring-4 ring-[#92400e]/30" aria-label={`Add ₹${c}`}>₹{c}</motion.button>)}
      </div>
      <Button big disabled={!paid.length || r.locked} onClick={() => r.answer(sum === cur.price)}>🛍️ Pay</Button>
    </div>
  )
}

/* ======================= Set the clock (drag or step the hands) ======================= */
export function SetClock(p: GameProps) {
  const total = 4
  const r = useRounds(total, p, 1500)
  const rounds = useMemo(() => range(total).map(() => ({ h: 1 + rnd(12), m: p.level === 1 ? 0 : p.level === 2 ? [0, 30][rnd(2)] : rnd(12) * 5 })), [p.level])
  const cur = rounds[r.round]
  const [h, setH] = useState(12)
  const [m, setM] = useState(0)
  useEffect(() => { setH(12); setM(0) }, [r.round])
  const face = useRef<SVGSVGElement>(null)
  const drag = useRef<'h' | 'm' | null>(null)
  const angleAt = (e: React.PointerEvent) => {
    const b = face.current!.getBoundingClientRect()
    const a = Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2)))
    return (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const f = angleAt(e)
    if (drag.current === 'm') setM(Math.round(f * 12) % 12 * 5)
    else setH(Math.round(f * 12) % 12 || 12)
  }
  const words = (hh: number, mm: number) => (mm === 0 ? `${hh} o'clock` : mm === 30 ? `half past ${hh}` : mm === 15 ? `quarter past ${hh}` : mm === 45 ? `quarter to ${hh % 12 + 1}` : `${hh}:${String(mm).padStart(2, '0')}`)
  const hand = (turn: number, len: number, w: number, color: string, which: 'h' | 'm') => (
    <line x1="100" y1="100" x2={100 + Math.sin(turn * Math.PI * 2) * len} y2={100 - Math.cos(turn * Math.PI * 2) * len} stroke={color} strokeWidth={w} strokeLinecap="round"
      onPointerDown={(e) => { drag.current = which; (e.target as Element).setPointerCapture(e.pointerId) }} className="cursor-grab" />
  )
  return (
    <div className="mx-auto max-w-3xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub="Drag the hands, or use the buttons.">Set the clock to <span className="text-teal">{words(cur.h, cur.m)}</span></Prompt>
      <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <svg ref={face} viewBox="0 0 200 200" className="mx-auto w-full max-w-sm touch-none" onPointerMove={onMove} onPointerUp={() => (drag.current = null)} role="img" aria-label={`Clock showing ${words(h, m)}`}>
          <circle cx="100" cy="100" r="95" fill="#fff" stroke="#2b2350" strokeWidth="6" />
          {range(12).map((i) => <text key={i} x={100 + Math.sin(((i + 1) / 12) * Math.PI * 2) * 76} y={100 - Math.cos(((i + 1) / 12) * Math.PI * 2) * 76 + 8} textAnchor="middle" fontSize="22" fontWeight="bold" fill="#2b2350">{i + 1}</text>)}
          {hand((h % 12) / 12 + m / 720, 48, 10, '#2b2350', 'h')}
          {hand(m / 60, 70, 6, '#e0533d', 'm')}
          <circle cx="100" cy="100" r="7" fill="#2b2350" />
        </svg>
        <div className="grid gap-3">
          <p className="text-lg font-bold">Short hand (hour)</p>
          <div className="flex gap-2"><Button onClick={() => setH(h === 1 ? 12 : h - 1)}>−</Button><span className="grid w-16 place-items-center text-3xl font-bold">{h}</span><Button onClick={() => setH(h === 12 ? 1 : h + 1)}>+</Button></div>
          <p className="text-lg font-bold text-coral">Long hand (minutes)</p>
          <div className="flex gap-2"><Button onClick={() => setM((m + 55) % 60)}>−</Button><span className="grid w-16 place-items-center text-3xl font-bold">{String(m).padStart(2, '0')}</span><Button onClick={() => setM((m + 5) % 60)}>+</Button></div>
        </div>
      </div>
      <Button big className="mt-5" disabled={r.locked} onClick={() => r.answer(h === cur.h && m === cur.m)}>✓ That's the time</Button>
    </div>
  )
}

/* ======================= Put the shopping away (rule sorting) ======================= */
const SHOPPING: { e: string; name: string; to: 'fridge' | 'cupboard' | 'bowl' | 'freezer' }[] = [
  { e: '🥛', name: 'Milk', to: 'fridge' }, { e: '🧈', name: 'Butter', to: 'fridge' }, { e: '🧀', name: 'Cheese', to: 'fridge' }, { e: '🥚', name: 'Eggs', to: 'fridge' }, { e: '🐟', name: 'Fresh fish', to: 'fridge' }, { e: '🥬', name: 'Lettuce', to: 'fridge' },
  { e: '🥫', name: 'Tinned soup', to: 'cupboard' }, { e: '🍚', name: 'Rice', to: 'cupboard' }, { e: '🍝', name: 'Pasta', to: 'cupboard' }, { e: '🍪', name: 'Biscuits', to: 'cupboard' }, { e: '🍯', name: 'Honey', to: 'cupboard' }, { e: '🫘', name: 'Lentils', to: 'cupboard' },
  { e: '🍌', name: 'Bananas', to: 'bowl' }, { e: '🍎', name: 'Apples', to: 'bowl' }, { e: '🍊', name: 'Oranges', to: 'bowl' }, { e: '🥭', name: 'Mangoes', to: 'bowl' },
  { e: '🍦', name: 'Ice cream', to: 'freezer' }, { e: '🧊', name: 'Ice cubes', to: 'freezer' }, { e: '🫛', name: 'Frozen peas', to: 'freezer' },
]
const PLACES_TO = { fridge: { e: '🧊', name: 'Fridge', c: 'bg-[#e0f2fe]' }, freezer: { e: '❄️', name: 'Freezer', c: 'bg-[#c7d2fe]' }, cupboard: { e: '🗄️', name: 'Cupboard', c: 'bg-[#fde68a]' }, bowl: { e: '🥣', name: 'Fruit bowl', c: 'bg-[#dcfce7]' } } as const
export function PutAway(p: GameProps) {
  const dests = (p.level === 3 ? ['fridge', 'freezer', 'cupboard', 'bowl'] : ['fridge', 'cupboard', 'bowl']) as (keyof typeof PLACES_TO)[]
  const items = useMemo(() => shuffle(SHOPPING.filter((s) => dests.includes(s.to))).slice(0, [6, 8, 10][p.level - 1]), [p.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const [stored, setStored] = useState<Record<string, string[]>>({})
  const cur = items[i]
  const put = (d: string) => {
    if (!cur || flash) return
    const ok = d === cur.to
    p.cheer(ok ? 'good' : 'retry')
    setFlash(ok ? d : `x${d}`)
    const s = score + (ok ? 1 : 0)
    setScore(s)
    setStored({ ...stored, [cur.to]: [...(stored[cur.to] ?? []), cur.e] })
    setTimeout(() => { setFlash(null); if (i + 1 >= items.length) p.finish(s, items.length); else setI(i + 1) }, 900)
  }
  return (
    <div className="mx-auto max-w-4xl text-center">
      <RoundBar round={i} total={items.length} label="Item" />
      {cur && (
        <motion.div key={i} initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mx-auto mb-5 w-fit rounded-[32px] bg-white px-10 py-5 shadow-lg">
          <div className="text-8xl" aria-hidden>{cur.e}</div><p className="text-3xl font-bold">{cur.name}</p>
        </motion.div>
      )}
      <Prompt>Where does it go?</Prompt>
      <div className={`grid gap-4 ${dests.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        {dests.map((d) => (
          <button key={d} onClick={() => put(d)} className={`flex min-h-44 flex-col items-center justify-start gap-2 rounded-[32px] p-4 shadow-lg ${PLACES_TO[d].c} ${flash === d ? 'ring-8 ring-leaf' : flash === `x${d}` ? 'ring-8 ring-coral' : ''}`}>
            <span className="text-6xl" aria-hidden>{PLACES_TO[d].e}</span><span className="text-2xl font-bold">{PLACES_TO[d].name}</span>
            <span className="text-2xl" aria-hidden>{(stored[d] ?? []).join('')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
