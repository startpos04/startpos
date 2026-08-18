/**
 * request-account-deletion.ts
 *
 * Server function for Phase 1 account deletion workflow.
 *
 * What this does:
 *   Sends a structured deletion request email to support@start-pos.app
 *   with the merchant's business name, email, and a timestamp.
 *
 * What it does NOT do:
 *   - Does not delete any data (BIR 10-year retention applies to transactions)
 *   - Does not soft-delete the account (that is done manually by support)
 *
 * This is the Phase 1 email-based process described in the Legal Compliance
 * Master Plan §4.3. A structured in-app deletion workflow is planned for Phase 3.
 *
 * Audit: ACCOUNT_DELETION_REQUESTED is written to AuditLog on every call.
 * Rate guard: better-auth rate limiting on the session prevents mass-spamming.
 */

import { createServerFn } from '@tanstack/react-start'
import { Resend } from 'resend'
import { AuditEngine } from '../audit/audit-engine'
import { recordAudit } from '../audit/record-audit'
import { AuditAction, AuditTargetType } from '../audit/types'
import { authMiddleware } from '../better-auth/auth-middleware'

export const requestAccountDeletion = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { id: actorId, businessId, email, name } = context.user
    const businessName = context.user.business?.name ?? 'Unknown business'

    if (!businessId) {
      return { ok: false, error: 'Business context not found. Please reload and try again.' }
    }

    const requestedAt = new Date().toISOString()

    // Send the request email to support
    const resend = new Resend(process.env['RESEND_API_KEY'])
    const supportEmail = process.env['SUPPORT_EMAIL'] ?? 'support@start-pos.app'
    const from = process.env['EMAIL_FROM'] ?? 'onboarding@resend.dev'

    const emailResult = await resend.emails.send({
      from,
      to: supportEmail,
      subject: `[Account Deletion Request] ${businessName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="font-size: 18px; margin-bottom: 4px;">Account Deletion Request</h2>
          <p style="color: #555; font-size: 14px; margin-bottom: 24px;">
            A merchant has requested account deletion. Review the details below and
            process within 30 days per RA 10173 requirements.
          </p>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; color: #888; width: 140px;">Business</td>
              <td style="padding: 8px 0; font-weight: 600;">${businessName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; color: #888;">Merchant name</td>
              <td style="padding: 8px 0;">${name ?? '—'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; color: #888;">Email</td>
              <td style="padding: 8px 0;">${email}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; color: #888;">Business ID</td>
              <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${businessId}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px 0; color: #888;">User ID</td>
              <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${actorId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #888;">Requested at</td>
              <td style="padding: 8px 0;">${requestedAt}</td>
            </tr>
          </table>

          <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; font-size: 13px; color: #92400e;">
            <strong>Note on data retention:</strong> Transaction records containing
            BIR-required fields (OR number, TIN, SC/PWD data) must be retained for
            10 years per BIR Revenue Regulations 17-2013. Account deletion means
            access termination, not full data erasure. Confirm this with the merchant
            before processing.
          </div>
        </div>
      `,
    })

    if (emailResult.error) {
      console.error('[requestAccountDeletion] Failed to send deletion request email:', emailResult.error)
      return { ok: false, error: 'Failed to send deletion request. Please contact support@start-pos.app directly.' }
    }

    // Write the audit entry — this is a high-severity action
    const entry = AuditEngine.build({
      action: AuditAction.ACCOUNT_DELETION_REQUESTED,
      targetType: AuditTargetType.Business,
      targetId: businessId,
      context: { actorId, businessId },
      before: null,
      after: { requestedAt },
    })
    await recordAudit(entry, { throwOnFailure: false })

    return { ok: true }
  })
