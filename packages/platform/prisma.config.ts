import { defineConfig } from 'prisma/config'

/**
 * Canonical Prisma config — single source of truth for the entire monorepo.
 *
 * Schema and migrations live here in packages/platform/prisma/.
 * All apps (web, admin) delegate to this config — they do NOT own schema or migrations.
 *
 * Generated client is written to packages/platform/prisma/generated/ and resolved
 * by every app via the `prisma/*` path alias pointing at this directory.
 *
 * DATABASE_URL is read from the environment at runtime (not loaded here) so that
 * `prisma generate` works without any env files — only migrate/push need the URL.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=../../apps/web/.env --env-file=../../.env.config prisma/seeders/index.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
})
