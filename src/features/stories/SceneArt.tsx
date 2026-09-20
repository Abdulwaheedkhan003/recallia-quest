import { motion } from 'framer-motion'

/** Hand-drawn SVG backdrops for story scenes (one per setting the story model may choose). */
const SKY: Record<string, [string, string]> = {
  garden: ['#bfe3ff', '#fff3d6'], beach: ['#9fd8ff', '#fff1c9'], village: ['#ffd9a8', '#fff3e0'], kitchen: ['#fde7c5', '#fff8ec'],
  night: ['#1c1631', '#3a2d63'], mountains: ['#cfe8ff', '#f4f1ff'], market: ['#ffe1b0', '#fff8ec'], river: ['#bdeaff', '#e8fff6'],
  home: ['#ffe9d0', '#fff8ec'], festival: ['#3a2d63', '#f27f5b'],
}

export default function SceneArt({ setting }: { setting: string }) {
  const [a, b] = SKY[setting] ?? SKY.home
  const night = setting === 'night' || setting === 'festival'
  return (
    <svg viewBox="0 0 400 250" className="h-full w-full" role="presentation" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id={`sky-${setting}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient></defs>
      <rect width="400" height="250" fill={`url(#sky-${setting})`} />
      {night ? (
        <>
          <circle cx="320" cy="55" r="26" fill="#fff3c4" />
          {[40, 90, 150, 210, 260, 360].map((x, i) => <motion.circle key={x} cx={x} cy={30 + (i % 3) * 25} r="2.5" fill="#fff" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }} />)}
        </>
      ) : (
        <motion.circle cx="330" cy="55" r="30" fill="#ffd37a" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 5, repeat: Infinity }} style={{ originX: '330px', originY: '55px' }} />
      )}
      {!night && <motion.g animate={{ x: [0, 20, 0] }} transition={{ duration: 16, repeat: Infinity }}><ellipse cx="90" cy="50" rx="40" ry="14" fill="#fff" opacity=".9" /><ellipse cx="200" cy="35" rx="30" ry="10" fill="#fff" opacity=".8" /></motion.g>}

      {setting === 'mountains' && <><path d="M0 200 L90 90 L170 200Z" fill="#8b7cf6" opacity=".7" /><path d="M110 210 L230 70 L350 210Z" fill="#6f5ee8" /><path d="M230 70 l-25 30 h50z" fill="#fff" /></>}
      {(setting === 'beach' || setting === 'river') && <motion.path d="M0 180 Q100 165 200 180 T400 180 V250 H0Z" fill="#4fb3e8" animate={{ d: ['M0 180 Q100 165 200 180 T400 180 V250 H0Z', 'M0 182 Q100 195 200 180 T400 184 V250 H0Z', 'M0 180 Q100 165 200 180 T400 180 V250 H0Z'] }} transition={{ duration: 5, repeat: Infinity }} />}
      {setting === 'beach' && <path d="M0 215 Q200 195 400 215 V250 H0Z" fill="#f6d99a" />}
      {['garden', 'village', 'mountains', 'river', 'market', 'home', 'night', 'festival'].includes(setting) && <path d="M0 205 Q200 180 400 205 V250 H0Z" fill={night ? '#2b2140' : '#6dbf73'} />}
      {setting === 'garden' && [60, 130, 270, 340].map((x, i) => <g key={x}><path d={`M${x} 215 v-30`} stroke="#3f8f4a" strokeWidth="3" /><circle cx={x} cy="182" r="10" fill={['#f27f5b', '#f5a524', '#8b7cf6', '#ff9fb2'][i]} /><circle cx={x} cy="182" r="4" fill="#fff3c4" /></g>)}
      {(setting === 'village' || setting === 'home') && <g><rect x="150" y="140" width="100" height="70" fill="#f9b94a" /><path d="M140 145 L200 100 L260 145Z" fill="#c2410c" /><rect x="188" y="170" width="24" height="40" fill="#8a5a12" /><rect x="160" y="155" width="18" height="16" fill="#fff3c4" /><rect x="222" y="155" width="18" height="16" fill="#fff3c4" /></g>}
      {setting === 'kitchen' && <g><rect x="0" y="170" width="400" height="80" fill="#e9c98a" /><rect x="60" y="120" width="90" height="50" rx="8" fill="#fff" /><circle cx="250" cy="150" r="24" fill="#8a5a12" /><motion.path d="M245 120 q6 -12 0 -24" stroke="#fff" strokeWidth="4" fill="none" animate={{ opacity: [0.2, 0.9, 0.2] }} transition={{ duration: 2.5, repeat: Infinity }} /></g>}
      {setting === 'market' && [40, 150, 260].map((x, i) => <g key={x}><rect x={x} y="140" width="90" height="60" fill="#fff" /><path d={`M${x - 8} 140 h106 l-10 -24 h-86z`} fill={['#f27f5b', '#1f8a7e', '#8b7cf6'][i]} /><circle cx={x + 25} cy="170" r="9" fill="#f5a524" /><circle cx={x + 55} cy="172" r="9" fill="#6dbf73" /></g>)}
      {setting === 'festival' && [60, 140, 220, 300, 360].map((x, i) => <motion.circle key={x} cx={x} cy={60 + (i % 2) * 30} r="12" fill={['#f5a524', '#f27f5b', '#8b7cf6', '#6dbf73', '#ffd37a'][i]} animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }} />)}
    </svg>
  )
}
