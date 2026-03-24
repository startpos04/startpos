import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import Overlay, { showModal } from '@/lib/Overlay'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { cn } from '@/lib/utils'
import { Check, Scale, Search, Utensils } from 'lucide-react'
import * as React from 'react'
import { CreateIngredientDialog } from '../../ingredients/create'

interface AddIngredientModalProps extends Overlay {
  open: boolean
  onClose: () => void
  onAdd: (ingredient: { id: string; name: string; quantity: number }) => void
}

export function AddIngredientModal({ open, onClose, onAdd }: AddIngredientModalProps) {
  const { data = [] } = fetchIngredients()
  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [quantity, setQuantity] = React.useState(1)

  const filtered = data.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  const selectedIngredient = React.useMemo(() => data.find(item => item.id === selectedId), [selectedId, data])

  const handleAdd = () => {
    const item = data.find(s => s.id === selectedId)
    if (item) {
      onAdd({ id: item.id, name: item.name, quantity })
      onClose()
      // Reset
      setSelectedId(null)
      setQuantity(1)
    }
  }

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

        <div className='grid gap-4'>
          <div className='flex gap-2'>
            <div className='relative flex items-center grow'>
              <Search className='absolute left-2 h-4 w-4 text-muted-foreground' />
              <Input placeholder='Search ingredients...' value={search} onChange={e => setSearch(e.target.value)} className='pl-7' />
            </div>
            <Button onClick={handleCreateIngredient}>Create</Button>
          </div>

          <ScrollArea className='h-50'>
            <div className='space-y-2'>
              {filtered.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    'flex items-center justify-between p-1 rounded-md cursor-pointer border transition-all',
                    selectedId === item.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-transparent hover:bg-muted',
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
                  {selectedId === item.id && <Check className='h-4 w-4 text-primary' />}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Quantity Input with Unit Label */}
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
            <div className='relative flex items-center'>
              <Input
                id='quantity'
                type='number'
                step='0.01'
                placeholder='0.00'
                value={quantity || ''}
                onChange={e => setQuantity(Number(e.target.value))}
                disabled={!selectedId}
                className='pr-16 h-12 text-lg font-semibold rounded-xl bg-background'
              />
              <div className='absolute right-3 px-2 py-1 rounded-md bg-muted text-muted-foreground text-xs font-bold uppercase'>
                {selectedIngredient?.baseUnit?.abbreviation || '---'}
              </div>
            </div>
            <p className='text-[10px] text-muted-foreground italic leading-tight'>
              Specify how much of this ingredient is consumed for every 1 unit of the finished product.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant='ghost' onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!selectedId} className='px-6 shadow-lg shadow-primary/20'>
            Add to Recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
