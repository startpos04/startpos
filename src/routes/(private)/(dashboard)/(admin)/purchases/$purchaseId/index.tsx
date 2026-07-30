/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { createFileRoute } from '@tanstack/react-router'
import { Building2, FileText, Package, ShoppingCart, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import Tab from '@/components/custom/tab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PriceEngine } from '@/lib/conversion/price-engine'
import dayjs from '@/lib/dayjs'
import type { MountProps } from '@/lib/mount-manager'
import MountManager from '@/lib/mount-manager'
import { type fePurchase, fetchPurchases } from '@/lib/queries/fetch-purchases'
import { voidPurchase } from '@/lib/queries/void-purchase'
import { cn } from '@/lib/utils'
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

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
              {(purchase.supplier as any).phone && <p className='text-[11px] text-muted-foreground'>{(purchase.supplier as any).phone}</p>}
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

      {/* Notes / reference */}
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

// ─── Main component ───────────────────────────────────────────────────────────

interface RouteComponentProps {
  purchaseId?: string
  onClose?: (() => void) | undefined
}

function RouteComponent({ purchaseId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const loaderData = propId ? null : Route.useLoaderData()
  const purchaseId = propId ?? loaderData?.purchaseId ?? ''

  const { data: purchases = [], isLoading } = fetchPurchases()
  const purchase = purchases.find(p => p.id === purchaseId)

  const handleClose = () => {
    if (onClose) onClose()
    else closePurchaseSidebar()
  }

  const handleVoid = () => {
    if (!purchase) return
    MountManager.show(WarningPrompt, {
      title: 'Void Purchase',
      btnText: 'Void Purchase',
      description: `Void ${purchase.purchaseId}? This will reverse the inventory received and cannot be undone.`,
      onConfirm: async () => {
        const { error } = await voidPurchase(purchaseId)
        if (error) {
          toast.error(`Failed to void: ${error.message}`)
          return false
        }
        toast.success(`${purchase.purchaseId} has been voided`)
        handleClose()
        return true
      },
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

  const isVoided = purchase.notes?.startsWith('[VOIDED]')

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
              {isVoided && (
                <Badge variant='destructive' className='text-[10px] py-0 h-4'>
                  Voided
                </Badge>
              )}
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
          <Badge variant='secondary' className={cn('text-[10px] font-medium', isVoided && 'bg-destructive/10 text-destructive border-destructive/20')}>
            {isVoided ? 'Voided' : (purchase.supplier?.name ?? 'No Supplier')}
          </Badge>
        </div>
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <Tab
          defaultValue='Items'
          tabs={[
            { label: 'Items', Component: ItemsTab, purchase },
            { label: 'Details', Component: DetailsTab, purchase },
          ]}
        />
      </div>

      {/* Footer — void action (disabled if already voided) */}
      {!isVoided && (
        <div className='p-4 border-t shrink-0'>
          <Button
            variant='outline'
            className='w-full h-9 gap-2 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
            onClick={handleVoid}
          >
            <Undo2 className='size-3.5' />
            Void Purchase
          </Button>
        </div>
      )}
    </div>
  )
}
