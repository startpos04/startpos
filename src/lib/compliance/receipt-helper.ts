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
  branchSerialNumber: string | undefined,
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
 * Get country-specific footer text for receipts based on registration status.
 *
 * @param registrationStatus - Business registration status (REGISTERED, UNREGISTERED, PENDING, EXPIRED)
 * @returns Array of footer lines to display on receipt
 *
 * For REGISTERED businesses: Shows official receipt text
 * For UNREGISTERED/PENDING/EXPIRED: Shows sales receipt text (not valid for tax purposes)
 */
export function getReceiptFooterText(registrationStatus?: string): string[] {
  const country = process.env.DEPLOYMENT_COUNTRY?.toUpperCase() ?? 'PH'
  const isRegistered = registrationStatus === 'REGISTERED'

  if (isRegistered) {
    // Official receipt text for registered businesses
    switch (country) {
      case 'PH':
        return ['THIS IS AN OFFICIAL RECEIPT', 'Valid for income tax and VAT purposes', 'Thank you for shopping!']
      case 'SG':
        return ['THIS IS AN OFFICIAL TAX INVOICE', 'Valid for GST purposes', 'Thank you for your purchase!']
      case 'US':
        return ['THIS IS AN OFFICIAL RECEIPT', 'Valid for sales tax purposes', 'Thank you for your business!']
      default:
        return ['THIS IS AN OFFICIAL RECEIPT', 'Thank you!']
    }
  } else {
    // Sales receipt text for unregistered/pending/expired businesses
    const statusText =
      registrationStatus === 'PENDING'
        ? 'Business registration in progress'
        : registrationStatus === 'EXPIRED'
          ? 'Business registration expired'
          : 'Business not yet officially registered'

    switch (country) {
      case 'PH':
        return ['THIS IS A SALES RECEIPT', statusText, 'Not valid for income tax purposes']
      case 'SG':
        return ['THIS IS A SALES RECEIPT', statusText, 'Not valid for GST purposes']
      case 'US':
        return ['THIS IS A SALES RECEIPT', statusText, 'Not valid for sales tax purposes']
      default:
        return ['THIS IS A SALES RECEIPT', statusText, 'Not valid for tax purposes']
    }
  }
}
