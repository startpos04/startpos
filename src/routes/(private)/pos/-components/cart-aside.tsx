import { useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { CreditCard, Minus, Plus, UserPlus } from 'lucide-react'
import { PriceConfiguration } from 'prisma/generated/prisma/enums'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { withForm } from '@/hooks/form'
import { usePOS } from '@/hooks/use-pos'
import { InventoryEngine } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { TaxEngine, type TaxEngineConfig } from '@/lib/conversion/tax-engine'
import { showModal } from '@/lib/overlay'
import { authStore } from '@/store/auth-store'
import { posFormOpts } from '..'
import { PaymentDialog } from './payment-dialog'
import { ProductItemsModal } from './product-items'

export const CartAside = withForm({
  ...posFormOpts,
  render: ({ form }) => {
    const order = useStore(form.store, s => s.values.order)
    const { search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
    const { orderItems } = usePOS({ orderId: order?.id, searchQuery: search, page, pageSize })
    const user = useStore(authStore, s => s.user)
    const navigate = useNavigate()

    const vatConfig: TaxEngineConfig = {
      vatRate: user.systemConfigs.VAT_RATE / 100,
      priceConfiguration: user.systemConfigs.PRICE_CONFIGURATION || PriceConfiguration.INCLUSIVE,
      isVatRegistered: user.systemConfigs.IS_VAT_REGISTERED ?? true,
    }

    const handleConfirm = (total: number) => {
      showModal(PaymentDialog, {
        total,
        onConfirm: async payments => {
          form.setFieldValue('payments', payments)
          await form.handleSubmit()
        },
        onSave: async () => {
          form.setFieldValue('payments', [])
          await form.handleSubmit()
        },
      })
    }

    const handleNewOrder = () => {
      form.reset()
      navigate({ to: '.', search: prev => ({ ...prev, orderId: undefined }), replace: true })
    }

    const handleAddItem = () => {
      showModal(ProductItemsModal, { form })
    }

    return (
      <aside className='md:w-96 grow md:grow-0 md:bg-card rounded-[2.5rem] md:border border-border flex flex-col shadow-xl space-y-2'>
        <div className='md:pt-6 pt-0 px-0 md:px-6 space-y-2 select-none'>
          <div className='flex justify-between items-center'>
            <h2 className='text-xl font-black'>{order ? `Order ${order.orderNumber}` : 'New Order'}</h2>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={handleNewOrder}
              className='h-8 px-2 text-[10px] font-bold border border-dashed rounded-lg hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-all'
            >
              NEW ORDER
            </Button>
          </div>

          <form.AppField name='customerReference'>
            {field => (
              <div className='relative w-full'>
                <UserPlus className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary pointer-events-none' />
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value || ''}
                  onBlur={field.handleBlur}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder='Customer Name / Table #'
                  className='h-8 md:h-12 pl-10 rounded-2xl border-dashed border-border bg-transparent focus-visible:border-solid focus-visible:ring-primary/20 transition-all placeholder:text-muted-foreground placeholder:text-xs text-sm font-medium'
                />
              </div>
            )}
          </form.AppField>
        </div>

        <form.Subscribe selector={s => s.values.items}>
          {items => {
            const totalQty = items.reduce((acc, item) => acc + (item.quantity || 0), 0)
            const uniqueItems = items.length

            return (
              <div className='flex gap-6 justify-center select-none'>
                <Badge variant='secondary' className='rounded-lg px-2 py-0.5 text-[10px] font-bold'>
                  {uniqueItems} {uniqueItems === 1 ? 'item' : 'items'}
                </Badge>
                <Badge variant='outline' className='rounded-lg bg-primary/5 px-2 py-0.5 text-[10px] font-bold'>
                  {totalQty} quantity
                </Badge>
              </div>
            )
          }}
        </form.Subscribe>

        <ScrollArea className='flex-1 px-6 h-1 grow'>
          <div className='py-2'>
            <form.Field name='items'>
              {field => (
                <div className='space-y-4'>
                  {field.state.value.map((item, index: number) => {
                    const selectedAddonIds = item.addons?.map(a => a.id) || []
                    const additionalYieldPossible = InventoryEngine.calculateRemainingYield(
                      item.product,
                      item.variant,
                      selectedAddonIds,
                      field.state.value,
                      orderItems,
                    )

                    const currentLineTotal = TaxEngine.buildLineItems([item]).reduce((sum, line) => sum + line.grossAmount, 0)

                    return (
                      <div key={item.cartId} className='group animate-in fade-in slide-in-from-right-4 duration-200'>
                        <div className='flex items-start justify-between gap-4'>
                          <div className='flex-1 min-w-0'>
                            <p className='font-bold text-sm leading-tight text-foreground truncate'>{item.product.name}</p>
                            {item.variant?.name && <p className='text-[10px] font-bold text-primary uppercase tracking-tight mt-0.5'>{item.variant.name}</p>}

                            {/* --- COMPONENT ADDONS --- */}
                            {item.addons && item.addons.length > 0 && (
                              <div className='mt-2 space-y-1.5 ml-1 border-l-2 border-primary/20 pl-3'>
                                {item.addons.map(addon => (
                                  <div key={addon.id} className='flex justify-between items-center group/addon text-[10px]'>
                                    <span className='text-muted-foreground font-medium'>{addon.material.product.name}</span>
                                    <div className='flex items-center gap-2'>
                                      <span className='font-mono font-bold text-foreground/70'>+{PriceEngine.format(Number(addon.priceOverride))}</span>
                                      <button
                                        type='button'
                                        className='opacity-0 group-hover/addon:opacity-100 text-destructive p-0.5 hover:bg-destructive/10 rounded transition-all'
                                        onClick={() => {
                                          const newAddons = item.addons.filter(a => a.id !== addon.id)
                                          form.setFieldValue(`items[${index}].addons`, newAddons)
                                        }}
                                      >
                                        <Minus className='w-2.5 h-2.5' />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* --- QUANTITY & PRICING CONTROLS --- */}
                          <div className='flex flex-col items-end gap-1.5 shrink-0 select-none'>
                            <div className='flex items-center gap-2 bg-muted/50 rounded-xl p-1 border border-border'>
                              <Button
                                type='button'
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6 rounded-lg text-foreground'
                                onClick={() => {
                                  if (item.quantity > 1) form.setFieldValue(`items[${index}].quantity`, item.quantity - 1)
                                  else form.removeFieldValue('items', index)
                                }}
                              >
                                <Minus className='w-3' />
                              </Button>

                              {/* The dynamic key attribute forces an execution repaint, executing our bump class */}
                              <span key={item.quantity} className='text-xs font-black w-4 text-center text-foreground inline-block animate-scale-bump'>
                                {item.quantity}
                              </span>

                              <Button
                                type='button'
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6 rounded-lg text-foreground'
                                disabled={additionalYieldPossible === 0}
                                onClick={() => {
                                  if (additionalYieldPossible > 0) {
                                    form.setFieldValue(`items[${index}].quantity`, item.quantity + 1)
                                  }
                                }}
                              >
                                <Plus className='w-3' />
                              </Button>
                            </div>

                            {/* Prominent individual item total layout section */}
                            <span className='text-xs font-bold font-mono text-foreground/90 tracking-tight pr-1'>{PriceEngine.format(currentLineTotal)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </form.Field>
            <div className='md:hidden flex justify-center mt-6'>
              <Button type='button' onClick={handleAddItem}>
                <Plus className='h-4 w-4' />
                Add Item
              </Button>
            </div>
          </div>
        </ScrollArea>

        {/* --- ORDER TOTALS --- */}
        <form.Subscribe selector={s => s.values.items}>
          {items => {
            const summary = TaxEngine.summarize(TaxEngine.buildLineItems(items), vatConfig)

            const hasVatableSales = summary.vatableSales > 0
            const hasExemptSales = summary.vatExemptSales > 0
            const hasZeroRated = summary.zeroRatedSales > 0

            return (
              <div className='p-4 md:p-6 bg-muted/30 border-t border-border space-y-4 rounded-t-[2rem] select-none'>
                <div className='space-y-1.5'>
                  <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                    <span>Subtotal</span>
                    <span className='font-mono'>{PriceEngine.format(summary.subtotal)}</span>
                  </div>

                  {vatConfig.isVatRegistered && (
                    <>
                      {hasVatableSales && (
                        <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                          <span>Vatable Sales</span>
                          <span className='font-mono'>{PriceEngine.format(summary.vatableSales)}</span>
                        </div>
                      )}
                      {hasVatableSales && (
                        <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                          <span>VAT ({summary.vatRate}%)</span>
                          <span className='font-mono'>{PriceEngine.format(summary.vatAmount)}</span>
                        </div>
                      )}
                      {hasExemptSales && (
                        <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                          <span>VAT-Exempt</span>
                          <span className='font-mono'>{PriceEngine.format(summary.vatExemptSales)}</span>
                        </div>
                      )}
                      {hasZeroRated && (
                        <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                          <span>Zero-Rated</span>
                          <span className='font-mono'>{PriceEngine.format(summary.zeroRatedSales)}</span>
                        </div>
                      )}
                    </>
                  )}

                  <Separator className='mt-3 bg-border/50' />

                  <div className='flex justify-between items-end'>
                    <span className='text-sm font-black uppercase'>Grand Total</span>
                    <span key={summary.totalAmount} className='text-2xl font-black text-primary font-mono tracking-tighter inline-block animate-scale-bump'>
                      {PriceEngine.format(summary.totalAmount)}
                    </span>
                  </div>
                </div>

                <Button
                  type='button'
                  disabled={items.length === 0}
                  className='w-full py-6 md:py-7 rounded-2xl text-lg font-black shadow-lg shadow-primary/10 transition-transform active:scale-[0.99] flex items-center justify-center gap-2'
                  onClick={() => handleConfirm(summary.totalAmount)}
                >
                  <CreditCard className='h-5 w-5 stroke-[2.5]' />
                  CHECKOUT
                </Button>
              </div>
            )
          }}
        </form.Subscribe>
      </aside>
    )
  },
})
