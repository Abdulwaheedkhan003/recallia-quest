import { useEffect, useState } from 'react'

/**
 * Minimal hash router — no dependency, browser back button works.
 * Routes look like "#/routine?p=morning".
 */
function current() {
  const h = window.location.hash.replace(/^#/, '')
  const full = h.startsWith('/') ? h : '/'
  const [path, qs = ''] = full.split('?')
  return { path, query: new URLSearchParams(qs), full }
}

export function useRoute() {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const on = () => setRoute(current())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(to: string) {
  window.location.hash = to
  window.scrollTo({ top: 0 })
}

/** In-page section scroll that doesn't fight the router. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
