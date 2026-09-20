/* Recallia Quest service worker — shows reminder notifications even when the app is closed. */
const API_HEADERS = { 'x-requested-with': 'recallia', 'content-type': 'application/json' }

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: event.data && event.data.text() } }
  const actions = data.notificationId ? [{ action: 'done', title: '✓ Done' }, { action: 'later', title: '⏰ In 10 minutes' }] : []
  event.waitUntil(
    self.registration.showNotification(data.title || 'Recallia Quest', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: true,
      renotify: Boolean(data.tag),
      actions,
      data: { url: data.url || '/', notificationId: data.notificationId },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url, notificationId } = event.notification.data || {}
  if (notificationId && (event.action === 'done' || event.action === 'later')) {
    // Uses the signed-in session cookie; the server checks the notification belongs to this user.
    const path = event.action === 'done' ? 'done' : 'snooze'
    event.waitUntil(fetch(`/api/notifications/${notificationId}/${path}`, { method: 'POST', credentials: 'include', headers: API_HEADERS, body: JSON.stringify(path === 'snooze' ? { minutes: 10 } : {}) }).catch(() => {}))
    return
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(url || '/'); return c.focus() }
      return self.clients.openWindow(url || '/')
    }),
  )
})
