import readline from 'node:readline'
import { buildPostgresUrl } from '../src/lib/database-url'

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', 'db', 'host.docker.internal'])

export function getDatabaseTarget() {
  const dbUrl = buildPostgresUrl()
  const nodeEnv = (process.env['NODE_ENV'] || 'development').toUpperCase()

  let dbTarget = 'Unknown/Hidden Cluster'
  try {
    const parsedUrl = new URL(dbUrl.replace('postgresql://', 'http://'))
    dbTarget = `${parsedUrl.hostname}${parsedUrl.pathname}`
  } catch {
    dbTarget = dbUrl || 'No Connection String Detected'
  }

  return { dbUrl, dbTarget, nodeEnv }
}

export function isProductionDatabaseTarget(dbUrl: string): boolean {
  try {
    const host = new URL(dbUrl.replace('postgresql://', 'http://')).hostname
    if (LOCAL_DB_HOSTS.has(host)) return false
    if (host.includes('test')) return false
    return true
  } catch {
    return false
  }
}

export function isAutoConfirmEnabled(envKey?: 'SEED_AUTO_CONFIRM' | 'RESET_AUTO_CONFIRM'): boolean {
  const keys = [envKey, 'AUTO_CONFIRM'].filter((key): key is string => Boolean(key))

  return keys.some(key => {
    const value = process.env[key]?.toLowerCase()
    return value === 'true' || value === 'yes' || value === '1'
  })
}

export function askQuestion(query: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `Interactive input is required but no TTY is attached.\n` +
        `Use "pnpm docker:exec run seed" (or reset), or set AUTO_CONFIRM=yes with the needed env vars.`,
    )
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve =>
    rl.question(query, answer => {
      rl.close()
      resolve(answer)
    }),
  )
}

export async function resolveSeedFolder(): Promise<string> {
  const configured = process.env['SEED_FOLDER']?.trim()
  if (configured) return configured

  if (isAutoConfirmEnabled('SEED_AUTO_CONFIRM')) return 'examples'

  const folderInput = await askQuestion('📂 Enter target data folder (default: examples): ')
  return folderInput.trim() || 'examples'
}

export async function confirmYesNo(prompt: string, envKey?: 'SEED_AUTO_CONFIRM' | 'RESET_AUTO_CONFIRM'): Promise<boolean> {
  if (isAutoConfirmEnabled(envKey)) return true

  const answer = await askQuestion(prompt)
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}
