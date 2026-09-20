// Writes unreal/objects.json — the room/object ids the Unreal level must use (`npm run unreal:ids`).
import { writeFileSync } from 'node:fs'
import { ROOMS } from '../src/features/simulation/rooms.ts'
const out = Object.fromEntries(ROOMS.map((r) => [r.id, r.objects.map((o) => ({ id: o.id, actions: o.actions.map((a) => a.type) }))]))
writeFileSync(new URL('../unreal/objects.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log('wrote unreal/objects.json')
