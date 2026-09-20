import { motion } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../components/ui'
import { speak, useSpeechInput } from '../../../lib/speech'
import { useSettings } from '../../../state/settings'
import { pick, shuffle } from '../data'
import type { GameProps } from '../GameFrame'
import { Choice, Prompt, RoundBar, useRounds } from '../kit'

/* ======================= Finish the saying ======================= */
const SAYINGS: [string, string, string[]][] = [
  ['An apple a day keeps the ___ away', 'doctor', ['teacher', 'rain', 'cat']],
  ['The early bird catches the ___', 'worm', ['bus', 'fish', 'cold']],
  ['Every cloud has a silver ___', 'lining', ['spoon', 'coin', 'bell']],
  ['Actions speak louder than ___', 'words', ['drums', 'birds', 'bells']],
  ['Better late than ___', 'never', ['early', 'sorry', 'tired']],
  ['Home is where the ___ is', 'heart', ['kitchen', 'garden', 'door']],
  ['Too many cooks spoil the ___', 'broth', ['bread', 'party', 'tea']],
  ['A friend in need is a friend ___', 'indeed', ['in town', 'at home', 'forever']],
  ['Where there is a will, there is a ___', 'way', ['wall', 'wish', 'well']],
  ['Look before you ___', 'leap', ['sleep', 'eat', 'speak']],
  ['Slow and steady wins the ___', 'race', ['prize', 'day', 'game']],
  ['Practice makes ___', 'perfect', ['progress', 'noise', 'friends']],
  ['Birds of a feather flock ___', 'together', ['south', 'home', 'away']],
  ['Laughter is the best ___', 'medicine', ['music', 'answer', 'friend']],
  ["Don't count your chickens before they ___", 'hatch', ['sleep', 'run', 'eat']],
  ['Rome was not built in a ___', 'day', ['year', 'hurry', 'town']],
]
export function FinishSaying(p: GameProps) {
  const total = 5
  const r = useRounds(total, p)
  const n = [3, 4, 4][p.level - 1]
  const rounds = useMemo(() => pick(SAYINGS, total).map(([s, a, wrong]) => ({ s, a, opts: shuffle([a, ...wrong.slice(0, n - 1)]) })), [n])
  const cur = rounds[r.round]
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => setPicked(null), [r.round])
  return (
    <div className="mx-auto max-w-2xl">
      <RoundBar round={r.round} total={total} />
      <div className="mb-6 rounded-[32px] bg-white p-6 text-center text-3xl font-bold leading-snug shadow-lg">
        “{cur.s.replace('___', r.locked ? cur.a : '______')}”
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cur.opts.map((o) => <Choice key={o} disabled={r.locked} state={picked === o ? (o === cur.a ? 'right' : 'wrong') : r.locked && o === cur.a ? 'right' : null} onClick={() => { setPicked(o); r.answer(o === cur.a) }}>{o}</Choice>)}
      </div>
    </div>
  )
}

/* ======================= Word builder (spelling) ======================= */
const WORDS: [string, string][] = [
  ['🐱', 'CAT'], ['🐶', 'DOG'], ['☀️', 'SUN'], ['🍵', 'TEA'], ['🚌', 'BUS'], ['🔑', 'KEY'], ['🥚', 'EGG'], ['🐟', 'FISH'],
  ['🌳', 'TREE'], ['🍞', 'BREAD'], ['🏠', 'HOUSE'], ['🍎', 'APPLE'], ['📖', 'BOOK'], ['🌙', 'MOON'], ['🛏️', 'BED'], ['🌹', 'ROSE'],
  ['🦆', 'DUCK'], ['🧦', 'SOCK'], ['🍋', 'LEMON'], ['🪑', 'CHAIR'], ['⭐', 'STAR'], ['🚗', 'CAR'], ['🥛', 'MILK'], ['🧀', 'CHEESE'],
]
export function SpellWord(p: GameProps) {
  const total = 4
  const r = useRounds(total, p, 1400)
  const pool = WORDS.filter(([, w]) => (p.level === 1 ? w.length === 3 : p.level === 2 ? w.length === 4 : w.length >= 5))
  const rounds = useMemo(() => pick(pool, total).map(([e, w]) => {
    const extra = p.level === 1 ? '' : pick('BDGLMNPRST'.split('').filter((c) => !w.includes(c)), p.level - 1).join('')
    return { e, w, tiles: shuffle((w + extra).split('').map((c, i) => ({ c, i }))) }
  }), [p.level]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rounds[r.round]
  const [used, setUsed] = useState<number[]>([])
  const [wrong, setWrong] = useState(0)
  useEffect(() => { setUsed([]); setWrong(0) }, [r.round])
  const typed = used.map((i) => cur.tiles[i].c).join('')
  const tap = (k: number) => {
    const c = cur.tiles[k].c
    if (c !== cur.w[typed.length]) { setWrong((x) => x + 1); p.cheer('retry'); if (wrong + 1 >= 3) r.answer(false); return }
    const u = [...used, k]
    setUsed(u)
    if (u.length === cur.w.length) r.answer(true)
  }
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <div className="text-8xl" aria-hidden>{cur.e}</div>
      <div className="my-5 flex justify-center gap-2" aria-label={`Spelled so far: ${typed || 'nothing'}`}>
        {cur.w.split('').map((_, i) => <div key={i} className={`grid size-16 place-items-center rounded-2xl text-4xl font-bold ${typed[i] ? 'bg-leaf/30' : 'border-4 border-dashed border-ink/25 bg-white/60'}`}>{typed[i] ?? (r.locked ? cur.w[i] : '')}</div>)}
      </div>
      <p className="mb-3 text-lg text-ink-soft">First letter hint: <b>{cur.w[0]}</b></p>
      <div className="flex flex-wrap justify-center gap-3">
        {cur.tiles.map((t, k) => (
          <motion.button key={k} whileTap={{ scale: 0.9 }} disabled={used.includes(k) || r.locked} onClick={() => tap(k)}
            className="grid size-20 place-items-center rounded-2xl bg-white text-4xl font-bold shadow-lg disabled:opacity-25">{t.c}</motion.button>
        ))}
      </div>
    </div>
  )
}

/* ======================= Word groups (semantic sorting) ======================= */
const GROUPS: Record<string, string[]> = {
  'Fruits 🍎': ['Apple', 'Banana', 'Mango', 'Orange', 'Grapes', 'Pear', 'Cherry', 'Plum'],
  'Animals 🐾': ['Horse', 'Cow', 'Rabbit', 'Tiger', 'Sheep', 'Goat', 'Elephant', 'Donkey'],
  'Clothes 👕': ['Shirt', 'Scarf', 'Sock', 'Coat', 'Saree', 'Hat', 'Jumper', 'Skirt'],
  'Kitchen things 🍳': ['Pan', 'Kettle', 'Spoon', 'Plate', 'Bowl', 'Ladle', 'Cup', 'Knife'],
  'Colours 🎨': ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Pink', 'Brown', 'White'],
  'Weather ⛅': ['Rain', 'Snow', 'Sunshine', 'Wind', 'Fog', 'Storm', 'Thunder', 'Hail'],
}
export function WordGroups(p: GameProps) {
  const total = 3
  const r = useRounds(total, p, 1500)
  const k = [2, 3, 4][p.level - 1]
  const cats = Object.keys(GROUPS)
  const rounds = useMemo(() => pick(cats, total).map((c) => {
    const right = pick(GROUPS[c], k + 1)
    const wrong = pick(cats.filter((x) => x !== c).flatMap((x) => GROUPS[x]), 2 + k)
    return { c, right, words: shuffle([...right, ...wrong]) }
  }), [k]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rounds[r.round]
  const [sel, setSel] = useState<Set<string>>(new Set())
  useEffect(() => setSel(new Set()), [r.round])
  const toggle = (w: string) => { const s = new Set(sel); if (s.has(w)) s.delete(w); else s.add(w); setSel(s) }
  const check = () => {
    const hits = cur.right.filter((w) => sel.has(w)).length
    const bad = [...sel].filter((w) => !cur.right.includes(w)).length
    r.answer(hits === cur.right.length && bad === 0)
  }
  return (
    <div className="mx-auto max-w-3xl">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={`There are ${cur.right.length} to find.`}>Tap all the <span className="text-teal">{cur.c}</span></Prompt>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cur.words.map((w) => {
          const on = sel.has(w)
          const st = r.locked ? (cur.right.includes(w) ? 'right' : on ? 'wrong' : null) : on ? 'picked' : null
          return <Choice key={w} disabled={r.locked} state={st} onClick={() => toggle(w)} className="min-h-20">{w}</Choice>
        })}
      </div>
      <div className="mt-5 flex justify-center"><Button big disabled={!sel.size || r.locked} onClick={check}>✓ Check</Button></div>
    </div>
  )
}

/* ======================= Voice helpers ======================= */
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
/** Word-level similarity 0…1. */
function similarity(said: string, want: string) {
  const a = norm(said).split(' '), b = norm(want).split(' ')
  const hits = b.filter((w) => a.includes(w)).length
  return hits / b.length
}

function MicButton({ stt }: { stt: ReturnType<typeof useSpeechInput> }) {
  if (!stt.supported) return <p className="rounded-2xl bg-white/80 p-3 text-center text-lg">🎙️ Voice answers need Chrome or Edge. You can tap your answer instead.</p>
  return (
    <div className="flex flex-col items-center gap-2">
      <Button big onClick={stt.listening ? stt.stop : stt.start} className={stt.listening ? 'animate-pulse' : ''}>
        {stt.listening ? <><MicOff aria-hidden /> I'm done</> : <><Mic aria-hidden /> Tap and speak</>}
      </Button>
      {stt.interim && <p className="text-xl italic">“{stt.interim}”</p>}
      {stt.error === 'permission' && <p className="text-lg text-coral">Please allow the microphone in the browser, or tap your answer.</p>}
      {stt.error === 'no-speech' && <p className="text-lg">I didn't hear anything — try again a little louder.</p>}
    </div>
  )
}

/* ======================= Say the picture (speech recognition naming) ======================= */
const NAMEABLE: [string, string, string[]][] = [
  ['🍌', 'banana', []], ['🐘', 'elephant', []], ['☂️', 'umbrella', []], ['🚲', 'bicycle', ['bike', 'cycle']], ['🕯️', 'candle', []],
  ['🎈', 'balloon', []], ['🥕', 'carrot', []], ['🦋', 'butterfly', []], ['🧤', 'gloves', ['glove']], ['🪴', 'plant', ['pot plant', 'flower pot']],
  ['⌚', 'watch', ['wristwatch']], ['🍕', 'pizza', []], ['🐓', 'chicken', ['rooster', 'hen', 'cock']], ['🥭', 'mango', []], ['🚂', 'train', ['engine']],
  ['🎩', 'hat', ['top hat']], ['🌽', 'corn', ['sweetcorn', 'maize']], ['🐢', 'tortoise', ['turtle']], ['🧹', 'broom', ['brush']], ['🍉', 'watermelon', ['melon']],
]
export function SayPicture(p: GameProps) {
  const { lang } = useSettings()
  const total = 5
  const r = useRounds(total, p, 1400)
  const rounds = useMemo(() => pick(NAMEABLE, total).map(([e, w, alt]) => ({ e, w, alt, opts: shuffle([w, ...pick(NAMEABLE.filter((x) => x[1] !== w).map((x) => x[1]), [1, 2, 3][p.level - 1])]) })), [p.level])
  const cur = rounds[r.round]
  const [heard, setHeard] = useState('')
  const [hint, setHint] = useState(false)
  useEffect(() => { setHeard(''); setHint(false) }, [r.round])
  const stt = useSpeechInput(lang, (text) => {
    setHeard(text)
    const n = norm(text)
    const ok = [cur.w, ...cur.alt].some((w) => n.includes(w))
    if (ok) r.answer(true, 1)
    else p.cheer('retry')
  })
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt>What is this called?</Prompt>
      <motion.div className="text-9xl" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }} aria-hidden>{cur.e}</motion.div>
      <div className="my-5"><MicButton stt={stt} /></div>
      {heard && <p className="mb-3 text-xl">I heard: <b>“{heard}”</b></p>}
      {hint && <p className="mb-3 text-xl">It starts with <b>{cur.w[0].toUpperCase()}</b> and has {cur.w.length} letters.</p>}
      <div className="flex flex-wrap justify-center gap-3">
        {!hint && <Button variant="secondary" onClick={() => setHint(true)}>💡 A little hint</Button>}
      </div>
      <p className="mt-6 text-lg text-ink-soft">Or tap the answer:</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {cur.opts.map((o) => <Choice key={o} disabled={r.locked} state={r.locked && o === cur.w ? 'right' : null} onClick={() => r.answer(o === cur.w)} className="min-h-16 capitalize">{o}</Choice>)}
      </div>
      {r.locked && <p className="mt-3 text-2xl font-bold capitalize">{cur.w}</p>}
    </div>
  )
}

/* ======================= Say it back (listen, then repeat by voice) ======================= */
const SENTENCES = [
  ['Good morning, how are you?', 'The sun is shining today.', 'I like a cup of tea.', 'The cat is sleeping.', 'My shoes are by the door.'],
  ['The garden is full of roses.', 'We will have rice and dal for lunch.', 'My grandson plays the guitar.', 'The bus comes at nine o’clock.', 'Please pass me the newspaper.'],
  ['On Sunday we walked along the river to the market.', 'The postman brought a letter from my sister.', 'Remember to take the umbrella if it looks like rain.', 'The old radio still plays my favourite songs.', 'We planted tomatoes and beans behind the house.'],
]
export function VoiceEcho(p: GameProps) {
  const { lang } = useSettings()
  const total = 4
  const r = useRounds(total, p, 1800)
  const rounds = useMemo(() => pick(SENTENCES[p.level - 1], total), [p.level])
  const cur = rounds[r.round]
  const [shown, setShown] = useState(true)
  const [heard, setHeard] = useState('')
  const [score, setScore] = useState<number | null>(null)
  useEffect(() => { setHeard(''); setScore(null); setShown(p.level === 1) }, [r.round, p.level])
  const listen = () => speak(cur, lang, 0.85).catch(() => setShown(true))
  const stt = useSpeechInput(lang, (text) => {
    setHeard(text)
    const s = similarity(text, cur)
    setScore(s)
    if (s >= 0.6) r.answer(true)
    else p.cheer('retry')
  })
  return (
    <div className="mx-auto max-w-2xl text-center">
      <RoundBar round={r.round} total={total} />
      <Prompt sub={p.level === 1 ? 'Read it or listen, then say it back.' : 'Listen first. You can peek if you need to.'}>Say it back to me</Prompt>
      <div className="mb-4 flex flex-wrap justify-center gap-3">
        <Button big variant="secondary" onClick={listen}>🔊 Hear the sentence</Button>
        {!shown && <Button variant="secondary" onClick={() => setShown(true)}>👀 Peek</Button>}
      </div>
      {shown && <p className="mb-4 rounded-[28px] bg-white p-5 text-2xl font-bold shadow">“{cur}”</p>}
      <MicButton stt={stt} />
      {heard && <p className="mt-4 text-xl">I heard: “{heard}” {score !== null && <b>({Math.round(score * 100)}% of the words)</b>}</p>}
      {!stt.supported && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Choice disabled={r.locked} onClick={() => r.answer(true)}>🗣️ I said it</Choice>
          <Choice disabled={r.locked} onClick={() => r.answer(false)}>⏭️ Skip</Choice>
        </div>
      )}
      {stt.supported && !r.locked && <Button variant="secondary" className="mt-4" onClick={() => r.answer(false)}>⏭️ Skip this one</Button>}
    </div>
  )
}
