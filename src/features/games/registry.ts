import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameProps } from './GameFrame'

/** Game id → component. Each family is code-split so the library loads fast. */
type Mod = Record<string, ComponentType<GameProps>>
const from = (load: () => Promise<unknown>, name: string): LazyExoticComponent<ComponentType<GameProps>> =>
  lazy(() => load().then((m) => ({ default: (m as Mod)[name] })))

const classic = () => import('./Games')
const sound = () => import('./games/sound')
const music = () => import('./games/music')
const language = () => import('./games/language')
const mind = () => import('./games/mind')
const places = () => import('./games/places')
const everyday = () => import('./games/everyday')
const make = () => import('./games/make')

export const REGISTRY: Record<string, LazyExoticComponent<ComponentType<GameProps>>> = {
  'memory-match': from(classic, 'MemoryMatch'), sequence: from(classic, 'Sequence'), objects: from(classic, 'ObjectsGame'),
  recall: from(classic, 'Recall'), pattern: from(classic, 'Pattern'), 'day-order': from(classic, 'DayOrder'),
  'whats-missing': from(mind, 'WhatsMissing'), 'face-name': from(mind, 'FaceName'), 'shell-game': from(mind, 'ShellGame'),
  'spot-difference': from(mind, 'SpotDifference'), 'odd-one-out': from(mind, 'OddOneOut'), 'catch-stars': from(mind, 'CatchStars'),
  'sound-focus': from(sound, 'SoundFocus'), 'sound-id': from(sound, 'SoundId_'), 'sound-sequence': from(sound, 'SoundSequence'),
  'sound-count': from(sound, 'SoundCount'), 'sound-direction': from(sound, 'SoundDirection'), 'sound-match': from(sound, 'SoundMatch'),
  'sound-change': from(sound, 'SoundChange'), 'follow-sound': from(sound, 'FollowSound'), 'sound-memory': from(sound, 'SoundMemory'),
  'sound-story': from(sound, 'SoundStory'),
  'finish-saying': from(language, 'FinishSaying'), 'spell-word': from(language, 'SpellWord'), 'word-groups': from(language, 'WordGroups'),
  'say-picture': from(language, 'SayPicture'), 'voice-echo': from(language, 'VoiceEcho'),
  'landmark-match': from(places, 'LandmarkMatch'), 'landmark-memory': from(places, 'LandmarkMemory'), 'place-landmark': from(places, 'PlaceLandmark'),
  'where-is-this': from(places, 'WhereIsThis'), 'travel-route': from(places, 'TravelRoute'), 'landmark-sequence': from(places, 'LandmarkSequence'),
  'set-table': from(everyday, 'SetTable'), 'pay-shop': from(everyday, 'PayShop'), 'set-clock': from(everyday, 'SetClock'), 'put-away': from(everyday, 'PutAway'),
  'rhythm-copy': from(music, 'RhythmCopy'), 'high-low': from(music, 'HighLow'), 'name-tune': from(music, 'NameTune'),
  'story-choice': from(make, 'StoryChoice'), 'then-now': from(make, 'ThenNow'),
  'trace-shape': from(make, 'TraceShape'), 'paint-number': from(make, 'PaintNumber'), 'connect-dots': from(make, 'ConnectDots'),
  'rotate-tiles': from(make, 'RotateTiles'), 'turn-cube': from(make, 'TurnCube'),
  breathe: from(make, 'Breathe'), garden: from(make, 'Garden'), 'sort-pebbles': from(make, 'SortPebbles'),
}
