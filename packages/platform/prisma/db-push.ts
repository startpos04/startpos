/**
 * db-push.ts — Wrapper for `prisma db push` that sets DATABASE_URL from env
 *
 * Usage (from monorepo root):
 *   pnpm db:push
 *
 * Loads POSTGRES_* vars via tsx --env-file, builds DATABASE_URL, then
 * prompts for confirmation before spawning `prisma db push`.
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPostgresUrl } from '../lib/database-url'
import { confirmYesNo, getDatabaseTarget, isProductionDatabaseTarget } from './db-script-utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
  const { dbUrl, dbTarget, nodeEnv } = getDatabaseTarget()
  const isProductionDB = isProductionDatabaseTarget(dbUrl)
  const isProductionEnv = nodeEnv === 'PRODUCTION' || nodeEnv === 'PROD'
  const isHighRisk = isProductionDB || isProductionEnv

  console.info('\n======================================================')
  console.info('🗄️  PRISMA DB PUSH')
  console.info('======================================================')
  console.info(`💻 SYSTEM ENVIRONMENT : \x1b[36m${nodeEnv}\x1b[0m`)
  console.info(`🗄️  DATABASE TARGET    : \x1b[33m${dbTarget}\x1b[0m`)
  console.info(`🚨 TARGET RISK SCALE  : ${isHighRisk ? '\x1b[41m🔴 HIGH RISK (PRODUCTION)\x1b[0m' : '\x1b[42m🟢 LOW RISK (LOCAL/TEST)\x1b[0m'}`)
  console.info('======================================================\n')

  if (!dbUrl) {
    console.error('❌ Could not build DATABASE_URL — check POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are set.')
    process.exit(1)
  }

  if (isHighRisk) {
    const confirmed = await confirmYesNo('\x1b[31m⚠️  WARNING:\x1b[0m This will push schema changes to a PRODUCTION target. Proceed? (y/N): ')
    if (!confirmed) {
      console.info('🛑 db:push canceled by operator.')
      process.exit(0)
    }
  } else {
    const confirmed = await confirmYesNo(`Push schema changes to \x1b[33m${dbTarget}\x1b[0m? (y/N): `)
    if (!confirmed) {
      console.info('🛑 db:push canceled by operator.')
      process.exit(0)
    }
  }

  const prismaConfigPath = path.resolve(__dirname, '..', 'prisma.config.ts')
  const platformDir = path.resolve(__dirname, '..')
  const env = { ...process.env, DATABASE_URL: dbUrl }

  console.info('\n🔨 Pushing schema...\n')

  try {
    execSync(`pnpm exec prisma db push --config=${prismaConfigPath} --accept-data-loss`, {
      stdio: 'inherit',
      cwd: platformDir,
      env,
    })
    console.info('\n✅ Schema pushed successfully.')
  } catch {
    // Prisma exits non-zero when it needs --force-reset due to destructive changes.
    // Offer a second confirmation before wiping all data.
    console.info('\n⚠️  Schema push failed — likely due to destructive changes that require a full reset.')
    const forceConfirmed = await confirmYesNo(
      '\x1b[31m⚠️  This will DROP and recreate the database. ALL DATA WILL BE LOST. Proceed with --force-reset? (y/N): \x1b[0m',
    )
    if (!forceConfirmed) {
      console.info('🛑 Force reset canceled. No changes were made.')
      process.exit(0)
    }

    try {
      execSync(`pnpm exec prisma db push --config=${prismaConfigPath} --accept-data-loss --force-reset`, {
        stdio: 'inherit',
        cwd: platformDir,
        env,
      })
      console.info('\n✅ Schema pushed successfully (force reset).')
    } catch {
      process.exit(1)
    }
  }
}

main().catch(e => {
  console.error('❌ db:push script crashed:', e)
  process.exit(1)
})
