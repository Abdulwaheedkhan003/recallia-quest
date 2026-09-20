// Translation coverage report: `npm run i18n:check`
// For each locale file: % of English keys translated, keys that don't exist in English, and {placeholder} mismatches.
import { readdirSync } from 'node:fs'
import { LANGUAGES } from '../shared/languages.ts'

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): Record<string, string> =>
  Object.entries(o).reduce((a, [k, v]) => (typeof v === 'string' ? { ...a, [p + k]: v } : { ...a, ...flat(v, `${p}${k}.`) }), {} as Record<string, string>)
const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

const en = flat((await import('../src/i18n/locales/en.ts')).default as unknown as Tree)
const total = Object.keys(en).length
let problems = 0
for (const file of readdirSync(new URL('../src/i18n/locales', import.meta.url)).filter((f) => f.endsWith('.ts') && f !== 'en.ts')) {
  const code = file.replace('.ts', '')
  const loc = flat((await import(`../src/i18n/locales/${file}`)).default as Tree)
  const keys = Object.keys(loc)
  const unknown = keys.filter((k) => !(k in en))
  const badVars = keys.filter((k) => k in en && vars(en[k]) !== vars(loc[k]))
  const lang = LANGUAGES.find((l) => l.code === code)
  console.log(`${code.padEnd(4)} ${String(Math.round(((keys.length - unknown.length) / total) * 100)).padStart(3)}%  (${keys.length - unknown.length}/${total})  registry status: ${lang?.status ?? 'MISSING FROM REGISTRY'}`)
  for (const k of unknown) console.log(`     unknown key: ${k}`)
  for (const k of badVars) console.log(`     placeholder mismatch: ${k}  en=${vars(en[k])}  ${code}=${vars(loc[k])}`)
  problems += unknown.length + badVars.length + (lang ? 0 : 1)
}
const noFile = LANGUAGES.filter((l) => l.code !== 'en' && l.status !== 'placeholder').filter((l) => !readdirSync(new URL('../src/i18n/locales', import.meta.url)).includes(`${l.code}.ts`))
for (const l of noFile) { console.log(`${l.code}: marked "${l.status}" but has no locale file`); problems++ }
process.exit(problems ? 1 : 0)
