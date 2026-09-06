/**
 * Compliance Adapter Interface
 *
 * Provides country-agnostic abstraction for compliance data access.
 * Each country has its own adapter implementation that knows how to:
 * - Fetch compliance data from country-specific tables
 * - Transform it into a standard format
 * - Populate transaction snapshots with country-specific fields
 *
 * This allows the same codebase to work across Philippines, Singapore, and USA
 * deployments without hardcoding country-specific logic.
 */

import type { Prisma } from 'prisma/generated/prisma/client'

/**
 * Standard compliance data structure used throughout the application.
 * Each country adapter transforms its specific compliance data into this format.
 */
export interface ComplianceData {
  // Business-level compliance IDs (TIN, GST, EIN, etc.)
  businessTaxId: string
  businessPermitNumber?: string
  businessPermitIssuedAt?: string
  businessTaxOfficeCode?: string

  // Branch-level compliance IDs
  branchSerialNumber?: string
  branchCode?: string
  branchPermitNumber?: string
  branchTaxOfficeCode?: string

  // VAT/GST/Sales Tax status
  isTaxRegistered: boolean
  taxRegistrationDate?: string

  // Additional country-specific data (stored as JSON for flexibility)
  metadata?: Record<string, unknown>
}

/**
 * Transaction snapshot data that gets captured at point of sale.
 * Each country adapter knows how to populate these fields.
 */
export interface TransactionSnapshotData {
  // Universal fields (all countries need these)
  snapshotBusinessName: string
  snapshotBranchName: string
  snapshotBranchAddress: string | null
  snapshotBranchSN: string
  snapshotCashierName: string
  snapshotCurrency: string

  // Country-specific fields (populated by adapter)
  // These are Prisma's country-specific injected fields
  [key: string]: unknown
}

/**
 * Base shape for the business context passed to adapters.
 * Country adapters extend this with their specific compliance relations.
 */
export interface BaseBusiness {
  id: string
  name: string
  countryCode: string
}

/**
 * Base shape for the branch context passed to adapters.
 * Country adapters extend this with their specific compliance relations.
 */
export interface BaseBranch {
  id: string
  name: string
  address: string | null
  serialNumber: string
  branchCode: string
}

/**
 * User context passed to adapters.
 * Contains the data from auth-server that adapters need to extract compliance info.
 *
 * TBusiness and TBranch are generic parameters that let each country adapter
 * declare the exact shape it expects (with its Prisma relations included),
 * eliminating any cast to `any`.
 */
export interface UserContext<TBusiness extends BaseBusiness = BaseBusiness, TBranch extends BaseBranch = BaseBranch> {
  business: TBusiness
  branch: TBranch
  user: {
    id: string
    name: string | null
    email: string
    [key: string]: unknown
  }
}

/**
 * Refund context for copying compliance snapshots from original transaction.
 */
export interface RefundContext {
  originalTransaction: {
    [key: string]: unknown // Contains all snapshot fields
  }
  currentUser: {
    name: string | null
  }
}

/**
 * Base Compliance Adapter Interface.
 * All country-specific adapters must implement this interface.
 *
 * TBusiness and TBranch allow each country adapter to declare the exact
 * Prisma shape it expects (e.g. Business & { philippinesCompliance: ... })
 * so that extractComplianceData never needs to cast to `any`.
 */
export interface ComplianceAdapter<TBusiness extends BaseBusiness = BaseBusiness, TBranch extends BaseBranch = BaseBranch> {
  /**
   * Country code for this adapter (PH, SG, US)
   */
  readonly countryCode: string

  /**
   * Extract compliance data from user context (auth layer).
   * Transforms country-specific compliance tables into standard ComplianceData format.
   */
  extractComplianceData(context: UserContext<TBusiness, TBranch>): ComplianceData

  /**
   * Build Prisma include object for fetching compliance relations.
   * Each adapter knows which relations to include for its country.
   */
  getComplianceIncludes(): {
    business: Prisma.BusinessInclude
    branch: Prisma.BranchInclude
  }

  /**
   * Populate transaction snapshot fields for a new sale.
   * Returns an object with country-specific snapshot fields.
   */
  populateTransactionSnapshot(data: {
    compliance: ComplianceData
    business: TBusiness
    branch: TBranch
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
  }): Record<string, unknown>

  /**
   * Copy compliance snapshot fields for a refund transaction.
   * Returns an object with country-specific snapshot fields copied from original.
   */
  copyRefundSnapshot(context: RefundContext): Record<string, unknown>

  /**
   * Validate compliance data completeness.
   * Returns array of missing required fields, or empty array if valid.
   */
  validateCompliance(compliance: ComplianceData): string[]
}

/**
 * Adapter factory - selects the appropriate adapter based on deployment country.
 * Uses DEPLOYMENT_COUNTRY environment variable or falls back to countryCode from business.
 */
export interface ComplianceAdapterFactory {
  /**
   * Get the appropriate adapter for the current deployment.
   *
   * @param countryCode - Optional country code override. If not provided, uses DEPLOYMENT_COUNTRY env var.
   */
  getAdapter(countryCode?: string): ComplianceAdapter

  /**
   * Register a custom adapter for a country.
   * Useful for testing or adding new countries without modifying the factory.
   */
  registerAdapter(countryCode: string, adapter: ComplianceAdapter): void
}
