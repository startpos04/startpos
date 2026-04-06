import { MoneyInput } from '@/components/custom/form/money-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { showModal } from '@/lib/overlay'
import { feIngredient, fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { cn } from '@/lib/utils'
import { useForm, useStore } from '@tanstack/react-form'
import { Check, PlusCircle, Search } from 'lucide-react'
import * as React from 'react'
import z from 'zod'
import { CreateIngredientDialog } from '../../ingredients/create'

interface AddAddonModalProps {
  open: boolean
  onClose: () => void
  onAdd: (addon: { addon: feIngredient; defaultQuantity: number; priceOverride: number }) => void
}

const addonSchema = z.object({
  selectedId: z.string().min(1, 'Please select an addon'),
  selectedIngredient: z.custom<feIngredient>().nullable(),
  defaultQuantity: z.number().gt(0, 'Quantity must be greater than 0'),
  priceOverride: z.number().min(0, 'Price cannot be negative'),
})

export function AddAddonModal({ open, onClose, onAdd }: AddAddonModalProps) {
  const { data = [] } = fetchIngredients()
  const [search, setSearch] = React.useState('')

  const form = useForm({
    defaultValues: {
      selectedId: '',
      selectedIngredient: null as feIngredient | null,
      defaultQuantity: 1,
      priceOverride: 0,
    },
    validators: {
      onChange: addonSchema,
    },
    onSubmit: async ({ value }) => {
      if (value.selectedIngredient) {
        onAdd({
          addon: value.selectedIngredient,
          defaultQuantity: value.defaultQuantity,
          priceOverride: value.priceOverride,
        })
        form.reset()
        onClose()
      }
    },
  })

  const selectedId = useStore(form.store, state => state.values.selectedId)
  const filtered = data.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
  const selectedIngredient = useStore(form.store, state => state.values.selectedIngredient)

  const handleCreateIngredient = () => {
    showModal(CreateIngredientDialog)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className='sm:max-w-106.25 border-none shadow-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <PlusCircle className='w-5 h-5 text-blue-500' /> Add Optional Extra
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={e => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className='grid gap-4 py-4'
        >
          {/* Search Box */}
          <div className='flex gap-2'>
            <div className='relative flex items-center grow'>
              <Search className='absolute left-2 h-4 w-4 text-muted-foreground' />
              <Input placeholder='Search ingredients...' value={search} onChange={e => setSearch(e.target.value)} className='pl-7' />
            </div>
            <Button type='button' onClick={handleCreateIngredient} variant='outline'>
              Create
            </Button>
          </div>

          {/* Selection List */}
          <form.Field name='selectedId'>
            {idField => (
              <form.Field name='selectedIngredient'>
                {objField => (
                  <ScrollArea className='h-40 border rounded-xl p-2 bg-muted/30'>
                    <div className='space-y-1'>
                      {filtered.map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            idField.handleChange(item.id)
                            objField.handleChange(item)
                          }}
                          className={cn(
                            'flex items-center justify-between p-2 rounded-lg cursor-pointer border transition-all',
                            idField.state.value === item.id ? 'border-primary bg-background shadow-sm' : 'border-transparent hover:bg-muted',
                          )}
                        >
                          <div className='flex gap-2 items-center'>
                            <Avatar className='h-8 w-8 border border-border/50 shadow-sm'>
                              <AvatarImage src={item.image ?? ''} alt={item.name} />
                              <AvatarFallback className='bg-primary/5 text-primary text-[10px] font-bold'>{item.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className='flex flex-col'>
                              <span className='text-sm font-semibold'>{item.name}</span>
                              <span className='text-[10px] font-mono text-muted-foreground uppercase leading-none'>{item.sku}</span>
                            </div>
                          </div>
                          {idField.state.value === item.id && <Check className='h-4 w-4 text-primary' />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </form.Field>
            )}
          </form.Field>

          {/* Configuration Section */}
          <div className='grid grid-cols-2 gap-3 p-4 rounded-2xl border border-secondary bg-secondary/10'>
            {/* Quantity Field */}
            <form.Field
              name='defaultQuantity'
              children={field => (
                <TextInput
                  field={field}
                  type='number'
                  label={
                    <>
                      Quantity{' '}
                      {selectedIngredient && `in ${selectedIngredient.baseUnit?.name.toLocaleLowerCase()}(${selectedIngredient.baseUnit?.abbreviation})`}
                    </>
                  }
                  disabled={!selectedId}
                />
              )}
            />

            {/* Price Override Field */}
            <form.Field name='priceOverride' children={field => <MoneyInput field={field} label='Extra Price' disabled={!selectedId} />} />

            <p className='col-span-2 text-[10px] text-muted-foreground italic leading-tight mt-1 text-center'>
              Define the default amount and cost added to the recipe.
            </p>
          </div>

          <DialogFooter>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <form.Subscribe selector={state => [state.canSubmit, state.values.selectedId]}>
              {([canSubmit, currentId]) => (
                <Button type='submit' disabled={!canSubmit || !currentId} className='bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 px-6'>
                  Link Add-on
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
