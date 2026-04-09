import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { withForm } from '@/hooks/form'
import { VAT_RATE } from '@/lib/constants'
import { InventoryEngine } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/overlay'
import { CreditCard, Minus, Plus, UserPlus } from 'lucide-react'
import { posFormOpts } from '..'
import { PaymentDialog } from './payment-dialog'

export const CartAside = withForm({
  ...posFormOpts,
  render: function ({ form }) {
    const handleConfirm = (total: number) => {
      showModal(PaymentDialog, {
        total,
        onConfirm: async tendered => {
          form.setFieldValue('payment', { tendered })
          await form.handleSubmit()
        },
      })
    }

    return (
      <aside className='w-96 bg-card rounded-[2.5rem] border border-border flex flex-col shadow-xl space-y-2'>
        <div className='pt-6 px-6 space-y-2'>
          <div className='flex justify-between items-center'>
            <h2 className='text-xl font-black'>Current Order</h2>
            <form.Subscribe selector={s => s.values.items}>
              {items => {
                const totalQty = items.reduce((acc, item) => acc + (item.quantity || 0), 0)
                const uniqueItems = items.length

                return (
                  <div className='flex gap-2'>
                    <Badge variant='secondary' className='rounded-lg px-2 py-0.5 text-[10px]'>
                      {uniqueItems} {uniqueItems === 1 ? 'type' : 'types'}
                    </Badge>
                    <Badge variant='outline' className='rounded-lg bg-primary/5 px-2 py-0.5 text-[10px]'>
                      {totalQty} total qty
                    </Badge>
                  </div>
                )
              }}
            </form.Subscribe>
          </div>

          <form.AppField name='customerName'>
            {field => (
              <Button
                variant='ghost'
                className='w-full justify-start h-12 rounded-2xl border border-dashed border-border text-muted-foreground hover:bg-muted/50 transition-colors'
              >
                <UserPlus className='w-4 h-4 mr-2 text-primary' />
                <span className='text-xs font-semibold'>{field.state.value || 'Attach Customer'}</span>
              </Button>
            )}
          </form.AppField>
        </div>

        <ScrollArea className='flex-1 px-6 h-1 grow'>
          <div className='py-6'>
            <form.Field name='items'>
              {field => (
                <div className='space-y-6'>
                  {field.state.value.map((item, index: number) => {
                    const selectedAddonIds = item.addons?.map(a => a.id) || []
                    const additionalYieldPossible = InventoryEngine.calculateRemainingYield(item.product, item.variant, selectedAddonIds, field.state.value)

                    return (
                      <div key={item.cartId} className='group animate-in fade-in slide-in-from-right-4'>
                        <div className='flex items-start gap-4'>
                          <div className='flex-1 min-w-0'>
                            <p className='font-bold text-sm leading-tight truncate'>{item.product.name}</p>
                            {item.variant?.name && <p className='text-[10px] font-bold text-primary uppercase tracking-tight'>{item.variant.name}</p>}

                            {/* --- COMPONENT ADDONS --- */}
                            {item.addons && item.addons.length > 0 && (
                              <div className='mt-2 space-y-1.5 ml-1 border-l-2 border-primary/20 pl-3'>
                                {item.addons.map(addon => (
                                  <div key={addon.id} className='flex justify-between items-center group/addon text-[10px]'>
                                    <span className='text-muted-foreground font-medium'>{addon.material.product.name}</span>
                                    <div className='flex items-center gap-2'>
                                      <span className='font-mono font-bold text-foreground/70'>{PriceEngine.format(Number(addon.priceOverride))}</span>
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

                          {/* --- QUANTITY CONTROLS --- */}
                          <div className='flex flex-col items-end gap-2'>
                            <p className='text-xs font-black font-mono'>{PriceEngine.format(Number(item.variant?.price))}</p>
                            <div className='flex items-center gap-2 bg-muted/50 rounded-xl p-1 border border-border'>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6 rounded-lg'
                                onClick={() => {
                                  if (item.quantity > 1) form.setFieldValue(`items[${index}].quantity`, item.quantity - 1)
                                  else form.removeFieldValue('items', index)
                                }}
                              >
                                <Minus className='w-3' />
                              </Button>
                              <span className='text-xs font-black w-4 text-center'>{item.quantity}</span>
                              <Button
                                size='icon'
                                variant='ghost'
                                className='h-6 w-6 rounded-lg'
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
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </form.Field>
          </div>
        </ScrollArea>

        <form.Subscribe selector={s => s.values.items}>
          {items => {
            const subtotal = items.reduce((acc, item) => {
              const itemBase = Number(item.variant?.price) * item.quantity
              // Addons are already multiplied by item.quantity inside this loop
              const addonsBase = item.addons?.reduce((a, b) => a + Number(b.priceOverride), 0) || 0
              return acc + itemBase + addonsBase * item.quantity
            }, 0)
            const tax = subtotal * VAT_RATE
            const total = subtotal + tax

            return (
              <div className='p-6 bg-muted/30 border-t border-border space-y-4 rounded-t-[2rem]'>
                <div className='space-y-1.5'>
                  <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                    <span>Subtotal</span>
                    <span className='font-mono'>{PriceEngine.format(subtotal)}</span>
                  </div>
                  <div className='flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider'>
                    <span>VAT ({VAT_RATE * 100}%)</span>
                    <span className='font-mono'>{PriceEngine.format(tax)}</span>
                  </div>
                  <Separator className='my-3 bg-border/50' />
                  <div className='flex justify-between items-end'>
                    <span className='text-sm font-black uppercase'>Grand Total</span>
                    <span className='text-2xl font-black text-primary font-mono tracking-tighter'>{PriceEngine.format(total)}</span>
                  </div>
                </div>
                <Button
                  disabled={items.length === 0}
                  className='w-full py-8 rounded-2xl text-lg font-black shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]'
                  onClick={() => handleConfirm(total)}
                >
                  <CreditCard className='mr-3 h-6 w-6' />
                  PAY NOW
                </Button>
              </div>
            )
          }}
        </form.Subscribe>
      </aside>
    )
  },
})
