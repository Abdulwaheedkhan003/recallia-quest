import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  ArrowDown, ArrowUp, Eye, Map as MapIcon, Maximize, Minimize, Moon, Navigation, RotateCcw, RotateCw, Sparkles, Sun, Volume2, VolumeX, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Button } from '../../../components/ui'
import { speak, stopSpeaking } from '../../../lib/speech'
import { useSettings, type TKey } from '../../../state/settings'
import { ObjectPanel } from '../HomeSim'
import { ROOMS, type SimObject } from '../rooms'
import House from './House'
import { canMove, OPENINGS, PLAN, roomAt, route } from './plan'
import { PRINCIPLE_ICON, PRINCIPLE_OF } from './principles'
import { Decor, GardenDecor, OBJECTS3D } from './props'

/**
 * First-person walk-through of a dementia-friendly home (Three.js).
 * Walk room to room, tap glowing spots to learn why each thing helps, flip between
 * the dementia-friendly and the common version, and do real routine actions.
 */

const EYE = 1.6
const TOUR = ['hallway', 'bedroom', 'bathroom', 'toilet', 'kitchen', 'dining', 'living', 'study', 'medicine', 'entrance', 'laundry', 'garden']
const roomOfObj = (id: string) => ROOMS.find((r) => r.objects.some((o) => o.id === id))!.id
const objById = (id: string) => ROOMS.flatMap((r) => r.objects).find((o) => o.id === id)!

interface Nav {
  goTo: (room: string) => void
  lookAt: (p: [number, number, number]) => void
  hold: (dir: 'fwd' | 'back' | 'left' | 'right' | null) => void
  walkTo: (x: number, z: number) => void
}

/* ---------------- first-person controller ---------------- */
function Walker({ nav, onRoom, marker, active }: { nav: React.MutableRefObject<Nav | null>; onRoom: (r: string) => void; marker: React.RefObject<SVGGElement | null>; active: boolean }) {
  const { camera, gl } = useThree()
  const { motionOK } = useSettings()
  const st = useRef({ x: PLAN.hallway.spawn[0], z: PLAN.hallway.spawn[1], yaw: PLAN.hallway.spawn[2], pitch: -0.05, path: [] as [number, number][], finalYaw: null as number | null, look: null as { yaw: number; pitch: number } | null, hold: null as string | null, keys: new Set<string>(), room: '' })

  useEffect(() => {
    nav.current = {
      walkTo: (x, z) => {
        const s = st.current
        const to = roomAt(x, z)
        const from = roomAt(s.x, s.z)
        if (!to || !from) return
        const pts = [...route(from, to), [x, z] as [number, number]]
        if (!motionOK) { s.x = x; s.z = z; s.path = []; return }
        s.path = pts
        s.look = null
      },
      goTo: (room) => {
        const [x, z, yaw] = PLAN[room].spawn
        nav.current!.walkTo(x, z)
        st.current.finalYaw = yaw
        if (!motionOK) { st.current.yaw = yaw; st.current.finalYaw = null }
      },
      lookAt: ([x, y, z]) => {
        const s = st.current
        const dx = x - s.x, dz = z - s.z
        const yaw = Math.atan2(-dx, -dz)
        const pitch = Math.atan2(y - EYE, Math.hypot(dx, dz))
        if (!motionOK) { s.yaw = yaw; s.pitch = pitch } else s.look = { yaw, pitch }
      },
      hold: (dir) => { st.current.hold = dir; st.current.path = []; st.current.look = null },
    }
  }, [nav, motionOK])

  // drag to look around; keyboard to walk
  useEffect(() => {
    if (!active) return
    const el = gl.domElement
    let down: { x: number; y: number } | null = null
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const pm = (e: PointerEvent) => {
      if (!down) return
      const s = st.current
      s.yaw += (e.clientX - down.x) * 0.004
      s.pitch = Math.max(-0.9, Math.min(0.7, s.pitch + (e.clientY - down.y) * 0.003))
      s.look = null
      down = { x: e.clientX, y: e.clientY }
    }
    const pu = () => { down = null }
    const wheel = (e: WheelEvent) => { e.preventDefault(); step(e.deltaY < 0 ? 0.35 : -0.35) }
    const kd = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key) && document.activeElement?.tagName !== 'INPUT') { st.current.keys.add(e.key); st.current.path = [] } }
    const ku = (e: KeyboardEvent) => st.current.keys.delete(e.key)
    el.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu)
    el.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('keydown', kd); window.addEventListener('keyup', ku)
    return () => {
      el.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu)
      el.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku)
    }
  }, [gl, active]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = (d: number) => {
    const s = st.current
    const nx = s.x - Math.sin(s.yaw) * d, nz = s.z - Math.cos(s.yaw) * d
    if (canMove(s.x, s.z, nx, nz)) { s.x = nx; s.z = nz } else if (canMove(s.x, s.z, nx, s.z)) s.x = nx; else if (canMove(s.x, s.z, s.x, nz)) s.z = nz
  }

  const frame = useRef(0)
  useFrame((_, dt) => {
    if (!active) return
    const s = st.current
    const k = s.keys
    const f = (k.has('ArrowUp') || k.has('w') || s.hold === 'fwd' ? 1 : 0) - (k.has('ArrowDown') || k.has('s') || s.hold === 'back' ? 1 : 0)
    const turn = (k.has('ArrowLeft') || k.has('a') || s.hold === 'left' ? 1 : 0) - (k.has('ArrowRight') || k.has('d') || s.hold === 'right' ? 1 : 0)
    if (f) step(f * 1.8 * Math.min(dt, 0.1))
    if (turn) s.yaw += turn * 1.4 * dt
    // follow a walking path
    if (s.path.length) {
      const [tx, tz] = s.path[0]
      const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz)
      if (dist < 0.08) s.path.shift()
      else {
        // small sub-steps so slow frames can't jump across a doorway check
        let v = Math.min(dist, 2.2 * Math.min(dt, 0.25))
        while (v > 0) {
          const d = Math.min(v, 0.08); v -= d
          const nx = s.x + (dx / dist) * d, nz = s.z + (dz / dist) * d
          if (canMove(s.x, s.z, nx, nz)) { s.x = nx; s.z = nz } else { s.path.shift(); break }
        }
        const want = Math.atan2(-dx, -dz)
        s.yaw += Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw)) * Math.min(1, 5 * dt)
        s.pitch += (-0.05 - s.pitch) * Math.min(1, 4 * dt)
      }
      if (!s.path.length && s.finalYaw !== null) { s.look = { yaw: s.finalYaw, pitch: -0.08 }; s.finalYaw = null }
    } else if (s.look) {
      const dy = Math.atan2(Math.sin(s.look.yaw - s.yaw), Math.cos(s.look.yaw - s.yaw))
      s.yaw += dy * Math.min(1, 4 * dt)
      s.pitch += (s.look.pitch - s.pitch) * Math.min(1, 4 * dt)
      if (Math.abs(dy) < 0.01 && Math.abs(s.look.pitch - s.pitch) < 0.01) s.look = null
    }
    camera.position.set(s.x, EYE, s.z)
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ')
    const r = roomAt(s.x, s.z) ?? s.room
    if (r && r !== s.room) { s.room = r; onRoom(r) }
    if (marker.current && frame.current++ % 3 === 0) marker.current.setAttribute('transform', `translate(${s.x} ${s.z}) rotate(${(-s.yaw * 180) / Math.PI})`)
  })
  return null
}

function Environment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.45
    return () => { env.dispose(); pm.dispose(); scene.environment = null }
  }, [gl, scene])
  return null
}

function BirdCamera() {
  const { camera } = useThree()
  useEffect(() => { camera.position.set(10, 24, 22); camera.rotation.set(0, 0, 0) }, [camera])
  return <OrbitControls makeDefault target={[10, 0, 3]} enablePan maxPolarAngle={Math.PI / 2.4} minDistance={8} maxDistance={45} />
}

/* ---------------- floor-plan minimap ---------------- */
function FloorPlan({ room, marker, onGo }: { room: string | null; marker: React.RefObject<SVGGElement | null>; onGo: (id: string) => void }) {
  const { t } = useSettings()
  return (
    <svg viewBox="-0.5 -7.5 21 20.5" className="w-full" role="group" aria-label={t('sim.floorPlan')}>
      {Object.entries(PLAN).map(([id, p]) => {
        const [x, z, w, d] = p.rect
        const label = t(ROOMS.find((r) => r.id === id)!.label)
        return (
          <g key={id} onClick={() => onGo(id)} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-amber-300 [&:focus-visible>rect]:[stroke-width:3]" role="button" aria-label={label} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onGo(id)}>
            <rect x={x} y={z} width={w} height={d} fill={id === room ? '#f5a524' : p.outdoor ? '#9ccf8e' : '#1f7a6d'} stroke="#e8fff9" strokeWidth={0.12} />
            <text x={x + w / 2} y={z + d / 2} fontSize={w < 3 ? 0.42 : 0.6} fill={id === room ? '#2b2140' : '#ffffff'} textAnchor="middle" dominantBaseline="middle" fontWeight={700} pointerEvents="none">
              {label.length > 12 && w < 5 ? label.split(' ')[0] : label}
            </text>
          </g>
        )
      })}
      {OPENINGS.filter((o) => o.kind !== 'window').map((o, i) => (
        <rect key={i} x={o.axis === 'x' ? o.at[0] - o.w / 2 : o.at[0] - 0.12} y={o.axis === 'x' ? o.at[1] - 0.12 : o.at[1] - o.w / 2} width={o.axis === 'x' ? o.w : 0.24} height={o.axis === 'x' ? 0.24 : o.w} fill={o.kind === 'front' ? '#b3261e' : '#e8fff9'} />
      ))}
      <g ref={marker}>
        <circle r={0.45} fill="#f5c518" stroke="#2b2140" strokeWidth={0.12} />
        <path d="M0 -1.1 L0.45 -0.2 L-0.45 -0.2 Z" fill="#2b2140" />
      </g>
    </svg>
  )
}

/* ---------------- main component ---------------- */
export default function Walkthrough() {
  const { t, lang } = useSettings()
  const box = useRef<HTMLDivElement>(null)
  const marker = useRef<SVGGElement>(null)
  const nav = useRef<Nav | null>(null)
  const [mode, setMode] = useState<'walk' | 'bird'>('walk')
  const [night, setNight] = useState(false)
  const [voice, setVoice] = useState(true)
  const [showMap, setShowMap] = useState(true)
  const [room, setRoom] = useState<string | null>('hallway')
  const [sel, setSel] = useState<string | null>(null)
  const [tab, setTab] = useState<'tip' | 'do'>('tip')
  const [toast, setToast] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  const [tour, setTour] = useState(-1)
  const [good, setGood] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('rq:home3d') ?? '{}') } catch { return {} }
  })
  useEffect(() => { try { localStorage.setItem('rq:home3d', JSON.stringify(good)) } catch { /* private mode */ } }, [good])
  const isGood = (id: string) => good[id] !== false

  const say = useCallback((s: string) => { if (voice) speak(s, lang).catch(() => {}) }, [voice, lang])
  const roomLabel = (id: string) => t(ROOMS.find((r) => r.id === id)!.label)

  const onRoom = useCallback((r: string) => {
    setRoom(r)
    setToast(r)
    say(t('sim.youAreIn', { room: roomLabel(r) }))
  }, [say, t]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2200); return () => clearTimeout(id) }, [toast])

  const select = (id: string) => {
    setSel(id)
    setTab('tip')
    const o = OBJECTS3D[id]
    if (mode === 'walk' && o) {
      const r = roomOfObj(id)
      if (r !== room && !(o.visibleFrom ?? []).includes(room ?? '')) nav.current?.goTo(r)
      setTimeout(() => nav.current?.lookAt(o.anchor), r !== room ? 1500 : 0)
    }
    say(t(objById(id).label))
  }

  const goRoom = (id: string) => {
    setSel(null)
    if (mode === 'bird') setMode('walk')
    setTimeout(() => nav.current?.goTo(id), mode === 'bird' ? 100 : 0)
  }

  const nextTour = () => {
    const i = (tour + 1) % TOUR.length
    setTour(i)
    goRoom(TOUR[i])
    const n = ROOMS.find((r) => r.id === TOUR[i])!.objects.length
    say(t('sim.tourStep', { room: roomLabel(TOUR[i]), n }))
  }

  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'walk' || e.delta > 6) return
    e.stopPropagation()
    nav.current?.walkTo(e.point.x, e.point.z)
  }

  const toggleFull = () => {
    if (!document.fullscreenElement) box.current?.requestFullscreen?.().then(() => setFull(true)).catch(() => {})
    else document.exitFullscreen().then(() => setFull(false)).catch(() => {})
  }
  useEffect(() => { const on = () => setFull(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on) }, [])
  useEffect(() => { const on = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null); window.addEventListener('keydown', on); return () => { window.removeEventListener('keydown', on); stopSpeaking() } }, [])

  const allIds = useMemo(() => Object.keys(OBJECTS3D), [])
  const score = allIds.filter(isGood).length

  const selObj: SimObject | null = sel ? objById(sel) : null
  const principle = sel ? PRINCIPLE_OF[sel] : null
  const related = principle ? allIds.filter((id) => id !== sel && PRINCIPLE_OF[id] === principle).slice(0, 5) : []

  const visibleHotspots = allIds.filter((id) => mode === 'bird' || roomOfObj(id) === room || (OBJECTS3D[id].visibleFrom ?? []).includes(room ?? ''))

  return (
    <div ref={box} className={`relative overflow-hidden bg-night ${full ? 'h-screen w-screen' : 'h-[78vh] min-h-[560px] rounded-[36px] shadow-2xl'}`}>
      <Canvas shadows={!night} dpr={[1, 1.5]} camera={{ fov: 70, near: 0.05, far: 200, position: [1.2, EYE, 6.25] }} gl={{ antialias: true }} aria-label={t('sim.walkLabel')}>
        <Environment />
        <color attach="background" args={[night ? '#101430' : '#bfe3ff']} />
        <hemisphereLight args={[night ? '#39406b' : '#fff8ec', night ? '#1a1320' : '#8a6a4a', night ? 0.25 : 0.95]} />
        <ambientLight intensity={night ? 0.12 : 0.35} />
        <directionalLight position={[22, 30, -12]} intensity={night ? 0.15 : 1.6} color={night ? '#9fb2ff' : '#fff4dc'} castShadow={!night} shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
          shadow-camera-left={-18} shadow-camera-right={18} shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-far={80} />
        {room && !PLAN[room].outdoor && (() => { const [x, z, w, d] = PLAN[room].rect; return <pointLight position={[x + w / 2, 2.3, z + d / 2]} intensity={night ? 6 : 1.5} distance={Math.max(w, d) * 1.4} decay={1.5} color="#ffe9c4" /> })()}

        <House cutaway={mode === 'bird'} night={night} onFloor={onFloor} />
        <Decor night={night} />
        <GardenDecor />

        {allIds.map((id) => (
          <group key={id} onClick={(e) => { if (e.delta > 6) return; e.stopPropagation(); select(id) }}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
            {OBJECTS3D[id].render(isGood(id), night)}
          </group>
        ))}

        {visibleHotspots.map((id) => {
          const o = OBJECTS3D[id], obj = objById(id)
          return (
            <Html key={id} position={o.anchor} center zIndexRange={[30, 0]} distanceFactor={mode === 'bird' ? 14 : undefined}>
              <button onClick={() => select(id)} aria-label={t(obj.label)} aria-pressed={sel === id}
                className={`group flex flex-col items-center ${mode === 'bird' ? 'scale-75' : ''}`}>
                <span className="relative grid size-11 place-items-center">
                  {sel !== id && <span className="absolute inset-0 animate-ping rounded-full bg-amber/60 motion-reduce:animate-none" />}
                  <span className={`relative grid size-11 place-items-center rounded-full border-4 text-lg font-black shadow-lg ${sel === id ? 'border-white bg-amber text-ink' : 'border-amber bg-white/95 text-amber-deep'}`}>{sel === id ? '✓' : '+'}</span>
                </span>
                <span className="mt-1 whitespace-nowrap rounded-full bg-ink/85 px-2.5 py-0.5 text-sm font-bold text-cream opacity-90 group-hover:opacity-100">{t(obj.label)}</span>
              </button>
            </Html>
          )
        })}

        {mode === 'walk' ? <Walker nav={nav} onRoom={onRoom} marker={marker} active /> : <BirdCamera />}
      </Canvas>

      {/* ---- top-left: where am I + floor plan ---- */}
      <div className="pointer-events-none absolute left-3 top-3 w-[min(46vw,300px)] space-y-2">
        <div className="pointer-events-auto rounded-2xl bg-teal/95 p-3 text-white shadow-xl">
          <p className="text-lg font-bold leading-tight">{room ? t('sim.youAreIn', { room: roomLabel(room) }) : t('sim.birdsEye')}</p>
          <p className="text-sm opacity-90">{t('sim.planHint')}</p>
          {showMap && <div className="mt-2"><FloorPlan room={room} marker={marker} onGo={goRoom} /></div>}
          <button onClick={() => setShowMap((v) => !v)} className="mt-1 flex items-center gap-1 text-sm font-bold underline"><MapIcon size={16} aria-hidden /> {showMap ? t('sim.hideMap') : t('sim.showMap')}</button>
        </div>
      </div>

      {/* ---- top-right: view options ---- */}
      <div className="absolute right-3 top-3 flex max-w-[50%] flex-wrap justify-end gap-2">
        <Tool on={mode === 'bird'} onClick={() => { setMode((m) => (m === 'walk' ? 'bird' : 'walk')); setSel(null) }} icon={mode === 'walk' ? <Eye size={20} /> : <Navigation size={20} />} label={mode === 'walk' ? t('sim.birdsEye') : t('sim.walkMode')} />
        <Tool on={night} onClick={() => setNight((n) => !n)} icon={night ? <Sun size={20} /> : <Moon size={20} />} label={night ? t('sim.day') : t('sim.night')} />
        <Tool on={tour >= 0} onClick={nextTour} icon={<Sparkles size={20} />} label={tour >= 0 ? t('sim.tourNext') : t('sim.tour')} />
        <Tool on={!voice} onClick={() => { setVoice((v) => !v); stopSpeaking() }} icon={voice ? <Volume2 size={20} /> : <VolumeX size={20} />} label={voice ? t('sim.voiceOn') : t('sim.voiceOff')} />
        <Tool on={full} onClick={toggleFull} icon={full ? <Minimize size={20} /> : <Maximize size={20} />} label={full ? t('sim.exitFull') : t('sim.full')} />
        <div className="rounded-2xl bg-white/95 px-3 py-2 text-center shadow-lg" title={t('sim.scoreHint')}>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('sim.score')}</p>
          <p className="text-xl font-black text-teal">{score}/{allIds.length}</p>
          <div className="mt-1 flex gap-1">
            <button className="rounded-full bg-leaf/30 px-2 text-xs font-bold" onClick={() => setGood({})}>🙂 {t('sim.allFriendly')}</button>
            <button className="rounded-full bg-coral/20 px-2 text-xs font-bold" onClick={() => setGood(Object.fromEntries(allIds.map((i) => [i, false])))}>😟 {t('sim.allCommon')}</button>
          </div>
        </div>
      </div>

      {/* ---- room toast ---- */}
      {toast && <div role="status" className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-ink/85 px-6 py-3 text-2xl font-bold text-cream shadow-xl">{PLAN[toast] && ROOMS.find((r) => r.id === toast)!.emoji} {roomLabel(toast)}</div>}

      {/* ---- bottom: walking controls ---- */}
      {mode === 'walk' && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 p-2 shadow-xl">
          <Pad dir="left" nav={nav} label={t('sim.turnLeft')}><RotateCcw size={26} /></Pad>
          <Pad dir="fwd" nav={nav} label={t('sim.forward')}><ArrowUp size={30} /></Pad>
          <Pad dir="back" nav={nav} label={t('sim.backward')}><ArrowDown size={30} /></Pad>
          <Pad dir="right" nav={nav} label={t('sim.turnRight')}><RotateCw size={26} /></Pad>
        </div>
      )}
      {mode === 'walk' && !sel && <p className="pointer-events-none absolute bottom-24 left-1/2 hidden -translate-x-1/2 rounded-full bg-ink/70 px-4 py-1.5 text-sm font-bold text-cream sm:block">{t('sim.walkHint')}</p>}

      {/* ---- right: object panel ---- */}
      {selObj && sel && (
        <aside className="absolute inset-y-3 right-3 z-40 flex w-[min(92vw,400px)] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl" aria-live="polite">
          <div className="bg-teal p-5 text-white">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-3xl font-black uppercase tracking-wide">{selObj.emoji} {t(selObj.label)}</h2>
              <button onClick={() => setSel(null)} aria-label={t('common.close')} className="grid size-11 shrink-0 place-items-center rounded-full bg-white/20"><X /></button>
            </div>
            {principle && <p className="mt-1 text-base font-bold opacity-95">{PRINCIPLE_ICON[principle]} {t(`sim.cat.${principle}` as TKey)}</p>}
          </div>
          <div role="tablist" className="grid grid-cols-2 border-b-2 border-ink/10">
            {(['tip', 'do'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-14 text-lg font-bold ${tab === k ? 'border-b-4 border-teal text-teal' : 'text-ink-soft'}`}>
                {k === 'tip' ? t('sim.tabTip') : t('sim.tabDo')}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {tab === 'tip' ? (
              <>
                <p className="text-lg">{t(`sim.tips.${sel}` as TKey)}</p>
                <div className="grid gap-2">
                  <button onClick={() => setGood((g) => ({ ...g, [sel]: false }))} aria-pressed={!isGood(sel)}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-lg font-bold ${!isGood(sel) ? 'bg-coral text-white' : 'bg-coral/10'}`}>😟 {t('sim.without')}</button>
                  <button onClick={() => setGood((g) => ({ ...g, [sel]: true }))} aria-pressed={isGood(sel)}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left text-lg font-bold ${isGood(sel) ? 'bg-teal text-white' : 'bg-teal/10'}`}>🙂 {t('sim.with')}</button>
                </div>
                <p className={`rounded-2xl p-4 text-lg font-bold ${isGood(sel) ? 'bg-leaf/20 text-ink' : 'bg-ink text-cream'}`}>
                  {isGood(sel) ? t('sim.goodResult') : t(`sim.bad.${sel}` as TKey)}
                </p>
                <Button variant="secondary" onClick={() => say(`${t(`sim.tips.${sel}` as TKey)} ${isGood(sel) ? '' : t(`sim.bad.${sel}` as TKey)}`)}><Volume2 aria-hidden /> {t('common.readAloud')}</Button>
                {related.length > 0 && (
                  <div>
                    <p className="font-bold text-ink-soft">{t('sim.related')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {related.map((id) => <button key={id} onClick={() => select(id)} className="min-h-11 rounded-full bg-teal/10 px-3 font-bold text-teal">{objById(id).emoji} {t(objById(id).label)}</button>)}
                    </div>
                  </div>
                )}
              </>
            ) : <ObjectPanel key={sel} o={selObj} />}
          </div>
        </aside>
      )}
    </div>
  )
}

function Tool({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-bold shadow-lg ${on ? 'bg-ink text-cream' : 'bg-white/95 text-ink'}`}>
      {icon}<span className="hidden md:inline">{label}</span>
    </button>
  )
}

function Pad({ dir, nav, label, children }: { dir: 'fwd' | 'back' | 'left' | 'right'; nav: React.MutableRefObject<Nav | null>; label: string; children: React.ReactNode }) {
  const stop = () => nav.current?.hold(null)
  return (
    <button aria-label={label} title={label} className="grid size-16 place-items-center rounded-full bg-ink text-cream active:scale-95"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); nav.current?.hold(dir) }} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') nav.current?.hold(dir) }} onKeyUp={stop}>
      {children}
    </button>
  )
}
