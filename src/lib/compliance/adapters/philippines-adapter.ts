/**
 * Philippines Compliance Adapter
 * 
 * Handles Bureau of Internal Revenue (BIR) compliance requirements for Philippines deployments.
 * 
 * BIR Requirements:
 * - TIN (Tax Identification Number)
 * - PTU (Permit to Use) Number and Issue Date
 * - RDO (Revenue District Office) Code
 * - Branch Serial Number (BIR-issued)
 * - VAT Registration Status
 * - Senior Citizen / PWD discount tracking (RA 9994, RA 10754)
 * - Official Receipt buyer information for B2B transactions
 */

import type { Prisma } from 'prisma/generated/prisma/client'
import type {
  ComplianceAdapter,
  ComplianceData,
  RefundContext,
  UserContext,
} from '../compliance-adapter'

export class PhilippinesComplianceAdapter implements ComplianceAdapter {
  readonly countryCode = 'PH'

  extractComplianceData(context: UserContext): ComplianceData {
    const { business, branch } = context
    
    // Extract Philippines-specific compliance data
    const phCompliance = (business as any).philippinesCompliance
    const phBranchCompliance = (branch as any).philippinesBranchCompliance
    
    return {
      // Business-level BIR data
      businessTaxId: phCompliance?.birTin ?? '',
      businessPermitNumber: phCompliance?.birPtuNumber,
      businessPermitIssuedAt: phCompliance?.birPtuIssuedAt?.toISOString(),
      businessTaxOfficeCode: phCompliance?.birRdoCode,
      
      // Branch-level BIR data
      branchSerialNumber: phBranchCompliance?.branchSerialNumber,
      branchCode: phBranchCompliance?.branchCode ?? branch.branchCode,
      branchPermitNumber: phBranchCompliance?.ptuNumber,
      branchTaxOfficeCode: phBranchCompliance?.rdoCode,
      
      // VAT status
      isTaxRegistered: !!phCompliance?.vatRegistrationDate,
      taxRegistrationDate: phCompliance?.vatRegistrationDate?.toISOString(),
      
      // Additional Philippines metadata
      metadata: {
        secRegistration: phCompliance?.secRegistration,
        mayorPermit: phCompliance?.mayorPermit,
        dtiRegistration: phCompliance?.dtiRegistration,
      },
    }
  }

  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  } {
    return {
      business: {
        philippinesCompliance: true,
      },
      branch: {
        philippinesBranchCompliance: true,
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
    const { compliance, business, branch, user, currency, customerData, discountData } = data
    
    return {
      // Universal fields
      snapshotBusinessName: business.name,
      snapshotBranchName: branch.name,
      snapshotBranchAddress: branch.address,
      snapshotBranchSN: compliance.branchSerialNumber ?? branch.serialNumber,
      snapshotCashierName: user.name,
      snapshotCurrency: currency,
      
      // Philippines-specific BIR fields
      snapshotBusinessTIN: compliance.businessTaxId,
      snapshotBranchCode: compliance.branchCode ?? branch.branchCode,
      snapshotIsVATRegistered: compliance.isTaxRegistered,
      snapshotPTUNumber: compliance.businessPermitNumber,
      snapshotRDOCode: compliance.businessTaxOfficeCode,
      
      // Customer B2B fields (for Official Receipts)
      snapshotCustomerTIN: customerData?.buyerTaxId,
      snapshotBuyerName: customerData?.buyerName,
      snapshotBuyerTIN: customerData?.buyerTaxId,
      snapshotBuyerAddress: customerData?.buyerAddress,
      snapshotBuyerBusinessStyle: customerData?.buyerBusinessStyle,
      
      // Senior Citizen / PWD discount fields (RA 9994, RA 10754)
      snapshotScPwdId: discountData?.scPwdIdNumber,
      snapshotScPwdName: discountData?.scPwdName,
      snapshotScPwdDiscount: discountData?.scPwdDiscount,
    }
  }

  copyRefundSnapshot(context: RefundContext): Record<string, unknown> {
    const { originalTransaction, currentUser } = context
    const original = originalTransaction as any
    
    return {
      // Copy universal fields (but use current cashier for refund processor)
      snapshotBusinessName: original.snapshotBusinessName,
      snapshotBranchName: original.snapshotBranchName,
      snapshotBranchAddress: original.snapshotBranchAddress,
      snapshotBranchSN: original.snapshotBranchSN,
      snapshotCashierName: currentUser.name, // Current refund processor, not original cashier
      snapshotCurrency: original.snapshotCurrency,
      
      // Copy Philippines-specific BIR fields
      snapshotBusinessTIN: original.snapshotBusinessTIN,
      snapshotBranchCode: original.snapshotBranchCode,
      snapshotIsVATRegistered: original.snapshotIsVATRegistered,
      snapshotPTUNumber: original.snapshotPTUNumber,
      snapshotRDOCode: original.snapshotRDOCode,
      
      // Copy customer/buyer fields
      snapshotCustomerTIN: original.snapshotCustomerTIN,
      snapshotBuyerName: original.snapshotBuyerName,
      snapshotBuyerTIN: original.snapshotBuyerTIN,
      snapshotBuyerAddress: original.snapshotBuyerAddress,
      snapshotBuyerBusinessStyle: original.snapshotBuyerBusinessStyle,
      
      // Copy SC/PWD fields (invert discount amount - refund gives back the discount)
      snapshotScPwdId: original.snapshotScPwdId,
      snapshotScPwdName: original.snapshotScPwdName,
      snapshotScPwdDiscount: original.snapshotScPwdDiscount 
        ? -original.snapshotScPwdDiscount  // Invert to negative (refund)
        : null,
    }
  }

  validateCompliance(compliance: ComplianceData): string[] {
    const missing: string[] = []
    
    // Required BIR fields
    if (!compliance.businessTaxId) {
      missing.push('BIR TIN (Tax Identification Number)')
    }
    
    if (!compliance.branchSerialNumber) {
      missing.push('BIR Branch Serial Number')
    }
    
    if (!compliance.branchCode) {
      missing.push('Branch Code')
    }
    
    // PTU is required for VAT-registered businesses
    if (compliance.isTaxRegistered && !compliance.businessPermitNumber) {
      missing.push('BIR PTU (Permit to Use) Number for VAT-registered business')
    }
    
    return missing
  }
}
