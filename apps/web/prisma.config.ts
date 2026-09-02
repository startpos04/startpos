import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { buildPostgresUrl } from '../../packages/platform/lib/database-url'

// Load base env first, then let .env.local override (same priority order as Vite)
config({ path: '.env' })
config({ path: '../../.env.config', override: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env --env-file=.env.local ../../packages/platform/prisma/seeders/index.ts',
  },
  datasource: {
    url: buildPostgresUrl(process.env['DIRECT_URL']),
  },
})
