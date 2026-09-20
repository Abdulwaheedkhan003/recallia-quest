import * as THREE from 'three'
import type { ReactNode } from 'react'

export type V3 = [number, number, number]

/** Shared materials (one per colour/options) keep draw calls and memory low. */
const cache = new Map<string, THREE.MeshStandardMaterial>()
export function mat(c: string, o: { rough?: number; metal?: number; emissive?: string; ei?: number; map?: THREE.Texture; opacity?: number } = {}) {
  const k = `${c}|${o.rough ?? 0.8}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.ei ?? 0}|${o.map?.uuid ?? ''}|${o.opacity ?? 1}`
  let m = cache.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: c, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, map: o.map ?? null,
      emissive: o.emissive ?? '#000000', emissiveIntensity: o.ei ?? 0,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
    })
    cache.set(k, m)
  }
  return m
}

export function B({ p, s, c, r = 0, m, shadow = true }: { p: V3; s: V3; c?: string; r?: number; m?: THREE.Material; shadow?: boolean }) {
  return (
    <mesh position={p} rotation-y={r} castShadow={shadow} receiveShadow material={m ?? mat(c ?? '#cccccc')}>
      <boxGeometry args={s} />
    </mesh>
  )
}

export function C({ p, rt, rb, h, c, m, seg = 24, rx = 0, rz = 0 }: { p: V3; rt: number; rb?: number; h: number; c?: string; m?: THREE.Material; seg?: number; rx?: number; rz?: number }) {
  return (
    <mesh position={p} rotation={[rx, 0, rz]} castShadow receiveShadow material={m ?? mat(c ?? '#cccccc')}>
      <cylinderGeometry args={[rt, rb ?? rt, h, seg]} />
    </mesh>
  )
}

export function S({ p, r, c, m, sy = 1 }: { p: V3; r: number; c?: string; m?: THREE.Material; sy?: number }) {
  return (
    <mesh position={p} scale={[1, sy, 1]} castShadow receiveShadow material={m ?? mat(c ?? '#cccccc')}>
      <sphereGeometry args={[r, 24, 16]} />
    </mesh>
  )
}

/** Flat picture (photo, sign, calendar…) facing +z of its group. */
export function Pic({ p, w, h, map, r = 0 }: { p: V3; w: number; h: number; map: THREE.Texture; r?: number }) {
  return (
    <mesh position={p} rotation-y={r} material={mat('#ffffff', { map, rough: 0.6 })}>
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

export function G({ p, r = 0, children }: { p: V3; r?: number; children: ReactNode }) {
  return <group position={p} rotation-y={r}>{children}</group>
}

/** Soft warm light that only exists when needed. */
export function Glow({ p, on, color = '#ffcf7a', intensity = 3, distance = 5 }: { p: V3; on: boolean; color?: string; intensity?: number; distance?: number }) {
  return on ? <pointLight position={p} color={color} intensity={intensity} distance={distance} decay={1.6} /> : null
}
