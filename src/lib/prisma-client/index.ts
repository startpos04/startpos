import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { Prisma } from 'prisma/generated/prisma/browser'
import { PrismaClient } from 'prisma/generated/prisma/client'

const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'],
})

const adapter = new PrismaPg(pool)

const globalForPrisma = global as unknown as { prisma: PrismaClient }

const basePrisma = globalForPrisma.prisma || new PrismaClient({ adapter })

if (process.env['APP_ENV'] !== 'production') globalForPrisma.prisma = basePrisma

export const getTenantPrisma = (organizationId: string, branchId?: string) => {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          // Skip Auth for system-level models
          const systemModels = ['Organization', 'User', 'Account', 'Session']
          if (systemModels.includes(model)) return query(args)
          const hasOrganizationIdField = 'organizationId' in (Prisma as any)[`${model}ScalarFieldEnum`]
          const hasBranchIdField = 'branchId' in (Prisma as any)[`${model}ScalarFieldEnum`]

          // CREATE: Inject and Validate
          if (operation.includes('create')) {
            // Ensure the data matches the session
            if (args.data.organizationId && args.data.organizationId !== organizationId) {
              throw new Error(`Unauthorized: Organization mismatch`)
            }

            // Auto-inject the IDs
            if (hasOrganizationIdField) {
              args.data = { ...args.data, organizationId }
            }
            if (hasBranchIdField) {
              args.data = { ...args.data, branchId }
            }
          }

          // READ/UPDATE/DELETE: Force where-clause scoping
          const filterOps = ['findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'update', 'updateMany', 'delete', 'deleteMany', 'count']

          if (filterOps.includes(operation)) {
            // Safety check: if user tries to query a different orgId, throw error
            if (args.where?.organizationId && args.where.organizationId !== organizationId) {
              throw new Error(`Unauthorized access to Organization ${args.where.organizationId}`)
            }

            // Auto-inject the IDs
            if (hasOrganizationIdField) {
              args.where = { ...args.where, organizationId }
            }
            if (hasBranchIdField) {
              args.where = { ...args.where, branchId }
            }
          }

          return query(args)
        },
      },
    },
  })
}

// Export the base one for auth/system-level tasks
export const prisma = basePrisma
