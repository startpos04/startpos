/**
 * send-registration-otp.ts
 *
 * Sends and verifies a 6-digit email OTP for a new (not-yet-created) user
 * during the registration flow.
 *
 * better-auth's built-in emailOTP plugin silently skips sending for
 * email-verification when the user doesn't exist yet, and its verifyEmail
 * endpoint also requires the user to exist. Both operations are handled here
 * directly using the Verification table, which better-auth already owns.
 *
 * The OTP identifier follows better-auth's internal format:
 *   "email-otp:email-verification:<email>"
 * so that if the user is later created by other flows, there's no collision.
 */

import { prisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import { Resend } from 'resend'
import { z } from 'zod'

const OTP_LENGTH = 6
const OTP_EXPIRES_IN_SECONDS = 600 // 10 minutes
const MAX_ATTEMPTS = 3

const sendSchema = z.object({ email: z.string().email() })
const verifySchema = z.object({ email: z.string().email(), otp: z.string().length(OTP_LENGTH) })

function generateOTP(): string {
  return Array.from({ length: OTP_LENGTH }, () => Math.floor(Math.random() * 10)).join('')
}

// Namespaced to avoid any collision with better-auth's own verification rows
function otpIdentifier(email: string): string {
  return `registration-otp:${email.toLowerCase()}`
}

// ---------------------------------------------------------------------------
// Send OTP
// ---------------------------------------------------------------------------

export const sendRegistrationOTP = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string }) => sendSchema.parse(d))
  .handler(async ({ data }) => {
    // When email verification is disabled via feature flag, skip the OTP entirely.
    // The verify step is also skipped on the client side â€” this guard ensures the
    // server function is a no-op even if called directly.
    if (process.env['ENABLE_EMAIL_VERIFICATION'] === 'false') {
      console.log('[sendRegistrationOTP] Email verification disabled via ENABLE_EMAIL_VERIFICATION=false')
      return { success: true as const }
    }

    const email = data.email.toLowerCase().trim()
    const otp = generateOTP()
    const identifier = otpIdentifier(email)
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
      console.error('[sendRegistrationOTP] Resend error:', result.error)
      return { success: false as const, error: 'Failed to send verification email. Please try again.' }
    }

    console.log('[sendRegistrationOTP] OTP sent:', { id: result.data?.id, to: email, otp })
    return { success: true as const }
  })

// ---------------------------------------------------------------------------
// Verify OTP
// ---------------------------------------------------------------------------

export const verifyRegistrationOTP = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; otp: string }) => verifySchema.parse(d))
  .handler(async ({ data }) => {
    // When email verification is disabled, always return success.
    if (process.env['ENABLE_EMAIL_VERIFICATION'] === 'false') {
      return { success: true as const }
    }

    const email = data.email.toLowerCase().trim()
    const identifier = otpIdentifier(email)

    const row = await prisma.verification.findFirst({ where: { identifier } })

    if (!row) {
      return { success: false as const, error: 'No verification code found. Please request a new one.' }
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
      // Increment attempts
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

    // OTP matched â€” delete the row so it can't be reused
    await prisma.verification.deleteMany({ where: { identifier } })
    return { success: true as const }
  })
