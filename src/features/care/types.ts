export interface CarePatient {
  id: number
  name: string
  preferredName: string
  relation: string
  managed: boolean
  photo: string | null
  online: boolean
  current: { area: string; since: number } | null
  people: number
  completeness: { filled: number; total: number }
}

export type Profile = Partial<Record<'basic' | 'personality' | 'memories' | 'communication', Record<string, string>>>

export interface PatientDetail {
  patient: { id: number; name: string; lang: string; managed: boolean; photo: string | null; updatedAt: number; online: boolean; current: { area: string; since: number } | null }
  profile: Profile
  completeness: { filled: number; total: number }
  languages: { code: string; name: string; native: string }[]
}

export interface StoryStatus { ready: boolean; upToDate: boolean; generator: string | null; createdAt: number | null; building?: boolean }

export interface PersonSummary {
  id: number
  name: string
  relationship: string
  avatar: string | null
  isDemo: boolean
  updatedAt: number
  photos: number
  audio: number
  memories: number
  phone?: string | null
  story?: StoryStatus
}

export interface PersonItem { id: number; kind: 'photo' | 'audio'; url: string | null; meta: Record<string, string | boolean>; isDemo: boolean; createdAt: number }
export interface PersonMemory { id: number; type: string; content: string; related_item_id: number | null; source: string; created_at: number; author: string | null }
export interface PersonDetail {
  person: PersonSummary & { avatarItemId: number | null; phone: string | null; details: Record<string, string> }
  items: PersonItem[]
  memories: PersonMemory[]
  story: StoryStatus
}

export const MEMORY_TYPES: { id: string; label: string; hint: string }[] = [
  { id: 'memory', label: 'A memory', hint: 'Something they shared or did' },
  { id: 'fun_moment', label: 'A fun moment', hint: 'A funny or happy moment' },
  { id: 'together', label: 'Things they did together', hint: 'e.g. played cricket every Sunday' },
  { id: 'place', label: 'A place', hint: 'A place that matters to them both' },
  { id: 'event', label: 'An event', hint: 'A wedding, a trip, a festival…' },
  { id: 'first_met', label: 'How they met', hint: 'Where or when they first met' },
  { id: 'importance', label: 'Why they matter', hint: 'Why this person is important' },
  { id: 'timeline', label: 'Timeline', hint: 'e.g. lived together in Chennai in the 1980s' },
]

export const AREA_LABELS: Record<string, string> = {
  hub: 'Home screen', remember: 'Remembrance Story', games: 'Games', facilitate: 'Adventure World', routine: 'Daily routine', companion: 'Talking with Lumi',
  capsule: 'Time Capsule', stories: 'Story Time', song: "Today's Song", relax: 'Relax', interact: 'Friends', 'home-sim': 'Home practice', agent: 'Doctor Helper', settings: 'Settings', practice: 'What Would You Do?',
}
export const areaLabel = (a: string) => AREA_LABELS[a] ?? a
