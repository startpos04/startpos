import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { buildPostgresUrl } from '../../packages/platform/lib/database-url'

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
  },
  datasource: {
    url: buildPostgresUrl(process.env['DIRECT_URL']),
  },
})
