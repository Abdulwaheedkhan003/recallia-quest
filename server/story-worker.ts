/**
 * Background story writer — makes remembrance stories real-time.
 *
 * When a caretaker adds or changes a photo, recording, memory or profile detail, the story for that person is
 * rewritten in the background by the private local model (a few seconds after the last change, one at a time).
 * Caretakers see live progress; when it is done the patient's device and the caretakers are told ("care:changed"),
 * so the new story is already waiting when the patient opens it. Also:
 *  - when the private model becomes ready (or switches to the fine-tuned one), stories that were built without it
 *    are rewritten by it;
 *  - on start, anything out of date is caught up.
 */
import { config } from './config.ts'
import { q } from './db.ts'
import { localAiStatus, onLocalAiChange } from './local-ai.ts'
import { caretakersOf, careChanged, onCareChanged } from './monitor.ts'
import { emit } from './realtime.ts'
import { getOrBuildStory, hasEvidence, latestStory, storyStatus } from './remembrance.ts'
import { log } from './util.ts'

const queue: number[] = []
const debounce = new Map<number, NodeJS.Timeout>()
let working = false

const patientOf = (personId: number) => q.get<{ patient_id: number }>('SELECT patient_id FROM people WHERE id = ?', personId)?.patient_id

export function progress(personId: number, phase: 'queued' | 'writing' | 'done' | 'failed', extra: { chars?: number; generator?: string } = {}) {
  const patientId = patientOf(personId)
  if (!patientId) return
  for (const c of caretakersOf(patientId)) emit(c, { type: 'story:progress', patientId, personId, phase, ...extra })
}

/** A story needs (re)writing when its evidence changed, or it was built without the model that is available now. */
function needsWork(personId: number) {
  if (!hasEvidence(personId)) return false
  const s = storyStatus(personId)
  if (!s.ready || !s.upToDate) return true
  const ai = localAiStatus()
  return ai.state === 'ready' && Boolean(ai.model) && s.generator !== `local:${ai.model}` && !s.generator?.startsWith('cloud:')
}

export function enqueue(personId: number) {
  if (queue.includes(personId) || !needsWork(personId)) return
  queue.push(personId)
  progress(personId, 'queued')
  void drain()
}

async function drain() {
  if (working) return
  working = true
  try {
    while (queue.length) {
      const personId = queue.shift()!
      if (!patientOf(personId) || !needsWork(personId)) continue
      // Evidence unchanged but a better model is available now → force a rewrite.
      const force = Boolean(latestStory(personId)) && storyStatus(personId).upToDate
      let last = 0
      progress(personId, 'writing', { chars: 0 })
      try {
        const s = await getOrBuildStory(personId, force, (chars) => {
          if (chars - last >= 40) { last = chars; progress(personId, 'writing', { chars }) }
        })
        progress(personId, 'done', { generator: s.generator })
        const pid = patientOf(personId)
        if (pid) careChanged(pid, 'story')
      } catch (e) {
        log.warn('background story failed', { personId, err: (e as Error).message.slice(0, 120) })
        progress(personId, 'failed')
      }
    }
  } finally {
    working = false
  }
}

/** Queue every person of a patient whose story is out of date. */
function catchUpPatient(patientId: number) {
  for (const p of q.all<{ id: number }>('SELECT id FROM people WHERE patient_id = ? ORDER BY id', patientId)) if (needsWork(p.id)) enqueue(p.id)
}

function catchUpAll() {
  for (const p of q.all<{ id: number }>('SELECT id FROM people ORDER BY id')) if (needsWork(p.id)) enqueue(p.id)
}

export function startStoryWorker() {
  if (!config.localAi.prebuild) return
  onCareChanged((patientId, what) => {
    if (what !== 'people' && what !== 'profile') return
    // Wait a moment so several quick edits (e.g. uploading 5 photos) produce one rewrite.
    clearTimeout(debounce.get(patientId))
    debounce.set(patientId, setTimeout(() => { debounce.delete(patientId); catchUpPatient(patientId) }, 4000))
  })
  onLocalAiChange((s) => { if (s.state === 'ready') catchUpAll() })
  setTimeout(catchUpAll, 3000).unref()
}
