import type { TKey } from '../../state/settings'

export type GameId = 'memory-match' | 'sequence' | 'objects' | 'recall' | 'pattern' | 'day-order'

export const GAMES: { id: GameId; emoji: string; title: TKey; how: TKey; tone: string }[] = [
  { id: 'memory-match', emoji: '🃏', title: 'games.memoryMatch', how: 'games.memoryMatchHow', tone: 'from-amber to-coral' },
  { id: 'sequence', emoji: '🔔', title: 'games.sequence', how: 'games.sequenceHow', tone: 'from-lavender to-[#6f5ee8]' },
  { id: 'objects', emoji: '🔍', title: 'games.objects', how: 'games.objectsHow', tone: 'from-teal to-[#2f9e6a]' },
  { id: 'recall', emoji: '🧺', title: 'games.recall', how: 'games.recallHow', tone: 'from-[#c2410c] to-amber' },
  { id: 'pattern', emoji: '🔷', title: 'games.pattern', how: 'games.patternHow', tone: 'from-[#2563eb] to-[#60a5fa]' },
  { id: 'day-order', emoji: '🌅', title: 'games.dayOrder', how: 'games.dayOrderHow', tone: 'from-[#be185d] to-coral' },
]

/** Everyday objects with localisable names. */
export const OBJECTS: { e: string; k: TKey }[] = [
  { e: '🍎', k: 'obj.apple' }, { e: '☕', k: 'obj.cup' }, { e: '🔑', k: 'obj.key' }, { e: '⏰', k: 'obj.clock' },
  { e: '🪥', k: 'obj.toothbrush' }, { e: '☂️', k: 'obj.umbrella' }, { e: '📖', k: 'obj.book' }, { e: '👓', k: 'obj.glasses' },
  { e: '👞', k: 'obj.shoe' }, { e: '🥄', k: 'obj.spoon' }, { e: '📞', k: 'obj.phone' }, { e: '🌻', k: 'obj.flower' },
  { e: '🪑', k: 'obj.chair' }, { e: '🍞', k: 'obj.bread' }, { e: '💡', k: 'obj.lamp' }, { e: '🐦', k: 'obj.bird' },
  { e: '🏠', k: 'obj.house' }, { e: '🐟', k: 'obj.fish' }, { e: '🌙', k: 'obj.moon' }, { e: '⭐', k: 'obj.star' },
]

export const DAY_STEPS: { e: string; k: TKey }[] = [
  { e: '🌅', k: 'day.wake' }, { e: '🍳', k: 'day.breakfast' }, { e: '🚶', k: 'day.walk' },
  { e: '🍛', k: 'day.lunch' }, { e: '🍲', k: 'day.dinner' }, { e: '🛏️', k: 'day.sleep' },
]

export function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
export const pick = <T,>(a: T[], n: number) => shuffle(a).slice(0, n)
