import { useMemo } from 'react'
import * as THREE from 'three'
import { B, C, mat } from './prims'
import { buildWalls, OPENINGS, PLAN, WALL_H } from './plan'
import { floorTexture, skyTexture } from './textures'
import type { ThreeEvent } from '@react-three/fiber'

const WALL = '#f1ede4', SKIRT = '#5b3a1e', FRAME = '#ffffff'

/** Floors, walls (with doors and windows), ceilings, lights and the world outside. */
export default function House({ cutaway, night, onFloor }: { cutaway: boolean; night: boolean; onFloor: (e: ThreeEvent<MouseEvent>) => void }) {
  const { walls, glass } = useMemo(buildWalls, [])
  const top = cutaway ? 1.25 : WALL_H

  return (
    <group>
      {/* ground (garden + outside) */}
      <mesh rotation-x={-Math.PI / 2} position={[10, -0.005, 3]} receiveShadow onClick={onFloor} material={mat('#ffffff', { map: floorTexture('grass', 90, 90), rough: 1 })}>
        <planeGeometry args={[90, 90]} />
      </mesh>

      {/* room floors + ceilings + ceiling lights */}
      {Object.entries(PLAN).filter(([, p]) => !p.outdoor).map(([id, p]) => {
        const [x, z, w, d] = p.rect
        return (
          <group key={id}>
            <mesh rotation-x={-Math.PI / 2} position={[x + w / 2, 0.003, z + d / 2]} receiveShadow onClick={onFloor} material={mat('#ffffff', { map: floorTexture(p.floor, w, d), rough: 0.85 })}>
              <planeGeometry args={[w, d]} />
            </mesh>
            {!cutaway && (
              <>
                <mesh rotation-x={Math.PI / 2} position={[x + w / 2, WALL_H, z + d / 2]} material={mat('#fbfaf6', { rough: 1 })}>
                  <planeGeometry args={[w, d]} />
                </mesh>
                {id !== 'hallway' && <C p={[x + w / 2, WALL_H - 0.03, z + d / 2]} rt={0.2} h={0.05} m={mat('#fff6d8', { emissive: '#fff1c4', ei: night ? 1.6 : 0.2 })} />}
              </>
            )}
          </group>
        )
      })}

      {/* walls with skirting (dark, so the floor edge is easy to see) and cornice */}
      {walls.map((s, i) => {
        const y1 = Math.min(s.y1, top)
        if (s.y0 >= y1) return null
        const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])
        const along = s.a[1] === s.b[1] // east–west wall
        const cx = (s.a[0] + s.b[0]) / 2, cz = (s.a[1] + s.b[1]) / 2
        const size = (h: number, t: number): [number, number, number] => (along ? [len, h, t] : [t, h, len])
        return (
          <group key={i}>
            <B p={[cx, (s.y0 + y1) / 2, cz]} s={size(y1 - s.y0, 0.12)} c={WALL} />
            {s.y0 === 0 && <B p={[cx, 0.06, cz]} s={size(0.12, 0.16)} c={SKIRT} shadow={false} />}
            {y1 === WALL_H && <B p={[cx, WALL_H - 0.05, cz]} s={size(0.1, 0.15)} c={FRAME} shadow={false} />}
          </group>
        )
      })}

      {/* door frames */}
      {OPENINGS.filter((o) => o.kind === 'door').map((o, i) => {
        const [x, z] = o.at
        const h = Math.min(2.2, top)
        const post = (off: number) => (o.axis === 'x' ? <B key={off} p={[x + off, h / 2, z]} s={[0.07, h, 0.16]} c={FRAME} shadow={false} /> : <B key={off} p={[x, h / 2, z + off]} s={[0.16, h, 0.07]} c={FRAME} shadow={false} />)
        return <group key={i}>{post(-o.w / 2)}{post(o.w / 2)}</group>
      })}

      {/* windows and the glass patio door */}
      {glass.map((g, i) => {
        const [x, z] = g.at
        const y1 = Math.min(g.y1, top)
        if (g.y0 >= y1) return null
        const h = y1 - g.y0, cy = (g.y0 + y1) / 2
        const pane = g.axis === 'x' ? ([g.w, h, 0.02] as [number, number, number]) : ([0.02, h, g.w] as [number, number, number])
        const bar = (off: number) => (g.axis === 'x' ? <B key={off} p={[x + off, cy, z]} s={[0.06, h, 0.14]} c={FRAME} shadow={false} /> : <B key={off} p={[x, cy, z + off]} s={[0.14, h, 0.06]} c={FRAME} shadow={false} />)
        return (
          <group key={i}>
            {g.kind === 'patio' ? (
              <B p={g.axis === 'x' ? [x + g.w / 4, cy, z] : [x, cy, z + g.w / 4]} s={g.axis === 'x' ? [g.w / 2, h, 0.02] : [0.02, h, g.w / 2]} m={mat('#cfeaff', { opacity: 0.22, rough: 0.05 })} shadow={false} />
            ) : (
              <B p={[x, cy, z]} s={pane} m={mat('#cfeaff', { opacity: 0.22, rough: 0.05 })} shadow={false} />
            )}
            {bar(-g.w / 2)}{bar(g.w / 2)}{bar(0)}
            {g.kind === 'window' && <B p={[x, g.y0 - 0.02, z]} s={g.axis === 'x' ? [g.w + 0.2, 0.05, 0.3] : [0.3, 0.05, g.w + 0.2]} c={FRAME} shadow={false} />}
          </group>
        )
      })}

      {/* the world outside: neighbours' houses, hills, distant sky */}
      {[[4, -14], [14, -15], [28, 4], [-9, 6], [10, 20]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <B p={[0, 1.6, 0]} s={[6, 3.2, 5]} c={['#e8d9c4', '#d9e4ee', '#efe1d6', '#dde8d5', '#eadcc9'][i]} />
          <mesh position={[0, 3.9, 0]} rotation-y={Math.PI / 4} material={mat(['#b3261e', '#5b3a1e', '#3a2d63', '#8a5a12', '#6b4f3a'][i])}>
            <coneGeometry args={[4.6, 1.6, 4]} />
          </mesh>
        </group>
      ))}
      {[[-30, -30, 14], [40, -35, 18], [10, -45, 20], [-35, 20, 16], [45, 25, 15]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, -r * 0.6, z]} material={mat(night ? '#1f3a2a' : '#6fae62', { rough: 1 })}><sphereGeometry args={[r, 32, 16]} /></mesh>
      ))}
      <mesh position={[10, 0, 3]}>
        <sphereGeometry args={[80, 32, 16]} />
        <meshBasicMaterial map={skyTexture(night)} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}
