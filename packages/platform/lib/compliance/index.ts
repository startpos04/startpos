/**
 * Compliance Module
 *
 * Provides country-agnostic compliance adapters for Philippines, Singapore, and USA.
 *
 * ## Usage
 *
 * ### Getting the Current Adapter
 * ```typescript
 * import { getComplianceAdapter } from '@/lib/compliance'
 *
 * const adapter = getComplianceAdapter()
 * const compliance = adapter.extractComplianceData(userContext)
 * ```
 *
 * ### Using in Prisma Queries
 * ```typescript
 * import { getComplianceIncludes } from '@/lib/compliance'
 *
 * const includes = getComplianceIncludes()
 * const business = await prisma.business.findUnique({
 *   where: { id },
 *   include: includes.business,
 * })
 * ```
 *
 * ### Checking Deployment Country
 * ```typescript
 * import { getDeploymentCountry, isCountryDeployment } from '@/lib/compliance'
 *
 * const country = getDeploymentCountry()  // 'PH', 'SG', or 'US'
 *
 * if (isCountryDeployment('PH')) {
 *   // Philippines-specific logic
 * }
 * ```
 *
 * ### Populating Transaction Snapshots
 * ```typescript
 * const adapter = getComplianceAdapter()
 * const snapshotData = adapter.populateTransactionSnapshot({
 *   compliance,
 *   business,
 *   branch,
 *   user,
 *   currency: 'PHP',
 *   customerData: { ... },
 *   discountData: { ... },
 * })
 *
 * await prisma.transaction.create({
 *   data: {
 *     ...baseTransactionData,
 *     ...snapshotData,  // Country-specific fields
 *   },
 * })
 * ```
 *
 * ### Using in Receipts (Client-Side)
 * ```typescript
 * import { getComplianceLines, getTaxRateLabel, getReceiptFooterText } from '@/lib/compliance'
 *
 * const complianceLines = getComplianceLines(user.compliance, user.branch.serialNumber)
 * const taxLabel = getTaxRateLabel()  // 'VAT', 'GST', or 'Sales Tax'
 * const footerText = getReceiptFooterText()
 * ```
 */

// Factory and convenience functions
export {
  complianceAdapterFactory,
  getComplianceAdapter,
  getComplianceIncludes,
  getDeploymentCountry,
  isCountryDeployment,
} from './adapter-factory'

// Adapter implementations
export { PhilippinesComplianceAdapter } from './adapters/philippines-adapter'
export { SingaporeComplianceAdapter } from './adapters/singapore-adapter'
export { UsaComplianceAdapter } from './adapters/usa-adapter'
// Core types and interfaces
export type {
  BaseBranch,
  BaseBusiness,
  ComplianceAdapter,
  ComplianceAdapterFactory,
  ComplianceData,
  RefundContext,
  TransactionSnapshotData,
  UserContext,
} from './compliance-adapter'

// Receipt helpers (client-side)
export {
  getComplianceLines,
  getPermitLabel,
  getPermitValue,
  getReceiptFooterText,
  getTaxIdLabel,
  getTaxIdValue,
  getTaxRateLabel,
} from './receipt-helper'

// Validation utilities
export {
  extractComplianceFromForm,
  getComplianceErrorMessage,
  isComplianceDataComplete,
  validateComplianceData,
} from './validation'
