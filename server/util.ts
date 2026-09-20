import type { NextFunction, Request, Response, RequestHandler } from 'express'
import { z, ZodError } from 'zod'

/* ---------- errors ---------- */
export class HttpError extends Error {
  status: number
  code: string
  extra?: Record<string, unknown>
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const wrap =
  (fn: (req: Request, res: Response) => unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res)).catch(next)

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data)
  if (!r.success) throw new HttpError(400, 'VALIDATION', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } })
    return
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: err.message } })
    return
  }
  const e = err as { type?: string; code?: string; message?: string }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request was not valid.' } })
    return
  }
  if (e?.type === 'entity.too.large' || e?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That file is too large.' } })
    return
  }
  log.error('unhandled', { path: req.path, err: e?.message })
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } })
}

/* ---------- logging (never logs bodies or personal content) ---------- */
export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), lvl: 'info', msg, ...meta })),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(JSON.stringify({ t: new Date().toISOString(), lvl: 'warn', msg, ...meta })),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', msg, ...meta })),
}

export const requestLog: RequestHandler = (req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return
    log.info('req', { m: req.method, p: req.route?.path ?? req.path.replace(/\d+/g, ':n'), s: res.statusCode, ms: Date.now() - start })
  })
  next()
}

/* ---------- rate limiting (in-memory fixed window) ---------- */
export function rateLimit(opts: { windowMs: number; max: number; key: (req: Request) => string; name: string }): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>()
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  }, opts.windowMs).unref()
  return (req, res, next) => {
    const k = `${opts.name}:${opts.key(req)}`
    const now = Date.now()
    const h = hits.get(k)
    if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + opts.windowMs })
    else if (++h.n > opts.max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000))
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' } })
      return
    }
    next()
  }
}

/* ---------- common schemas ---------- */
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const zDays = z.string().regex(/^[0-6]{0,7}$/)
export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name])
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'VALIDATION', `Invalid ${name}`)
  return n
}
