import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Dashboard } from '@/components/dashboard'
import { ContextSwitcher } from './-components/context-switcher'
import { SubscriptionBanner } from './-components/subscription-banner'

export const Route = createFileRoute('/(private)/(dashboard)')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Dashboard contextSwitcher={<ContextSwitcher />}>
      <SubscriptionBanner />
      <Outlet />
    </Dashboard>
  )
}
