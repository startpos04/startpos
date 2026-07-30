import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Role } from 'prisma/generated/prisma/enums'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/(supervisor)')({
  component: RouteComponent,
  beforeLoad: async () => {
    const { user } = authStore.state
    const allowedRoles = [Role.ADMIN, Role.SUPERVISOR] as Role[]
    if (!allowedRoles.includes(user.role as Role)) {
      throw redirect({ to: '/login' })
    }
  },
})

function RouteComponent() {
  return <Outlet />
}
