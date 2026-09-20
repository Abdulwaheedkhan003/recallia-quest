import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, AUTH_EXPIRED_EVENT } from '../api/client'
import type { User } from '../api/types'
import { useSettings } from './settings'

type Status = 'loading' | 'guest' | 'authed'
interface Ctx {
  user: User | null
  status: Status
  expired: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email: string; password: string; displayName: string; role: 'patient' | 'family' }) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: Record<string, unknown>) => Promise<void>
}

const AuthContext = createContext<Ctx | null>(null)
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, set } = useSettings()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [expired, setExpired] = useState(false)
  const savedLang = useRef<string | null>(null)

  const signedIn = useCallback((u: User) => {
    setUser(u)
    setStatus('authed')
    setExpired(false)
    savedLang.current = u.lang
    set({ lang: u.lang })
  }, [set])

  useEffect(() => {
    api.get<{ user: User }>('/auth/me').then((r) => {
      signedIn(r.user)
      // Keep reminders on local time if the device's time zone changed (travel, corrected clock settings).
      if (r.user.timezone !== tz()) api.patch<{ user: User }>('/profile', { timezone: tz() }).then((x) => setUser(x.user)).catch(() => {})
    }).catch(() => setStatus('guest'))
  }, [signedIn])

  useEffect(() => {
    const on = () => { if (status === 'authed') setExpired(true) }
    window.addEventListener(AUTH_EXPIRED_EVENT, on)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, on)
  }, [status])

  // Keep the account language in sync with the comfort-menu choice (used by AI + voice).
  useEffect(() => {
    if (status !== 'authed' || !savedLang.current || savedLang.current === lang) return
    savedLang.current = lang
    api.patch<{ user: User }>('/profile', { lang }).then((r) => setUser(r.user)).catch(() => {})
  }, [lang, status])

  const value: Ctx = {
    user,
    status,
    expired,
    login: async (email, password) => signedIn((await api.post<{ user: User }>('/auth/login', { email, password, timezone: tz() })).user),
    register: async (d) => signedIn((await api.post<{ user: User }>('/auth/register', { ...d, lang, timezone: tz() })).user),
    logout: async () => {
      await api.post('/auth/logout').catch(() => {})
      setUser(null)
      setStatus('guest')
    },
    updateProfile: async (patch) => setUser((await api.patch<{ user: User }>('/profile', patch)).user),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
