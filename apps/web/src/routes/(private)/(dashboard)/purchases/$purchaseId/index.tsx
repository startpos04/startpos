/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */

import { AlertPrompt } from '@platform/components/custom/prompt/alert-prompt'
import { WarningPrompt } from '@platform/components/custom/prompt/warning-prompt'
import Tab from '@platform/components/custom/tab'
import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { purchaseCollection } from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import dayjs from '@platform/lib/dayjs'
import type { MountProps } from '@platform/lib/mount-manager'
import MountManager from '@platform/lib/mount-manager'
import { cn } from '@platform/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { CheckCircle2, Package, ShoppingCart, Undo2, X } from 'lucide-react'
import { PurchaseStatus } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { authStore } from '@/lib/better-auth/auth-store'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { createGoodsReceipt } from '@/lib/queries/create-goods-receipt'
import { type fePurchase, fetchPurchases } from '@/lib/queries/fetch-purchases'
import { voidPurchase } from '@/lib/queries/void-purchase'
import { getPurchaseStatusUIMetadata, purchaseWorkflow } from '@/lib/server-fn/purchase-workflow'
import { closePurchaseSidebar } from '../-components/purchase-sidebar'
import { DetailsTab } from './-details-tab'
import { ItemsTab } from './-items-tab'
import { ReceiptsTab } from './-receipts-tab'

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(private)/(dashboard)/purchases/$purchaseId/' as any)({
  loader: ({ params }: { params: { purchaseId: string } }) => ({ purchaseId: params.purchaseId }),
  component: () => <RouteComponent />,
})

// ─── Sidebar export (used by list page) ──────────────────────────────────────

interface PurchaseDetailsSidebarProps extends Omit<MountProps, 'onClose'> {
  purchaseId: string
  onClose?: () => void
}

export function PurchaseDetailsSidebar({ open: _open, purchaseId, onClose }: PurchaseDetailsSidebarProps) {
  return <RouteComponent purchaseId={purchaseId} onClose={onClose} />
}

// ─── Workflow action handler ──────────────────────────────────────────────────

async function handlePurchaseTransition(purchase: fePurchase, targetStatus: PurchaseStatus, user: { id: string; role: string }): Promise<boolean> {
  // Re-validate with purchaseWorkflow before entering the transaction
  const check = purchaseWorkflow.canTransition(purchase.status, targetStatus, {
    userRole: user.role,
    userId: user.id,
  })
  if (!check.ok) {
    toast.error(check.reason)
    return false
  }

  if (targetStatus === PurchaseStatus.VOIDED) {
    const { error } = await voidPurchase(purchase.id)
    if (error) {
      MountManager.show(AlertPrompt, {
        title: 'Void Purchase Failed',
        description: `Unable to void purchase: ${error.message}`,
        btnText: 'OK',
      })
      return false
    }
    toast.success(`${purchase.purchaseId} has been voided`)
    return true
  }

  // E4 change: APPROVED â†’ RECEIVED now creates a GRN at PENDING instead of
  // directly crediting inventory. Inventory credit happens when the GRN is confirmed.
  // The "Confirm Goods Received" button becomes "Receive Goods" which creates the GRN.
  if (targetStatus === PurchaseStatus.RECEIVED) {
    const { data, error } = await createGoodsReceipt({ purchaseId: purchase.id })
    if (error || !data) {
      MountManager.show(AlertPrompt, {
        title: 'Goods Receipt Failed',
        description: `Unable to create goods receipt: ${error?.message ?? 'Unknown error'}`,
        btnText: 'OK',
      })
      return false
    }
    toast.success(`Goods receipt created for ${purchase.purchaseId} — confirm it to credit inventory`)
    return true
  }

  // All other transitions (PENDING_APPROVAL â†’ APPROVED, PENDING_APPROVAL â†’ DRAFT,
  // RECEIVED â†’ CLOSED): simple status update
  const result = await dbTransaction(() => {
    purchaseCollection.update(purchase.id, draft => {
      draft.status = targetStatus
      draft.updatedAt = new Date()
    })
    return { ok: true }
  })

  if (result.isErr()) {
    toast.error(`Failed to update purchase: ${result.error.message}`)
    return false
  }

  const { label } = getPurchaseStatusUIMetadata(targetStatus)
  toast.success(`${purchase.purchaseId} â†’ ${label}`)
  return true
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RouteComponentProps {
  purchaseId?: string
  onClose?: (() => void) | undefined
}

function RouteComponent({ purchaseId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context
  const loaderData = propId ? null : Route.useLoaderData()
  const purchaseId = propId ?? loaderData?.purchaseId ?? ''

  const user = useStore(authStore, state => state.user)
  const { data: purchases = [], isLoading } = fetchPurchases()
  const purchase = purchases.find(p => p.id === purchaseId)

  const handleClose = () => {
    if (onClose) onClose()
    else closePurchaseSidebar()
  }

  const handleTransition = (targetStatus: PurchaseStatus) => {
    if (!purchase || !user) return

    const isDestructive = targetStatus === PurchaseStatus.VOIDED

    if (isDestructive) {
      const isAlreadyReceived = purchase.status === PurchaseStatus.RECEIVED
      MountManager.show(WarningPrompt, {
        title: targetStatus === PurchaseStatus.VOIDED ? 'Void Purchase' : 'Cancel Purchase',
        btnText: targetStatus === PurchaseStatus.VOIDED ? 'Void Purchase' : 'Cancel Purchase',
        description: isAlreadyReceived
          ? `Void ${purchase.purchaseId}? This will reverse the inventory received and cannot be undone.`
          : `Cancel ${purchase.purchaseId}? This purchase has not yet been received.`,
        onConfirm: async () => {
          return handlePurchaseTransition(purchase, targetStatus, user)
        },
      })
      return
    }

    handlePurchaseTransition(purchase, targetStatus, user).then(() => {
      // non-destructive transitions complete silently; no close needed
    })
  }

  if (isLoading) return <div className='p-6 m-4 animate-pulse bg-muted rounded-xl h-40' />

  if (!purchase) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-3 text-muted-foreground'>
        <Package className='size-8 opacity-30' />
        <p className='text-sm'>Purchase not found.</p>
      </div>
    )
  }

  const { label: statusLabel, colorClass: statusColorClass } = getPurchaseStatusUIMetadata(purchase.status)
  const isTerminal = purchaseWorkflow.isTerminal(purchase.status)

  const allowedActions = user ? purchaseWorkflow.allowedTransitions(purchase.status, { userRole: user.role, userId: user.id }) : []

  const primaryActions = allowedActions.filter(a => a.meta.variant !== 'destructive')
  const destructiveActions = allowedActions.filter(a => a.meta.variant === 'destructive')

  // Build tab list — show Receipts tab whenever the purchase is APPROVED or beyond
  const showReceiptsTab =
    purchase.status === PurchaseStatus.APPROVED || purchase.status === PurchaseStatus.RECEIVED || purchase.status === PurchaseStatus.CLOSED

  const tabs = [
    { label: 'Items', Component: ItemsTab, purchase },
    { label: 'Details', Component: DetailsTab, purchase },
    ...(showReceiptsTab && user ? [{ label: 'Receipts', Component: ReceiptsTab, purchase, user }] : []),
  ]

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2.5'>
          <div className='h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0'>
            <ShoppingCart className='size-4 text-primary' />
          </div>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight font-mono'>{purchase.purchaseId}</h2>
              <Badge variant='outline' className={cn('text-[10px] py-0 h-4', statusColorClass)}>
                {statusLabel}
              </Badge>
            </div>
            <p className='text-xs text-muted-foreground mt-0.5'>
              {purchase.supplier?.name ?? 'No supplier'} · {dayjs(purchase.createdAt).format('MMM DD, YYYY')}
            </p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Stats row */}
      <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20 shrink-0'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Cost</p>
          <p className='text-sm font-black font-mono text-primary'>{PriceEngine.format(purchase.totalCost)}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Lines</p>
          <p className='text-sm font-black'>{purchase.items.length}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Date</p>
          <p className='text-sm font-black'>{dayjs(purchase.createdAt).format('MMM DD')}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <Badge variant='secondary' className={cn('text-[10px] font-medium', statusColorClass)}>
            {purchase.supplier?.name ?? statusLabel}
          </Badge>
        </div>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <Tab defaultValue='Items' tabs={tabs} />
      </div>

      {/* Footer — workflow action buttons */}
      {!isTerminal && allowedActions.length > 0 && (
        <div className='p-4 border-t shrink-0 space-y-2'>
          {primaryActions.map(action => (
            <Button
              key={action.to}
              variant={action.meta.variant}
              className='w-full h-9 gap-2 rounded-xl font-medium'
              onClick={() => handleTransition(action.to)}
            >
              <CheckCircle2 className='size-3.5' />
              {action.meta.buttonLabel}
            </Button>
          ))}
          {destructiveActions.map(action => (
            <Button
              key={action.to}
              variant='outline'
              className='w-full h-9 gap-2 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
              onClick={() => handleTransition(action.to)}
            >
              <Undo2 className='size-3.5' />
              {action.meta.buttonLabel}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
