import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './auth'

export type RtEvent = { type: string; [k: string]: unknown }
type Listener = (e: RtEvent) => void
type Conn = 'connecting' | 'online' | 'reconnecting' | 'offline'

interface Ctx { status: Conn; subscribe: (fn: Listener) => () => void }
const RealtimeContext = createContext<Ctx | null>(null)

/**
 * One WebSocket per tab, authenticated by the session cookie.
 * Reconnects with backoff; after a reconnect it emits `{type:'resync'}`
 * so screens reload anything they may have missed.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status: auth } = useAuth()
  const [status, setStatus] = useState<Conn>('connecting')
  const listeners = useRef(new Set<Listener>())

  useEffect(() => {
    if (auth !== 'authed') return
    let ws: WebSocket | null = null
    let tries = 0
    let timer: number | undefined
    let stopped = false
    let everOpen = false

    const dispatch = (e: RtEvent) => listeners.current.forEach((fn) => fn(e))
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onopen = () => {
        if (everOpen) dispatch({ type: 'resync' })
        everOpen = true
        tries = 0
        setStatus('online')
      }
      ws.onmessage = (m) => {
        try { dispatch(JSON.parse(m.data)) } catch { /* ignore malformed */ }
      }
      ws.onclose = () => {
        if (stopped) return
        setStatus(navigator.onLine ? 'reconnecting' : 'offline')
        timer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** tries++))
      }
    }
    connect()
    const onOnline = () => { clearTimeout(timer); tries = 0; if (ws?.readyState !== WebSocket.OPEN) connect() }
    const onOffline = () => setStatus('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      stopped = true
      clearTimeout(timer)
      ws?.close()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [auth])

  const subscribe = (fn: Listener) => {
    listeners.current.add(fn)
    return () => { listeners.current.delete(fn) }
  }
  return <RealtimeContext.Provider value={{ status, subscribe }}>{children}</RealtimeContext.Provider>
}

export function useRealtime() {
  const c = useContext(RealtimeContext)
  if (!c) throw new Error('useRealtime outside RealtimeProvider')
  return c
}

/** Run `fn` whenever one of the given event types arrives (plus on resync). */
export function useLive(types: string[], fn: Listener) {
  const { subscribe } = useRealtime()
  const ref = useRef(fn)
  ref.current = fn
  const key = types.join(',')
  useEffect(() => subscribe((e) => { if (e.type === 'resync' || key.split(',').includes(e.type)) ref.current(e) }), [subscribe, key])
}
