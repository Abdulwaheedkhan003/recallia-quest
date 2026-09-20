import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

if (existsSync('.env')) process.loadEnvFile('.env')
const env = process.env

const provider = (env.AI_PROVIDER ?? '').toLowerCase() as '' | 'anthropic' | 'openai' | 'ollama' | 'groq'
const GROQ_BASE = 'https://api.groq.com/openai/v1'

export const config = {
  port: Number(env.PORT ?? 8787),
  isProd: env.NODE_ENV === 'production' || process.argv.includes('--production'),
  dbPath: resolve(env.DATABASE_PATH ?? 'data/recallia.db'),
  storageDir: resolve(env.STORAGE_DIR ?? 'data/storage'),
  /** Public origin(s) of the app, e.g. https://recallia.example.org — used for CSRF/WebSocket origin checks. */
  appOrigins: (env.APP_ORIGIN ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  /** Set true when served over HTTPS so cookies are Secure and HSTS is sent. */
  cookieSecure: env.COOKIE_SECURE === 'true',
  /** Express "trust proxy" setting (e.g. "1" behind one reverse proxy). */
  trustProxy: env.TRUST_PROXY ?? 'loopback',
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 50),
  /** Total private media allowed per person (MB). */
  quotaMb: Number(env.STORAGE_QUOTA_MB ?? 2048),

  ai: {
    /** 'anthropic' | 'openai' (any OpenAI-compatible server) | 'ollama' (OpenAI-compatible, local) | 'groq' (OpenAI-compatible, hosted) */
    provider: provider === 'ollama' || provider === 'groq' ? ('openai' as const) : provider,
    isGroq: provider === 'groq',
    label: provider || 'none',
    anthropicKey: env.ANTHROPIC_API_KEY ?? '',
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    /** Optional effort for models that support it (low keeps the companion quick). Set to "" to omit. */
    anthropicEffort: env.ANTHROPIC_EFFORT ?? 'low',
    anthropicBase: (env.RQ_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
    openaiBase: (provider === 'groq' ? env.GROQ_BASE_URL ?? GROQ_BASE : env.OPENAI_BASE_URL ?? (provider === 'ollama' ? 'http://localhost:11434/v1' : '')).replace(/\/$/, ''),
    openaiKey: (provider === 'groq' ? env.GROQ_API_KEY : env.OPENAI_API_KEY) ?? '',
    openaiModel: provider === 'groq' ? env.GROQ_MODEL ?? 'openai/gpt-oss-120b' : env.OPENAI_MODEL ?? env.OLLAMA_MODEL ?? '',
    /** Groq reasoning models (gpt-oss) think before answering; "low" keeps replies quick. Set "" to omit. */
    reasoningEffort: env.GROQ_REASONING_EFFORT ?? 'low',
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 90_000),
  },

  /** Private AI for family memories + activity reports. Defaults to a local Ollama server; never the cloud unless allowed. */
  localAi: {
    enabled: (env.LOCAL_AI ?? 'on').toLowerCase() !== 'off',
    base: (env.LOCAL_AI_BASE_URL ?? (provider === 'ollama' ? env.OPENAI_BASE_URL : undefined) ?? 'http://localhost:11434/v1').replace(/\/$/, ''),
    key: env.LOCAL_AI_API_KEY ?? '',
    /** Preferred private model. The fine-tuned "recallia-remember" is built automatically from finetune/*.gguf when present. */
    model: env.LOCAL_AI_MODEL ?? env.OLLAMA_MODEL ?? 'recallia-remember',
    /** Used while the preferred model is not available (downloaded automatically by Ollama on first start). */
    fallbackModel: env.LOCAL_AI_FALLBACK_MODEL ?? 'qwen2.5:3b',
    /** Download / build the private model automatically when Recallia starts (Ollama only). */
    autoSetup: (env.LOCAL_AI_AUTO_SETUP ?? 'on').toLowerCase() !== 'off',
    gguf: env.LOCAL_AI_GGUF ?? 'finetune/recallia-remember.Q4_K_M.gguf',
    modelfile: env.LOCAL_AI_MODELFILE ?? 'finetune/Modelfile',
    /** How long Ollama keeps the model loaded in memory between requests (keeps replies instant). */
    keepAlive: env.LOCAL_AI_KEEP_ALIVE ?? '30m',
    /** Give up when the model produces nothing for this long (a running story may take longer in total on a CPU). */
    timeoutMs: Number(env.LOCAL_AI_TIMEOUT_MS ?? 120_000),
    /** Build stories in the background as soon as a caretaker adds something, so they are ready instantly. */
    prebuild: (env.LOCAL_AI_PREBUILD ?? 'on').toLowerCase() !== 'off',
    allowCloud: env.PRIVATE_AI_ALLOW_CLOUD === 'true',
  },

  booking: {
    /** FHIR R4 server that exposes Slot search and Appointment create. */
    fhirBase: (env.FHIR_BASE_URL ?? '').replace(/\/$/, ''),
    fhirToken: env.FHIR_BEARER_TOKEN ?? '',
    providerName: env.BOOKING_PROVIDER_NAME ?? 'Connected hospital',
  },

  push: {
    subject: env.VAPID_SUBJECT ?? '',
    publicKey: env.VAPID_PUBLIC_KEY ?? '',
    privateKey: env.VAPID_PRIVATE_KEY ?? '',
  },

  /** Unreal Engine Pixel Streaming signalling server for the 3D home (e.g. wss://ue.example.org). */
  unrealSignallingUrl: env.UNREAL_SIGNALLING_URL ?? '',
}

export function aiConfigured(): boolean {
  const a = config.ai
  if (a.provider === 'anthropic') return Boolean(a.anthropicKey)
  if (a.isGroq) return Boolean(a.openaiKey && a.openaiModel)
  if (a.provider === 'openai') return Boolean(a.openaiBase && a.openaiModel)
  return false
}

export const bookingConfigured = () => Boolean(config.booking.fhirBase)

/** Warn loudly at startup about unsafe production settings. */
export function productionWarnings(): string[] {
  const w: string[] = []
  if (!config.isProd) return w
  if (!config.cookieSecure) w.push('COOKIE_SECURE is not "true" — serve over HTTPS and set it, or sessions travel unencrypted.')
  if (!config.appOrigins.length) w.push('APP_ORIGIN is not set — set it to your public https origin for strict origin checks.')
  if (!config.push.subject) w.push('VAPID_SUBJECT is not set — push services require a contact (mailto: or https: URL).')
  return w
}
