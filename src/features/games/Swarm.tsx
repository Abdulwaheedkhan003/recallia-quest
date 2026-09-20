import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Heart, Minus, Play, Plus, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { speak } from '../../lib/speech'
import { useSettings } from '../../state/settings'
import { audioOn, setAudioOn } from './audio'
import { CATALOG, CATS, type Cat, type GameMeta } from './catalog'

/**
 * The activity library as a calm, living constellation.
 * 50 DOM nodes are positioned by one requestAnimationFrame loop that writes transforms
 * directly (no React re-render per frame); a single canvas draws the connecting lines.
 */

export interface GameStat { plays: number; best_level: number; last_played: number }
type Props = { stats: Record<string, GameStat>; returning?: string | null; onStart: (id: string, level: number) => void }

/* ---------- world layout ---------- */
const NODE = 132 // node size in world px at scale 1
const CLUSTER_AT: Record<Cat, [number, number]> = {
  memory: [-1080, -560], focus: [-360, -560], sound: [360, -560], music: [1080, -560],
  places: [-1080, 0], stories: [1080, 0],
  everyday: [-1080, 560], language: [-360, 560], creative: [360, 560], calm: [1080, 560],
}
const WORLD_W = 2860, WORLD_H = 1680
const catOf = (c: Cat) => CATS.find((x) => x.id === c)!

interface NodeState { g: GameMeta; i: number; k: number; cat: Cat; z: number; phase: number; x: number; y: number; s: number; o: number }

const FAV_KEY = 'rq:favGames'
const INTRO_KEY = 'rq:swarmIntro'
const readFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') } catch { return [] } }

/** Simple activity engine: unplayed first, then least-recently played families; stable for the day. */
function suggest(stats: Record<string, GameStat>, muted: boolean) {
  const day = Math.floor(Date.now() / 864e5)
  const lastByCat = new Map<Cat, number>()
  for (const g of CATALOG) lastByCat.set(g.cat, Math.max(lastByCat.get(g.cat) ?? 0, stats[g.id]?.last_played ?? 0))
  const ranked = CATALOG.filter((g) => !(muted && g.audio)).map((g, i) => ({
    g, score: (stats[g.id] ? 0 : 1e13) - (lastByCat.get(g.cat) ?? 0) - (stats[g.id]?.last_played ?? 0) / 10 + (((i * 7919 + day * 104729) % 1000) * 1e6),
  })).sort((a, b) => b.score - a.score)
  const out: GameMeta[] = []
  for (const r of ranked) if (!out.some((o) => o.cat === r.g.cat)) { out.push(r.g); if (out.length === 3) break }
  return out.map((g) => g.id)
}

export default function Swarm({ stats, returning, onStart }: Props) {
  const { t, lang, motionOK } = useSettings()
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const nodeEls = useRef<(HTMLButtonElement | null)[]>([])
  const labelEls = useRef<Record<string, HTMLButtonElement | null>>({})
  const hubEl = useRef<HTMLDivElement>(null)

  const [selected, setSelected] = useState<string | null>(null)
  const [focusCat, setFocusCat] = useState<Cat | null>(null)
  const [detail, setDetail] = useState(false)
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [muted, setMuted] = useState(!audioOn())
  const [level, setLevel] = useState(1)
  const [showHow, setShowHow] = useState(false)
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem(INTRO_KEY) } catch { return true } })

  const recommended = useMemo(() => suggest(stats, muted), [stats, muted])
  const now = Date.now()
  const stateOf = (id: string) => {
    const s = stats[id]
    return { isNew: !s, played: !!s, recent: !!s && now - s.last_played < 3 * 864e5, fav: favs.includes(id), rec: recommended.includes(id) }
  }

  /* ---------- static node data ---------- */
  const nodes = useMemo<NodeState[]>(() => {
    const perCat = new Map<Cat, number>()
    return CATALOG.map((g, i) => {
      const k = perCat.get(g.cat) ?? 0
      perCat.set(g.cat, k + 1)
      return { g, i, k, cat: g.cat, z: 0.88 + ((i * 37) % 25) / 100, phase: (i * 2.39) % (Math.PI * 2), x: 0, y: 0, s: 0.4, o: 1 }
    })
  }, [])
  const counts = useMemo(() => { const m = {} as Record<Cat, number>; for (const n of nodes) m[n.cat] = (m[n.cat] ?? 0) + 1; return m }, [nodes])
  const ringR = (c: Cat) => Math.max(130, (counts[c] * 170) / (Math.PI * 2))

  /* ---------- camera + input state (refs: no re-render per frame) ---------- */
  const cam = useRef({ x: 0, y: 0, s: 0.5, tx: 0, ty: 0, ts: 0.5, fit: 0.5 })
  const ptr = useRef({ x: -9999, y: -9999, nx: 0, ny: 0 })
  const vp = useRef({ w: 1000, h: 700 })
  const live = useRef({ selected, focusCat, motionOK, detail })
  live.current = { selected, focusCat, motionOK, detail }

  const fitView = useCallback((instant = false) => {
    const { w, h } = vp.current
    const fit = Math.min(w / WORLD_W, h / WORLD_H)
    const c = cam.current
    c.fit = fit
    c.tx = 0; c.ty = 0; c.ts = fit
    if (instant) { c.x = 0; c.y = 0; c.s = fit }
  }, [])

  useLayoutEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect()
      vp.current = { w: b.width, h: b.height }
      const cv = canvas.current!
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = b.width * dpr; cv.height = b.height * dpr
      cv.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!live.current.focusCat) fitView(cam.current.s === 0.5)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitView])

  // A game we just came back from starts in the centre, large, and floats home.
  useEffect(() => {
    if (!returning) return
    const n = nodes.find((x) => x.g.id === returning)
    if (n) { n.x = 0; n.y = 0; n.s = 1.8; n.o = 1; (n as NodeState & { fromCenter?: boolean }).fromCenter = true }
  }, [returning, nodes])

  /* ---------- the animation loop ---------- */
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const ctx = () => canvas.current?.getContext('2d')
    const frame = (tm: number) => {
      const time = (tm - t0) / 1000
      const { selected: sel, focusCat: fc, motionOK: mo } = live.current
      const c = cam.current
      const { w, h } = vp.current
      const ease = mo ? 0.08 : 1
      c.x += (c.tx - c.x) * ease; c.y += (c.ty - c.y) * ease; c.s += (c.ts - c.s) * ease
      const wantDetail = c.s > 0.7
      if (wantDetail !== live.current.detail) setDetail(wantDetail)
      const toScreen = (wx: number, wy: number): [number, number] => [w / 2 + (wx - c.x) * c.s, h / 2 + (wy - c.y) * c.s]
      const minS = wantDetail ? 0 : 0.47 // orbs stay at least ~60px on screen
      const centre: [number, number] = [w / 2, Math.min(h * 0.34, h / 2 - 60)]
      const g = ctx()
      if (g) g.clearRect(0, 0, w, h)

      // constellation lines between clusters
      if (g) {
        g.setLineDash([6, 10]); g.lineWidth = 2; g.strokeStyle = 'rgba(80,70,140,0.16)'
        const order: Cat[] = ['memory', 'focus', 'sound', 'music', 'stories', 'calm', 'creative', 'language', 'everyday', 'places', 'memory']
        g.beginPath()
        order.forEach((cc, i) => { const [sx, sy] = toScreen(...CLUSTER_AT[cc]); if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy) })
        g.stroke(); g.setLineDash([])
      }

      for (const n of nodes) {
        const [cx, cy] = CLUSTER_AT[n.cat]
        const expand = fc === n.cat ? 1.18 : 1
        const R = ringR(n.cat) * expand
        const base = (n.k / counts[n.cat]) * Math.PI * 2 - Math.PI / 2
        const ang = base + (mo ? time * 0.018 * (n.cat.length % 2 ? 1 : -1) : 0)
        const bob = mo ? Math.sin(time * 0.45 + n.phase) * 7 : 0
        const [ccx, ccy] = toScreen(cx, cy)
        // on the overview, keep orbs clear of the group's name tag
        const Rs = Math.max(R * c.s, wantDetail ? 0 : 92 + counts[n.cat] * 3)
        let sx = ccx + Math.cos(ang) * Rs, sy = ccy + Math.sin(ang) * Rs * (wantDetail ? 0.9 : 0.74) + bob * c.s
        let s = n.z * Math.max(c.s, minS)
        let o = fc && fc !== n.cat ? 0.4 : 1
        if (mo) {
          // gentle parallax by depth and a little magnetic pull towards the pointer
          sx += ptr.current.nx * (n.z - 1) * 60; sy += ptr.current.ny * (n.z - 1) * 60
          const dx = ptr.current.x - sx, dy = ptr.current.y - sy, d = Math.hypot(dx, dy)
          if (d < 130 && !sel) { const f = (1 - d / 130); sx += (dx / (d || 1)) * f * 12; sy += (dy / (d || 1)) * f * 12; s *= 1 + f * 0.07 }
        }
        if (sel) {
          if (n.g.id === sel) { sx = centre[0]; sy = centre[1]; s = Math.min(1.9, Math.max(1.3, Math.min(w, h) / 420)); o = 1 }
          else {
            const dx = sx - centre[0], dy = sy - centre[1], d = Math.hypot(dx, dy) || 1
            const push = Math.max(0, 300 - d)
            sx += (dx / d) * push * 0.9; sy += (dy / d) * push * 0.9
            o = 0.35
          }
        }
        // ease towards the target (the "return to swarm" and "come forward" motion)
        const k = mo ? 0.09 : 1
        const fresh = (n as NodeState & { fromCenter?: boolean }).fromCenter
        if (fresh) { n.x = centre[0]; n.y = centre[1]; delete (n as NodeState & { fromCenter?: boolean }).fromCenter }
        n.x += (sx - n.x) * k; n.y += (sy - n.y) * k; n.s += (s - n.s) * k; n.o += (o - n.o) * k
        const el = nodeEls.current[n.i]
        if (el) {
          el.style.transform = `translate3d(${n.x - NODE / 2}px, ${n.y - NODE / 2}px, 0) scale(${n.s})`
          el.style.opacity = String(n.o)
          el.style.zIndex = n.g.id === sel ? '60' : String(10 + Math.round(n.z * 10))
        }
        if (g && n.o > 0.5 && n.g.id !== sel) {
          const [lx, ly] = toScreen(cx, cy)
          g.strokeStyle = catOf(n.cat).color + '33'; g.lineWidth = 2
          g.beginPath(); g.moveTo(lx, ly); g.lineTo(n.x, n.y); g.stroke()
        }
      }
      // category labels and the centre hub stay readable at any zoom
      for (const cc of CATS) {
        const el = labelEls.current[cc.id]
        if (!el) continue
        const [lx, ly] = toScreen(...CLUSTER_AT[cc.id])
        const ls = Math.max(0.8, Math.min(1.2, c.s * 1.4))
        el.style.transform = `translate3d(${lx}px, ${ly}px, 0) translate(-50%, -50%) scale(${ls})`
        el.style.opacity = sel ? '0.25' : fc && fc !== cc.id ? '0.5' : '1'
      }
      if (hubEl.current) {
        const [hx, hy] = toScreen(0, 0)
        hubEl.current.style.transform = `translate3d(${hx}px, ${hy}px, 0) translate(-50%, -50%) scale(${Math.max(0.75, Math.min(1.1, c.s * 1.5))})`
        hubEl.current.style.opacity = sel ? '0' : '1'
        hubEl.current.style.pointerEvents = sel ? 'none' : 'auto'
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [nodes, counts]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- pan / pinch / wheel ---------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ moved: number; pinch?: number; startS?: number }>({ moved: 0 })
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current.moved = 0
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); gesture.current.startS = cam.current.ts
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const b = wrap.current!.getBoundingClientRect()
    ptr.current = { x: e.clientX - b.left, y: e.clientY - b.top, nx: (e.clientX - b.left) / b.width * 2 - 1, ny: (e.clientY - b.top) / b.height * 2 - 1 }
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const c = cam.current
    if (pointers.current.size === 2 && gesture.current.pinch) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const [a, bb] = [...pointers.current.values()]
      const d = Math.hypot(a.x - bb.x, a.y - bb.y)
      c.ts = c.s = clampS(gesture.current.startS! * (d / gesture.current.pinch), c.fit)
      gesture.current.moved = 99
      return
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y
    gesture.current.moved += Math.abs(dx) + Math.abs(dy)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (gesture.current.moved > 8 && !live.current.selected) {
      c.tx = c.x = c.x - dx / c.s
      c.ty = c.y = c.y - dy / c.s
    }
  }
  const onPointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) gesture.current.pinch = undefined }
  useEffect(() => {
    const el = wrap.current!
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = cam.current
      c.ts = clampS(c.ts * (e.deltaY < 0 ? 1.12 : 1 / 1.12), c.fit)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const zoom = (f: number) => { const c = cam.current; c.ts = clampS(c.ts * f, c.fit) }

  /* ---------- actions ---------- */
  const focusOn = (cat: Cat | null) => {
    setSelected(null)
    setFocusCat(cat)
    if (!cat) return fitView()
    const [x, y] = CLUSTER_AT[cat]
    const { w, h } = vp.current
    const c = cam.current
    c.tx = x; c.ty = y
    c.ts = Math.min(1.25, Math.min(w, h) / (2 * (ringR(cat) * 1.18 + NODE)))
  }
  const choose = (id: string) => {
    if (gesture.current.moved > 8) return
    const g = CATALOG.find((x) => x.id === id)!
    setSelected(id); setShowHow(false)
    setLevel(Math.min(3, Math.max(1, stats[id]?.best_level ?? g.diff)))
  }
  const close = () => setSelected(null)
  const toggleFav = (id: string) => {
    const f = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
    setFavs(f)
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)) } catch { /* private mode */ }
  }
  const dismissIntro = () => { setIntro(false); try { localStorage.setItem(INTRO_KEY, '1') } catch { /* ignore */ } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (selected) close(); else if (focusCat) focusOn(null) } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  const sel = selected ? CATALOG.find((g) => g.id === selected)! : null
  const titleOf = (g: GameMeta) => (g.titleKey ? t(g.titleKey) : g.title)
  const howOf = (g: GameMeta) => (g.howKey ? t(g.howKey) : g.how)

  return (
    <div className="relative">
      <div ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => (ptr.current = { x: -9999, y: -9999, nx: 0, ny: 0 })}
        className="relative h-[calc(100vh-190px)] min-h-[520px] touch-none select-none overflow-hidden rounded-[40px] bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#eaf4ff_45%,#d7e6fb_100%)] shadow-inner"
        role="application" aria-label="Your activities. Tap an activity, or use the category buttons below.">
        {/* soft depth layers */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#ffe9c7aa,transparent_40%),radial-gradient(circle_at_80%_75%,#d9f7e4aa,transparent_45%)]" />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

        {/* centre hub: today's suggestions */}
        <div ref={hubEl} className="absolute left-0 top-0 z-30 w-[330px] rounded-[32px] bg-white/90 p-4 text-center shadow-xl ring-4 ring-amber/40 backdrop-blur">
          <p className="text-lg font-bold">✨ Suggested for you</p>
          <div className="mt-2 flex justify-center gap-2">
            {recommended.map((id) => { const g = CATALOG.find((x) => x.id === id)!; return (
              <button key={id} onClick={() => choose(id)} className="flex w-24 flex-col items-center rounded-2xl bg-amber/15 p-2 hover:bg-amber/30" aria-label={`Suggested: ${titleOf(g)}`}>
                <span className="text-4xl" aria-hidden>{g.emoji}</span><span className="text-sm font-bold leading-tight">{titleOf(g)}</span>
              </button>) })}
          </div>
        </div>

        {/* cluster labels */}
        {CATS.map((c) => (
          <button key={c.id} ref={(el) => { labelEls.current[c.id] = el }} onClick={() => (gesture.current.moved > 8 ? null : focusOn(focusCat === c.id ? null : c.id))}
            className="absolute left-0 top-0 z-40 flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-xl font-bold text-white shadow-lg"
            style={{ background: c.color }} aria-pressed={focusCat === c.id} aria-label={`${c.name} activities`}>
            <span aria-hidden>{c.e}</span>{c.name}
          </button>
        ))}

        {/* activity nodes */}
        {nodes.map((n) => {
          const st = stateOf(n.g.id)
          const cc = catOf(n.cat)
          const isSel = selected === n.g.id
          const full = detail || isSel
          return (
            <button key={n.g.id} ref={(el) => { nodeEls.current[n.i] = el }} onClick={() => (isSel ? null : choose(n.g.id))}
              aria-label={`${titleOf(n.g)}. ${cc.name}. ${st.isNew ? 'New.' : 'Played.'}${st.fav ? ' Favourite.' : ''}${st.rec ? ' Suggested.' : ''}`}
              aria-pressed={isSel}
              className="group absolute left-0 top-0 origin-center will-change-transform focus-visible:outline-none"
              style={{ width: NODE, height: NODE }}>
              <div className={`relative flex size-full flex-col items-center justify-center rounded-[34px] text-center ${st.played ? 'bg-[#f3fbf5]' : 'bg-white'} transition-[border-radius,box-shadow] duration-500 group-focus-visible:ring-8 group-focus-visible:ring-ink ${full ? '' : '!rounded-full'} ${isSel ? 'ring-8 ring-amber' : st.rec ? 'ring-4 ring-amber/80' : st.recent ? 'ring-4' : ''}`}
                style={{ border: full ? undefined : `5px solid ${cc.color}`, boxShadow: `0 ${10 * n.z}px ${24 * n.z}px -8px rgba(40,30,90,${0.25 * n.z})`, ...(st.recent && !st.rec && !isSel ? { ['--tw-ring-color' as string]: cc.color + '88' } : {}) }}>
                {st.rec && motionOK && <span aria-hidden className="absolute -inset-2 animate-[pulse_4s_ease-in-out_infinite] rounded-[inherit] ring-2 ring-amber/50" />}
                <span className={full ? 'text-5xl' : 'text-6xl'} aria-hidden style={{ filter: st.played || st.isNew ? undefined : undefined }}>{n.g.emoji}</span>
                {full && (
                  <>
                    <span className="mt-1 line-clamp-2 px-2 text-[15px] font-bold leading-tight">{titleOf(n.g)}</span>
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: cc.color }}>
                      <span className="inline-block size-2 rounded-full" style={{ background: cc.color }} />{cc.name}
                      <span className="ml-1 tracking-tighter text-ink/60" aria-hidden>{'●'.repeat(n.g.diff)}{'○'.repeat(3 - n.g.diff)}</span>
                    </span>
                  </>
                )}
                {st.isNew && <span aria-hidden title="New" className="absolute right-3 top-3 size-3 rounded-full bg-lavender shadow-[0_0_0_4px_#ede9fe]" />}
                {st.played && full && <span aria-hidden className="absolute bottom-2 right-2 text-sm font-bold text-leaf">✓</span>}
                {st.fav && <span aria-hidden className="absolute -left-1 -top-1 text-xl">❤️</span>}
              </div>
              {!full && <span aria-hidden className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-sm font-bold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{titleOf(n.g)}</span>}
            </button>
          )
        })}

        {/* dim backdrop behind the selected activity */}
        {sel && <button aria-label="Close" onClick={close} className="absolute inset-0 z-[55] bg-[#1e1b4b]/25 backdrop-blur-[1px]" />}

        {/* PLAY panel */}
        <AnimatePresence>
          {sel && (
            <motion.div key={sel.id} role="dialog" aria-label={titleOf(sel)} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="absolute inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-[32px] bg-white p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-wide" style={{ color: catOf(sel.cat).color }}>{catOf(sel.cat).e} {catOf(sel.cat).name}{stats[sel.id] ? ` · played ${stats[sel.id].plays}×` : ' · new'}</p>
                  <h2 className="text-3xl font-bold">{titleOf(sel)}</h2>
                </div>
                <button onClick={() => toggleFav(sel.id)} aria-pressed={favs.includes(sel.id)} aria-label="Favourite" className="grid size-14 place-items-center rounded-full bg-cream"><Heart className={favs.includes(sel.id) ? 'fill-coral text-coral' : ''} /></button>
                <button onClick={close} aria-label="Close" className="grid size-14 place-items-center rounded-full bg-cream"><X /></button>
              </div>
              {showHow && <p className="mt-2 rounded-2xl bg-cream p-3 text-xl">{howOf(sel)}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-lg font-bold">Difficulty:</span>
                {[1, 2, 3].map((l) => (
                  <button key={l} onClick={() => setLevel(l)} aria-pressed={level === l} className={`min-h-12 rounded-full px-4 text-lg font-bold ${level === l ? 'bg-ink text-white' : 'bg-cream'}`}>
                    {'★'.repeat(l)} {t(l === 1 ? 'games.gentle' : l === 2 ? 'games.medium' : 'games.bigger')}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                <Button big onClick={() => onStart(sel.id, level)}><Play aria-hidden /> Start</Button>
                <Button variant="secondary" onClick={() => { setShowHow(true); speak(howOf(sel), lang).catch(() => {}) }}><BookOpen aria-hidden /> Instructions</Button>
                <Button variant="secondary" aria-pressed={!muted} onClick={() => { setAudioOn(muted); setMuted(!muted) }}>{muted ? <><VolumeX aria-hidden /> Sound off</> : <><Volume2 aria-hidden /> Sound on</>}</Button>
              </div>
              {sel.audio && muted && <p className="mt-2 text-lg font-bold text-coral">This activity needs sound. Tap “Sound off” to turn it on.</p>}
              {sel.voice && <p className="mt-2 text-base text-ink-soft">🎙️ Uses the microphone if you allow it — you can always tap instead.</p>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* first-time introduction */}
        <AnimatePresence>
          {intro && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[80] grid place-items-center bg-[#1e1b4b]/30 p-4">
              <div className="max-w-md rounded-[36px] bg-white p-7 text-center shadow-2xl">
                <div className="text-6xl" aria-hidden>🌌</div>
                <h2 className="mt-2 text-3xl font-bold">These are your activities.</h2>
                <p className="mt-2 text-2xl">Tap any one to begin.</p>
                <p className="mt-3 text-lg text-ink-soft">Tap a coloured name to see that group up close. You can drag to look around, but you never have to.</p>
                <Button big className="mt-5 w-full" onClick={dismissIntro}>OK, show me</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* always-visible category bar: the simple way in */}
      <nav aria-label="Activity groups" className="mt-3 flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => focusOn(null)} aria-pressed={!focusCat} className={`min-h-14 shrink-0 rounded-full px-5 text-lg font-bold shadow ${!focusCat ? 'bg-ink text-white' : 'bg-white'}`}>🌌 All 50</button>
        {CATS.map((c) => (
          <button key={c.id} onClick={() => focusOn(focusCat === c.id ? null : c.id)} aria-pressed={focusCat === c.id}
            className="min-h-14 shrink-0 rounded-full px-5 text-lg font-bold shadow" style={focusCat === c.id ? { background: c.color, color: '#fff' } : { background: '#fff', color: c.color }}>
            {c.e} {c.name} <span className="opacity-70">{counts[c.id]}</span>
          </button>
        ))}
        <span className="ml-auto flex shrink-0 gap-2">
          <button onClick={() => zoom(1.25)} aria-label="Zoom in" className="grid size-14 place-items-center rounded-full bg-white shadow"><Plus /></button>
          <button onClick={() => zoom(0.8)} aria-label="Zoom out" className="grid size-14 place-items-center rounded-full bg-white shadow"><Minus /></button>
        </span>
      </nav>
    </div>
  )
}

function clampS(s: number, fit: number) {
  return Math.max(fit * 0.8, Math.min(1.8, s))
}
