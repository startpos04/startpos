import { pdf } from '@react-pdf/renderer'
import { useLiveQuery } from '@tanstack/react-db'
import { formOptions, useStore, uuid } from '@tanstack/react-form'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { type Order, Role, SessionStatus } from 'prisma/generated/prisma/browser'
import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import Loading from '@/components/custom/loading'
import { AlertPrompt } from '@/components/custom/prompt/alert-prompt'
import { SuccessPrompt } from '@/components/custom/prompt/success-prompt'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { sequenceCounterCollection } from '@/db/collections'
import { useAppForm } from '@/hooks/form'
import { useIsMobile } from '@/hooks/use-mobile'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import type { posItem } from '@/lib/conversion/inventory-engine'
import MountManager from '@/lib/mount-manager'
import { createPosOrder } from '@/lib/queries/create-pos-order'
import { createPosTransaction } from '@/lib/queries/create-pos-transaction'
import { fetchActiveOrders } from '@/lib/queries/fetch-active-orders'
import { fetchPosProducts } from '@/lib/queries/fetch-pos-products'
import { authStore } from '@/store/auth-store'
import { ProfileDropdown } from '../orders/-components/profile-dropdown'
import { ActiveOrdersButton } from './-components/active-orders-btn'
import { CartAside } from './-components/cart-aside'
import { OpenSessionDialog } from './-components/open-session-dialog'
import type { PaymentLine } from './-components/payment-dialog'
import { ProductItems } from './-components/product-items'
import { ReceiptPDF } from './-components/receipt-ticket'

export const posFormOpts = formOptions({
  defaultValues: {
    order: null as Order | null,
    items: [] as posItem[],
    customerReference: null as string | null,
    payments: [] as PaymentLine[],
  },
})

export const Route = createFileRoute('/(private)/pos/')({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search['view'] as 'table' | 'grid' | undefined,
    search: search['search'] as string | undefined,
    orderId: search['orderId'] as string | undefined,
    page: search['page'] as number | undefined,
    pageSize: search['page-size'] as number | undefined,
  }),
  component: POSPage,
})

function POSPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const user = useStore(authStore, state => state.user)
  const { orderId, search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
  const { data: activeOrders = [], isLoading: isFetchingActiveOrders } = fetchActiveOrders()
  const { data: posProducts = [], isLoading: isPosProductsLoading } = fetchPosProducts({ searchQuery: search, page, pageSize })
  useLiveQuery(q => q.from({ sequence: sequenceCounterCollection }))

  const handleConfirm = async (value: typeof posFormOpts.defaultValues) => {
    const result = await createPosTransaction(
      {
        orderId: orderId!,
        items: value.items,
        customer: {
          customerId: '',
          customerReference: value.customerReference,
        },
        compliance: {},
        payments: value.payments,
      },
      posProducts,
    )

    if (result.error) {
      toast.error('Failed to process transaction. Please try again.')
      return
    }

    try {
      if (user.systemConfigs.ENABLE_PRINT_RECEIPT) {
        const doc = <ReceiptPDF result={result} data={value} />
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
      }

      MountManager.show(SuccessPrompt, {
        title: 'Transaction Completed',
        description: 'Payment processed and order logged.',
        btnText: 'Next Customer',
      })

      form.reset()
      navigate({ to: '.', search: prev => ({ ...prev, orderId: undefined }), replace: true })
    } catch (error) {
      console.error('Sale failed', error)
    }
  }

  const handlePayLater = async (value: typeof posFormOpts.defaultValues) => {
    const result = await createPosOrder(
      {
        orderId: orderId!,
        customer: {
          customerId: '',
          customerReference: value.customerReference,
        },
        compliance: {},
        payments: value.payments,
        items: value.items,
      },
      posProducts,
    )

    if (result.error) {
      toast.error('Failed to add order. Please try again.')
      return
    }

    if (!orderId) toast.success('Order created successfully')
    else toast.success('Order updated successfully')
    form.reset()
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
      payments: [],
    }
  }, [orderId, activeOrders, posProducts])

  const form = useAppForm({
    ...posFormOpts,
    defaultValues,
    onSubmit: async ({ value }) => {
      if (user.vendorSession?.status !== SessionStatus.OPEN) return
      if (value.payments.length > 0) await handleConfirm(value)
      else await handlePayLater(value)
    },
  })

  useEffect(() => {
    if (user.vendorSession?.status === SessionStatus.CLOSED && user.vendorSession.verifiedCash === null) {
      MountManager.show(AlertPrompt, {
        title: 'Unverified Shift',
        description: 'The previous shift was ended without a verified cash count. Please reconcile the drawer before proceeding with a new shift.',
        btnText: user.role === Role.CASHIER ? 'Logout' : 'Go to Dashboard',
        onClick: () => {
          if (user.role === Role.CASHIER) AuthEngine.logout({ onSuccess: () => navigate({ to: '/login' }) })
          else navigate({ to: user.landingPage })
        },
      })
    } else if (user.vendorSession?.status !== SessionStatus.OPEN) {
      MountManager.show(OpenSessionDialog)
    }
  }, [user, navigate])

  if (orderId && (isFetchingActiveOrders || isPosProductsLoading)) {
    return <Loading className='w-screen h-screen' />
  }

  return (
    <div className='flex h-screen flex-col md:flex-row w-full bg-background p-2 pb-0 md:p-4 gap-2 md:gap-4 overflow-hidden'>
      {isMobile ? (
        <div className='flex items-center justify-end gap-1'>
          <div className='w-10 ml-5'>
            <ThemeToggle />
          </div>
          {user.systemConfigs.ENABLE_ORDER ? <ActiveOrdersButton /> : null}
          <ProfileDropdown />
        </div>
      ) : (
        <ProductItems form={form} />
      )}
      <CartAside form={form} />
    </div>
  )
}
