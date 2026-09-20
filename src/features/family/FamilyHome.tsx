import { Heart, HeartHandshake, ImagePlus, KeyRound, LogOut, MessageCircle, MessagesSquare, Music, Settings } from 'lucide-react'
import { useState } from 'react'
import { api, mediaUrl, type ApiError } from '../../api/client'
import type { CircleData, Memory } from '../../api/types'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import Mascot from '../../components/Mascot'
import { Button, ErrorView, Field, inputCls, Loading } from '../../components/ui'
import { navigate } from '../../lib/router'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import AddMemory from '../capsule/AddMemory'
import { AddSongSheet } from '../song/TodaySong'

/** For family accounts: share memories and songs with a loved one. Not a monitoring dashboard. */
export default function FamilyHome() {
  const { t } = useSettings()
  const { user, logout } = useAuth()
  const { data, error, loading, reload } = useApi<CircleData>('/circle')
  const [pid, setPid] = useState<number | null>(null)
  const [adding, setAdding] = useState<'memory' | 'song' | null>(null)
  const [joinErr, setJoinErr] = useState<ApiError | null>(null)
  const patient = data?.patients.find((p) => p.id === pid) ?? data?.patients[0]
  const mem = useApi<{ memories: Memory[] }>(patient ? `/memories?patientId=${patient.id}` : null, ['memories:changed'])

  const join = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>
    try { await api.post('/circle/join', f); setJoinErr(null); reload() } catch (err) { setJoinErr(err as ApiError) }
  }

  return (
    <AppShell title={t('family.title')} icon={<Heart className="text-coral" aria-hidden />} story={false}>
      <div className="flex items-center gap-4">
        <Mascot size={110} mood="happy" />
        <p className="text-3xl font-bold">{t('family.hello', { name: user?.display_name ?? '' })}</p>
      </div>
      {loading && <Loading />}
      {error && <ErrorView error={error} onRetry={reload} />}

      {data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <section className="space-y-4">
            <div className="rounded-[28px] bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-2xl font-bold"><KeyRound aria-hidden /> {t('family.join')}</h2>
              <p className="mt-1 text-ink-soft">{t('family.joinHint')}</p>
              <form onSubmit={join} className="mt-3 space-y-3">
                <Field label={t('family.code')}><input name="code" required minLength={8} maxLength={8} className={`${inputCls} font-mono uppercase tracking-widest`} /></Field>
                <Field label={t('family.relation')}><input name="relation" maxLength={40} className={inputCls} placeholder={t('family.relationPh')} /></Field>
                <Button className="w-full">{t('family.joinBtn')}</Button>
              </form>
              {joinErr && <div className="mt-3"><ErrorView error={joinErr} /></div>}
            </div>
            {data.patients.length > 0 && (
              <ul className="space-y-2">
                {data.patients.map((p) => (
                  <li key={p.id}><button onClick={() => setPid(p.id)} aria-current={patient?.id === p.id}
                    className={`w-full rounded-3xl p-4 text-left text-xl font-bold ${patient?.id === p.id ? 'bg-coral text-white' : 'bg-white shadow-sm'}`}>{p.display_name}</button></li>
                ))}
              </ul>
            )}
            <button onClick={() => navigate('/care')} className="flex w-full items-center gap-4 rounded-[28px] bg-gradient-to-br from-[#f7a26b] to-[#e0607e] p-5 text-left text-white shadow-md">
              <HeartHandshake size={40} aria-hidden className="shrink-0" />
              <span><span className="block text-2xl font-bold">{t('hub.careSpace')}</span><span className="block text-lg text-white/90">{t('hub.careSpaceBody')}</span></span>
            </button>
            <button onClick={() => navigate('/practice')} className="flex w-full items-center gap-4 rounded-[28px] bg-gradient-to-br from-teal to-[#1d5f8a] p-5 text-left text-white shadow-md">
              <MessagesSquare size={40} aria-hidden className="shrink-0" />
              <span><span className="block text-2xl font-bold">{t('hub.practice')}</span><span className="block text-lg text-white/90">{t('hub.practiceBody')}</span></span>
            </button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate('/settings')}><Settings aria-hidden /> {t('hub.settings')}</Button>
              <Button variant="ghost" onClick={() => logout().then(() => navigate('/'))}><LogOut aria-hidden /> {t('hub.signOut')}</Button>
            </div>
          </section>

          {patient ? (
            <section className="rounded-[32px] bg-white p-6 shadow-sm">
              <h2 className="text-3xl font-bold">{t('family.shareWith', { name: patient.display_name })}</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Button big onClick={() => setAdding('memory')}><ImagePlus aria-hidden /> {t('family.memory')}</Button>
                <Button big variant="secondary" onClick={() => setAdding('song')}><Music aria-hidden /> {t('family.song')}</Button>
                <Button big variant="secondary" onClick={() => navigate('/interact')}><MessageCircle aria-hidden /> {t('family.message')}</Button>
              </div>
              <h3 className="mt-6 text-xl font-bold">{t('family.shared')}</h3>
              {mem.error && <ErrorView error={mem.error} />}
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mem.data?.memories.map((m) => (
                  <li key={m.id} className="rounded-2xl bg-cream p-2">
                    {m.kind === 'photo' && m.media_id ? <img src={mediaUrl(m.media_id)} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="grid aspect-square place-items-center text-5xl" aria-hidden>{m.kind === 'audio' ? '🎙️' : m.kind === 'video' ? '🎞️' : '💌'}</div>}
                    <p className="mt-1 font-bold">{m.title}</p>
                    {m.last_answer && <p className="text-sm text-ink-soft">💬 {m.last_answer}</p>}
                  </li>
                ))}
              </ul>
              <AddMemory open={adding === 'memory'} patientId={patient.id} onClose={() => setAdding(null)} onSaved={mem.reload} />
              <AddSongSheet open={adding === 'song'} patientId={patient.id} onClose={() => setAdding(null)} onSaved={() => {}} />
            </section>
          ) : (
            <p className="text-xl text-ink-soft">{t('family.noneLinked')}</p>
          )}
        </div>
      )}
    </AppShell>
  )
}
