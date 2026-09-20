import { Gamepad2, MessageCircleHeart, Hourglass, CalendarHeart, Check, Play, SkipBack, SkipForward, Sun, Music2 } from 'lucide-react'
import Mascot from '../../components/Mascot'
import { useT } from '../../state/settings'

/** Miniature, decorative app screens used in the landing-page product reveal. */

const Frame = ({ children, tone = 'bg-cream' }: { children: React.ReactNode; tone?: string }) => (
  <div className={`h-full w-full overflow-hidden rounded-[22px] ${tone} p-4 text-ink`}>{children}</div>
)

export function ScreenHub() {
  const t = useT()
  const cards = [
    { icon: Gamepad2, label: t('reveal.games'), c: 'from-amber to-coral' },
    { icon: MessageCircleHeart, label: t('reveal.companion'), c: 'from-lavender to-[#b3a8ff]' },
    { icon: Hourglass, label: t('reveal.capsule'), c: 'from-teal to-leaf' },
    { icon: CalendarHeart, label: t('reveal.agent'), c: 'from-coral to-[#f7a38a]' },
  ]
  return (
    <Frame tone="bg-gradient-to-b from-sky to-cream">
      <div className="flex items-center gap-2">
        <Mascot size={44} label="" mood="happy" />
        <div>
          <p className="font-display text-[15px] font-semibold leading-tight">{t('reveal.hubTitle')}</p>
          <p className="text-[11px] text-ink-soft">{t('reveal.hubSub')}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {cards.map(({ icon: I, label, c }) => (
          <div key={label} className={`flex aspect-[1.1] flex-col justify-between rounded-2xl bg-gradient-to-br ${c} p-3 text-white shadow-md`}>
            <I size={26} strokeWidth={2.2} />
            <span className="font-display text-[13px] font-semibold">{label}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

export function ScreenRoutine() {
  const t = useT()
  const steps = [t('reveal.r1'), t('reveal.r2'), t('reveal.r3'), t('reveal.r4')]
  return (
    <Frame tone="bg-gradient-to-b from-[#fff1d6] to-cream">
      <div className="flex items-center gap-2 font-display text-[15px] font-semibold">
        <Sun className="text-amber" size={20} /> {t('reveal.routineTitle')}
      </div>
      <div className="mt-2 h-2 rounded-full bg-parchment">
        <div className="h-full w-1/2 rounded-full bg-leaf" />
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 rounded-xl p-2 text-[12px] font-bold ${i < 2 ? 'bg-leaf/20' : 'bg-white shadow-sm'}`}>
            <span className={`grid size-6 place-items-center rounded-full ${i < 2 ? 'bg-leaf text-white' : 'border-2 border-ink/20'}`}>
              {i < 2 && <Check size={14} strokeWidth={3} />}
            </span>
            {s}
          </li>
        ))}
      </ul>
    </Frame>
  )
}

export function ScreenSong() {
  const t = useT()
  return (
    <Frame tone="bg-gradient-to-b from-[#3a2d63] to-night">
      <div className="text-cream">
        <p className="text-[11px] uppercase tracking-widest text-amber">{t('reveal.songTitle')}</p>
        <div className="mx-auto mt-2 grid aspect-square w-3/4 place-items-center rounded-2xl bg-gradient-to-br from-coral via-amber to-lavender shadow-lg">
          <Music2 size={40} />
        </div>
        <p className="mt-2 text-center font-display text-[15px] font-semibold">{t('reveal.songName')}</p>
        <p className="text-center text-[11px] opacity-80">{t('reveal.songArtist')}</p>
        <div className="mt-2 h-1.5 rounded-full bg-white/20"><div className="h-full w-2/5 rounded-full bg-amber" /></div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <SkipBack size={18} />
          <span className="grid size-10 place-items-center rounded-full bg-amber text-night"><Play size={18} fill="currentColor" /></span>
          <SkipForward size={18} />
        </div>
      </div>
    </Frame>
  )
}

export function ScreenChat() {
  const t = useT()
  return (
    <Frame tone="bg-gradient-to-b from-[#efeaff] to-cream">
      <div className="flex items-end gap-2">
        <Mascot size={40} label="" mood="explaining" />
        <p className="rounded-2xl rounded-bl-sm bg-white p-2.5 text-[12px] font-bold shadow-sm">{t('reveal.chatHi')}</p>
      </div>
      <p className="ml-auto mt-2 w-fit rounded-2xl rounded-br-sm bg-lavender p-2.5 text-[12px] font-bold text-white">{t('reveal.chatMe')}</p>
      <p className="mt-2 w-fit rounded-2xl rounded-bl-sm bg-white p-2.5 text-[12px] font-bold shadow-sm">{t('reveal.chatReply')}</p>
    </Frame>
  )
}

export function ScreenMemory() {
  const t = useT()
  return (
    <Frame tone="bg-gradient-to-b from-[#e3f5ef] to-cream">
      <div className="rotate-[-3deg] rounded-xl bg-white p-2 pb-4 shadow-md">
        <div className="grid aspect-[4/3] place-items-center rounded-lg bg-gradient-to-br from-sky to-leaf/60">
          <svg viewBox="0 0 60 50" className="w-1/2" aria-hidden>
            <circle cx="30" cy="18" r="10" fill="#F9B94A" />
            <path d="M12 50 q18 -26 36 0" fill="#F27F5B" />
          </svg>
        </div>
      </div>
      <p className="mt-3 font-display text-[15px] font-semibold">{t('reveal.memoryQ')}</p>
      <p className="mt-1 rounded-xl bg-teal/15 p-2 text-[12px] font-bold text-teal">✓ {t('reveal.memoryA')}</p>
    </Frame>
  )
}

export const SCREENS = [ScreenHub, ScreenRoutine, ScreenSong, ScreenChat, ScreenMemory]
