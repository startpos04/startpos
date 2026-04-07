import Form from '@/components/custom/form'
import { SelectInput } from '@/components/custom/form/select-input'
import { TextInput } from '@/components/custom/form/text-input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { showModal } from '@/lib/overlay'
import { feIngredient, fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { fetchUnitOptions } from '@/lib/queries/fetch-unit-options'
import { cn } from '@/lib/utils'
import { useForm, useStore } from '@tanstack/react-form'
import { Check, Scale, Search, Utensils } from 'lucide-react'
import { Unit } from 'prisma/generated/prisma/browser'
import * as React from 'react'
import z from 'zod'
import { CreateIngredientDialog } from '../../ingredients/create'

interface AddIngredientModalProps {
  open: boolean
  onClose: () => void
  onAdd: (ingredient: { material: feIngredient; quantityUsed: number; unit: Unit }) => void
}

const ingredientSchema = z.object({
  selectedId: z.string().min(1, 'Please select an ingredient'),
  selectedIngredient: z.custom<feIngredient>().nullable(),
  selectedUnit: z.string(),
  quantityUsed: z.number().gt(0, 'Quantity must be greater than 0'),
})

export function AddIngredientModal({ open, onClose, onAdd }: AddIngredientModalProps) {
  const { data = [] } = fetchIngredients()
  const [search, setSearch] = React.useState('')
  const { data: unitOptions = [] } = fetchUnitOptions()

  const form = useForm({
    defaultValues: {
      selectedId: '',
      selectedIngredient: null as feIngredient | null,
      selectedUnit: '',
      quantityUsed: 1,
    },
    validators: {
      onChange: ingredientSchema,
    },
    onSubmit: async ({ value }) => {
      if (value.selectedIngredient && value.selectedUnit) {
        onAdd({
          material: value.selectedIngredient,
          quantityUsed: value.quantityUsed,
          unit: unitOptions.find(option => option.value === value.selectedUnit)?.data!,
        })
        form.reset()
        onClose()
      }
    },
  })

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
            <Utensils className='w-5 h-5 text-emerald-500' />
            Add Ingredient
          </DialogTitle>
          <DialogDescription>Search for a raw material to add to this recipe.</DialogDescription>
        </DialogHeader>

        <Form onSubmit={form.handleSubmit} className='grid gap-4'>
          {/* Search Section */}
          <div className='flex gap-2'>
            <div className='relative flex items-center grow'>
              <Search className='absolute left-2 h-4 w-4 text-muted-foreground' />
              <Input placeholder='Search ingredients...' value={search} onChange={e => setSearch(e.target.value)} className='pl-7' />
            </div>
            <Button type='button' variant='outline' onClick={handleCreateIngredient}>
              Create
            </Button>
          </div>

          {/* Ingredient Selection List */}
          <form.Field name='selectedId'>
            {idField => (
              <form.Field name='selectedIngredient'>
                {objField => (
                  <form.Field name='selectedUnit'>
                    {unitField => (
                      <ScrollArea className='h-50'>
                        <div className='space-y-2'>
                          {filtered.map(item => (
                            <div
                              key={item.id}
                              onClick={() => {
                                idField.handleChange(item.id)
                                objField.handleChange(item)
                                unitField.handleChange(item.baseUnit.id)
                              }}
                              className={cn(
                                'flex items-center justify-between p-1 rounded-md cursor-pointer border transition-all',
                                idField.state.value === item.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted',
                              )}
                            >
                              <div className='flex gap-2'>
                                <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
                                  <AvatarImage src={item.image ?? ''} alt={item.name} />
                                  <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{item.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className='flex flex-col'>
                                  <span className='text-sm font-semibold'>{item.name}</span>
                                  <div className='flex items-center gap-2'>
                                    <span className='text-[10px] font-mono text-muted-foreground uppercase'>{item.sku}</span>
                                    <Badge variant='secondary' className='h-4 text-[9px] px-1.5 rounded-sm'>
                                      {item.baseUnit?.abbreviation}
                                    </Badge>
                                  </div>
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
            )}
          </form.Field>

          {/* Quantity and Unit Input Section */}
          <div className='space-y-3 bg-secondary/20 p-4 rounded-2xl border border-secondary'>
            <div className='flex justify-between items-center'>
              <Label htmlFor='quantity' className='font-bold text-xs uppercase tracking-widest text-muted-foreground'>
                Consumption Amount
              </Label>
              {selectedIngredient && (
                <div className='flex items-center gap-1 text-emerald-600 font-medium text-xs'>
                  <Scale className='w-3 h-3 mb-1' />
                  Base: {selectedIngredient.baseUnit?.name}
                </div>
              )}
            </div>

            <div className='flex gap-2'>
              <form.Field
                name='quantityUsed'
                children={field => (
                  <TextInput field={field} label='Quantity' type='number' step='0.01' placeholder='0.00' className='grow' disabled={!selectedIngredient} />
                )}
              />

              <form.Field
                name='selectedUnit'
                children={field => <SelectInput field={field} label='Unit' placeholder='Select unit...' options={unitOptions} disabled={!selectedIngredient} />}
              />
            </div>

            <p className='text-[10px] text-muted-foreground italic leading-tight'>Specify how much of this ingredient is used per unit of recipe.</p>
          </div>

          <DialogFooter>
            <Button type='button' variant='ghost' onClick={onClose}>
              Cancel
            </Button>
            <form.Subscribe selector={state => [state.canSubmit, state.values.selectedId]}>
              {([canSubmit, currentId]) => (
                <Button type='submit' disabled={!canSubmit || !currentId} className='px-6 shadow-lg shadow-primary/20'>
                  Add to Recipe
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
