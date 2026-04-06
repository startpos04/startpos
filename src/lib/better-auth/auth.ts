import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Role } from 'prisma/generated/prisma/enums'
import { prisma } from '../prisma-client'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: {
    allowedHosts: [process.env['BETTER_AUTH_URL']!, '*.vercel.app'],
    protocol: process.env['NODE_ENV'] === 'development' ? 'http' : 'https',
  },
  secret: process.env['BETTER_AUTH_SECRET'],
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: Role.CASHIER,
      },
      organizationId: { type: 'string', required: true },
      branchId: { type: 'string', required: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async session => {
          const membership = await prisma.membership.findFirst({
            where: { userId: session.userId },
          })

          if (membership) {
            return {
              data: {
                ...session,
                organizationId: membership.organizationId,
                branchId: membership.branchId,
              },
            }
          }

          return { data: session }
        },
      },
    },
  },
  session: {
    additionalFields: {
      organizationId: { type: 'string' },
      branchId: { type: 'string' },
    },
  },
  plugins: [tanstackStartCookies()],
})

export type Session = typeof auth.$Infer.Session
