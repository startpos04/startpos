/**
 * credit-packages.ts
 *
 * Branch Credit Package Configuration
 *
 * Centralized pricing for branch credit top-up packages.
 * TODO: Move to database-driven pricing (PricingCatalog) when credit
 * purchasing becomes more complex or requires A/B testing.
 */

export type BranchCreditPackage = {
  id: string
  credits: number
  price: string
  priceInCents: number
  pricePerCredit: number
  description: string
  popular: boolean
}

/**
 * Branch credit package pricing configuration.
 * All prices in Philippine Pesos (PHP).
 *
 * Pricing Logic:
 * - Based on subscription cost of ₱179/1000 transactions = ₱0.179 per transaction
 * - Credit pricing includes 40%-200% premium for on-demand convenience
 * - Bulk discounts encourage larger purchases
 */
export const BRANCH_CREDIT_PACKAGES: BranchCreditPackage[] = [
  {
    id: '10-credits',
    credits: 10,
    price: '₱5.00',
    priceInCents: 500,
    pricePerCredit: 0.5,
    description: 'Small top-up for occasional overflow',
    popular: false,
  },
  {
    id: '50-credits',
    credits: 50,
    price: '₱20.00',
    priceInCents: 2000,
    pricePerCredit: 0.4,
    description: 'Most popular choice for regular branches',
    popular: true,
  },
  {
    id: '100-credits',
    credits: 100,
    price: '₱35.00',
    priceInCents: 3500,
    pricePerCredit: 0.35,
    description: 'Good value for busy locations',
    popular: false,
  },
  {
    id: '500-credits',
    credits: 500,
    price: '₱150.00',
    priceInCents: 15000,
    pricePerCredit: 0.3,
    description: 'Bulk purchase for high-volume branches',
    popular: false,
  },
  {
    id: '1000-credits',
    credits: 1000,
    price: '₱250.00',
    priceInCents: 25000,
    pricePerCredit: 0.25,
    description: 'Enterprise package for very high-volume operations',
    popular: false,
  },
]

/**
 * Get all available credit packages
 */
export function getBranchCreditPackages(): BranchCreditPackage[] {
  return BRANCH_CREDIT_PACKAGES
}

/**
 * Get a specific credit package by ID
 */
export function getBranchCreditPackageById(id: string): BranchCreditPackage | null {
  return BRANCH_CREDIT_PACKAGES.find(pkg => pkg.id === id) || null
}

/**
 * Get the most popular credit package
 */
export function getPopularCreditPackage(): BranchCreditPackage | null {
  return BRANCH_CREDIT_PACKAGES.find(pkg => pkg.popular) || null
}

/**
 * Validate that a package exists and return pricing info for purchase
 */
export function validateCreditPackagePurchase(packageId: string): {
  valid: boolean
  package?: BranchCreditPackage
  error?: string
} {
  const pkg = getBranchCreditPackageById(packageId)

  if (!pkg) {
    return {
      valid: false,
      error: `Invalid credit package ID: ${packageId}`,
    }
  }

  return {
    valid: true,
    package: pkg,
  }
}
