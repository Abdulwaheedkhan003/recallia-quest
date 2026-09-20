import { q } from './db.ts'
import { emit, isOnline } from './realtime.ts'

/**
 * Patient ↔ caretaker plumbing.
 * - The database is the single source of truth; realtime events only say "something changed"
 *   (or carry the new monitoring event), and clients re-fetch from the API.
 * - Events for a patient go ONLY to that patient's own sockets and to caretakers linked to them
 *   in circle_links, so caretaker A can never receive patient B's events.
 */
export const caretakersOf = (patientId: number) =>
  q.all<{ id: number }>('SELECT member_id AS id FROM circle_links WHERE patient_id = ?', patientId).map((r) => r.id)

export interface MonitorEvent { id: number | null; type: string; meta: Record<string, unknown>; created_at: number }

/** Store an append-only monitoring event and push it live to the patient's caretakers. */
export function recordEvent(patientId: number, type: string, meta: Record<string, unknown> = {}): MonitorEvent {
  const now = Date.now()
  const r = q.run('INSERT INTO monitoring_events (patient_id, type, meta, created_at) VALUES (?,?,?,?)', patientId, type, JSON.stringify(meta), now)
  const event = { id: Number(r.lastInsertRowid), type, meta, created_at: now }
  for (const c of caretakersOf(patientId)) emit(c, { type: 'monitor', patientId, event })
  return event
}

/** Live-only nudge (the underlying data is already stored elsewhere, e.g. activities / game_results). */
export function pushLive(patientId: number, type: string, meta: Record<string, unknown> = {}) {
  const event = { id: null, type, meta, created_at: Date.now() }
  for (const c of caretakersOf(patientId)) emit(c, { type: 'monitor', patientId, event })
}

/** Caretaker changed something the patient experience uses → tell the patient's devices and the other caretakers. */
const careHooks: ((patientId: number, what: string) => void)[] = []
/** Server-side listeners (e.g. the background story writer). */
export const onCareChanged = (fn: (patientId: number, what: string) => void) => { careHooks.push(fn) }

export function careChanged(patientId: number, what: string) {
  for (const fn of careHooks) { try { fn(patientId, what) } catch { /* never block the request */ } }
  emit(patientId, { type: 'care:changed', what })
  for (const c of caretakersOf(patientId)) emit(c, { type: 'care:changed', patientId, what })
}

/** What the patient is doing right now (kept in memory; history goes to monitoring_events). */
const current = new Map<number, { area: string; since: number }>()
export function setCurrentArea(patientId: number, area: string) {
  const prev = current.get(patientId)
  if (prev?.area === area) return false
  current.set(patientId, { area, since: Date.now() })
  return true
}
export function currentActivity(patientId: number) {
  if (!isOnline(patientId)) return null
  return current.get(patientId) ?? null
}
