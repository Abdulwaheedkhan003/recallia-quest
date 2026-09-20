import type { FloorKind } from './textures'

/** House plan in metres. x → east, z → south. The camera's "forward" at yaw 0 is north (−z). */
export interface RoomPlan { rect: [number, number, number, number]; floor: FloorKind; wall: string; spawn: [number, number, number]; outdoor?: boolean }

export const PLAN: Record<string, RoomPlan> = {
  garden: { rect: [0, -7, 20, 7], floor: 'grass', wall: '#ffffff', spawn: [1.5, -0.8, 0.35], outdoor: true },
  laundry: { rect: [0, 0, 3, 5], floor: 'lino', wall: '#eef4f7', spawn: [1.5, 4.4, 0] },
  kitchen: { rect: [3, 0, 6, 5], floor: 'tile', wall: '#fbf3e4', spawn: [6, 4.4, 0] },
  dining: { rect: [9, 0, 5, 5], floor: 'wood', wall: '#f3f1e3', spawn: [11.5, 4.4, 0] },
  living: { rect: [14, 0, 6, 5], floor: 'wood', wall: '#f7ece6', spawn: [17, 4.4, 0.25] },
  hallway: { rect: [0, 5, 20, 2.5], floor: 'darkwood', wall: '#f3efe6', spawn: [1.2, 6.25, -Math.PI / 2] },
  bedroom: { rect: [0, 7.5, 5, 5], floor: 'carpet', wall: '#eeeaf8', spawn: [2.5, 8.1, Math.PI] },
  bathroom: { rect: [5, 7.5, 3.5, 5], floor: 'bluetile', wall: '#e8f6f8', spawn: [6.75, 8.1, Math.PI] },
  toilet: { rect: [8.5, 7.5, 2, 2.5], floor: 'bluetile', wall: '#e8f6f8', spawn: [9.5, 8, Math.PI] },
  medicine: { rect: [8.5, 10, 2, 2.5], floor: 'lino', wall: '#fbe9f1', spawn: [10.1, 11.25, Math.PI / 2] },
  study: { rect: [10.5, 7.5, 4.5, 5], floor: 'darkwood', wall: '#fbf0de', spawn: [12.75, 8.1, Math.PI] },
  entrance: { rect: [15, 7.5, 5, 5], floor: 'stone', wall: '#eef1f5', spawn: [17.5, 8.1, Math.PI] },
}

export const WALL_H = 2.6

/** Openings. axis 'x' = in an east–west wall (constant z); axis 'z' = in a north–south wall (constant x). */
export interface Opening { at: [number, number]; axis: 'x' | 'z'; w: number; kind: 'door' | 'window' | 'front' | 'patio'; rooms?: [string, string] }

export const OPENINGS: Opening[] = [
  { at: [1.5, 5], axis: 'x', w: 1.1, kind: 'door', rooms: ['laundry', 'hallway'] },
  { at: [6, 5], axis: 'x', w: 1.2, kind: 'door', rooms: ['kitchen', 'hallway'] },
  { at: [11.5, 5], axis: 'x', w: 1.2, kind: 'door', rooms: ['dining', 'hallway'] },
  { at: [17, 5], axis: 'x', w: 1.3, kind: 'door', rooms: ['living', 'hallway'] },
  { at: [9, 2.5], axis: 'z', w: 1.8, kind: 'door', rooms: ['kitchen', 'dining'] },
  { at: [14, 2.5], axis: 'z', w: 1.4, kind: 'door', rooms: ['dining', 'living'] },
  { at: [2.5, 7.5], axis: 'x', w: 1.1, kind: 'door', rooms: ['bedroom', 'hallway'] },
  { at: [6.75, 7.5], axis: 'x', w: 1.0, kind: 'door', rooms: ['bathroom', 'hallway'] },
  { at: [9.5, 7.5], axis: 'x', w: 0.95, kind: 'door', rooms: ['toilet', 'hallway'] },
  { at: [10.5, 11.25], axis: 'z', w: 0.95, kind: 'door', rooms: ['medicine', 'study'] },
  { at: [12.75, 7.5], axis: 'x', w: 1.1, kind: 'door', rooms: ['study', 'hallway'] },
  { at: [17.5, 7.5], axis: 'x', w: 1.6, kind: 'door', rooms: ['entrance', 'hallway'] },
  { at: [1.5, 0], axis: 'x', w: 1.0, kind: 'door', rooms: ['laundry', 'garden'] },
  { at: [17, 0], axis: 'x', w: 2.0, kind: 'patio', rooms: ['living', 'garden'] },
  { at: [17.5, 12.5], axis: 'x', w: 1.1, kind: 'front' },
  // windows
  { at: [6, 0], axis: 'x', w: 1.8, kind: 'window' },
  { at: [11.5, 0], axis: 'x', w: 2, kind: 'window' },
  { at: [20, 2.5], axis: 'z', w: 2.4, kind: 'window' },
  { at: [2.5, 12.5], axis: 'x', w: 1.8, kind: 'window' },
  { at: [6.75, 12.5], axis: 'x', w: 0.9, kind: 'window' },
  { at: [12.75, 12.5], axis: 'x', w: 1.8, kind: 'window' },
  { at: [20, 10], axis: 'z', w: 1.2, kind: 'window' },
  { at: [0, 10], axis: 'z', w: 1.6, kind: 'window' },
]

export interface WallSeg { a: [number, number]; b: [number, number]; y0: number; y1: number }
export interface Glass { at: [number, number]; axis: 'x' | 'z'; w: number; y0: number; y1: number; kind: Opening['kind'] }

const Q = (n: number) => Math.round(n * 4) / 4

/** Build interior + exterior walls from the room rectangles, cutting doors and windows. */
export function buildWalls(): { walls: WallSeg[]; glass: Glass[] } {
  const lines = new Map<string, [number, number][]>()
  const add = (k: string, a: number, b: number) => { const l = lines.get(k) ?? []; l.push([Math.min(a, b), Math.max(a, b)]); lines.set(k, l) }
  for (const p of Object.values(PLAN)) {
    if (p.outdoor) continue
    const [x, z, w, d] = p.rect
    add(`x:${Q(z)}`, x, x + w); add(`x:${Q(z + d)}`, x, x + w)
    add(`z:${Q(x)}`, z, z + d); add(`z:${Q(x + w)}`, z, z + d)
  }
  const walls: WallSeg[] = []
  const glass: Glass[] = []
  for (const [key, ivs] of lines) {
    const [axis, cs] = key.split(':') as ['x' | 'z', string]
    const c = Number(cs)
    ivs.sort((p, q) => p[0] - q[0])
    const merged: [number, number][] = []
    for (const iv of ivs) { const last = merged[merged.length - 1]; if (last && iv[0] <= last[1] + 0.01) last[1] = Math.max(last[1], iv[1]); else merged.push([...iv]) }
    const ops = OPENINGS.filter((o) => o.axis === axis && Q(axis === 'x' ? o.at[1] : o.at[0]) === c)
    for (const [s0, s1] of merged) {
      let cur = s0
      const inside = ops.map((o) => ({ o, c0: (axis === 'x' ? o.at[0] : o.at[1]) - o.w / 2, c1: (axis === 'x' ? o.at[0] : o.at[1]) + o.w / 2 })).filter((q) => q.c0 >= s0 - 0.01 && q.c1 <= s1 + 0.01).sort((p, q) => p.c0 - q.c0)
      const seg = (u0: number, u1: number, y0: number, y1: number) => {
        if (u1 - u0 < 0.01) return
        walls.push(axis === 'x' ? { a: [u0, c], b: [u1, c], y0, y1 } : { a: [c, u0], b: [c, u1], y0, y1 })
      }
      for (const { o, c0, c1 } of inside) {
        seg(cur, c0, 0, WALL_H)
        if (o.kind === 'window') { seg(c0, c1, 0, 0.9); seg(c0, c1, 2.2, WALL_H); glass.push({ at: o.at, axis, w: o.w, y0: 0.9, y1: 2.2, kind: 'window' }) }
        else if (o.kind === 'patio') { seg(c0, c1, 2.3, WALL_H); glass.push({ at: o.at, axis, w: o.w, y0: 0, y1: 2.3, kind: 'patio' }) }
        else if (o.kind === 'front') { seg(c0, c1, 2.2, WALL_H) }
        else seg(c0, c1, 2.2, WALL_H) // lintel above doors
        cur = c1
      }
      seg(cur, s1, 0, WALL_H)
    }
  }
  return { walls, glass }
}

export function roomAt(x: number, z: number, margin = 0.28): string | null {
  for (const [id, p] of Object.entries(PLAN)) {
    const [rx, rz, w, d] = p.rect
    const m = p.outdoor ? 0.4 : margin
    if (x >= rx + m && x <= rx + w - m && z >= rz + m && z <= rz + d - m) return id
  }
  // inside a doorway (between two rooms)
  for (const o of OPENINGS) {
    if (!o.rooms) continue
    const along = o.axis === 'x' ? x - o.at[0] : z - o.at[1]
    const across = o.axis === 'x' ? z - o.at[1] : x - o.at[0]
    if (Math.abs(along) < o.w / 2 - 0.2 && Math.abs(across) < 0.4) return o.rooms[0]
  }
  return null
}

/** Can the walker move from a to b without passing through a wall? */
export function canMove(ax: number, az: number, bx: number, bz: number) {
  if (!roomAt(bx, bz)) return false
  for (const o of OPENINGS) {
    if (!o.rooms) continue
    const along = o.axis === 'x' ? bx - o.at[0] : bz - o.at[1]
    const aAcross = o.axis === 'x' ? az - o.at[1] : ax - o.at[0]
    const bAcross = o.axis === 'x' ? bz - o.at[1] : bx - o.at[0]
    if (Math.abs(along) < o.w / 2 - 0.15 && Math.abs(aAcross) < 0.5 && Math.abs(bAcross) < 0.5) return true
  }
  const ra = roomAt(ax, az), rb = roomAt(bx, bz)
  return ra === rb
}

/** Room-to-room route through doorways (BFS), returned as walk waypoints. */
export function route(from: string, to: string): [number, number][] {
  if (from === to) return []
  const prev = new Map<string, { room: string; door: Opening }>()
  const q = [from]
  const seen = new Set([from])
  while (q.length) {
    const r = q.shift()!
    for (const o of OPENINGS) {
      if (!o.rooms || !o.rooms.includes(r)) continue
      const n = o.rooms[0] === r ? o.rooms[1] : o.rooms[0]
      if (seen.has(n)) continue
      seen.add(n); prev.set(n, { room: r, door: o }); q.push(n)
    }
  }
  const pts: [number, number][] = []
  let cur = to
  while (cur !== from) {
    const p = prev.get(cur)
    if (!p) return []
    const o = p.door
    const [cx, cz] = o.at
    const nextSide = (room: string) => {
      const [rx, rz, w, d] = PLAN[room].rect
      const mx = rx + w / 2, mz = rz + d / 2
      return o.axis === 'x' ? [cx, cz + Math.sign(mz - cz) * 0.6] : [cx + Math.sign(mx - cx) * 0.6, cz]
    }
    pts.unshift(nextSide(cur) as [number, number])
    pts.unshift(nextSide(p.room) as [number, number])
    cur = p.room
  }
  return pts
}
