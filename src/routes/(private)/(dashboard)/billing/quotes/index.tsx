/**
 * billing/quotes/index.tsx
 *
 * /billing/quotes — Saved Quote List
 *
 * Displays all PricingQuote records for the business:
 *   - Status badge (DRAFT / CALCULATED / SENT / ACCEPTED / CONVERTED / EXPIRED / CANCELLED)
 *   - Grand total and creation date
 *   - Valid until date
 *   - Link to quote detail
 *
 * Architecture compliance:
 *   - No monetary calculations in the component — all amounts from the server.
 *   - MANAGE_BILLING capability required.
 */

import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon, ClockIcon, FileTextIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma as rootPrisma } from '@/lib/prisma-client'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(private)/(dashboard)/billing/quotes/')({
  component: QuotesPage,
})

// ---------------------------------------------------------------------------
// Server function — fetch quotes for the current business
// ---------------------------------------------------------------------------

const fetchQuotesInputSchema = z.object({ page: z.number().int().min(1).default(1) })

const fetchQuotes = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { page?: number }) => fetchQuotesInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) return { quotes: [], totalItems: 0 }
    const { businessId } = context.user
    const PAGE_SIZE = 20
    const skip = (data.page - 1) * PAGE_SIZE

    const [quotes, totalItems] = await Promise.all([
      rootPrisma.pricingQuote.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          status: true,
          grandTotal: true,
          subtotalMonthly: true,
          discountAmount: true,
          validUntil: true,
          createdAt: true,
          acceptedAt: true,
          convertedAt: true,
          _count: { select: { items: { where: { lineType: 'FEATURE' } } } },
        },
      }),
      rootPrisma.pricingQuote.count({ where: { businessId } }),
    ])

    return { quotes, totalItems }
  })

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

type QuoteStatusKey = 'DRAFT' | 'CALCULATED' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED'

function getStatusConfig(status: QuoteStatusKey) {
  switch (status) {
    case 'CONVERTED':
      return {
        label: 'Converted',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
        icon: <CheckCircle2Icon className='h-3 w-3' />,
      }
    case 'ACCEPTED':
      return {
        label: 'Accepted',
        className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
        icon: <CheckCircle2Icon className='h-3 w-3' />,
      }
    case 'SENT':
      return {
        label: 'Sent',
        className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
        icon: <ClockIcon className='h-3 w-3' />,
      }
    case 'CALCULATED':
      return {
        label: 'Ready',
        className: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300',
        icon: <FileTextIcon className='h-3 w-3' />,
      }
    case 'DRAFT':
      return {
        label: 'Draft',
        className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
        icon: <FileTextIcon className='h-3 w-3' />,
      }
    case 'EXPIRED':
      return {
        label: 'Expired',
        className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
        icon: <XCircleIcon className='h-3 w-3' />,
      }
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
        icon: <XCircleIcon className='h-3 w-3' />,
      }
    default:
      return { label: String(status), className: 'bg-zinc-100 text-zinc-600 border-zinc-200', icon: null }
  }
}

// ---------------------------------------------------------------------------
// QuotesPage
// ---------------------------------------------------------------------------

function QuotesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['billing-quotes'],
    queryFn: () => fetchQuotes({ data: { page: 1 } }),
  })

  const quotes = data?.quotes ?? []
  const totalItems = data?.totalItems ?? 0

  return (
    <div className='flex flex-col gap-6 px-4 py-6 max-w-4xl'>
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild>
          <Link to='/billing'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div>
          <h1 className='text-3xl font-bold tracking-tight text-foreground'>Quotes</h1>
          <p className='text-muted-foreground text-sm mt-0.5'>Saved pricing quotes for your business.</p>
        </div>
        <div className='ml-auto'>
          <Button size='sm' asChild>
            <Link to='/billing/pricing'>
              New Quote <ArrowRightIcon className='h-3.5 w-3.5 ml-1.5' />
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg'>Quote History</CardTitle>
          <CardDescription>{totalItems > 0 ? `${totalItems} quote${totalItems === 1 ? '' : 's'} total` : 'No quotes yet.'}</CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          {isLoading ? (
            <QuoteTableSkeleton />
          ) : isError ? (
            <div className='flex items-center justify-center h-32 text-sm text-muted-foreground'>Failed to load quotes.</div>
          ) : quotes.length === 0 ? (
            <EmptyState />
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow className='hover:bg-transparent'>
                    <TableHead className='pl-6'>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Features</TableHead>
                    <TableHead className='text-right'>Monthly Total</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className='pr-6 text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map(quote => {
                    const statusConfig = getStatusConfig(quote.status as QuoteStatusKey)
                    return (
                      <TableRow key={quote.id}>
                        <TableCell className='pl-6 text-sm text-muted-foreground'>
                          {new Date(quote.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline' className={cn('flex w-fit items-center gap-1 text-xs px-2 py-0.5', statusConfig.className)}>
                            {statusConfig.icon}
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-sm text-muted-foreground'>
                          {quote._count.items} feature{quote._count.items !== 1 ? 's' : ''}
                        </TableCell>
                        <TableCell className='text-right font-mono text-sm tabular-nums'>{formatCents(quote.grandTotal)}</TableCell>
                        <TableCell className='text-sm text-muted-foreground'>
                          {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                        </TableCell>
                        <TableCell className='pr-6 text-right'>
                          <Button variant='ghost' size='sm' asChild>
                            <Link to='/billing/quotes/$quoteId' params={{ quoteId: quote.id }}>
                              View <ArrowRightIcon className='h-3 w-3 ml-1' />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState() {
  return (
    <div className='flex flex-col items-center justify-center gap-3 py-12 px-6 text-center'>
      <RefreshCwIcon className='h-10 w-10 text-muted-foreground/40' />
      <div className='space-y-1'>
        <p className='text-sm font-medium text-foreground'>No quotes yet</p>
        <p className='text-xs text-muted-foreground max-w-xs'>Use the pricing calculator to build a custom plan and generate a quote.</p>
      </div>
      <Button variant='outline' size='sm' asChild>
        <Link to='/billing/pricing'>Open Calculator</Link>
      </Button>
    </div>
  )
}

function QuoteTableSkeleton() {
  return (
    <div className='p-6 space-y-3'>
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
        <div key={i} className='flex items-center gap-4'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-4 w-16' />
          <Skeleton className='h-4 w-12' />
          <Skeleton className='h-4 flex-1' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-12' />
        </div>
      ))}
    </div>
  )
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(cents / 100)
}
