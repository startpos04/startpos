/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: explain */
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { prisma } from '@/lib/prisma-client'

const __filename = fileURLToPath(import.meta.url)
const CURRENT_FILE = path.basename(__filename)

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close()
      resolve(ans)
    }),
  )
}

async function main() {
  // =======================================================
  // ENVIRONMENT SECURITY ENVIRONMENT GUARD LAYER
  // =======================================================
  const dbUrl = process.env['DATABASE_URL'] || ''
  const nodeEnv = (process.env['NODE_ENV'] || 'development').toUpperCase()

  let dbTarget = 'Unknown/Hidden Cluster'
  try {
    const parsedUrl = new URL(dbUrl.replace('postgresql://', 'http://'))
    dbTarget = `${parsedUrl.hostname}${parsedUrl.pathname}`
  } catch {
    dbTarget = dbUrl || 'No Connection String Detected'
  }

  const isProductionDB = !dbTarget.includes('localhost') && !dbTarget.includes('127.0.0.1') && !dbTarget.includes('test')

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
    const answer = await askQuestion('Proceed with executing seed data injection loops? (y/N): ')
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.info('🛑 Seeding process canceled by operator.')
      process.exit(0)
    }
  }

  // =======================================================
  // 💡 INTERACTIVE DATA FOLDER INGESTION LAYER
  // =======================================================
  const folderInput = await askQuestion('📂 Enter target data folder (default: examples): ')
  const targetFolder = folderInput.trim() || 'examples'

  // =======================================================
  // SEEDER PIPELINE PARSING & EXECUTION LAYER
  // =======================================================
  const rawArg = process.argv[2]
  const arg = rawArg ? path.parse(rawArg).name : null
  const seedersDir = path.dirname(__filename)

  const rawFiles = fs.readdirSync(seedersDir).filter(file => {
    const isScript = file.endsWith('.ts') || file.endsWith('.js')
    const isCurrentFile = file === CURRENT_FILE || file === 'index.ts'
    return isScript && !isCurrentFile && !file.includes('.test.')
  })

  console.info(`\n🌱 Inspecting seeder modules. Target Data Folder: [\x1b[34m${targetFolder}\x1b[0m]`)

  const seederPipeline: any[] = []

  for (const file of rawFiles) {
    const filePath = path.join(seedersDir, file)
    try {
      const module = await import(`file://${filePath}`)
      const weight = typeof module.order === 'number' ? module.order : 99
      const seederTask = module.default || Object.values(module).find(val => typeof val === 'function')

      seederPipeline.push({
        file,
        fileName: path.parse(file).name,
        weight,
        seederTask,
      })
    } catch (err) {
      console.error(`❌ Metadata extraction failed on ${file}:`, err)
      throw err
    }
  }

  seederPipeline.sort((a, b) => a.weight - b.weight)

  console.info('🚀 Starting ordered database seeding...')

  try {
    await prisma.$transaction(
      async tx => {
        for (const task of seederPipeline) {
          const shouldRun = !arg || arg === 'all' || arg === task.fileName || arg === task.file

          if (shouldRun) {
            if (typeof task.seederTask !== 'function') {
              console.warn(`⚠️  Skipping ${task.file}: No exportable execution function discovered.`)
              continue
            }

            console.info(` -> [Order: ${task.weight}] Executing: ${task.file}`)
            await task.seederTask(tx, { folder: targetFolder })
            console.info(`---------------------------------------------------`)
          }
        }
      },
      {
        timeout: 90000,
      },
    )

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
