import { motion } from 'framer-motion'
import { RotateCcw, Star, Volume2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { api, type ApiError } from '../../api/client'
import Mascot from '../../components/Mascot'
import { Button, ErrorView } from '../../components/ui'
import { navigate } from '../../lib/router'
import { speak } from '../../lib/speech'
import { useSettings } from '../../state/settings'
import { audioOn } from './audio'
import { byId } from './catalog'

export interface GameProps {
  level: number
  finish: (score: number, max: number) => void
  /** Gentle spoken/visual feedback from inside a game. */
  cheer: (kind: 'good' | 'retry') => void
}

/** Shared shell for every game: instructions, level, feedback, and saving the result. */
export default function GameFrame({ id, render, initialLevel }: { id: string; render: (p: GameProps) => ReactNode; initialLevel?: number }) {
  const { t, lang } = useSettings()
  const meta = byId(id)!
  const title = meta.titleKey ? t(meta.titleKey) : meta.title
  const how = meta.howKey ? t(meta.howKey) : meta.how
  const [level, setLevel] = useState<number | null>(initialLevel ?? null)
  const [round, setRound] = useState(0)
  const [result, setResult] = useState<{ score: number; max: number } | null>(null)
  const [saveErr, setSaveErr] = useState<ApiError | null>(null)
  const [feedback, setFeedback] = useState<'good' | 'retry' | null>(null)
  const started = useRef(Date.now())
  const fbTimer = useRef<number>(0)

  const start = (l: number) => {
    setLevel(l)
    setResult(null)
    setSaveErr(null)
    setRound((r) => r + 1)
    started.current = Date.now()
  }

  const finish = async (score: number, max: number) => {
    setResult({ score, max })
    speak(t('games.finished'), lang).catch(() => {})
    try {
      await api.post('/games/results', { game: id, level: level ?? 1, score, maxScore: max, durationMs: Date.now() - started.current })
    } catch (e) {
      setSaveErr(e as ApiError)
    }
  }

  const cheer = (kind: 'good' | 'retry') => {
    setFeedback(kind)
    clearTimeout(fbTimer.current)
    fbTimer.current = window.setTimeout(() => setFeedback(null), 1400)
  }

  const stars = result ? Math.max(1, Math.round((result.score / result.max) * 3)) : 0

  if (!level) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid size-32 place-items-center rounded-[36px] bg-white text-7xl shadow-lg" aria-hidden>{meta.emoji}</div>
        <h2 className="mt-5 text-4xl font-bold">{title}</h2>
        <p className="mt-3 text-2xl text-ink-soft">{how}</p>
        <Button variant="secondary" className="mt-4" onClick={() => speak(how, lang).catch(() => {})}><Volume2 aria-hidden /> {t('common.readAloud')}</Button>
        <p className="mt-8 text-xl font-bold">{t('games.chooseLevel')}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((l) => (
            <Button key={l} big variant={l === 1 ? 'primary' : 'secondary'} onClick={() => start(l)}>
              {'★'.repeat(l)} {t(l === 1 ? 'games.gentle' : l === 2 ? 'games.medium' : 'games.bigger')}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  if (result) {
    return (
      <motion.div role="status" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto max-w-xl rounded-[40px] bg-white p-8 text-center shadow-xl">
        <Mascot size={170} mood="celebrating" />
        <h2 className="mt-2 text-4xl font-bold">{t('games.finished')}</h2>
        <div className="mt-4 flex justify-center gap-2" aria-label={t('games.stars', { n: stars })}>
          {[1, 2, 3].map((s) => <Star key={s} size={52} className={s <= stars ? 'fill-amber text-amber' : 'text-ink/20'} aria-hidden />)}
        </div>
        <p className="mt-3 text-xl text-ink-soft">{t('games.score', { score: result.score, max: result.max })}</p>
        {saveErr ? <div className="mt-4 text-left"><ErrorView error={saveErr} onRetry={() => finish(result.score, result.max)} /></div> : <p className="mt-2 font-bold text-teal">✓ {t('games.saved')}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button big onClick={() => start(level)}><RotateCcw aria-hidden /> {t('games.again')}</Button>
          <Button big variant="secondary" onClick={() => navigate(`/games?from=${id}`)}>{t('games.other')}</Button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="relative">
      {meta.audio && !audioOn() && <p className="mx-auto mb-4 max-w-xl rounded-2xl bg-amber/30 p-3 text-center text-lg font-bold">🔇 Game sound is off. This activity needs sound — turn it on from the activity card.</p>}
      <div key={round}>{render({ level, finish, cheer })}</div>
      {feedback && (
        <motion.div role="status" aria-live="polite" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className={`fixed bottom-28 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full px-6 py-3 text-2xl font-bold shadow-xl ${feedback === 'good' ? 'bg-leaf text-white' : 'bg-white text-ink ring-4 ring-amber'}`}>
          {feedback === 'good' ? `✓ ${t('games.good')}` : `↻ ${t('games.retry')}`}
        </motion.div>
      )}
    </div>
  )
}
