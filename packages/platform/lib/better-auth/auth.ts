import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { Role } from 'prisma/generated/prisma/enums'
import { Resend } from 'resend'
import { prisma } from '../prisma-client'

const apiKey = process.env['RESEND_API_KEY']
console.log('[auth.ts] RESEND_API_KEY present:', !!apiKey, `${apiKey?.slice(0, 10)}...`)
console.log('[auth.ts] EMAIL_FROM:', process.env['EMAIL_FROM'])

const resend = new Resend(apiKey)

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  baseURL: process.env['BETTER_AUTH_URL'],
  trustedOrigins: [
    process.env['BETTER_AUTH_URL']!,
    process.env['BETTER_AUTH_INTERNAL_URL']!,
    'http://localhost:3000', // E2E tests and local dev
    'http://127.0.0.1:3000',
    'https://*.vercel.app',
  ].filter(Boolean),
  secret: process.env['BETTER_AUTH_SECRET'],
  emailAndPassword: {
    enabled: true,
  },
  // Phase 1 — Legal Compliance: rate limiting + account lockout
  // Prevents brute-force credential attacks. Configuration follows the
  // better-auth docs: https://www.better-auth.com/docs/concepts/rate-limit
  rateLimit: {
    window: 60, // 60-second rolling window
    max: 10, // max 10 auth requests per window per IP
  },
  account: {
    accountLockout: {
      enabled: true,
      maxAttempts: 10, // lock after 10 failed attempts
      lockoutDuration: 5 * 60, // locked for 5 minutes (seconds)
    },
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
  plugins: [
    tanstackStartCookies(),
    emailOTP({
      otpLength: 6,
      expiresIn: 600, // 10 minutes
      resendStrategy: 'reuse',
      sendVerificationOnSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        console.log('[emailOTP] sendVerificationOTP called:', { email, otp, type })

        if (type !== 'email-verification') {
          console.log('[emailOTP] Skipping non-email-verification type:', type)
          return
        }

        try {
          const from = process.env['EMAIL_FROM'] ?? 'onboarding@resend.dev'
          console.log('[emailOTP] Sending email from:', from, 'to:', email)

          const result = await resend.emails.send({
            from,
            to: email,
            subject: 'Your verification code',
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                <h2 style="font-size: 20px; margin-bottom: 8px;">Verify your email</h2>
                <p style="color: #555; margin-bottom: 24px;">
                  Enter the code below to verify your email address. It expires in 10 minutes.
                </p>
                <div style="
                  font-size: 36px;
                  font-weight: 700;
                  letter-spacing: 12px;
                  text-align: center;
                  background: #f4f4f5;
                  border-radius: 8px;
                  padding: 20px;
                  margin-bottom: 24px;
                ">${otp}</div>
                <p style="color: #888; font-size: 13px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </div>
            `,
          })

          if (result.error) {
            console.error('[emailOTP] ❌ Failed to send verification email:', result.error)
          } else {
            console.log('[emailOTP] ✅ Verification email sent:', { id: result.data?.id, to: email, otp })
          }
        } catch (error) {
          console.error('[emailOTP] ❌ Exception sending verification email:', error)
        }
      },
    }),
  ],
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
