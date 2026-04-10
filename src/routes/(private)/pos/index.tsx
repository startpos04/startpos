import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { useAppForm } from '@/hooks/form'
import { posItem } from '@/lib/conversion/inventory-engine'
import { showModal } from '@/lib/overlay'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'
import { createPosOrder } from '@/lib/server-fn/create-pos-order'
import { createPosTransaction } from '@/lib/server-fn/create-pos-transaction'
import { pdf } from '@react-pdf/renderer'
import { formOptions, uuid } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { Order } from 'prisma/generated/prisma/browser'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { CartAside } from './-components/cart-aside'
import { ProductGrid } from './-components/product-grid'
import { ReceiptPDF } from './-components/receipt-ticket'

export const posFormOpts = formOptions({
  defaultValues: {
    order: null as Order | null,
    items: [] as posItem[],
    customerReference: null as string | null,
    payment: {
      tendered: 0,
    },
  },
})

export const Route = createFileRoute('/(private)/pos/')({
  validateSearch: (search: Record<string, unknown>): { q?: string | undefined; orderId?: string | undefined } => ({
    q: (search['q'] as string) || '',
    orderId: (search['orderId'] as string) || undefined,
  }),
  component: POSPage,
})

function POSPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { q: searchQuery, orderId } = useSearch({ from: '/(private)/pos/' })
  const { data: activeOrders = [], isLoading: isFetchingActiveOrders } = fetchActiveOrders()
  const { data: posProducts = [], isLoading: isPosProductsLoading } = fetchPosProducts(searchQuery)

  const handleConfirm = async (value: typeof posFormOpts.defaultValues) => {
    try {
      const result = await createPosTransaction({
        data: {
          orderId: orderId!,
          customerReference: value.customerReference,
          payment: {
            tendered: Number(value.payment.tendered),
          },
          items: value.items.map(item => ({
            cartId: item.cartId,
            productId: item.product.id,
            variantId: item.variant?.id,
            quantity: item.quantity,
            addons: item.addons,
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

      await queryClient.invalidateQueries({ queryKey: ['pos-products', searchQuery] })
      await queryClient.invalidateQueries({ queryKey: ['active-orders'] })
      form.reset()
      navigate({ to: '.', search: (prev: any) => ({ ...prev, orderId: undefined }), replace: true })
    } catch (error) {
      console.error('Sale failed', error)
    }
  }

  const handlePayLater = async (value: typeof posFormOpts.defaultValues) => {
    try {
      await createPosOrder({
        data: {
          orderId: orderId!,
          customerReference: value.customerReference,
          payment: {
            tendered: Number(value.payment.tendered),
          },
          items: value.items.map(item => ({
            cartId: item.cartId,
            productId: item.product.id,
            variantId: item.variant?.id,
            quantity: item.quantity,
            addons: item.addons,
          })),
        },
      })

      if (!orderId) toast.success('Order created successfully')
      else toast.success('Order updated successfully')
      await queryClient.invalidateQueries({ queryKey: ['pos-products', searchQuery] })
      await queryClient.invalidateQueries({ queryKey: ['active-orders'] })
    } catch (error) {
      console.error('Sale failed', error)
    }
  }

  const defaultValues = useMemo(() => {
    if (!orderId || !activeOrders.length) return posFormOpts.defaultValues
    const existingOrder = activeOrders.find(o => o.id === orderId)
    if (!existingOrder) return posFormOpts.defaultValues

    return {
      customerReference: existingOrder.customerReference,
      order: existingOrder,
      items: existingOrder.items
        .map(item => {
          const product = posProducts.find(p => p.id === item.variant.productId)
          if (!product) return null
          const variant = product.variants.find(v => v.id === item.variantId) || null
          if (!variant) return null
          const addons = item.selectedAddons.map(a => variant.components.find(c => c.isAddon && c.materialId === a.addonId)).filter(Boolean)

          return {
            cartId: uuid(),
            product,
            variant,
            quantity: item.quantity,
            addons,
          }
        })
        .filter(Boolean) as posItem[],
      payment: { tendered: 0 },
    }
  }, [orderId, activeOrders, posProducts])

  const form = useAppForm({
    ...posFormOpts,
    defaultValues,
    onSubmit: async ({ value }) => {
      if (value.payment.tendered > 0) await handleConfirm(value)
      else await handlePayLater(value)
    },
  })

  if (orderId && (isFetchingActiveOrders || isPosProductsLoading)) {
    return (
      <div className='flex items-center justify-center h-screen w-full'>
        <p>Loading order...</p>
      </div>
    )
  }

  return (
    <div className='flex h-screen w-full bg-background p-4 gap-4 overflow-hidden'>
      <ProductGrid form={form} />
      <CartAside form={form} />
    </div>
  )
}
