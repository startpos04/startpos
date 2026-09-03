import { Button } from '@platform/components/ui/button'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@platform/components/ui/select'
import { Textarea } from '@platform/components/ui/textarea'
import {
  inventoryCollection,
  inventoryMovementCollection,
  productionOrderCollection,
  productionOrderItemCollection,
  productVariantCollection,
} from '@platform/db/collections'
import { dbTransaction } from '@platform/db/local-db-transaction'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { sequenceAPI } from '@platform/lib/prisma-client/sequence-api'
import { AlertTriangle, Check, Loader2, Package, X } from 'lucide-react'
import { SequenceType } from 'prisma/generated/prisma/enums'
import { useState } from 'react'
import { toast } from 'sonner'
import type { MountProps } from '@platform/lib/mount-manager'
import { ProductionEngine } from '@/lib/production'
import type { BatchPreparedProduct } from '@/lib/queries/fetch-batch-prepared-products'
import { fetchStructuredId } from '@/lib/queries/fetch-structured-id'
import { closePreparationSidebar } from './preparation-sidebar'

interface PrepareProductSidebarProps extends MountProps {
  products: BatchPreparedProduct[]
  preSelectedVariantId?: string
}

export function PrepareProductSidebar({ products, preSelectedVariantId, open: _open, onClose }: PrepareProductSidebarProps) {
  const user = authStore.state.user
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [selectedVariantId, setSelectedVariantId] = useState(preSelectedVariantId || '')
  const [quantity, setQuantity] = useState(0)
  const [notes, setNotes] = useState('')

  const [materialRequirements, setMaterialRequirements] = useState<
    Array<{
      materialName: string
      required: number
      unit: string
      available: number
      sufficient: boolean
    }>
  >([])

  const selectedVariant = products.find(p => p.id === selectedVariantId)
  const usesRecipe = selectedVariant?.components && selectedVariant.components.filter(c => !c.isAddon).length > 0

  const handleContinue = () => {
    if (!selectedVariant) return

    if (usesRecipe) {
      // Calculate material requirements
      try {
        const requirements = ProductionEngine.calculateMaterialRequirements({
          variantId: selectedVariantId,
          quantity,
          productVariantCollection,
          inventoryCollection,
          branchId: user.branch.id,
        })

        if (!requirements || requirements.length === 0) {
          toast.error('No recipe found for this product')
          return
        }

        setMaterialRequirements(
          requirements.map(req => ({
            materialName: req.materialName,
            required: req.requiredQuantity,
            unit: req.requiredUnit.abbreviation || '',
            available: req.availableQuantity,
            sufficient: req.sufficient,
          })),
        )
        setStep('confirm')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to calculate requirements')
      }
    } else {
      // Recipe-free: skip to confirmation
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (!selectedVariant) return

    setIsSubmitting(true)

    try {
      // Allocate production order number
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
      let orderNumber: string

      if (isOffline) {
        orderNumber = fetchStructuredId(SequenceType.PRODUCTION_ORDER)
      } else {
        const sequenceResult = await sequenceAPI.allocateWithRetry(SequenceType.PRODUCTION_ORDER)
        if (sequenceResult.isErr()) {
          throw new Error(`Failed to allocate production order number: ${sequenceResult.error}`)
        }
        orderNumber = sequenceResult.value.invoiceNo
      }

      const result = await dbTransaction(() => {
        // Create production order
        const createResult = ProductionEngine.createProductionOrder(
          {
            variantId: selectedVariantId,
            quantity,
            unitId: selectedVariant.product.baseUnitId,
            usesRecipe,
            notes: notes || undefined,
            ctx: {
              userId: user.id,
              branchId: user.branch.id,
              businessId: user.business.id,
            },
          },
          orderNumber,
          productionOrderCollection,
          productVariantCollection,
        )

        if (!createResult.ok) {
          throw new Error(createResult.reason)
        }

        const productionOrderId = createResult.value

        // Start production (consumes materials if recipe-based)
        const startResult = ProductionEngine.startProduction({
          orderId: productionOrderId,
          productionOrderCollection,
          productionOrderItemCollection,
          productVariantCollection,
          inventoryCollection,
          movementCollection: inventoryMovementCollection,
          ctx: {
            userId: user.id,
            branchId: user.branch.id,
            businessId: user.business.id,
          },
        })

        if (!startResult.ok) {
          throw new Error(startResult.reason)
        }

        // Complete production (creates finished goods)
        const completeResult = ProductionEngine.completeProduction({
          orderId: productionOrderId,
          actualQuantity: quantity,
          productionOrderCollection,
          inventoryCollection,
          movementCollection: inventoryMovementCollection,
          ctx: {
            userId: user.id,
            branchId: user.branch.id,
            businessId: user.business.id,
          },
        })

        if (!completeResult.ok) {
          throw new Error(completeResult.reason)
        }

        return { success: true }
      })

      if (result.isOk()) {
        toast.success('Production completed successfully')
        handleClose()
      } else {
        throw result.error
      }
    } catch (error) {
      console.error('Production failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to complete production')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (onClose) onClose()
    else closePreparationSidebar()
  }

  const hasInsufficientMaterials = materialRequirements.some(m => !m.sufficient)

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='flex items-center justify-between p-4 border-b shrink-0'>
        <div>
          <h2 className='text-base font-semibold leading-none'>
            {step === 'select' && 'Prepare Product'}
            {step === 'confirm' && 'Confirm Materials'}
          </h2>
          <p className='text-xs text-muted-foreground mt-1'>
            {step === 'select' && 'Select the product and quantity to prepare'}
            {step === 'confirm' && 'Review material requirements before preparation'}
          </p>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        {step === 'select' && (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='product'>Product</Label>
              {preSelectedVariantId && typeof preSelectedVariantId === 'string' && preSelectedVariantId.trim() !== '' ? (
                <div className='rounded-lg border bg-muted/50 p-3'>
                  <p className='font-semibold'>
                    {selectedVariant?.product.name}
                    {selectedVariant && selectedVariant.name !== selectedVariant.product.name && ` - ${selectedVariant.name}`}
                  </p>
                </div>
              ) : (
                <Select value={selectedVariantId || undefined} onValueChange={setSelectedVariantId}>
                  <SelectTrigger id='product' className='min-w-[200px]'>
                    <SelectValue placeholder='Select a product' />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(variant => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.product.name}
                        {variant.name !== variant.product.name && ` - ${variant.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className='space-y-2'>
              <Label htmlFor='quantity'>Quantity</Label>
              <div className='flex gap-2'>
                <Input
                  id='quantity'
                  type='number'
                  min='1'
                  step='1'
                  placeholder='0'
                  value={quantity || ''}
                  onChange={e => setQuantity(Number(e.target.value))}
                />
                <div className='flex items-center px-3 border rounded-md bg-muted text-sm'>{selectedVariant?.product.baseUnit.abbreviation || 'units'}</div>
              </div>
            </div>

            {selectedVariant && !usesRecipe && (
              <div className='rounded-lg border border-blue-400/40 bg-blue-50/40 dark:bg-blue-950/20 p-3'>
                <p className='text-sm text-blue-700 dark:text-blue-400'>
                  <strong>Recipe-free mode:</strong> This will add finished goods to inventory without deducting raw materials.
                </p>
              </div>
            )}

            <div className='space-y-2'>
              <Label htmlFor='notes'>Notes (optional)</Label>
              <Textarea
                id='notes'
                placeholder='Add any notes about this preparation batch...'
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className='space-y-4'>
            <div className='rounded-lg border bg-muted/50 p-4'>
              <h3 className='font-semibold mb-1'>
                Preparing {quantity} {selectedVariant?.product.baseUnit.abbreviation} of {selectedVariant?.product.name}
                {selectedVariant?.name !== selectedVariant?.product.name && ` - ${selectedVariant?.name}`}
              </h3>
            </div>

            <div className='space-y-2'>
              <h4 className='font-semibold text-sm'>Required Materials:</h4>
              <div className='space-y-2'>
                {materialRequirements.map((mat, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      mat.sufficient ? 'border-border bg-card' : 'border-red-400/40 bg-red-50/40 dark:bg-red-950/20'
                    }`}
                  >
                    <div className='flex items-center gap-2'>
                      {mat.sufficient ? <Check className='w-4 h-4 text-green-600' /> : <AlertTriangle className='w-4 h-4 text-red-600' />}
                      <span className='font-medium'>{mat.materialName}</span>
                    </div>
                    <div className='text-sm'>
                      <span className={mat.sufficient ? 'text-muted-foreground' : 'text-red-600'}>
                        {mat.required} {mat.unit} required
                      </span>
                      <span className='text-muted-foreground'> â€¢ </span>
                      <span className={mat.sufficient ? 'text-foreground' : 'text-red-600 font-medium'}>
                        {mat.available} {mat.unit} available
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {hasInsufficientMaterials && (
              <div className='rounded-lg border border-red-400/40 bg-red-50/40 dark:bg-red-950/20 p-3'>
                <p className='text-sm text-red-700 dark:text-red-400'>
                  <strong>Insufficient materials!</strong> You don't have enough raw materials to complete this preparation. Please restock the materials or
                  reduce the quantity.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className='p-4 border-t shrink-0 space-y-2'>
        {step === 'select' && (
          <div className='flex gap-2'>
            <Button variant='outline' onClick={handleClose} className='flex-1'>
              Cancel
            </Button>
            <Button onClick={handleContinue} disabled={!selectedVariantId || quantity <= 0} className='flex-1'>
              {usesRecipe ? 'Continue' : 'Prepare'}
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className='flex gap-2'>
            <Button variant='outline' onClick={() => setStep('select')} className='flex-1'>
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={hasInsufficientMaterials || isSubmitting} className='flex-1'>
              {isSubmitting ? (
                <>
                  <Loader2 className='w-4 h-4 mr-2 animate-spin' />
                  Preparing...
                </>
              ) : (
                'Prepare'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
