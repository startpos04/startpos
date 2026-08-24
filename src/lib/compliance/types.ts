/**
 * compliance/types.ts
 *
 * Type definitions for Compliance System (Phase 2)
 */

export type CountryCode = 'PH' | 'SG' | 'US'

// Philippines Compliance Data
export type PhilippinesComplianceData = {
  birTin: string
  birPtuNumber?: string | null
  birPtuIssuedAt?: Date | null
  secRegistration?: string | null
  mayorPermit?: string | null
  birRdoCode?: string | null
}

// Singapore Compliance Data
export type SingaporeComplianceData = {
  gstRegistrationNumber: string
  uen: string
  acraNumber?: string | null
}

// USA Compliance Data
export type UsaComplianceData = {
  ein: string
  stateCode: string
  stateTaxId?: string | null
  salesTaxPermit?: string | null
}

// Discriminated union for type-safe compliance data
export type ComplianceData =
  | { country: 'PH'; data: PhilippinesComplianceData }
  | { country: 'SG'; data: SingaporeComplianceData }
  | { country: 'US'; data: UsaComplianceData }

// DTOs for create/update operations
export type CreatePhilippinesComplianceDTO = PhilippinesComplianceData
export type CreateSingaporeComplianceDTO = SingaporeComplianceData
export type CreateUsaComplianceDTO = UsaComplianceData

export type UpdatePhilippinesComplianceDTO = Partial<PhilippinesComplianceData>
export type UpdateSingaporeComplianceDTO = Partial<SingaporeComplianceData>
export type UpdateUsaComplianceDTO = Partial<UsaComplianceData>
