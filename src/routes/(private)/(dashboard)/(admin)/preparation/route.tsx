import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)/preparation')({
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
