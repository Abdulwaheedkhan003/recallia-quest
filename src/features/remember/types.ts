export type Step =
  | { type: 'photo'; itemId: number; caption: string }
  | { type: 'memory'; text: string; evidence: string[]; itemId: number | null }
  | { type: 'audio'; itemId: number; caption: string }
  | { type: 'question'; text: string; ifYes: string; ifNo: string; evidence: string[]; itemId: number | null }

export interface Story {
  title: string
  person: { id: number; name: string; relationship: string }
  introduction: string
  recognition: { itemId: number | null; question: string }
  onYes: string
  onNo: string
  steps: Step[]
  closing: string
}

export interface StoryPayload {
  storyId: number
  story: Story
  assets: Record<string, { url: string; kind: string }>
  photos: { id: number; url: string }[]
}

export interface RememberPerson {
  id: number
  name: string
  relationship: string
  isSample: boolean
  avatar: string | null
  ready: boolean
}

export type Answer = 'yes' | 'no' | 'not_sure'

/** Understand a spoken or typed reply without sending it anywhere (English, Hindi, Tamil, Assamese, Nepali keywords). */
export function classifyAnswer(raw: string): Answer | null {
  const s = ` ${raw.toLowerCase().normalize('NFKC').replace(/[.,!?।]/g, ' ')} `
  const has = (words: string[]) => words.some((w) => s.includes(` ${w} `) || (w.length > 3 && s.includes(w)))
  if (has(['not sure', 'maybe', "don't know", 'dont know', 'i do not know', 'perhaps', 'no idea', 'kind of', 'a little', 'पता नहीं', 'शायद', 'தெரியாது', 'தெரியலை', 'ஒருவேளை', 'নাজানো', 'হ\'ব পাৰে', 'হ’ব পাৰে', 'थाहा छैन', 'होला', 'पक्का छैन'])) return 'not_sure'
  if (has(["don't", 'dont', 'no', 'not', 'nope', 'not really', 'never', 'नहीं', 'ना', 'இல்லை', 'இல்ல', 'নহয়', 'নহয়', 'নাই', 'মনত নাই', 'নপৰে', 'होइन', 'छैन'])) return 'no'
  if (has(['yes', 'yeah', 'yep', 'yup', 'i do', 'i remember', 'of course', 'sure', 'right', 'that is', "that's", 'हाँ', 'हां', 'हा', 'जी', 'ஆம்', 'ஆமா', 'ஆமாம்', 'நினைவிருக்கு', 'হয়', 'হয়', 'মনত পৰিছে', 'हो', 'हजुर', 'सम्झना छ'])) return 'yes'
  return null
}
