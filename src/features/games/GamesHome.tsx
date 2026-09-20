import { Gamepad2 } from 'lucide-react'
import { Suspense, useMemo } from 'react'
import { useApi } from '../../api/useApi'
import AppShell from '../../components/AppShell'
import { Loading } from '../../components/ui'
import { navigate, useRoute } from '../../lib/router'
import { useSettings } from '../../state/settings'
import { byId, CATS } from './catalog'
import GameFrame from './GameFrame'
import { REGISTRY } from './registry'
import Swarm, { type GameStat } from './Swarm'

interface Stats { stats: { game: string; plays: number; best_level: number; best_ratio: number; last_played: number }[] }

export default function GamesHome() {
  const { t } = useSettings()
  const { path, query } = useRoute()
  const id = path.split('/')[2]
  const game = id ? byId(id) : undefined
  const { data } = useApi<Stats>(game ? null : '/games', ['handbook:changed'])
  const stats = useMemo(() => Object.fromEntries((data?.stats ?? []).map((s) => [s.game, s as GameStat])), [data])

  if (game) {
    const C = REGISTRY[game.id]
    const lvl = Number(query.get('level'))
    const cat = CATS.find((c) => c.id === game.cat)!
    return (
      <AppShell title={game.titleKey ? t(game.titleKey) : game.title} icon={<span aria-hidden>{game.emoji}</span>} home={`/games?from=${game.id}`} homeLabel={`${cat.e} ${t('games.all')}`} story={false} tone="bg-[linear-gradient(180deg,#e6f6ef,#fff8ec)]">
        <Suspense fallback={<Loading />}>
          <GameFrame key={game.id} id={game.id} initialLevel={lvl >= 1 && lvl <= 3 ? lvl : undefined} render={(p) => <C {...p} />} />
        </Suspense>
      </AppShell>
    )
  }

  return (
    <AppShell title={t('area.games')} icon={<Gamepad2 className="text-teal" aria-hidden />} home="/facilitate" homeLabel={t('shell.world')} tone="bg-[linear-gradient(180deg,#bfe3ff_0%,#dff5e3_60%,#fff8ec_100%)]">
      <Swarm stats={stats} returning={query.get('from')} onStart={(gid, level) => navigate(`/games/${gid}?level=${level}`)} />
    </AppShell>
  )
}
