import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { showModal } from '@/lib/Overlay'
import { feIngredient, fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { Prettify } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useForm, useStore } from '@tanstack/react-form'
import { Check, Scale, Search, Utensils } from 'lucide-react'
import * as React from 'react'
import z from 'zod'
import { CreateIngredientDialog } from '../../ingredients/create'

interface AddIngredientModalProps {
  open: boolean
  onClose: () => void
  onAdd: (ingredient: Prettify<feIngredient & { quantityUsed: number }>) => void
}

const ingredientSchema = z.object({
  selectedId: z.string().min(1, 'Please select an ingredient'),
  quantityUsed: z.number().gt(0, 'Quantity must be greater than 0'),
})

export function AddIngredientModal({ open, onClose, onAdd }: AddIngredientModalProps) {
  const { data = [] } = fetchIngredients()
  const [search, setSearch] = React.useState('')

  const form = useForm({
    defaultValues: {
      selectedId: '',
      quantityUsed: 1,
    },
    validators: {
      onChange: ingredientSchema,
    },
    onSubmit: async ({ value }) => {
      const item = data.find(s => s.id === value.selectedId)
      if (item) {
        onAdd({ ...item, quantityUsed: value.quantityUsed })
        form.reset()
        onClose()
      }
    },
  })

  const filtered = data.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
  const selectedId = useStore(form.store, state => state.values.selectedId)
  const selectedIngredient = React.useMemo(() => data.find(item => item.id === selectedId), [selectedId, data])

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

        <form
          onSubmit={e => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
          className='grid gap-4'
        >
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
            {field => (
              <ScrollArea className='h-50'>
                <div className='space-y-2'>
                  {filtered.map(item => (
                    <div
                      key={item.id}
                      onClick={() => field.handleChange(item.id)}
                      className={cn(
                        'flex items-center justify-between p-1 rounded-md cursor-pointer border transition-all',
                        field.state.value === item.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted',
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
                      {field.state.value === item.id && <Check className='h-4 w-4 text-primary' />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </form.Field>

          {/* Quantity Input Section */}
          <div className='space-y-3 bg-secondary/20 p-4 rounded-2xl border border-secondary'>
            <div className='flex justify-between items-center'>
              <Label htmlFor='quantity' className='font-bold text-xs uppercase tracking-widest text-muted-foreground'>
                Serving Quantity
              </Label>
              {selectedIngredient && (
                <div className='flex items-center gap-1 text-emerald-600 font-medium text-xs'>
                  <Scale className='w-3 h-3' />
                  Tracked in {selectedIngredient.baseUnit?.name}
                </div>
              )}
            </div>

            <form.Field name='quantityUsed'>
              {field => (
                <div className='relative flex items-center'>
                  <Input
                    id={field.name}
                    name={field.name}
                    type='number'
                    step='0.01'
                    placeholder='0.00'
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={e => field.handleChange(Number(e.target.value))}
                    disabled={!selectedId}
                    className='pr-16 h-12 text-lg font-semibold rounded-xl bg-background'
                  />
                  <div className='absolute right-3 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-bold uppercase'>
                    {selectedIngredient?.baseUnit?.abbreviation || '---'}
                  </div>
                </div>
              )}
            </form.Field>

            <p className='text-[10px] text-muted-foreground italic leading-tight'>
              Specify how much of this ingredient is consumed for every 1 unit of the finished product.
            </p>
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
        </form>
      </DialogContent>
    </Dialog>
  )
}
