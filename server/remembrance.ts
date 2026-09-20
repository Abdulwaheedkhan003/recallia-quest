/**
 * Remembrance story engine — evidence-grounded.
 *
 *   caretaker evidence (person, photos, audio, memories)
 *     → private LOCAL model writes a STRUCTURED story (JSON only, never code/HTML)
 *     → server validates every step against the evidence (unknown ids, invented names/numbers are dropped)
 *     → patient app renders it with its own approved components.
 *
 * If no local model is running, a deterministic composer builds the story from the same evidence
 * (the caretaker's own words), so the experience still works without inventing anything.
 */
import { createHash } from 'node:crypto'
import { completeJsonPrivate } from './ai.ts'
import { buildEvidence, composeStory, isLatinLang, jsonObj, storyUserMessage, STORY_SCHEMA, systemPrompt, validateStory, type Evidence, type ItemRow, type MemoryRow, type PersonRow, type Story } from './remembrance-core.ts'
import { q } from './db.ts'
import { log } from './util.ts'

export function gatherEvidence(personId: number): Evidence | null {
  const p = q.get<PersonRow>('SELECT * FROM people WHERE id = ?', personId)
  if (!p) return null
  const patient = q.get<{ display_name: string; lang: string }>('SELECT display_name, lang FROM users WHERE id = ?', p.patient_id)!
  const prof = jsonObj(q.get<{ data: string }>('SELECT data FROM patient_profiles WHERE patient_id = ?', p.patient_id)?.data) as unknown as Record<string, Record<string, string>>
  const items = q.all<ItemRow>('SELECT id, kind, media_id, demo_asset, meta FROM person_items WHERE person_id = ? ORDER BY id', personId)
  const mems = q.all<MemoryRow>('SELECT id, type, content, related_item_id FROM person_memories WHERE person_id = ? ORDER BY id', personId)
  const ev = buildEvidence({
    person: { id: p.id, name: p.name, relationship: p.relationship, avatarItemId: p.avatar_item_id, details: jsonObj(p.details) },
    patient: { preferredName: prof.basic?.preferredName || patient.display_name, lang: patient.lang, respondsBetter: prof.communication?.respondsBetter, voiceStyle: prof.communication?.voiceStyle },
    items: items.map((i) => ({ id: i.id, kind: i.kind, meta: jsonObj(i.meta) })),
    memories: mems.map((m) => ({ id: m.id, content: m.content, relatedItemId: m.related_item_id })),
  })
  return { ...ev, hash: createHash('sha256').update(JSON.stringify(ev)).digest('hex').slice(0, 32) }
}

/* ---------------- get or build ---------------- */

export interface StoredStory { id: number; story: Story; generator: string; created_at: number; fresh: boolean }
const inflight = new Map<number, Promise<StoredStory>>()

export function latestStory(personId: number): (StoredStory & { hash: string }) | null {
  const r = q.get<{ id: number; structure: string; generator: string; created_at: number; evidence_hash: string }>(
    'SELECT id, structure, generator, created_at, evidence_hash FROM remembrance_stories WHERE person_id = ? ORDER BY id DESC LIMIT 1', personId)
  if (!r) return null
  return { id: r.id, story: JSON.parse(r.structure), generator: r.generator, created_at: r.created_at, fresh: true, hash: r.evidence_hash }
}

export function storyStatus(personId: number) {
  const ev = gatherEvidence(personId)
  const s = latestStory(personId)
  return { ready: Boolean(s), upToDate: Boolean(s && ev && s.hash === ev.hash), generator: s?.generator ?? null, createdAt: s?.created_at ?? null, building: inflight.has(personId) }
}

/** True when there is something to write a story from. */
export const hasEvidence = (personId: number) => { const ev = gatherEvidence(personId); return Boolean(ev && (ev.facts.length > 0 || ev.photos.length > 1)) }

function saveStory(personId: number, ev: Evidence, story: Story, generator: string) {
  const r = q.run('INSERT INTO remembrance_stories (patient_id, person_id, structure, source_memory_ids, source_item_ids, evidence_hash, generator, created_at) VALUES (?,?,?,?,?,?,?,?)',
    q.get<{ patient_id: number }>('SELECT patient_id FROM people WHERE id = ?', personId)!.patient_id, personId, JSON.stringify(story),
    JSON.stringify(ev.memoryIds), JSON.stringify([...ev.photos.map((x) => x.id), ...ev.audio.map((x) => x.id)]), ev.hash, generator, Date.now())
  // Keep a short history only.
  q.run('DELETE FROM remembrance_stories WHERE person_id = ? AND id NOT IN (SELECT id FROM remembrance_stories WHERE person_id = ? ORDER BY id DESC LIMIT 3) AND id NOT IN (SELECT story_id FROM remembrance_sessions WHERE story_id IS NOT NULL)', personId, personId)
  return Number(r.lastInsertRowid)
}

/** Store a story built from the caretaker's own words (used when the AI is still writing). */
export const saveComposed = (personId: number, ev: Evidence) => saveStory(personId, ev, composeStory(ev), 'composer')

export function getOrBuildStory(personId: number, force = false, onProgress?: (chars: number) => void): Promise<StoredStory> {
  const ev = gatherEvidence(personId)
  if (!ev) return Promise.reject(new Error('person not found'))
  const existing = latestStory(personId)
  if (!force && existing && existing.hash === ev.hash) return Promise.resolve(existing)
  const running = inflight.get(personId)
  if (running) return running
  const p = (async () => {
    let story: Story | null = null
    let generator = 'composer'
    const hasEvidence = ev.facts.length > 0 || ev.photos.length > 1
    if (hasEvidence) {
      try {
        const r = await completeJsonPrivate<unknown>(systemPrompt(ev), [{ role: 'user', content: storyUserMessage(ev) }], STORY_SCHEMA, 2000, onProgress)
        story = validateStory(r.data, ev, isLatinLang(ev.patient.lang))
        if (story) generator = r.via
        else log.warn('private ai story failed validation; using composer')
      } catch (e) {
        log.info('story via composer', { reason: (e as Error).message.slice(0, 80) })
      }
    }
    story ??= composeStory(ev)
    const now = Date.now()
    return { id: saveStory(personId, ev, story, generator), story, generator, created_at: now, fresh: true }
  })().finally(() => inflight.delete(personId))
  inflight.set(personId, p)
  return p
}

export { composeStory, type Evidence, type Story }
export type { Step } from './remembrance-core.ts'
