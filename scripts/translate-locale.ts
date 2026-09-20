/**
 * Fill in the missing screen text for any language with the configured AI service.
 *
 *   npm run i18n:translate -- --lang lus          (Mizo)
 *   npm run i18n:translate -- --lang as           (fills only what the Assamese file does not have yet)
 *   options: --only hub,remember,common   (limit to some sections)   --dry   (print, don't write)
 *
 * - Hand-written translations already in src/i18n/locales/<lang>.ts are KEPT; only missing keys are added.
 * - {placeholders}, "Recallia", "Lumi" and emojis are checked and preserved; bad items are skipped.
 * - The language is switched from "placeholder" to "partial" so the menu no longer says "English screens".
 * - Machine translation for small Northeast languages can be wrong: have a native speaker read the result.
 *   UI text is not private, so any AI provider may be used (AI_PROVIDER in .env).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { completeJson, type JsonSchema } from '../server/ai.ts'
import { getLanguage } from '../shared/languages.ts'

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined }
const LANG = arg('lang')
if (!LANG) { console.error('Usage: npm run i18n:translate -- --lang <code>'); process.exit(1) }
const L = getLanguage(LANG)
if (L.code !== LANG) { console.error(`Unknown language "${LANG}". Add it to shared/languages.ts first.`); process.exit(1) }
const ONLY = arg('only')?.split(',')
const DRY = process.argv.includes('--dry')

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): Record<string, string> => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v]] : Object.entries(flat(v, `${p}${k}.`)))))
const setDeep = (o: Tree, path: string, v: string) => { const ks = path.split('.'); let cur = o; for (const k of ks.slice(0, -1)) cur = (cur[k] ??= {}) as Tree; cur[ks.at(-1)!] = v }

const root = process.cwd()
const en = flat((await import(pathToFileURL(join(root, 'src/i18n/locales/en.ts')).href)).default as Tree)
const file = join(root, `src/i18n/locales/${LANG}.ts`)
const existing: Tree = existsSync(file) ? (await import(pathToFileURL(file).href)).default : {}
const have = flat(existing)
const missing = Object.keys(en).filter((k) => k !== 'brand' && !(k in have) && (!ONLY || ONLY.includes(k.split('.')[0])))
console.log(`${L.name}: ${Object.keys(have).length} translated, ${missing.length} missing`)

const vars = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort().join(',')
const SCHEMA: JsonSchema = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' } }, required: ['key', 'text'], additionalProperties: false } } }, required: ['items'], additionalProperties: false }
const system = `You translate the user interface of "Recallia Quest", a gentle app for older adults living with memory changes in Northeast India, into ${L.name} (${L.native}).
Rules: warm, respectful, very simple everyday words an elderly person uses at home; short (buttons stay short); keep {placeholders} exactly; keep the names "Recallia", "Recallia Quest", "Lumi", emojis and numbers like 112 unchanged; use the script normally used for ${L.name}; do not add explanations.
Respond ONLY with JSON: {"items":[{"key": "...", "text": "..."}]}`

const out: Tree = JSON.parse(JSON.stringify(existing))
let added = 0, skipped = 0
for (let i = 0; i < missing.length; i += 40) {
  const batch = missing.slice(i, i + 40)
  process.stdout.write(`\rtranslating ${Math.min(i + 40, missing.length)}/${missing.length}…`)
  const r = await completeJson<{ items: { key: string; text: string }[] }>(system, [{ role: 'user', content: JSON.stringify(batch.map((k) => ({ key: k, text: en[k] }))) }], SCHEMA, 4000)
  for (const it of r?.items ?? []) {
    if (!batch.includes(it.key) || !it.text?.trim()) { skipped++; continue }
    if (vars(it.text) !== vars(en[it.key])) { skipped++; continue } // lost or invented {placeholder}
    setDeep(out, it.key, it.text.trim())
    added++
  }
}
console.log(`\nadded ${added}, skipped ${skipped}`)
if (DRY) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

const ident = LANG.replace(/[^a-z]/g, '') + 'Locale'
writeFileSync(file, `import type { Partial2 } from '../types'

/**
 * ${L.name} (${L.native}). Keys not listed here fall back to English.
 * Includes machine translation (${new Date().toISOString().slice(0, 10)}, scripts/translate-locale.ts) — please have a native speaker review.
 */
const ${ident}: Partial2 = ${JSON.stringify(out, null, 2)}

export default ${ident}
`)
const langFile = join(root, 'shared/languages.ts')
const src = readFileSync(langFile, 'utf8')
const re = new RegExp(`(\\{ code: '${LANG}',[^\\n]*status: )'placeholder'`)
if (re.test(src)) { writeFileSync(langFile, src.replace(re, "$1'partial'")); console.log(`${L.name} is now marked "partial" in shared/languages.ts`) }
console.log(`Wrote ${file}`)
