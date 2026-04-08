import Form from '@/components/custom/form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { useForm, uuid } from '@tanstack/react-form'
import { Minus, Plus } from 'lucide-react'
import { posItem, PosProduct } from '..'

export function ProductDialog({
  open,
  onClose,
  product,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  product: PosProduct
  onConfirm: (item: posItem) => void
}) {
  // Initialize TanStack Form
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25'>
        <DialogHeader>
          <DialogTitle className='text-2xl font-black'>{product?.name}</DialogTitle>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='grid gap-6'>
          {/* --- VARIANTS SECTION --- */}
          {product.variants?.length > 0 && (
            <form.Field name='selectedVariantId'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-sm flex items-center gap-2'>
                    Select {product.variantType || 'Option'}
                    <Badge variant='secondary' className='text-[10px]'>
                      Required
                    </Badge>
                  </h4>
                  <RadioGroup value={field.state.value} onValueChange={field.handleChange} className='grid grid-cols-2 gap-2'>
                    {product.variants.map((v: any) => (
                      <div key={v.id}>
                        <RadioGroupItem value={v.id} id={v.id} className='peer sr-only' />
                        <Label
                          htmlFor={v.id}
                          className='flex flex-col items-center justify-center rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer'
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

          {/* --- ADDONS SECTION --- */}
          {product.allowedAddons?.length > 0 && (
            <form.Field name='selectedAddonIds'>
              {field => (
                <div className='space-y-3'>
                  <h4 className='font-bold text-sm'>Extras / Add-ons</h4>
                  <div className='grid gap-2'>
                    {product.allowedAddons.map((item: any) => (
                      <label
                        htmlFor={item.id}
                        key={item.id}
                        className='flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30 cursor-pointer'
                      >
                        <div className='flex items-center gap-3'>
                          <Checkbox
                            id={item.id}
                            checked={field.state.value.includes(item.id)}
                            onCheckedChange={checked => {
                              const nextValue = checked ? [...field.state.value, item.id] : field.state.value.filter(id => id !== item.id)
                              field.handleChange(nextValue)
                            }}
                          />
                          <Label htmlFor={item.id} className='text-xs font-medium cursor-pointer'>
                            {item.addon.name}
                          </Label>
                        </div>
                        <span className='text-[10px] font-bold'>+{PriceEngine.format(Number(item.priceOverride))}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </form.Field>
          )}

          {/* --- QUANTITY & FOOTER --- */}
          <div className='flex items-center justify-between pt-4 border-t border-border'>
            <form.Field name='quantity'>
              {field => (
                <div className='flex items-center gap-3 bg-muted rounded-xl p-1'>
                  <Button type='button' variant='ghost' size='icon' onClick={() => field.handleChange(Math.max(1, field.state.value - 1))}>
                    <Minus className='w-4' />
                  </Button>
                  <span className='font-bold w-6 text-center'>{field.state.value}</span>
                  <Button type='button' variant='ghost' size='icon' onClick={() => field.handleChange(field.state.value + 1)}>
                    <Plus className='w-4' />
                  </Button>
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type='submit' disabled={!canSubmit} className='rounded-xl px-8 font-bold'>
                  {isSubmitting ? '...' : 'Add to Order'}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
