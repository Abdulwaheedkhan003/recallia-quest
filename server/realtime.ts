import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { originAllowed, userFromCookieHeader } from './auth.ts'
import { q } from './db.ts'
import { log } from './util.ts'

/**
 * Realtime hub: one authenticated WebSocket per browser tab.
 * The server pushes events to a user's every open session (chat, presence,
 * task sync, reminders). Clients never send data over the socket except pings;
 * all writes go through the authenticated REST API.
 */
const sockets = new Map<number, Set<WebSocket>>()

export type RtEvent =
  | { type: 'message'; message: unknown }
  | { type: 'presence'; userId: number; online: boolean }
  | { type: 'tasks:changed' }
  | { type: 'handbook:changed' }
  | { type: 'reminders:changed' }
  | { type: 'notification'; notification: unknown }
  | { type: 'memories:changed' }
  | { type: 'songs:changed' }
  | { type: 'monitor'; patientId: number; event: unknown }
  | { type: 'care:changed'; patientId?: number; what: string }
  | { type: 'ai:local'; status: unknown }
  | { type: 'story:progress'; patientId: number; personId: number; phase: 'queued' | 'writing' | 'done' | 'failed'; chars?: number; generator?: string }

export function emit(userId: number, ev: RtEvent) {
  const set = sockets.get(userId)
  if (!set) return
  const data = JSON.stringify(ev)
  for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data)
}

export const isOnline = (userId: number) => (sockets.get(userId)?.size ?? 0) > 0

/** Users allowed to see this user's presence: circle links + people they've messaged with. */
function presenceAudience(userId: number): number[] {
  const u = q.get<{ show_presence: number; discoverable: number }>('SELECT show_presence, discoverable FROM users WHERE id = ?', userId)
  if (!u?.show_presence) return []
  // Circle members always; other discoverable users only if this user is discoverable too.
  return q.all<{ id: number }>(
    `SELECT member_id AS id FROM circle_links WHERE patient_id = ?1
     UNION SELECT patient_id FROM circle_links WHERE member_id = ?1
     UNION SELECT id FROM users WHERE ?2 = 1 AND discoverable = 1 AND id != ?1`,
    userId, u.discoverable,
  ).map((r) => r.id)
}

function broadcastPresence(userId: number, online: boolean) {
  for (const id of presenceAudience(userId)) emit(id, { type: 'presence', userId, online })
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws')) return socket.destroy()
    // Block cross-site WebSocket hijacking.
    if (!originAllowed(req.headers.origin, req.headers.host)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      return socket.destroy()
    }
    const user = userFromCookieHeader(req.headers.cookie)
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      return socket.destroy()
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let set = sockets.get(user.id)
      const wasOffline = !set?.size
      if (!set) sockets.set(user.id, (set = new Set()))
      set.add(ws)
      if (wasOffline) broadcastPresence(user.id, true)
      ws.send(JSON.stringify({ type: 'hello', userId: user.id }))

      let alive = true
      ws.on('pong', () => (alive = true))
      ws.on('message', (raw) => { if (String(raw) === 'ping') ws.send('{"type":"pong"}') })
      const hb = setInterval(() => {
        if (!alive) return ws.terminate()
        alive = false
        ws.ping()
      }, 30_000)

      ws.on('close', () => {
        clearInterval(hb)
        set!.delete(ws)
        if (!set!.size) {
          sockets.delete(user.id)
          broadcastPresence(user.id, false)
        }
      })
      ws.on('error', (e) => log.warn('ws error', { err: e.message }))
    })
  })
}
