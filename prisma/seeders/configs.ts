// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { type ConfigurationKey, ConfigurationScope } from 'prisma/generated/prisma/enums'
import type { ConfigurationWhereUniqueInput } from 'prisma/generated/prisma/models'
import { getAccounts } from './accounts'
import { seedConfigurationDefinitions } from './seed-configuration-definitions'
export const order = 1

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIGS_CSV_DIR = path.join(__dirname, 'csv')

interface BusinessConfigRow {
  key: ConfigurationKey
  value: string
  scope: ConfigurationScope
}

// Compliance row structure - keys are string literals, not enum
// New architecture: compliance data goes to country-specific tables
interface ComplianceRow {
  key: string
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
  // Seed ConfigurationDefinition table first (required for foreign key constraints)
  await seedConfigurationDefinitions(prisma)
  
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
    key: String(row.key).trim(),
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
  // EXECUTION LAYER: COMPLIANCE TABLES (PH-specific)
  // =======================================================
  console.info('⚖️ Syncing Philippines compliance details...')
  
  // Transform ComplianceRegistry CSV data to new table structure
  const phComplianceData: Record<string, string> = {}
  for (const record of runtimeCompliance) {
    phComplianceData[record.key] = record.value
  }
  
  // Upsert PhilippinesCompliance (business-level)
  await prisma.philippinesCompliance.upsert({
    where: { businessId: accounts.business.id },
    update: {
      birTin: phComplianceData.BIR_TIN || '',
      birPtuNumber: phComplianceData.BIR_PTU_NUMBER || null,
      birPtuIssuedAt: phComplianceData.BIR_PTU_ISSUED_AT 
        ? new Date(phComplianceData.BIR_PTU_ISSUED_AT) 
        : null,
      birRdoCode: phComplianceData.BIR_RDO_CODE || null,
    },
    create: {
      businessId: accounts.business.id,
      birTin: phComplianceData.BIR_TIN || '000-000-000-000',
      birPtuNumber: phComplianceData.BIR_PTU_NUMBER || null,
      birPtuIssuedAt: phComplianceData.BIR_PTU_ISSUED_AT 
        ? new Date(phComplianceData.BIR_PTU_ISSUED_AT) 
        : null,
      birRdoCode: phComplianceData.BIR_RDO_CODE || null,
    },
  })
  
  // Upsert PhilippinesBranchCompliance (branch-level)
  await prisma.philippinesBranchCompliance.upsert({
    where: { branchId: accounts.branch.id },
    update: {
      branchSerialNumber: accounts.branch.serialNumber || 'SN000000000',
      branchCode: accounts.branch.branchCode || '00001',
      ptuNumber: phComplianceData.BRANCH_PTU_NUMBER || null,
      rdoCode: phComplianceData.BRANCH_RDO_CODE || null,
    },
    create: {
      branchId: accounts.branch.id,
      branchSerialNumber: accounts.branch.serialNumber || 'SN000000000',
      branchCode: accounts.branch.branchCode || '00001',
      ptuNumber: phComplianceData.BRANCH_PTU_NUMBER || null,
      rdoCode: phComplianceData.BRANCH_RDO_CODE || null,
    },
  })

  console.info('✅ System configurations and Philippines compliance data successfully synced.')
}
