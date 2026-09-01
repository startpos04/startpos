import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { buildPostgresUrl } from './startpos-core/lib/database-url'

// Load base env first, then let .env.local override (same priority order as Vite)
config({ path: '.env' })
config({ path: '.env.local', override: true })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env --env-file=.env.local ./startpos-core/prisma/seeders/index.ts',
  },
  datasource: {
    url: buildPostgresUrl(process.env['DIRECT_URL']),
  },
})
