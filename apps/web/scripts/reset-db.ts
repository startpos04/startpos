import { execSync } from 'node:child_process'
import { askQuestion, confirmYesNo, getDatabaseTarget, isProductionDatabaseTarget } from '../../packages/platform/prisma/db-script-utils'

async function main() {
  const { dbUrl, dbTarget, nodeEnv } = getDatabaseTarget()
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
    execSync('pnpm exec prisma db push --force-reset', { stdio: 'inherit' })
    console.info('\n✨ Database schema has been successfully blown away and rebuilt!')
  } catch (err) {
    console.error('\n❌ Prisma hard reset task failed:', err)
    process.exit(1)
  }
}

main().catch(e => {
  console.error('❌ Reset script crashed:', e)
  process.exit(1)
})
