/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '../../lib/prisma-client'
import { askQuestion, confirmYesNo, getDatabaseTarget, isProductionDatabaseTarget, resolveSeedFolder } from '../db-script-utils'

const __filename = fileURLToPath(import.meta.url)
const CURRENT_FILE = path.basename(__filename)

// Seeders that always run regardless of target folder — they seed platform-global
// data (features, plans, hints, etc.) that must exist in every environment.
const SYSTEM_SEEDER_FILES = new Set(['entitlements.ts', 'entitlements.js', 'hints.ts', 'hints.js'])

// Seeders that are locked to a specific folder — they only run when the target
// folder exactly matches. Keyed by file name → required folder name.
const FOLDER_LOCKED_SEEDERS = new Map<string, string>([
  ['e2e.ts', 'e2e'],
  ['e2e.js', 'e2e'],
])

async function main() {
  const { dbUrl, dbTarget, nodeEnv } = getDatabaseTarget()
  const isProductionDB = isProductionDatabaseTarget(dbUrl)

  console.info('\n======================================================')
  console.info('🛡️  SEEDING INFRASTRUCTURE SECURITY INSPECTOR')
  console.info('======================================================')
  console.info(`💻 SYSTEM ENVIRONMENT : \x1b[36m${nodeEnv}\x1b[0m`)
  console.info(`🗄️  DATABASE TARGET    : \x1b[33m${dbTarget}\x1b[0m`)
  console.info(`🚨 TARGET RISK SCALE  : ${isProductionDB ? '\x1b[41m🔴 HIGH RISK (PRODUCTION)\x1b[0m' : '\x1b[42m🟢 LOW RISK (LOCAL/TEST)\x1b[0m'}`)
  console.info('======================================================\n')

  if (isProductionDB) {
    console.warn('⚠️  CRITICAL WARNING: This script will execute modifications directly on a LIVE production database cluster!')
    const confirmString = `CONFIRM-PROD-SEED-${Date.now().toString().slice(-4)}`
    const answer = await askQuestion(`To proceed, type exact signature string [ \x1b[31m${confirmString}\x1b[0m ]: `)

    if (answer.trim() !== confirmString) {
      console.error('❌ Signature mismatch. Seeding runtime execution aborted immediately.')
      process.exit(1)
    }
  } else {
    const confirmed = await confirmYesNo('Proceed with executing seed data injection loops? (y/N): ', 'SEED_AUTO_CONFIRM')
    if (!confirmed) {
      console.info('🛑 Seeding process canceled by operator.')
      process.exit(0)
    }
  }

  const targetFolder = await resolveSeedFolder()

  const rawArg = process.argv[2]
  const arg = rawArg ? path.parse(rawArg).name : null
  const seedersDir = path.dirname(__filename)

  const rawFiles = fs.readdirSync(seedersDir).filter(file => {
    const isScript = file.endsWith('.ts') || file.endsWith('.js')
    const isCurrentFile = file === CURRENT_FILE || file === 'index.ts'
    return isScript && !isCurrentFile && !file.includes('.test.')
  })

  console.info(`\n🌱 Inspecting seeder modules. Target Data Folder: [\x1b[34m${targetFolder}\x1b[0m]`)

  const systemPipeline: any[] = []
  const tenantPipeline: any[] = []

  for (const file of rawFiles) {
    const filePath = path.join(seedersDir, file)
    try {
      const module = await import(`file://${filePath}`)
      const weight = typeof module.order === 'number' ? module.order : 99
      const seederTask = module.default || Object.values(module).find(val => typeof val === 'function')

      const entry = { file, fileName: path.parse(file).name, weight, seederTask }

      if (SYSTEM_SEEDER_FILES.has(file)) {
        systemPipeline.push(entry)
      } else {
        tenantPipeline.push(entry)
      }
    } catch (err) {
      console.error(`❌ Metadata extraction failed on ${file}:`, err)
      throw err
    }
  }

  systemPipeline.sort((a, b) => a.weight - b.weight)
  tenantPipeline.sort((a, b) => a.weight - b.weight)

  console.info('🚀 Starting ordered database seeding...')

  try {
    // Check if we should use individual transactions for better stability
    const useIndividualTransactions = process.env.SEED_INDIVIDUAL_TRANSACTIONS === 'true' || isProductionDB

    if (useIndividualTransactions) {
      console.info('🔄 Using individual transactions for each seeder (safer for large datasets)...')

      // ── Phase 1: System seeders — always run, no folder filter ──────────
      if (systemPipeline.length > 0) {
        console.info('\n📦 [SYSTEM] Running platform-global seeders...')
        for (const task of systemPipeline) {
          const isTargeted = arg && arg !== 'all' && arg !== task.fileName && arg !== task.file
          if (isTargeted) {
            console.info(` -> [System] Skipping ${task.file} (not targeted by arg "${arg}").`)
            continue
          }

          if (typeof task.seederTask !== 'function') {
            console.warn(`⚠️  Skipping ${task.file}: No exportable execution function discovered.`)
            continue
          }

          console.info(` -> [Order: ${task.weight}] Executing: ${task.file}`)
          await prisma.$transaction(
            async tx => {
              await task.seederTask(tx, { folder: targetFolder })
            },
            { timeout: 600000 },
          )
          console.info('---------------------------------------------------')
        }
      }

      // ── Phase 2: Tenant seeders — filtered by folder + optional arg ─────
      console.info(`\n🏢 [TENANT] Running tenant seeders for folder: ${targetFolder}...`)
      for (const task of tenantPipeline) {
        const lockedFolder = FOLDER_LOCKED_SEEDERS.get(task.file)
        if (lockedFolder && lockedFolder !== targetFolder) {
          console.info(` -> Skipping ${task.file} (locked to folder "${lockedFolder}", current: "${targetFolder}").`)
          continue
        }

        const shouldRun = !arg || arg === 'all' || arg === task.fileName || arg === task.file

        if (shouldRun) {
          if (typeof task.seederTask !== 'function') {
            console.warn(`⚠️  Skipping ${task.file}: No exportable execution function discovered.`)
            continue
          }

          console.info(` -> [Order: ${task.weight}] Executing: ${task.file}`)
          await prisma.$transaction(
            async tx => {
              await task.seederTask(tx, { folder: targetFolder })
            },
            { timeout: 600000 },
          )
          console.info('---------------------------------------------------')
        }
      }
    } else {
      // Original single transaction approach (faster but less stable for large datasets)
      console.info('⚡ Using single large transaction (faster but may timeout on large datasets)...')
      await prisma.$transaction(
        async tx => {
          // ── Phase 1: System seeders — always run, no folder filter ──────────
          if (systemPipeline.length > 0) {
            console.info('\n📦 [SYSTEM] Running platform-global seeders...')
            for (const task of systemPipeline) {
              // When a specific file arg is given, still run system seeders unless
              // the arg explicitly targets a different single tenant seeder.
              // System seeders are skipped only if arg targets another specific file.
              const isTargeted = arg && arg !== 'all' && arg !== task.fileName && arg !== task.file
              if (isTargeted) {
                console.info(` -> [System] Skipping ${task.file} (not targeted by arg "${arg}").`)
                continue
              }

              if (typeof task.seederTask !== 'function') {
                console.warn(`⚠️  Skipping ${task.file}: No exportable execution function discovered.`)
                continue
              }

              console.info(` -> [Order: ${task.weight}] Executing: ${task.file}`)
              await task.seederTask(tx, { folder: targetFolder })
              console.info('---------------------------------------------------')
            }
          }

          // ── Phase 2: Tenant seeders — filtered by folder + optional arg ─────
          console.info(`\n🏢 [TENANT] Running tenant seeders for folder: ${targetFolder}...`)
          for (const task of tenantPipeline) {
            // Skip folder-locked seeders when the target folder doesn't match
            const lockedFolder = FOLDER_LOCKED_SEEDERS.get(task.file)
            if (lockedFolder && lockedFolder !== targetFolder) {
              console.info(` -> Skipping ${task.file} (locked to folder "${lockedFolder}", current: "${targetFolder}").`)
              continue
            }

            const shouldRun = !arg || arg === 'all' || arg === task.fileName || arg === task.file

            if (shouldRun) {
              if (typeof task.seederTask !== 'function') {
                console.warn(`⚠️  Skipping ${task.file}: No exportable execution function discovered.`)
                continue
              }

              console.info(` -> [Order: ${task.weight}] Executing: ${task.file}`)
              await task.seederTask(tx, { folder: targetFolder })
              console.info('---------------------------------------------------')
            }
          }
        },
        {
          timeout: 600000, // Increased to 10 minutes (600 seconds)
          maxWait: 10000, // Maximum wait time for transaction to start
        },
      )
    }

    console.info('🏁 Ordered pipeline tasks finished successfully.')
    process.exit(0)
  } catch (err) {
    console.error('\n💥 Seeding pipeline failed! Entire transaction rolled back cleanly.')
    console.error('Reason for abort:', err)
    process.exit(1)
  }
}

main()
  .catch(e => {
    console.error('❌ Seeding pipeline crashed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
