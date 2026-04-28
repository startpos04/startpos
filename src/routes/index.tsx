import { authStore } from '@/store/auth-store'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const { isAuthenticated } = context
    if (isAuthenticated) {
      const { user } = authStore.state
      throw redirect({ to: user.landingPage })
    }

    throw redirect({ to: '/login' })
  },
})

// TODO: save the current product details to order details
// TODO: create product with variants
// TODO: edit product with variants
// TODO: order splitting
// TODO: lock order when payment is being processed

// TODO: multiple cashier
