/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, FileText, Package, ShoppingCart, Undo2, X } from 'lucide-react'
import { GoodsReceiptStatus, PurchaseStatus } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { purchaseCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import MountManager from '@/lib/mount-manager'
import { confirmGoodsReceipt, disputeGoodsReceipt } from '@/lib/queries/confirm-goods-receipt'
import { createGoodsReceipt } from '@/lib/queries/create-goods-receipt'
import { type feGoodsReceipt, fetchGoodsReceipts } from '@/lib/queries/fetch-goods-receipts'
import { type fePurchase, fetchPurchases } from '@/lib/queries/fetch-purchases'
import { getPurchaseStatusUIMetadata, purchaseWorkflow } from '@/lib/queries/purchase-workflow'
import { getReceiptStatusUIMetadata, receiptWorkflow } from '@/lib/queries/receipt-workflow'
import { voidPurchase } from '@/lib/queries/void-purchase'
import { cn } from '@/lib/utils'
import { authStore } from '@/store/auth-store'
import { closePurchaseSidebar } from '../-components/purchase-sidebar'

// ─── Route ───────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/purchases/$purchaseId/' as any)({
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

// ─── Items Tab ────────────────────────────────────────────────────────────────

function ItemsTab({ purchase }: { purchase: fePurchase }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='text-xs font-bold'>Product</TableHead>
          <TableHead className='text-xs font-bold text-right'>Qty</TableHead>
          <TableHead className='text-xs font-bold text-right'>Unit Cost</TableHead>
          <TableHead className='text-xs font-bold text-right'>Subtotal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {purchase.items.length > 0 ? (
          purchase.items.map((item: any) => (
            <TableRow key={item.id}>
              <TableCell className='py-2'>
                <p className='text-xs font-medium leading-tight'>{item.product?.name ?? '—'}</p>
                {item.variant?.name && <p className='text-[10px] text-muted-foreground font-mono mt-0.5'>{item.variant.name}</p>}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>
                {item.quantity}
                {item.unit?.abbreviation && <span className='text-muted-foreground ml-0.5'>{item.unit.abbreviation}</span>}
              </TableCell>
              <TableCell className='text-right font-mono text-xs py-2'>{PriceEngine.format(item.unitCost)}</TableCell>
              <TableCell className='text-right font-mono text-xs font-bold py-2'>{PriceEngine.format(Math.round(item.unitCost * item.quantity))}</TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4} className='text-center py-8 text-xs text-muted-foreground'>
              No line items recorded.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ purchase }: { purchase: fePurchase }) {
  const cleanNotes = purchase.notes?.replace(/^\[(VOIDED|DELETED)\]\s*/i, '') || null

  return (
    <div className='space-y-3'>
      {/* Supplier card */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Supplier</p>
        {purchase.supplier ? (
          <div className='flex items-start gap-2.5'>
            <div className='h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0'>
              <Building2 className='size-4 text-primary' />
            </div>
            <div>
              <p className='text-sm font-semibold leading-tight'>{purchase.supplier.name}</p>
              {(purchase.supplier as any).contactEmail && <p className='text-[11px] text-muted-foreground mt-0.5'>{(purchase.supplier as any).contactEmail}</p>}
            </div>
          </div>
        ) : (
          <p className='text-xs text-muted-foreground'>No supplier linked.</p>
        )}
      </div>

      {/* Meta grid */}
      <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2.5'>
        <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Purchase Info</p>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2.5'>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>PO Number</p>
            <p className='font-mono text-xs font-bold text-primary'>{purchase.purchaseId}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Date</p>
            <p className='text-xs font-medium'>{dayjs(purchase.createdAt).format('MMM DD, YYYY')}</p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Items</p>
            <p className='text-xs font-bold'>
              {purchase.items.length} line{purchase.items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div>
            <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Total Cost</p>
            <p className='font-mono text-xs font-black text-primary'>{PriceEngine.format(purchase.totalCost)}</p>
          </div>
        </div>
      </div>

      {cleanNotes && (
        <div className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5'>
          <div className='flex items-center gap-1.5'>
            <FileText className='size-3 text-muted-foreground' />
            <p className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground'>Notes / Reference</p>
          </div>
          <p className='text-xs text-foreground/80 leading-relaxed'>{cleanNotes}</p>
        </div>
      )}
    </div>
  )
}

// ─── Receipts Tab (Phase E) ───────────────────────────────────────────────────

interface ReceiptsTabProps {
  purchase: fePurchase
  user: { id: string; role: string }
}

function ReceiptsTab({ purchase, user }: ReceiptsTabProps) {
  const { data: receipts = [], isLoading } = fetchGoodsReceipts(purchase.id)

  if (isLoading) {
    return <div className='p-4 animate-pulse bg-muted rounded-xl h-20' />
  }

  if (receipts.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground'>
        <ClipboardCheck className='size-7 opacity-30' />
        <p className='text-xs'>No goods receipts recorded yet.</p>
        {purchase.status === PurchaseStatus.APPROVED && (
          <p className='text-[11px] text-center max-w-48 leading-relaxed'>Use "Receive Goods" below to create a receipt when the delivery arrives.</p>
        )}
      </div>
    )
  }

  const handleConfirm = (receipt: feGoodsReceipt) => {
    MountManager.show(WarningPrompt, {
      title: 'Confirm Receipt',
      btnText: 'Confirm & Credit Inventory',
      description: `Confirm GRN from ${dayjs(receipt.createdAt).format('MMM DD, YYYY')}? This will credit inventory for all received quantities and cannot be undone.`,
      onConfirm: async () => {
        const { error } = await confirmGoodsReceipt(receipt.id)
        if (error) {
          toast.error(`Failed to confirm: ${error.message}`)
          return false
        }
        toast.success('Goods receipt confirmed — inventory credited')
        return true
      },
    })
  }

  const handleDispute = (receipt: feGoodsReceipt) => {
    MountManager.show(WarningPrompt, {
      title: 'Flag Discrepancy',
      btnText: 'Flag as Disputed',
      description: `Flag this receipt as disputed? The purchase will remain in Approved status until a new receipt is created.`,
      onConfirm: async () => {
        const { error } = await disputeGoodsReceipt(receipt.id, 'Discrepancy flagged by user')
        if (error) {
          toast.error(`Failed to dispute: ${error.message}`)
          return false
        }
        toast.success('Receipt flagged as disputed')
        return true
      },
    })
  }

  return (
    <div className='space-y-3'>
      {receipts.map(receipt => {
        const { label: statusLabel, colorClass } = getReceiptStatusUIMetadata(receipt.status)
        const isPending = receipt.status === GoodsReceiptStatus.PENDING
        const allowedActions = isPending ? receiptWorkflow.allowedTransitions(receipt.status, { userRole: user.role, userId: user.id }) : []

        return (
          <div key={receipt.id} className='rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2.5'>
            {/* GRN header */}
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <ClipboardCheck className='size-3.5 text-muted-foreground' />
                <span className='text-xs font-semibold'>{dayjs(receipt.createdAt).format('MMM DD, YYYY · HH:mm')}</span>
              </div>
              <Badge variant='outline' className={cn('text-[10px] py-0 h-4', colorClass)}>
                {statusLabel}
              </Badge>
            </div>

            {/* Receiver */}
            {receipt.receiver && (
              <p className='text-[11px] text-muted-foreground'>
                Received by <span className='font-medium text-foreground'>{receipt.receiver.name}</span>
              </p>
            )}

            {/* Line items */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='text-[10px] font-bold py-1'>Product</TableHead>
                  <TableHead className='text-[10px] font-bold text-right py-1'>Ordered</TableHead>
                  <TableHead className='text-[10px] font-bold text-right py-1'>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipt.items.map((item: any) => {
                  const hasDiscrepancy = item.receivedQty !== item.orderedQty
                  return (
                    <TableRow key={item.id}>
                      <TableCell className='py-1.5'>
                        <p className='text-[11px] font-medium leading-tight'>{item.product?.name ?? '—'}</p>
                        {item.variant?.name && <p className='text-[9px] text-muted-foreground font-mono'>{item.variant.name}</p>}
                      </TableCell>
                      <TableCell className='text-right font-mono text-[11px] py-1.5 text-muted-foreground'>
                        {item.orderedQty}
                        {item.unit?.abbreviation && <span className='ml-0.5'>{item.unit.abbreviation}</span>}
                      </TableCell>
                      <TableCell className={cn('text-right font-mono text-[11px] font-bold py-1.5', hasDiscrepancy ? 'text-amber-600' : 'text-emerald-600')}>
                        {item.receivedQty}
                        {item.unit?.abbreviation && <span className='ml-0.5'>{item.unit.abbreviation}</span>}
                        {hasDiscrepancy && <AlertTriangle className='inline size-3 ml-1 text-amber-500' />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Notes */}
            {receipt.notes && !receipt.notes.startsWith('[DISPUTED]') && <p className='text-[11px] text-muted-foreground italic'>{receipt.notes}</p>}
            {receipt.notes?.startsWith('[DISPUTED]') && <p className='text-[11px] text-destructive font-medium'>{receipt.notes.replace('[DISPUTED] ', '')}</p>}

            {/* GRN action buttons — only for PENDING receipts */}
            {allowedActions.length > 0 && (
              <div className='flex gap-2 pt-1'>
                {allowedActions
                  .filter(a => a.to === GoodsReceiptStatus.CONFIRMED)
                  .map(action => (
                    <Button
                      key={action.to}
                      size='sm'
                      variant='default'
                      className='flex-1 h-7 text-[11px] gap-1 rounded-lg'
                      onClick={() => handleConfirm(receipt)}
                    >
                      <CheckCircle2 className='size-3' />
                      {action.meta.buttonLabel}
                    </Button>
                  ))}
                {allowedActions
                  .filter(a => a.to === GoodsReceiptStatus.DISPUTED)
                  .map(action => (
                    <Button
                      key={action.to}
                      size='sm'
                      variant='outline'
                      className='h-7 text-[11px] gap-1 rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
                      onClick={() => handleDispute(receipt)}
                    >
                      <AlertTriangle className='size-3' />
                      {action.meta.buttonLabel}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
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
      toast.error(`Failed to void: ${error.message}`)
      return false
    }
    toast.success(`${purchase.purchaseId} has been voided`)
    return true
  }

  // E4 change: APPROVED → RECEIVED now creates a GRN at PENDING instead of
  // directly crediting inventory. Inventory credit happens when the GRN is confirmed.
  // The "Confirm Goods Received" button becomes "Receive Goods" which creates the GRN.
  if (targetStatus === PurchaseStatus.RECEIVED) {
    const { data, error } = await createGoodsReceipt({ purchaseId: purchase.id })
    if (error || !data) {
      toast.error(`Failed to create receipt: ${error?.message ?? 'Unknown error'}`)
      return false
    }
    toast.success(`Goods receipt created for ${purchase.purchaseId} — confirm it to credit inventory`)
    return true
  }

  // All other transitions (PENDING_APPROVAL → APPROVED, PENDING_APPROVAL → DRAFT,
  // RECEIVED → CLOSED): simple status update
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
  toast.success(`${purchase.purchaseId} → ${label}`)
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
