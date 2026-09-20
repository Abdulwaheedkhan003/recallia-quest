import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Router, type Request, type RequestHandler } from 'express'
import { z } from 'zod'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.ts'
import { q, tx } from './db.ts'
import { retimezoneReminders } from './reminders.ts'
import { seedRoutine } from './routine.ts'
import { isValidTz } from './time.ts'
import { HttpError, parse, rateLimit, wrap } from './util.ts'

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>
const COOKIE = 'rq_session'
const SESSION_DAYS = 30

export interface User {
  id: number
  email: string
  display_name: string
  role: 'patient' | 'family'
  lang: string
  timezone: string
  discoverable: number
  show_presence: number
  fhir_patient_id: string | null
  created_at: number
}
export const USER_COLS = 'id, email, display_name, role, lang, timezone, discoverable, show_presence, fhir_patient_id, created_at'

declare module 'express-serve-static-core' {
  interface Request { user?: User }
}

async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}
async function verifyPassword(pw: string, stored: string) {
  const [, s, k] = stored.split('$')
  if (!s || !k) return false
  const key = await scrypt(pw, Buffer.from(s, 'base64'), 64)
  const expected = Buffer.from(k, 'base64')
  return key.length === expected.length && timingSafeEqual(key, expected)
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
// Used to spend the same time on unknown emails as on wrong passwords (no account enumeration by timing).
const DUMMY_HASH = `scrypt$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

export function userFromCookieHeader(header: string | undefined): User | undefined {
  const token = readCookie(header, COOKIE)
  if (!token) return undefined
  return q.get<User>(
    `SELECT ${USER_COLS.split(', ').map((c) => 'u.' + c).join(', ')} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha(token), Date.now(),
  )
}

function startSession(res: import('express').Response, userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expires = Date.now() + SESSION_DAYS * 864e5
  q.run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)', sha(token), userId, expires, Date.now())
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires: new Date(expires), path: '/' })
}

/** Attach req.user when a valid session cookie is present. */
export const loadUser: RequestHandler = (req, _res, next) => {
  req.user = userFromCookieHeader(req.headers.cookie)
  next()
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'AUTH_REQUIRED', 'Please sign in again.'))
  next()
}

/**
 * CSRF defence for cookie auth: state-changing API calls must come from our own
 * front-end (custom header cannot be set cross-site without CORS preflight).
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  if (req.headers['x-requested-with'] !== 'recallia') return next(new HttpError(403, 'CSRF', 'Request blocked.'))
  if (!originAllowed(req.headers.origin, req.headers.host)) return next(new HttpError(403, 'CSRF', 'Request blocked.'))
  next()
}

/** Same-origin check for browsers that send Origin (all modern ones on POST and WebSocket). */
export function originAllowed(origin: string | undefined, host: string | undefined) {
  if (!origin) return true // non-browser clients; the custom header still applies
  if (config.appOrigins.length) return config.appOrigins.includes(origin.replace(/\/$/, ''))
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export const me = (req: Request) => req.user as User

const authLimiter = rateLimit({ name: 'auth', windowMs: 60_000, max: 10, key: (r) => r.ip ?? 'x' })

const zRegister = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8, 'at least 8 characters').max(200),
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(['patient', 'family']).default('patient'),
  lang: z.string().max(10).default('en'),
  timezone: z.string().max(60).refine(isValidTz, 'unknown timezone').default('UTC'),
})

export const authRouter = Router()

authRouter.post('/register', authLimiter, wrap(async (req, res) => {
  const b = parse(zRegister, req.body)
  if (q.get('SELECT id FROM users WHERE email = ?', b.email)) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.')
  const hash = await hashPassword(b.password)
  const id = tx(() => {
    const r = q.run(
      'INSERT INTO users (email, password_hash, display_name, role, lang, timezone, created_at) VALUES (?,?,?,?,?,?,?)',
      b.email, hash, b.displayName, b.role, b.lang, b.timezone, Date.now(),
    )
    const uid = Number(r.lastInsertRowid)
    if (b.role === 'patient') seedRoutine(uid)
    return uid
  })
  startSession(res, id)
  res.status(201).json({ user: q.get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, id) })
}))

authRouter.post('/login', authLimiter, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().max(200), password: z.string().max(200), timezone: z.string().optional() }), req.body)
  const row = q.get<{ id: number; password_hash: string }>('SELECT id, password_hash FROM users WHERE email = ?', b.email)
  const ok = await verifyPassword(b.password, row?.password_hash ?? DUMMY_HASH)
  if (!row || !ok) throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is not right.')
  if (b.timezone && isValidTz(b.timezone)) {
    q.run('UPDATE users SET timezone = ? WHERE id = ?', b.timezone, row.id)
    retimezoneReminders(row.id, b.timezone)
  }
  q.run('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', row.id, Date.now())
  startSession(res, row.id)
  res.json({ user: q.get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, row.id) })
}))

/** Onboarding helper: is there already an account for this email? (rate-limited; answers only yes/no) */
authRouter.post('/email-status', authLimiter, wrap((req, res) => {
  const b = parse(z.object({ email: z.string().trim().email().max(200) }), req.body)
  res.json({ exists: Boolean(q.get('SELECT 1 FROM users WHERE email = ?', b.email)) })
}))

/**
 * A caretaker-created ("managed") patient has no password. Their own device is signed in with a
 * short one-time pairing code that the caretaker generates (hash stored, 15-minute expiry, single use).
 */
export const hashPairCode = (code: string) => sha('pair:' + code.toUpperCase().replace(/[^A-Z0-9]/g, ''))
export async function createManagedPatient(displayName: string, lang: string, timezone: string) {
  const email = `patient-${randomBytes(9).toString('hex')}@managed.recallia.invalid`
  const hash = await hashPassword(randomBytes(32).toString('base64')) // unusable: nobody knows it
  const r = q.run('INSERT INTO users (email, password_hash, display_name, role, lang, timezone, created_at) VALUES (?,?,?,?,?,?,?)',
    email, hash, displayName, 'patient', lang, isValidTz(timezone) ? timezone : 'UTC', Date.now())
  const id = Number(r.lastInsertRowid)
  seedRoutine(id)
  return id
}

authRouter.post('/pair', authLimiter, wrap((req, res) => {
  const b = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body)
  const row = q.get<{ patient_id: number; expires_at: number; used_at: number | null }>('SELECT patient_id, expires_at, used_at FROM pair_codes WHERE code_hash = ?', hashPairCode(b.code))
  if (!row || row.used_at || row.expires_at < Date.now()) throw new HttpError(404, 'PAIR_INVALID', 'This code is not valid or has expired. Please ask for a new one.')
  q.run('UPDATE pair_codes SET used_at = ? WHERE code_hash = ?', Date.now(), hashPairCode(b.code))
  startSession(res, row.patient_id)
  res.json({ user: q.get<User>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, row.patient_id) })
}))

authRouter.post('/logout', (req, res) => {
  const token = readCookie(req.headers.cookie, COOKIE)
  if (token) q.run('DELETE FROM sessions WHERE token_hash = ?', sha(token))
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  if (!req.user) { res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Not signed in.' } }); return }
  res.json({ user: req.user })
})

authRouter.post('/password', authLimiter, wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in again.')
  const b = parse(z.object({ current: z.string().max(200), next: z.string().min(8, 'at least 8 characters').max(200) }), req.body)
  const row = q.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', req.user.id)!
  if (!(await verifyPassword(b.current, row.password_hash))) throw new HttpError(401, 'BAD_CREDENTIALS', 'The current password is not right.')
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(b.next), req.user.id)
  // Sign out every other device.
  q.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', req.user.id, sha(readCookie(req.headers.cookie, COOKIE) ?? ''))
  res.json({ ok: true })
}))

/** Permanently delete the account, its data and its private files. */
authRouter.post('/delete-account', authLimiter, wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in again.')
  const b = parse(z.object({ password: z.string().max(200) }), req.body)
  const row = q.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', req.user.id)!
  if (!(await verifyPassword(b.password, row.password_hash))) throw new HttpError(401, 'BAD_CREDENTIALS', 'The password is not right.')
  const files = q.all<{ file: string }>('SELECT file FROM media WHERE owner_id = ?1 OR uploader_id = ?1', req.user.id)
  // Rows that reference this user without ON DELETE CASCADE are removed first.
  q.run('DELETE FROM memories WHERE author_id = ?', req.user.id)
  q.run('DELETE FROM songs WHERE added_by = ?', req.user.id)
  q.run('UPDATE invites SET used_by = NULL WHERE used_by = ?', req.user.id)
  q.run('DELETE FROM users WHERE id = ?', req.user.id)
  for (const f of files) rmSync(join(config.storageDir, f.file), { force: true })
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
}))
