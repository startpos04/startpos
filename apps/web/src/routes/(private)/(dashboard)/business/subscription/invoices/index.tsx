/**
 * billing/invoices/index.tsx
 *
 * /billing/invoices â€” Invoice History
 *
 * Displays a paginated table of all BillingInvoice records for the business:
 *   - Billing period dates
 *   - Status badge (DRAFT / OPEN / PAID / VOID / UNCOLLECTIBLE)
 *   - Total amount
 *   - Due date / paid date
 *   - External invoice link (Stripe-hosted) when available
 *
 * Architecture compliance:
 *   - No monetary calculations in the component â€” all amounts from the server.
 *   - Reads invoice data via fetchInvoices server function (not authStore).
 *   - ADMIN-only page (MANAGE_BILLING capability required).
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Skeleton } from '@platform/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@platform/components/ui/table'
import { cn } from '@platform/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, ClockIcon, ExternalLinkIcon, FileTextIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import type { InvoiceSummaryDTO } from '@/lib/billing/types'
import { fetchInvoices } from '@/lib/server-fn/fetch-invoices'

export const Route = createFileRoute('/(private)/(dashboard)/business/subscription/invoices/')({
  component: InvoicesPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

type InvoiceStatusKey = InvoiceSummaryDTO['status']

type StatusConfig = {
  label: string
  className: string
  icon: React.ReactNode
}

function getStatusConfig(status: InvoiceStatusKey): StatusConfig {
  switch (status) {
    case 'PAID':
      return {
        label: 'Paid',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
        icon: <CheckCircle2Icon className='h-3 w-3' />,
      }
    case 'OPEN':
      return {
        label: 'Open',
        className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
        icon: <ClockIcon className='h-3 w-3' />,
      }
    case 'DRAFT':
      return {
        label: 'Draft',
        className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
        icon: <FileTextIcon className='h-3 w-3' />,
      }
    case 'VOID':
      return {
        label: 'Void',
        className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
        icon: <XCircleIcon className='h-3 w-3' />,
      }
    case 'UNCOLLECTIBLE':
      return {
        label: 'Uncollectible',
        className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300',
        icon: <AlertTriangleIcon className='h-3 w-3' />,
      }
    default:
      return {
        label: String(status),
        className: 'bg-zinc-100 text-zinc-600 border-zinc-200',
        icon: null,
      }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'â€”'
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatPeriod(start: Date | string, end: Date | string): string {
  const s = new Date(start).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const e = new Date(end).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${s} â€“ ${e}`
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

// ---------------------------------------------------------------------------
// InvoicesPage
// ---------------------------------------------------------------------------

function InvoicesPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['billing-invoices', page],
    queryFn: () => fetchInvoices({ page, pageSize: PAGE_SIZE }),
    placeholderData: prev => prev,
  })

  const invoices = data?.invoices ?? []
  const totalItems = data?.totalItems ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const hasNext = page < totalPages
  const hasPrev = page > 1

  return (
    <div className='flex flex-col gap-6 px-4 pb-6 max-w-4xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild>
          <Link to='/business/subscription'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>Invoices</h1>
          <p className='text-muted-foreground text-sm mt-0.5'>Billing history for your subscription.</p>
        </div>
      </div>

      {/* Invoice table card */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg'>Invoice History</CardTitle>
          <CardDescription>
            {totalItems > 0 ? `${totalItems.toLocaleString()} invoice${totalItems === 1 ? '' : 's'} total` : 'No invoices yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          {isLoading ? (
            <InvoiceTableSkeleton />
          ) : isError ? (
            <div className='flex items-center justify-center h-32 text-sm text-muted-foreground'>Failed to load invoices. Please try again.</div>
          ) : invoices.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='hover:bg-transparent'>
                      <TableHead className='pl-6'>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Total</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead className='pr-6 text-right'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map(invoice => (
                      <InvoiceRow key={invoice.id} invoice={invoice} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className='flex items-center justify-between px-6 py-3 border-t'>
                  <p className='text-xs text-muted-foreground'>
                    Page {page} of {totalPages}
                  </p>
                  <div className='flex gap-2'>
                    <Button variant='outline' size='sm' disabled={!hasPrev} onClick={() => setPage(p => p - 1)}>
                      Previous
                    </Button>
                    <Button variant='outline' size='sm' disabled={!hasNext} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvoiceRow
// ---------------------------------------------------------------------------

function InvoiceRow({ invoice }: { invoice: InvoiceSummaryDTO }) {
  const statusConfig = getStatusConfig(invoice.status)

  return (
    <TableRow>
      <TableCell className='pl-6 font-medium text-sm'>{formatPeriod(invoice.billingPeriodStart, invoice.billingPeriodEnd)}</TableCell>
      <TableCell>
        <Badge variant='outline' className={cn('flex w-fit items-center gap-1 text-xs px-2 py-0.5', statusConfig.className)}>
          {statusConfig.icon}
          {statusConfig.label}
        </Badge>
      </TableCell>
      <TableCell className='text-right font-mono text-sm tabular-nums'>{formatCents(invoice.totalAmount)}</TableCell>
      <TableCell className='text-sm text-muted-foreground'>{formatDate(invoice.dueAt)}</TableCell>
      <TableCell className='text-sm text-muted-foreground'>{formatDate(invoice.paidAt)}</TableCell>
      <TableCell className='pr-6 text-right'>
        {invoice.hostedInvoiceUrl ? (
          <Button variant='ghost' size='sm' asChild>
            <a href={invoice.hostedInvoiceUrl} target='_blank' rel='noopener noreferrer'>
              <ExternalLinkIcon className='h-3.5 w-3.5 mr-1.5' />
              View
            </a>
          </Button>
        ) : invoice.externalInvoiceId ? (
          <span className='text-xs text-muted-foreground font-mono'>{invoice.externalInvoiceId.slice(0, 16)}â€¦</span>
        ) : (
          <span className='text-xs text-muted-foreground'>â€”</span>
        )}
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className='flex flex-col items-center justify-center gap-3 py-12 px-6 text-center'>
      <FileTextIcon className='h-10 w-10 text-muted-foreground/40' />
      <div className='space-y-1'>
        <p className='text-sm font-medium text-foreground'>No invoices yet</p>
        <p className='text-xs text-muted-foreground max-w-xs'>
          Invoices are generated automatically at the end of each billing period once external billing is connected.
        </p>
      </div>
      <Button variant='outline' size='sm' asChild>
        <Link to='/business/subscription'>Back to Billing</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvoiceTableSkeleton
// ---------------------------------------------------------------------------

function InvoiceTableSkeleton() {
  return (
    <div className='p-6 space-y-3'>
      {Array.from({ length: 5 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no stable key
        <div key={i} className='flex items-center gap-4'>
          <Skeleton className='h-4 flex-1' />
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-12' />
        </div>
      ))}
    </div>
  )
}
