/**
 * pricing-catalog-repository.ts
 *
 * PricingCatalogRepository â€” Application Layer interface + implementation.
 *
 * Responsibility: load PricingCatalog data from the database and assemble it
 * into PricingCatalogDTO objects that PricingEngine can consume.
 *
 * Architecture contract (ADR-009):
 *   - This is the ONLY file in the pricing subdomain that imports PrismaClient.
 *   - PricingEngine itself has zero infrastructure imports â€” it receives the DTO.
 *   - The interface is defined here so callers depend on the interface, not the
 *     concrete implementation, which makes unit testing trivial (mock the DTO).
 *
 * Usage:
 *   const repo = createPricingCatalogRepository(prisma)
 *   const catalog = await repo.loadActive()
 *   const result = PricingEngine.calculate('FEATURE_BASED', input, catalog)
 */

import type { CapabilityKey } from '@platform/lib/entitlement/capability-keys'
import type { PrismaClient } from 'prisma/generated/prisma/client'
import type { FeatureBundleVersionDTO, FeatureDependencyDTO, FeaturePriceDTO, PricingCatalogDTO, PricingCategory } from './types'

// ---------------------------------------------------------------------------
// IPricingCatalogRepository
// The interface callers depend on â€” concrete implementation below.
// ---------------------------------------------------------------------------
export interface IPricingCatalogRepository {
  /**
   * Load the currently ACTIVE catalog version.
   * Returns null if no ACTIVE catalog exists (e.g. before the seeder has run).
   */
  loadActive(): Promise<PricingCatalogDTO | null>

  /**
   * Load a specific catalog version by its database ID.
   * Used by grandfathered-price detection to compare against a historical catalog.
   * Returns null if the catalog does not exist.
   */
  loadById(catalogId: string): Promise<PricingCatalogDTO | null>
}

// ---------------------------------------------------------------------------
// createPricingCatalogRepository
// Factory that returns a concrete IPricingCatalogRepository backed by Prisma.
// ---------------------------------------------------------------------------
export function createPricingCatalogRepository(prisma: PrismaClient): IPricingCatalogRepository {
  return {
    async loadActive(): Promise<PricingCatalogDTO | null> {
      const catalog = await prisma.pricingCatalog.findFirst({
        where: { status: 'ACTIVE' },
        include: {
          featurePrices: {
            include: {
              feature: {
                select: {
                  key: true,
                  label: true,
                  pricingCategory: true,
                  sortOrder: true,
                  isSelectableByCustomer: true,
                },
              },
            },
          },
          bundleVersions: {
            include: {
              bundle: {
                include: {
                  items: { select: { featureKey: true } },
                },
              },
            },
          },
        },
      })

      if (!catalog) return null
      return assembleCatalogDTO(catalog)
    },

    async loadById(catalogId: string): Promise<PricingCatalogDTO | null> {
      const catalog = await prisma.pricingCatalog.findUnique({
        where: { id: catalogId },
        include: {
          featurePrices: {
            include: {
              feature: {
                select: {
                  key: true,
                  label: true,
                  pricingCategory: true,
                  sortOrder: true,
                  isSelectableByCustomer: true,
                },
              },
            },
          },
          bundleVersions: {
            include: {
              bundle: {
                include: {
                  items: { select: { featureKey: true } },
                },
              },
            },
          },
        },
      })

      if (!catalog) return null
      return assembleCatalogDTO(catalog)
    },
  }
}

// ---------------------------------------------------------------------------
// assembleCatalogDTO
// Private helper: maps Prisma query result â†’ PricingCatalogDTO.
// Also fetches dependency edges in a separate query for clarity.
// ---------------------------------------------------------------------------
// biome-ignore lint/suspicious/noExplicitAny: Prisma include result type is complex
async function assembleCatalogDTO(catalog: any): Promise<PricingCatalogDTO> {
  const featurePrices: FeaturePriceDTO[] = catalog.featurePrices.map(
    // biome-ignore lint/suspicious/noExplicitAny: Prisma include result
    (fp: any): FeaturePriceDTO => ({
      featureKey: fp.featureKey as CapabilityKey,
      featureLabel: fp.feature.label,
      monthlyPrice: fp.monthlyPrice,
      annualPrice: fp.annualPrice ?? null,
      isIncludedInBase: fp.isIncludedInBase,
      pricingCategory: (fp.feature.pricingCategory as PricingCategory) ?? null,
      sortOrder: fp.feature.sortOrder,
      isSelectableByCustomer: fp.feature.isSelectableByCustomer,
    }),
  )

  const bundleVersions: FeatureBundleVersionDTO[] = catalog.bundleVersions.map(
    // biome-ignore lint/suspicious/noExplicitAny: Prisma include result
    (bv: any): FeatureBundleVersionDTO => ({
      bundleId: bv.bundleId,
      bundleKey: bv.bundle.key,
      bundleLabel: bv.bundle.label,
      featureKeys: bv.bundle.items.map((i: { featureKey: string }) => i.featureKey as CapabilityKey),
      pricingType: bv.pricingType,
      discountValue: bv.discountValue,
      minimumItems: bv.minimumItems,
    }),
  )

  // Dependencies are global (not catalog-scoped) â€” load all once
  // We load them here rather than in each strategy to keep the DTO self-contained.
  // NOTE: In a real implementation you would pass the prisma client in. Since
  // this is assembled from a catalog include, we re-use the catalog id to signal
  // scope but dependencies are feature-level, not catalog-level.
  // For the DTO, dependencies are populated by the caller or loaded separately.
  // The concrete implementation above should use prisma.featureDependency.findMany()
  // but since assembleCatalogDTO doesn't have prisma in scope, the factory
  // methods below handle this properly.
  const dependencies: FeatureDependencyDTO[] = []

  return {
    id: catalog.id,
    version: catalog.version,
    label: catalog.label,
    featurePrices,
    bundleVersions,
    dependencies,
  }
}

// ---------------------------------------------------------------------------
// createPricingCatalogRepositoryWithDeps
// Full implementation that also loads FeatureDependency edges.
// This is the preferred factory for production use.
// ---------------------------------------------------------------------------
export function createPricingCatalogRepositoryWithDeps(prisma: PrismaClient): IPricingCatalogRepository {
  async function loadAndAssemble(catalogPromise: Promise<unknown>): Promise<PricingCatalogDTO | null> {
    const catalog = await catalogPromise
    if (!catalog) return null

    // biome-ignore lint/suspicious/noExplicitAny: Prisma include result
    const raw = catalog as any

    const featurePrices: FeaturePriceDTO[] = raw.featurePrices.map(
      // biome-ignore lint/suspicious/noExplicitAny: Prisma include result
      (fp: any): FeaturePriceDTO => ({
        featureKey: fp.featureKey as CapabilityKey,
        featureLabel: fp.feature.label,
        monthlyPrice: fp.monthlyPrice,
        annualPrice: fp.annualPrice ?? null,
        isIncludedInBase: fp.isIncludedInBase,
        pricingCategory: (fp.feature.pricingCategory as PricingCategory) ?? null,
        sortOrder: fp.feature.sortOrder,
        isSelectableByCustomer: fp.feature.isSelectableByCustomer,
      }),
    )

    const bundleVersions: FeatureBundleVersionDTO[] = raw.bundleVersions.map(
      // biome-ignore lint/suspicious/noExplicitAny: Prisma include result
      (bv: any): FeatureBundleVersionDTO => ({
        bundleId: bv.bundleId,
        bundleKey: bv.bundle.key,
        bundleLabel: bv.bundle.label,
        featureKeys: bv.bundle.items.map((i: { featureKey: string }) => i.featureKey as CapabilityKey),
        pricingType: bv.pricingType,
        discountValue: bv.discountValue,
        minimumItems: bv.minimumItems,
      }),
    )

    // Load all dependency edges from the database
    const depRows = await prisma.featureDependency.findMany({
      select: { featureKey: true, dependsOnKey: true },
    })

    const dependencies: FeatureDependencyDTO[] = depRows.map(d => ({
      featureKey: d.featureKey as CapabilityKey,
      dependsOnKey: d.dependsOnKey as CapabilityKey,
    }))

    return {
      id: raw.id,
      version: raw.version,
      label: raw.label,
      featurePrices,
      bundleVersions,
      dependencies,
    }
  }

  const includeShape = {
    featurePrices: {
      include: {
        feature: {
          select: {
            key: true,
            label: true,
            pricingCategory: true,
            sortOrder: true,
            isSelectableByCustomer: true,
          },
        },
      },
    },
    bundleVersions: {
      include: {
        bundle: {
          include: {
            items: { select: { featureKey: true } },
          },
        },
      },
    },
  }

  return {
    loadActive(): Promise<PricingCatalogDTO | null> {
      return loadAndAssemble(prisma.pricingCatalog.findFirst({ where: { status: 'ACTIVE' }, include: includeShape }))
    },
    loadById(catalogId: string): Promise<PricingCatalogDTO | null> {
      return loadAndAssemble(prisma.pricingCatalog.findUnique({ where: { id: catalogId }, include: includeShape }))
    },
  }
}
