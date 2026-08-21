import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Role } from 'prisma/generated/prisma/enums'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/business/suppliers')({
  component: () => <Outlet />,
  beforeLoad: async () => {
    const { user } = authStore.state
    // Suppliers can be managed by both ADMIN and SUPERVISOR
    const allowedRoles = [Role.ADMIN, Role.SUPERVISOR] as Role[]
    if (!allowedRoles.includes(user.role as Role)) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
