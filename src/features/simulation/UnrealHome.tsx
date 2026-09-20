import { Config, PixelStreaming } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.5'
import { Box, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Mascot from '../../components/Mascot'
import { Button } from '../../components/ui'
import { useAuth } from '../../state/auth'
import { useSettings } from '../../state/settings'
import { ObjectPanel } from './HomeSim'
import { ROOMS, type SimObject } from './rooms'

/**
 * The 3D home, rendered by an Unreal Engine application and streamed with Pixel Streaming.
 *
 * Protocol (JSON over the Pixel Streaming data channel — see unreal/README.md):
 *   Unreal → web  (Send Pixel Streaming Response):  {"type":"ready"} · {"type":"enterRoom","room":"kitchen"} · {"type":"interact","room":"bathroom","object":"toothbrush"}
 *   web → Unreal  (emitUIInteraction):              {"type":"init","lang":"en","name":"…","rooms":{…}} · {"type":"result","object":"toothbrush","ok":true,"message":"…"}
 * Every action still runs through the same real API calls as the 2D home (ObjectPanel).
 */
type Conn = 'connecting' | 'connected' | 'needsTap' | 'failed'

export default function UnrealHome({ signallingUrl }: { signallingUrl: string }) {
  const { t, lang } = useSettings()
  const { user } = useAuth()
  const host = useRef<HTMLDivElement>(null)
  const ps = useRef<PixelStreaming | null>(null)
  const [conn, setConn] = useState<Conn>('connecting')
  const [room, setRoom] = useState<string | null>(null)
  const [selected, setSelected] = useState<SimObject | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!host.current) return
    const config = new Config({ useUrlParams: false, initialSettings: { ss: signallingUrl, AutoConnect: true, AutoPlayVideo: true, StartVideoMuted: false, HoveringMouse: true, MatchViewportRes: true } })
    const stream = new PixelStreaming(config, { videoElementParent: host.current })
    ps.current = stream
    setConn('connecting')

    const send = (msg: object) => stream.emitUIInteraction(msg)
    stream.addEventListener('videoInitialized', () => setConn('connected'))
    stream.addEventListener('playStreamRejected', () => setConn('needsTap'))
    stream.addEventListener('webRtcFailed', () => setConn('failed'))
    stream.addEventListener('webRtcDisconnected', () => setConn('failed'))
    stream.addEventListener('dataChannelOpen', () => {
      // Tell Unreal who is playing and which objects exist, in the chosen language.
      send({
        type: 'init',
        lang,
        name: user?.display_name ?? '',
        rooms: Object.fromEntries(ROOMS.map((r) => [r.id, { label: t(r.label), objects: Object.fromEntries(r.objects.map((o) => [o.id, t(o.label)])) }])),
      })
    })
    stream.addResponseEventListener('recallia', (raw) => {
      let msg: { type?: string; room?: string; object?: string }
      try { msg = JSON.parse(raw) } catch { return }
      if (msg.type === 'enterRoom' && msg.room) { setRoom(msg.room); setSelected(null) }
      if (msg.type === 'interact' && msg.room && msg.object) {
        const obj = ROOMS.find((r) => r.id === msg.room)?.objects.find((o) => o.id === msg.object)
        if (obj) { setRoom(msg.room); setSelected(obj) }
        else console.warn('[unreal] unknown object', msg)
      }
    })
    return () => { stream.disconnect(); ps.current = null }
  }, [signallingUrl, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const roomLabel = ROOMS.find((r) => r.id === room)

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="mb-3 flex items-center gap-2 text-2xl font-bold"><Box aria-hidden /> {roomLabel ? `${roomLabel.emoji} ${t(roomLabel.label)}` : t('sim.unreal3d')}</p>
        <div className="relative aspect-[16/10] overflow-hidden rounded-[36px] bg-night shadow-2xl">
          <div ref={host} className="absolute inset-0" aria-label={t('sim.unreal3d')} />
          {conn !== 'connected' && (
            <div className="absolute inset-0 grid place-items-center bg-night/85 p-6 text-center text-cream" role="status">
              <div>
                <Mascot size={110} mood={conn === 'failed' ? 'encouraging' : 'thinking'} label="" />
                <p className="mt-3 text-2xl font-bold">
                  {conn === 'connecting' ? t('sim.unrealConnecting') : conn === 'needsTap' ? t('sim.unrealTap') : t('sim.unrealFailed')}
                </p>
                {conn === 'needsTap' && <Button big className="mt-4" onClick={() => { ps.current?.play(); setConn('connected') }}><Play aria-hidden /> {t('sim.unrealStart')}</Button>}
                {conn === 'failed' && <Button big variant="secondary" className="mt-4" onClick={() => setAttempt((a) => a + 1)}><RotateCcw aria-hidden /> {t('status.retry')}</Button>}
              </div>
            </div>
          )}
        </div>
      </div>
      <aside aria-live="polite">
        {selected ? <ObjectPanel key={selected.id} o={selected} onResult={(ok, message) => ps.current?.emitUIInteraction({ type: 'result', object: selected.id, ok, message })} /> : (
          <div className="flex flex-col items-center rounded-[32px] bg-white/80 p-6 text-center">
            <Mascot size={130} mood="explaining" label="" />
            <p className="mt-3 text-2xl font-bold">{t('sim.tapSomething')}</p>
          </div>
        )}
      </aside>
    </div>
  )
}
