// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { ComplianceKey, ConfigKey, ConfigScope } from 'prisma/generated/prisma/enums'
import type { SystemConfigWhereUniqueInput } from 'prisma/generated/prisma/models'
import { getAccounts } from './accounts'
export const order = 1

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIGS_CSV_DIR = path.join(__dirname, 'csv')

interface SystemConfigRow {
  key: ConfigKey
  value: string
  scope: ConfigScope
}

interface ComplianceRow {
  key: ComplianceKey
  value: string
}

// acts as the interface
export const DEFAULT_CONFIGS_DATA = {
  configurations: [
    { key: ConfigKey.LOCALE, value: 'en-PH', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.CURRENCY, value: 'PHP', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.IS_VAT_REGISTERED, value: 'true', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.VAT_RATE, value: '12', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.PRICE_CONFIGURATION, value: 'INCLUSIVE', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.BUFFER_RATE, value: '20', scope: ConfigScope.BRANCH },
    { key: ConfigKey.LOW_STOCK_THRESHOLD, value: '20', scope: ConfigScope.BRANCH },
    { key: ConfigKey.ENABLE_PRINT_RECEIPT, value: 'true', scope: ConfigScope.BRANCH },
    { key: ConfigKey.ENABLE_ORDER_TAB, value: 'true', scope: ConfigScope.BRANCH },
    { key: ConfigKey.ENABLE_ORDER, value: 'false', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.ENABLE_CASH_RECONCILIATION, value: 'false', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.ENABLE_TASK, value: 'false', scope: ConfigScope.BUSINESS },
    { key: ConfigKey.AUTO_APPROVE_LOW_STOCK_REFILL, value: 'true', scope: ConfigScope.BUSINESS },
  ] as SystemConfigRow[],
  complianceRecords: [
    { key: ComplianceKey.BIR_TIN, value: '000-123-456-000' },
    { key: ComplianceKey.BIR_PTU_NUMBER, value: 'PTU-2026-001' },
    { key: ComplianceKey.BIR_PTU_ISSUED_AT, value: '05/20/2026' },
  ] as ComplianceRow[],
}

function parseConfigsCsv<T>(fileName: string, requiredHeaders: string[]): T[] | null {
  const targetPath = path.join(CONFIGS_CSV_DIR, fileName)

  if (!fs.existsSync(targetPath)) return null

  const fileContent = fs.readFileSync(targetPath, 'utf-8')
  const { data, meta } = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  })

  const missingHeaders = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`❌ Configuration parsing error in ${fileName}. Missing required columns: [${missingHeaders.join(', ')}]`)
  }

  return data as T[]
}

export async function configs(prisma: PrismaClient, options: { folder: string }) {
  const accounts = getAccounts(options.folder)

  // --- RESOLVE SYSTEM CONFIGURATIONS ---
  let runtimeConfigs = DEFAULT_CONFIGS_DATA.configurations
  const configsCsv = parseConfigsCsv<any>(`${options.folder}/system_configs.csv`, ['key', 'value', 'scope'])

  if (configsCsv) {
    console.info('📈 Hydrating system configs from system_configs.csv...')
    runtimeConfigs = configsCsv.map(row => ({
      key: String(row.key).trim() as ConfigKey,
      value: String(row.value).trim(),
      scope: (String(row.scope).trim() as ConfigScope) || ConfigScope.BUSINESS,
    }))
  }

  // --- RESOLVE COMPLIANCE DATA REGISTRIES ---
  let runtimeCompliance = DEFAULT_CONFIGS_DATA.complianceRecords
  const complianceCsv = parseConfigsCsv<any>(`${options.folder}/compliance_registry.csv`, ['key', 'value'])

  if (complianceCsv) {
    console.info('📈 Hydrating compliance registry metrics from compliance_registry.csv...')
    runtimeCompliance = complianceCsv.map(row => ({
      key: String(row.key).trim() as ComplianceKey,
      value: String(row.value).trim(),
    }))
  }

  // =======================================================
  // EXECUTION LAYER: SYSTEM CONFIGURATIONS
  // =======================================================
  console.info('⚙️ Syncing system localization and settings configurations...')
  for (const config of runtimeConfigs) {
    const isBusiness = config.scope === ConfigScope.BUSINESS

    // 💡 Directly use the scope value to cleanly determine the unique selector map
    const whereUnique: SystemConfigWhereUniqueInput = isBusiness
      ? {
          key_businessId_scope: {
            key: config.key,
            businessId: accounts.business.id,
            scope: ConfigScope.BUSINESS,
          },
        }
      : {
          key_branchId_scope: {
            key: config.key,
            branchId: accounts.branch.id,
            scope: ConfigScope.BRANCH,
          },
        }

    await prisma.systemConfig.upsert({
      where: whereUnique,
      update: { value: config.value },
      create: {
        key: config.key,
        value: config.value,
        scope: config.scope,
        businessId: isBusiness ? accounts.business.id : null,
        branchId: isBusiness ? null : accounts.branch.id,
      },
    })
  }

  // =======================================================
  // EXECUTION LAYER: COMPLIANCE REGISTRIES
  // =======================================================
  console.info('⚖️ Syncing legal compliance registry details...')
  for (const record of runtimeCompliance) {
    await prisma.complianceRegistry.upsert({
      where: {
        key_businessId: {
          key: record.key,
          businessId: accounts.business.id,
        },
      },
      update: { value: record.value },
      create: {
        key: record.key,
        value: record.value,
        businessId: accounts.business.id,
        branchId: accounts.branch.id,
      },
    })
  }

  console.info('✅ System configurations and country compliance targets successfully synced.')
}
