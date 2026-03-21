import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { PrismaClient } from 'prisma/generated/prisma/client'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
})

const adapter = new PrismaPg(pool)

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  })

if (process.env.APP_ENV !== 'production') globalForPrisma.prisma = prisma
