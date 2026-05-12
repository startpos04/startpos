import { useForm, useStore, uuid } from '@tanstack/react-form'
import { useSearch } from '@tanstack/react-router'
import { Minus, Plus, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import Form from '@/components/custom/form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { usePOS } from '@/hooks/use-pos'
import { InventoryEngine, type PosProduct, type posItem } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { OverlayProps } from '@/lib/overlay'
import { cn } from '@/lib/utils'

interface ProductDialogProps extends OverlayProps {
  product: PosProduct
  cartItems: posItem[]
  onConfirm: (item: posItem) => void
}

export function ProductDialog({ open, onClose, cartItems, product, onConfirm }: ProductDialogProps) {
  const { orderId } = useSearch({ from: '/(private)/pos/' })
  const { orderItems } = usePOS(orderId)

  const form = useForm({
    defaultValues: {
      selectedVariantId: product.variants?.[0]?.id || '',
      selectedAddonIds: [] as string[], // These are Component IDs
      quantity: 1,
    },
    onSubmit: async ({ value }) => {
      const selectedVariant = product.variants?.find(v => v.id === value.selectedVariantId)
      if (!selectedVariant) return

      // Map the selected component IDs back to the full component objects
      const selectedAddons = selectedVariant.components?.filter(c => value.selectedAddonIds.includes(c.id)) || []

      onConfirm({
        cartId: uuid(),
        product,
        quantity: value.quantity,
        variant: selectedVariant,
        addons: selectedAddons,
      })
      onClose()
    },
  })

  const selectedAddonIds = useStore(form.store, s => s.values.selectedAddonIds)
  const selectedVariantId = useStore(form.store, s => s.values.selectedVariantId)

  // Get the actual variant object for inventory calculation
  const currentVariant = useMemo(() => product.variants?.find(v => v.id === selectedVariantId), [product, selectedVariantId])

  // Identify which components are actually addons for the current variant
  const availableAddons = useMemo(() => currentVariant?.components?.filter(c => c.isAddon) || [], [currentVariant])

  // Calculate live yield based on the base recipe + currently selected addons
  const remainingYield = useMemo(() => {
    if (!currentVariant) return 0
    return InventoryEngine.calculateRemainingYield(product, currentVariant, selectedAddonIds, cartItems, orderItems)
  }, [product, currentVariant, selectedAddonIds, cartItems, orderItems])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black'>
            <div className='truncate mr-4'>{product?.name}</div>
            <Badge variant='secondary' className='text-[10px] bg-emerald-500/10 text-emerald-600 border-none px-3'>
              {remainingYield} available
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='grid gap-6 mt-4'>
          {/* --- VARIANTS (Sizes / Types) --- */}
          {product.variants?.length > 1 && (
            <form.Field name='selectedVariantId'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-xs uppercase tracking-widest text-muted-foreground'>Select Option</h4>
                  <RadioGroup
                    value={field.state.value}
                    onValueChange={val => {
                      field.handleChange(val)
                      form.setFieldValue('selectedAddonIds', []) // Reset addons if variant changes
                    }}
                    className='grid grid-cols-2 gap-2'
                  >
                    {product.variants.map(v => (
                      <div key={v.id}>
                        <RadioGroupItem value={v.id} id={v.id} className='peer sr-only' />
                        <Label
                          htmlFor={v.id}
                          className='flex flex-col items-center justify-center rounded-2xl border-2 border-muted p-3 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 transition-all cursor-pointer'
                        >
                          <span className='text-sm font-bold'>{v.name}</span>
                          <span className='text-[11px] font-mono text-primary'>{PriceEngine.format(Number(v.price))}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}
            </form.Field>
          )}

          {/* --- ADDONS (Components where isAddon=true) --- */}
          {availableAddons.length > 0 && (
            <form.Field name='selectedAddonIds'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
                    <Sparkles className='w-3 h-3' /> Customization
                  </h4>
                  <div className='grid gap-2'>
                    {availableAddons.map(comp => {
                      const reserved = InventoryEngine.getReservedMap(cartItems, orderItems)
                      const stockInfo = InventoryEngine.findPhysicalStock(comp.materialId, [product])
                      const isSoldOut = stockInfo.stock - (reserved[comp.materialId] || 0) < comp.quantityUsed

                      return (
                        <label
                          htmlFor={comp.id}
                          key={comp.id}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-2xl border transition-all',
                            isSoldOut ? 'opacity-40 grayscale pointer-events-none' : 'bg-muted/30 cursor-pointer hover:bg-muted/50',
                            field.state.value.includes(comp.id) ? 'border-primary/50 bg-primary/5' : 'border-transparent',
                          )}
                        >
                          <div className='flex items-center gap-3'>
                            <Checkbox
                              id={comp.id}
                              disabled={isSoldOut}
                              checked={field.state.value.includes(comp.id)}
                              onCheckedChange={checked => {
                                const nextValue = checked ? [...field.state.value, comp.id] : field.state.value.filter(id => id !== comp.id)
                                field.handleChange(nextValue)
                              }}
                            />
                            <Label htmlFor={comp.id} className='text-xs font-semibold'>
                              {comp.material.product.name} {isSoldOut && '(Sold Out)'}
                            </Label>
                          </div>
                          <span className='text-[11px] font-mono font-bold text-primary'>+{PriceEngine.format(Number(comp.priceOverride))}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </form.Field>
          )}

          {/* --- QUANTITY & ACTION --- */}
          <div className='flex items-center justify-between pt-6 border-t mt-2'>
            <form.Field name='quantity'>
              {field => (
                <div className='flex items-center gap-1 bg-muted/50 rounded-2xl p-1 border'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='rounded-xl'
                    onClick={() => field.handleChange(Math.max(1, field.state.value - 1))}
                  >
                    <Minus className='w-4 h-4' />
                  </Button>
                  <span className='font-mono font-black w-8 text-center text-lg'>{field.state.value}</span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    className='rounded-xl'
                    disabled={field.state.value >= remainingYield}
                    onClick={() => field.handleChange(field.state.value + 1)}
                  >
                    <Plus className='w-4 h-4' />
                  </Button>
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting, state.values.quantity]}>
              {([canSubmit, isSubmitting, qty]) => (
                <Button
                  type='submit'
                  disabled={!canSubmit || Number(qty) > remainingYield || remainingYield === 0}
                  className='rounded-2xl h-12 px-10 font-bold shadow-lg shadow-primary/20 transition-all active:scale-95'
                >
                  {isSubmitting ? 'Processing...' : remainingYield === 0 ? 'Sold Out' : 'Add to Order'}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
