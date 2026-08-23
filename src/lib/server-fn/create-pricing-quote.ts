/**
 * create-pricing-quote.ts
 *
 * Server function: calculate pricing and persist a PricingQuote in CALCULATED status.
 *
 * Flow:
 *   1. Load the active PricingCatalog via PricingCatalogRepository
 *   2. Resolve feature dependencies via PricingEngine.resolveDependencies
 *   3. Calculate pricing via PricingEngine.calculate (FEATURE_BASED strategy)
 *   4. Generate quote data via PricingEngine.generateQuote
 *   5. Persist PricingQuote + PricingQuoteItem rows atomically
 *   6. Return the new quote id and calculated result
 *
 * Architecture:
 *   - Server function — never runs in the browser bundle.
 *   - PricingEngine receives all data as DTOs — no Prisma imports in the engine.
 *   - businessId is always taken from the session context (never from the payload).
 *   - calculatedAt is injected by this function — engine never calls new Date().
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Permissions } from '../authorization/permission-keys'
import { authMiddleware } from '../better-auth/auth-middleware'
import { requirePermission } from '../better-auth/permission-middleware'
import { createPricingCatalogRepositoryWithDeps } from '../billing/pricing/pricing-catalog-repository'
import { PricingEngine } from '../billing/pricing/pricing-engine'
import type { PricingConfig } from '../billing/pricing/types'
import { PricingStrategy } from '../billing/pricing/types'
import { prisma as rootPrisma } from '../prisma-client'

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const CreatePricingQuoteInputSchema = z.object({
  selectedFeatureKeys: z.array(z.string()).min(1, 'Select at least one feature'),
  branchCount: z.number().int().min(1).default(1),
  requestAnnual: z.boolean().default(false),
  promoDiscountPct: z.number().int().min(0).max(10000).default(0),
})

export type CreatePricingQuoteInput = z.infer<typeof CreatePricingQuoteInputSchema>

// ---------------------------------------------------------------------------
// createPricingQuote server function
// ---------------------------------------------------------------------------

export const createPricingQuote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .inputValidator((data: CreatePricingQuoteInput) => CreatePricingQuoteInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) {
      return { success: false as const, error: 'No business context' }
    }

    const { businessId, id: userId } = context.user

    // Load active catalog
    const repo = createPricingCatalogRepositoryWithDeps(rootPrisma as unknown as import('prisma/generated/prisma/client').PrismaClient)
    const catalog = await repo.loadActive()

    if (!catalog) {
      return { success: false as const, error: 'No active pricing catalog found. Please contact support.' }
    }

    // Assemble PricingConfig from SystemConfig defaults
    // For Phase 5 initial implementation, we use sensible defaults.
    // The Application Layer would normally read these from SystemConfig.
    const config: PricingConfig = {
      branchMonthlyRate: 0,
      maxFeatures: 0,
      annualDiscountPct: 1000, // 10% annual discount
      taxRate: 1200, // 12% VAT
      quoteValidityDays: 30,
      partnerMarginPct: 0,
      promoCodeEnabled: data.promoDiscountPct > 0,
    }

    const calculatedAt = new Date().toISOString()

    const calcResult = PricingEngine.calculate(
      data.promoDiscountPct > 0 ? PricingStrategy.PROMOTIONAL : PricingStrategy.FEATURE_BASED,
      {
        businessId,
        selectedFeatureKeys: data.selectedFeatureKeys as import('../entitlement/capability-keys').CapabilityKey[],
        branchCount: data.branchCount,
        requestAnnual: data.requestAnnual,
        promoDiscountPct: data.promoDiscountPct,
        calculatedAt,
      },
      catalog,
      config,
    )

    if (!calcResult.ok) {
      return { success: false as const, error: calcResult.reason }
    }

    const quoteData = PricingEngine.generateQuote(
      calcResult.value,
      {
        businessId,
        selectedFeatureKeys: data.selectedFeatureKeys as import('../entitlement/capability-keys').CapabilityKey[],
        branchCount: data.branchCount,
        requestAnnual: data.requestAnnual,
        calculatedAt,
      },
      catalog.id,
      config.quoteValidityDays,
    )

    // Persist atomically
    const quote = await rootPrisma.$transaction(async tx => {
      const newQuote = await tx.pricingQuote.create({
        data: {
          businessId: quoteData.businessId,
          catalogId: quoteData.catalogId,
          status: 'CALCULATED',
          subtotalMonthly: quoteData.subtotalMonthly,
          discountAmount: quoteData.discountAmount,
          taxAmount: quoteData.taxAmount,
          grandTotal: quoteData.grandTotal,
          annualTotal: quoteData.annualTotal,
          annualSavings: quoteData.annualSavings,
          oneTimeFees: quoteData.oneTimeFees,
          validUntil: quoteData.validUntil,
          generatedBy: userId,
        },
      })

      if (quoteData.items.length > 0) {
        await tx.pricingQuoteItem.createMany({
          data: quoteData.items.map(item => ({
            quoteId: newQuote.id,
            lineType: item.lineType as import('prisma/generated/prisma/enums').QuoteLineType,
            featureKey: item.featureKey ?? null,
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            lineAmount: item.lineAmount,
            negotiatedPrice: item.negotiatedPrice ?? null,
            sortOrder: item.sortOrder,
          })),
        })
      }

      return newQuote
    })

    return {
      success: true as const,
      quoteId: quote.id,
      grandTotal: calcResult.value.grandTotal,
      annualGrandTotal: calcResult.value.annualGrandTotal,
      annualSavings: calcResult.value.annualSavings,
      validUntil: quoteData.validUntil.toISOString(),
    }
  })
