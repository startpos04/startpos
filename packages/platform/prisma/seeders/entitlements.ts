/**
 * entitlements.ts — Entitlement Engine seed
 *
 * Reads all platform-global data from csv/system/:
 *   features.csv              — Feature registry
 *   plans.csv                 — SubscriptionPlan tiers
 *   plan-entitlements.csv     — PlanEntitlement join records
 *   pricing-catalog.csv       — PricingCatalog v1 with FeaturePrice records
 *
 * All upserts are keyed on stable natural keys so the seed is fully
 * idempotent — safe to re-run at any time.
 *
 * order = 0: runs before all tenant-specific seeders.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder tx type */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { OPERATIONAL_CAPABILITIES } from '@platform/lib/entitlement/capability-keys'

export const order = 0

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SYSTEM_CSV_DIR = path.join(__dirname, 'csv', 'system')

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseSystemCsv<T>(fileName: string, requiredHeaders: string[]): T[] {
  const filePath = path.join(SYSTEM_CSV_DIR, fileName)

  if (!fs.existsSync(filePath)) {
    throw new Error(`âŒ Ingestion aborted. Required system file is missing: "csv/system/${fileName}"`)
  }

  const { data, meta } = Papa.parse(fs.readFileSync(filePath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  })

  const missing = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missing.length > 0) {
    throw new Error(`âŒ csv/system/${fileName} missing required columns: [${missing.join(', ')}]`)
  }

  return data as T[]
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function Entitlements(prisma: PrismaClient) {
  // ── Step 1: Features ──────────────────────────────────────────────────────
  console.info('🔐 Seeding Feature registry from csv/system/features.csv...')

  const featureRows = parseSystemCsv<any>('features.csv', ['key', 'label', 'description', 'isSelectableByCustomer', 'sortOrder'])

  for (const row of featureRows) {
    const key = String(row.key).trim()
    await prisma.feature.upsert({
      where: { key },
      update: {
        label: String(row.label).trim(),
        description: String(row.description).trim(),
        isOperational: OPERATIONAL_CAPABILITIES.has(key as any),
        isSelectableByCustomer: String(row.isSelectableByCustomer).trim().toLowerCase() === 'true',
        pricingCategory: row.pricingCategory?.trim() || null,
        sortOrder: parseInt(row.sortOrder, 10) || 0,
      },
      create: {
        key,
        label: String(row.label).trim(),
        description: String(row.description).trim(),
        isOperational: OPERATIONAL_CAPABILITIES.has(key as any),
        isSelectableByCustomer: String(row.isSelectableByCustomer).trim().toLowerCase() === 'true',
        pricingCategory: row.pricingCategory?.trim() || null,
        sortOrder: parseInt(row.sortOrder, 10) || 0,
      },
    })
  }

  console.info(`   ✓  ${featureRows.length} features upserted.`)

  // ── Step 2: Plans + Entitlements ──────────────────────────────────────────
  console.info('📦 Seeding SubscriptionPlan tiers from csv/system/plans.csv...')

  const planRows = parseSystemCsv<any>('plans.csv', ['name', 'monthlyPrice', 'includedTxPerMonth', 'overagePerTx', 'sortOrder'])
  const entitlementRows = parseSystemCsv<any>('plan-entitlements.csv', ['planName', 'featureKey'])

  for (const row of planRows) {
    const upsertedPlan = await prisma.subscriptionPlan.upsert({
      where: { name: String(row.name).trim() },
      update: {
        description: String(row.description).trim(),
        sortOrder: parseInt(row.sortOrder, 10) || 0,
        monthlyPrice: parseInt(row.monthlyPrice, 10) || 0,
        includedTxPerMonth: parseInt(row.includedTxPerMonth, 10) || 0,
        overagePerTx: parseInt(row.overagePerTx, 10) || 0,
        isActive: true,
      },
      create: {
        name: String(row.name).trim(),
        description: String(row.description).trim(),
        sortOrder: parseInt(row.sortOrder, 10) || 0,
        monthlyPrice: parseInt(row.monthlyPrice, 10) || 0,
        includedTxPerMonth: parseInt(row.includedTxPerMonth, 10) || 0,
        overagePerTx: parseInt(row.overagePerTx, 10) || 0,
        isActive: true,
      },
    })

    const planEntitlements = entitlementRows.filter(e => String(e.planName).trim() === upsertedPlan.name)

    for (const e of planEntitlements) {
      const featureKey = String(e.featureKey).trim()
      const rawLimit = String(e.usageLimit ?? '').trim()
      const usageLimit = rawLimit !== '' ? parseInt(rawLimit, 10) : null

      await prisma.planEntitlement.upsert({
        where: { planId_featureKey: { planId: upsertedPlan.id, featureKey } },
        update: { usageLimit },
        create: { planId: upsertedPlan.id, featureKey, usageLimit },
      })
    }

    console.info(`   ✓  Plan "${upsertedPlan.name}" — ${planEntitlements.length} entitlements upserted.`)
  }

  // ── Step 3: PricingCatalog ────────────────────────────────────────────────
  console.info('📊 Seeding PricingCatalog from csv/system/pricing-catalog.csv...')

  const catalogRows = parseSystemCsv<any>('pricing-catalog.csv', ['version', 'label', 'status', 'featureKey', 'monthlyPrice', 'isIncludedInBase'])

  // Group rows by catalog version — each version = one catalog record
  const catalogsByVersion = new Map<number, { label: string; status: string; rows: any[] }>()
  for (const row of catalogRows) {
    const version = parseInt(row.version, 10)
    if (!catalogsByVersion.has(version)) {
      catalogsByVersion.set(version, {
        label: String(row.label).trim(),
        status: String(row.status).trim(),
        rows: [],
      })
    }
    catalogsByVersion.get(version)!.rows.push(row)
  }

  for (const [version, catalog] of catalogsByVersion) {
    const existing = await (prisma as any).pricingCatalog.findFirst({ where: { version } })

    if (!existing) {
      const created = await (prisma as any).pricingCatalog.create({
        data: {
          version,
          label: catalog.label,
          status: catalog.status,
          activatedAt: new Date(),
        },
      })

      for (const row of catalog.rows) {
        await (prisma as any).featurePrice.create({
          data: {
            catalogId: created.id,
            featureKey: String(row.featureKey).trim(),
            monthlyPrice: parseInt(row.monthlyPrice, 10) || 0,
            annualPrice: null,
            isIncludedInBase: String(row.isIncludedInBase).trim().toLowerCase() === 'true',
          },
        })
      }

      console.info(`   ✓  PricingCatalog v${version} created (${catalog.rows.length} feature prices).`)
    } else {
      console.info(`   –  PricingCatalog v${version} already exists, skipped.`)
    }
  }

  console.info('✅ Entitlement seed complete.')
}

export default Entitlements
