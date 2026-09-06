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

import type { Prisma } from 'prisma/generated/prisma/client'
import type { ComplianceAdapter, ComplianceData, RefundContext, UserContext } from '../compliance-adapter'

type SingaporeComplianceRecord = {
  gstNumber?: string | null
  uenNumber?: string | null
  acraNumber?: string | null
  isGSTRegistered?: boolean | null
  gstEffectiveDate?: Date | null
  entityType?: string | null
  gstRate?: number | null
}

type SingaporeBranchComplianceRecord = {
  branchUEN?: string | null
  tradeLicense?: string | null
}

export class SingaporeComplianceAdapter implements ComplianceAdapter {
  readonly countryCode = 'SG'

  extractComplianceData(context: UserContext): ComplianceData {
    const { business, branch } = context

    // Extract Singapore-specific compliance data
    const sgCompliance = business['singaporeCompliance'] as SingaporeComplianceRecord | null | undefined
    const sgBranchCompliance = branch['singaporeBranchCompliance'] as SingaporeBranchComplianceRecord | null | undefined

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
    } as ComplianceData
  }

  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  } {
    return {
      business: {
        singaporeCompliance: true,
      } as Prisma.BusinessInclude,
      branch: {
        singaporeBranchCompliance: true,
      } as Prisma.BranchInclude,
    }
  }

  populateTransactionSnapshot(data: {
    compliance: ComplianceData
    business: UserContext['business']
    branch: UserContext['branch']
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
    const { originalTransaction, currentUser } = context

    return {
      // Copy universal fields
      snapshotBusinessName: originalTransaction['snapshotBusinessName'],
      snapshotBranchName: originalTransaction['snapshotBranchName'],
      snapshotBranchAddress: originalTransaction['snapshotBranchAddress'],
      snapshotBranchSN: originalTransaction['snapshotBranchSN'],
      snapshotCashierName: currentUser.name, // Current refund processor
      snapshotCurrency: originalTransaction['snapshotCurrency'],

      // Copy Singapore-specific IRAS fields
      snapshotGSTNumber: originalTransaction['snapshotGSTNumber'],
      snapshotUENNumber: originalTransaction['snapshotUENNumber'],
      snapshotGSTRate: originalTransaction['snapshotGSTRate'],
      snapshotIsGSTRegistered: originalTransaction['snapshotIsGSTRegistered'],

      // Copy customer fields if present
      ...(originalTransaction['snapshotCustomerTIN']
        ? {
            snapshotCustomerTIN: originalTransaction['snapshotCustomerTIN'],
          }
        : {}),
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
