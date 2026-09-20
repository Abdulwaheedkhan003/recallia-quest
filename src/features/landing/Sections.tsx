import { motion } from 'framer-motion'
import { BookOpen, CheckCircle2, Gamepad2, Heart, Hourglass, Mail, MessageCircleHeart, PartyPopper, Send, Smile } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import Mascot from '../../components/Mascot'
import { api } from '../../api/client'
import { useT, type TKey } from '../../state/settings'

/* ---------- shared bits ---------- */
const Reveal = ({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 32 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
)

function Heading({ kicker, title, body, center = true }: { kicker: string; title: string; body?: string; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <p className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-amber-deep">{kicker}</p>
      <h2 className="mt-3 text-4xl font-bold sm:text-5xl">{title}</h2>
      {body && <p className="mt-5 text-xl text-ink-soft">{body}</p>}
    </Reveal>
  )
}

/* ---------- About ---------- */
export function About() {
  const t = useT()
  const cards = [
    { icon: Gamepad2, title: t('about.c1t'), body: t('about.c1b'), tone: 'from-amber/25 to-coral/20', ic: 'bg-amber' },
    { icon: MessageCircleHeart, title: t('about.c2t'), body: t('about.c2b'), tone: 'from-lavender/25 to-sky/40', ic: 'bg-lavender' },
    { icon: Hourglass, title: t('about.c3t'), body: t('about.c3b'), tone: 'from-leaf/25 to-teal/15', ic: 'bg-teal' },
  ]
  return (
    <section id="about" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <Heading kicker={t('about.kicker')} title={t('about.title')} body={t('about.body')} />
      <div className="mx-auto mt-14 grid max-w-6xl gap-6 md:grid-cols-3">
        {cards.map(({ icon: I, title, body, tone, ic }, i) => (
          <Reveal key={title} delay={i * 0.12}>
            <article className={`group h-full rounded-[32px] bg-gradient-to-br ${tone} p-8 transition hover:-translate-y-1.5`}>
              <span className={`grid size-20 place-items-center rounded-3xl ${ic} text-white shadow-lg transition group-hover:rotate-[-6deg] group-hover:scale-105`}>
                <I size={40} aria-hidden />
              </span>
              <h3 className="mt-6 text-2xl font-semibold">{title}</h3>
              <p className="mt-3 text-lg text-ink-soft">{body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

/* ---------- Why ---------- */
export function Why() {
  const t = useT()
  return (
    <section className="px-4 py-12 sm:px-6">
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 overflow-hidden rounded-[40px] bg-night p-8 text-cream sm:p-14 md:grid-cols-[1.3fr_1fr]">
        <div aria-hidden className="absolute -right-24 -top-24 size-80 rounded-full bg-lavender/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 left-10 size-72 rounded-full bg-amber/20 blur-3xl" />
        <Reveal className="relative">
          <p className="font-display text-lg font-semibold uppercase tracking-[0.2em] text-amber">{t('why.kicker')}</p>
          <h2 className="mt-3 text-4xl font-bold sm:text-5xl">{t('why.title')}</h2>
          <p className="mt-5 text-xl text-cream/85">{t('why.body')}</p>
          <blockquote className="mt-8 border-l-4 border-amber pl-5 text-xl italic">
            {t('why.q')}
            <footer className="mt-2 text-base not-italic text-cream/70">{t('why.qBy')}</footer>
          </blockquote>
        </Reveal>
        <Reveal delay={0.2} className="relative grid place-items-center">
          <div className="relative">
            <div aria-hidden className="absolute inset-0 scale-125 rounded-full bg-amber/25 blur-2xl" />
            <Mascot size={260} mood="encouraging" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Impact ---------- */
export function Impact() {
  const t = useT()
  const stats: [TKey, TKey, string][] = [
    ['impact.s1n', 'impact.s1l', 'text-coral'],
    ['impact.s2n', 'impact.s2l', 'text-lavender'],
    ['impact.s3n', 'impact.s3l', 'text-teal'],
    ['impact.s4n', 'impact.s4l', 'text-amber-deep'],
  ]
  return (
    <section id="impact" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <Heading kicker={t('impact.kicker')} title={t('impact.title')} />
      <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([n, l, c], i) => (
          <Reveal key={n} delay={i * 0.1}>
            <div className="h-full rounded-[28px] bg-white p-7 shadow-[0_12px_40px_-20px_rgba(43,33,64,0.35)]">
              <p className={`font-display text-6xl font-bold ${c}`}>{t(n)}</p>
              <p className="mt-3 text-lg font-bold text-ink-soft">{t(l)}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-center text-base text-ink-soft">* {t('impact.note')}</p>
    </section>
  )
}

/* ---------- How it works ---------- */
export function How() {
  const t = useT()
  const steps = [
    { icon: Smile, title: t('how.s1t'), body: t('how.s1b') },
    { icon: BookOpen, title: t('how.s2t'), body: t('how.s2b') },
    { icon: Heart, title: t('how.s3t'), body: t('how.s3b') },
    { icon: PartyPopper, title: t('how.s4t'), body: t('how.s4b') },
  ]
  return (
    <section id="how" className="scroll-mt-24 bg-gradient-to-b from-parchment/60 to-cream px-4 py-24 sm:px-6">
      <Heading kicker={t('how.kicker')} title={t('how.title')} />
      <ol className="relative mx-auto mt-16 grid max-w-6xl gap-10 md:grid-cols-4 md:gap-6">
        <div aria-hidden className="absolute left-[12%] right-[12%] top-12 hidden border-t-4 border-dashed border-amber/50 md:block" />
        {steps.map(({ icon: I, title, body }, i) => (
          <Reveal key={title} delay={i * 0.15}>
            <li className="relative flex flex-col items-center text-center">
              <span className="relative grid size-24 place-items-center rounded-full bg-white text-amber-deep shadow-lg ring-8 ring-cream">
                <I size={40} aria-hidden />
                <span className="absolute -right-1 -top-1 grid size-9 place-items-center rounded-full bg-ink font-display text-lg font-bold text-cream">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-2xl font-semibold">{title}</h3>
              <p className="mt-2 text-lg text-ink-soft">{body}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  )
}

/* ---------- Contact ---------- */
export function Contact() {
  const t = useT()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/contact', Object.fromEntries(new FormData(e.currentTarget)))
      setSent(true)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const field = 'mt-2 min-h-14 w-full rounded-2xl border-2 border-ink/15 bg-cream px-4 text-lg focus:border-lavender'
  return (
    <section id="contact" className="scroll-mt-24 px-4 py-24 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2">
        <div>
          <Heading kicker={t('contact.kicker')} title={t('contact.title')} body={t('contact.body')} center={false} />
          <Reveal delay={0.2} className="mt-8 flex items-center gap-3 text-xl font-bold">
            <span className="grid size-14 place-items-center rounded-2xl bg-lavender/20 text-lavender"><Mail size={26} aria-hidden /></span>
            hello@recalliaquest.example
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          {sent ? (
            <div role="status" className="flex h-full flex-col items-center justify-center gap-4 rounded-[32px] bg-white p-10 text-center shadow-lg">
              <Mascot size={140} mood="celebrating" label="" />
              <p className="flex items-center gap-2 text-xl font-bold text-teal"><CheckCircle2 aria-hidden /> {t('contact.sent')}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5 rounded-[32px] bg-white p-8 shadow-lg">
              <label className="block text-lg font-bold">{t('contact.name')}<input required name="name" className={field} autoComplete="name" /></label>
              <label className="block text-lg font-bold">{t('contact.email')}<input required type="email" name="email" className={field} autoComplete="email" /></label>
              <label className="block text-lg font-bold">{t('contact.message')}<textarea required name="message" rows={4} className={`${field} py-3`} /></label>
              {error && <p role="alert" className="rounded-2xl bg-coral/10 p-3 text-lg font-bold text-[#9a3412]">{error}</p>}
              <button disabled={busy} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-full bg-ink text-xl font-bold text-cream transition hover:-translate-y-0.5">
                <Send size={22} aria-hidden /> {t('contact.send')}
              </button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Footer ---------- */
export function Footer() {
  const t = useT()
  return (
    <footer className="bg-night px-4 py-12 text-cream sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center md:flex-row md:text-left">
        <Mascot size={72} label="" />
        <div className="flex-1">
          <p className="font-display text-2xl font-bold">{t('brand')}</p>
          <p className="mt-2 max-w-2xl text-base text-cream/75">{t('footer.disclaimer')}</p>
        </div>
        <p className="text-base text-cream/75">© {new Date().getFullYear()} · {t('footer.rights')}</p>
      </div>
    </footer>
  )
}
