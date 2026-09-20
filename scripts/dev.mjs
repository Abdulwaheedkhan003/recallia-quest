// Runs the API server and the Vite dev server together.
import { spawn } from 'node:child_process'
const run = (cmd) => spawn(cmd, { stdio: 'inherit', shell: true })
const procs = [run('npm run dev:server'), run('npm run dev:web')]
const stop = () => { procs.forEach((p) => p.kill()); process.exit() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
