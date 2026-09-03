import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { buildPostgresUrl } from '../../packages/platform/lib/database-url'

config({ path: '.env' })
config({ path: '../../.env.config', override: true })

// Admin shares the same schema and migrations as apps/web.
// The generated client lives in apps/web/prisma/generated — referenced via
// the prisma/* path alias in tsconfig.json and vite.config.ts.
export default defineConfig({
  schema: '../web/prisma/schema.prisma',
  migrations: {
    path: '../web/prisma/migrations',
  },
  datasource: {
    url: buildPostgresUrl(process.env['DIRECT_URL']),
  },
})
