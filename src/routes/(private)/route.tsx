import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)')({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const { isAuthenticated } = context
    if (!isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
})

function RouteComponent() {
  return <Outlet />
}
