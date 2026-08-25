/**
 * Receipt Helper for Compliance Display
 * 
 * Provides country-agnostic helpers for displaying compliance information on receipts.
 * Maps the standard user.compliance object to receipt-friendly labels and values.
 */

/**
 * Get the primary tax ID label for receipts based on deployment country.
 * Examples: "VAT REG TIN" (PH), "GST REG" (SG), "EIN" (US)
 */
export function getTaxIdLabel(): string {
  const country = process.env.DEPLOYMENT_COUNTRY?.toUpperCase() ?? 'PH'
  
  switch (country) {
    case 'PH':
      return 'VAT REG TIN'
    case 'SG':
      return 'GST REG'
    case 'US':
      return 'EIN'
    default:
      return 'TAX ID'
  }
}

/**
 * Get the primary tax ID value from user compliance data.
 * This abstracts away the country-specific field names (BIR_TIN, GST number, EIN).
 */
export function getTaxIdValue(compliance: Record<string, string | undefined> | undefined): string {
  if (!compliance) return 'N/A'
  
  // The auth-server adapter already transforms country-specific fields into
  // a standard format where BIR_TIN is used as the primary business tax ID
  // for all countries (it's just named BIR_TIN for backwards compatibility).
  // In a future refactor, we could rename this to just TAX_ID.
  return compliance.BIR_TIN || 'N/A'
}

/**
 * Get the permit/registration number label for receipts.
 * Examples: "PTU NO" (PH), "UEN" (SG), "SALES TAX PERMIT" (US)
 */
export function getPermitLabel(): string {
  const country = process.env.DEPLOYMENT_COUNTRY?.toUpperCase() ?? 'PH'
  
  switch (country) {
    case 'PH':
      return 'PTU NO'
    case 'SG':
      return 'UEN'
    case 'US':
      return 'SALES TAX PERMIT'
    default:
      return 'PERMIT'
  }
}

/**
 * Get the permit/registration number value from user compliance data.
 */
export function getPermitValue(compliance: Record<string, string | undefined> | undefined): string | undefined {
  if (!compliance) return undefined
  
  return compliance.BIR_PTU_NUMBER || undefined
}

/**
 * Get the tax rate label for receipts (VAT, GST, Sales Tax).
 */
export function getTaxRateLabel(): string {
  const country = process.env.DEPLOYMENT_COUNTRY?.toUpperCase() ?? 'PH'
  
  switch (country) {
    case 'PH':
      return 'VAT'
    case 'SG':
      return 'GST'
    case 'US':
      return 'Sales Tax'
    default:
      return 'Tax'
  }
}

/**
 * Get all compliance lines for receipt header.
 * Returns an array of { label, value } objects for display.
 */
export function getComplianceLines(
  compliance: Record<string, string | undefined> | undefined,
  branchSerialNumber: string | undefined
): Array<{ label: string; value: string }> {
  const lines: Array<{ label: string; value: string }> = []
  
  // Always show tax ID
  lines.push({
    label: getTaxIdLabel(),
    value: getTaxIdValue(compliance),
  })
  
  // Show serial number if available (all countries need some form of receipt serial tracking)
  if (branchSerialNumber) {
    lines.push({
      label: 'SN',
      value: branchSerialNumber,
    })
  }
  
  // Show permit/registration number if available
  const permit = getPermitValue(compliance)
  if (permit) {
    lines.push({
      label: getPermitLabel(),
      value: permit,
    })
  }
  
  return lines
}

/**
 * Get country-specific footer text for receipts.
 */
export function getReceiptFooterText(): string[] {
  const country = process.env.DEPLOYMENT_COUNTRY?.toUpperCase() ?? 'PH'
  
  switch (country) {
    case 'PH':
      return [
        'THIS SERVES AS YOUR SALES INVOICE',
        'Thank you for shopping!',
        'Please come again.',
      ]
    case 'SG':
      return [
        'THIS SERVES AS YOUR TAX INVOICE',
        'Thank you for your purchase!',
        'Please visit us again.',
      ]
    case 'US':
      return [
        'THIS SERVES AS YOUR RECEIPT',
        'Thank you for your business!',
        'We appreciate your patronage.',
      ]
    default:
      return [
        'THIS SERVES AS YOUR RECEIPT',
        'Thank you!',
      ]
  }
}
