import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { showModal } from '@/lib/overlay'
import { Coffee, Layers, Sparkles } from 'lucide-react'
import { posItem, PosProduct } from '..'
import { ProductDialog } from './product-dialog'

interface ProductCardProps {
  product: PosProduct
  onAdd: (item: posItem) => void
}

export function ProductCard({ product, onAdd }: ProductCardProps) {
  // Triggers the modal we built earlier
  const handleOpenConfig = () => {
    showModal(ProductDialog, {
      product,
      onConfirm: onAdd,
    })
  }

  return (
    <Card
      onClick={handleOpenConfig}
      className='border-border shadow-sm rounded-[2rem] h-full overflow-hidden bg-card/50 backdrop-blur-md flex flex-col transition-all hover:shadow-md group pt-0 cursor-pointer'
    >
      {/* Product Image Area */}
      <div className='relative aspect-video w-full overflow-hidden border-b border-border bg-muted'>
        <Avatar className='w-full h-full [&>img]:rounded-none [&>span]:rounded-none [&:after]:border-none'>
          <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover transition-transform duration-500 group-hover:scale-105' />
          <AvatarFallback className='rounded-none bg-muted flex items-center justify-center'>
            <Coffee className='w-10 h-10 text-muted-foreground/20' />
          </AvatarFallback>
        </Avatar>
      </div>

      <CardHeader className='pb-2'>
        <div className='flex justify-between items-start'>
          <CardTitle className='text-xl font-bold line-clamp-1'>{product.name}</CardTitle>
          <span className='font-bold text-primary'>{PriceEngine.format(product.price)}</span>
        </div>
        <div className='flex items-center gap-2'>
          <Badge variant='outline' className='text-[9px] uppercase font-bold py-0 h-4'>
            {product.category?.name || 'General'}
          </Badge>
          <span className='text-[10px] text-muted-foreground font-mono uppercase'>{product.sku}</span>
        </div>
      </CardHeader>

      <CardContent className='space-y-4 flex-1 flex flex-col empty:hidden'>
        {product.allowedAddons && product.allowedAddons.length > 0 && (
          <div className='rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 dark:bg-blue-500/10'>
            <h4 className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400'>
              <Sparkles className='h-3.5 w-3.5' /> Optional Add-ons
            </h4>
            <div className='flex flex-wrap gap-1.5'>
              {product.allowedAddons.map(item => (
                <Badge
                  key={item.id}
                  variant='secondary'
                  className='rounded-lg border-blue-200/50 bg-background/50 px-2 py-0 text-[10px] font-semibold dark:border-blue-800/30'
                >
                  {item.addon.name} <span className='ml-1 text-blue-600'>{PriceEngine.format(item.priceOverride)}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Quick View of Variants if they exist */}
        {product.variants?.length > 0 && (
          <div className='space-y-2 p-2.5 rounded-2xl bg-amber-500/5 border border-amber-500/10'>
            <h4 className='text-[10px] font-bold uppercase tracking-widest text-amber-600 flex items-center gap-2'>
              <Layers className='w-3 h-3' /> {product.variantType || 'Variants'}
            </h4>
            <div className='space-y-1'>
              {product.variants.slice(0, 3).map((v: any) => (
                <div key={v.id} className='flex justify-between items-center text-[11px]'>
                  <span className='text-foreground/80'>{v.variantValue}</span>
                  <span className='font-mono font-medium'>{PriceEngine.format(v.price)}</span>
                </div>
              ))}
              {product.variants.length > 3 && <p className='text-[9px] text-center text-muted-foreground pt-1'>+{product.variants.length - 3} more options</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
