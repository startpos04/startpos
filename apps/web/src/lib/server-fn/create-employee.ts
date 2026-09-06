/**
 * create-employee.ts
 *
 * Server function that creates a new employee (User + Membership) for the authenticated business.
 * Enforces employee limits based on plan entitlements and active employee add-ons.
 *
 * Flow:
 *   1. Check current employee count against plan limits and add-ons
 *   2. Create User record with proper business/branch context
 *   3. Create Membership linking the user to the business/branch with specified role
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { prisma as rootPrisma } from '@platform/lib/prisma-client'
import { createServerFn } from '@tanstack/react-start'
import type { Role } from 'prisma/generated/prisma/enums'
import { z } from 'zod'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantContext, requireTenantContext } from '@/lib/better-auth/server-context'

export const CreateEmployeeInputSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  image: z.string().url().optional(),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'CASHIER', 'SERVICE_PROVIDER']),
})

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInputSchema>

export const createEmployee = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_CREATE_EMPLOYEE), requireTenantContext()])
  .inputValidator((data: CreateEmployeeInput) => CreateEmployeeInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { businessId, branchId } = getTenantContext(context).user

    // Check if email is already in use
    const existingUser = await rootPrisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    })

    if (existingUser) {
      return { success: false as const, error: 'Email is already in use' }
    }

    // Check current employee count (users with memberships to this business)
    const currentEmployeeCount = await rootPrisma.membership.count({
      where: {
        user: { deletedAt: null },
        business: { id: businessId },
      },
    })

    // Check employee limit from subscription plan
    const subscription = await rootPrisma.businessSubscription.findUnique({
      where: { businessId },
      select: {
        plan: {
          select: {
            entitlements: {
              where: { featureKey: 'MANAGE_EMPLOYEES' },
              select: { usageLimit: true },
            },
          },
        },
      },
    })

    // Check for employee add-ons
    const activeEmployeeAddons = await rootPrisma.businessSubscriptionAddon.findMany({
      where: {
        businessId,
        addonType: 'EMPLOYEE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: { quantity: true },
    })

    const employeeEntitlement = subscription?.plan.entitlements[0]
    const planEmployeeLimit = employeeEntitlement?.usageLimit ?? 0 // 0 means no access
    const addonEmployeeCount = activeEmployeeAddons.reduce((sum, addon) => sum + addon.quantity, 0)
    const totalEmployeeLimit = planEmployeeLimit === -1 ? -1 : planEmployeeLimit + addonEmployeeCount // -1 means unlimited

    if (totalEmployeeLimit !== -1 && currentEmployeeCount >= totalEmployeeLimit) {
      return {
        success: false as const,
        error: `Employee limit reached. Your plan allows ${totalEmployeeLimit} employee${totalEmployeeLimit === 1 ? '' : 's'}. Consider upgrading your plan or purchasing employee add-ons.`,
      }
    }

    // Create the employee user and membership in a transaction
    const result = await rootPrisma.$transaction(async tx => {
      // Create User record
      const user = await tx.user.create({
        data: {
          name: data.name.trim(),
          email: data.email.toLowerCase().trim(),
          image: data.image?.trim() || null,
          role: data.role as Role,
          emailVerified: false, // Employee will need to verify email separately
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
        },
      })

      // Create Membership linking user to business/branch
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          businessId,
          branchId,
          role: data.role as Role,
        },
        select: {
          id: true,
          role: true,
        },
      })

      return { user, membership }
    })

    return { success: true as const, employee: result }
  })
