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
import { useSubscriptionGate } from '@/components/feature-disabled'
import { sequenceCounterCollection } from '@/db/collections'
import { useAppForm } from '@/hooks/form'
import { useCapability } from '@/hooks/use-capability'
import { useIsMobile } from '@/hooks/use-mobile'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import type { posItem } from '@/lib/conversion/pos-stock-engine'
import { Capabilities } from '@/lib/entitlement/capability-keys'
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
    compliance: {} as { scPwdName?: string; scPwdIdNumber?: number; scPwdDiscount?: number },
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
  component: POSPageGate,
})

// Subscription gate wrapper — hooks must always be called unconditionally,
// so we split the gate check into its own component that renders before POSPage.
function POSPageGate() {
  const gate = useSubscriptionGate()
  if (gate) return gate
  return <POSPage />
}

function POSPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const user = useStore(authStore, state => state.user)
  const canReconcile = useCapability(Capabilities.START_VENDOR_SESSION)
  const { orderId, search = '', page = 1, pageSize = 20 } = useSearch({ from: '/(private)/pos/' })
  const { data: activeOrders = [], isLoading: isFetchingActiveOrders } = fetchActiveOrders()
  const { data: posProducts = [], isLoading: isPosProductsLoading } = fetchPosProducts({ searchQuery: search, page, pageSize })
  useLiveQuery(q => q.from({ sequence: sequenceCounterCollection }))

  const handleConfirm = async (
    value: typeof posFormOpts.defaultValues,
    compliance?: { scPwdName?: string; scPwdIdNumber?: number; scPwdDiscount?: number },
  ) => {
    const result = await createPosTransaction(
      {
        orderId: orderId!,
        items: value.items,
        customer: {
          customerId: '',
          customerReference: value.customerReference,
        },
        compliance: {
          ...(compliance?.scPwdName ? { scPwdName: compliance.scPwdName } : {}),
          ...(compliance?.scPwdIdNumber ? { scPwdIdNumber: compliance.scPwdIdNumber } : {}),
          ...(compliance?.scPwdDiscount ? { scPwdDiscount: compliance.scPwdDiscount } : {}),
        },
        payments: value.payments,
      },
      posProducts,
    )

    if (result.error) {
      // Credit exhaustion gets its own modal with a billing link.
      // All other errors fall through to the generic toast.
      if (result.error.message?.includes('Credit balance is zero')) {
        MountManager.show(AlertPrompt, {
          title: 'Credits exhausted',
          description: <span>You've used all your available credits. To keep processing transactions, top up your credits on the billing page .</span>,
          btnText: 'Go to billing',
          onClick: () => void navigate({ to: '/billing/credits' }),
        })
        return
      }
      toast.error('Failed to process transaction. Please try again.')
      return
    }

    // Always show success and reset — print is a non-blocking side effect
    MountManager.show(SuccessPrompt, {
      title: 'Transaction Completed',
      description: 'Payment processed and order logged.',
      btnText: 'Next Customer',
    })

    form.reset()
    navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, orderId: undefined }), replace: true })

    // Attempt to print receipt — failure must never block or revert the completed sale
    if (user.systemConfigs.ENABLE_PRINT_RECEIPT) {
      try {
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
      } catch (error) {
        console.error('Receipt print failed (sale was completed):', error)
      }
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
      compliance: {},
    }
  }, [orderId, activeOrders, posProducts])

  const form = useAppForm({
    ...posFormOpts,
    defaultValues,
    onSubmit: async ({ value }) => {
      // Only gate on vendor session when cash reconciliation is enabled.
      // Businesses without the START_VENDOR_SESSION capability don't create
      // sessions, so vendorSession is null — skipping this check for them.
      if (canReconcile && user.vendorSession?.status !== SessionStatus.OPEN) return
      if (value.payments.length > 0) await handleConfirm(value, value.compliance)
      else await handlePayLater(value)
    },
  })

  useEffect(() => {
    // Only enforce shift sessions when cash reconciliation is enabled
    if (!canReconcile) return

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
      MountManager.show(OpenSessionDialog, { key: 'open-session-dialog' })
    }
  }, [user, navigate, canReconcile])

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
