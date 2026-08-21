import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Role } from 'prisma/generated/prisma/enums'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { user } = authStore.state
    // Only ADMIN role can access business section
    if (user.role !== Role.ADMIN) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
