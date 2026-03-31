import { authStore } from '@/store/auth-store'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Role } from 'prisma/generated/prisma/enums'

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
