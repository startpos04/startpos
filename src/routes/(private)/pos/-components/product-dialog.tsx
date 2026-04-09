import Form from '@/components/custom/form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { InventoryEngine, posItem, PosProduct } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { OverlayProps } from '@/lib/overlay'
import { useForm, useStore, uuid } from '@tanstack/react-form'
import { Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'

interface ProductDialogProps extends OverlayProps {
  product: PosProduct
  cartItems: posItem[]
  onConfirm: (item: posItem) => void
}

/** Helper to find stock inside the deeply nested Product object **/
const findStockInLoadedData = (id: string, product: PosProduct): number => {
  if (product.id === id) return product.inventory?.reduce((acc, inv) => acc + inv.quantity, 0) ?? 0
  const ingredient = product.ingredients?.find(ing => ing.materialId === id)
  if (ingredient) return ingredient.material.inventory?.reduce((acc, inv) => acc + inv.quantity, 0) ?? 0
  const addonMatch = product.allowedAddons?.find(a => a.addonId === id)
  if (addonMatch) return addonMatch.addon.inventory?.reduce((acc, inv) => acc + inv.quantity, 0) ?? 0
  return 0
}

export function ProductDialog({ open, onClose, cartItems, product, onConfirm }: ProductDialogProps) {
  const form = useForm({
    defaultValues: {
      selectedVariantId: product.variants?.[0]?.id || '',
      selectedAddonIds: [] as string[],
      quantity: 1,
    },
    onSubmit: async ({ value }) => {
      const selectedVariant = product.variants?.find(v => v.id === value.selectedVariantId) || undefined
      const addonsData = product.allowedAddons.filter(a => value.selectedAddonIds.includes(a.id))
      onConfirm({ cartId: uuid(), product, quantity: value.quantity, variant: selectedVariant, addons: addonsData })
      onClose()
    },
  })

  const selectedAddonIds = useStore(form.store, s => s.values.selectedAddonIds)
  const selectedVariantId = useStore(form.store, s => s.values.selectedVariantId)

  const remainingYield = useMemo(
    () =>
      InventoryEngine.calculateRemainingYield(
        product,
        selectedAddonIds,
        cartItems,
        product.variants?.find(v => v.id === selectedVariantId),
      ),
    [product, cartItems, selectedAddonIds, selectedVariantId],
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black flex justify-between items-end'>
            {product?.name} <span className='text-[9px] text-center font-bold text-muted-foreground uppercase'>{remainingYield} Available</span>
          </DialogTitle>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='grid gap-6'>
          {/* --- VARIANTS --- */}
          {product.variants?.length > 0 && (
            <form.Field name='selectedVariantId'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-sm'>Select Option</h4>
                  <RadioGroup value={field.state.value} onValueChange={field.handleChange} className='grid grid-cols-2 gap-2'>
                    {product.variants.map(v => (
                      <div key={v.id}>
                        <RadioGroupItem value={v.id} id={v.id} className='peer sr-only' />
                        <Label
                          htmlFor={v.id}
                          className='flex flex-col items-center justify-center rounded-xl border-2 border-muted p-4 peer-data-[state=checked]:border-primary cursor-pointer'
                        >
                          <span className='text-xs font-bold'>{v.name}</span>
                          <span className='text-[10px] text-muted-foreground'>{PriceEngine.format(Number(v.price))}</span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              )}
            </form.Field>
          )}

          {/* --- ADDONS --- */}
          {product.allowedAddons?.length > 0 && (
            <form.Field name='selectedAddonIds'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-sm'>Extras / Add-ons</h4>
                  <div className='grid gap-2'>
                    {product.allowedAddons.map(item => {
                      // Pre-calculate if addon itself is out of stock
                      const reserved = InventoryEngine.getReservedMap(cartItems)
                      const addonStock = findStockInLoadedData(item.addonId, product)
                      const isSoldOut = addonStock - (reserved[item.addonId] || 0) <= 0

                      return (
                        <label
                          key={item.id}
                          className={`flex items-center justify-between p-3 rounded-xl border ${isSoldOut ? 'opacity-40 grayscale pointer-events-none' : 'bg-muted/30 cursor-pointer'}`}
                        >
                          <div className='flex items-center gap-3'>
                            <Checkbox
                              id={item.id}
                              disabled={isSoldOut}
                              checked={field.state.value.includes(item.id)}
                              onCheckedChange={checked => {
                                const nextValue = checked ? [...field.state.value, item.id] : field.state.value.filter(id => id !== item.id)
                                field.handleChange(nextValue)
                              }}
                            />
                            <Label htmlFor={item.id} className='text-xs font-medium'>
                              {item.addon.name} {isSoldOut && '(Sold Out)'}
                            </Label>
                          </div>
                          <span className='text-[10px] font-bold'>+{PriceEngine.format(Number(item.priceOverride))}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </form.Field>
          )}

          {/* --- QUANTITY & FOOTER --- */}
          <div className='flex items-center justify-between pt-4 border-t'>
            <form.Field name='quantity'>
              {field => (
                <div className='flex flex-col gap-1'>
                  <div className='flex items-center gap-3 bg-muted rounded-xl p-1'>
                    <Button type='button' variant='ghost' size='icon' onClick={() => field.handleChange(Math.max(1, field.state.value - 1))}>
                      <Minus className='w-4' />
                    </Button>
                    <span className='font-bold w-6 text-center'>{field.state.value}</span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      disabled={field.state.value >= remainingYield}
                      onClick={() => field.handleChange(field.state.value + 1)}
                    >
                      <Plus className='w-4' />
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting, state.values.quantity]}>
              {([canSubmit, isSubmitting, qty]) => (
                <Button type='submit' disabled={!canSubmit || Number(qty) > remainingYield || remainingYield === 0} className='rounded-xl px-8 font-bold'>
                  {isSubmitting ? '...' : remainingYield === 0 ? 'Out of Stock' : 'Add to Order'}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
