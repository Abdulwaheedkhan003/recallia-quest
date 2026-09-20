import { getLanguage } from '../shared/languages.ts'
import { aiConfigured, config } from './config.ts'
import { ensureLocalAi, localAiStatus, localOpenAiModel, ollamaChatJson } from './local-ai.ts'
import { HttpError, log } from './util.ts'

export interface ChatMsg { role: 'user' | 'assistant'; content: string }
export type JsonSchema = Record<string, unknown>

/** Environment variables the operator must set to enable AI. Reported to the UI when missing. */
export const AI_REQUIREMENTS = [
  'AI_PROVIDER=anthropic + ANTHROPIC_API_KEY (optional ANTHROPIC_MODEL, default claude-sonnet-5)',
  'or AI_PROVIDER=groq + GROQ_API_KEY (optional GROQ_MODEL, default openai/gpt-oss-120b)',
  'or AI_PROVIDER=ollama + OLLAMA_MODEL (optional OPENAI_BASE_URL, default http://localhost:11434/v1)',
  'or AI_PROVIDER=openai + OPENAI_BASE_URL + OPENAI_MODEL + OPENAI_API_KEY (any OpenAI-compatible server)',
]

export function assertAi() {
  if (!aiConfigured()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'The AI companion is not connected yet.', { required: AI_REQUIREMENTS })
}

export const languageName = (code: string) => getLanguage(code).name

class ProviderError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs = config.ai.timeoutMs) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    const err = j.error as { message?: string } | string | undefined
    throw new ProviderError(r.status, typeof err === 'string' ? err : err?.message ?? `HTTP ${r.status}`)
  }
  return j
}

/* ---------- Anthropic Messages API ---------- */
async function anthropic(system: string, messages: ChatMsg[], maxTokens: number, schema?: JsonSchema): Promise<string> {
  const a = config.ai
  const outputConfig: Record<string, unknown> = {}
  if (schema) outputConfig.format = { type: 'json_schema', schema }
  if (a.anthropicEffort) outputConfig.effort = a.anthropicEffort
  const body = { model: a.anthropicModel, max_tokens: maxTokens, system, messages, ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}) }
  const headers = { 'x-api-key': a.anthropicKey, 'anthropic-version': '2023-06-01' }
  let j: Record<string, unknown>
  try {
    j = await post(`${a.anthropicBase}/v1/messages`, headers, body)
  } catch (e) {
    // Some models don't accept `effort`; retry once without it rather than failing the user.
    if (e instanceof ProviderError && e.status === 400 && /effort/i.test(e.message) && outputConfig.effort) {
      delete outputConfig.effort
      j = await post(`${a.anthropicBase}/v1/messages`, headers, { ...body, output_config: Object.keys(outputConfig).length ? outputConfig : undefined })
    } else throw e
  }
  if (j.stop_reason === 'refusal') throw new ProviderError(422, 'model refused')
  return ((j.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('')
}

/* ---------- OpenAI-compatible Chat Completions (OpenAI, Ollama, LM Studio, vLLM…) ---------- */
interface OpenAiTarget { openaiBase: string; openaiKey: string; openaiModel: string; isGroq: boolean; reasoningEffort: string; timeoutMs?: number }

async function openaiCompatible(system: string, messages: ChatMsg[], maxTokens: number, schema?: JsonSchema, a: OpenAiTarget = config.ai): Promise<string> {
  const headers: Record<string, string> = a.openaiKey ? { authorization: `Bearer ${a.openaiKey}` } : {}
  const base: Record<string, unknown> = { model: a.openaiModel, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] }
  // Groq's gpt-oss models reason before answering (those tokens count toward max_tokens).
  if (a.isGroq && /gpt-oss|qwen3/i.test(a.openaiModel) && a.reasoningEffort) {
    base.reasoning_effort = a.reasoningEffort
    base.max_tokens = maxTokens + 1500
  }
  const formats: (Record<string, unknown> | undefined)[] = schema
    ? [{ type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } }, { type: 'json_object' }, undefined]
    : [undefined]
  let last: unknown
  for (const response_format of formats) {
    try {
      const j = await post(`${a.openaiBase}/chat/completions`, headers, response_format ? { ...base, response_format } : base, a.timeoutMs)
      return (j.choices as { message: { content: string } }[])?.[0]?.message.content ?? ''
    } catch (e) {
      last = e
      // Server doesn't support this response_format → fall back to a simpler one.
      if (!(e instanceof ProviderError && e.status === 400)) throw e
    }
  }
  throw last
}

async function run(system: string, messages: ChatMsg[], maxTokens: number, schema?: JsonSchema) {
  assertAi()
  const started = Date.now()
  try {
    const text = config.ai.provider === 'anthropic' ? await anthropic(system, messages, maxTokens, schema) : await openaiCompatible(system, messages, maxTokens, schema)
    log.info('ai call', { provider: config.ai.label, ms: Date.now() - started })
    return text
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 0
    const timeout = (e as Error).name === 'TimeoutError'
    log.error('ai call failed', { provider: config.ai.label, status, err: (e as Error).message.slice(0, 200) })
    if (status === 401 || status === 403) throw new HttpError(502, 'AI_AUTH', 'The AI service rejected our credentials. The person who runs Recallia needs to check the API key.')
    if (status === 429 || status === 529) throw new HttpError(503, 'AI_BUSY', 'The AI service is busy. Please try again in a minute.')
    if (timeout) throw new HttpError(504, 'AI_TIMEOUT', 'The AI service took too long to answer. Please try again.')
    throw new HttpError(502, 'AI_UNAVAILABLE', 'The AI service did not answer. Please try again in a moment.')
  }
}

/** Free-text completion. */
export const complete = (system: string, messages: ChatMsg[], maxTokens = 800) => run(system, messages, maxTokens)

/** Completion constrained to a JSON schema (native structured output where the provider supports it). */
export async function completeJson<T>(system: string, messages: ChatMsg[], schema: JsonSchema, maxTokens = 800): Promise<T | null> {
  return parseJsonReply<T>(await run(system, messages, maxTokens, schema))
}

/** Extract the first JSON object from a model reply. */
export function parseJsonReply<T>(text: string): T | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

/** Lightweight connectivity check used by `npm run check:ai` and /api/health?deep=1. */
export async function probeAi(): Promise<{ ok: boolean; provider: string; model: string; detail: string }> {
  const model = config.ai.provider === 'anthropic' ? config.ai.anthropicModel : config.ai.openaiModel
  if (!aiConfigured()) return { ok: false, provider: config.ai.label, model, detail: 'not configured' }
  try {
    const r = await completeJson<{ ok: boolean }>('Reply with JSON only.', [{ role: 'user', content: 'Return {"ok": true}' }], {
      type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false,
    }, 50)
    return { ok: r?.ok === true, provider: config.ai.label, model, detail: r ? 'structured reply received' : 'reply was not valid JSON' }
  } catch (e) {
    return { ok: false, provider: config.ai.label, model, detail: (e as Error).message }
  }
}

/* ======================= Private (local) model ======================= */
/**
 * Family memories, photos' descriptions and patient activity are private. They go ONLY to the local
 * model (Ollama / LM Studio / any OpenAI-compatible server on this machine or your own network),
 * unless the operator explicitly sets PRIVATE_AI_ALLOW_CLOUD=true.
 */
export const privateAiInfo = () => ({
  local: config.localAi.enabled ? { base: config.localAi.base, model: localAiStatus().model ?? config.localAi.model, state: localAiStatus().state } : null,
  cloudAllowed: config.localAi.allowCloud && aiConfigured(),
})

export async function completeJsonPrivate<T>(system: string, messages: ChatMsg[], schema: JsonSchema, maxTokens = 1500, onProgress?: (chars: number) => void): Promise<{ data: T | null; via: string }> {
  const l = config.localAi
  if (l.enabled) {
    const started = Date.now()
    try {
      const r = await ollamaChatJson(system, messages, schema, maxTokens, onProgress)
      if (r) return { data: parseJsonReply<T>(r.text), via: `local:${r.model}` }
      const model = localOpenAiModel()
      if (model) {
        const text = await openaiCompatible(system, messages, maxTokens, schema, { openaiBase: l.base, openaiKey: l.key, openaiModel: model, isGroq: false, reasoningEffort: '', timeoutMs: l.timeoutMs * 3 })
        log.info('private ai call', { via: 'local', model, ms: Date.now() - started })
        return { data: parseJsonReply<T>(text), via: `local:${model}` }
      }
      throw new Error(localAiStatus().detail)
    } catch (e) {
      log.warn('local model unavailable', { err: (e as Error).message.slice(0, 160) })
      void ensureLocalAi() // re-check (e.g. Ollama was closed) so the next request can use it again
      if (!(l.allowCloud && aiConfigured())) throw new HttpError(503, 'LOCAL_AI_UNAVAILABLE', 'The private (local) AI model is not running.')
    }
  } else if (!(l.allowCloud && aiConfigured())) throw new HttpError(503, 'LOCAL_AI_UNAVAILABLE', 'No private (local) AI model is configured.')
  // Only reached when the operator explicitly allowed cloud AI for private data.
  return { data: await completeJson<T>(system, messages, schema, maxTokens), via: `cloud:${config.ai.label}` }
}
