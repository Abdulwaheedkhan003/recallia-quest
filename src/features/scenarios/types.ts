import type { ScenarioMode } from '../../../shared/scenarios'

export type { ScenarioMode }
export type Level = 'needs_practice' | 'developing' | 'good' | 'strong'
export const DIMENSION_LABELS: Record<string, string> = {
  calmness: 'Calmness',
  reassurance: 'Reassurance',
  listening: 'Listening',
  validation: 'Validation',
  clarity: 'Clarity',
  de_escalation: 'De-escalation',
  safety_awareness: 'Safety awareness',
}
export const LEVEL_LABELS: Record<Level, string> = { needs_practice: 'Needs practice', developing: 'Developing', good: 'Good', strong: 'Strong' }

export interface ScenarioTurn {
  role: 'character' | 'carer'
  text: string
  narration?: string
  emotion?: string
  intensity?: number
  delta?: number
  style?: string
  at: number
}

export interface Evaluation {
  score: number
  band: string
  summary: string
  dimensions: Record<string, Level>
  strengths: string[]
  improvements: string[]
  explanation: string
  suggested_response: string
  key_moment: { quote: string; likely_effect: string }
  startIntensity: number
  endIntensity: number
}

export interface ScenarioSession {
  id: number
  scenarioId: string
  mode: ScenarioMode
  lang: string
  status: 'active' | 'ended' | 'safety' | 'evaluated'
  emotion: string
  intensity: number
  startIntensity: number
  turns: ScenarioTurn[]
  suggestions: string[]
  carerTurns: number
  minTurns: number
  maxTurns: number
  endReason: null | 'resolved' | 'max_turns' | 'safety' | 'finished_early'
  evaluation: Evaluation | null
}

export interface ScenarioOverview {
  aiReady: boolean
  required: string[]
  total: number
  progress: { scenario_id: string; best: number | null; attempts: number }[]
}

/** Plain-language feeling level, so the meter never looks like a medical reading. */
export function feelingLabel(n: number) {
  return n <= 25 ? 'Settled' : n <= 45 ? 'Calmer' : n <= 65 ? 'Uneasy' : n <= 85 ? 'Upset' : 'Very upset'
}
export function feelingTone(n: number) {
  return n <= 25 ? 'bg-teal' : n <= 45 ? 'bg-leaf' : n <= 65 ? 'bg-amber' : 'bg-coral'
}
