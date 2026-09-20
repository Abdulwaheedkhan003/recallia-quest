// Real connectivity check for the configured AI provider: `npm run check:ai`
import { probeAi } from '../server/ai.ts'
const r = await probeAi()
console.log(JSON.stringify(r, null, 2))
process.exit(r.ok ? 0 : 1)
