/**
 * Purchase Receipts Tab (Goods Receipt Management)
 * 
 * Displays goods receipts for the purchase order with confirm/dispute actions
 */

import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { GoodsReceiptStatus } from 'prisma/generated/prisma/enums'
import { toast } from 'sonner'
import { AlertPrompt } from '@startpos-core/components/custom/prompt/alert-prompt'
import { WarningPrompt } from '@startpos-core/components/custom/prompt/warning-prompt'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@startpos-core/components/ui/table'
import dayjs from '@startpos-core/lib/dayjs'
import MountManager from '@/lib/mount-manager'
import { confirmGoodsReceipt, disputeGoodsReceipt } from '@/lib/queries/confirm-goods-receipt'
import { type feGoodsReceipt, fetchGoodsReceipts } from '@/lib/queries/fetch-goods-receipts'
import type { fePurchase } from '@/lib/queries/fetch-purchases'
import { getReceiptStatusUIMetadata, receiptWorkflow } from '@/lib/server-fn/receipt-workflow'
import { cn } from '@startpos-core/lib/utils'

interface ReceiptsTabProps {
  purchase: fePurchase
  user: { id: string; role: string }
}

export function ReceiptsTab({ purchase, user }: ReceiptsTabProps) {
  const { data: receipts = [], isLoading } = fetchGoodsReceipts(purchase.id)

  if (isLoading) {
    return <div className='p-4 animate-pulse bg-muted rounded-xl h-20' />
  }

  if (receipts.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground'>
        <ClipboardCheck className='size-7 opacity-30' />
        <p className='text-xs'>No goods receipts recorded yet.</p>
        {purchase.status === 'APPROVED' && (
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
          MountManager.show(AlertPrompt, {
            title: 'Confirm Receipt Failed',
            description: `Unable to confirm goods receipt: ${error.message}`,
            btnText: 'OK'
          })
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
          MountManager.show(AlertPrompt, {
            title: 'Dispute Receipt Failed',
            description: `Unable to dispute goods receipt: ${error.message}`,
            btnText: 'OK'
          })
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
