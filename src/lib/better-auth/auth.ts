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
    allowedHosts: [process.env['BETTER_AUTH_URL']!, process.env['BETTER_AUTH_INTERNAL_URL']!, '*.vercel.app'].filter(Boolean),
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
      businessId: { type: 'string', required: false },
      branchId: { type: 'string', required: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async session => {
          const membership = await prisma.membership.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: 'desc' },
          })

          if (membership) {
            return {
              data: {
                ...session,
                businessId: membership.businessId,
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
      businessId: { type: 'string', required: false },
      branchId: { type: 'string', required: false },
    },
  },
  plugins: [tanstackStartCookies()],
  socialProviders: {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
      enabled: !!(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']),
    },
    facebook: {
      clientId: process.env['FACEBOOK_CLIENT_ID'] ?? '',
      clientSecret: process.env['FACEBOOK_CLIENT_SECRET'] ?? '',
      enabled: !!(process.env['FACEBOOK_CLIENT_ID'] && process.env['FACEBOOK_CLIENT_SECRET']),
    },
  },
})

export type Session = typeof auth.$Infer.Session
