// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { type ComplianceKey, type ConfigurationKey, ConfigurationScope } from 'prisma/generated/prisma/enums'
import type { ConfigurationWhereUniqueInput } from 'prisma/generated/prisma/models'
import { getAccounts } from './accounts'
export const order = 1

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIGS_CSV_DIR = path.join(__dirname, 'csv')

interface BusinessConfigRow {
  key: ConfigurationKey
  value: string
  scope: ConfigurationScope
}

interface ComplianceRow {
  key: ComplianceKey
  value: string
}

function parseConfigsCsvRequired<T>(folder: string, fileName: string, requiredHeaders: string[]): T[] {
  const targetPath = path.join(CONFIGS_CSV_DIR, folder, fileName)

  if (!fs.existsSync(targetPath)) {
    throw new Error(`❌ Ingestion aborted. Required config file is missing: "csv/${folder}/${fileName}"`)
  }

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

  // --- RESOLVE BUSINESS CONFIGURATIONS ---
  const configsCsv = parseConfigsCsvRequired<any>(options.folder, 'system-configs.csv', ['key', 'value', 'scope'])
  console.info(`📈 Hydrating business configs from csv/${options.folder}/system-configs.csv...`)
  const runtimeConfigs: BusinessConfigRow[] = configsCsv.map(row => ({
    key: String(row.key).trim() as ConfigurationKey,
    value: String(row.value).trim(),
    scope: (String(row.scope).trim() as ConfigurationScope) || ConfigurationScope.BUSINESS,
  }))

  // --- RESOLVE COMPLIANCE DATA REGISTRIES ---
  const complianceCsv = parseConfigsCsvRequired<any>(options.folder, 'compliance_registry.csv', ['key', 'value'])
  console.info(`📈 Hydrating compliance registry from csv/${options.folder}/compliance_registry.csv...`)
  const runtimeCompliance: ComplianceRow[] = complianceCsv.map(row => ({
    key: String(row.key).trim() as ComplianceKey,
    value: String(row.value).trim(),
  }))

  // =======================================================
  // EXECUTION LAYER: BUSINESS CONFIGURATIONS
  // =======================================================
  console.info('⚙️ Syncing business configurations...')
  for (const config of runtimeConfigs) {
    const isBusiness = config.scope === ConfigurationScope.BUSINESS

    const whereUnique: ConfigurationWhereUniqueInput = isBusiness
      ? {
          key_businessId_scope: {
            key: config.key,
            businessId: accounts.business.id,
            scope: ConfigurationScope.BUSINESS,
          },
        }
      : {
          key_branchId_scope: {
            key: config.key,
            branchId: accounts.branch.id,
            scope: ConfigurationScope.BRANCH,
          },
        }

    await prisma.configuration.upsert({
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
