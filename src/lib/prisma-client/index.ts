import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { PrismaClient } from 'prisma/generated/prisma/client'
import { multiTenantExtension, TenantAwareClient } from './multi-tenant-extension'
import { softDeleteExtension } from './soft-delete-extension'

// Establish the Database Connection
const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'],
})
const adapter = new PrismaPg(pool)

// Define the Base Client with Soft Delete
const createBaseClient = () => new PrismaClient({ adapter }).$extends(softDeleteExtension)

// We use ReturnType to keep the complex Prisma Extension types intact
type BasePrismaClient = ReturnType<typeof createBaseClient>

const globalForPrisma = global as unknown as { prisma: BasePrismaClient }

export const prisma = globalForPrisma.prisma || createBaseClient()

if (process.env['APP_ENV'] !== 'production') globalForPrisma.prisma = prisma

// Chaining for Multi-Tenancy
export const getTenantPrisma = (organizationId: string, branchId?: string) => {
  const scopedClient = prisma.$extends(multiTenantExtension(organizationId, branchId))
  // We cast to 'any' first to break the strict link,
  // then to our intersection type to restore autocomplete.
  return scopedClient as any as TenantAwareClient<typeof scopedClient>
}
