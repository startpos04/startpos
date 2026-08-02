/**
 * billing/credits/index.tsx
 *
 * /billing/credits — Prepaid Credit Management
 *
 * Displays:
 *   - Current credit balance (large, prominent, sourced from authStore.entitlement.creditBalance)
 *   - Low-balance warning when balance is below CREDIT_LOW_BALANCE_THRESHOLD
 *   - Manual credit grant CTA (ADMIN only — opens a dialog to insert PROMOTIONAL/ADJUSTMENT entries)
 *   - Paginated CreditLedger history table (event type, amount, balance after, date)
 *
 * Architecture compliance:
 *   - No monetary calculations in the component.
 *   - All balance data read from authStore.entitlement (server-assembled) or fetchCreditLedger.
 *   - MANAGE_BILLING capability required — same gate as /billing.
 *   - Only shown when billingModel = PREPAID_CREDITS; other models see a placeholder.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleDollarSignIcon,
  CoinsIcon,
  MinusCircleIcon,
  PlusCircleIcon,
  RotateCcwIcon,
} from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { grantCredits } from '@/lib/queries/grant-credits'
import { type CreditLedgerEntry, fetchCreditLedger } from '@/lib/server-fn/fetch-credit-ledger'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(private)/(dashboard)/billing/credits/')({
  component: CreditsPage,
})

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_BALANCE_DEFAULT_THRESHOLD = 10
const PAGE_SIZE = 30

// ---------------------------------------------------------------------------
// Event type display config
// ---------------------------------------------------------------------------

type EventConfig = {
  label: string
  icon: React.ReactNode
  amountClass: string
  badgeClass: string
}

function getEventConfig(eventType: string, amount: number): EventConfig {
  switch (eventType) {
    case 'CONSUMED':
      return {
        label: 'Checkout',
        icon: <ArrowDownIcon className='h-3.5 w-3.5' />,
        amountClass: 'text-destructive',
        badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300',
      }
    case 'REFUNDED':
      return {
        label: 'Refund',
        icon: <RotateCcwIcon className='h-3.5 w-3.5' />,
        amountClass: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
      }
    case 'PURCHASE':
      return {
        label: 'Purchase',
        icon: <ArrowUpIcon className='h-3.5 w-3.5' />,
        amountClass: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300',
      }
    case 'PROMOTIONAL':
      return {
        label: 'Promotional',
        icon: <CoinsIcon className='h-3.5 w-3.5' />,
        amountClass: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
      }
    case 'ADJUSTMENT':
      return {
        label: 'Adjustment',
        icon: <MinusCircleIcon className='h-3.5 w-3.5' />,
        amountClass: amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
      }
    case 'EXPIRED':
      return {
        label: 'Expired',
        icon: <MinusCircleIcon className='h-3.5 w-3.5' />,
        amountClass: 'text-muted-foreground',
        badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400',
      }
    default:
      return {
        label: eventType,
        icon: <CoinsIcon className='h-3.5 w-3.5' />,
        amountClass: '',
        badgeClass: '',
      }
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Grant Credits Dialog
// ---------------------------------------------------------------------------

const grantSchema = z.object({
  amount: z.number().int().min(1),
  eventType: z.enum(['PROMOTIONAL', 'ADJUSTMENT']),
  note: z.string().max(500).nullable(),
})

function GrantCreditsDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [eventType, setEventType] = useState<'PROMOTIONAL' | 'ADJUSTMENT'>('PROMOTIONAL')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = grantSchema.safeParse({
        amount: Number(amount),
        eventType,
        note: note.trim() || null,
      })
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input')
      }
      const result = await grantCredits({ data: parsed.data })
      if (!result.success) throw new Error(result.error)
      return result
    },
    onSuccess: () => {
      setOpen(false)
      setAmount('')
      setNote('')
      setError(null)
      onSuccess()
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm' className='gap-1.5'>
          <PlusCircleIcon className='h-4 w-4' />
          Add Credits
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Credits</DialogTitle>
          <DialogDescription>
            Manually grant credits to this account. Use Promotional for complimentary credits or Adjustment for corrections.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='grant-amount'>Amount</Label>
            <Input id='grant-amount' type='number' min={1} placeholder='e.g. 50' value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='grant-type'>Type</Label>
            <Select value={eventType} onValueChange={v => setEventType(v as 'PROMOTIONAL' | 'ADJUSTMENT')}>
              <SelectTrigger id='grant-type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='PROMOTIONAL'>Promotional — complimentary grant</SelectItem>
                <SelectItem value='ADJUSTMENT'>Adjustment — balance correction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='grant-note'>
              Note <span className='text-muted-foreground text-xs font-normal'>(optional)</span>
            </Label>
            <Input id='grant-note' placeholder='Reason for grant...' value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
          </div>
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !amount || Number(amount) < 1}>
            {mutation.isPending ? 'Adding…' : 'Add Credits'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Ledger table row
// ---------------------------------------------------------------------------

function LedgerRow({ entry }: { entry: CreditLedgerEntry }) {
  const config = getEventConfig(entry.eventType, entry.amount)
  const sign = entry.amount >= 0 ? '+' : ''

  return (
    <div className='flex items-center justify-between gap-4 py-3'>
      <div className='flex items-center gap-3 min-w-0'>
        <Badge variant='outline' className={cn('flex items-center gap-1 text-xs shrink-0', config.badgeClass)}>
          {config.icon}
          {config.label}
        </Badge>
        <div className='min-w-0'>
          {entry.note && <p className='text-xs text-muted-foreground truncate max-w-[200px]'>{entry.note}</p>}
          <p className='text-xs text-muted-foreground flex items-center gap-1'>
            <CalendarIcon className='h-3 w-3 shrink-0' />
            {formatDate(entry.createdAt)}
          </p>
        </div>
      </div>
      <div className='text-right shrink-0'>
        <p className={cn('text-sm font-semibold tabular-nums', config.amountClass)}>
          {sign}
          {entry.amount} cr
        </p>
        <p className='text-xs text-muted-foreground tabular-nums'>bal: {entry.balanceAfter}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function CreditsPage() {
  const user = useStore(authStore, s => s.user)
  const entitlement = user?.entitlement
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()

  const isAdmin = user?.role === Role.ADMIN || user?.role === Role.SUPERVISOR
  const isPrepaid = entitlement?.creditBalance !== null && entitlement?.creditBalance !== undefined

  const { data, isLoading } = useQuery({
    queryKey: ['credit-ledger', page],
    queryFn: () => fetchCreditLedger({ page, pageSize: PAGE_SIZE }),
    enabled: isPrepaid,
  })

  const currentBalance = data?.currentBalance ?? entitlement?.creditBalance ?? 0
  const entries = data?.entries ?? []
  const totalItems = data?.totalItems ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  // Low-balance threshold — read from systemConfigs if available, fall back to default
  const rawThreshold = (user?.systemConfigs as Record<string, unknown> | undefined)?.['CREDIT_LOW_BALANCE_THRESHOLD']
  const threshold = typeof rawThreshold === 'number' ? rawThreshold : typeof rawThreshold === 'string' ? Number(rawThreshold) : LOW_BALANCE_DEFAULT_THRESHOLD

  const isLow = currentBalance <= threshold
  const isEmpty = currentBalance === 0

  const handleGrantSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['credit-ledger'] })
  }

  // If not a prepaid plan, show a plain placeholder
  if (!isPrepaid) {
    return (
      <div className='flex flex-col gap-6 px-4 py-6 max-w-4xl'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Credits</h1>
          <p className='text-muted-foreground text-sm mt-1'>Prepaid credit balance and history.</p>
        </div>
        <Card className='border-dashed'>
          <CardContent className='py-12 text-center'>
            <CoinsIcon className='h-10 w-10 mx-auto text-muted-foreground/40 mb-3' />
            <p className='text-sm font-medium text-muted-foreground'>Credits are not enabled for your current subscription plan.</p>
            <p className='text-xs text-muted-foreground mt-1'>Switch to a Prepaid Credits plan to use this feature.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-6 px-4 py-6 max-w-4xl'>
      {/* Header */}
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Credits</h1>
          <p className='text-muted-foreground text-sm mt-1'>Prepaid credit balance and transaction history.</p>
        </div>
        {isAdmin && <GrantCreditsDialog onSuccess={handleGrantSuccess} />}
      </div>

      {/* Balance card */}
      <Card className={cn('border', isEmpty && 'border-destructive/50', isLow && !isEmpty && 'border-amber-300/60')}>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-lg flex items-center gap-2'>
              <CircleDollarSignIcon className='h-5 w-5 text-muted-foreground' />
              Current Balance
            </CardTitle>
            {isEmpty && (
              <Badge variant='outline' className='bg-red-100 text-red-700 border-red-200 text-xs'>
                Depleted
              </Badge>
            )}
            {isLow && !isEmpty && (
              <Badge variant='outline' className='bg-amber-100 text-amber-700 border-amber-200 text-xs flex items-center gap-1'>
                <AlertTriangleIcon className='h-3 w-3' />
                Low Balance
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='flex items-end gap-2'>
            <span
              className={cn(
                'text-5xl font-bold tabular-nums tracking-tight',
                isEmpty ? 'text-destructive' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
              )}
            >
              {currentBalance.toLocaleString()}
            </span>
            <span className='text-lg text-muted-foreground mb-1'>credit{currentBalance === 1 ? '' : 's'}</span>
          </div>

          {isEmpty && <p className='text-sm text-destructive'>Balance depleted — add credits to continue processing transactions.</p>}
          {isLow && !isEmpty && (
            <p className='text-sm text-amber-600 dark:text-amber-400'>
              Balance is below the low-balance threshold of {threshold} credits. Top up soon to avoid checkout interruptions.
            </p>
          )}
          {!isLow && !isEmpty && <p className='text-sm text-muted-foreground'>1 credit is consumed per transaction.</p>}
        </CardContent>
      </Card>

      {/* Ledger history */}
      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='text-lg'>Credit History</CardTitle>
              <CardDescription className='text-xs mt-0.5'>All credit events — grants, checkouts, refunds, and adjustments.</CardDescription>
            </div>
            <span className='text-xs text-muted-foreground'>
              {totalItems.toLocaleString()} event{totalItems === 1 ? '' : 's'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map(index => (
                <Skeleton key={index} className='h-12 w-full rounded-md' />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className='py-10 text-center'>
              <CoinsIcon className='h-8 w-8 mx-auto text-muted-foreground/30 mb-2' />
              <p className='text-sm text-muted-foreground'>No credit events yet.</p>
              {isAdmin && <p className='text-xs text-muted-foreground mt-1'>Use "Add Credits" above to grant the first credits.</p>}
            </div>
          ) : (
            <div className='divide-y divide-border'>
              {entries.map(entry => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <>
              <Separator className='mt-4' />
              <div className='flex items-center justify-between pt-3'>
                <p className='text-xs text-muted-foreground'>
                  Page {page} of {totalPages}
                </p>
                <div className='flex items-center gap-1'>
                  <Button variant='ghost' size='icon' className='h-7 w-7' disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label='Previous page'>
                    <ChevronLeftIcon className='h-4 w-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='h-7 w-7'
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    aria-label='Next page'
                  >
                    <ChevronRightIcon className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
