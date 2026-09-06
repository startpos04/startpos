/**
 * Compliance Adapter Factory
 *
 * Responsible for selecting and providing the appropriate compliance adapter
 * based on the deployment country (DEPLOYMENT_COUNTRY env var).
 *
 * This is the single point where country selection happens - all other code
 * uses the adapter interface and remains country-agnostic.
 */

import { PhilippinesComplianceAdapter } from './adapters/philippines-adapter'
import { SingaporeComplianceAdapter } from './adapters/singapore-adapter'
import { UsaComplianceAdapter } from './adapters/usa-adapter'
import type { ComplianceAdapter, ComplianceAdapterFactory } from './compliance-adapter'

/**
 * Registry of available adapters by country code.
 */
const adapterRegistry = new Map<string, ComplianceAdapter>([
  ['PH', new PhilippinesComplianceAdapter()],
  ['SG', new SingaporeComplianceAdapter()],
  ['US', new UsaComplianceAdapter()],
])

/**
 * Default adapter factory implementation.
 */
class DefaultComplianceAdapterFactory implements ComplianceAdapterFactory {
  /**
   * Get the deployment country from environment variable.
   * Defaults to 'PH' if not set (backwards compatibility).
   */
  private getDeploymentCountry(): string {
    // Check for DEPLOYMENT_COUNTRY env var (set at build time)
    const deploymentCountry = process.env['DEPLOYMENT_COUNTRY']

    if (deploymentCountry) {
      return deploymentCountry.toUpperCase()
    }

    // Fallback to Philippines (current production deployment)
    return 'PH'
  }

  /**
   * Get the appropriate adapter for the current deployment.
   *
   * @param countryCode - Optional country code override. If not provided, uses DEPLOYMENT_COUNTRY env var.
   * @returns The compliance adapter for the specified country.
   * @throws Error if country code is not recognized.
   */
  getAdapter(countryCode?: string): ComplianceAdapter {
    const country = (countryCode ?? this.getDeploymentCountry()).toUpperCase()

    const adapter = adapterRegistry.get(country)

    if (!adapter) {
      // If unknown country, throw error with helpful message
      const availableCountries = Array.from(adapterRegistry.keys()).join(', ')
      throw new Error(
        `No compliance adapter found for country: ${country}. ` +
          `Available countries: ${availableCountries}. ` +
          `Please check DEPLOYMENT_COUNTRY environment variable or register a custom adapter.`,
      )
    }

    return adapter
  }

  /**
   * Register a custom adapter for a country.
   * Useful for testing or adding new countries without modifying the factory.
   *
   * @param countryCode - Two-letter country code (e.g., 'PH', 'SG', 'US')
   * @param adapter - The adapter instance to register
   */
  registerAdapter(countryCode: string, adapter: ComplianceAdapter): void {
    adapterRegistry.set(countryCode.toUpperCase(), adapter)
  }
}

/**
 * Singleton factory instance.
 * Export this for use throughout the application.
 */
export const complianceAdapterFactory = new DefaultComplianceAdapterFactory()

/**
 * Convenience function to get the current deployment's adapter.
 * This is the primary way application code should access adapters.
 *
 * @example
 * ```typescript
 * const adapter = getComplianceAdapter()
 * const compliance = adapter.extractComplianceData(userContext)
 * ```
 */
export function getComplianceAdapter(countryCode?: string): ComplianceAdapter {
  return complianceAdapterFactory.getAdapter(countryCode)
}

/**
 * Convenience function to get compliance includes for Prisma queries.
 * This simplifies database queries by automatically including the right relations.
 *
 * @example
 * ```typescript
 * const includes = getComplianceIncludes()
 * const business = await prisma.business.findUnique({
 *   where: { id },
 *   include: includes.business,
 * })
 * ```
 */
export function getComplianceIncludes() {
  return getComplianceAdapter().getComplianceIncludes()
}

/**
 * Type guard to check if we're in a specific country deployment.
 * Useful for conditional logic that needs to know the country.
 *
 * @example
 * ```typescript
 * if (isCountryDeployment('PH')) {
 *   // Philippines-specific UI behavior
 * }
 * ```
 */
export function isCountryDeployment(countryCode: string): boolean {
  const adapter = getComplianceAdapter()
  return adapter.countryCode === countryCode.toUpperCase()
}

/**
 * Get the current deployment country code.
 *
 * @returns Two-letter country code (e.g., 'PH', 'SG', 'US')
 */
export function getDeploymentCountry(): string {
  return getComplianceAdapter().countryCode
}
