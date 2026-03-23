import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import Overlay, { showModal } from '@/lib/Overlay'
import { fetchIngredients } from '@/lib/queries/fetch-ingredients'
import { cn } from '@/lib/utils'
import { Check, Search, Utensils } from 'lucide-react'
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
                    <div className='flex flex-col grow'>
                      <span className='text-sm font-medium'>{item.name}</span>
                      <span className='text-[10px] text-muted-foreground'>{item.sku}</span>
                    </div>
                  </div>
                  {selectedId === item.id && <Check className='h-4 w-4 text-primary' />}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className='flex items-center gap-4'>
            <Label htmlFor='quantity' className='text-right'>
              Qty
            </Label>
            <Input id='quantity' type='number' value={quantity} onChange={e => setQuantity(Number(e.target.value))} className='col-span-3' />
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
