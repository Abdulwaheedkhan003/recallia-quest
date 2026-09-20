export type Period = 'morning' | 'afternoon' | 'night'

export interface User {
  id: number
  email: string
  display_name: string
  role: 'patient' | 'family'
  lang: string
  timezone: string
  discoverable: number
  show_presence: number
  fhir_patient_id: string | null
}

export interface Task {
  id: number
  period: Period
  key: string | null
  title: string
  icon: string
  sort: number
  days: string
  time: string | null
  is_medication: number
  remind: number
}

export interface RoutineData {
  date: string
  weekday: number
  currentPeriod: Period
  tasks: Task[]
  completions: { task_id: number; completed_at: number }[]
}

export interface Quest {
  id: string
  kind: 'routine' | 'game' | 'song' | 'companion' | 'memory'
  period?: Period
  done: number
  total: number
  route: string
}

export interface Reminder {
  id: number
  text: string
  kind: string
  source: string
  date: string | null
  time: string
  recurrence: 'none' | 'daily' | 'weekdays' | 'weekly'
  days: string
  next_fire_at: number | null
}

export interface AppNotification {
  id: number
  reminder_id: number | null
  title: string
  body: string
  created_at: number
  done_at: number | null
}

export interface Person { id: number; name: string; circle: boolean; online: boolean | null; unread: number }
export interface Message { id: number; sender_id: number; recipient_id: number; body: string; created_at: number; read_at: number | null }

export interface Song { id: number; title: string; artist: string; media_id: string | null; url: string | null; added_by_name: string }

export interface Memory {
  id: number
  patient_id: number
  kind: 'photo' | 'audio' | 'video' | 'note'
  title: string
  description: string
  happened_on: string | null
  place: string
  people: string
  media_id: string | null
  author_name: string
  last_answer: string | null
  created_at: number
}

export interface Scene { text: string; setting: string; memoryId: number | null }
export interface Story { id: number; title: string; lang: string; scenes: Scene[]; created_at?: number }

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: number
  reminder_id?: number | null
  reminder_text?: string | null
  reminder_at?: number | null
  reminder_active?: number | null
  reminder_fired?: number | null
}

export interface Slot { id: string; start: string; end: string; practitioner: string; location: string; service: string }
export interface Appointment { id: number; external_id: string; status: string; start_at: number; description: string }

export interface CircleData {
  members: { link_id: number; relation: string; id: number; display_name: string; role: string }[]
  patients: { link_id: number; relation: string; id: number; display_name: string }[]
}
