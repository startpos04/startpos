/**
 * Compliance Validation Utilities
 * 
 * Provides helper functions for validating compliance data completeness
 * across the application (dashboard cards, settings page, etc.)
 */

import { getComplianceAdapter } from './adapter-factory'
import type { ComplianceData } from './compliance-adapter'

/**
 * Validate compliance data using the appropriate country adapter.
 * 
 * @param compliance - Compliance data to validate
 * @param countryCode - Optional country code (defaults to DEPLOYMENT_COUNTRY)
 * @returns Array of missing required field names, or empty array if valid
 * 
 * @example
 * ```typescript
 * const missingFields = validateComplianceData(complianceData)
 * if (missingFields.length > 0) {
 *   console.error('Missing fields:', missingFields.join(', '))
 * }
 * ```
 */
export function validateComplianceData(
  compliance: ComplianceData,
  countryCode?: string,
): string[] {
  const adapter = getComplianceAdapter(countryCode)
  return adapter.validateCompliance(compliance)
}

/**
 * Check if compliance data is complete (all required fields present).
 * 
 * @param compliance - Compliance data to check
 * @param countryCode - Optional country code (defaults to DEPLOYMENT_COUNTRY)
 * @returns true if all required fields are present, false otherwise
 * 
 * @example
 * ```typescript
 * if (isComplianceDataComplete(complianceData)) {
 *   // Allow marking business as REGISTERED
 * }
 * ```
 */
export function isComplianceDataComplete(
  compliance: ComplianceData,
  countryCode?: string,
): boolean {
  return validateComplianceData(compliance, countryCode).length === 0
}

/**
 * Get a user-friendly error message for missing compliance fields.
 * 
 * @param missingFields - Array of missing field names from validateComplianceData
 * @returns Formatted error message
 * 
 * @example
 * ```typescript
 * const missing = validateComplianceData(complianceData)
 * if (missing.length > 0) {
 *   toast.error(getComplianceErrorMessage(missing))
 * }
 * ```
 */
export function getComplianceErrorMessage(missingFields: string[]): string {
  if (missingFields.length === 0) {
    return 'All required fields are complete'
  }
  
  if (missingFields.length === 1) {
    return `Missing required field: ${missingFields[0]}`
  }
  
  return `Missing required fields: ${missingFields.join(', ')}`
}

/**
 * Extract compliance data from form state.
 * Transforms form data into ComplianceData format for validation.
 * 
 * @param formData - Form data object with compliance fields
 * @returns ComplianceData object
 * 
 * @example
 * ```typescript
 * const compliance = extractComplianceFromForm(formData)
 * const missing = validateComplianceData(compliance)
 * ```
 */
export function extractComplianceFromForm(formData: {
  birTin?: string
  rdoCode?: string
  isVatRegistered?: boolean
  vatRegistrationDate?: string
  ptuNumber?: string
  ptuIssueDate?: string
  dtiSecNumber?: string
  branchSerialNumber?: string
  branchCode?: string
  branchPtuNumber?: string
}): ComplianceData {
  return {
    businessTaxId: formData.birTin?.trim() ?? '',
    businessTaxOfficeCode: formData.rdoCode?.trim(),
    isTaxRegistered: formData.isVatRegistered ?? false,
    taxRegistrationDate: formData.vatRegistrationDate,
    businessPermitNumber: formData.ptuNumber?.trim(),
    businessPermitIssuedAt: formData.ptuIssueDate,
    branchSerialNumber: formData.branchSerialNumber?.trim(),
    branchCode: formData.branchCode?.trim(),
    branchPermitNumber: formData.branchPtuNumber?.trim(),
    metadata: {
      dtiSecRegistration: formData.dtiSecNumber?.trim(),
    },
  }
}
