import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { useAppForm } from '@/hooks/form'
import { showModal } from '@/lib/Overlay'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { createPosTransaction } from '@/lib/server-fn/create-pos-transaction'
import { pdf } from '@react-pdf/renderer'
import { formOptions } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CartAside } from './-components/cart-aside'
import { ProductGrid } from './-components/product-grid'
import { ReceiptPDF } from './-components/receipt-ticket'
import { Sidebar } from './-components/sidebar'

export const fetchPosProducts = (searchQuery: string, activeCategory: string) =>
  useQuery({
    queryKey: ['pos-products', activeCategory, searchQuery],
    queryFn: async () => {
      const result = await crudAPI({
        data: {
          action: 'findMany',
          table: 'product',
          args: {
            where: {
              isAvailable: true,
              variantOfId: null,
              ...(activeCategory !== 'ALL' && { categoryId: activeCategory }),
              ...(searchQuery && {
                OR: [{ name: { contains: searchQuery, mode: 'insensitive' } }, { sku: { contains: searchQuery, mode: 'insensitive' } }],
              }),
            },
            include: {
              category: true,
              baseUnit: true,
              allowedAddons: { include: { addon: true } },
              variants: true,
            },
          },
        },
      })

      if (result.isErr()) throw new Error(result.error)
      return result.value
    },
  })

type FetchPosProductsReturn = ReturnType<typeof fetchPosProducts>
export type PosProduct = NonNullable<FetchPosProductsReturn['data']>[number]

export type posItem = {
  cartId: string
  product: PosProduct
  quantity: number
  variant: NonNullable<PosProduct['variants']>[number] | undefined
  addons: NonNullable<PosProduct['allowedAddons']>[number][] | undefined
}

export const posFormOpts = formOptions({
  defaultValues: {
    items: [] as posItem[],
    customerId: null as string | null,
    customerName: '',
  },
})

export const Route = createFileRoute('/(private)/pos/')({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string } => ({
    q: (search['q'] as string) || '',
    category: (search['category'] as string) || 'ALL',
  }),
  component: POSPage,
})

function POSPage() {
  const form = useAppForm({
    ...posFormOpts,
    onSubmit: async ({ value }) => {
      console.log('Order Submitted:', value)
      try {
        const result = await createPosTransaction({
          data: {
            customerId: null,
            items: value.items.map(item => ({
              productId: item.product.id,
              variantId: item.variant?.id || item.product.id,
              quantity: item.quantity,
              unitId: item.product.baseUnitId,
              price: item.variant?.price || item.product.price,
              costPrice: item.variant?.costPrice || item.product.costPrice,
              addons:
                item.addons?.map(a => ({
                  addonId: a.addonId,
                  price: a.priceOverride,
                  costPrice: a.addon.costPrice,
                  quantity: 1,
                })) || [],
            })),
          },
        })

        const doc = <ReceiptPDF transaction={result} data={value} />
        const asBlob = await pdf(doc).toBlob()
        const url = URL.createObjectURL(asBlob)

        const printJS = (await import('print-js-updated')).default

        printJS({
          printable: url,
          type: 'pdf',
          onPrintDialogClose: () => {
            URL.revokeObjectURL(url)
          },
          onError: err => {
            console.error('Print failed:', err)
            URL.revokeObjectURL(url)
          },
        })

        showModal(SuccessPrompt, {
          title: 'Transaction Completed',
          description: 'Payment processed and order logged.',
          btnText: 'Next Customer',
        })
        form.reset()
      } catch (error) {
        console.error('Sale failed', error)
      }
    },
  })

  return (
    <div className='flex h-screen w-full bg-background p-4 gap-4 overflow-hidden'>
      <Sidebar />
      <ProductGrid form={form} />
      <CartAside form={form} />
    </div>
  )
}
