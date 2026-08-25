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

import type { Prisma } from 'prisma/generated/prisma/client'
import type {
  ComplianceAdapter,
  ComplianceData,
  RefundContext,
  UserContext,
} from '../compliance-adapter'

export class UsaComplianceAdapter implements ComplianceAdapter {
  readonly countryCode = 'US'

  extractComplianceData(context: UserContext): ComplianceData {
    const { business, branch } = context
    
    // Extract USA-specific compliance data
    const usCompliance = (business as any).usaCompliance
    const usBranchCompliance = (branch as any).usaBranchCompliance
    
    return {
      // Business-level IRS data
      businessTaxId: usCompliance?.ein ?? '',  // EIN is the primary federal tax ID
      businessPermitNumber: usCompliance?.salesTaxPermit,
      businessTaxOfficeCode: usCompliance?.stateCode,  // State code as tax office identifier
      
      // Branch-level state/local data
      branchSerialNumber: usBranchCompliance?.branchStateTaxId,
      branchCode: branch.branchCode,
      branchPermitNumber: usBranchCompliance?.branchSalesTaxPermit,
      branchTaxOfficeCode: usBranchCompliance?.branchStateCode,
      
      // Sales tax status (most US states require sales tax)
      isTaxRegistered: !!usCompliance?.salesTaxPermit,
      
      // Additional USA metadata
      metadata: {
        stateCode: usCompliance?.stateCode,
        stateTaxId: usCompliance?.stateTaxId,
        businessLicense: usCompliance?.businessLicense,
        incorporationState: usCompliance?.incorporationState,
        countyCode: usBranchCompliance?.countyCode,
        cityCode: usBranchCompliance?.cityCode,
      },
    }
  }

  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  } {
    return {
      business: {
        usaCompliance: true,
      },
      branch: {
        usaBranchCompliance: true,
      },
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
    
    // Get state code and calculate combined sales tax rate
    // In real implementation, this would look up the rate based on state/county/city
    const stateCode = compliance.businessTaxOfficeCode ?? 'CA'  // Default to California
    const salesTaxRate = this.getSalesTaxRate(stateCode)
    
    return {
      // Universal fields
      snapshotBusinessName: business.name,
      snapshotBranchName: branch.name,
      snapshotBranchAddress: branch.address,
      snapshotBranchSN: compliance.branchSerialNumber ?? branch.serialNumber,
      snapshotCashierName: user.name,
      snapshotCurrency: currency,
      
      // USA-specific IRS fields
      snapshotEIN: compliance.businessTaxId,  // Employer Identification Number
      snapshotStateCode: stateCode,
      snapshotStateTaxId: compliance.metadata?.stateTaxId,
      snapshotSalesTaxPermit: compliance.businessPermitNumber,
      snapshotSalesTaxRate: salesTaxRate,  // Combined state + local rate
      
      // Customer B2B fields
      snapshotCustomerEIN: customerData?.buyerTaxId,
      snapshotCustomerStateTaxId: customerData?.buyerBusinessStyle,  // Reuse field for state tax ID
      
      // Tax exemption fields
      snapshotIsTaxExempt: false,  // Default to not exempt
      snapshotTaxExemptCertNo: null,
    }
  }

  copyRefundSnapshot(context: RefundContext): Record<string, unknown> {
    const { originalTransaction, currentUser } = context
    const original = originalTransaction as any
    
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
      snapshotStateCode: original.snapshotStateCode,
      snapshotStateTaxId: original.snapshotStateTaxId,
      snapshotSalesTaxPermit: original.snapshotSalesTaxPermit,
      snapshotSalesTaxRate: original.snapshotSalesTaxRate,
      
      // Copy customer fields
      snapshotCustomerEIN: original.snapshotCustomerEIN,
      snapshotCustomerStateTaxId: original.snapshotCustomerStateTaxId,
      
      // Copy tax exemption fields
      snapshotIsTaxExempt: original.snapshotIsTaxExempt,
      snapshotTaxExemptCertNo: original.snapshotTaxExemptCertNo,
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
   * Get combined sales tax rate for a state.
   * In production, this would query a tax rate database with state/county/city lookup.
   * For now, returns approximate state base rates.
   */
  private getSalesTaxRate(stateCode: string): number {
    // Approximate state base rates (actual rates vary by county/city)
    const stateRates: Record<string, number> = {
      CA: 7.25,  // California
      NY: 4.00,  // New York
      TX: 6.25,  // Texas
      FL: 6.00,  // Florida
      WA: 6.50,  // Washington
      IL: 6.25,  // Illinois
      PA: 6.00,  // Pennsylvania
      OH: 5.75,  // Ohio
      // Add more states as needed
    }
    
    return stateRates[stateCode] ?? 7.00  // Default 7% if state not found
  }
}
