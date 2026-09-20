import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import en from '../i18n/locales/en'
import type { Dict, Partial2 } from '../i18n/types'
import { getLanguage } from '../i18n/languages'
import { load, save } from '../lib/storage'

/* ---------- Types ---------- */
type Leaf<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaf<T[K], `${P}${K}.`>
}[keyof T & string]
export type TKey = Leaf<Dict>

export interface Settings {
  lang: string
  reduceMotion: boolean
  largeText: boolean
  highContrast: boolean
}

interface Ctx extends Settings {
  set: (patch: Partial<Settings>) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
  motionOK: boolean
}

const DEFAULTS: Settings = { lang: 'en', reduceMotion: false, largeText: false, highContrast: false }

/* Locales are code-split: only the chosen language is downloaded. */
const loaders = import.meta.glob<{ default: Partial2 }>('../i18n/locales/*.ts')

const SettingsContext = createContext<Ctx | null>(null)

function lookup(dict: unknown, key: string): string | undefined {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], dict)
  return typeof v === 'string' ? v : undefined
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(() => ({ ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) }))
  const [dict, setDict] = useState<Partial2>({})
  const osReduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const set = useCallback((patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch })), [])

  useEffect(() => { save('settings', s) }, [s])

  useEffect(() => {
    const loader = loaders[`../i18n/locales/${s.lang}.ts`]
    if (!loader || s.lang === 'en') { setDict({}); return }
    loader().then((m) => setDict(m.default)).catch(() => setDict({}))
  }, [s.lang])

  useEffect(() => {
    const root = document.documentElement
    root.lang = s.lang
    root.dir = getLanguage(s.lang).dir ?? 'ltr'
    root.style.setProperty('--text-scale', s.largeText ? '1.2' : '1')
    root.classList.toggle('reduce-motion', s.reduceMotion)
    root.classList.toggle('hc', s.highContrast)
  }, [s])

  const t = useCallback<Ctx['t']>((key, vars) => {
    let str = lookup(dict, key) ?? lookup(en, key) ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v))
    return str
  }, [dict])

  const motionOK = !s.reduceMotion && !osReduced
  const value = useMemo(() => ({ ...s, set, t, motionOK }), [s, set, t, motionOK])

  return (
    <SettingsContext.Provider value={value}>
      <MotionConfig reducedMotion={motionOK ? 'never' : 'always'}>{children}</MotionConfig>
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const c = useContext(SettingsContext)
  if (!c) throw new Error('useSettings must be used inside SettingsProvider')
  return c
}
export const useT = () => useSettings().t
