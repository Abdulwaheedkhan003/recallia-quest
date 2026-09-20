import { getLanguage } from '../i18n/languages'

/** Locale for Intl formatting; falls back to English for languages Intl doesn't know. */
export function locale(lang: string) {
  const tag = getLanguage(lang).speech
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([tag]).length ? tag : 'en-IN'
  } catch {
    return 'en-IN'
  }
}

export const fmtTime = (ms: number, lang: string) => new Date(ms).toLocaleTimeString(locale(lang), { hour: 'numeric', minute: '2-digit' })
export const fmtDateTime = (ms: number, lang: string) =>
  new Date(ms).toLocaleString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
export const fmtDate = (iso: string, lang: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' })
export const fmtHHMM = (hhmm: string, lang: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return fmtTime(d.getTime(), lang)
}
