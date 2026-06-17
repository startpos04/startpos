import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Dashboard } from '@/components/custom/dashboard'

export const Route = createFileRoute('/(private)/(dashboard)')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Dashboard>
      <Outlet />
    </Dashboard>
  )
}
