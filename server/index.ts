import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import { z } from 'zod'
import { agentRouter, companionRouter, storiesRouter } from './assistant.ts'
import { authRouter, csrfGuard, loadUser, requireAuth } from './auth.ts'
import { aiConfigured, bookingConfigured, config, productionWarnings } from './config.ts'
import { probeAi } from './ai.ts'
import { q } from './db.ts'
import { gamesRouter, mediaRouter, memoriesRouter, songsRouter } from './media.ts'
import { attachRealtime } from './realtime.ts'
import { notificationsRouter, pushRouter, remindersRouter, startScheduler } from './reminders.ts'
import { routineRouter } from './routine.ts'
import { scenariosRouter } from './scenarios.ts'
import { careRouter } from './care.ts'
import { rememberRouter } from './remember.ts'
import { ensureLocalAi, localAiStatus } from './local-ai.ts'
import { startStoryWorker } from './story-worker.ts'
import { circleRouter, interactRouter, profileRouter } from './social.ts'
import { errorHandler, log, parse, rateLimit, requestLog, wrap } from './util.ts'

const UNREAL_ORIGIN = (() => {
  try { return config.unrealSignallingUrl ? ' ' + new URL(config.unrealSignallingUrl).origin : '' } catch { log.warn('config', { warning: 'UNREAL_SIGNALLING_URL is not a valid URL' }); return '' }
})()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy)

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()')
  if (config.isProd)
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; img-src 'self' data: blob:; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:${UNREAL_ORIGIN}; script-src 'self'; frame-ancestors 'none'`,
    )
  next()
})
app.use(requestLog)
app.use(express.json({ limit: '100kb' }))
app.use('/api', loadUser, csrfGuard)

app.get('/api/health', wrap(async (req, res) => {
  const deep = req.query.deep === '1' && !config.isProd // live AI probe only outside production (costs a call)
  res.json({ ok: true, ai: aiConfigured(), aiProvider: config.ai.label, booking: bookingConfigured(), unreal: Boolean(config.unrealSignallingUrl), privateAi: { state: localAiStatus().state, model: localAiStatus().model, fineTuned: localAiStatus().fineTuned }, ...(deep ? { aiProbe: await probeAi() } : {}) })
}))
app.use('/api/auth', authRouter)
app.post('/api/contact', rateLimit({ name: 'contact', windowMs: 60_000, max: 5, key: (r) => r.ip ?? 'x' }), wrap((req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(200), message: z.string().trim().min(1).max(3000) }), req.body)
  q.run('INSERT INTO contact_messages (name, email, message, created_at) VALUES (?,?,?,?)', b.name, b.email, b.message, Date.now())
  res.status(201).json({ ok: true })
}))

const api = express.Router()
api.use(requireAuth)
api.use('/profile', profileRouter)
api.use('/circle', circleRouter)
api.use('/interact', interactRouter)
api.use('/routine', routineRouter)
api.use('/reminders', remindersRouter)
api.use('/notifications', notificationsRouter)
api.use('/push', pushRouter)
api.use('/media', mediaRouter)
api.use('/memories', memoriesRouter)
api.use('/songs', songsRouter)
api.use('/games', gamesRouter)
api.use('/companion', companionRouter)
api.use('/stories', storiesRouter)
api.use('/agent', agentRouter)
api.use('/scenarios', scenariosRouter)
api.use('/care', careRouter)
api.use('/remember', rememberRouter)
// 3D home: the Unreal Engine Pixel Streaming signalling server, when one is deployed.
api.get('/sim/config', (_req, res) => { res.json({ unrealSignallingUrl: config.unrealSignallingUrl || null }) })
app.use('/api', api)
app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown endpoint.' } }) })

// Production: serve the built front-end.
const dist = resolve('dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^\/(?!api|ws).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

app.use(errorHandler)

const server = createServer(app)
attachRealtime(server)
startScheduler()
void ensureLocalAi()
startStoryWorker()
for (const w of productionWarnings()) log.warn('config', { warning: w })
server.listen(config.port, () => {
  log.info('server started', { port: config.port, ai: aiConfigured() ? config.ai.provider : 'not configured', booking: bookingConfigured() ? 'fhir' : 'not configured' })
})
