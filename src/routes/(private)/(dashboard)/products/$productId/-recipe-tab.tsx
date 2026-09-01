/**
 * Product Recipe Tab
 * 
 * Displays recipe ingredients and add-ons with restock functionality
 */

import { Package } from 'lucide-react'
import { Button } from '@startpos-core/components/ui/button'
import { PriceEngine } from '@/lib/conversion/price-engine'
import type { posProduct } from '@/lib/queries/fetch-pos-products'

interface RecipeTabProps {
  product: any
  onRestockIngredient: (variant: posProduct['variants'][number]) => void
}

export function RecipeTab({ product, onRestockIngredient }: RecipeTabProps) {
  const getRecipeIngredients = (variant: any) => variant.components?.filter((c: any) => !c.isAddon) || []
  const getAddons = (variant: any) => variant.components?.filter((c: any) => c.isAddon) || []

  return (
    <div className='space-y-4'>
      {product.variants.map((v: any) => {
        const ingredients = getRecipeIngredients(v)
        const addons = getAddons(v)
        return (
          <div key={v.id} className='space-y-3'>
            {product.variants.length > 1 && <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>{v.name || 'Default'}</p>}
            {ingredients.length > 0 ? (
              <div className='space-y-1.5'>
                {ingredients.map((comp: any) => {
                  const totalIngredientStock = comp.material.inventory?.reduce((acc: number, inv: any) => acc + inv.quantity, 0) ?? 0
                  const isLow = totalIngredientStock < 10
                  return (
                    <div
                      key={comp.id}
                      className='flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors'
                    >
                      <div className='min-w-0 flex-1'>
                        <p className='text-xs font-medium truncate'>{comp.material.product.name}</p>
                        <p className='text-[10px] text-muted-foreground font-mono'>
                          {comp.quantityUsed} {comp.unit?.abbreviation}
                          {comp.material.name && comp.material.name !== comp.material.product.name && (
                            <span className='ml-1 text-muted-foreground/60'>· {comp.material.name}</span>
                          )}
                        </p>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        {isLow && <span className='text-[9px] font-bold text-orange-500 uppercase tracking-wider'>Low</span>}
                        <Button variant='outline' size='sm' className='h-6 text-[10px] px-2 rounded-lg' onClick={() => onRestockIngredient(comp.material)}>
                          <Package className='size-2.5 mr-1' /> Restock
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className='text-xs text-muted-foreground py-2'>No recipe defined.</p>
            )}
            {addons.length > 0 && (
              <div className='space-y-1'>
                <p className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>Add-ons</p>
                {addons.map((addon: any) => (
                  <div key={addon.id} className='flex items-center justify-between p-2 bg-blue-50/50 rounded-lg border border-blue-100'>
                    <p className='text-xs font-medium'>{addon.material.product.name}</p>
                    <p className='text-xs font-bold text-emerald-600'>+{PriceEngine.format(addon.priceOverride || 0)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
