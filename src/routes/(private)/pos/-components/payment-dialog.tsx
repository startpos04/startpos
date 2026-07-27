import { useForm } from '@tanstack/react-form'
import { useStore } from '@tanstack/react-store'
import { Banknote, CreditCard, Plus, Trash2 } from 'lucide-react'
import { PaymentMethod } from 'prisma/generated/prisma/enums'
import z from 'zod'
import { LoadingPrompt } from '@/components/custom/prompt/loading-prompt'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PriceEngine } from '@/lib/conversion/price-engine'
import MountManager from '@/lib/mount-manager'
import { cn } from '@/lib/utils'

export const PAYMENT_PLATFORMS = {
  CASH: { id: 'cash', name: 'Cash', type: PaymentMethod.CASH },
  GCASH: { id: 'gcash', name: 'GCash', type: PaymentMethod.E_WALLET },
  MAYA: { id: 'maya', name: 'Maya', type: PaymentMethod.E_WALLET },
  BDO: { id: 'bdo_card', name: 'BDO Credit/Debit', type: PaymentMethod.CARD },
} as const

export type PaymentPlatformId = (typeof PAYMENT_PLATFORMS)[keyof typeof PAYMENT_PLATFORMS]['id']

const paymentLineSchema = z.object({
  id: z.string(),
  method: z.enum(PaymentMethod),
  platform: z.string(),
  tendered: z.number().min(0, 'Tendered must be positive'),
  referenceNo: z.string().optional(),
  discount: z.number().optional(),
  scPwdDiscount: z.number().optional(),
})

export type PaymentLine = z.infer<typeof paymentLineSchema>

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  total: number
  onConfirm: (payments: PaymentLine[]) => void
  onSave: () => void
  disabled?: boolean
}

export function PaymentDialog({ open, onClose, total, onConfirm }: PaymentDialogProps) {
  const form = useForm({
    defaultValues: {
      payments: [{ id: '1', method: PaymentMethod.CASH, platform: 'cash', tendered: 0, referenceNo: '' }] as PaymentLine[],
    },
    validators: {
      onChange: z.object({
        payments: z
          .array(paymentLineSchema)
          .min(1)
          .refine(
            payments => {
              const totalPaidCombined = payments.reduce((sum, item) => sum + item.tendered, 0)
              return totalPaidCombined >= total
            },
            { message: 'Combined payments must meet or exceed total bill amount' },
          ),
      }),
    },
    onSubmit: async ({ value }) => {
      const modalId = await MountManager.show(LoadingPrompt, {
        icon: <Banknote className='h-10! w-10! text-emerald-500 animate-pulse' />,
        title: 'Processing Payment Ledger',
        description: 'Finalizing dynamic split allocations and updating system registries. Please wait...',
      })

      await onConfirm(value.payments)

      MountManager.close(modalId)
      onClose()
      form.reset()
    },
  })

  const paymentsState = useStore(form.store, state => state.values.payments)
  const isFormValid = useStore(form.store, state => state.isValid)

  // Live aggregated computations
  const totalPaidCombined = paymentsState.reduce((sum, item) => sum + item.tendered, 0)
  const remainingDue = total - totalPaidCombined
  const isOverpaid = remainingDue < 0

  const runningChange = isOverpaid ? Math.abs(remainingDue) : 0
  const runningBalance = isOverpaid ? 0 : remainingDue

  const canSubmit = isFormValid && totalPaidCombined >= total

  const handleClose = () => {
    onClose()
    form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className='sm:max-w-140 p-6 md:p-8 bg-background max-h-[92vh] overflow-y-auto rounded-3xl'
        onEscapeKeyDown={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className='text-2xl font-black text-center'>Checkout Summary</DialogTitle>
        </DialogHeader>

        <div className='py-2 space-y-5'>
          <div className='space-y-3'>
            <div className='flex justify-between items-center px-1'>
              <div className='text-sm font-black text-foreground/80'>Payment Methods</div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  const nextAmount = remainingDue > 0 ? remainingDue : 0
                  form.pushFieldValue('payments', {
                    id: crypto.randomUUID(),
                    method: PaymentMethod.CARD,
                    platform: 'bdo_card',
                    tendered: nextAmount,
                    referenceNo: '',
                  })
                }}
                className='h-8 gap-1 rounded-lg text-xs font-bold border-2 border-primary/30 hover:border-primary text-primary'
              >
                <Plus className='w-3.5 h-3.5' /> Add Payment Method
              </Button>
            </div>

            <form.Field name='payments' mode='array'>
              {field => (
                <div className='space-y-3 max-h-[45vh] overflow-y-auto pr-1'>
                  {field.state.value.map((payment, index) => (
                    <div
                      key={payment.id}
                      className='p-4 bg-muted/30 border-2 border-border/70 rounded-2xl space-y-3 relative animate-in fade-in slide-in-from-top-1 duration-150'
                    >
                      <div className='flex items-center gap-3'>
                        <div className='w-2/5'>
                          <Select
                            value={payment.platform}
                            onValueChange={val => {
                              const targetPlatform = Object.values(PAYMENT_PLATFORMS).find(p => p.id === val)
                              if (targetPlatform) {
                                form.setFieldValue(`payments[${index}].platform`, val)
                                form.setFieldValue(`payments[${index}].method`, targetPlatform.type)

                                // Explicitly nullify or write an empty string to reset validation state
                                form.setFieldValue(`payments[${index}].referenceNo`, '')

                                // Re-run form validations asynchronously
                                setTimeout(() => form.validate('change'), 0)
                              }
                            }}
                          >
                            <SelectTrigger className='h-11 font-semibold bg-background rounded-xl border-border'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='cash'>💵 Cash</SelectItem>
                              <SelectItem value='bdo_card'>💳 Card (BDO)</SelectItem>
                              <SelectItem value='gcash'>📱 GCash</SelectItem>
                              <SelectItem value='maya'>💳 Maya</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className='flex-1 relative'>
                          <span className='absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground'>Amt:</span>
                          <Input
                            type='number'
                            className='h-11 pl-12 text-base font-bold rounded-xl bg-background border-border'
                            placeholder='0.00'
                            value={payment.tendered === 0 ? '' : payment.tendered / 100}
                            onChange={e => {
                              form.setFieldValue(`payments[${index}].tendered`, Number(e.target.value) * 100)
                              form.validate('change')
                            }}
                          />
                        </div>

                        {field.state.value.length > 1 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            onClick={() => {
                              field.removeValue(index)
                              setTimeout(() => form.validate('change'), 0)
                            }}
                            className='h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive'
                          >
                            <Trash2 className='w-4 h-4' />
                          </Button>
                        )}
                      </div>

                      {payment.platform !== 'cash' && (
                        <form.Field
                          name={`payments[${index}].referenceNo`}
                          validators={{
                            onChange: ({ value }) => {
                              if (!value || value.trim().length === 0) {
                                return 'Reference number is required for digital payments'
                              }
                              return undefined
                            },
                          }}
                        >
                          {field => {
                            const hasError = field.state.meta.errors.length > 0

                            return (
                              <div className='space-y-1.5 animate-in slide-in-from-top-1 fade-in duration-200'>
                                <div className='relative'>
                                  <CreditCard
                                    className={cn(
                                      'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors',
                                      hasError ? 'text-destructive' : 'text-muted-foreground',
                                    )}
                                  />
                                  <Input
                                    type='text'
                                    className={cn(
                                      'h-9 pl-10 text-xs font-medium rounded-lg bg-background transition-colors',
                                      hasError ? 'border-destructive focus-visible:ring-destructive' : 'border-border/80',
                                    )}
                                    placeholder={`Enter reference token key for this ${payment.method}`}
                                    value={field.state.value || ''}
                                    onChange={e => field.handleChange(e.target.value)}
                                    onBlur={field.handleBlur}
                                  />
                                </div>

                                {/** biome-ignore lint/suspicious/noExplicitAny: fix later */}
                                {hasError && <p className='text-xs text-red-500'>{field.state.meta.errors.map((err: any) => err.message ?? err).join(', ')}</p>}
                              </div>
                            )
                          }}
                        </form.Field>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </form.Field>
          </div>

          <hr className='border-border/60 my-2' />

          {/* Bottom Consolidated Summary Block */}
          <div className='bg-muted/40 p-4 rounded-2xl border border-border/80 space-y-2.5 text-sm font-bold'>
            <div className='flex justify-between items-center text-muted-foreground'>
              <span>Total Bill:</span>
              <span className='text-foreground font-black text-3xl'>{PriceEngine.format(total)}</span>
            </div>
            <div className='flex justify-between items-center text-muted-foreground'>
              <span>Total Tendered:</span>
              <span className='text-foreground text-base font-black'>{PriceEngine.format(totalPaidCombined)}</span>
            </div>

            <hr className='border-border/40 my-1' />

            {runningBalance > 0 ? (
              <div className='flex justify-between items-center text-amber-600'>
                <span>Remaining Balance:</span>
                <span className='text-lg font-black'>{PriceEngine.format(runningBalance)}</span>
              </div>
            ) : (
              <div className='flex justify-between items-center text-green-500'>
                <span>Change Due:</span>
                <span className='text-lg font-black'>{PriceEngine.format(runningChange)}</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className='pt-2'>
          <Button
            disabled={!canSubmit}
            onClick={() => form.handleSubmit()}
            className='w-full h-16 rounded-xl text-xl font-black shadow-xl transition-all active:scale-[0.98]'
            variant={canSubmit ? 'default' : 'secondary'}
          >
            CONFIRM PAYMENT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
