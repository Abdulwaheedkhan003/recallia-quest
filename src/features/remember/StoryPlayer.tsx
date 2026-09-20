import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, Home, Keyboard, Mic, Pause, Play, RotateCcw, Send, Square, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ApiError } from '../../api/client'
import Mascot from '../../components/Mascot'
import SyncPill from '../../components/SyncPill'
import { Button, ErrorView } from '../../components/ui'
import { speak, stopSpeaking, useSpeechInput, useVoiceFor } from '../../lib/speech'
import { useLive } from '../../state/realtime'
import { useSettings, useT } from '../../state/settings'
import { classifyAnswer, type Answer, type RememberPerson, type Step, type StoryPayload } from './types'

type Phase =
  | { k: 'loading' }
  | { k: 'intro' }
  | { k: 'recognition' }
  | { k: 'recognized'; answer: Answer }
  | { k: 'step'; i: number }
  | { k: 'feedback'; i: number; text: string }
  | { k: 'closing' }

type Outgoing = { path: string; body?: unknown }

/**
 * The remembrance "game": a photo appears → name → memory → audio → a gentle question → next memory.
 * It renders ONLY the validated story structure from the server with our own components.
 * A "no" is never corrected; the story gently shows the caretaker's evidence instead.
 */
export default function StoryPlayer({ person, onExit }: { person: RememberPerson; onExit: () => void }) {
  const { lang, t } = useSettings()
  const calm = useReducedMotion()
  const hasVoice = useVoiceFor(lang)
  const [data, setData] = useState<StoryPayload | null>(null)
  const [err, setErr] = useState<ApiError | null>(null)
  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [voiceOn, setVoiceOn] = useState(true)
  const session = useRef<number | null>(null)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)

  /* ---------- offline-safe outbox: answers are never lost on a flaky connection ---------- */
  const outbox = useRef<Outgoing[]>([])
  const flushing = useRef(false)
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      while (outbox.current.length) {
        const m = outbox.current[0]
        try { await api.post(m.path, m.body); outbox.current.shift(); setSyncedAt(Date.now()) } catch { break }
      }
    } finally { flushing.current = false }
  }, [])
  const send = (path: string, body?: unknown) => { outbox.current.push({ path, body }); void flush() }
  useEffect(() => { const t = setInterval(() => void flush(), 5000); window.addEventListener('online', flush); return () => { clearInterval(t); window.removeEventListener('online', flush) } }, [flush])
  useLive([], () => void flush()) // on reconnect ('resync')

  const starting = useRef(false)
  const load = useCallback(async () => {
    if (starting.current) return // one session per start, even if effects run twice
    starting.current = true
    setErr(null)
    setPhase({ k: 'loading' })
    try {
      const d = await api.post<StoryPayload>(`/remember/people/${person.id}/story`)
      const s = await api.post<{ sessionId: number }>('/remember/sessions', { personId: person.id, storyId: d.storyId })
      session.current = s.sessionId
      setData(d)
      setSyncedAt(Date.now())
      setPhase({ k: 'intro' })
    } catch (e) { setErr(e as ApiError) } finally { starting.current = false }
  }, [person.id])
  const loaded = useRef(false)
  useEffect(() => { if (!loaded.current) { loaded.current = true; void load() } return () => stopSpeaking() }, [load])

  const say = useCallback((text: string) => { if (voiceOn && hasVoice && text) speak(text.replace(/[❤️💛]/gu, ''), lang).catch(() => {}) }, [voiceOn, hasVoice, lang])

  const story = data?.story
  const steps = story?.steps ?? []
  const url = (id: number | null | undefined) => (id ? data?.assets[id]?.url ?? data?.photos.find((p) => p.id === id)?.url ?? null : null)
  const record = (stepIndex: number, stepType: string, prompt: string, response: string, via: 'button' | 'voice' | 'text', text?: string) => {
    if (session.current) send(`/remember/sessions/${session.current}/interactions`, { stepIndex, stepType, prompt, response, via, text })
  }

  // Speak whatever is on screen.
  useEffect(() => {
    if (!story) return
    if (phase.k === 'intro') say(story.introduction)
    else if (phase.k === 'recognition') say(story.recognition.question)
    else if (phase.k === 'recognized') say(phase.answer === 'yes' ? story.onYes : story.onNo)
    else if (phase.k === 'step') { const s = steps[phase.i]; if (s && s.type !== 'audio') say(s.type === 'photo' ? s.caption : s.text) }
    else if (phase.k === 'feedback') say(phase.text)
    else if (phase.k === 'closing') say(story.closing)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const next = (from: number) => {
    stopSpeaking()
    if (from + 1 < steps.length) setPhase({ k: 'step', i: from + 1 })
    else {
      setPhase({ k: 'closing' })
      if (session.current) send(`/remember/sessions/${session.current}/complete`)
    }
  }

  const answerRecognition = (a: Answer | null, via: 'button' | 'voice' | 'text', text?: string) => {
    const ans: Answer = a ?? 'not_sure'
    record(-1, 'recognition', story!.recognition.question, a ?? 'text', via, text)
    setPhase({ k: 'recognized', answer: ans })
  }
  const answerQuestion = (i: number, a: Answer | null, via: 'button' | 'voice' | 'text', text?: string) => {
    const s = steps[i] as Extract<Step, { type: 'question' }>
    record(i, 'question', s.text, a ?? 'text', via, text)
    const fb = a === 'yes' ? s.ifYes || t('remember.lovely') : a === null ? t('remember.thanks') : s.ifNo || t('remember.okay')
    setPhase({ k: 'feedback', i, text: fb })
  }

  const recognitionPhoto = url(story?.recognition.itemId)
  const extraPhotos = (data?.photos ?? []).filter((p) => p.id !== story?.recognition.itemId).slice(0, 2)
  const displayName = person.name.replace(/^Sample: /, '')

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#ffe7c2_0%,#fff8ec_50%,#efe9ff_100%)] text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <button onClick={() => { stopSpeaking(); onExit() }} className="flex min-h-16 items-center gap-2 rounded-full bg-white px-6 text-xl font-bold shadow-sm"><Home aria-hidden /> {t('remember.back')}</button>
        <div className="flex items-center gap-2">
          <SyncPill lastSync={syncedAt} />
          {hasVoice && (
            <button onClick={() => { setVoiceOn((v) => !v); stopSpeaking() }} aria-pressed={voiceOn} className="grid size-16 place-items-center rounded-full bg-white shadow-sm" aria-label={voiceOn ? t('remember.voiceOff') : t('remember.voiceOn')}>
              {voiceOn ? <Volume2 size={28} /> : <VolumeX size={28} />}
            </button>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
        {err && <div className="mt-10"><ErrorView error={err} onRetry={load} /></div>}
        {phase.k === 'loading' && !err && (
          <div role="status" className="mt-20 flex flex-col items-center gap-4 text-center">
            <Mascot size={140} mood="thinking" label="" />
            <p className="text-3xl font-bold">{t('remember.loading')}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {story && phase.k === 'intro' && (
            <Card key="intro">
              <Photo src={url(story.recognition.itemId) ?? person.avatar} calm={calm} blur />
              <Caption big>{story.introduction}</Caption>
              <Big onClick={() => setPhase({ k: 'recognition' })}>{t('remember.start')} <ArrowRight aria-hidden /></Big>
            </Card>
          )}

          {story && phase.k === 'recognition' && (
            <Card key="rec">
              <Photo src={recognitionPhoto ?? person.avatar} calm={calm} />
              <Caption big>{story.recognition.question}</Caption>
              <AnswerPad lang={lang} onAnswer={answerRecognition} />
            </Card>
          )}

          {story && phase.k === 'recognized' && (
            <Card key="recd">
              <Photo src={recognitionPhoto ?? person.avatar} calm={calm} name={displayName} />
              <Caption big>{phase.answer === 'yes' ? story.onYes : story.onNo}</Caption>
              {phase.answer !== 'yes' && extraPhotos.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {extraPhotos.map((p, i) => (
                    <motion.img key={p.id} src={p.url} alt="" className="aspect-square w-full rounded-[28px] object-cover shadow-lg"
                      initial={{ opacity: 0, y: 20, rotate: i ? 2 : -2 }} animate={{ opacity: 1, y: 0, rotate: i ? 2 : -2 }} transition={{ delay: 0.6 + i * 0.4 }} />
                  ))}
                </div>
              )}
              <Big onClick={() => (steps.length ? setPhase({ k: 'step', i: 0 }) : next(-1))}>{t('remember.next')} <ArrowRight aria-hidden /></Big>
            </Card>
          )}

          {story && phase.k === 'step' && steps[phase.i] && (
            <StepView key={`s${phase.i}`} step={steps[phase.i]} url={url} calm={calm} name={displayName} lang={lang}
              onNext={() => next(phase.i)}
              onAnswer={(a, via, text) => answerQuestion(phase.i, a, via, text)}
              onListened={() => record(phase.i, 'audio', (steps[phase.i] as { caption?: string }).caption ?? '', 'listened', 'button')} />
          )}

          {story && phase.k === 'feedback' && (
            <Card key={`f${phase.i}`}>
              {(() => { const s = steps[phase.i]; const src = s && 'itemId' in s ? url(s.itemId) : null; return src ? <Photo src={src} calm={calm} small /> : <Mascot size={120} mood="celebrating" label="" /> })()}
              <Caption big>{phase.text}</Caption>
              <Big onClick={() => next(phase.i)}>{t('remember.next')} <ArrowRight aria-hidden /></Big>
            </Card>
          )}

          {story && phase.k === 'closing' && (
            <Card key="close">
              <Mascot size={150} mood="celebrating" label="" />
              <Caption big>{story.closing}</Caption>
              <div className="flex flex-wrap justify-center gap-4">
                <Big onClick={onExit}>{t('remember.others')} <ArrowRight aria-hidden /></Big>
                <Button big variant="secondary" onClick={() => { void load() }}><RotateCcw aria-hidden /> {t('remember.again')}</Button>
              </div>
            </Card>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

/* ---------------- building blocks (the only UI a story can produce) ---------------- */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.5 }}
      className="mt-6 flex flex-col items-center gap-6 rounded-[44px] bg-white/85 p-6 text-center shadow-[0_30px_70px_-30px_rgba(43,33,64,0.5)] sm:p-10">
      {children}
    </motion.section>
  )
}
function Caption({ children, big }: { children: React.ReactNode; big?: boolean }) {
  return <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} aria-live="polite" className={`${big ? 'text-3xl sm:text-4xl' : 'text-2xl'} max-w-2xl font-bold leading-snug`}>{children}</motion.p>
}
function Big({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <Button big onClick={onClick} className="min-h-20 px-10 text-2xl">{children}</Button>
}

function Photo({ src, calm, name, small, blur }: { src: string | null; calm: boolean | null; name?: string; small?: boolean; blur?: boolean }) {
  const t = useT()
  if (!src) return <Mascot size={140} mood="happy" label="" />
  return (
    <motion.div className={`relative ${small ? 'w-56 sm:w-64' : 'w-full max-w-[min(30rem,52vh)]'}`} initial={{ opacity: 0, scale: 0.85, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 90, damping: 14 }}>
      <motion.div animate={calm ? undefined : { y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="overflow-hidden rounded-[36px] bg-white p-3 shadow-[0_24px_50px_-20px_rgba(43,33,64,0.55)]">
        <motion.img src={src} alt={name ? t('remember.photoOf', { name }) : t('remember.aPhoto')} className={`aspect-square w-full rounded-[28px] object-cover ${blur ? 'opacity-90' : ''}`}
          initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 2.2, ease: 'easeOut' }} />
      </motion.div>
      {name && (
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-coral px-6 py-2 text-2xl font-bold text-white shadow-lg">{name} ❤️</motion.p>
      )}
    </motion.div>
  )
}

function StepView({ step, url, calm, name, lang, onNext, onAnswer, onListened }: {
  step: Step; url: (id: number | null | undefined) => string | null; calm: boolean | null; name: string; lang: string
  onNext: () => void; onAnswer: (a: Answer | null, via: 'button' | 'voice' | 'text', text?: string) => void; onListened: () => void
}) {
  const t = useT()
  if (step.type === 'photo')
    return (
      <Card>
        <Photo src={url(step.itemId)} calm={calm} />
        {step.caption && <Caption big>{step.caption}</Caption>}
        <Big onClick={onNext}>{t('remember.next')} <ArrowRight aria-hidden /></Big>
      </Card>
    )
  if (step.type === 'memory')
    return (
      <Card>
        {url(step.itemId) ? <Photo src={url(step.itemId)} calm={calm} small /> : <Mascot size={120} mood="explaining" label="" />}
        <Caption big>{step.text}</Caption>
        <Big onClick={onNext}>{t('remember.next')} <ArrowRight aria-hidden /></Big>
      </Card>
    )
  if (step.type === 'audio') return <AudioStep src={url(step.itemId)} caption={step.caption || t('remember.listenAbout', { name })} onNext={onNext} onListened={onListened} />
  return (
    <Card>
      {url(step.itemId) ? <Photo src={url(step.itemId)} calm={calm} small /> : <Mascot size={110} mood="encouraging" label="" />}
      <Caption big>{step.text}</Caption>
      <AnswerPad lang={lang} onAnswer={onAnswer} />
    </Card>
  )
}

function AudioStep({ src, caption, onNext, onListened }: { src: string | null; caption: string; onNext: () => void; onListened: () => void }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)
  const t = useT()
  if (!src) return null
  return (
    <Card>
      <motion.div animate={playing ? { scale: [1, 1.06, 1] } : { scale: 1 }} transition={{ duration: 1.6, repeat: playing ? Infinity : 0 }}
        className="grid size-44 place-items-center rounded-full bg-gradient-to-br from-amber to-coral text-white shadow-xl">
        <button onClick={() => { stopSpeaking(); const a = ref.current!; if (a.paused) void a.play(); else a.pause() }} className="grid size-36 place-items-center rounded-full" aria-label={playing ? t('remember.pause') : t('remember.play')}>
          {playing ? <Pause size={72} /> : <Play size={72} />}
        </button>
      </motion.div>
      <Caption big>{caption}</Caption>
      <audio ref={ref} src={src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); if (!done) { setDone(true); onListened() } }} />
      <Big onClick={() => { ref.current?.pause(); onNext() }}>{t('remember.next')} <ArrowRight aria-hidden /></Big>
    </Card>
  )
}

/** YES / NO / NOT SURE + voice + typing — all feed the same handler. Voice is confirmed before it counts. */
function AnswerPad({ lang, onAnswer }: { lang: string; onAnswer: (a: Answer | null, via: 'button' | 'voice' | 'text', text?: string) => void }) {
  const [heard, setHeard] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const mic = useSpeechInput(lang, (s) => setHeard(s))
  const t = useT()

  if (heard !== null)
    return (
      <div className="w-full max-w-xl rounded-[28px] bg-cream p-5">
        <p className="text-xl text-ink-soft">{t('remember.heard')}</p>
        <p className="mt-1 text-3xl font-bold">“{heard}”</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Button big onClick={() => onAnswer(classifyAnswer(heard), 'voice', heard)}><Check aria-hidden /> {t('remember.right')}</Button>
          <Button big variant="secondary" onClick={() => { setHeard(null); mic.start() }}><RotateCcw aria-hidden /> {t('remember.sayAgain')}</Button>
        </div>
      </div>
    )

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
        <button onClick={() => onAnswer('yes', 'button')} className="min-h-24 rounded-[28px] bg-teal text-3xl font-bold text-white shadow-lg transition active:scale-95">{t('remember.yes')}</button>
        <button onClick={() => onAnswer('no', 'button')} className="min-h-24 rounded-[28px] bg-white text-3xl font-bold text-ink shadow-lg ring-2 ring-ink/10 transition active:scale-95">{t('remember.no')}</button>
        <button onClick={() => onAnswer('not_sure', 'button')} className="min-h-24 rounded-[28px] bg-amber/30 text-2xl font-bold text-ink shadow-lg transition active:scale-95 sm:text-3xl">{t('remember.notSure')}</button>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {mic.supported && (
          <button onClick={mic.listening ? mic.stop : () => { stopSpeaking(); mic.start() }} aria-pressed={mic.listening}
            className={`flex min-h-16 items-center gap-2 rounded-full px-7 text-xl font-bold text-white shadow ${mic.listening ? 'animate-pulse bg-coral' : 'bg-lavender'}`}>
            {mic.listening ? <><Square aria-hidden /> {t('remember.listeningStop')}</> : <><Mic aria-hidden /> {t('remember.sayIt')}</>}
          </button>
        )}
        {!typing && <Button variant="secondary" onClick={() => setTyping(true)}><Keyboard aria-hidden /> {t('remember.type')}</Button>}
      </div>
      {mic.listening && mic.interim && <p className="text-2xl" aria-live="polite">{mic.interim}</p>}
      {mic.error && mic.error !== 'no-speech' && <p role="alert" className="text-lg font-bold text-coral">{t('remember.micFailed')}</p>}
      {typing && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(classifyAnswer(text), 'text', text.trim()) }} className="flex w-full max-w-2xl gap-3">
          <label htmlFor="story-answer" className="sr-only">{t('remember.answer')}</label>
          <input id="story-answer" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t('remember.typeHere')}
            className="min-h-20 flex-1 rounded-full bg-white px-6 text-2xl shadow-inner ring-2 ring-ink/10" />
          <Button big disabled={!text.trim()} aria-label={t('remember.send')}><Send aria-hidden /></Button>
        </form>
      )}
    </div>
  )
}
