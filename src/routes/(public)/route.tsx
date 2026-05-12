import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppWrapper } from '@/components/custom/app-wrapper'
import { localAuthCollection } from '@/db/local-auth'
import { useIsOnline } from '@/hooks/use-is-online'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(public)')({
  component: () => (
    <AppWrapper>
      <RouteComponent />
    </AppWrapper>
  ),
})

function RouteComponent() {
  const isOnline = useIsOnline()
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: '/' })
  const localAuths = useLiveQuery(q => q.from({ localAuth: localAuthCollection }).select(({ localAuth }) => localAuth))

  // biome-ignore lint/correctness/useExhaustiveDependencies: it will cause  Maximum update depth exceeded error
  useEffect(() => {
    if (!localAuths.isReady) return
    const localUser = isOnline ? user : authStore.state.user
    if (localUser?.id && localUser?.landingPage) {
      navigate({ to: localUser.landingPage, replace: true })
    }
  }, [localAuths.isReady, navigate])

  return <Outlet />
}
