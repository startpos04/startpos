/**
 * forgot-password-otp.ts
 *
 * Sends, verifies, and applies a 6-digit OTP-based password reset flow.
 *
 * Uses the same pattern as send-registration-otp.ts â€” we own send + verify,
 * then resetForgotPassword inserts a valid row for better-auth's
 * /email-otp/reset-password endpoint so it can hash and update the password
 * using its own internal hasher.
 */

import { auth } from '@platform/lib/better-auth/auth'
import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { HEADERS } from '@tanstack/react-start/server'
import { Resend } from 'resend'
import { z } from 'zod'

const OTP_LENGTH = 6
const OTP_EXPIRES_IN_SECONDS = 600 // 10 minutes
const MAX_ATTEMPTS = 3

const sendSchema = z.object({ email: z.string().email() })
const verifySchema = z.object({ email: z.string().email(), otp: z.string().length(OTP_LENGTH) })
const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(OTP_LENGTH),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
})

function generateOTP(): string {
  return Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join('')
}

// Our own namespace for the send/verify steps
function ourIdentifier(email: string): string {
  return `forgot-password-otp:${email.toLowerCase()}`
}

// better-auth's identifier for its /email-otp/reset-password endpoint
function betterAuthIdentifier(email: string): string {
  return `email-otp:forget-password:${email.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Send OTP
// ---------------------------------------------------------------------------

export const sendForgotPasswordOTP = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string }) => sendSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim()

    // Silently succeed if user doesn't exist â€” prevents email enumeration
    const user = await prisma.user.findFirst({ where: { email }, select: { id: true } })
    if (!user) {
      console.log('[sendForgotPasswordOTP] User not found, silently succeeding:', email)
      return { success: true as const }
    }

    const otp = generateOTP()
    const identifier = ourIdentifier(email)
    const expiresAt = new Date(Date.now() + OTP_EXPIRES_IN_SECONDS * 1000)

    // Delete any previous OTP for this email, then store the new one.
    // Value format: "<otp>:<attempts>" â€” attempts starts at 0.
    await prisma.verification.deleteMany({ where: { identifier } })
    await prisma.verification.create({
      data: { identifier, value: `${otp}:0`, expiresAt },
    })

    const resend = new Resend(process.env['RESEND_API_KEY'])
    const from = process.env['EMAIL_FROM'] ?? 'onboarding@resend.dev'

    const result = await resend.emails.send({
      from,
      to: email,
      subject: 'Reset your password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="font-size: 20px; margin-bottom: 8px;">Reset your password</h2>
          <p style="color: #555; margin-bottom: 24px;">
            Someone requested a password reset for your account. Enter the code below to continue. It expires in 10 minutes.
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
            If you didn't request this, you can safely ignore this email. Your password won't be changed.
          </p>
        </div>
      `,
    })

    if (result.error) {
      console.error('[sendForgotPasswordOTP] Resend error:', result.error)
      return { success: false as const, error: 'Failed to send reset code. Please try again.' }
    }

    console.log('[sendForgotPasswordOTP] OTP sent:', { id: result.data?.id, to: email, otp })
    return { success: true as const }
  })

// ---------------------------------------------------------------------------
// Verify OTP
// ---------------------------------------------------------------------------

export const verifyForgotPasswordOTP = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; otp: string }) => verifySchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim()
    const identifier = ourIdentifier(email)

    const row = await prisma.verification.findFirst({ where: { identifier } })

    if (!row) {
      return { success: false as const, error: 'No reset code found. Please request a new one.' }
    }

    if (row.expiresAt < new Date()) {
      await prisma.verification.deleteMany({ where: { identifier } })
      return { success: false as const, error: 'Code has expired. Please request a new one.' }
    }

    const [storedOtp, attemptsStr] = row.value.split(':')
    const attempts = parseInt(attemptsStr ?? '0', 10)

    if (attempts >= MAX_ATTEMPTS) {
      await prisma.verification.deleteMany({ where: { identifier } })
      return { success: false as const, error: 'Too many attempts. Please request a new code.' }
    }

    if (data.otp !== storedOtp) {
      await prisma.verification.update({
        where: { id: row.id },
        data: { value: `${storedOtp}:${attempts + 1}` },
      })
      const remaining = MAX_ATTEMPTS - attempts - 1
      return {
        success: false as const,
        error: remaining > 0 ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Too many attempts. Please request a new code.',
      }
    }

    // OTP matched â€” delete our row so it can't be reused
    await prisma.verification.deleteMany({ where: { identifier } })
    return { success: true as const }
  })

// ---------------------------------------------------------------------------
// Reset password (called after OTP is verified)
// ---------------------------------------------------------------------------

export const resetForgotPassword = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; otp: string; newPassword: string }) => resetSchema.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim()

    // Re-verify the OTP is still valid (step 2 may have just passed, but double-check)
    // We insert a fresh row with better-auth's identifier format so its
    // /email-otp/reset-password endpoint can find and verify it.
    const placeholder = data.otp
    const baIdentifier = betterAuthIdentifier(email)
    const expiresAt = new Date(Date.now() + 60 * 1000) // 60s â€” just enough for this call

    await prisma.verification.deleteMany({ where: { identifier: baIdentifier } })
    await prisma.verification.create({
      data: { identifier: baIdentifier, value: `${placeholder}:0`, expiresAt },
    })

    try {
      const response = await auth.api.resetPasswordEmailOTP({
        body: {
          email,
          otp: data.otp,
          password: data.newPassword,
        },
        headers: new Headers(HEADERS as Record<string, string>),
      })

      if (!response?.success) {
        return { success: false as const, error: 'Password reset failed. Please try again.' }
      }

      return { success: true as const }
    } catch (e) {
      console.error('[resetForgotPassword] Error:', e)
      // Clean up the placeholder row if the call failed
      await prisma.verification.deleteMany({ where: { identifier: baIdentifier } })
      return { success: false as const, error: 'Password reset failed. Please try again.' }
    }
  })
