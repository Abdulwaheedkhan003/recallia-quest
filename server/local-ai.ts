/**
 * Private (local) AI manager — keeps the on-device model ready so remembrance stories are written in real time.
 *
 *  - Talks to Ollama on this computer (LOCAL_AI_BASE_URL, default http://localhost:11434/v1).
 *  - On start it makes sure a model is available:
 *      1. the preferred model (LOCAL_AI_MODEL, default "recallia-remember") if Ollama already has it;
 *      2. otherwise, if the fine-tuned GGUF from the Colab notebook is in finetune/, it builds "recallia-remember" from it;
 *      3. otherwise it uses the fallback (LOCAL_AI_FALLBACK_MODEL, default qwen2.5:3b), downloading it once if needed.
 *  - Loads the model into memory ahead of time and keeps it loaded (keep_alive), so the first story is not slow.
 *  - Re-checks regularly: if Ollama is started later, or the fine-tuned GGUF appears, it switches automatically.
 *  - Streams generation so caretakers see live progress; a stalled model is cut off (idle timeout), a working one is not.
 * Status is pushed to signed-in caretakers over the existing WebSocket ("ai:local").
 * Nothing here sends family data anywhere except the local model server.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { config } from './config.ts'
import { q } from './db.ts'
import { emit } from './realtime.ts'
import { log } from './util.ts'

export type LocalStateName = 'off' | 'offline' | 'checking' | 'downloading' | 'building' | 'loading' | 'ready' | 'error'
export interface LocalState {
  state: LocalStateName
  /** Model that stories are written with right now (null = none; stories use the caretaker's own words). */
  model: string | null
  fineTuned: boolean
  /** 0–100 while downloading / building. */
  progress: number | null
  detail: string
  server: 'ollama' | 'openai-compatible' | null
  updatedAt: number
}

const L = config.localAi
const nativeBase = L.base.replace(/\/v1$/, '')
const FT = 'recallia-remember'
let st: LocalState = { state: L.enabled ? 'checking' : 'off', model: null, fineTuned: false, progress: null, detail: L.enabled ? 'Checking the private AI…' : 'Private AI is turned off (LOCAL_AI=off).', server: null, updatedAt: Date.now() }
const listeners = new Set<(s: LocalState) => void>()

export const localAiStatus = (): LocalState => st
export const onLocalAiChange = (fn: (s: LocalState) => void) => { listeners.add(fn); return () => listeners.delete(fn) }

let lastBroadcast = 0
function set(patch: Partial<LocalState>, force = false) {
  const prev = st
  st = { ...st, ...patch, updatedAt: Date.now() }
  const changed = prev.state !== st.state || prev.model !== st.model
  if (changed) log.info('private ai', { state: st.state, model: st.model, detail: st.detail })
  // Progress updates are throttled; state changes go out immediately.
  if (!changed && !force && Date.now() - lastBroadcast < 700) return
  lastBroadcast = Date.now()
  for (const u of q.all<{ id: number }>("SELECT id FROM users WHERE role = 'family'")) emit(u.id, { type: 'ai:local', status: st })
  if (changed) for (const fn of listeners) fn(st)
}

/* ---------------- Ollama API ---------------- */

const headers = (): Record<string, string> => ({ 'content-type': 'application/json', ...(L.key ? { authorization: `Bearer ${L.key}` } : {}) })

async function api<T>(path: string, body?: unknown, timeoutMs = 10_000): Promise<T> {
  const r = await fetch(`${nativeBase}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: headers(), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}

/** Read an NDJSON stream line by line (Ollama streams progress and tokens this way). */
async function* ndjson(r: Response, idleMs: number, ac: AbortController): AsyncGenerator<Record<string, unknown>> {
  if (!r.body) return
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let idle = setTimeout(() => ac.abort(new Error('stalled')), idleMs)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      clearTimeout(idle)
      idle = setTimeout(() => ac.abort(new Error('stalled')), idleMs)
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (line) yield JSON.parse(line)
      }
    }
    if (buf.trim()) yield JSON.parse(buf)
  } finally {
    clearTimeout(idle)
  }
}

async function streamPost(path: string, body: unknown, idleMs: number, onLine: (j: Record<string, unknown>) => void, totalMs = 6 * 60 * 60_000) {
  const ac = new AbortController()
  const total = setTimeout(() => ac.abort(new Error('took too long')), totalMs)
  try {
    const r = await fetch(`${nativeBase}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: ac.signal })
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      throw new Error(j.error || `HTTP ${r.status}`)
    }
    for await (const j of ndjson(r, idleMs, ac)) {
      if (j.error) throw new Error(String(j.error))
      onLine(j)
    }
  } catch (e) {
    if (ac.signal.aborted && ac.signal.reason instanceof Error) throw ac.signal.reason
    throw e
  } finally {
    clearTimeout(total)
  }
}

const sameModel = (a: string, b: string) => a === b || a === `${b}:latest` || `${a}:latest` === b
interface Installed { name: string; modified: number }
async function installed(): Promise<Installed[]> {
  const j = await api<{ models?: { name: string; model?: string; modified_at?: string }[] }>('/api/tags')
  return (j.models ?? []).map((m) => ({ name: m.model ?? m.name, modified: Date.parse(m.modified_at ?? '') || 0 }))
}
const find = (list: Installed[], name: string) => list.find((m) => sameModel(m.name, name))
const has = (list: Installed[], name: string) => Boolean(find(list, name))

async function pull(model: string) {
  set({ state: 'downloading', progress: 0, detail: `Downloading ${model} (one time only)…` }, true)
  await streamPost('/api/pull', { model, stream: true }, 5 * 60_000, (j) => {
    const total = Number(j.total ?? 0), done = Number(j.completed ?? 0)
    if (total > 0) set({ progress: Math.min(99, Math.round((done / total) * 100)), detail: `Downloading ${model}: ${Math.round(done / 2 ** 20)} / ${Math.round(total / 2 ** 20)} MB` })
  })
}

/* ---------------- fine-tuned model: build from the GGUF ---------------- */

/** Read TEMPLATE / SYSTEM / PARAMETER from finetune/Modelfile (FROM is replaced by the uploaded GGUF). */
function readModelfile() {
  const path = resolve(L.modelfile)
  if (!existsSync(path)) return {}
  const src = readFileSync(path, 'utf8')
  const block = (k: string) => src.match(new RegExp(`^${k} """([\\s\\S]*?)"""`, 'm'))?.[1]
  const parameters: Record<string, unknown> = {}
  for (const m of src.matchAll(/^PARAMETER\s+(\w+)\s+(.+)$/gm)) {
    const k = m[1], raw = m[2].trim()
    const v: unknown = /^".*"$/.test(raw) ? JSON.parse(raw) : Number.isFinite(Number(raw)) ? Number(raw) : raw
    if (k === 'stop') parameters.stop = [...((parameters.stop as unknown[]) ?? []), v]
    else parameters[k] = v
  }
  return { template: block('TEMPLATE'), system: block('SYSTEM'), parameters }
}

async function sha256File(path: string) {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer)
  return h.digest('hex')
}

async function buildFineTuned() {
  const path = resolve(L.gguf)
  const size = statSync(path).size
  set({ state: 'building', progress: 0, detail: 'Preparing the fine-tuned model…' }, true)
  const digest = `sha256:${await sha256File(path)}`
  const head = await fetch(`${nativeBase}/api/blobs/${digest}`, { method: 'HEAD', headers: headers() })
  if (!head.ok) {
    let sent = 0
    const src = createReadStream(path)
    src.on('data', (c) => { sent += c.length; set({ progress: Math.round((sent / size) * 90), detail: `Loading the fine-tuned model into Ollama: ${Math.round(sent / 2 ** 20)} / ${Math.round(size / 2 ** 20)} MB` }) })
    const r = await fetch(`${nativeBase}/api/blobs/${digest}`, { method: 'POST', headers: { ...(L.key ? { authorization: `Bearer ${L.key}` } : {}), 'content-type': 'application/octet-stream', 'content-length': String(size) }, body: Readable.toWeb(src) as ReadableStream, duplex: 'half' } as RequestInit)
    if (!r.ok) throw new Error(`upload failed (HTTP ${r.status})`)
  }
  set({ progress: 95, detail: 'Creating recallia-remember…' }, true)
  const mf = readModelfile()
  await streamPost('/api/create', { model: FT, files: { 'recallia-remember.Q4_K_M.gguf': digest }, ...mf, stream: true }, 5 * 60_000, () => {})
  log.info('private ai: built fine-tuned model', { model: FT, mb: Math.round(size / 2 ** 20) })
}

/* ---------------- warm-up + keep loaded ---------------- */

async function warm(model: string) {
  set({ state: 'loading', progress: null, detail: `Loading ${model} into memory…` }, true)
  // An empty prompt loads the model without generating anything.
  await api('/api/generate', { model, prompt: '', keep_alive: L.keepAlive, stream: false }, 5 * 60_000)
}

/* ---------------- main loop ---------------- */

let running: Promise<void> | null = null
let timer: NodeJS.Timeout | null = null
let ggufFailed = 0

async function ensureOnce() {
  if (!L.enabled) return set({ state: 'off', model: null, detail: 'Private AI is turned off (LOCAL_AI=off).' })
  let list: Installed[]
  try {
    await api('/api/version', undefined, 4000)
    list = await installed()
  } catch {
    // Not Ollama — maybe LM Studio / llama.cpp / vLLM speaking the OpenAI API. Use it as configured.
    try {
      const r = await fetch(`${L.base}/models`, { headers: headers(), signal: AbortSignal.timeout(4000) })
      if (r.ok) return set({ state: 'ready', server: 'openai-compatible', model: L.model, fineTuned: L.model.startsWith(FT), progress: null, detail: `Using ${L.model} on ${L.base}` })
    } catch { /* fall through */ }
    return set({ state: 'offline', server: null, model: null, progress: null, detail: `The private AI (Ollama) is not running at ${nativeBase}. Stories use your own words until it starts.` })
  }
  set({ server: 'ollama' })

  // A fine-tuned GGUF that is newer than the installed recallia-remember (or not installed yet) is (re)built automatically.
  const ggufPath = resolve(L.gguf)
  const ggufTime = existsSync(ggufPath) ? statSync(ggufPath).mtimeMs : 0
  const ft = find(list, FT)
  const needBuild = L.model === FT && ggufTime > 0 && (!ft || ggufTime > ft.modified) && ggufTime !== ggufFailed
  let target: string | null = null
  if (needBuild && L.autoSetup) {
    try { await buildFineTuned(); target = FT } catch (e) { ggufFailed = ggufTime; log.warn('private ai: could not build fine-tuned model', { err: (e as Error).message }) }
  }
  if (!target && has(list, L.model)) target = L.model
  if (!target && has(list, L.fallbackModel)) target = L.fallbackModel
  if (!target && L.autoSetup) {
    try { await pull(L.fallbackModel); target = L.fallbackModel } catch (e) {
      return set({ state: 'error', model: null, progress: null, detail: `Could not download ${L.fallbackModel}: ${(e as Error).message}` })
    }
  }
  if (!target) return set({ state: 'error', model: null, progress: null, detail: `Ollama has no ${L.model} or ${L.fallbackModel}. Run: ollama pull ${L.fallbackModel}` })

  if (st.state !== 'ready' || st.model !== target) {
    try { await warm(target) } catch (e) { return set({ state: 'error', model: null, progress: null, detail: `${target} could not be loaded: ${(e as Error).message}` }) }
  }
  set({ state: 'ready', model: target, fineTuned: target.startsWith(FT), progress: null, detail: target.startsWith(FT) ? 'Fine-tuned recallia-remember model is ready.' : `${target} is ready${L.model === FT ? ' (the fine-tuned model is not installed yet)' : ''}.` })
}

/** Check now (coalesced); re-check periodically. Safe to call many times. */
export function ensureLocalAi(): Promise<void> {
  running ??= ensureOnce().catch((e) => set({ state: 'error', model: null, progress: null, detail: (e as Error).message })).finally(() => {
    running = null
    if (timer) clearTimeout(timer)
    // Faster re-check while not ready; slow "is it still loaded / did a fine-tuned GGUF appear" check otherwise.
    timer = setTimeout(() => void ensureLocalAi(), st.state === 'ready' ? 5 * 60_000 : 30_000)
    timer.unref()
  })
  return running
}

/* ---------------- generation ---------------- */

export interface ChatMsg { role: 'user' | 'assistant'; content: string }

/**
 * Structured generation on the local Ollama model, streamed. `onProgress` gets the number of characters written so far.
 * Returns null when the local model is not usable right now (caller falls back without inventing anything).
 */
export async function ollamaChatJson(system: string, messages: ChatMsg[], schema: Record<string, unknown>, maxTokens: number, onProgress?: (chars: number) => void): Promise<{ text: string; model: string } | null> {
  if (st.state !== 'ready' || st.server !== 'ollama' || !st.model) return null
  const model = st.model
  let text = ''
  const started = Date.now()
  await streamPost('/api/chat', {
    model, stream: true, keep_alive: L.keepAlive, format: schema,
    messages: [{ role: 'system', content: system }, ...messages],
    options: { temperature: 0.2, top_p: 0.9, num_predict: maxTokens, num_ctx: 8192 },
  }, L.timeoutMs, (j) => {
    const piece = (j.message as { content?: string } | undefined)?.content
    if (piece) { text += piece; onProgress?.(text.length) }
  }, 15 * 60_000)
  log.info('private ai call', { model, ms: Date.now() - started, chars: text.length })
  return { text, model }
}

/** OpenAI-compatible local servers (not Ollama) are called through ai.ts with the configured model. */
export const localOpenAiModel = () => (st.state === 'ready' && st.server === 'openai-compatible' ? st.model : null)
