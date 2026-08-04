import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Dashboard } from '@/components/custom/dashboard'
import { SubscriptionBanner } from '@/components/subscription-banner'

export const Route = createFileRoute('/(private)/(dashboard)')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Dashboard>
      <SubscriptionBanner />
      <Outlet />
    </Dashboard>
  )
}
