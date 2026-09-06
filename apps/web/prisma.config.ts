import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { buildPostgresUrl } from '../../packages/platform/lib/database-url'

// Load base env first, then let .env.config override (same priority order as Vite)
config({ path: '.env' })
config({ path: '../../.env.config', override: true })

/**
 * Delegates to the canonical schema and migrations in packages/platform/prisma/.
 * This app does NOT own the schema — it only owns the datasource connection.
 */
export default defineConfig({
  schema: '../../packages/platform/prisma/schema.prisma',
  migrations: {
    path: '../../packages/platform/prisma/migrations',
    seed: 'tsx --env-file=.env --env-file=.env.local ../../packages/platform/prisma/seeders/index.ts',
  },
  datasource: {
    url: buildPostgresUrl(process.env['DIRECT_URL']),
  },
})
