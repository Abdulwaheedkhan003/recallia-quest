/**
 * Tiny dependency-free PDF writer (A4, built-in Helvetica fonts, text + boxes + lines).
 * Enough for clean, printable reports without adding a native/npm dependency.
 * Text uses WinAnsi (Latin-1); characters outside it are shown as "?".
 */

const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]
const HELV_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]

export type RGB = [number, number, number]
const W = 595.28
const H = 841.89

/** Map text to WinAnsi bytes. */
function ansi(s: string): number[] {
  const out: number[] = []
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!
    if (c === 0x2019 || c === 0x2018) out.push(39)
    else if (c === 0x201c || c === 0x201d) out.push(34)
    else if (c === 0x2013 || c === 0x2014) out.push(45)
    else if (c === 0x2022) out.push(149)
    else if (c === 0x2026) out.push(46, 46, 46)
    else if (c === 0x2192) out.push(45, 62)
    else if (c === 10 || c === 9) out.push(32)
    else if (c >= 32 && c <= 126) out.push(c)
    else if (c >= 160 && c <= 255) out.push(c)
    else if (c >= 0x1f000 || (c >= 0x2600 && c <= 0x27bf) || c === 0xfe0f) continue // emoji: skip
    else out.push(63)
  }
  return out
}
const esc = (bytes: number[]) => bytes.map((b) => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : b > 126 || b < 32 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b))).join('')

export function textWidth(s: string, size: number, bold = false) {
  const t = bold ? HELV_B : HELV
  return ansi(s).reduce((w, b) => w + (b >= 32 && b <= 126 ? t[b - 32] : 556), 0) * size / 1000
}

export class Pdf {
  private pages: string[] = []
  private cur = ''
  readonly width = W
  readonly height = H

  constructor() { this.addPage() }
  addPage() { if (this.cur) this.pages.push(this.cur); this.cur = '' ; return this }
  private op(s: string) { this.cur += s + '\n' }
  private col(c: RGB, stroke = false) { return `${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)} ${stroke ? 'RG' : 'rg'}` }

  /** y is measured from the TOP of the page (baseline of the text). */
  text(x: number, y: number, s: string, o: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {}) {
    const size = o.size ?? 11
    let xx = x
    if (o.align === 'right') xx = x - textWidth(s, size, o.bold)
    if (o.align === 'center') xx = x - textWidth(s, size, o.bold) / 2
    this.op(`BT ${this.col(o.color ?? [43, 33, 64])} /${o.bold ? 'F2' : 'F1'} ${size} Tf ${xx.toFixed(2)} ${(H - y).toFixed(2)} Td (${esc(ansi(s))}) Tj ET`)
  }
  rect(x: number, y: number, w: number, h: number, fill: RGB, stroke?: RGB) {
    this.op(`${this.col(fill)} ${stroke ? this.col(stroke, true) + ' 0.8 w' : ''} ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${stroke ? 'B' : 'f'}`)
  }
  line(x1: number, y1: number, x2: number, y2: number, color: RGB = [200, 196, 210], width = 0.8) {
    this.op(`${this.col(color, true)} ${width} w ${x1.toFixed(2)} ${(H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(H - y2).toFixed(2)} l S`)
  }
  wrap(s: string, maxWidth: number, size: number, bold = false): string[] {
    const lines: string[] = []
    for (const para of s.split(/\n/)) {
      let line = ''
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word
        if (textWidth(test, size, bold) <= maxWidth) line = test
        else { if (line) lines.push(line); line = word }
      }
      lines.push(line)
    }
    return lines
  }

  toBuffer(): Buffer {
    if (this.cur) { this.pages.push(this.cur); this.cur = '' }
    const objs: string[] = []
    const add = (s: string) => { objs.push(s); return objs.length }
    const catalog = add('') // placeholder 1
    const pagesId = add('') // placeholder 2
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    const kids: number[] = []
    for (const content of this.pages) {
      const stream = Buffer.from(content, 'latin1')
      const c = add(`<< /Length ${stream.length} >>\nstream\n${content}\nendstream`)
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`))
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
    const offsets: number[] = []
    objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = Buffer.byteLength(out, 'latin1')
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info << /Producer (Recallia Quest) >> >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(out, 'latin1')
  }
}
