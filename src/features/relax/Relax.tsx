import { motion } from 'framer-motion'
import { FlaskConical, Play, Square, Waves } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import AppShell from '../../components/AppShell'
import { Button, Toggle } from '../../components/ui'
import { useSettings } from '../../state/settings'

/**
 * Experimental rhythmic sensory session (opt-in, wellness only).
 * Audio: a soft 220 Hz tone amplitude-modulated at 40 Hz (Web Audio).
 * Visual: a SLOW breathing light only — no screen flicker is ever produced.
 * Isolated module so a validated research protocol can replace it later.
 */
function useFortyHz() {
  const ctx = useRef<AudioContext | null>(null)
  const master = useRef<GainNode | null>(null)
  const start = useCallback((volume: number) => {
    const c = new AudioContext()
    const carrier = c.createOscillator()
    carrier.frequency.value = 220
    const am = c.createGain()
    am.gain.value = 0.5
    const lfo = c.createOscillator()
    lfo.frequency.value = 40
    const depth = c.createGain()
    depth.gain.value = 0.5
    lfo.connect(depth).connect(am.gain)
    const out = c.createGain()
    out.gain.setValueAtTime(0, c.currentTime)
    out.gain.linearRampToValueAtTime(volume * 0.25, c.currentTime + 3) // gentle fade-in, capped loudness
    carrier.connect(am).connect(out).connect(c.destination)
    carrier.start()
    lfo.start()
    ctx.current = c
    master.current = out
  }, [])
  const setVolume = (v: number) => master.current && ctx.current && master.current.gain.setTargetAtTime(v * 0.25, ctx.current.currentTime, 0.2)
  const stop = useCallback(() => {
    const c = ctx.current
    if (!c) return
    master.current?.gain.setTargetAtTime(0, c.currentTime, 0.1)
    setTimeout(() => c.close(), 400)
    ctx.current = null
  }, [])
  useEffect(() => stop, [stop])
  return { start, stop, setVolume }
}

export default function Relax() {
  const { t, motionOK } = useSettings()
  const [agreed, setAgreed] = useState(false)
  const [minutes, setMinutes] = useState(10)
  const [sound, setSound] = useState(true)
  const [light, setLight] = useState(true)
  const [volume, setVolume] = useState(0.4)
  const [left, setLeft] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const audio = useFortyHz()
  const running = left !== null

  const stop = useCallback((completed = false) => {
    audio.stop()
    setLeft(null)
    if (completed) {
      setFinished(true)
      api.post('/routine/activity', { kind: 'stimulation', ref: String(minutes) }).catch(() => {})
    }
  }, [audio, minutes])

  useEffect(() => {
    if (!running) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    window.addEventListener('keydown', on)
    const id = setInterval(() => setLeft((l) => (l === null ? null : l - 1)), 1000)
    return () => { clearInterval(id); window.removeEventListener('keydown', on) }
  }, [running, stop])
  useEffect(() => { if (left !== null && left <= 0) stop(true) }, [left, stop])

  const begin = () => {
    setFinished(false)
    if (sound) audio.start(volume)
    setLeft(minutes * 60)
  }

  if (running) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-night text-cream" role="dialog" aria-label={t('relax.session')}>
        {light && (
          <motion.div aria-hidden className="absolute size-[60vmin] rounded-full bg-[radial-gradient(circle,#ffd37a_0%,rgba(255,211,122,0.15)_60%,transparent_70%)]"
            animate={motionOK ? { scale: [0.85, 1.1, 0.85], opacity: [0.55, 0.9, 0.55] } : { opacity: 0.7 }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
        )}
        <div className="relative text-center">
          <p className="text-2xl">{t('relax.breathe')}</p>
          <p className="mt-4 font-display text-7xl font-bold" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
          {sound && (
            <label className="mx-auto mt-8 block w-72 text-lg">
              {t('relax.volume')}
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { setVolume(+e.target.value); audio.setVolume(+e.target.value) }} className="mt-2 w-full accent-amber" />
            </label>
          )}
          <Button big variant="danger" className="mt-10 min-w-[260px] text-2xl" onClick={() => stop()} autoFocus><Square fill="currentColor" aria-hidden /> {t('relax.stop')}</Button>
        </div>
      </div>
    )
  }

  return (
    <AppShell title={t('area.relax')} icon={<Waves className="text-[#0e7490]" aria-hidden />} home="/facilitate" homeLabel={t('shell.world')} tone="bg-[linear-gradient(180deg,#d7f3f7,#fff8ec)]">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-[28px] bg-white p-6 ring-2 ring-[#0e7490]/30">
          <p className="flex items-center gap-2 text-xl font-bold text-[#0e7490]"><FlaskConical aria-hidden /> {t('relax.experimental')}</p>
          <p className="mt-2 text-lg">{t('relax.disclaimer')}</p>
          <p className="mt-2 text-lg">{t('relax.flicker')}</p>
          <p className="mt-2 text-lg font-bold">{t('relax.safety')}</p>
        </div>
        {finished && <p role="status" className="rounded-2xl bg-leaf/20 p-4 text-xl font-bold text-teal">✓ {t('relax.done')}</p>}
        <Toggle on={agreed} onChange={setAgreed} label={t('relax.agree')} />
        <fieldset disabled={!agreed} className="space-y-4 disabled:opacity-50">
          <div>
            <p className="text-lg font-bold">{t('relax.duration')}</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map((m) => (
                <button key={m} onClick={() => setMinutes(m)} aria-pressed={minutes === m}
                  className={`min-h-16 rounded-2xl text-xl font-bold ${minutes === m ? 'bg-[#0e7490] text-white' : 'bg-white ring-2 ring-ink/10'}`}>{t('relax.min', { n: m })}</button>
              ))}
            </div>
          </div>
          <Toggle on={sound} onChange={setSound} label={t('relax.sound')} hint={t('relax.soundHint')} />
          <Toggle on={light} onChange={setLight} label={t('relax.light')} hint={t('relax.lightHint')} />
          <Button big className="w-full" disabled={!agreed || (!sound && !light)} onClick={begin}><Play aria-hidden /> {t('relax.start')}</Button>
        </fieldset>
      </div>
    </AppShell>
  )
}
