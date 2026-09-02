/**
 * fetch-invoices.ts
 *
 * Fetches paginated billing invoice history for the session's business.
 *
 * Uses crudAPI â€” BillingInvoice has a `business` relation so getTenantPrisma
 * automatically scopes all queries to context.user.businessId.
 */

import { Permissions } from '@platform/lib/authorization/permission-keys'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { requirePermission } from '@platform/lib/better-auth/permission-middleware'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { InvoiceSummaryDTO } from '../billing/types'

const FetchInvoicesSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
})

export type FetchInvoicesInput = z.infer<typeof FetchInvoicesSchema>

export const fetchInvoices = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BUSINESS_VIEW_BILLING)])
  .inputValidator((input: FetchInvoicesInput) => FetchInvoicesSchema.parse(input))
  .handler(async ({ data }) => {
    const where = {}

    const [rowsResult, countResult] = await Promise.all([
      crudAPI.billingInvoice('findMany', {
        where,
        orderBy: { billingPeriodStart: 'desc' as const },
        skip: (data.page - 1) * data.pageSize,
        take: data.pageSize,
        select: {
          id: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
          status: true,
          subtotalAmount: true,
          taxAmount: true,
          totalAmount: true,
          dueAt: true,
          paidAt: true,
          externalInvoiceId: true,
        },
      }),
      crudAPI.billingInvoice('count', { where }),
    ])

    if (rowsResult.isErr()) throw new Error(rowsResult.error)
    if (countResult.isErr()) throw new Error(countResult.error)

    const invoices: InvoiceSummaryDTO[] = rowsResult.value.map(row => ({
      id: row.id,
      billingPeriodStart: row.billingPeriodStart,
      billingPeriodEnd: row.billingPeriodEnd,
      status: row.status as import('../billing/types').InvoiceStatus,
      subtotalAmount: row.subtotalAmount,
      taxAmount: row.taxAmount,
      totalAmount: row.totalAmount,
      dueAt: row.dueAt,
      paidAt: row.paidAt,
      externalInvoiceId: row.externalInvoiceId,
      hostedInvoiceUrl: null,
      pdfUrl: null,
    }))

    return {
      invoices,
      totalItems: countResult.value,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

export type InvoiceListResponse = Awaited<ReturnType<typeof fetchInvoices>>
