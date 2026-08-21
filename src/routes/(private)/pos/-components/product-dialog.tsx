import { useForm, useStore, uuid } from '@tanstack/react-form'
import { useSearch } from '@tanstack/react-router'
import { ImageIcon, Minus, Plus, Sparkles, X } from 'lucide-react'
import { useMemo } from 'react'
import { Form } from '@/components/custom/form'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { usePOS } from '@/hooks/use-pos'
import { PosStockEngine, type posItem } from '@/lib/conversion/pos-stock-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { MountProps } from '@/lib/mount-manager'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import { cn } from '@/lib/utils'

interface ProductDialogProps extends MountProps {
  product: posProduct
  cartItems: posItem[]
  onConfirm: (item: posItem) => void
}

export function ProductDialog({ open, onClose, cartItems, product, onConfirm }: ProductDialogProps) {
  const { orderId, search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
  const { orderItems } = usePOS({ orderId, searchQuery: search, page, pageSize })

  const hasMultipleVariants = useMemo(() => (product.variants?.length ?? 0) > 1, [product])

  const form = useForm({
    defaultValues: {
      selectedVariantId: product.variants?.[0]?.id || '',
      selectedAddonIds: [] as string[],
      quantity: 1,
    },
    onSubmit: async ({ value }) => {
      const selectedVariant = product.variants?.find(v => v.id === value.selectedVariantId)
      if (!selectedVariant) return

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
  const currentQuantity = useStore(form.store, s => s.values.quantity)

  const currentVariant = useMemo(() => product.variants?.find(v => v.id === selectedVariantId), [product, selectedVariantId])
  const availableAddons = useMemo(() => currentVariant?.components?.filter(c => c.isAddon) || [], [currentVariant])

  const remainingYield = useMemo(() => {
    if (!currentVariant) return 0
    return PosStockEngine.calculateRemainingYield(product, currentVariant, selectedAddonIds, cartItems, orderItems)
  }, [product, currentVariant, selectedAddonIds, cartItems, orderItems])

  // Calculates total price live including chosen options and quantities
  const dynamicTotalPrice = useMemo(() => {
    if (!currentVariant) return 0
    const basePrice = Number(currentVariant.price)
    const addonsPrice = selectedAddonIds.reduce((sum, addonId) => {
      const addon = availableAddons.find(a => a.id === addonId)
      return sum + (addon ? Number(addon.priceOverride) : 0)
    }, 0)
    return (basePrice + addonsPrice) * currentQuantity
  }, [currentVariant, selectedAddonIds, availableAddons, currentQuantity])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Note: We add hide-close-button or target styling if your Radix setup allows it, 
          or simply let our prominent native element override the design */}
      <DialogContent className='sm:max-w-[440px] p-0 overflow-hidden gap-0 rounded-3xl [&>button]:hidden'>
        {/* --- HERO IMAGE HEADER --- */}
        <div className='relative w-full h-48 bg-muted flex items-center justify-center overflow-hidden border-b select-none'>
          <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
            <AvatarImage 
              src={product?.image ?? ''} 
              alt={product?.name} 
              className='object-cover' 
            />
            <AvatarFallback className='rounded-none bg-muted flex flex-col items-center justify-center gap-2'>
              <ImageIcon className='w-8 h-8 stroke-[1.5] text-muted-foreground/60' />
              <span className='text-xs font-medium tracking-wide uppercase text-muted-foreground/60'>No Preview Available</span>
            </AvatarFallback>
          </Avatar>

          {/* Top Left: Stock State */}
          <div className='absolute top-4 left-4 z-10'>
            <Badge
              className={cn(
                'backdrop-blur-md border-none px-3 py-1 text-xs font-bold shadow-sm',
                remainingYield > 0 ? 'bg-emerald-500/90 text-white' : 'bg-destructive/90 text-white',
              )}
            >
              {remainingYield <= 0 ? 'Out of Stock' : remainingYield >= 999 ? 'Available' : `${remainingYield} units left`}
            </Badge>
          </div>

          {/* Top Right: High-Contrast Prominent Close Control */}
          <Button
            type='button'
            variant='secondary'
            size='icon'
            onClick={onClose}
            className='absolute top-4 right-4 z-10 rounded-full w-9 h-9 bg-background/80 hover:bg-background text-foreground shadow-md backdrop-blur-sm border border-muted/20 transition-transform active:scale-95'
          >
            <X className='size-4 stroke-[2.5]' />
          </Button>
        </div>

        {/* --- MAIN CONTENT WINDOW --- */}
        <div className='p-6'>
          <div className='flex items-start justify-between gap-4'>
            <div className='space-y-0.5 truncate'>
              <h3 className='text-xl font-black tracking-tight text-foreground truncate'>{product?.name}</h3>
              {product?.category?.name && (
                <span className='text-xs font-bold text-muted-foreground uppercase tracking-wider block'>{product.category.name}</span>
              )}
            </div>

            {/* Contextual Single-Price display if structural alternatives are absent */}
            {!hasMultipleVariants && currentVariant && (
              <div className='text-right shrink-0'>
                <span className='text-lg font-black font-mono text-primary bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/10 block'>
                  {PriceEngine.format(Number(currentVariant.price))}
                </span>
              </div>
            )}
          </div>

          <Form onSubmit={form.handleSubmit} className='grid gap-6 mt-5'>
            {/* --- MULTIPLE OPTION SELECTOR --- */}
            {hasMultipleVariants && product.variants && (
              <form.Field name='selectedVariantId'>
                {field => (
                  <div className='space-y-2.5'>
                    <h4 className='font-bold text-xs uppercase tracking-widest text-muted-foreground/80'>Select Option</h4>
                    <RadioGroup
                      value={field.state.value}
                      onValueChange={val => {
                        field.handleChange(val)
                        form.setFieldValue('selectedAddonIds', [])
                      }}
                      className='grid grid-cols-2 gap-2.5'
                    >
                      {product.variants.map(v => (
                        <div key={v.id}>
                          <RadioGroupItem value={v.id} id={v.id} className='peer sr-only' />
                          <Label
                            htmlFor={v.id}
                            className='flex flex-col items-start justify-between rounded-2xl border-2 border-muted p-3.5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 transition-all cursor-pointer h-[72px]'
                          >
                            <span className='text-sm font-bold line-clamp-1 text-foreground'>{v.name}</span>
                            <span className='text-xs font-bold font-mono text-primary/90'>{PriceEngine.format(Number(v.price))}</span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}
              </form.Field>
            )}

            {/* --- CUSTOMIZATIONS & EXTRA ADDONS --- */}
            {availableAddons.length > 0 && (
              <form.Field name='selectedAddonIds'>
                {field => (
                  <div className='space-y-2.5'>
                    <h4 className='font-bold text-xs uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1.5'>
                      <Sparkles className='w-3 h-3 text-amber-500 fill-amber-500' /> Modifiers
                    </h4>
                    <div className='grid gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin'>
                      {availableAddons.map(comp => {
                        const reserved = PosStockEngine.getReservedMap(cartItems, orderItems)
                        const stockInfo = PosStockEngine.findPhysicalStock(comp.materialId, [product])
                        const isSoldOut = stockInfo.stock - (reserved[comp.materialId] || 0) < comp.quantityUsed

                        return (
                          <label
                            htmlFor={comp.id}
                            key={comp.id}
                            className={cn(
                              'flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200',
                              isSoldOut ? 'opacity-40 grayscale pointer-events-none' : 'bg-muted/40 cursor-pointer hover:bg-muted/70',
                              field.state.value.includes(comp.id) ? 'border-primary bg-primary/[0.03]' : 'border-transparent',
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
                                className='rounded-md w-4 h-4'
                              />
                              <Label htmlFor={comp.id} className='text-xs font-bold text-foreground/90 cursor-pointer'>
                                {comp.material.product.name} {isSoldOut && '(Sold Out)'}
                              </Label>
                            </div>
                            <span className='text-xs font-mono font-bold text-primary'>+{PriceEngine.format(Number(comp.priceOverride))}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </form.Field>
            )}

            {/* --- COUNT & COMPUTE ACTIONS FOOTER --- */}
            <div className='flex items-center justify-between pt-4 border-t border-muted mt-1'>
              <form.Field name='quantity'>
                {field => (
                  <div className='flex items-center gap-1 bg-muted/60 rounded-2xl p-1 border border-muted-foreground/10'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='rounded-xl w-9 h-9 hover:bg-background text-foreground'
                      onClick={() => field.handleChange(Math.max(1, field.state.value - 1))}
                    >
                      <Minus className='size-4' />
                    </Button>
                    <span className='font-mono font-black w-8 text-center text-base text-foreground'>{field.state.value}</span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='rounded-xl w-9 h-9 hover:bg-background text-foreground'
                      disabled={remainingYield < 999 && field.state.value >= remainingYield}
                      onClick={() => field.handleChange(field.state.value + 1)}
                    >
                      <Plus className='size-4' />
                    </Button>
                  </div>
                )}
              </form.Field>

              <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting, state.values.quantity]}>
                {([canSubmit, isSubmitting, qty]) => (
                  <Button
                    type='submit'
                    disabled={!canSubmit || (remainingYield < 999 && Number(qty) > remainingYield) || remainingYield === 0}
                    className='rounded-2xl h-11 px-6 font-bold shadow-sm transition-all active:scale-[0.98] flex items-center gap-2 justify-between min-w-[160px]'
                  >
                    <span>{isSubmitting ? 'Processing...' : remainingYield === 0 ? 'Sold Out' : 'Add to Order'}</span>
                    {remainingYield > 0 && (
                      <span className='pl-2 border-l border-primary-foreground/20 font-mono text-xs opacity-95'>{PriceEngine.format(dynamicTotalPrice)}</span>
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
