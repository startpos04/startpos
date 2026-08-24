/**
 * fixtures.ts
 *
 * Reusable DB fixture builders for integration tests.
 *
 * Each function inserts the minimum rows needed to satisfy FK constraints for
 * a given feature area. All functions accept an optional `prisma` argument so
 * callers can pass either the real test client or a transaction client.
 *
 * Usage inside withRollback():
 *
 *   it('processes a sale', () => withRollback(async () => {
 *     const prisma = (await getTestPrisma())!
 *     const ctx = await seedTenant(prisma)
 *     // ctx.businessId, ctx.branchId, ctx.userId, ctx.planId are ready
 *     const product = await seedProduct(prisma, ctx)
 *     // ...run handler, assert DB state...
 *   }))
 *
 * Convention:
 *   - Functions are prefixed with `seed`.
 *   - Each returns a plain object with the IDs / records created.
 *   - IDs use crypto.randomUUID() so parallel tests never collide.
 */

import type { PrismaClient } from 'prisma/generated/prisma/client'

// ---------------------------------------------------------------------------
// Type shorthands
// ---------------------------------------------------------------------------

type AnyPrisma = Pick<
  PrismaClient,
  | 'user'
  | 'business'
  | 'branch'
  | 'membership'
  | 'businessSubscription'
  | 'subscriptionStatusHistory'
  | 'creditLedger'
  | 'configuration'
  | 'product'
  | 'productVariant'
  | 'unit'
  | 'category'
  | 'inventory'
>

// ---------------------------------------------------------------------------
// seedTenant
// Creates the minimal tenant graph: User + Business + Branch + Membership +
// BusinessSubscription (TRIAL) + 50 complimentary credits.
//
// This mirrors what completeRegistration does, but uses Prisma directly so
// integration tests for other features don't depend on the registration
// handler being correct.
// ---------------------------------------------------------------------------

export type TenantFixture = {
  userId: string
  businessId: string
  branchId: string
  subscriptionId: string
  planId: string
}

export async function seedTenant(
  prisma: AnyPrisma,
  overrides: {
    businessType?: 'RETAIL' | 'RESTAURANT' | 'GROCERY'
    planName?: string
  } = {},
): Promise<TenantFixture> {
  const { businessType = 'RETAIL', planName = 'Trial' } = overrides
  const suffix = crypto.randomUUID().slice(0, 8)

  // User
  const user = await (prisma as PrismaClient).user.create({
    data: {
      id: `user-${suffix}`,
      name: 'Test Owner',
      email: `owner-${suffix}@test.com`,
      emailVerified: true,
      role: 'ADMIN',
    },
    select: { id: true },
  })

  // Business
  const business = await (prisma as PrismaClient).business.create({
    data: {
      id: `biz-${suffix}`,
      name: `Test Business ${suffix}`,
      slug: `test-business-${suffix}`,
      businessType: businessType as import('prisma/generated/prisma/enums').BusinessType,
    },
    select: { id: true },
  })

  // Branch
  const branch = await (prisma as PrismaClient).branch.create({
    data: {
      id: `branch-${suffix}`,
      name: 'Main Branch',
      businessId: business.id,
      country: 'PH',
      serialNumber: `SN-${suffix}`,
      minInvoiceNo: 1,
      maxInvoiceNo: 99999,
      branchCode: '00001',
    },
    select: { id: true },
  })

  // Membership
  await (prisma as PrismaClient).membership.create({
    data: {
      userId: user.id,
      businessId: business.id,
      branchId: branch.id,
      role: 'ADMIN',
    },
  })

  // Find or create the requested plan
  let plan = await (prisma as PrismaClient).subscriptionPlan.findFirst({
    where: { name: planName },
    select: { id: true },
  })

  if (!plan) {
    plan = await (prisma as PrismaClient).subscriptionPlan.create({
      data: {
        id: `plan-${planName.toLowerCase()}-${suffix}`,
        name: planName,
        isActive: true,
        sortOrder: 0,
        monthlyPrice: 0,
        includedTxPerMonth: 500,
        overagePerTx: 0,
      },
      select: { id: true },
    })
  }

  // BusinessSubscription (TRIAL)
  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const subscription = await (prisma as PrismaClient).businessSubscription.create({
    data: {
      id: `sub-${suffix}`,
      businessId: business.id,
      planId: plan.id,
      status: 'TRIAL',
      billingModel: 'PREPAID_CREDITS',
      trialEndsAt,
    },
    select: { id: true },
  })

  await (prisma as PrismaClient).subscriptionStatusHistory.create({
    data: {
      subscriptionId: subscription.id,
      fromStatus: null,
      toStatus: 'TRIAL',
      reason: 'Fixture: initial trial',
      triggeredBy: 'system',
    },
  })

  // 50 complimentary credits
  await (prisma as PrismaClient).creditLedger.create({
    data: {
      businessId: business.id,
      eventType: 'PROMOTIONAL',
      amount: 50,
      balanceAfter: 50,
      transactionId: null,
      note: 'Fixture: complimentary credits',
      actorId: user.id,
    },
  })

  return {
    userId: user.id,
    businessId: business.id,
    branchId: branch.id,
    subscriptionId: subscription.id,
    planId: plan.id,
  }
}

// ---------------------------------------------------------------------------
// seedUnit
// Creates a base unit (Piece) for the tenant, used by product variants.
// ---------------------------------------------------------------------------

export type UnitFixture = { unitId: string }

export async function seedUnit(
  prisma: AnyPrisma,
  tenant: TenantFixture,
): Promise<UnitFixture> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const unit = await (prisma as PrismaClient).unit.create({
    data: {
      id: `unit-${suffix}`,
      name: 'Piece',
      abbreviation: 'pc',
      conversionFactor: 1,
      type: 'QUANTITY',
      businessId: tenant.businessId,
      branchId: tenant.branchId,
    },
    select: { id: true },
  })
  return { unitId: unit.id }
}

// ---------------------------------------------------------------------------
// seedProduct
// Creates a Product + single ProductVariant for the tenant.
// ---------------------------------------------------------------------------

export type ProductFixture = {
  productId: string
  variantId: string
  categoryId: string
  unitId: string
}

export async function seedProduct(
  prisma: AnyPrisma,
  tenant: TenantFixture,
  overrides: {
    price?: number        // cents, default 10000 (₱100)
    costPrice?: number    // cents, default 5000  (₱50)
    stock?: number        // units, default 100
  } = {},
): Promise<ProductFixture> {
  const { price = 10000, costPrice = 5000, stock = 100 } = overrides
  const suffix = crypto.randomUUID().slice(0, 8)

  // Category
  const category = await (prisma as PrismaClient).category.create({
    data: {
      id: `cat-${suffix}`,
      name: `Category ${suffix}`,
      businessId: tenant.businessId,
    },
    select: { id: true },
  })

  // Unit
  const { unitId } = await seedUnit(prisma, tenant)

  // Product
  const product = await (prisma as PrismaClient).product.create({
    data: {
      id: `prod-${suffix}`,
      name: `Product ${suffix}`,
      type: 'PHYSICAL_GOOD',
      baseUnitId: unitId,
      categoryId: category.id,
      businessId: tenant.businessId,
      branchId: tenant.branchId,
    },
    select: { id: true },
  })

  // Variant
  const variant = await (prisma as PrismaClient).productVariant.create({
    data: {
      id: `var-${suffix}`,
      productId: product.id,
      name: 'Default',
      price,
      costPrice,
      taxCategory: 'STANDARD',
      isAvailable: true,
      businessId: tenant.businessId,
      branchId: tenant.branchId,
    },
    select: { id: true },
  })

  // Inventory
  if (stock > 0) {
    await (prisma as PrismaClient).inventory.create({
      data: {
        id: `inv-${suffix}`,
        variantId: variant.id,
        unitId,
        quantity: stock,
        costPrice,
        batchNumber: 'DEFAULT',
        businessId: tenant.businessId,
        branchId: tenant.branchId,
      },
    })
  }

  return {
    productId: product.id,
    variantId: variant.id,
    categoryId: category.id,
    unitId,
  }
}

// ---------------------------------------------------------------------------
// seedSupplier
// Creates a Supplier row — needed by purchase workflow tests.
// ---------------------------------------------------------------------------

export type SupplierFixture = { supplierId: string }

export async function seedSupplier(
  prisma: AnyPrisma,
  tenant: TenantFixture,
): Promise<SupplierFixture> {
  const suffix = crypto.randomUUID().slice(0, 8)
  const supplier = await (prisma as PrismaClient).supplier.create({
    data: {
      id: `sup-${suffix}`,
      name: `Supplier ${suffix}`,
      businessId: tenant.businessId,
      branchId: tenant.branchId,
    },
    select: { id: true },
  })
  return { supplierId: supplier.id }
}
