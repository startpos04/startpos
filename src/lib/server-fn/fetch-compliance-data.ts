/**
 * fetch-compliance-data.ts
 *
 * Server function for loading business compliance and registration data.
 * 
 * This function:
 * 1. Fetches Business registration status
 * 2. Loads country-specific compliance data from appropriate tables
 * 3. Transforms database records to form-compatible structure
 * 
 * Architecture:
 * - Uses crudAPI for tenant-scoped reads (per coding standards)
 * - Returns form-compatible data structure
 * - Follows offline-first architecture priority
 */

import { z } from 'zod'
import { crudAPI } from '@/lib/prisma-client/crud-api'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const FetchComplianceInputSchema = z.object({
  businessId: z.string(),
  branchId: z.string(),
  countryCode: z.string().default('PH'),
})

export type FetchComplianceInput = z.infer<typeof FetchComplianceInputSchema>

// ---------------------------------------------------------------------------
// fetch-compliance-data (plain async function per coding standards)
// ---------------------------------------------------------------------------

export async function fetchComplianceData(input: FetchComplianceInput) {
  const validated = FetchComplianceInputSchema.parse(input)
  const { businessId, branchId, countryCode } = validated
  
  try {
    // Fetch Business with registration status
    const businessResult = await crudAPI.business('findUnique', {
      where: { id: businessId },
      select: {
        registrationStatus: true,
        registrationCompletedAt: true,
      },
    })
    
    if (businessResult.isErr()) {
      return { success: false as const, error: businessResult.error }
    }
    
    const business = businessResult.value
    
    if (!business) {
      return { success: false as const, error: 'Business not found' }
    }
    
    // Load country-specific compliance data
    let formData = {}
    
    if (countryCode === 'PH') {
      // Fetch PhilippinesCompliance
      const phComplianceResult = await crudAPI.philippinesCompliance('findUnique', {
        where: { businessId },
      })
      
      // Fetch PhilippinesBranchCompliance
      const phBranchResult = await crudAPI.philippinesBranchCompliance('findUnique', {
        where: { branchId },
      })
      
      const phCompliance = phComplianceResult.isOk() ? phComplianceResult.value : null
      const phBranch = phBranchResult.isOk() ? phBranchResult.value : null
      
      formData = {
        // Tax Information
        birTin: phCompliance?.birTin ?? '',
        rdoCode: phCompliance?.birRdoCode ?? '',
        isVatRegistered: !!phCompliance?.vatRegistrationDate,
        vatRegistrationDate: phCompliance?.vatRegistrationDate 
          ? new Date(phCompliance.vatRegistrationDate).toISOString().split('T')[0] 
          : '',
        
        // Business Permits
        ptuNumber: phCompliance?.birPtuNumber ?? '',
        ptuIssueDate: phCompliance?.birPtuIssuedAt 
          ? new Date(phCompliance.birPtuIssuedAt).toISOString().split('T')[0] 
          : '',
        dtiSecNumber: phCompliance?.dtiRegistration ?? phCompliance?.secRegistration ?? '',
        
        // Branch Information
        branchSerialNumber: phBranch?.branchSerialNumber ?? '',
        branchCode: phBranch?.branchCode ?? '',
        branchPtuNumber: phBranch?.ptuNumber ?? '',
      }
    }
    
    // TODO: Add Singapore and USA compliance data handling when needed
    
    return {
      success: true as const,
      registrationStatus: business.registrationStatus,
      registrationCompletedAt: business.registrationCompletedAt?.toISOString() ?? null,
      formData,
    }
  } catch (error) {
    console.error('[fetchComplianceData] Failed:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to fetch compliance data',
    }
  }
}
