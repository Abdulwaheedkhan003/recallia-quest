import { useCallback, useEffect, useRef, useState } from 'react'
import { getLanguage } from '../i18n/languages'

/* ======================= Text-to-speech (browser Web Speech API) ======================= */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/**
 * Voice quality matters more than the volume setting: the browser caps speech at volume 1.0,
 * and the classic offline Windows voices (David, Zira, Heera…) are much quieter than the
 * neural "Online (Natural)" voices in Edge or the Google voices in Chrome. Prefer those.
 */
function voiceScore(v: SpeechSynthesisVoice) {
  const n = v.name.toLowerCase()
  let s = 0
  if (n.includes('natural') || n.includes('neural')) s += 4
  if (n.includes('online')) s += 2
  if (n.includes('google')) s += 3
  if (!v.localService) s += 1
  return s
}

function findVoice(lang: string) {
  if (!ttsSupported()) return undefined
  const tag = getLanguage(lang).speech.toLowerCase()
  const base = tag.split('-')[0]
  const voices = speechSynthesis.getVoices()
  const best = (list: SpeechSynthesisVoice[]) => list.sort((a, b) => voiceScore(b) - voiceScore(a))[0]
  const exact = best(voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === tag)) ?? best(voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base))
  if (exact) return exact
  // e.g. Assamese → a Bengali voice (same script), Nepali/Bodo → a Hindi voice (Devanagari), when the device has none.
  const fb = getLanguage(lang).voiceFallback?.toLowerCase()
  return fb ? best(voices.filter((v) => v.lang.toLowerCase().replace('_', '-') === fb)) ?? best(voices.filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === fb.split('-')[0])) : undefined
}

/* While the voice is talking, turn other app sounds down so the voice can be heard clearly. */
export const SPEAKING_EVENT = 'rq:speaking'
export let isSpeaking = false
const ducked = new Map<HTMLMediaElement, number>()
function setSpeaking(on: boolean) {
  if (isSpeaking === on) return
  isSpeaking = on
  if (on) {
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((m) => {
      if (!m.paused && !ducked.has(m)) { ducked.set(m, m.volume); m.volume = m.volume * 0.2 }
    })
  } else {
    ducked.forEach((vol, m) => { m.volume = vol })
    ducked.clear()
  }
  window.dispatchEvent(new CustomEvent(SPEAKING_EVENT, { detail: on }))
}

/** Resolves when speaking finishes (or is cancelled). Rejects when no voice exists for the language. */
export function speak(text: string, lang: string, rate = 0.9): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ttsSupported()) return reject(new Error('unsupported'))
    const voice = findVoice(lang)
    if (!voice) return reject(new Error('no-voice'))
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice
    u.lang = voice.lang
    u.rate = rate
    u.volume = 1 // maximum the browser allows
    u.onstart = () => setSpeaking(true)
    u.onend = () => { setSpeaking(false); resolve() }
    u.onerror = (e) => { setSpeaking(false); return e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error)) }
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel()
  setSpeaking(false)
}

/** Which languages have an installed voice on this device. Updates when voices load. */
export function useVoiceFor(lang: string) {
  const [ok, setOk] = useState(() => Boolean(findVoice(lang)))
  useEffect(() => {
    if (!ttsSupported()) return
    const upd = () => setOk(Boolean(findVoice(lang)))
    upd()
    speechSynthesis.addEventListener('voiceschanged', upd)
    return () => speechSynthesis.removeEventListener('voiceschanged', upd)
  }, [lang])
  return ok
}

/* ======================= Speech-to-text ======================= */

interface SR {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
const SRClass = (): (new () => SR) | undefined =>
  (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition

export const sttSupported = () => typeof window !== 'undefined' && Boolean(SRClass())

export type SttError = 'permission' | 'no-speech' | 'network' | 'language' | 'unsupported' | 'other'

/** Push-to-talk speech recognition. `onFinal` receives the final transcript. */
export function useSpeechInput(lang: string, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<SttError | null>(null)
  const rec = useRef<SR | null>(null)
  const cb = useRef(onFinal)
  cb.current = onFinal

  const start = useCallback(() => {
    const C = SRClass()
    if (!C) return setError('unsupported')
    stopSpeaking()
    const r = new C()
    r.lang = getLanguage(lang).speech
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) finalText = text
      }
      setInterim(text)
    }
    r.onerror = (e) => {
      setError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'permission'
          : e.error === 'no-speech' ? 'no-speech'
          : e.error === 'network' ? 'network'
          : e.error === 'language-not-supported' ? 'language'
          : e.error === 'aborted' ? null : 'other',
      )
    }
    r.onend = () => {
      setListening(false)
      setInterim('')
      if (finalText.trim()) cb.current(finalText.trim())
    }
    setError(null)
    setListening(true)
    rec.current = r
    try { r.start() } catch { setListening(false); setError('other') }
  }, [lang])

  const stop = useCallback(() => rec.current?.stop(), [])
  useEffect(() => () => rec.current?.abort(), [])
  return { supported: sttSupported(), listening, interim, error, start, stop }
}
