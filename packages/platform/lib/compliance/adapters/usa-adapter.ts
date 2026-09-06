/**
 * USA Compliance Adapter
 *
 * Handles Internal Revenue Service (IRS) and state-level compliance requirements.
 *
 * IRS Requirements:
 * - EIN (Employer Identification Number)
 * - State Tax ID
 * - Sales Tax Permit
 * - State/County/City codes for tax jurisdiction
 * - Combined sales tax rate (state + local)
 * - Tax exemption certificate tracking
 */

import type { Branch, Business, Prisma, USABranchCompliance, USACompliance } from 'prisma/generated/prisma/client'
import type { ComplianceAdapter, ComplianceData, RefundContext, UserContext } from '../compliance-adapter'

/** Business shape expected by this adapter — base fields + USA compliance relation */
type USBusiness = Business & {
  usaCompliance: USACompliance | null
}

/** Branch shape expected by this adapter — base fields + USA branch compliance relation */
type USBranch = Branch & {
  usaBranchCompliance: USABranchCompliance | null
}

/**
 * The subset of USA snapshot fields copied during a refund.
 * Typed so copyRefundSnapshot never needs `as any` on originalTransaction.
 */
interface USTransactionSnapshot {
  snapshotBusinessName: string
  snapshotBranchName: string
  snapshotBranchAddress: string | null
  snapshotBranchSN: string
  snapshotCurrency: string
  snapshotEIN: string | null
  snapshotStateTaxID: string | null
  snapshotSalesTaxRate: number | null
  snapshotIsTaxExempt: boolean | null
  snapshotCustomerTIN?: string | null
  snapshotTaxExemptID?: string | null
}

export class UsaComplianceAdapter implements ComplianceAdapter<USBusiness, USBranch> {
  readonly countryCode = 'US'

  extractComplianceData(context: UserContext<USBusiness, USBranch>): ComplianceData {
    const { business, branch } = context

    // No cast needed — USBusiness and USBranch declare these relations explicitly
    const usCompliance = business.usaCompliance
    const usBranchCompliance = branch.usaBranchCompliance

    return {
      // Business-level IRS data
      businessTaxId: usCompliance?.ein ?? '',
      ...(usCompliance?.salesTaxPermit != null && { businessPermitNumber: usCompliance.salesTaxPermit }),
      ...(usCompliance?.stateOfIncorporation != null && { businessTaxOfficeCode: usCompliance.stateOfIncorporation }),

      // Branch-level state/local data
      ...(usBranchCompliance?.stateTaxID != null && { branchSerialNumber: usBranchCompliance.stateTaxID }),
      branchCode: String(branch.branchCode ?? ''),
      ...(usBranchCompliance?.salesTaxPermit != null && { branchPermitNumber: usBranchCompliance.salesTaxPermit }),

      // Sales tax status (most US states require sales tax)
      isTaxRegistered: usCompliance?.isSalesTaxRegistered ?? false,

      // Additional USA metadata
      metadata: {
        stateTaxID: usCompliance?.stateTaxID,
        stateOfIncorporation: usCompliance?.stateOfIncorporation,
        federalTaxType: usCompliance?.federalTaxType,
        salesTaxRate: usCompliance?.salesTaxRate,
        cityTaxID: usCompliance?.cityTaxID,
      },
    }
  }

  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  } {
    return {
      business: { usaCompliance: true },
      branch: { usaBranchCompliance: true },
    }
  }

  populateTransactionSnapshot(data: {
    compliance: ComplianceData
    business: USBusiness
    branch: USBranch
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

    // Get state and sales tax rate from compliance metadata
    const stateOfIncorporation = compliance.businessTaxOfficeCode ?? 'CA'
    const salesTaxRate = ((compliance.metadata as Record<string, unknown>)?.['salesTaxRate'] as number) ?? this.getDefaultSalesTaxRate(stateOfIncorporation)

    return {
      // Universal fields
      snapshotBusinessName: business.name,
      snapshotBranchName: branch.name,
      snapshotBranchAddress: branch.address,
      snapshotBranchSN: compliance.branchSerialNumber ?? branch.serialNumber,
      snapshotCashierName: user.name,
      snapshotCurrency: currency,

      // USA-specific IRS fields
      snapshotEIN: compliance.businessTaxId, // Employer Identification Number
      snapshotStateTaxID: compliance.metadata?.['stateTaxID'],
      snapshotSalesTaxRate: salesTaxRate, // Rate in cents (e.g., 825 = 8.25%)
      snapshotIsTaxExempt: false, // Default to not exempt (overridden in transaction if needed)

      // Customer B2B fields (if provided)
      ...(customerData?.buyerTaxId && {
        snapshotCustomerTIN: customerData.buyerTaxId, // Customer's EIN or Tax ID
      }),
    }
  }

  copyRefundSnapshot(context: RefundContext): Record<string, unknown> {
    const { currentUser } = context
    // Cast through the typed snapshot — all fields are known USA snapshot columns
    const original = context.originalTransaction as unknown as USTransactionSnapshot

    return {
      // Copy universal fields
      snapshotBusinessName: original.snapshotBusinessName,
      snapshotBranchName: original.snapshotBranchName,
      snapshotBranchAddress: original.snapshotBranchAddress,
      snapshotBranchSN: original.snapshotBranchSN,
      snapshotCashierName: currentUser.name, // Current refund processor
      snapshotCurrency: original.snapshotCurrency,

      // Copy USA-specific IRS fields
      snapshotEIN: original.snapshotEIN,
      snapshotStateTaxID: original.snapshotStateTaxID,
      snapshotSalesTaxRate: original.snapshotSalesTaxRate,
      snapshotIsTaxExempt: original.snapshotIsTaxExempt,

      // Copy customer fields if present
      ...(original.snapshotCustomerTIN && {
        snapshotCustomerTIN: original.snapshotCustomerTIN,
      }),

      // Copy tax exemption ID if present
      ...(original.snapshotTaxExemptID && {
        snapshotTaxExemptID: original.snapshotTaxExemptID,
      }),
    }
  }

  validateCompliance(compliance: ComplianceData): string[] {
    const missing: string[] = []

    // Required IRS fields
    if (!compliance.businessTaxId) {
      missing.push('EIN (Employer Identification Number)')
    }

    if (!compliance.businessTaxOfficeCode) {
      missing.push('State Code')
    }

    if (!compliance.branchCode) {
      missing.push('Branch Code')
    }

    // Sales tax permit required if tax registered
    if (compliance.isTaxRegistered && !compliance.businessPermitNumber) {
      missing.push('Sales Tax Permit')
    }

    return missing
  }

  /**
   * Get default sales tax rate for a state.
   * In production, this would query a tax rate database with state/county/city lookup.
   * Returns rate in cents (e.g., 825 = 8.25%)
   */
  private getDefaultSalesTaxRate(state: string): number {
    // Approximate state base rates in cents (actual rates vary by county/city)
    const stateRates: Record<string, number> = {
      CA: 725, // California 7.25%
      NY: 400, // New York 4.00%
      TX: 625, // Texas 6.25%
      FL: 600, // Florida 6.00%
      WA: 650, // Washington 6.50%
      IL: 625, // Illinois 6.25%
      PA: 600, // Pennsylvania 6.00%
      OH: 575, // Ohio 5.75%
      // Add more states as needed
    }

    return stateRates[state] ?? 700 // Default 7.00% if state not found
  }
}
