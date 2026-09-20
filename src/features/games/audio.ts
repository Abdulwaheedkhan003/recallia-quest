import { SPEAKING_EVENT, isSpeaking } from '../../lib/speech'
/**
 * Real-time synthesised sound library for the sound and music games (Web Audio API).
 * Every sound is generated in the browser — no downloads, works offline — and can be
 * placed left/right in stereo, layered into busy scenes, or played as notes.
 */

export type SoundId =
  | 'bell' | 'doorbell' | 'phone' | 'dog' | 'bird' | 'knock' | 'clock' | 'kettle' | 'horn' | 'water'
  | 'footsteps' | 'utensils' | 'rain' | 'traffic' | 'tv' | 'wind' | 'clap' | 'drum' | 'cat' | 'cough'

export const SOUNDS: Record<SoundId, { e: string; name: string; ambient?: boolean }> = {
  bell: { e: '🔔', name: 'Bell' },
  doorbell: { e: '🚪', name: 'Doorbell' },
  phone: { e: '☎️', name: 'Telephone' },
  dog: { e: '🐕', name: 'Dog barking' },
  bird: { e: '🐦', name: 'Bird singing' },
  knock: { e: '✊', name: 'Knock on the door' },
  clock: { e: '🕰️', name: 'Clock ticking' },
  kettle: { e: '🫖', name: 'Kettle whistle' },
  horn: { e: '🚗', name: 'Car horn' },
  water: { e: '🚰', name: 'Running tap' },
  footsteps: { e: '👣', name: 'Footsteps' },
  utensils: { e: '🍴', name: 'Plates and spoons' },
  rain: { e: '🌧️', name: 'Rain', ambient: true },
  traffic: { e: '🚦', name: 'Traffic', ambient: true },
  tv: { e: '📺', name: 'Television', ambient: true },
  wind: { e: '🌬️', name: 'Wind', ambient: true },
  clap: { e: '👏', name: 'Clapping' },
  drum: { e: '🥁', name: 'Drum' },
  cat: { e: '🐈', name: 'Cat meowing' },
  cough: { e: '😷', name: 'Someone coughing' },
}

/** Sounds that make sense as a single, clear event (not a background bed). */
export const EVENT_SOUNDS = (Object.keys(SOUNDS) as SoundId[]).filter((k) => !SOUNDS[k].ambient)

/* ---------- mute preference (the game library's "Audio on/off") ---------- */
const MUTE_KEY = 'rq:gameAudio'
export function audioOn() {
  try { return localStorage.getItem(MUTE_KEY) !== 'off' } catch { return true }
}
export function setAudioOn(on: boolean) {
  try { localStorage.setItem(MUTE_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
const live = new Set<AudioScheduledSourceNode>()

/** Game sounds drop to 20% while the read-aloud voice is talking, so the voice stays clear. */
const level = () => (audioOn() ? 0.8 : 0) * (isSpeaking ? 0.2 : 1)

export function ac() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = level()
    master.connect(ctx.destination)
    window.addEventListener(SPEAKING_EVENT, () => {
      if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.08)
    })
  }
  if (ctx.state === 'suspended') void ctx.resume()
  master!.gain.value = level()
  return ctx
}
const out = () => (ac(), master!)

/** Stop everything currently playing (called when a game unmounts). */
export function stopAll() {
  for (const s of live) { try { s.stop() } catch { /* already stopped */ } }
  live.clear()
}
function track<T extends AudioScheduledSourceNode>(s: T) {
  live.add(s)
  s.onended = () => live.delete(s)
  return s
}

let noiseBuf: AudioBuffer | null = null
function noise() {
  const c = ac()
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const s = c.createBufferSource()
  s.buffer = noiseBuf
  s.loop = true
  return track(s)
}

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
}

function tone(dest: AudioNode, t: number, freq: number, dur: number, type: OscillatorType = 'sine', peak = 0.3, attack = 0.01) {
  const c = ac()
  const o = track(c.createOscillator())
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  env(g, t, attack, peak, dur)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + attack + dur + 0.05)
  return o
}

function burst(dest: AudioNode, t: number, dur: number, f: number, q: number, peak: number, type: BiquadFilterType = 'bandpass') {
  const c = ac()
  const n = noise()
  const fl = c.createBiquadFilter()
  fl.type = type
  fl.frequency.value = f
  fl.Q.value = q
  const g = c.createGain()
  env(g, t, 0.005, peak, dur)
  n.connect(fl).connect(g).connect(dest)
  n.start(t, Math.random())
  n.stop(t + dur + 0.05)
}

/** Build a destination with stereo position (-1 left … 1 right) and volume. */
function place(pan = 0, vol = 1): AudioNode {
  const c = ac()
  const g = c.createGain()
  g.gain.value = vol
  const p = c.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(out())
  return g
}

/** Schedule one event sound. Returns its length in seconds. */
function schedule(id: SoundId, dest: AudioNode, t: number): number {
  switch (id) {
    case 'bell':
      ;[880, 1320, 2200].forEach((f, i) => tone(dest, t, f, 1.6 - i * 0.4, 'sine', 0.25 / (i + 1)))
      return 1.6
    case 'doorbell':
      tone(dest, t, 659, 0.7, 'triangle', 0.35); tone(dest, t + 0.55, 523, 1.0, 'triangle', 0.35)
      return 1.6
    case 'phone':
      for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) { const s = t + r * 1.0 + i * 0.05; tone(dest, s, i % 2 ? 480 : 440, 0.04, 'square', 0.08) }
      return 1.7
    case 'dog':
      for (let i = 0; i < 2; i++) {
        const s = t + i * 0.35
        const o = track(ac().createOscillator()); const g = ac().createGain()
        o.type = 'sawtooth'; o.frequency.setValueAtTime(320, s); o.frequency.exponentialRampToValueAtTime(180, s + 0.18)
        env(g, s, 0.01, 0.3, 0.18); o.connect(g).connect(dest); o.start(s); o.stop(s + 0.25)
        burst(dest, s, 0.15, 900, 1, 0.2)
      }
      return 0.8
    case 'bird':
      for (let i = 0; i < 5; i++) {
        const s = t + i * 0.16
        const o = track(ac().createOscillator()); const g = ac().createGain()
        o.frequency.setValueAtTime(2600 + Math.random() * 600, s); o.frequency.exponentialRampToValueAtTime(4200, s + 0.08)
        env(g, s, 0.01, 0.15, 0.08); o.connect(g).connect(dest); o.start(s); o.stop(s + 0.12)
      }
      return 0.9
    case 'knock':
      for (let i = 0; i < 3; i++) { burst(dest, t + i * 0.22, 0.09, 180, 2, 0.9, 'lowpass'); tone(dest, t + i * 0.22, 110, 0.08, 'sine', 0.4) }
      return 0.8
    case 'clock':
      for (let i = 0; i < 6; i++) burst(dest, t + i * 0.5, 0.025, i % 2 ? 3200 : 2500, 8, 0.6)
      return 3
    case 'kettle': {
      const o = track(ac().createOscillator()); const g = ac().createGain()
      o.frequency.setValueAtTime(1800, t); o.frequency.linearRampToValueAtTime(2300, t + 1.5)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.8)
      o.connect(g).connect(dest); o.start(t); o.stop(t + 1.9)
      burst(dest, t, 1.8, 5000, 1, 0.05, 'highpass')
      return 1.9
    }
    case 'horn':
      tone(dest, t, 400, 0.45, 'sawtooth', 0.15); tone(dest, t, 500, 0.45, 'sawtooth', 0.12)
      tone(dest, t + 0.6, 400, 0.3, 'sawtooth', 0.15); tone(dest, t + 0.6, 500, 0.3, 'sawtooth', 0.12)
      return 1.0
    case 'water':
      burst(dest, t, 2, 1500, 0.5, 0.25)
      for (let i = 0; i < 14; i++) tone(dest, t + Math.random() * 1.8, 600 + Math.random() * 900, 0.04, 'sine', 0.05)
      return 2
    case 'footsteps':
      for (let i = 0; i < 6; i++) burst(dest, t + i * 0.45, 0.08, 300 + (i % 2) * 60, 1.2, 0.8, 'lowpass')
      return 2.7
    case 'utensils':
      for (let i = 0; i < 6; i++) { const s = t + i * 0.23 + Math.random() * 0.1; [2800, 4100, 5300].forEach((f) => tone(dest, s, f * (0.9 + Math.random() * 0.2), 0.18, 'sine', 0.05)) }
      return 1.6
    case 'clap':
      for (let i = 0; i < 4; i++) burst(dest, t + i * 0.3, 0.06, 1400, 0.8, 0.9)
      return 1.2
    case 'drum':
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.4
        const o = track(ac().createOscillator()); const g = ac().createGain()
        o.frequency.setValueAtTime(150, s); o.frequency.exponentialRampToValueAtTime(50, s + 0.3)
        env(g, s, 0.005, 0.8, 0.3); o.connect(g).connect(dest); o.start(s); o.stop(s + 0.4)
      }
      return 1.2
    case 'cat': {
      const o = track(ac().createOscillator()); const g = ac().createGain(); const f = ac().createBiquadFilter()
      o.type = 'sawtooth'; f.type = 'bandpass'; f.Q.value = 3
      o.frequency.setValueAtTime(500, t); o.frequency.linearRampToValueAtTime(800, t + 0.3); o.frequency.linearRampToValueAtTime(450, t + 0.8)
      f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1600, t + 0.3); f.frequency.linearRampToValueAtTime(700, t + 0.8)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.1); g.gain.linearRampToValueAtTime(0.0001, t + 0.85)
      o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + 0.9)
      return 0.9
    }
    case 'cough':
      for (let i = 0; i < 2; i++) burst(dest, t + i * 0.35, 0.2, 700, 0.7, 0.7)
      return 0.8
    case 'rain':
      burst(dest, t, 3, 3000, 0.4, 0.18)
      for (let i = 0; i < 40; i++) burst(dest, t + Math.random() * 3, 0.02, 4000 + Math.random() * 3000, 5, 0.12)
      return 3
    case 'traffic':
      burst(dest, t, 3, 200, 0.5, 0.4, 'lowpass')
      tone(dest, t + 0.2, 70, 2.6, 'sawtooth', 0.04, 0.8)
      return 3
    case 'tv':
      // muffled voice-like babble: band-limited noise with syllable-rate amplitude changes
      for (let i = 0; i < 14; i++) burst(dest, t + i * 0.2, 0.16, 500 + Math.random() * 700, 3, 0.35)
      return 3
    case 'wind': {
      const c = ac(); const n = noise(); const f = c.createBiquadFilter(); const g = c.createGain()
      f.type = 'bandpass'; f.Q.value = 1.5
      f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 1.5); f.frequency.linearRampToValueAtTime(400, t + 3)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 1); g.gain.linearRampToValueAtTime(0.0001, t + 3)
      n.connect(f).connect(g).connect(dest); n.start(t, Math.random()); n.stop(t + 3.05)
      return 3
    }
  }
}

/** Play one sound now. Resolves when it has finished. */
export function playSound(id: SoundId, opts: { pan?: number; vol?: number; delay?: number } = {}) {
  const c = ac()
  const t = c.currentTime + 0.05 + (opts.delay ?? 0)
  const len = schedule(id, place(opts.pan, opts.vol), t)
  return new Promise<void>((r) => setTimeout(r, (t - c.currentTime + len) * 1000 + 100))
}

/** Play several sounds one after another, with a pause between. */
export async function playSeries(ids: SoundId[], gap = 0.6, onEach?: (i: number) => void) {
  for (let i = 0; i < ids.length; i++) {
    onEach?.(i)
    await playSound(ids[i])
    await wait(gap * 1000)
  }
}

/**
 * A busy scene: background beds loop quietly while event sounds pop in and out.
 * `targets` are placed at the given offsets (seconds). Returns total length.
 */
export function playScene(opts: { beds: SoundId[]; fillers: SoundId[]; targets?: { id: SoundId; at: number; pan?: number; vol?: number }[]; seconds: number }) {
  const c = ac()
  const t0 = c.currentTime + 0.1
  for (const b of opts.beds) {
    const dest = place((Math.random() - 0.5) * 1.2, 0.55)
    for (let s = 0; s < opts.seconds; s += 3) schedule(b, dest, t0 + s)
  }
  let s = 0.4
  while (s < opts.seconds - 1.5 && opts.fillers.length) {
    const id = opts.fillers[Math.floor(Math.random() * opts.fillers.length)]
    s += schedule(id, place((Math.random() - 0.5) * 1.6, 0.6), t0 + s) + 0.3 + Math.random() * 0.6
  }
  for (const tg of opts.targets ?? []) schedule(tg.id, place(tg.pan ?? (Math.random() - 0.5), tg.vol ?? 0.75), t0 + tg.at)
  return new Promise<void>((r) => setTimeout(r, (opts.seconds + 0.4) * 1000))
}

/* ---------- musical notes ---------- */
export const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A3: 220.0, B3: 246.94, G3: 196.0,
}

/** Soft piano-like note (additive partials, quick decay). */
export function playNote(freq: number, dur = 0.45, delay = 0, pan = 0) {
  const c = ac()
  const t = c.currentTime + 0.03 + delay
  const d = place(pan)
  tone(d, t, freq, dur, 'triangle', 0.3)
  tone(d, t, freq * 2, dur * 0.6, 'sine', 0.08)
  tone(d, t, freq * 3, dur * 0.3, 'sine', 0.03)
}

/** Play a melody of [note, beats] at the given tempo. Resolves at the end. */
export function playMelody(notes: [string, number][], bpm = 100) {
  const beat = 60 / bpm
  let at = 0
  for (const [n, b] of notes) {
    if (n !== '-') playNote(NOTE[n], b * beat * 0.9, at)
    at += b * beat
  }
  return wait(at * 1000 + 300)
}

export function click(pan = 0, freq = 1000) {
  const c = ac()
  tone(place(pan), c.currentTime + 0.01, freq, 0.06, 'square', 0.12)
}

/** A continuous tone whose stereo position can be moved while it plays. */
export function movingTone(freq = 520) {
  const c = ac()
  const o = track(c.createOscillator())
  const g = c.createGain()
  const p = c.createStereoPanner()
  o.type = 'triangle'
  o.frequency.value = freq
  g.gain.value = 0.0001
  g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.2)
  o.connect(g).connect(p).connect(out())
  o.start()
  return {
    pan: (v: number) => p.pan.linearRampToValueAtTime(v, c.currentTime + 0.35),
    stop: () => { g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2); o.stop(c.currentTime + 0.25) },
  }
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
