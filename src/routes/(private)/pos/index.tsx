import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { useAppForm } from '@/hooks/form'
import { posItem } from '@/lib/conversion/inventory-engine'
import { showModal } from '@/lib/overlay'
import { createPosTransaction } from '@/lib/server-fn/create-pos-transaction'
import { pdf } from '@react-pdf/renderer'
import { formOptions } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { CartAside } from './-components/cart-aside'
import { ProductGrid } from './-components/product-grid'
import { ReceiptPDF } from './-components/receipt-ticket'
import { Sidebar } from './-components/sidebar'

export const posFormOpts = formOptions({
  defaultValues: {
    items: [] as posItem[],
    customerId: null as string | null,
    customerName: '',
    payment: {
      tendered: 0,
    },
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
  const queryClient = useQueryClient()
  const { q: searchQuery, category: activeCategory } = useSearch({ from: '/(private)/pos/' })

  const form = useAppForm({
    ...posFormOpts,
    onSubmit: async ({ value }) => {
      try {
        const result = await createPosTransaction({
          data: {
            customerId: null,
            payment: value.payment,
            items: value.items.map(item => ({
              cartId: item.cartId,
              productId: item.product.id,
              variantId: item.variant?.id || item.product.id,
              quantity: item.quantity,
              addons:
                item.addons?.map(a => ({
                  addonId: a.addonId,
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

        await queryClient.invalidateQueries({ queryKey: ['pos-products', activeCategory, searchQuery] })
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
