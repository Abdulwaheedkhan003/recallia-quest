import { api } from '../api/client'

/** Browser push (Web Push + service worker). Works on localhost or HTTPS. */
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Push + service workers only work on HTTPS (or localhost). */
export const secureContext = () => window.isSecureContext

export type PushState = NotificationPermission | 'unsupported' | 'insecure'
export const pushPermission = (): PushState => (!secureContext() ? 'insecure' : pushSupported() ? Notification.permission : 'unsupported')

function b64ToBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function enablePush(): Promise<PushState> {
  if (!secureContext()) return 'insecure'
  if (!pushSupported()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const { publicKey } = await api.get<{ publicKey: string }>('/push/key')
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }))
  await api.post('/push/subscribe', sub.toJSON())
  return 'granted'
}

/** Re-register an existing subscription silently (e.g. after login on this device). */
export async function refreshPush() {
  if (pushPermission() !== 'granted') return
  try { await enablePush() } catch { /* surfaced in Settings */ }
}
