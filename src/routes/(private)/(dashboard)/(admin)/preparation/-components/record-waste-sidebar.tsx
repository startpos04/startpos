import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import { MovementType } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { inventoryCollection, inventoryMovementCollection } from '@/db/collections'
import { dbTransaction } from '@/db/local-db-transaction'
import { FinishedGoodsEngine } from '@/lib/production'
import { authStore } from '@/store/auth-store'
import type { MountProps } from '@/lib/mount-manager'
import { closePreparationSidebar } from './preparation-sidebar'

const wasteReasons = [
  'Past Shelf Life',
  'Expired',
  'Spoiled',
  'Damaged',
  'Failed Preparation',
  'Quality Issue',
  'Other',
] as const

interface RecordWasteSidebarProps extends MountProps {
  variantId: string
  productName: string
  availableQuantity: number
  unit: string
}

export function RecordWasteSidebar({
  variantId,
  productName,
  availableQuantity,
  unit,
  open: _open,
  onClose,
}: RecordWasteSidebarProps) {
  const user = authStore.state.user
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form state
  const [quantity, setQuantity] = useState(0)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = async () => {
    if (quantity > availableQuantity) {
      toast.error(`Cannot waste more than available quantity (${availableQuantity} ${unit})`)
      return
    }

    if (!reason) {
      toast.error('Please select a reason')
      return
    }

    if (quantity <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await dbTransaction(() => {
        // Get finished goods batches (FIFO)
        const batches = FinishedGoodsEngine.getFinishedGoodsBatches(
          variantId,
          user.branch.id,
          inventoryCollection,
          // @ts-ignore - productVariantCollection type issue
          { get: () => null }
        )

        if (batches.length === 0) {
          throw new Error('No finished goods inventory found')
        }

        const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0)
        if (totalAvailable < quantity) {
          throw new Error(`Insufficient inventory. Available: ${totalAvailable} ${unit}`)
        }

        // Consume from oldest batches first (FIFO)
        let remaining = quantity
        for (const batch of batches) {
          if (remaining <= 0) break

          const toWaste = Math.min(batch.quantity, remaining)

          // Update inventory
          inventoryCollection.update(batch.inventoryId, draft => {
            draft.quantity -= toWaste
            draft.updatedAt = new Date()
          })

          // Create waste movement
          inventoryMovementCollection.insert({
            id: crypto.randomUUID(),
            variantId,
            inventoryId: batch.inventoryId,
            transactionId: null,
            productionOrderId: batch.productionOrderId,
            userId: user.id,
            type: MovementType.WASTE,
            quantity: toWaste,
            reason: `Waste: ${reason}${notes ? ` - ${notes}` : ''}`,
            unitId: user.business.baseUnitId, // FIXME: should get from variant
            purchaseId: null,
            locationId: null,
            targetBranchId: null,
            operationalTaskId: null,
            businessId: user.business.id,
            branchId: user.branch.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          })

          remaining -= toWaste
        }

        return { success: true }
      })

      if (result.isOk()) {
        toast.success(`${quantity} ${unit} recorded as waste`)
        handleClose()
      } else {
        throw result.error
      }
    } catch (error) {
      console.error('Failed to record waste:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to record waste')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closePreparationSidebar()
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div className='flex items-center gap-2'>
          <Trash2 className='w-5 h-5 text-red-600' />
          <div>
            <h2 className='text-base font-semibold leading-none'>Record Waste</h2>
            <p className='text-xs text-muted-foreground mt-1'>Record waste for finished goods inventory</p>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        <div className='rounded-lg border bg-muted/50 p-4'>
          <p className='font-semibold'>{productName}</p>
          <p className='text-sm text-muted-foreground mt-1'>
            Available: {availableQuantity} {unit}
          </p>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='quantity'>Quantity to Dispose</Label>
          <div className='flex gap-2'>
            <Input
              id='quantity'
              type='number'
              min='0.01'
              max={availableQuantity}
              step='0.01'
              placeholder='0'
              value={quantity || ''}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <div className='flex items-center px-3 border rounded-md bg-muted text-sm'>
              {unit}
            </div>
          </div>
          {quantity > availableQuantity && (
            <p className='text-sm text-red-600'>
              Cannot exceed available quantity ({availableQuantity} {unit})
            </p>
          )}
        </div>

        <div className='space-y-2'>
          <Label htmlFor='reason'>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id='reason'>
              <SelectValue placeholder='Select a reason' />
            </SelectTrigger>
            <SelectContent>
              {wasteReasons.map(r => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='notes'>Notes (optional)</Label>
          <Textarea
            id='notes'
            placeholder='Add any additional details...'
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <p className='text-xs text-muted-foreground'>
            Provide additional context about the waste
          </p>
        </div>

        {quantity > 0 && (
          <div className='rounded-lg border border-orange-400/40 bg-orange-50/40 dark:bg-orange-950/20 p-3'>
            <div className='flex items-start gap-2'>
              <AlertTriangle className='w-4 h-4 text-orange-600 shrink-0 mt-0.5' />
              <p className='text-sm text-orange-700 dark:text-orange-400'>
                This action will remove <strong>{quantity} {unit}</strong> from your inventory.
                This cannot be undone.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0'>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={handleClose} disabled={isSubmitting} className='flex-1'>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            variant='destructive'
            disabled={isSubmitting || quantity > availableQuantity || quantity <= 0 || !reason}
            className='flex-1'
          >
            {isSubmitting ? (
              <>
                <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                Recording...
              </>
            ) : (
              'Record Waste'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
