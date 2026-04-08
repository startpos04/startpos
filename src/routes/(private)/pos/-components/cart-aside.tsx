import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { withForm } from '@/hooks/form'
import { VAT_RATE } from '@/lib/constants'
import { InventoryEngine } from '@/lib/conversion/inventory-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/overlay'
import { cn } from '@/lib/utils'
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
                // Calculate total quantity by summing the 'quantity' field of each item
                const totalQty = items.reduce((acc, item) => acc + (item.quantity || 0), 0)
                const uniqueItems = items.length

                return (
                  <div className='flex gap-2'>
                    <Badge variant='secondary' className='rounded-lg'>
                      {uniqueItems} {uniqueItems === 1 ? 'item' : 'items'}
                    </Badge>
                    <Badge variant='outline' className='rounded-lg bg-primary/5'>
                      {totalQty} quantity
                    </Badge>
                  </div>
                )
              }}
            </form.Subscribe>
          </div>

          <form.AppField name='customerName'>
            {field => (
              <Button variant='ghost' className='w-full justify-start h-12 rounded-xl border border-dashed border-border text-muted-foreground'>
                <UserPlus className='w-4 h-4 mr-2' />
                {field.state.value || 'Attach Customer'}
              </Button>
            )}
          </form.AppField>
        </div>

        <ScrollArea className='flex-1 px-6 h-1 grow'>
          <div className='py-6'>
            <form.Field name='items'>
              {field => (
                <div className='space-y-4'>
                  {field.state.value.map((item, index: number) => {
                    const selectedAddonIds = item.addons?.map(a => a.id) || []
                    const additionalYieldPossible = InventoryEngine.calculateRemainingYield(item.product, selectedAddonIds, field.state.value)

                    return (
                      <div key={item.cartId} className='group animate-in fade-in slide-in-from-right-4'>
                        <div className='flex items-start gap-3'>
                          <div className='flex-1'>
                            <p className='font-bold text-sm leading-none'>{item.variant?.name || item.product.name}</p>
                            <p className='text-[10px] text-muted-foreground mt-1'>{PriceEngine.format(item.variant?.price || item.product.price)}</p>
                            {item.addons && item.addons.length > 0 && (
                              <div className='mt-2 space-y-1 ml-2 border-l-2 border-muted pl-2'>
                                {Object.values(
                                  item.addons.reduce(
                                    (acc, curr) => {
                                      const id = curr.addonId
                                      if (!acc[id]) {
                                        acc[id] = { ...curr, count: 1 }
                                      } else {
                                        acc[id].count += 1
                                      }
                                      return acc
                                    },
                                    {} as Record<string, (typeof item.addons)[number] & { count: number }>,
                                  ),
                                ).map(groupedAddon => (
                                  <div key={groupedAddon.addonId} className='flex justify-between items-center group/addon text-[10px]'>
                                    <span className='text-muted-foreground'>
                                      <span className='font-bold text-primary mr-1'>{groupedAddon.count}x</span>
                                      {groupedAddon.addon.name}
                                    </span>
                                    <div className='flex items-center gap-2'>
                                      <span className='text-muted-foreground/70'>
                                        {PriceEngine.format(Number(groupedAddon.priceOverride) * groupedAddon.count)}
                                      </span>
                                      <button
                                        type='button'
                                        className='opacity-0 group-hover/addon:opacity-100 text-destructive hover:scale-110 transition-all cursor-pointer'
                                        onClick={() => {
                                          // Find the first index of this specific addon and remove it
                                          const targetIndex = item.addons?.findIndex(a => a.addonId === groupedAddon.addonId)
                                          if (targetIndex !== -1) {
                                            const newAddons = [...(item.addons || [])]
                                            newAddons.splice(targetIndex!, 1)
                                            form.setFieldValue(`items[${index}].addons`, newAddons)
                                          }
                                        }}
                                      >
                                        <Minus className='w-2.5 h-2.5' />
                                      </button>
                                      <button
                                        type='button'
                                        disabled={additionalYieldPossible === 0}
                                        className={cn(
                                          'opacity-0 group-hover/addon:opacity-100 transition-all',
                                          additionalYieldPossible === 0 ? 'text-muted cursor-not-allowed' : 'text-green-600',
                                        )}
                                        onClick={() => {
                                          // 1. Get the current list of addons
                                          const currentAddons = item.addons || []

                                          // 2. Find the original addon data from the current list to ensure we keep the same price/structure
                                          const addonToDuplicate = currentAddons.find(a => a.addonId === groupedAddon.addonId)

                                          if (addonToDuplicate && additionalYieldPossible > 0) {
                                            // 3. Push a new copy of that addon into the array
                                            form.setFieldValue(`items[${index}].addons`, [...currentAddons, { ...addonToDuplicate }])
                                          }
                                        }}
                                      >
                                        <Plus className='w-2.5 h-2.5' />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className='flex items-center gap-2 bg-muted rounded-lg p-1'>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='h-6 w-6'
                              onClick={() => {
                                if (item.quantity > 1) form.setFieldValue(`items[${index}].quantity`, item.quantity - 1)
                                else form.removeFieldValue('items', index)
                              }}
                            >
                              <Minus className='w-3' />
                            </Button>
                            <span className='text-xs font-bold w-4 text-center'>{item.quantity}</span>
                            <Button
                              size='icon'
                              variant='ghost'
                              className='h-6 w-6'
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
              const itemBase = Number(item.variant?.price || item.product.price) * item.quantity
              const addonsBase = item.addons?.reduce((a, b) => a + Number(b.priceOverride) * item.quantity, 0) || 0
              return acc + itemBase + addonsBase
            }, 0)
            const total = subtotal * (1 + VAT_RATE)

            return (
              <div className='p-6 bg-muted/20 border-t border-border space-y-4'>
                <div className='space-y-2 text-xs font-medium'>
                  <div className='flex justify-between text-muted-foreground'>
                    <span>Subtotal</span>
                    <span>{PriceEngine.format(subtotal)}</span>
                  </div>
                  <div className='flex justify-between text-muted-foreground'>
                    <span>VAT ({VAT_RATE * 100}%)</span>
                    <span>{PriceEngine.format(subtotal * VAT_RATE)}</span>
                  </div>
                  <Separator className='my-2' />
                  <div className='flex justify-between text-xl font-black'>
                    <span>Total</span>
                    <span className='text-primary'>{PriceEngine.format(total)}</span>
                  </div>
                </div>
                <Button disabled={items.length === 0} className='w-full py-8 rounded-2xl text-lg font-black' onClick={() => handleConfirm(total)}>
                  <CreditCard className='mr-2 h-6! w-6!' />
                  Pay Now
                </Button>
              </div>
            )
          }}
        </form.Subscribe>
      </aside>
    )
  },
})
