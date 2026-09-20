import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config } from './config.ts'
import { log } from './util.ts'

/**
 * Field-level encryption for especially sensitive values (phone numbers).
 * AES-256-GCM. The key comes from FIELD_ENCRYPTION_KEY (base64, 32 bytes) or, if unset,
 * a key file generated once next to the database (data/field.key, owner-read-only).
 * Keep that key out of backups of the database, or a stolen DB file still reveals nothing.
 */
function loadKey(): Buffer {
  const env = process.env.FIELD_ENCRYPTION_KEY
  if (env) {
    const k = Buffer.from(env, 'base64')
    if (k.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
    return k
  }
  const file = resolve(dirname(config.dbPath), 'field.key')
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64')
  mkdirSync(dirname(file), { recursive: true })
  const k = randomBytes(32)
  writeFileSync(file, k.toString('base64'), { mode: 0o600 })
  try { chmodSync(file, 0o600) } catch { /* Windows: ACLs apply */ }
  log.info('field encryption key created', { file: 'data/field.key' })
  return k
}
let key: Buffer | null = null
const K = () => (key ??= loadKey())

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', K(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${body.toString('base64')}`
}

export function decrypt(stored: string | null): string | null {
  if (!stored) return null
  try {
    const [v, iv, tag, body] = stored.split(':')
    if (v !== 'v1') return null
    const d = createDecipheriv('aes-256-gcm', K(), Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8')
  } catch {
    log.warn('field decrypt failed')
    return null
  }
}

/** Show only the last digits in lists. */
export const maskPhone = (p: string | null) => (p ? `•••• ${p.replace(/\D/g, '').slice(-3)}` : null)
