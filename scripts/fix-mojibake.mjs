#!/usr/bin/env node
/**
 * fix-mojibake.mjs
 * Fixes double-encoded UTF-8 (mojibake) characters in all source files.
 * Run from monorepo root: node scripts/fix-mojibake.mjs
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

// Build replacement pairs from exact byte sequences found in the files.
// Each entry: [mojibakeString, correctChar]
// Longer sequences first to avoid partial replacements.
const REPLACEMENTS = [
  // ─ box drawing U+2500: C3 A2 E2 80 9D E2 82 AC
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x80, 0x9d, 0xe2, 0x82, 0xac]).toString('utf8'), '\u2500'],
  // ⚠️ warning: C3 A2 C5 A1 C2 A0 C3 AF C2 B8 C2 8F
  [Buffer.from([0xc3, 0xa2, 0xc5, 0xa1, 0xc2, 0xa0, 0xc3, 0xaf, 0xc2, 0xb8, 0xc2, 0x8f]).toString('utf8'), '\u26A0\uFE0F'],
  // ✅ green check U+2705: C3 A2 C5 93 E2 80 A6
  [Buffer.from([0xc3, 0xa2, 0xc5, 0x93, 0xe2, 0x80, 0xa6]).toString('utf8'), '\u2705'],
  // ✓ check mark U+2713: C3 A2 C5 93 E2 80 9D
  [Buffer.from([0xc3, 0xa2, 0xc5, 0x93, 0xe2, 0x80, 0x9d]).toString('utf8'), '\u2713'],
  // — em dash U+2014: C3 A2 E2 82 AC E2 80 9D
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xe2, 0x80, 0x9d]).toString('utf8'), '\u2014'],
  // — em dash variant: C3 A2 E2 80 9C E2 80 9D
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x80, 0x9c, 0xe2, 0x80, 0x9d]).toString('utf8'), '\u2014'],
  // – en dash U+2013: C3 A2 E2 82 AC E2 80 9C
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xe2, 0x80, 0x9c]).toString('utf8'), '\u2013'],
  // ' right single quote U+2019: C3 A2 E2 82 AC E2 84 A2
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xe2, 0x84, 0xa2]).toString('utf8'), '\u2019'],
  // ' left single quote U+2018: C3 A2 E2 82 AC CB 9C
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xcb, 0x9c]).toString('utf8'), '\u2018'],
  // " left double quote U+201C: C3 A2 E2 82 AC C5 93
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xc5, 0x93]).toString('utf8'), '\u201C'],
  // • bullet U+2022: C3 A2 E2 82 AC C2 A2
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xc2, 0xa2]).toString('utf8'), '\u2022'],
  // … ellipsis U+2026: C3 A2 E2 82 AC C2 A6
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac, 0xc2, 0xa6]).toString('utf8'), '\u2026'],
  // → right arrow U+2192: C3 A2 E2 86 92
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x86, 0x92]).toString('utf8'), '\u2192'],
  // ↓ down arrow U+2193: C3 A2 E2 86 93
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x86, 0x93]).toString('utf8'), '\u2193'],
  // ← left arrow U+2190: C3 A2 E2 86 90
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x86, 0x90]).toString('utf8'), '\u2190'],
  // ↑ up arrow U+2191: C3 A2 E2 86 91
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x86, 0x91]).toString('utf8'), '\u2191'],
  // │ box U+2502: C3 A2 E2 94 82
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x94, 0x82]).toString('utf8'), '\u2502'],
  // ┌ box U+250C: C3 A2 E2 94 8C
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x94, 0x8c]).toString('utf8'), '\u250C'],
  // └ box U+2514: C3 A2 E2 94 94
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x94, 0x94]).toString('utf8'), '\u2514'],
  // ≥: C3 A2 E2 89 A5
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x89, 0xa5]).toString('utf8'), '\u2265'],
  // ≤: C3 A2 E2 89 A4
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x89, 0xa4]).toString('utf8'), '\u2264'],
  // ≠: C3 A2 E2 89 A0
  [Buffer.from([0xc3, 0xa2, 0xe2, 0x89, 0xa0]).toString('utf8'), '\u2260'],
  // · middle dot: C3 82 C2 B7
  [Buffer.from([0xc3, 0x82, 0xc2, 0xb7]).toString('utf8'), '\u00B7'],
  // © copyright: C3 82 C2 A9
  [Buffer.from([0xc3, 0x82, 0xc2, 0xa9]).toString('utf8'), '\u00A9'],
  // ® registered: C3 82 C2 AE
  [Buffer.from([0xc3, 0x82, 0xc2, 0xae]).toString('utf8'), '\u00AE'],
  // NBSP: C3 82 C2 A0
  [Buffer.from([0xc3, 0x82, 0xc2, 0xa0]).toString('utf8'), '\u00A0'],
  // 🔍 magnifying glass: C3 B0 C5 B8 E2 80 9D C2 8D
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9d, 0xc2, 0x8d]).toString('utf8'), '\uD83D\uDD0D'],
  // 📦 package: C3 B0 C5 B8 E2 80 9C C2 A6
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9c, 0xc2, 0xa6]).toString('utf8'), '\uD83D\uDCE6'],
  // 📊 chart: C3 B0 C5 B8 E2 80 9C C5 A0
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9c, 0xc5, 0xa0]).toString('utf8'), '\uD83D\uDCCA'],
  // 🚀 rocket: C3 B0 C5 B8 C5 A1 C2 80
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc5, 0xa1, 0xc2, 0x80]).toString('utf8'), '\uD83D\uDE80'],
  // 📋 clipboard: C3 B0 C5 B8 E2 80 98
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x98]).toString('utf8'), '\uD83D\uDCCB'],
  // 🔐 lock: C3 B0 C5 B8 E2 80 9D C2 90
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9d, 0xc2, 0x90]).toString('utf8'), '\uD83D\uDD10'],
  // 🔧 wrench: C3 B0 C5 B8 E2 80 9D C2 A7
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9d, 0xc2, 0xa7]).toString('utf8'), '\uD83D\uDD27'],
  // 🛑 stop: C3 B0 C5 B8 C5 A1 C2 91
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc5, 0xa1, 0xc2, 0x91]).toString('utf8'), '\uD83D\uDED1'],
  // 🔄 cycle: C3 B0 C5 B8 E2 80 9D C2 84
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9d, 0xc2, 0x84]).toString('utf8'), '\uD83D\uDD04'],
  // 🌍 earth: C3 B0 C5 B8 C5 92 C2 8D
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc5, 0x92, 0xc2, 0x8d]).toString('utf8'), '\uD83C\uDF0D'],
  // 🗄 cabinet: C3 B0 C5 B8 C5 97 C2 84
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc5, 0x97, 0xc2, 0x84]).toString('utf8'), '\uD83D\uDDD4'],
  // 📄 page: C3 B0 C5 B8 E2 80 9C C2 84
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9c, 0xc2, 0x84]).toString('utf8'), '\uD83D\uDCC4'],
  // 📈 chart up: C3 B0 C5 B8 E2 80 9C C2 88
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9c, 0xc2, 0x88]).toString('utf8'), '\uD83D\uDCC8'],
  // 📉 chart down: C3 B0 C5 B8 E2 80 9C C2 89
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xe2, 0x80, 0x9c, 0xc2, 0x89]).toString('utf8'), '\uD83D\uDCC9'],
  // 🛒 cart: C3 B0 C5 B8 C5 A1 C2 92
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc5, 0xa1, 0xc2, 0x92]).toString('utf8'), '\uD83D\uDED2'],
  // 👥 people: C3 B0 C5 B8 C2 91 C2 A5
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x91, 0xc2, 0xa5]).toString('utf8'), '\uD83D\uDC65'],
  // 👤 person: C3 B0 C5 B8 C2 91 C2 A4
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x91, 0xc2, 0xa4]).toString('utf8'), '\uD83D\uDC64'],
  // 💰 money: C3 B0 C5 B8 C2 92 C2 B0
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x92, 0xc2, 0xb0]).toString('utf8'), '\uD83D\uDCB0'],
  // 💳 card: C3 B0 C5 B8 C2 92 C2 B3
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x92, 0xc2, 0xb3]).toString('utf8'), '\uD83D\uDCB3'],
  // 🏢 building: C3 B0 C5 B8 C2 A2 C2 BB
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0xa2, 0xc2, 0xbb]).toString('utf8'), '\uD83C\uDFE2'],
  // 🎯 target: C3 B0 C5 B8 C2 8F C2 AF
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x8f, 0xc2, 0xaf]).toString('utf8'), '\uD83C\uDFAF'],
  // 🧾 receipt: C3 B0 C5 B8 C2 9B
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x9b]).toString('utf8'), '\uD83E\uDDFE'],
  // 💡 bulb: C3 B0 C5 B8 C2 92 C2 A1
  [Buffer.from([0xc3, 0xb0, 0xc5, 0xb8, 0xc2, 0x92, 0xc2, 0xa1]).toString('utf8'), '\uD83D\uDCA1'],
]

const EXTENSIONS = new Set(['.ts', '.tsx', '.md', '.sh', '.js', '.jsx'])
const EXCLUDE = ['node_modules', '.git', '.output', 'generated', '.turbo', 'playwright-report', 'e2e-results', '.fallow']

function shouldExclude(filePath) {
  return EXCLUDE.some(ex => filePath.includes(ex))
}

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (shouldExclude(full)) continue
    try {
      const stat = statSync(full)
      if (stat.isDirectory()) walkDir(full, files)
      else if (EXTENSIONS.has(extname(full))) files.push(full)
    } catch {}
  }
  return files
}

const root = process.cwd()
const allFiles = walkDir(root)

let fixedFiles = 0
for (const filePath of allFiles) {
  try {
    const buf = readFileSync(filePath)
    let text = buf.toString('utf8')
    const original = text

    for (const [mojibake, correct] of REPLACEMENTS) {
      if (text.includes(mojibake)) {
        text = text.split(mojibake).join(correct)
      }
    }

    if (text !== original) {
      writeFileSync(filePath, text, 'utf8')
      fixedFiles++
      console.log(`Fixed: ${filePath.replace(root, '.')}`)
    }
  } catch {
    // skip binary or unreadable files
  }
}

console.log(`\nDone. Fixed ${fixedFiles} files.`)
