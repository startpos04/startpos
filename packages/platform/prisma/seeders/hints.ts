/**
 * hints.ts — Hint system seed
 *
 * Reads from csv/system/hints.csv — platform-global, same for every
 * deployment. The target folder param is intentionally ignored here.
 *
 * All upserts are keyed on (title, page) — fully idempotent, safe to
 * re-run at any time.
 *
 * CSV columns: title, body, page, sortOrder
 *   - page: leave empty for global hints (no page filter)
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder tx type */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'

export const order = 10

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_CSV_DIR = path.join(__dirname, 'csv', 'system')

interface HintRow {
  title: string
  body: string
  page: string | null
  sortOrder: number
}

function parseHintsCsv(): HintRow[] {
  const filePath = path.join(SYSTEM_CSV_DIR, 'hints.csv')

  if (!fs.existsSync(filePath)) {
    throw new Error('❌ Ingestion aborted. Required system file is missing: "csv/system/hints.csv"')
  }

  const { data, meta } = Papa.parse(fs.readFileSync(filePath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  })

  const required = ['title', 'body', 'sortOrder']
  const missing = required.filter(h => !meta.fields?.includes(h))
  if (missing.length > 0) {
    throw new Error(`❌ csv/system/hints.csv missing required columns: [${missing.join(', ')}]`)
  }

  return (data as any[]).map(row => ({
    title: String(row.title).trim(),
    body: String(row.body).trim(),
    page: row.page?.trim() || null,
    sortOrder: parseInt(row.sortOrder, 10) || 0,
  }))
}

// folder param accepted for pipeline compatibility but not used —
// hints always come from csv/system/
export async function Hints(prisma: PrismaClient, _options?: { folder: string }) {
  const hints = parseHintsCsv()

  console.info(`💡 Seeding ${hints.length} hints from csv/system/hints.csv...`)

  for (const hint of hints) {
    const existing = await (prisma as any).hint.findFirst({
      where: { title: hint.title, page: hint.page ?? null },
    })

    if (!existing) {
      await (prisma as any).hint.create({
        data: {
          title: hint.title,
          body: hint.body,
          page: hint.page,
          isActive: true,
          sortOrder: hint.sortOrder,
        },
      })
      console.info(`   ✔  Hint "${hint.title}" seeded.`)
    } else {
      console.info(`   –  Hint "${hint.title}" already exists, skipped.`)
    }
  }

  console.info(`✅ Hint seed complete (${hints.length} hints processed).`)
}

export default Hints
