/**
 * save-compliance-data.ts
 *
 * Server function for saving business compliance and registration data.
 *
 * This function:
 * 1. Validates compliance data using the country-specific adapter
 * 2. Updates Business.registrationStatus and registrationCompletedAt
 * 3. Saves to country-specific compliance tables (PhilippinesCompliance, PhilippinesBranchCompliance)
 *
 * Architecture:
 * - Uses crudAPI for tenant-scoped updates (Business has businessId via getTenantPrisma)
 * - Follows offline-first architecture priority
 * - Uses country adapter pattern for validation
 */

import { crudAPI } from '@/lib/prisma-client/crud-api'
import type { BusinessRegistrationStatus } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { getComplianceAdapter } from '@/lib/compliance'
import { extractComplianceFromForm } from '@/lib/compliance/validation'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const SaveComplianceInputSchema = z.object({
  businessId: z.string(),
  registrationStatus: z.enum(['UNREGISTERED', 'PENDING', 'REGISTERED', 'EXPIRED']),
  formData: z.object({
    // Tax Information
    birTin: z.string().optional(),
    rdoCode: z.string().optional(),
    isVatRegistered: z.boolean().optional(),
    vatRegistrationDate: z.string().optional(),

    // Business Permits
    ptuNumber: z.string().optional(),
    ptuIssueDate: z.string().optional(),
    dtiSecNumber: z.string().optional(),

    // Branch Information
    branchSerialNumber: z.string().optional(),
    branchCode: z.string().optional(),
    branchPtuNumber: z.string().optional(),
  }),
  branchId: z.string(),
  countryCode: z.string().default('PH'),
})

export type SaveComplianceInput = z.infer<typeof SaveComplianceInputSchema>

// ---------------------------------------------------------------------------
// save-compliance-data (plain async function per coding standards)
// ---------------------------------------------------------------------------

export async function saveComplianceData(input: SaveComplianceInput) {
  const validated = SaveComplianceInputSchema.parse(input)
  const { businessId, registrationStatus, formData, branchId, countryCode } = validated

  // Extract compliance data from form for validation
  const complianceData = extractComplianceFromForm(formData)

  // Validate using country adapter
  const adapter = getComplianceAdapter()
  const missingFields = adapter.validateCompliance(complianceData)

  // Block REGISTERED status if validation fails
  if (registrationStatus === 'REGISTERED' && missingFields.length > 0) {
    return {
      success: false as const,
      error: `Cannot mark as REGISTERED. Missing required fields: ${missingFields.join(', ')}`,
      missingFields,
    }
  }

  const now = new Date()

  try {
    // Update Business registration status
    const businessResult = await crudAPI.business('update', {
      where: { id: businessId },
      data: {
        registrationStatus: registrationStatus as BusinessRegistrationStatus,
        registrationCompletedAt: registrationStatus === 'REGISTERED' ? now : null,
      },
    })

    if (businessResult.isErr()) {
      return { success: false as const, error: businessResult.error }
    }

    // Save country-specific compliance data
    if (countryCode === 'PH') {
      // Update PhilippinesCompliance (business-level)
      const phComplianceResult = await crudAPI.philippinesCompliance('upsert', {
        where: { businessId },
        update: {
          birTin: formData.birTin ?? null,
          birRdoCode: formData.rdoCode ?? null,
          vatRegistrationDate: formData.vatRegistrationDate ? new Date(formData.vatRegistrationDate) : null,
          birPtuNumber: formData.ptuNumber ?? null,
          birPtuIssuedAt: formData.ptuIssueDate ? new Date(formData.ptuIssueDate) : null,
          dtiRegistration: formData.dtiSecNumber ?? null,
          secRegistration: formData.dtiSecNumber ?? null, // Same field for now
        },
        create: {
          businessId,
          birTin: formData.birTin ?? '',
          birRdoCode: formData.rdoCode ?? null,
          vatRegistrationDate: formData.vatRegistrationDate ? new Date(formData.vatRegistrationDate) : null,
          birPtuNumber: formData.ptuNumber ?? null,
          birPtuIssuedAt: formData.ptuIssueDate ? new Date(formData.ptuIssueDate) : null,
          dtiRegistration: formData.dtiSecNumber ?? null,
          secRegistration: formData.dtiSecNumber ?? null,
        },
      })

      if (phComplianceResult.isErr()) {
        return { success: false as const, error: phComplianceResult.error }
      }

      // Update PhilippinesBranchCompliance (branch-level)
      const phBranchResult = await crudAPI.philippinesBranchCompliance('upsert', {
        where: { branchId },
        update: {
          branchSerialNumber: formData.branchSerialNumber ?? null,
          branchCode: formData.branchCode ?? null,
          ptuNumber: formData.branchPtuNumber ?? null,
          rdoCode: formData.rdoCode ?? null,
        },
        create: {
          branchId,
          branchSerialNumber: formData.branchSerialNumber ?? null,
          branchCode: formData.branchCode ?? null,
          ptuNumber: formData.branchPtuNumber ?? null,
          rdoCode: formData.rdoCode ?? null,
        },
      })

      if (phBranchResult.isErr()) {
        return { success: false as const, error: phBranchResult.error }
      }
    }

    // TODO: Add Singapore and USA compliance table handling when needed

    return {
      success: true as const,
      registrationStatus,
      completedAt: registrationStatus === 'REGISTERED' ? now.toISOString() : null,
    }
  } catch (error) {
    console.error('[saveComplianceData] Failed:', error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to save compliance data',
    }
  }
}
