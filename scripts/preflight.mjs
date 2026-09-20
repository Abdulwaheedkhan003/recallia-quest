// Runs before `npm run dev` / `npm start`: clear messages instead of cryptic errors.
import { existsSync, copyFileSync } from 'node:fs'
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`\n  Recallia Quest needs Node.js 22.13 or newer (you have ${process.versions.node}).\n  Install the LTS version from https://nodejs.org and run this again.\n`)
  process.exit(1)
}
if (!existsSync('node_modules')) {
  console.error('\n  Dependencies are missing. Run:  npm install\n')
  process.exit(1)
}
if (!existsSync('.env') && existsSync('.env.example')) {
  copyFileSync('.env.example', '.env')
  console.log('  Created .env from .env.example (add your AI key there to enable Lumi).')
}
