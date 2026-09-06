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
import type { ComplianceAdapter, ComplianceData, RefundContext, UserContext } from '../compliance-adapter'

// Country-specific compliance record shapes (Prisma relation data)
type PhilippinesComplianceRecord = {
  birTin?: string | null
  birPtuNumber?: string | null
  birPtuIssuedAt?: Date | null
  birRdoCode?: string | null
  vatRegistrationDate?: Date | null
  secRegistration?: string | null
  mayorPermit?: string | null
  dtiRegistration?: string | null
}

type PhilippinesBranchComplianceRecord = {
  branchSerialNumber?: string | null
  branchCode?: string | null
  ptuNumber?: string | null
  rdoCode?: string | null
}

export class PhilippinesComplianceAdapter implements ComplianceAdapter {
  readonly countryCode = 'PH'

  extractComplianceData(context: UserContext): ComplianceData {
    const { business, branch } = context

    // Extract Philippines-specific compliance data
    const phCompliance = business['philippinesCompliance'] as PhilippinesComplianceRecord | null | undefined
    const phBranchCompliance = branch['philippinesBranchCompliance'] as PhilippinesBranchComplianceRecord | null | undefined

    return {
      // Business-level BIR data
      businessTaxId: phCompliance?.birTin ?? '',
      ...(phCompliance?.birPtuNumber != null && { businessPermitNumber: phCompliance.birPtuNumber }),
      ...(phCompliance?.birPtuIssuedAt != null && { businessPermitIssuedAt: phCompliance.birPtuIssuedAt.toISOString() }),
      ...(phCompliance?.birRdoCode != null && { businessTaxOfficeCode: phCompliance.birRdoCode }),

      // Branch-level BIR data
      ...(phBranchCompliance?.branchSerialNumber != null && { branchSerialNumber: phBranchCompliance.branchSerialNumber }),
      branchCode: String(phBranchCompliance?.branchCode ?? branch.branchCode ?? ''),
      ...(phBranchCompliance?.ptuNumber != null && { branchPermitNumber: phBranchCompliance.ptuNumber }),
      ...(phBranchCompliance?.rdoCode != null && { branchTaxOfficeCode: phBranchCompliance.rdoCode }),

      // VAT status
      isTaxRegistered: !!phCompliance?.vatRegistrationDate,
      ...(phCompliance?.vatRegistrationDate != null && { taxRegistrationDate: phCompliance.vatRegistrationDate.toISOString() }),

      // Additional Philippines metadata
      metadata: {
        secRegistration: phCompliance?.secRegistration,
        mayorPermit: phCompliance?.mayorPermit,
        dtiRegistration: phCompliance?.dtiRegistration,
      },
    } as ComplianceData
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

    return {
      // Copy universal fields (but use current cashier for refund processor)
      snapshotBusinessName: originalTransaction['snapshotBusinessName'],
      snapshotBranchName: originalTransaction['snapshotBranchName'],
      snapshotBranchAddress: originalTransaction['snapshotBranchAddress'],
      snapshotBranchSN: originalTransaction['snapshotBranchSN'],
      snapshotCashierName: currentUser.name, // Current refund processor, not original cashier
      snapshotCurrency: originalTransaction['snapshotCurrency'],

      // Copy Philippines-specific BIR fields
      snapshotBusinessTIN: originalTransaction['snapshotBusinessTIN'],
      snapshotBranchCode: originalTransaction['snapshotBranchCode'],
      snapshotIsVATRegistered: originalTransaction['snapshotIsVATRegistered'],
      snapshotPTUNumber: originalTransaction['snapshotPTUNumber'],
      snapshotRDOCode: originalTransaction['snapshotRDOCode'],

      // Copy customer/buyer fields
      snapshotCustomerTIN: originalTransaction['snapshotCustomerTIN'],
      snapshotBuyerName: originalTransaction['snapshotBuyerName'],
      snapshotBuyerTIN: originalTransaction['snapshotBuyerTIN'],
      snapshotBuyerAddress: originalTransaction['snapshotBuyerAddress'],
      snapshotBuyerBusinessStyle: originalTransaction['snapshotBuyerBusinessStyle'],

      // Copy SC/PWD fields (invert discount amount - refund gives back the discount)
      snapshotScPwdId: originalTransaction['snapshotScPwdId'],
      snapshotScPwdName: originalTransaction['snapshotScPwdName'],
      snapshotScPwdDiscount: originalTransaction['snapshotScPwdDiscount']
        ? -(originalTransaction['snapshotScPwdDiscount'] as number) // Invert to negative (refund)
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
