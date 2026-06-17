import { execSync } from 'node:child_process'
import readline from 'node:readline'

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
  const dbUrl = process.env['DATABASE_URL'] || ''
  const nodeEnv = (process.env['NODE_ENV'] || 'development').toUpperCase()

  let dbTarget = 'Unknown/Hidden Cluster'
  try {
    const parsedUrl = new URL(dbUrl.replace('postgresql://', 'http://'))
    dbTarget = `${parsedUrl.hostname}${parsedUrl.pathname}`
  } catch {
    dbTarget = dbUrl || 'No Connection String Detected'
  }

  // Production condition check
  const isProductionDB = !dbTarget.includes('localhost') && !dbTarget.includes('127.0.0.1') && !dbTarget.includes('test')
  const isProductionEnv = nodeEnv === 'PRODUCTION' || nodeEnv === 'PROD'

  console.info('\n======================================================')
  console.info('🛡️  DATABASE RESET SECURITY LAYER')
  console.info('======================================================')
  console.info(`💻 SYSTEM ENVIRONMENT : \x1b[36m${nodeEnv}\x1b[0m`)
  console.info(`🗄️  DATABASE TARGET    : \x1b[33m${dbTarget}\x1b[0m`)
  console.info(
    `🚨 TARGET RISK SCALE  : ${isProductionDB || isProductionEnv ? '\x1b[41m🔴 HIGH RISK (PRODUCTION)\x1b[0m' : '\x1b[42m🟢 LOW RISK (LOCAL/TEST)\x1b[0m'}`,
  )
  console.info('======================================================\n')

  // Hard block: Instantly abort if production is detected in either env or DB URL
  if (isProductionDB || isProductionEnv) {
    console.error('❌ CRITICAL ERROR: DESTRICTIVE DESTRUCTION DETECTED IN PRODUCTION ENVIRONMENT!')
    console.error('🛑 Hard block triggered. Reset execution aborted immediately to prevent catastrophic data loss.\n')
    process.exit(1)
  }

  // Local/Dev environment validation checkpoint
  const answer = await askQuestion('\x1b[31m⚠️  WARNING:\x1b[0m This will completely WIPE the schema and all data. Proceed? (y/N): ')

  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.info('🛑 Database reset process canceled by operator.')
    process.exit(0)
  }

  console.info('\n🔥 Executing hard database push and reset layout...')
  try {
    // Executes the core prisma destructive reset command synchronously
    execSync('npx prisma db push --force-reset', { stdio: 'inherit' })
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
