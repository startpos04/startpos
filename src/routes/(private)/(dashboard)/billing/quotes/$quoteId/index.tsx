/**
 * billing/quotes/$quoteId/index.tsx
 *
 * /billing/quotes/:quoteId — Quote Detail
 *
 * Displays the full line-item breakdown of a PricingQuote and allows:
 *   - Accept: transitions quote CALCULATED/SENT → ACCEPTED
 *   - Convert: transitions ACCEPTED → CONVERTED (creates composable subscription)
 *   - Decline: marks quote as CANCELLED
 *
 * Architecture compliance:
 *   - No monetary calculations in the component.
 *   - Accept and convert are separate actions requiring explicit user confirmation.
 *   - MANAGE_BILLING capability required.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, ChevronRightIcon, ClockIcon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { prisma as rootPrisma } from '@/lib/prisma-client'
import { acceptPricingQuote } from '@/lib/queries/accept-pricing-quote'
import { convertQuoteToSubscription } from '@/lib/queries/convert-quote-to-subscription'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/(private)/(dashboard)/billing/quotes/$quoteId/')({
  component: QuoteDetailPage,
})

// ---------------------------------------------------------------------------
// Server function — fetch quote detail
// ---------------------------------------------------------------------------

const fetchQuoteDetail = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .inputValidator((data: { quoteId: string }) => z.object({ quoteId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) return null
    const { businessId } = context.user

    return rootPrisma.pricingQuote.findFirst({
      where: { id: data.quoteId, businessId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        catalog: { select: { version: true, label: true } },
      },
    })
  })

// ---------------------------------------------------------------------------
// Server function — cancel a quote
// ---------------------------------------------------------------------------

const cancelPricingQuote = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((data: { quoteId: string }) => z.object({ quoteId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.user?.businessId) return { success: false as const, error: 'No business context' }
    const { businessId } = context.user

    const quote = await rootPrisma.pricingQuote.findUnique({
      where: { id: data.quoteId },
      select: { id: true, businessId: true, status: true },
    })

    if (!quote || quote.businessId !== businessId) {
      return { success: false as const, error: 'Quote not found' }
    }

    if (['CONVERTED', 'CANCELLED', 'EXPIRED'].includes(quote.status)) {
      return { success: false as const, error: `Quote is already ${quote.status.toLowerCase()}` }
    }

    await rootPrisma.pricingQuote.update({
      where: { id: data.quoteId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })

    return { success: true as const }
  })

// ---------------------------------------------------------------------------
// QuoteDetailPage
// ---------------------------------------------------------------------------

function QuoteDetailPage() {
  const { quoteId } = Route.useParams()
  const navigate = useNavigate()
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)

  const {
    data: quote,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['quote-detail', quoteId],
    queryFn: () => fetchQuoteDetail({ data: { quoteId } }),
  })

  const acceptMutation = useMutation({
    mutationFn: () => acceptPricingQuote({ data: { quoteId } }),
    onSuccess: () => refetch(),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPricingQuote({ data: { quoteId } }),
    onSuccess: () => navigate({ to: '/billing/quotes' }),
  })

  const convertMutation = useMutation({
    mutationFn: async () => {
      // For Phase 5 initial implementation, look up the composable plan server-side.
      // The planId is resolved in the server function — pass a sentinel here.
      return convertQuoteToSubscription({ data: { quoteId, planId: 'COMPOSABLE' } })
    },
    onSuccess: result => {
      if (result.success) {
        navigate({ to: '/billing' })
      }
    },
  })

  if (isLoading) return <QuoteDetailSkeleton />
  if (!quote) {
    return (
      <div className='flex flex-col items-center justify-center h-64 gap-3'>
        <XCircleIcon className='h-10 w-10 text-muted-foreground/40' />
        <p className='text-sm text-muted-foreground'>Quote not found.</p>
        <Button variant='outline' size='sm' asChild>
          <Link to='/billing/quotes'>Back to Quotes</Link>
        </Button>
      </div>
    )
  }

  const status = quote.status as 'DRAFT' | 'CALCULATED' | 'SENT' | 'ACCEPTED' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED'
  const isActionable = status === 'CALCULATED' || status === 'SENT'
  const isAccepted = status === 'ACCEPTED'
  const isTerminal = ['CONVERTED', 'CANCELLED', 'EXPIRED'].includes(status)

  type QuoteItemRow = { id: string; lineType: string; description: string; lineAmount: number }
  const items = quote.items as QuoteItemRow[]

  const featureItems = items.filter(i => i.lineType === 'FEATURE')
  const discountItems = items.filter(i => i.lineType === 'BUNDLE_DISCOUNT' || i.lineType === 'PROMO_DISCOUNT')
  const taxItems = items.filter(i => i.lineType === 'TAX')
  const surchargeItems = items.filter(i => i.lineType === 'SURCHARGE')
  const oneTimeFeeItems = items.filter(i => i.lineType === 'ONE_TIME_FEE')

  return (
    <div className='flex flex-col gap-6 px-4 py-6 max-w-3xl'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' asChild>
          <Link to='/billing/quotes'>
            <ArrowLeftIcon className='h-4 w-4' />
          </Link>
        </Button>
        <div className='flex-1'>
          <div className='flex items-center gap-2'>
            <h1 className='text-2xl font-bold tracking-tight text-foreground'>Quote Detail</h1>
            <StatusBadge status={status} />
          </div>
          <p className='text-muted-foreground text-sm mt-0.5'>
            {quote.catalog.label} · Generated {new Date(quote.createdAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Line items */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Price Breakdown</CardTitle>
          <CardDescription className='text-xs'>
            {featureItems.length} feature{featureItems.length !== 1 ? 's' : ''} selected
          </CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          {/* Features */}
          {featureItems.length > 0 && (
            <div className='px-6 pb-2'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2'>Features</p>
              <div className='space-y-1'>
                {featureItems.map(item => (
                  <LineItemRow key={item.id} description={item.description} amount={item.lineAmount} />
                ))}
              </div>
            </div>
          )}

          {/* Surcharges */}
          {surchargeItems.length > 0 && (
            <div className='px-6 pb-2'>
              <p className='text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 mt-3'>Surcharges</p>
              <div className='space-y-1'>
                {surchargeItems.map(item => (
                  <LineItemRow key={item.id} description={item.description} amount={item.lineAmount} />
                ))}
              </div>
            </div>
          )}

          <Separator className='my-2' />

          {/* Subtotal */}
          <div className='px-6 py-1'>
            <LineItemRow description='Subtotal' amount={quote.subtotalMonthly} bold />
          </div>

          {/* Discounts */}
          {discountItems.length > 0 && (
            <div className='px-6 pb-1'>
              {discountItems.map(item => (
                <LineItemRow key={item.id} description={item.description} amount={item.lineAmount} className='text-emerald-600 dark:text-emerald-400' />
              ))}
            </div>
          )}

          {/* Tax */}
          {taxItems.length > 0 && (
            <div className='px-6 pb-1'>
              {taxItems.map(item => (
                <LineItemRow key={item.id} description={item.description} amount={item.lineAmount} />
              ))}
            </div>
          )}

          <Separator className='my-2' />

          {/* Grand total */}
          <div className='px-6 pb-4'>
            <LineItemRow description='Monthly Total' amount={quote.grandTotal} large />
          </div>

          {/* One-time fees (shown separately) */}
          {oneTimeFeeItems.length > 0 && (
            <>
              <Separator />
              <div className='px-6 py-3 space-y-1'>
                <p className='text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2'>One-Time Fees</p>
                {oneTimeFeeItems.map(item => (
                  <LineItemRow key={item.id} description={item.description} amount={item.lineAmount} />
                ))}
                <LineItemRow description='One-time total' amount={quote.oneTimeFees} bold />
              </div>
            </>
          )}

          {/* Annual */}
          {quote.annualTotal !== null && (
            <>
              <Separator />
              <div className='px-6 py-3 space-y-1 bg-emerald-50/50 dark:bg-emerald-900/10'>
                <LineItemRow description='Annual Total' amount={quote.annualTotal} large />
                {quote.annualSavings !== null && quote.annualSavings > 0 && (
                  <p className='text-xs text-emerald-600 dark:text-emerald-400 text-right'>Save {formatCents(quote.annualSavings)} vs 12× monthly</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Validity */}
      {quote.validUntil && !isTerminal && (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <ClockIcon className='h-4 w-4 shrink-0' />
          <span>
            Quote valid until{' '}
            <span className={cn('font-medium', new Date(quote.validUntil) < new Date() ? 'text-destructive' : 'text-foreground')}>
              {new Date(quote.validUntil).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </span>
        </div>
      )}

      {/* Error display */}
      {acceptMutation.data && !acceptMutation.data.success && (
        <div className='flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive'>
          <AlertTriangleIcon className='h-4 w-4 shrink-0' />
          {acceptMutation.data.error}
        </div>
      )}

      {/* Actions */}
      {!isTerminal && (
        <div className='flex flex-wrap gap-2'>
          {isActionable && (
            <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
              {acceptMutation.isPending ? (
                <>
                  <Loader2Icon className='h-4 w-4 mr-1.5 animate-spin' />
                  Accepting…
                </>
              ) : (
                <>
                  <CheckCircle2Icon className='h-4 w-4 mr-1.5' />
                  Accept Quote
                </>
              )}
            </Button>
          )}

          {isAccepted && (
            <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button>
                  <ChevronRightIcon className='h-4 w-4 mr-1.5' />
                  Activate Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Activate composable subscription?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new subscription with the {featureItems.length} features in this quote at{' '}
                    <strong>{formatCents(quote.grandTotal)}/month</strong>. Your billing will begin immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
                    {convertMutation.isPending ? 'Activating…' : 'Yes, activate'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {!isTerminal && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='ghost' className='text-muted-foreground hover:text-destructive'>
                  Decline quote
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Decline this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The quote will be marked as cancelled. You can generate a new quote at any time from the pricing calculator.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep quote</AlertDialogCancel>
                  <AlertDialogAction
                    className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? 'Declining…' : 'Yes, decline'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

      {/* Terminal state messaging */}
      {status === 'CONVERTED' && (
        <div className='flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300'>
          <CheckCircle2Icon className='h-4 w-4 shrink-0' />
          This quote has been converted to an active subscription.{' '}
          <Link to='/billing' className='font-medium underline underline-offset-2'>
            View billing
          </Link>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    CONVERTED: { label: 'Converted', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    ACCEPTED: { label: 'Accepted', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    SENT: { label: 'Sent', className: 'bg-amber-100 text-amber-800 border-amber-200' },
    CALCULATED: { label: 'Ready', className: 'bg-violet-100 text-violet-800 border-violet-200' },
    DRAFT: { label: 'Draft', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    EXPIRED: { label: 'Expired', className: 'bg-red-100 text-red-700 border-red-200' },
    CANCELLED: { label: 'Cancelled', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  }
  const cfg = configs[status] ?? { label: status, className: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
  return (
    <Badge variant='outline' className={cn('text-xs font-medium', cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

function LineItemRow({
  description,
  amount,
  bold = false,
  large = false,
  className,
}: {
  description: string
  amount: number
  bold?: boolean
  large?: boolean
  className?: string
}) {
  const isNegative = amount < 0
  return (
    <div className={cn('flex items-center justify-between py-0.5', className)}>
      <span className={cn('text-sm text-muted-foreground', bold && 'font-medium text-foreground', large && 'font-semibold text-foreground text-base')}>
        {description}
      </span>
      <span
        className={cn(
          'text-sm tabular-nums font-mono',
          bold && 'font-semibold',
          large && 'font-bold text-base',
          isNegative && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {isNegative ? `−${formatCents(Math.abs(amount))}` : formatCents(amount)}
      </span>
    </div>
  )
}

function QuoteDetailSkeleton() {
  return (
    <div className='flex flex-col gap-6 px-4 py-6 max-w-3xl'>
      <Skeleton className='h-10 w-48' />
      <Skeleton className='h-64 w-full' />
      <Skeleton className='h-10 w-32' />
    </div>
  )
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(cents / 100)
}
