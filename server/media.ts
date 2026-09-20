import { randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readSync, unlink } from 'node:fs'
import { join } from 'node:path'
import { Router, type Request } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { me } from './auth.ts'
import { config } from './config.ts'
import { q } from './db.ts'
import { emit } from './realtime.ts'
import { GAME_IDS } from '../shared/games.ts'
import { logActivity } from './routine.ts'
import { canManagePatient } from './social.ts'
import { localDate } from './time.ts'
import { HttpError, idParam, parse, wrap, zDate } from './util.ts'

mkdirSync(config.storageDir, { recursive: true })

const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|audio\/(mpeg|mp3|mp4|aac|ogg|wav|x-wav|webm|x-m4a)|video\/(mp4|webm|quicktime))$/

/** Files are stored outside the web root with random names and only served through an access-checked route. */
export const upload = multer({
  storage: multer.diskStorage({
    destination: config.storageDir,
    filename: (_req, _file, cb) => cb(null, randomBytes(18).toString('hex')),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.test(file.mimetype)) cb(null, true)
    else cb(new HttpError(415, 'UNSUPPORTED_TYPE', 'Please choose a photo, audio or video file.'))
  },
})

/** Check the file really is the kind of media it claims to be (first bytes), so nothing else can be smuggled in. */
export function sniffOk(path: string, mime: string) {
  const buf = Buffer.alloc(16)
  const fd = openSync(path, 'r')
  try { readSync(fd, buf, 0, 16, 0) } finally { closeSync(fd) }
  const hex = buf.toString('hex')
  const ascii = buf.toString('latin1')
  const ftyp = ascii.slice(4, 8) === 'ftyp' // mp4 / m4a / mov / heic
  if (mime === 'image/jpeg') return hex.startsWith('ffd8ff')
  if (mime === 'image/png') return hex.startsWith('89504e47')
  if (mime === 'image/gif') return ascii.startsWith('GIF8')
  if (mime === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP'
  if (mime === 'image/heic' || mime === 'image/heif') return ftyp
  if (mime.startsWith('audio/')) return ascii.startsWith('ID3') || /^fff[23ab]|^ffe/.test(hex) || ascii.startsWith('OggS') || (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') || ftyp || hex.startsWith('1a45dfa3') || ascii.startsWith('fLaC')
  if (mime.startsWith('video/')) return ftyp || hex.startsWith('1a45dfa3') || ascii.slice(4, 8) === 'moov' || ascii.slice(4, 8) === 'mdat' || ascii.slice(4, 8) === 'wide'
  return false
}

export function saveMedia(req: Request, ownerId: number) {
  const f = req.file
  if (!f) return null
  if (!sniffOk(f.path, f.mimetype)) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'This file does not look like a photo, audio or video file.')
  const used = q.get<{ n: number }>('SELECT COALESCE(SUM(size), 0) n FROM media WHERE owner_id = ?', ownerId)!.n
  if (used + f.size > config.quotaMb * 1024 * 1024) throw new HttpError(413, 'QUOTA', 'This Time Capsule is full. Please remove some older files first.')
  const id = randomBytes(12).toString('hex')
  q.run('INSERT INTO media (id, owner_id, uploader_id, file, mime, size, created_at) VALUES (?,?,?,?,?,?,?)', id, ownerId, me(req).id, f.filename, f.mimetype, f.size, Date.now())
  return id
}
export const discardUpload = (req: Request) => req.file && unlink(req.file.path, () => {})

/** Which patient's space is being acted on (defaults to self). Enforces circle permission. */
function targetPatient(req: Request, raw: unknown) {
  const u = me(req)
  const pid = raw === undefined || raw === '' ? u.id : Number(raw)
  if (!Number.isInteger(pid) || !canManagePatient(u.id, pid)) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this person’s space.')
  return pid
}

/* ---------- serving private media ---------- */
export const mediaRouter = Router()

mediaRouter.get('/:id', wrap((req, res) => {
  const id = String(req.params.id)
  if (!/^[a-f0-9]{24}$/.test(id)) throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  const m = q.get<{ owner_id: number; file: string; mime: string }>('SELECT owner_id, file, mime FROM media WHERE id = ?', id)
  if (!m || !canManagePatient(me(req).id, m.owner_id)) throw new HttpError(404, 'NOT_FOUND', 'Not found.')
  res.setHeader('Content-Type', m.mime)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.setHeader('Content-Disposition', 'inline')
  res.sendFile(join(config.storageDir, m.file), { headers: { 'Content-Type': m.mime } })
}))

/* ---------- Time Capsule memories ---------- */
export const memoriesRouter = Router()

memoriesRouter.get('/', wrap((req, res) => {
  const pid = targetPatient(req, req.query.patientId)
  const memories = q.all(
    `SELECT m.*, a.display_name AS author_name, md.mime,
       (SELECT answer FROM memory_answers WHERE memory_id = m.id ORDER BY id DESC LIMIT 1) AS last_answer
     FROM memories m JOIN users a ON a.id = m.author_id LEFT JOIN media md ON md.id = m.media_id
     WHERE m.patient_id = ? ORDER BY COALESCE(m.happened_on, date(m.created_at/1000,'unixepoch')), m.id`,
    pid,
  )
  res.json({ memories })
}))

const zMemory = z.object({
  patientId: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  happenedOn: zDate.or(z.literal('')).optional(),
  place: z.string().trim().max(120).default(''),
  people: z.string().trim().max(200).default(''),
})

memoriesRouter.post('/', upload.single('file'), wrap((req, res) => {
  try {
    const b = parse(zMemory, req.body)
    const pid = targetPatient(req, b.patientId)
    const mediaId = saveMedia(req, pid)
    const mime = req.file?.mimetype ?? ''
    const kind = mime.startsWith('image/') ? 'photo' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'note'
    if (kind === 'note' && !b.description) throw new HttpError(400, 'VALIDATION', 'Add a photo, recording, video or a written message.')
    const r = q.run(
      'INSERT INTO memories (patient_id, author_id, kind, title, description, happened_on, place, people, media_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      pid, me(req).id, kind, b.title, b.description, b.happenedOn || null, b.place, b.people, mediaId, Date.now(),
    )
    emit(pid, { type: 'memories:changed' })
    res.status(201).json({ memory: q.get('SELECT * FROM memories WHERE id = ?', Number(r.lastInsertRowid)) })
  } catch (e) {
    discardUpload(req)
    throw e
  }
}))

memoriesRouter.delete('/:id', wrap((req, res) => {
  const m = q.get<{ patient_id: number; author_id: number; media_id: string | null }>('SELECT patient_id, author_id, media_id FROM memories WHERE id = ?', idParam(req))
  const u = me(req)
  if (!m || (u.id !== m.patient_id && u.id !== m.author_id)) throw new HttpError(404, 'NOT_FOUND', 'Memory not found.')
  q.run('DELETE FROM memories WHERE id = ?', idParam(req))
  if (m.media_id) {
    const f = q.get<{ file: string }>('SELECT file FROM media WHERE id = ?', m.media_id)
    q.run('DELETE FROM media WHERE id = ?', m.media_id)
    if (f) unlink(join(config.storageDir, f.file), () => {})
  }
  emit(m.patient_id, { type: 'memories:changed' })
  res.json({ ok: true })
}))

memoriesRouter.post('/:id/answer', wrap((req, res) => {
  const u = me(req)
  const m = q.get<{ patient_id: number }>('SELECT patient_id FROM memories WHERE id = ?', idParam(req))
  if (!m || !canManagePatient(u.id, m.patient_id)) throw new HttpError(404, 'NOT_FOUND', 'Memory not found.')
  const b = parse(z.object({ question: z.string().max(200), answer: z.string().trim().min(1).max(1000) }), req.body)
  q.run('INSERT INTO memory_answers (memory_id, user_id, question, answer, created_at) VALUES (?,?,?,?,?)', idParam(req), u.id, b.question, b.answer, Date.now())
  res.json({ ok: true })
}))

memoriesRouter.post('/:id/visit', wrap((req, res) => {
  const m = q.get<{ patient_id: number }>('SELECT patient_id FROM memories WHERE id = ?', idParam(req))
  if (!m || m.patient_id !== me(req).id) throw new HttpError(404, 'NOT_FOUND', 'Memory not found.')
  logActivity(me(req), 'memory_visit', String(idParam(req)))
  res.json({ ok: true })
}))

/* ---------- Today's Song ---------- */
export const songsRouter = Router()

songsRouter.get('/', wrap((req, res) => {
  const pid = targetPatient(req, req.query.patientId)
  const u = q.get<{ timezone: string }>('SELECT timezone FROM users WHERE id = ?', pid)!
  const songs = q.all<{ id: number }>('SELECT s.*, a.display_name AS added_by_name FROM songs s JOIN users a ON a.id = s.added_by WHERE s.user_id = ? ORDER BY s.id', pid)
  const date = localDate(u.timezone)
  let today = q.get<{ song_id: number; position: number }>('SELECT song_id, position FROM song_days WHERE user_id = ? AND local_date = ?', pid, date)
  if (!today && songs.length && pid === me(req).id) {
    // Rotate through the library, one song per day.
    const dayNum = Math.floor(Date.parse(date) / 864e5)
    const pick = songs[dayNum % songs.length].id
    q.run('INSERT OR IGNORE INTO song_days (user_id, local_date, song_id) VALUES (?,?,?)', pid, date, pick)
    today = { song_id: pick, position: 0 }
  }
  res.json({ songs, today: today ?? null, date })
}))

songsRouter.post('/', upload.single('file'), wrap((req, res) => {
  try {
    const b = parse(
      z.object({ patientId: z.string().optional(), title: z.string().trim().min(1).max(120), artist: z.string().trim().max(120).default(''), url: z.string().trim().url().max(1000).optional().or(z.literal('')) }),
      req.body,
    )
    const pid = targetPatient(req, b.patientId)
    if (req.file && !req.file.mimetype.startsWith('audio/')) throw new HttpError(415, 'UNSUPPORTED_TYPE', 'Please choose an audio file.')
    if (!req.file && !b.url) throw new HttpError(400, 'VALIDATION', 'Choose an audio file or paste a link to one.')
    if (b.url && !/^https:\/\//.test(b.url)) throw new HttpError(400, 'VALIDATION', 'Links must start with https://')
    const mediaId = saveMedia(req, pid)
    const r = q.run('INSERT INTO songs (user_id, added_by, title, artist, media_id, url, created_at) VALUES (?,?,?,?,?,?,?)', pid, me(req).id, b.title, b.artist, mediaId, mediaId ? null : b.url || null, Date.now())
    emit(pid, { type: 'songs:changed' })
    res.status(201).json({ song: q.get('SELECT * FROM songs WHERE id = ?', Number(r.lastInsertRowid)) })
  } catch (e) {
    discardUpload(req)
    throw e
  }
}))

songsRouter.delete('/:id', wrap((req, res) => {
  const s = q.get<{ user_id: number; added_by: number; media_id: string | null }>('SELECT user_id, added_by, media_id FROM songs WHERE id = ?', idParam(req))
  const u = me(req)
  if (!s || (u.id !== s.user_id && u.id !== s.added_by)) throw new HttpError(404, 'NOT_FOUND', 'Song not found.')
  q.run('DELETE FROM songs WHERE id = ?', idParam(req))
  if (s.media_id) {
    const f = q.get<{ file: string }>('SELECT file FROM media WHERE id = ?', s.media_id)
    q.run('DELETE FROM media WHERE id = ?', s.media_id)
    if (f) unlink(join(config.storageDir, f.file), () => {})
  }
  emit(s.user_id, { type: 'songs:changed' })
  res.json({ ok: true })
}))

/** Choose a specific song for today, or save listening position. */
songsRouter.put('/today', wrap((req, res) => {
  const u = me(req)
  const b = parse(z.object({ songId: z.number().int(), position: z.number().min(0).max(36000).default(0) }), req.body)
  if (!q.get('SELECT 1 FROM songs WHERE id = ? AND user_id = ?', b.songId, u.id)) throw new HttpError(404, 'NOT_FOUND', 'Song not found.')
  q.run(
    'INSERT INTO song_days (user_id, local_date, song_id, position) VALUES (?,?,?,?) ON CONFLICT(user_id, local_date) DO UPDATE SET song_id = excluded.song_id, position = excluded.position',
    u.id, localDate(u.timezone), b.songId, b.position,
  )
  res.json({ ok: true })
}))

songsRouter.post('/:id/note', wrap((req, res) => {
  const u = me(req)
  if (!q.get('SELECT 1 FROM songs WHERE id = ? AND user_id = ?', idParam(req), u.id)) throw new HttpError(404, 'NOT_FOUND', 'Song not found.')
  const { note } = parse(z.object({ note: z.string().trim().min(1).max(1000) }), req.body)
  q.run('INSERT INTO song_notes (user_id, song_id, note, created_at) VALUES (?,?,?,?)', u.id, idParam(req), note, Date.now())
  res.json({ ok: true })
}))

/* ---------- Games ---------- */
export const gamesRouter = Router()

gamesRouter.get('/', (req, res) => {
  const u = me(req)
  const stats = q.all(
    `SELECT game, COUNT(*) plays, MAX(level) best_level, MAX(CAST(score AS REAL) / max_score) best_ratio, MAX(created_at) last_played
     FROM game_results WHERE user_id = ? GROUP BY game`, u.id)
  const recent = q.all('SELECT * FROM game_results WHERE user_id = ? ORDER BY id DESC LIMIT 20', u.id)
  res.json({ stats, recent })
})

gamesRouter.post('/results', wrap((req, res) => {
  const u = me(req)
  const b = parse(
    z.object({
      game: z.enum(GAME_IDS),
      level: z.number().int().min(1).max(10),
      score: z.number().int().min(0).max(1000),
      maxScore: z.number().int().min(1).max(1000),
      durationMs: z.number().int().min(0).max(36e5),
    }).refine((x) => x.score <= x.maxScore),
    req.body,
  )
  q.run('INSERT INTO game_results (user_id, game, level, score, max_score, duration_ms, created_at) VALUES (?,?,?,?,?,?,?)', u.id, b.game, b.level, b.score, b.maxScore, b.durationMs, Date.now())
  logActivity(u, 'game_completed', b.game)
  res.status(201).json({ ok: true })
}))
