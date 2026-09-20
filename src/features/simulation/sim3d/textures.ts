import * as THREE from 'three'

/** Procedural textures drawn on canvases — no image downloads, crisp on any screen. */
const cache = new Map<string, THREE.Texture>()

function make(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: [number, number]) {
  const k = `${key}:${repeat.join('x')}`
  const hit = cache.get(k)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  draw(g, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(k, t)
  return t
}

const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

export type FloorKind = 'wood' | 'darkwood' | 'tile' | 'bluetile' | 'carpet' | 'lino' | 'grass' | 'stone'

export function floorTexture(kind: FloorKind, w: number, d: number) {
  switch (kind) {
    case 'wood':
    case 'darkwood': {
      const base = kind === 'wood' ? [196, 150, 102] : [135, 94, 62]
      return make(kind, 512, (g, s) => {
        const r = rnd(7)
        const plank = s / 6
        for (let i = 0; i < 6; i++) {
          const v = (r() - 0.5) * 30
          g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`
          g.fillRect(0, i * plank, s, plank)
          for (let k = 0; k < 40; k++) {
            g.strokeStyle = `rgba(80,50,20,${0.05 + r() * 0.08})`
            g.beginPath(); const y = i * plank + r() * plank; g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + r() * 6 - 3, s * 0.6, y + r() * 6 - 3, s, y); g.stroke()
          }
          g.fillStyle = 'rgba(60,35,15,0.55)'
          g.fillRect(0, i * plank, s, 2)
          g.fillRect(((i * 37) % 6) / 6 * s, i * plank, 2, plank)
        }
      }, [w / 3, d / 3])
    }
    case 'tile':
    case 'bluetile': {
      const [a, b] = kind === 'tile' ? ['#efe9df', '#d9d0c1'] : ['#d6eef2', '#a9d3da']
      return make(kind, 256, (g, s) => {
        g.fillStyle = a; g.fillRect(0, 0, s, s)
        const n = 4, t = s / n
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? a : b
          g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4)
        }
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3
        for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, s); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(s, i * t); g.stroke() }
      }, [w / 2, d / 2])
    }
    case 'carpet':
      return make(kind, 256, (g, s) => {
        g.fillStyle = '#8f7fb8'; g.fillRect(0, 0, s, s)
        const r = rnd(3)
        for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${r() > 0.5 ? 255 : 40},${r() > 0.5 ? 255 : 30},255,${r() * 0.06})`; g.fillRect(r() * s, r() * s, 2, 2) }
      }, [w / 2, d / 2])
    case 'lino':
      return make(kind, 256, (g, s) => {
        g.fillStyle = '#cfd9df'; g.fillRect(0, 0, s, s)
        const r = rnd(11)
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,110,120,${r() * 0.15})`; g.beginPath(); g.arc(r() * s, r() * s, r() * 6, 0, 7); g.fill() }
      }, [w / 2, d / 2])
    case 'grass':
      return make(kind, 256, (g, s) => {
        g.fillStyle = '#6fb45f'; g.fillRect(0, 0, s, s)
        const r = rnd(5)
        for (let i = 0; i < 5000; i++) { g.strokeStyle = `rgba(${40 + r() * 60},${120 + r() * 80},${40 + r() * 40},0.6)`; g.beginPath(); const x = r() * s, y = r() * s; g.moveTo(x, y); g.lineTo(x + r() * 3 - 1.5, y - 3 - r() * 5); g.stroke() }
      }, [w / 3, d / 3])
    case 'stone':
      return make(kind, 256, (g, s) => {
        g.fillStyle = '#b8b2a7'; g.fillRect(0, 0, s, s)
        const r = rnd(9)
        for (let i = 0; i < 18; i++) { g.fillStyle = `rgb(${170 + r() * 40},${165 + r() * 35},${150 + r() * 35})`; g.beginPath(); g.ellipse(r() * s, r() * s, 20 + r() * 25, 15 + r() * 20, r() * 3, 0, 7); g.fill() }
      }, [w / 2, d / 2])
  }
}

/** A deliberately "busy" high-contrast pattern — used to demonstrate what to avoid. */
export function busyPattern() {
  return make('busy', 256, (g, s) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#111111' : '#f2f2f2'; g.fillRect(0, (i * s) / 16, s, s / 16) }
    g.strokeStyle = '#b3261e'; g.lineWidth = 6
    for (let i = -s; i < s; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke() }
  }, [2, 6])
}

/** Family photo placeholder: a warm painted portrait of people (not a real person). */
export function portraitTexture(sepia = false) {
  return make(`portrait${sepia}`, 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s)
    grd.addColorStop(0, sepia ? '#cdb58d' : '#9bd3f5'); grd.addColorStop(1, sepia ? '#8a6d45' : '#f5d9a6')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    const people = [[0.25, '#f27f5b'], [0.5, '#3b6fd8'], [0.75, '#2f9e6a']] as const
    for (const [x, c] of people) {
      g.fillStyle = sepia ? '#6b4f3a' : c
      g.beginPath(); g.ellipse(x * s, s * 0.85, s * 0.11, s * 0.22, 0, 0, 7); g.fill()
      g.fillStyle = sepia ? '#e8d2b0' : '#f3c9a1'
      g.beginPath(); g.arc(x * s, s * 0.5, s * 0.08, 0, 7); g.fill()
    }
  }, [1, 1])
}

/** Picture sign (icon + word) for doors — high contrast, easy to read. */
export function signTexture(icon: string, word: string) {
  return make(`sign-${icon}-${word}`, 256, (g, s) => {
    g.fillStyle = '#fff8ec'; g.fillRect(0, 0, s, s)
    g.strokeStyle = '#2b2140'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10)
    g.font = `${s * 0.45}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(icon, s / 2, s * 0.4)
    g.fillStyle = '#2b2140'; g.font = `bold ${s * 0.15}px sans-serif`
    g.fillText(word, s / 2, s * 0.82)
  }, [1, 1])
}

/** Big day-and-date clock/calendar face. */
export function calendarTexture(big: boolean) {
  const now = new Date()
  const day = now.toLocaleDateString(undefined, { weekday: 'long' })
  const date = now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  return make(`cal-${big}-${day}-${date}`, 256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#b3261e'; g.fillRect(0, 0, s, s * 0.28)
    g.fillStyle = '#ffffff'; g.font = `bold ${s * 0.14}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(day, s / 2, s * 0.14)
    g.fillStyle = '#2b2140'; g.font = `bold ${s * (big ? 0.2 : 0.1)}px sans-serif`
    g.fillText(date, s / 2, s * 0.6)
  }, [1, 1])
}

/** Sky seen through windows. */
export function skyTexture(night: boolean) {
  return make(`sky-${night}`, 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s)
    if (night) { grd.addColorStop(0, '#0f0c24'); grd.addColorStop(1, '#3a2d63') } else { grd.addColorStop(0, '#8fcaf5'); grd.addColorStop(1, '#e6f5ff') }
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    if (night) { g.fillStyle = '#fff'; const r = rnd(4); for (let i = 0; i < 60; i++) g.fillRect(r() * s, r() * s * 0.7, 2, 2) }
    g.fillStyle = night ? '#1f3a2a' : '#6fb45f'; g.fillRect(0, s * 0.72, s, s * 0.28)
    g.fillStyle = night ? '#2a4a35' : '#4f9a52'
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(i * s * 0.2 + 20, s * 0.72, 30, Math.PI, 0); g.fill() }
  }, [1, 1])
}
