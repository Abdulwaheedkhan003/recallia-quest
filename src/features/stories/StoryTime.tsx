import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight, Mic, Pause, Play, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError, mediaUrl } from '../../api/client'
import type { Memory, Story } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { Button, ErrorView, Loading } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { speak, stopSpeaking, useSpeechInput, useVoiceFor } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'
import SceneArt from './SceneArt'

interface List { stories: { id: number; title: string; created_at: number }[]; aiReady: boolean; required: string[] }

export default function StoryTime() {
  const { t, lang } = useSettings()
  const { data, error, loading, reload } = useApi<List>('/stories')
  const [story, setStory] = useState<Story | null>(null)
  const [theme, setTheme] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const mic = useSpeechInput(lang, (s) => setTheme(s))

  const create = async () => {
    setBusy(true)
    setErr(null)
    try {
      const r = await api.post<{ story: Story }>('/stories', { theme, lang })
      setStory(r.story)
      setTheme('')
      reload()
    } catch (e) {
      setErr(e as ApiError)
    } finally {
      setBusy(false)
    }
  }
  const open = async (id: number) => {
    try { setStory((await api.get<{ story: Story }>(`/stories/${id}`)).story) } catch (e) { setErr(e as ApiError) }
  }

  return (
    <AppShell title={t('story.title')} icon={<BookOpen className="text-amber" aria-hidden />} story={false} tone="bg-[linear-gradient(180deg,#2a1f4d_0%,#3a2d63_40%,#fdeed3_100%)]" dark>
      {story ? <StoryPlayer story={story} onClose={() => { stopSpeaking(); setStory(null) }} /> : (
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col items-center text-center">
            <Mascot size={170} mood={busy ? 'thinking' : 'explaining'} />
            <h2 className="mt-2 text-4xl font-bold">{t('story.welcome')}</h2>
            <p className="mt-2 text-xl text-cream/85">{t('story.intro')}</p>
          </div>
          {loading && <Loading />}
          {error && <div className="text-ink"><ErrorView error={error} onRetry={reload} /></div>}
          {data && !data.aiReady && <div className="mt-6 text-ink"><ErrorView error={new ApiError(503, 'AI_NOT_CONFIGURED', t('story.notConnected'), { required: data.required })} /></div>}
          {data?.aiReady && (
            <div className="mt-6 rounded-[32px] bg-white p-5 text-ink shadow-xl">
              <label htmlFor="theme" className="text-xl font-bold">{t('story.themeLabel')}</label>
              <div className="mt-2 flex gap-2">
                {mic.supported && <button onClick={mic.listening ? mic.stop : mic.start} aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
                  className={`grid size-16 shrink-0 place-items-center rounded-full text-white ${mic.listening ? 'animate-pulse bg-coral' : 'bg-lavender'}`}><Mic size={28} /></button>}
                <input id="theme" value={mic.listening ? mic.interim : theme} onChange={(e) => setTheme(e.target.value)} maxLength={200} placeholder={t('story.themePh')} className="min-h-16 flex-1 rounded-2xl bg-cream px-4 text-xl" />
              </div>
              {mic.error && <p role="alert" className="mt-2 font-bold text-coral">{t(`voice.err.${mic.error}` as TKey)}</p>}
              <Button big busy={busy} className="mt-4 w-full" onClick={create}><Sparkles aria-hidden /> {busy ? t('story.writing') : t('story.new')}</Button>
              {err && <div className="mt-3"><ErrorView error={err} /></div>}
            </div>
          )}
          {data && data.stories.length > 0 && (
            <section className="mt-8">
              <h2 className="text-2xl font-bold">{t('story.saved')}</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {data.stories.map((s) => (
                  <li key={s.id}><button onClick={() => open(s.id)} className="w-full rounded-3xl bg-white/15 p-5 text-left backdrop-blur hover:bg-white/25">
                    <span className="block text-xl font-bold">📖 {s.title}</span><span className="text-cream/75">{fmtDateTime(s.created_at, lang)}</span>
                  </button></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  )
}

function StoryPlayer({ story, onClose }: { story: Story; onClose: () => void }) {
  const { t } = useSettings()
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [voiceErr, setVoiceErr] = useState(false)
  const hasVoice = useVoiceFor(story.lang)
  const { data: mem } = useApi<{ memories: Memory[] }>(story.scenes.some((s) => s.memoryId) ? '/memories' : null)
  const playingRef = useRef(false)
  const scene = story.scenes[i]
  const photo = scene.memoryId ? mem?.memories.find((m) => m.id === scene.memoryId && m.media_id) : undefined

  useEffect(() => {
    if (i === story.scenes.length - 1) api.post('/routine/activity', { kind: 'story_listened', ref: String(story.id) }).catch(() => {})
  }, [i, story])

  const narrate = async (from: number) => {
    playingRef.current = true
    setPlaying(true)
    for (let k = from; k < story.scenes.length && playingRef.current; k++) {
      setI(k)
      try {
        await speak(story.scenes[k].text, story.lang, 0.85)
      } catch {
        setVoiceErr(true)
        break
      }
      if (playingRef.current) await new Promise((r) => setTimeout(r, 900))
    }
    playingRef.current = false
    setPlaying(false)
  }
  const pause = () => { playingRef.current = false; stopSpeaking(); setPlaying(false) }
  const go = (d: number) => { pause(); setI((x) => Math.max(0, Math.min(story.scenes.length - 1, x + d))) }
  useEffect(() => () => { playingRef.current = false; stopSpeaking() }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onClose}><ChevronLeft aria-hidden /> {t('story.all')}</Button>
        <p className="text-lg font-bold">{t('story.scene', { n: i + 1, total: story.scenes.length })}</p>
      </div>
      <h2 className="mt-4 text-center text-4xl font-bold">{story.title}</h2>
      <div className="relative mt-5 aspect-[16/10] overflow-hidden rounded-[40px] shadow-2xl ring-8 ring-white/20">
        <AnimatePresence mode="wait">
          <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            {photo?.media_id ? <img src={mediaUrl(photo.media_id)} alt={photo.title} className="size-full object-cover" /> : <SceneArt setting={scene.setting} />}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-3 right-3"><Mascot size={90} mood={playing ? 'explaining' : 'happy'} label="" /></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.p key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-[32px] bg-cream p-6 text-2xl leading-relaxed text-ink shadow-lg sm:text-3xl">{scene.text}</motion.p>
      </AnimatePresence>
      {(!hasVoice || voiceErr) && <p role="alert" className="mt-3 rounded-2xl bg-white/90 p-3 text-lg font-bold text-ink">{t('voice.noVoice')}</p>}
      <div className="mt-6 flex items-center justify-center gap-5">
        <button onClick={() => go(-1)} disabled={i === 0} aria-label={t('common.previous')} className="grid size-18 size-[72px] place-items-center rounded-full bg-white text-ink shadow disabled:opacity-30"><ChevronLeft size={40} /></button>
        <button onClick={() => (playing ? pause() : narrate(i))} disabled={!hasVoice} aria-label={playing ? t('story.pause') : t('story.listen')} className="grid size-24 place-items-center rounded-full bg-amber text-night shadow-xl disabled:opacity-40">
          {playing ? <Pause size={44} fill="currentColor" /> : <Play size={44} fill="currentColor" className="ml-1" />}
        </button>
        <button onClick={() => go(1)} disabled={i === story.scenes.length - 1} aria-label={t('common.next')} className="grid size-[72px] place-items-center rounded-full bg-white text-ink shadow disabled:opacity-30"><ChevronRight size={40} /></button>
      </div>
      <p className="mt-2 text-center text-xl font-bold text-ink">{playing ? t('story.pause') : t('story.listen')}</p>
    </div>
  )
}
