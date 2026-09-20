import { motion } from 'framer-motion'
import { Check, Mic, Music, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, mediaUrl, type ApiError } from '../../api/client'
import type { Song } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Button, Empty, ErrorView, Field, inputCls, Loading, Sheet } from '../../components/ui'
import { useSpeechInput } from '../../lib/speech'
import { useSettings, type TKey } from '../../state/settings'

interface SongsData { songs: Song[]; today: { song_id: number; position: number } | null; date: string }
const src = (s: Song) => (s.media_id ? mediaUrl(s.media_id) : s.url ?? '')
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function TodaySong() {
  const { t } = useSettings()
  const { data, error, loading, reload } = useApi<SongsData>('/songs', ['songs:changed'])
  const [adding, setAdding] = useState(false)

  return (
    <AppShell title={t('area.song')} icon={<Music className="text-amber" aria-hidden />} home="/facilitate" homeLabel={t('shell.world')} tone="bg-[linear-gradient(180deg,#2a1f4d,#1c1631)]" dark>
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}
      {data && data.songs.length === 0 && (
        <div className="text-ink"><Empty title={t('song.emptyTitle')} body={t('song.emptyBody')}><Button big onClick={() => setAdding(true)}><Plus aria-hidden /> {t('song.add')}</Button></Empty></div>
      )}
      {data && data.songs.length > 0 && <Player data={data} onAdd={() => setAdding(true)} reload={reload} />}
      <AddSongSheet open={adding} onClose={() => setAdding(false)} onSaved={reload} />
    </AppShell>
  )
}

function Player({ data, onAdd, reload }: { data: SongsData; onAdd: () => void; reload: () => void }) {
  const { t, lang } = useSettings()
  const audio = useRef<HTMLAudioElement>(null)
  const idx0 = Math.max(0, data.songs.findIndex((s) => s.id === data.today?.song_id))
  const [idx, setIdx] = useState(idx0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const [loadErr, setLoadErr] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const logged = useRef(false)
  const song = data.songs[Math.min(idx, data.songs.length - 1)]
  const mic = useSpeechInput(lang, (s) => setNote((n) => (n ? n + ' ' : '') + s))

  // Restore today's saved position once.
  useEffect(() => {
    const a = audio.current
    if (a && data.today && song.id === data.today.song_id && data.today.position > 0) a.currentTime = data.today.position
  }, [song.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist listening position every 15 s while playing.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      api.put('/songs/today', { songId: song.id, position: Math.floor(audio.current?.currentTime ?? 0) }).catch(() => {})
    }, 15_000)
    return () => clearInterval(id)
  }, [playing, song.id])

  const onTime = () => {
    const a = audio.current!
    setTime(a.currentTime)
    if (!logged.current && a.currentTime > 20) {
      logged.current = true
      api.post('/routine/activity', { kind: 'song_played', ref: String(song.id) }).catch(() => {})
    }
  }

  const toggle = async () => {
    const a = audio.current!
    if (a.paused) {
      try { await a.play() } catch { setLoadErr(true) }
    } else a.pause()
  }

  const go = (d: number) => {
    const n = (idx + d + data.songs.length) % data.songs.length
    setIdx(n)
    setTime(0)
    setLoadErr(false)
    setNoteSaved(false)
    logged.current = false
    api.put('/songs/today', { songId: data.songs[n].id, position: 0 }).catch(() => {})
  }

  const saveNote = async () => {
    try {
      await api.post(`/songs/${song.id}/note`, { note })
      setNoteSaved(true)
      setNote('')
    } catch (e) {
      setErr(e as ApiError)
    }
  }

  const remove = async () => {
    try { await api.del(`/songs/${song.id}`); setIdx(0); reload() } catch (e) { setErr(e as ApiError) }
  }

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-2">
      <div className="relative mx-auto aspect-square w-full max-w-sm">
        <motion.div aria-hidden className="absolute inset-0 rounded-[48px] bg-gradient-to-br from-coral via-amber to-lavender shadow-[0_40px_80px_-20px_rgba(245,165,36,0.5)]"
          animate={playing ? { rotate: [0, 3, -3, 0], scale: [1, 1.02, 1] } : { rotate: 0 }} transition={{ duration: 6, repeat: Infinity }} />
        <div className="absolute inset-0 grid place-items-center">
          <motion.div animate={playing ? { rotate: 360 } : {}} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="grid size-3/5 place-items-center rounded-full bg-night/85 ring-8 ring-white/20">
            <Music size={72} className="text-amber" aria-hidden />
          </motion.div>
        </div>
      </div>

      <div>
        <p className="text-lg font-bold uppercase tracking-widest text-amber">{t('song.today')}</p>
        <h2 className="mt-2 text-4xl font-bold">{song.title}</h2>
        {song.artist && <p className="mt-1 text-2xl text-cream/80">{song.artist}</p>}
        <p className="mt-1 text-lg text-cream/70">{t('song.addedBy', { name: song.added_by_name })}</p>

        <audio ref={audio} src={src(song)} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onTimeUpdate={onTime} onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)} onError={() => setLoadErr(true)} />

        <label className="mt-6 block">
          <span className="sr-only">{t('song.position')}</span>
          <input type="range" min={0} max={dur || 0} step={1} value={time} onChange={(e) => { audio.current!.currentTime = Number(e.target.value) }}
            className="h-4 w-full cursor-pointer accent-amber" aria-valuetext={`${mmss(time)} / ${mmss(dur)}`} />
        </label>
        <div className="flex justify-between text-lg font-bold text-cream/80"><span>{mmss(time)}</span><span>{dur ? mmss(dur) : '--:--'}</span></div>

        {loadErr && <p role="alert" className="mt-3 rounded-2xl bg-coral/20 p-3 text-lg font-bold">{t('song.loadError')}</p>}

        <div className="mt-4 flex items-center justify-center gap-5">
          <button onClick={() => go(-1)} disabled={data.songs.length < 2} aria-label={t('common.previous')} className="grid size-16 place-items-center rounded-full bg-white/15 disabled:opacity-30"><SkipBack size={30} /></button>
          <button onClick={toggle} aria-label={playing ? t('song.pause') : t('song.play')} className="grid size-24 place-items-center rounded-full bg-amber text-night shadow-xl">
            {playing ? <Pause size={46} fill="currentColor" /> : <Play size={46} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => go(1)} disabled={data.songs.length < 2} aria-label={t('common.next')} className="grid size-16 place-items-center rounded-full bg-white/15 disabled:opacity-30"><SkipForward size={30} /></button>
        </div>
        <p className="mt-2 text-center text-xl font-bold">{playing ? t('song.pause') : t('song.play')}</p>

        <div className="mt-8 rounded-3xl bg-white/10 p-5">
          <p className="text-xl font-bold">{t('song.remind')}</p>
          {noteSaved ? <p className="mt-3 flex items-center gap-2 text-lg font-bold text-leaf"><Check aria-hidden /> {t('song.noteSaved')}</p> : (
            <div className="mt-3 flex gap-2">
              {mic.supported && <button onClick={mic.listening ? mic.stop : mic.start} aria-label={mic.listening ? t('voice.stop') : t('voice.speak')}
                className={`grid size-14 shrink-0 place-items-center rounded-full ${mic.listening ? 'animate-pulse bg-coral' : 'bg-white/15'}`}><Mic /></button>}
              <input value={mic.listening ? mic.interim || note : note} onChange={(e) => setNote(e.target.value)} maxLength={1000} aria-label={t('song.remind')}
                className="min-h-14 flex-1 rounded-2xl bg-white px-4 text-lg text-ink" placeholder={t('song.notePlaceholder')} />
              <Button variant="success" disabled={!note.trim()} onClick={saveNote}>{t('common.save')}</Button>
            </div>
          )}
          {mic.error && <p role="alert" className="mt-2 font-bold text-amber">{t(`voice.err.${mic.error}` as TKey)}</p>}
        </div>
        {err && <div className="mt-3 text-ink"><ErrorView error={err} /></div>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onAdd}><Plus aria-hidden /> {t('song.add')}</Button>
          <Button variant="ghost" className="text-cream hover:bg-white/10" onClick={remove}><Trash2 aria-hidden /> {t('song.remove')}</Button>
        </div>
      </div>
    </div>
  )
}

export function AddSongSheet({ open, onClose, onSaved, patientId }: { open: boolean; onClose: () => void; onSaved: () => void; patientId?: number }) {
  const { t } = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (patientId) fd.set('patientId', String(patientId))
    if (!(fd.get('file') as File)?.size) fd.delete('file')
    setBusy(true)
    try {
      await api.post('/songs', fd)
      onSaved()
      onClose()
      setError(null)
    } catch (err) {
      setError(err as ApiError)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('song.add')}>
      <form onSubmit={submit} className="space-y-5 text-ink">
        <Field label={t('song.title')}><input name="title" required maxLength={120} className={inputCls} /></Field>
        <Field label={t('song.artist')}><input name="artist" maxLength={120} className={inputCls} /></Field>
        <Field label={t('song.file')} hint={t('song.fileHint')}><input name="file" type="file" accept="audio/*" className={`${inputCls} py-3`} /></Field>
        <Field label={t('song.url')} hint={t('song.urlHint')}><input name="url" type="url" placeholder="https://" className={inputCls} /></Field>
        {error && <ErrorView error={error} />}
        <Button big busy={busy} className="w-full"><Plus aria-hidden /> {t('common.save')}</Button>
      </form>
    </Sheet>
  )
}
