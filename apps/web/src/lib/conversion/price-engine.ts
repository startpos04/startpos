import { PriceEngine as PlatformPriceEngine } from '@platform/lib/conversion/price-engine'
import { getAuthenticatedUser } from '../better-auth/auth-store'

/**
 * PriceEngine — extends the platform base with format() which needs authStore.
 * All pure math methods are inherited from @platform/lib/conversion/price-engine.
 */
export const PriceEngine = {
  ...PlatformPriceEngine,

  /** Formats Cents for the UI: 1999 -> "$19.99" */
  format(cents: number): string {
    const user = getAuthenticatedUser()

    return new Intl.NumberFormat(user.configs.LOCALE, {
      style: 'currency',
      currency: user.configs.CURRENCY,
    }).format(this.toDollars(cents))
  },
}
