import { useSearch } from '@tanstack/react-router'
import { Coffee, Layers, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePOS } from '@/hooks/use-pos'
import { PosStockEngine, type posItem } from '@/lib/conversion/pos-stock-engine'
import { PriceEngine } from '@/lib/conversion/price-engine'
import MountManager from '@/lib/mount-manager'
import type { posProduct } from '@/lib/queries/fetch-pos-products'
import { cn } from '@/lib/utils'
import { ProductDialog } from './product-dialog'

interface ProductCardProps {
  cartItems: posItem[]
  product: posProduct
  onAdd: (item: posItem) => void
}

export function ProductCard({ cartItems, product, onAdd }: ProductCardProps) {
  const variant = product.variants[0]!
  const { orderId, search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
  const { orderItems } = usePOS({ orderId, searchQuery: search, page, pageSize })

  const addonComponents = useMemo(() => variant.components?.filter(c => c.isAddon) || [], [variant])
  const maxAvailable = useMemo(
    () => PosStockEngine.calculateRemainingYield(product, variant, [], cartItems, orderItems),
    [product, variant, cartItems, orderItems],
  )

  // SERVICE type or provisional products have no real stock count to show
  const isUnlimited = maxAvailable >= 999

  const handleOpenConfig = () => {
    if (maxAvailable <= 0) return

    MountManager.show(ProductDialog, {
      product,
      cartItems,
      onConfirm: onAdd,
    })
  }

  return (
    <Card
      onClick={handleOpenConfig}
      className={cn(
        'border-border shadow-sm rounded-4xl h-full overflow-hidden bg-card/50 backdrop-blur-md flex flex-col transition-all hover:shadow-md group pt-0',
        maxAvailable > 0 ? 'cursor-pointer active:scale-[0.98]' : 'opacity-80 grayscale-[0.5]',
      )}
    >
      {/* Product Image Area */}
      <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
        <div
          className={cn(
            'absolute top-3 right-3 z-10 px-2.5 py-1 rounded-lg border text-[10px] font-bold backdrop-blur-md shadow-sm',
            maxAvailable <= 0 ? 'bg-destructive text-destructive-foreground border-destructive/20' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
          )}
        >
          {maxAvailable <= 0 ? 'Out of Stock' : isUnlimited ? 'Available' : `${maxAvailable} available`}
        </div>

        <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
          <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover transition-transform duration-500 group-hover:scale-105' />
          <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
            <Coffee className='w-10 h-10 text-muted-foreground/20' />
          </AvatarFallback>
        </Avatar>
      </div>

      <CardHeader className='pb-2'>
        <div className='flex justify-between items-start gap-2'>
          <CardTitle className='text-lg font-bold line-clamp-2 leading-tight'>{product.name}</CardTitle>
          <span className='font-bold text-primary whitespace-nowrap'>{PriceEngine.format(variant.price)}</span>
        </div>
        <div className='flex items-center gap-2 mt-1'>
          <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4 border-border/50 text-muted-foreground'>
            {product.category?.name || 'General'}
          </Badge>
          {variant.sku && <span className='text-[10px] text-muted-foreground/60 font-mono uppercase tracking-tighter'>{variant.sku}</span>}
        </div>
      </CardHeader>

      <CardContent className='space-y-3 flex-1 flex flex-col'>
        {/* Unified Add-ons (Filtered from components) */}
        {addonComponents.length > 0 && (
          <div className='rounded-2xl border border-blue-500/10 bg-blue-500/5 p-2.5 dark:bg-blue-500/10'>
            <h4 className='mb-1.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-blue-600/80 dark:text-blue-400'>
              <Sparkles className='h-3 w-3' /> Extras
            </h4>
            <div className='flex flex-wrap gap-1'>
              {addonComponents.slice(0, 4).map(comp => (
                <Badge key={comp.id} variant='secondary' className='rounded-md bg-background/50 px-1.5 py-0 text-[9px] font-semibold border-none'>
                  +{comp.material.product.name}
                </Badge>
              ))}
              {addonComponents.length > 4 && <span className='text-[9px] text-muted-foreground pl-1'>+{addonComponents.length - 4} more</span>}
            </div>
          </div>
        )}

        {/* Variants List */}
        {product.variants?.length > 1 && (
          <div className='mt-auto space-y-1.5 p-2.5 rounded-2xl bg-muted/30 border border-border/50'>
            <h4 className='text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2'>
              <Layers className='w-3 h-3' /> Options
            </h4>
            <div className='space-y-1'>
              {product.variants.slice(0, 2).map(v => (
                <div key={v.id} className='flex justify-between items-center text-[10px]'>
                  <span className='text-foreground/70 truncate mr-2'>{v.name}</span>
                  <span className='font-mono font-bold text-primary/80'>{PriceEngine.format(v.price)}</span>
                </div>
              ))}
              {product.variants.length > 2 && <p className='text-[9px] text-muted-foreground italic'>Tap to see {product.variants.length - 2} more sizes</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
