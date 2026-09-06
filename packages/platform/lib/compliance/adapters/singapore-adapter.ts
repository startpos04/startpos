/**
 * Singapore Compliance Adapter
 *
 * Handles Inland Revenue Authority of Singapore (IRAS) compliance requirements.
 *
 * IRAS Requirements:
 * - GST Registration Number
 * - UEN (Unique Entity Number)
 * - ACRA (Accounting and Corporate Regulatory Authority) Number
 * - GST rate at time of sale
 * - Customer GST/UEN for B2B transactions
 */

import type { Branch, Business, Prisma, SingaporeBranchCompliance, SingaporeCompliance } from 'prisma/generated/prisma/client'
import type { ComplianceAdapter, ComplianceData, RefundContext, UserContext } from '../compliance-adapter'

/** Business shape expected by this adapter — base fields + SG compliance relation */
type SGBusiness = Business & {
  singaporeCompliance: SingaporeCompliance | null
}

/** Branch shape expected by this adapter — base fields + SG branch compliance relation */
type SGBranch = Branch & {
  singaporeBranchCompliance: SingaporeBranchCompliance | null
}

/**
 * The subset of SG snapshot fields copied during a refund.
 * Typed so copyRefundSnapshot never needs `as any` on originalTransaction.
 */
interface SGTransactionSnapshot {
  snapshotBusinessName: string
  snapshotBranchName: string
  snapshotBranchAddress: string | null
  snapshotBranchSN: string
  snapshotCurrency: string
  snapshotGSTNumber: string | null
  snapshotUENNumber: string | null
  snapshotGSTRate: number | null
  snapshotIsGSTRegistered: boolean | null
  snapshotCustomerTIN?: string | null
}

export class SingaporeComplianceAdapter implements ComplianceAdapter<SGBusiness, SGBranch> {
  readonly countryCode = 'SG'

  extractComplianceData(context: UserContext<SGBusiness, SGBranch>): ComplianceData {
    const { business, branch } = context

    // No cast needed — SGBusiness and SGBranch declare these relations explicitly
    const sgCompliance = business.singaporeCompliance
    const sgBranchCompliance = branch.singaporeBranchCompliance

    return {
      // Business-level IRAS data
      businessTaxId: sgCompliance?.gstNumber ?? '',
      ...(sgCompliance?.uenNumber != null && { businessPermitNumber: sgCompliance.uenNumber }),
      ...(sgCompliance?.acraNumber != null && { businessTaxOfficeCode: sgCompliance.acraNumber }),

      // Branch-level IRAS data
      ...(sgBranchCompliance?.branchUEN != null && { branchSerialNumber: sgBranchCompliance.branchUEN }),
      branchCode: String(branch.branchCode ?? ''),
      ...(sgBranchCompliance?.tradeLicense != null && { branchPermitNumber: sgBranchCompliance.tradeLicense }),

      // GST status
      isTaxRegistered: sgCompliance?.isGSTRegistered ?? false,
      ...(sgCompliance?.gstEffectiveDate != null && { taxRegistrationDate: sgCompliance.gstEffectiveDate.toISOString() }),

      // Additional Singapore metadata
      metadata: {
        uenNumber: sgCompliance?.uenNumber,
        acraNumber: sgCompliance?.acraNumber,
        entityType: sgCompliance?.entityType,
        gstRate: sgCompliance?.gstRate,
      },
    }
  }

  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  } {
    return {
      business: { singaporeCompliance: true },
      branch: { singaporeBranchCompliance: true },
    }
  }

  populateTransactionSnapshot(data: {
    compliance: ComplianceData
    business: SGBusiness
    branch: SGBranch
    user: UserContext['user']
    currency: string
    customerData?: {
      buyerTaxId?: string
      buyerName?: string
      buyerAddress?: string
      buyerBusinessStyle?: string
    }
    discountData?: {
      scPwdIdNumber?: string
      scPwdName?: string
      scPwdDiscount?: number
    }
  }): Record<string, unknown> {
    const { compliance, business, branch, user, currency, customerData } = data

    // Get current GST rate from compliance or default to 9% (as of 2024)
    const gstRate = ((compliance.metadata as Record<string, unknown>)?.['gstRate'] as number) ?? 9

    return {
      // Universal fields
      snapshotBusinessName: business.name,
      snapshotBranchName: branch.name,
      snapshotBranchAddress: branch.address,
      snapshotBranchSN: compliance.branchSerialNumber ?? branch.serialNumber,
      snapshotCashierName: user.name,
      snapshotCurrency: currency,

      // Singapore-specific IRAS fields
      snapshotGSTNumber: compliance.businessTaxId, // GST Registration Number
      snapshotUENNumber: compliance.businessPermitNumber ?? '', // Unique Entity Number
      snapshotGSTRate: gstRate, // GST rate at time of sale
      snapshotIsGSTRegistered: compliance.isTaxRegistered ?? false,

      // Customer B2B fields (if provided)
      ...(customerData?.buyerTaxId && {
        snapshotCustomerTIN: customerData.buyerTaxId, // Customer's GST/UEN
      }),
    }
  }

  copyRefundSnapshot(context: RefundContext): Record<string, unknown> {
    const { currentUser } = context
    // Cast through the typed snapshot — all fields are known SG snapshot columns
    const original = context.originalTransaction as unknown as SGTransactionSnapshot

    return {
      // Copy universal fields
      snapshotBusinessName: original.snapshotBusinessName,
      snapshotBranchName: original.snapshotBranchName,
      snapshotBranchAddress: original.snapshotBranchAddress,
      snapshotBranchSN: original.snapshotBranchSN,
      snapshotCashierName: currentUser.name, // Current refund processor
      snapshotCurrency: original.snapshotCurrency,

      // Copy Singapore-specific IRAS fields
      snapshotGSTNumber: original.snapshotGSTNumber,
      snapshotUENNumber: original.snapshotUENNumber,
      snapshotGSTRate: original.snapshotGSTRate,
      snapshotIsGSTRegistered: original.snapshotIsGSTRegistered,

      // Copy customer fields if present
      ...(original.snapshotCustomerTIN && {
        snapshotCustomerTIN: original.snapshotCustomerTIN,
      }),
    }
  }

  validateCompliance(compliance: ComplianceData): string[] {
    const missing: string[] = []

    // Required IRAS fields
    if (!compliance.businessTaxId) {
      missing.push('GST Registration Number')
    }

    if (!compliance.businessPermitNumber) {
      missing.push('UEN (Unique Entity Number)')
    }

    if (!compliance.branchCode) {
      missing.push('Branch Code')
    }

    return missing
  }
}
