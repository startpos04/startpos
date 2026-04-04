import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, ChevronLeft } from 'lucide-react'
import { VariantPreview } from './-add-variant'

interface ReviewVariantsStepProps {
  previews: VariantPreview[]
  setPreviews: (previews: VariantPreview[]) => void
  onBack: () => void
  onSave: () => void
}

export function ReviewVariantsStep({ previews, setPreviews, onBack, onSave }: ReviewVariantsStepProps) {
  const updatePreview = (idx: number, updates: Partial<VariantPreview>) => {
    // Correct logic: Map through the array and update only the targeted index
    const next = previews.map((p, i) => (i === idx ? { ...p, ...updates } : p))
    setPreviews(next)
  }

  return (
    <div className='flex flex-col gap-4 overflow-hidden'>
      <ScrollArea className='h-100 border border-border rounded-xl bg-muted/10 p-3'>
        <div className='space-y-2'>
          {previews.map((p, idx) => (
            <div
              key={idx}
              className={cn('flex items-center gap-4 p-3 rounded-lg border bg-background transition-opacity', !p.enabled && 'opacity-40 grayscale')}
            >
              <Checkbox checked={p.enabled} onCheckedChange={v => updatePreview(idx, { enabled: !!v })} />
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-bold truncate'>{p.variantValue}</p>
                <p className='text-[10px] font-mono text-muted-foreground uppercase'>{p.variantType}</p>
              </div>
              <div className='flex flex-col items-end gap-1'>
                <Label className='text-[10px] text-muted-foreground px-1'>Price</Label>
                <Input
                  type='number'
                  value={Number(p.price) / 100 || ''}
                  className='w-24 h-8 text-right'
                  onChange={e => updatePreview(idx, { price: Math.round(Number(e.target.value) * 100) })}
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <DialogFooter className='border-t border-border pt-4 bg-muted/10 -mx-6 px-6 -mb-6 pb-6'>
        <Button variant='ghost' onClick={onBack}>
          <ChevronLeft className='mr-2 w-4 h-4' /> Back
        </Button>
        <Button onClick={onSave} className='bg-amber-600 hover:bg-amber-700 text-white px-8'>
          <Check className='mr-2 w-4 h-4' /> Save {previews.filter(p => p.enabled).length} Variants
        </Button>
      </DialogFooter>
    </div>
  )
}
