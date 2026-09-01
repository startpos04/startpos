/** biome-ignore-all lint/suspicious/noExplicitAny: fix any */
import { count, eq, useLiveQuery } from '@tanstack/react-db'
import { createFileRoute } from '@tanstack/react-router'
import { Box, Edit, X } from 'lucide-react'
import { type Product, type ProductVariant, type Unit, VariantAttributeType } from 'prisma/generated/prisma/browser'
import Tab from '@startpos-core/components/custom/tab'
import { Avatar, AvatarFallback, AvatarImage } from '@startpos-core/components/ui/avatar'
import { Badge } from '@startpos-core/components/ui/badge'
import { Button } from '@startpos-core/components/ui/button'
import { orderItemCollection, productVariantCollection } from '@startpos-core/db/collections'
import { useCapability } from '@startpos-core/hooks/use-capability'
import { PriceEngine } from '@/lib/conversion/price-engine'
import { Capabilities } from '@startpos-core/lib/entitlement/capability-keys'
import type { MountProps } from '@/lib/mount-manager'
import { fetchPosProducts, type posProduct } from '@/lib/queries/fetch-pos-products'
import { closeProductSidebar, showProductSidebar } from '../-components/product-sidebar'
import { EditProductSidebar } from './-edit-product'
import { RecipeTab } from './-recipe-tab'
import { RestockProductSidebar } from './-restock-product'
import { StockTab } from './-stock-tab'
import { VariantsTab } from './-variants-tab'

interface ProductDetailsSidebarProps extends MountProps {
  productId: string
}

interface RouteComponentProps {
  productId?: string
  onClose?: () => void
}

export const Route = createFileRoute('/(private)/(dashboard)/products/$productId/')({
  loader: ({ params }) => ({ productId: params.productId }),
  component: () => <RouteComponent />,
})

export function ProductDetailsSidebar({ open: _open, onClose, productId }: ProductDetailsSidebarProps) {
  return <RouteComponent productId={productId} onClose={onClose} />
}

function RouteComponent({ productId: propId, onClose }: RouteComponentProps) {
  // biome-ignore lint/correctness/useHookAtTopLevel: guaranteed React context — used inside MountManager or route component
  const productId = propId || Route.useLoaderData().productId
  const hasInventory = useCapability(Capabilities.MANAGE_INVENTORY)
  const hasBatchPreparation = useCapability(Capabilities.BATCH_PREPARATION)

  const { data: products, isLoading } = fetchPosProducts({ page: 1, pageSize: 9999, all: true })
  const product = products.find(p => p.id === productId)

  // Per-variant order item counts — supplemental live query
  const { data: orderItemCounts } = useLiveQuery(
    q =>
      q
        .from({ oi: orderItemCollection })
        .join({ variant: productVariantCollection }, ({ oi, variant }) => eq(oi.variantId, variant.id))
        .where(({ variant }) => eq(variant.productId, productId))
        .groupBy(({ oi }) => oi.variantId)
        .select(({ oi }) => ({ variantId: oi.variantId, count: count(oi.id) })),
    [productId],
  )

  const handleClose = () => {
    if (onClose) onClose()
    else closeProductSidebar()
  }

  if (isLoading) return <div className='p-6 animate-pulse bg-muted rounded-xl h-40 m-4' />
  if (!product) return <div className='p-6 text-center text-sm text-muted-foreground'>Product not found.</div>

  const totalSales = (orderItemCounts ?? []).reduce((acc, row) => acc + row.count, 0)
  const totalStock = product.variants.reduce((acc, v) => acc + (v.inventory ?? []).reduce((s: number, inv: any) => s + inv.quantity, 0), 0)
  const prices = product.variants.map(v => v.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const primaryVariant = product.variants.find(v => v.attributeType === VariantAttributeType.UNSPECIFIED) || product.variants[0]

  // Restock an ingredient variant (from the recipe tab)
  const handleRestockIngredient = (ingredientVariant: posProduct['variants'][number]) => {
    showProductSidebar(
      <RestockProductSidebar
        open
        onClose={handleClose}
        product={product}
        variant={ingredientVariant}
        onBack={() => showProductSidebar(<ProductDetailsSidebar open productId={productId} onClose={handleClose} />)}
      />,
    )
  }

  const handleEdit = () => {
    showProductSidebar(
      <EditProductSidebar
        open
        productId={product.id}
        variantId={primaryVariant?.id}
        defaultValues={{
          name: product.name,
          type: product.type,
          categoryId: product.categoryId,
          baseUnitId: product.baseUnitId,
          image: product.image ?? '',
          isAvailable: product.isAvailable,
          hasExpiry: product.hasExpiry,
          isBatchPrepared: primaryVariant?.isBatchPrepared ?? false,
          shelfLifeHours: primaryVariant?.shelfLifeHours ?? null,
          price: primaryVariant?.price || 0,
          costPrice: primaryVariant?.costPrice || 0,
          sku: primaryVariant?.sku ?? '',
          ingredients: (primaryVariant?.components ?? [])
            .filter(c => !c.isAddon)
            .map(c => ({
              id: c.id,
              material: { id: c.material.productId, name: c.material.product.name } as Product,
              variant: { id: c.materialId, name: c.material.name } as ProductVariant,
              quantityUsed: Number(c.quantityUsed),
              unit: c.unit as Unit,
            })),
          allowedAddons: (primaryVariant?.components ?? [])
            .filter(c => c.isAddon)
            .map(c => ({
              id: c.id,
              addon: { id: c.material.productId, name: c.material.product.name } as Product,
              variant: { id: c.materialId, name: c.material.name } as ProductVariant,
              unit: c.unit as Unit,
              defaultQuantity: Number(c.quantityUsed),
              priceOverride: c.priceOverride ? Number(c.priceOverride) / 100 : 0,
            })),
          variants: product.variants.map(v => ({
            id: v.id,
            attributeType: v.attributeType,
            name: v.name,
            sku: v.sku,
            price: Number(v.price) / 100,
          })),
        }}
        onBack={() => showProductSidebar(<ProductDetailsSidebar open productId={productId} onClose={handleClose} />)}
        onClose={handleClose}
      />,
    )
  }

  return (
    <div className='flex flex-col h-full'>
      {/* Header band */}
      <div className='flex items-start justify-between p-4 border-b shrink-0'>
        <div className='flex gap-3'>
          <Avatar className='h-10 w-10 rounded-xl border shadow-sm shrink-0'>
            <AvatarImage src={product.image ?? ''} alt={product.name} className='object-cover' />
            <AvatarFallback className='rounded-xl bg-secondary'>
              <Box className='h-5 w-5 text-muted-foreground/40' />
            </AvatarFallback>
          </Avatar>
          <div>
            <div className='flex items-center gap-2 flex-wrap'>
              <h2 className='text-base font-semibold leading-tight'>{product.name}</h2>
              {!product.isAvailable && (
                <Badge variant='destructive' className='text-[10px] py-0 h-4'>
                  Unavailable
                </Badge>
              )}
            </div>
            <div className='flex gap-1.5 mt-1 flex-wrap'>
              <Badge className='bg-slate-800 text-[10px] py-0 h-4'>{product.category?.name}</Badge>
              <Badge variant='secondary' className='capitalize text-[10px] py-0 h-4'>
                {product.type.toLowerCase().replace('_', ' ')}
              </Badge>
              <Badge variant='outline' className='text-[10px] py-0 h-4'>
                {product.variants.length} Variant(s)
              </Badge>
              {hasBatchPreparation && primaryVariant?.isBatchPrepared && <Badge className='bg-purple-600 text-[10px] py-0 h-4'>Batch Prep</Badge>}
            </div>
          </div>
        </div>
        <Button variant='ghost' size='icon' onClick={handleClose} className='h-7 w-7 shrink-0'>
          <X className='size-4' />
        </Button>
      </div>

      {/* Compact info row — price, cost & sales, no card clutter */}
      <div className='flex items-center gap-4 px-4 py-2.5 border-b bg-muted/20 shrink-0'>
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Price</p>
          <p className='text-sm font-black font-mono'>{minPrice === maxPrice ? PriceEngine.format(minPrice) : `${PriceEngine.format(minPrice)}+`}</p>
        </div>
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Cost</p>
          <p className='text-sm font-black font-mono text-muted-foreground'>{PriceEngine.format(primaryVariant?.costPrice || 0)}</p>
        </div>
        {hasInventory && (
          <>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Stock</p>
              <p className='text-sm font-black'>{totalStock}</p>
            </div>
          </>
        )}
        <div className='w-px h-6 bg-border' />
        <div>
          <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Sales</p>
          <p className='text-sm font-black'>{totalSales} units</p>
        </div>
        {hasBatchPreparation && primaryVariant?.isBatchPrepared && (
          <>
            <div className='w-px h-6 bg-border' />
            <div>
              <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Production</p>
              <div className='flex gap-1 items-center'>
                <p className='text-xs font-bold text-purple-600'>Batch Prep</p>
                {primaryVariant.productionUsesRecipe && (
                  <Badge variant='outline' className='text-[9px] py-0 h-3.5'>
                    Recipe
                  </Badge>
                )}
              </div>
            </div>
            {primaryVariant.shelfLifeHours && (
              <>
                <div className='w-px h-6 bg-border' />
                <div>
                  <p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>Shelf Life</p>
                  <p className='text-xs font-bold'>{primaryVariant.shelfLifeHours}h</p>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        <Tab
          defaultValue='Variants'
          tabs={[
            { label: 'Variants', Component: VariantsTab, product },
            ...(hasInventory ? [{ label: 'Stock', Component: StockTab, product }] : []),
            ...(hasInventory ? [{ label: 'Recipe', Component: RecipeTab, product, onRestockIngredient: handleRestockIngredient }] : []),
          ]}
        />
      </div>

      {/* Sticky footer — edit only */}
      <div className='p-4 border-t shrink-0'>
        <Button variant='outline' className='w-full h-9 gap-2 rounded-xl' onClick={handleEdit}>
          <Edit className='size-3.5' /> Edit Product
        </Button>
      </div>
    </div>
  )
}
