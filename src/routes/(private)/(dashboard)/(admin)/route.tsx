import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { Role } from 'prisma/generated/prisma/enums'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)')({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const { user } = context
    const allowedRoles = [Role.ADMIN] as Role[]
    if (user && allowedRoles.includes(user.role as Role)) return

    throw redirect({ to: '/login' })
  },
})

function RouteComponent() {
  return <Outlet />
}
