/** biome-ignore-all lint/suspicious/noExplicitAny: TODO: fix */
import type { ColumnHelper } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import numeral from 'numeral'
import type { Inventory, ProductComponent, ProductVariant } from 'prisma/generated/prisma/client'
import { VariantAttributeType } from 'prisma/generated/prisma/enums'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { PosStockEngine, type posItem } from '../conversion/pos-stock-engine'
import { PriceEngine } from '../conversion/price-engine'
import type { posProduct } from '../queries/fetch-pos-products'
import { cn } from '../utils'

export const productCols = {
  image: (h: ColumnHelper<any>) =>
    h.accessor('image', {
      header: 'Photo',
      maxSize: 40,
      cell: info => {
        const item = info.row.original
        return (
          <Avatar className='h-9 w-9 border border-border/50 shadow-sm'>
            <AvatarImage src={item.image ?? ''} alt={item.name} />
            <AvatarFallback className='bg-primary/5 text-primary text-xs font-bold'>{item.name?.charAt(0)}</AvatarFallback>
          </Avatar>
        )
      },
    }),

  name: (h: ColumnHelper<any>) =>
    h.accessor('name', {
      header: 'Product Name',
      cell: info => <span className='font-semibold text-foreground'>{info.getValue()}</span>,
    }),

  sku: (h: ColumnHelper<any>) =>
    h.accessor(
      row => {
        const primary = row.variants?.find((v: ProductVariant) => v.attributeType === VariantAttributeType.UNSPECIFIED) || row.variants?.[0]
        return primary?.sku ?? ''
      },
      {
        id: 'sku',
        header: 'SKU',
        cell: info => {
          const val = info.getValue()
          return val ? (
            <span className='font-mono text-xs uppercase tracking-wider'>{val}</span>
          ) : (
            <span className='text-muted-foreground/40 font-mono text-xs'>—</span>
          )
        },
      },
    ),

  category: (h: ColumnHelper<any>) =>
    h.accessor(row => row.category?.name ?? 'General', {
      id: 'categoryName',
      header: 'Category',
      cell: info => (
        <Badge variant='outline' className='text-[10px] uppercase font-bold py-0 h-5 text-muted-foreground whitespace-nowrap'>
          {info.getValue()}
        </Badge>
      ),
    }),

  servings: (h: ColumnHelper<any>, options?: { selectedComponentIds?: string[]; cartItems?: posItem[]; orderItems?: posItem[] }) =>
    h.accessor(row => row.variants, {
      id: 'stockServings',
      header: () => <div className='text-center'>Servings Left</div>,
      cell: info => {
        const { selectedComponentIds = [], cartItems = [], orderItems = [] } = options || {}
        const product = info.row.original
        const primaryVariant = product.variants?.[0]
        if (!primaryVariant) return <span className='text-muted-foreground text-xs text-center block'>—</span>

        const maxServings = PosStockEngine.calculateRemainingYield(product, primaryVariant, selectedComponentIds, cartItems, orderItems)

        // Unlimited sentinel — product has no tracked stock (SERVICE or provisional)
        // Show '—' so the column isn't misleading when inventory is enabled
        if (maxServings >= 999) {
          return <div className='text-xs text-center text-muted-foreground/40 font-mono'>—</div>
        }

        const isLowStock = maxServings < 10

        return (
          <div
            className={cn('text-xs text-center font-bold font-mono', maxServings === 0 ? 'text-destructive' : isLowStock ? 'text-amber-500' : 'text-primary')}
          >
            {maxServings === 0 ? '0' : numeral(maxServings).format('0,0')}
          </div>
        )
      },
    }),

  unit: (h: ColumnHelper<any>) =>
    h.accessor(row => row.baseUnit?.abbreviation ?? 'pcs', {
      id: 'baseUnit',
      header: 'Base Unit',
      cell: info => <span className='text-xs font-mono uppercase text-muted-foreground'>{info.getValue()}</span>,
    }),

  ingredients: (h: ColumnHelper<any>) =>
    h.accessor(row => row.id, {
      id: 'ingredientsCount',
      header: () => <div className='text-center'>Ingredients</div>,
      cell: info => {
        const primaryVariant = info.row.original.variants?.[0]
        const count = primaryVariant?.components?.filter((c: ProductComponent) => !c.isAddon).length || 0
        return <div className='text-xs font-mono text-center'>{count}</div>
      },
    }),

  addons: (h: ColumnHelper<any>) =>
    h.accessor(row => row.id, {
      id: 'addonsCount',
      header: () => <div className='text-center'>Add-ons</div>,
      cell: info => {
        const primaryVariant = info.row.original.variants?.[0]
        const count = primaryVariant?.components?.filter((c: ProductComponent) => c.isAddon).length || 0
        return (
          <div className={cn('text-xs text-center font-mono', count > 0 ? 'text-blue-600 font-bold dark:text-blue-400' : 'text-muted-foreground/50')}>
            {count}
          </div>
        )
      },
    }),

  variants: (h: ColumnHelper<any>) =>
    h.accessor(row => row.variants?.length ?? 1, {
      id: 'variantsCount',
      header: () => <div className='text-center'>Variants</div>,
      cell: info => <div className='text-xs font-mono text-center'>{info.getValue()}</div>,
    }),

  price: (h: ColumnHelper<any>) =>
    h.accessor(row => row.variants, {
      id: 'price',
      header: () => <div className='text-right'>Price</div>,
      cell: info => {
        const variants = info.row.original.variants || []
        const minPrice = variants.length > 0 ? Math.min(...variants.map((v: ProductVariant) => Number(v.price))) : 0
        return <div className='font-mono text-xs font-bold text-foreground text-right'>{PriceEngine.format(minPrice)}</div>
      },
    }),

  cost: (h: ColumnHelper<any>) =>
    h.accessor(row => row.id, {
      id: 'cost',
      header: () => <div className='text-right'>Cost</div>,
      cell: info => {
        const product = info.row.original
        const primaryVariant = product.variants?.[0]
        if (!primaryVariant) return <span className='font-mono text-xs'>₱0.00</span>

        const recipeComponents = primaryVariant.components?.filter((c: ProductComponent) => !c.isAddon) || []
        const ingredientBreakdown = recipeComponents.map((comp: any) => ({
          cost: PriceEngine.calculateLineTotal(Number(comp.quantityUsed), comp.unit, Number(comp.material.costPrice)),
        }))

        const recipeCostCents = ingredientBreakdown.reduce((sum: any, item: any) => sum + item.cost, 0)
        const finalCostCents = recipeCostCents > 0 ? recipeCostCents : Number(primaryVariant.costPrice)

        return <div className='font-mono text-xs text-muted-foreground text-right'>{PriceEngine.format(finalCostCents)}</div>
      },
    }),

  netMargin: (h: ColumnHelper<any>, options?: { user: any }) =>
    h.accessor(row => row.id, {
      id: 'margin',
      header: () => <div className='text-right'>Net Margin</div>,
      cell: info => {
        const product = info.row.original as posProduct
        const primaryVariant = product.variants?.find(v => v.attributeType === 'UNSPECIFIED') || product.variants?.[0]
        if (!primaryVariant) return <div className='text-right text-muted-foreground text-xs'>—</div>

        // 2. Exact same financial cost breakdown mapping
        const recipeComponents = primaryVariant.components?.filter((c: any) => !c.isAddon) || []
        const ingredientBreakdown = recipeComponents.map((comp: any) => ({
          cost: PriceEngine.calculateLineTotal(Number(comp.quantityUsed), comp.unit, Number(comp.material.costPrice)),
        }))

        const recipeCostCents = ingredientBreakdown.reduce((sum: number, item: any) => sum + item.cost, 0)
        const finalCostCents = recipeCostCents > 0 ? recipeCostCents : Number(primaryVariant.costPrice)
        const priceCents = Number(primaryVariant.price)
        const profitCents = priceCents - finalCostCents
        const marginPercentage = priceCents > 0 ? profitCents / priceCents : 0

        // 3. SAFE DB CONVERSION: Handle 1-100 whole number values dynamically
        const rawBuffer = options?.user?.configs?.BUFFER_RATE ?? 30
        const targetMargin = rawBuffer > 1 ? rawBuffer / 100 : rawBuffer

        const isLowMargin = marginPercentage < targetMargin
        const isCritical = marginPercentage < 0.1

        // 4. Clean cn Visual Tiers for Scannable Rows
        const marginColorClass = isCritical
          ? 'text-red-500 dark:text-red-400 bg-red-500/10 border-red-500/20'
          : isLowMargin
            ? 'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
            : 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'

        const indicatorDotClass = isCritical ? 'bg-red-500' : isLowMargin ? 'bg-amber-500' : 'bg-emerald-500'

        return (
          <div className='flex items-center justify-end gap-2'>
            {/* Subtle Compact Status Badge */}
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border', marginColorClass)}>
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 animate-pulse', indicatorDotClass)} />
              {numeral(marginPercentage).format('0.0%')}
            </span>
          </div>
        )
      },
    }),

  showInPOS: (h: ColumnHelper<any>) =>
    h.accessor('isAvailable', {
      header: () => <div className='text-center'>POS Status</div>,
      cell: info => {
        const isVisible = info.getValue()
        return (
          <div className='flex justify-center'>
            <Badge
              variant='outline'
              className={cn(
                'text-[10px] uppercase font-bold h-5 py-0 whitespace-nowrap',
                isVisible ? 'text-emerald-600 border-emerald-600/30' : 'text-muted-foreground border-muted-foreground/30',
              )}
            >
              {isVisible ? 'Visible' : 'Hidden'}
            </Badge>
          </div>
        )
      },
    }),

  totalValue: (h: ColumnHelper<any>) =>
    h.display({
      id: 'totalValue',
      header: () => <div className='text-right'>Asset Value</div>,
      cell: info => {
        const item = info.row.original
        const primaryVariant = item.variants[0]

        const totalStock = primaryVariant?.inventory?.reduce((acc: any, curr: any) => acc + Number(curr.quantity), 0) ?? 0
        const cost = primaryVariant?.costPrice ?? 0
        const assetValue = totalStock * cost

        return <div className='font-mono font-bold text-sm text-right text-foreground'>{PriceEngine.format(assetValue)}</div>
      },
    }),

  stockStatus: (h: ColumnHelper<any>) =>
    h.display({
      id: 'status',
      header: () => <div className='text-center'>Status</div>,
      maxSize: 80,
      cell: info => {
        const item = info.row.original
        const primaryVariant = item.variants[0]
        const totalStock = primaryVariant?.inventory?.reduce((acc: number, curr: Inventory) => acc + Number(curr.quantity), 0) ?? 0
        const threshold = primaryVariant?.lowStockThreshold ?? 0

        if (totalStock <= 0) {
          return (
            <div className='flex justify-center'>
              <Badge variant='destructive' className='text-[10px] uppercase tracking-wider font-semibold rounded-md'>
                Out of Stock
              </Badge>
            </div>
          )
        }
        if (totalStock <= threshold) {
          return (
            <div className='flex justify-center'>
              <Badge
                variant='outline'
                className='text-[10px] uppercase tracking-wider font-semibold rounded-md border-orange-500 text-orange-500 bg-orange-500/5'
              >
                Low Stock
              </Badge>
            </div>
          )
        }
        return (
          <div className='flex justify-center'>
            <Badge
              variant='outline'
              className='text-[10px] uppercase tracking-wider font-semibold rounded-md border-emerald-500 text-emerald-500 bg-emerald-500/5'
            >
              Healthy
            </Badge>
          </div>
        )
      },
    }),

  stockTotal: (h: ColumnHelper<any>) =>
    h.display({
      id: 'stock',
      header: 'Stock Level',
      cell: info => {
        const item = info.row.original
        const primaryVariant = item.variants[0]
        const totalStock = primaryVariant?.inventory?.reduce((acc: number, curr: Inventory) => acc + Number(curr.quantity), 0) ?? 0
        const threshold = primaryVariant?.lowStockThreshold ?? 0

        const isOut = totalStock <= 0
        const isLow = totalStock <= threshold

        // Check if any active batch is expired or expiring soon (within 7 days)
        const now = new Date()
        const expiringSoonDays = 7
        let hasExpiredBatch = false
        let hasExpiringBatch = false

        if (item.hasExpiry) {
          primaryVariant?.inventory?.forEach((inv: Inventory) => {
            if (inv.expiryDate) {
              const exp = new Date(inv.expiryDate)
              const diffTime = exp.getTime() - now.getTime()
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

              if (diffDays <= 0) hasExpiredBatch = true
              else if (diffDays <= expiringSoonDays) hasExpiringBatch = true
            }
          })
        }

        return (
          <div className='flex flex-col gap-0.5'>
            <div className='flex items-center gap-1.5'>
              <span className={cn('text-sm font-bold', isOut ? 'text-destructive' : isLow ? 'text-orange-500' : 'text-foreground')}>
                {totalStock.toLocaleString()}
              </span>
              <span className='text-[10px] font-medium text-muted-foreground uppercase'>{item.baseUnit?.abbreviation ?? 'PCS'}</span>
            </div>
            {item.hasExpiry && (hasExpiredBatch || hasExpiringBatch) && (
              <span className={cn('text-[9px] font-medium flex items-center gap-0.5', hasExpiredBatch ? 'text-destructive' : 'text-orange-500')}>
                <AlertTriangle className='h-2.5 w-2.5' />
                {hasExpiredBatch ? 'Expired batch present' : 'Expiring soon'}
              </span>
            )}
          </div>
        )
      },
    }),
}
