// fallow-ignore-file unused-file
/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { UnitType } from 'prisma/generated/prisma/client'
import { getAccounts } from './accounts'
export const order = 2

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_CSV_DIR = path.join(__dirname, 'csv')

// 💡 Strictly enforce file existence; throw error if missing
function parseSettingsCsvRequired<T>(folder: string, fileName: string, requiredHeaders: string[]): T[] {
  const targetPath = path.join(SETTINGS_CSV_DIR, folder, fileName)

  if (!fs.existsSync(targetPath)) {
    throw new Error(`❌ Ingestion aborted. Required settings file is missing: "csv/${folder}/${fileName}"`)
  }

  const fileContent = fs.readFileSync(targetPath, 'utf-8')
  const { data, meta } = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  })

  const missingHeaders = requiredHeaders.filter(h => !meta.fields?.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`❌ Ingestion failure in ${fileName}. Missing required columns: [${missingHeaders.join(', ')}]`)
  }

  return data as T[]
}

export async function Settings(prisma: PrismaClient, options: { folder: string }) {
  const targetFolder = options.folder || 'examples'
  const accounts = getAccounts(targetFolder)
  const businessId = accounts.business.id
  const branchId = accounts.branch.id

  // --- RESOLVE MEASUREMENT UNITS ---
  const unitsCsv = parseSettingsCsvRequired<any>(targetFolder, 'units.csv', ['name', 'abbreviation'])
  const runtimeUnits = unitsCsv.map(row => ({
    name: row.name.trim(),
    abbreviation: row.abbreviation.trim(),
    type: (row.type?.trim() as UnitType) || UnitType.COUNT,
    conversionFactor: parseFloat(row.conversionFactor) || 1,
    isBaseUnit: row.isBaseUnit === 'true' || row.isBaseUnit === '1',
  }))

  // --- RESOLVE LOCATIONS ---
  const locationsCsv = parseSettingsCsvRequired<any>(targetFolder, 'locations.csv', ['name'])
  const runtimeLocations = locationsCsv.map(row => ({
    name: row.name.trim(),
    description: row.description?.trim() || null,
  }))

  // --- RESOLVE SUPPLIERS ---
  const suppliersCsv = parseSettingsCsvRequired<any>(targetFolder, 'suppliers.csv', ['name'])
  const runtimeSuppliers = suppliersCsv.map(row => ({
    name: row.name.trim(),
    taxId: row.taxId?.trim() || null,
    contactNo: row.contactNo?.trim() || null,
    email: row.email?.trim() || null,
  }))

  // --- RESOLVE CUSTOMERS ---
  const customersCsv = parseSettingsCsvRequired<any>(targetFolder, 'customers.csv', ['name'])
  const runtimeCustomers = customersCsv.map(row => ({
    name: row.name.trim(),
    email: row.email?.trim() || null,
    phone: row.phone?.trim() || 'WALK-IN',
    taxId: row.taxId?.trim() || null,
    address: row.address?.trim() || null,
  }))

  // =======================================================
  // SINGLE UNIFIED DATABASE RUNTIME SYNCHRONIZATION LOOP
  // =======================================================

  console.info(`📏 Syncing metric unit definitions (${runtimeUnits.length})...`)
  for (const unit of runtimeUnits) {
    const existing = await prisma.unit.findFirst({
      where: { abbreviation: unit.abbreviation, businessId },
    })
    if (existing) {
      await prisma.unit.update({
        where: { id: existing.id },
        data: {
          name: unit.name,
          type: unit.type,
          conversionFactor: unit.conversionFactor,
          isBaseUnit: unit.isBaseUnit,
          deletedAt: null,
        },
      })
    } else {
      await prisma.unit.create({ data: { ...unit, businessId } })
    }
  }

  console.info(`📍 Syncing internal tracking locations (${runtimeLocations.length})...`)
  for (const loc of runtimeLocations) {
    await prisma.location.upsert({
      where: {
        name_branchId: { name: loc.name, branchId },
      },
      update: { description: loc.description, deletedAt: null },
      create: {
        name: loc.name,
        description: loc.description,
        branchId,
        businessId,
      },
    })
  }

  console.info(`🚚 Syncing business suppliers (${runtimeSuppliers.length})...`)
  for (const supplier of runtimeSuppliers) {
    await prisma.supplier.upsert({
      where: {
        name_businessId: { name: supplier.name, businessId },
      },
      update: { taxId: supplier.taxId, contactNo: supplier.contactNo, email: supplier.email, deletedAt: null },
      create: { ...supplier, businessId },
    })
  }

  console.info(`👤 Syncing baseline customer directory (${runtimeCustomers.length})...`)
  for (const customer of runtimeCustomers) {
    const lookupPhone = customer.phone || 'WALK-IN'

    // 💡 Generate a fallback unique email string based on name/phone and business identity
    // Example: "walk-in-customer-org-1@local.pos"
    const standardIdentifier = customer.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    const fallbackEmail = `${standardIdentifier}-${businessId}@local.pos`
    const finalEmail = customer.email?.trim() || fallbackEmail

    await prisma.customer.upsert({
      where: {
        email: finalEmail, // 🔥 Guaranteed to never be null, satisfying Prisma perfectly
      },
      update: {
        name: customer.name,
        phone: lookupPhone,
        taxId: customer.taxId,
        address: customer.address,
        deletedAt: null,
      },
      create: {
        name: customer.name,
        email: finalEmail,
        phone: lookupPhone,
        taxId: customer.taxId,
        address: customer.address,
        businessId,
      },
    })
  }

  console.info('✅ Settings parameters database synchronization phase finalized.')
}
