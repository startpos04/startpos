import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { askQuestion, confirmYesNo, getDatabaseTarget, isProductionDatabaseTarget } from './db-script-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  const { dbUrl, dbTarget, nodeEnv } = getDatabaseTarget()

  if (!dbUrl) {
    console.error('\n\x1b[31m❌ DATABASE CONNECTION NOT CONFIGURED\x1b[0m')
    console.error('   Could not build a DATABASE_URL from environment variables.')
    console.error('\n   Make sure one of the following is set in \x1b[33m.env\x1b[0m or \x1b[33m.env.local\x1b[0m:')
    console.error('     • \x1b[36mPOSTGRES_USER\x1b[0m + \x1b[36mPOSTGRES_PASSWORD\x1b[0m + \x1b[36mPOSTGRES_DB\x1b[0m  (recommended)')
    console.error('     • \x1b[36mDATABASE_URL\x1b[0m  (direct connection string)')
    console.error('\n   Example .env.local:')
    console.error('     POSTGRES_USER=postgres')
    console.error('     POSTGRES_PASSWORD=secret')
    console.error('     POSTGRES_DB=start-pos')
    process.exit(1)
  }

  const isProductionDB = isProductionDatabaseTarget(dbUrl)
  const isProductionEnv = nodeEnv === 'PRODUCTION' || nodeEnv === 'PROD'
  const isHighRisk = isProductionDB || isProductionEnv

  console.info('\n======================================================')
  console.info('🛡️  DATABASE RESET SECURITY LAYER')
  console.info('======================================================')
  console.info(`💻 SYSTEM ENVIRONMENT : \x1b[36m${nodeEnv}\x1b[0m`)
  console.info(`🗄️  DATABASE TARGET    : \x1b[33m${dbTarget}\x1b[0m`)
  console.info(`🚨 TARGET RISK SCALE  : ${isHighRisk ? '\x1b[41m🔴 HIGH RISK (PRODUCTION)\x1b[0m' : '\x1b[42m🟢 LOW RISK (LOCAL/TEST)\x1b[0m'}`)
  console.info('======================================================\n')

  if (isHighRisk) {
    const confirmed = await confirmYesNo(
      '\x1b[31m⚠️  CRITICAL WARNING:\x1b[0m This will completely WIPE the schema and all data on a LIVE production target. Proceed? (y/N): ',
    )

    if (!confirmed) {
      console.info('🛑 Database reset process canceled by operator.')
      process.exit(0)
    }

    console.warn('⚠️  CRITICAL WARNING: This script will execute destructive modifications directly on a LIVE production database cluster!')
    const confirmString = `CONFIRM-PROD-RESET-${Date.now().toString().slice(-4)}`
    const answer = await askQuestion(`To proceed, type exact signature string [ \x1b[31m${confirmString}\x1b[0m ]: `)

    if (answer.trim() !== confirmString) {
      console.error('❌ Signature mismatch. Database reset execution aborted immediately.')
      process.exit(1)
    }
  } else {
    const confirmed = await confirmYesNo('\x1b[31m⚠️  WARNING:\x1b[0m This will completely WIPE the schema and all data. Proceed? (y/N): ', 'RESET_AUTO_CONFIRM')

    if (!confirmed) {
      console.info('🛑 Database reset process canceled by operator.')
      process.exit(0)
    }
  }

  console.info('\n🔥 Executing hard database push and reset layout...')
  try {
    execSync(`pnpm exec prisma db push --config=${path.join(__dirname, '../prisma.config.ts')} --force-reset`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: dbUrl },
    })
    console.info('\n✨ Database schema has been successfully blown away and rebuilt!')
    console.info('\n📋 Next step: run \x1b[36mpnpm db:seed\x1b[0m to populate accounts and platform data.')
    console.info('   (Existing browser sessions will be healed automatically on the next login.)')
  } catch {
    console.error('\n\x1b[31m❌ Database reset failed.\x1b[0m')
    console.error(`\n   Target: \x1b[33m${dbTarget}\x1b[0m`)
    console.error('\n   Is your database server running? Start it with:')
    console.error('     \x1b[36mdocker compose up db -d\x1b[0m   — start only the database container')
    console.error('\n   Then run \x1b[36mpnpm db:reset\x1b[0m again.')
    process.exit(1)
  }
}

main().catch(e => {
  console.error('❌ Reset script crashed:', e)
  process.exit(1)
})
