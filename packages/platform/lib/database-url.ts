import { config as loadEnvFile } from 'dotenv'

// Load env files at the module level so this works in every execution context:
// the Vite config process, the SSR worker, and standalone tsx scripts.
// .env.local overrides .env — same priority as Vite's own env loading.
loadEnvFile({ path: '.env', quiet: true })
loadEnvFile({ path: '.env.local', override: true, quiet: true })

function encodeCredential(value: string): string {
  return encodeURIComponent(value)
}

export function buildPostgresUrl(fallback?: string): string {
  // Prioritize explicit DATABASE_URL or DIRECT_URL over POSTGRES_* variables
  const explicitUrl = process.env['DATABASE_URL'] ?? process.env['DIRECT_URL']
  if (explicitUrl) {
    return explicitUrl
  }

  const user = process.env['POSTGRES_USER']
  const password = process.env['POSTGRES_PASSWORD']
  const database = process.env['POSTGRES_DB']

  if (!user || !password || !database) {
    return fallback ?? ''
  }

  const host = process.env['POSTGRES_HOST'] ?? 'localhost'
  const port = host === 'db' ? (process.env['POSTGRES_PORT'] ?? '5432') : (process.env['POSTGRES_HOST_PORT'] ?? process.env['POSTGRES_PORT'] ?? '5432')

  return `postgresql://${encodeCredential(user)}:${encodeCredential(password)}@${host}:${port}/${database}?schema=public`
}
