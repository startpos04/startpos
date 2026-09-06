/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { PrismaClient } from 'prisma/generated/prisma/client'
import { buildPostgresUrl } from '../database-url'
import { softDeleteExtension } from './soft-delete-extension'

// ---------------------------------------------------------------------------
// Base Prisma client — platform responsibility
//
// The tenant-aware extension (multiTenantExtension) and getTenantPrisma
// live in apps/web/src/lib/prisma-client because business/branch tenancy
// is a web-app concern, not a platform concern.
// ---------------------------------------------------------------------------

const pool = new pg.Pool({
  connectionString: buildPostgresUrl(),
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any)

const createBaseClient = () =>
  new PrismaClient({
    adapter,
    transactionOptions: {
      maxWait: 5_000,
      timeout: 20_000,
    },
  }).$extends(softDeleteExtension)

type BasePrismaClient = ReturnType<typeof createBaseClient>

const globalForPrisma = global as unknown as { prisma: BasePrismaClient }

export const prisma = globalForPrisma.prisma || createBaseClient()

if (process.env['NODE_ENV'] !== 'production') globalForPrisma.prisma = prisma
