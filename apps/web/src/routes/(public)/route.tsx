import { AppWrapper } from '@platform/components/custom/app-wrapper'
import { LegalFooter } from '@platform/components/custom/legal-footer'
import { localAuthCollection } from '@platform/db/local-auth'
import { useIsOnline } from '@platform/hooks/use-is-online'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

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
    if (localUser?.id) {
      const destination = 'landingPage' in localUser ? localUser.landingPage : '/'
      navigate({ to: destination, replace: true })
    }
  }, [localAuths.isReady, navigate])

  return (
    <div className='h-screen flex flex-col overflow-hidden'>
      <div className='flex-1 overflow-y-auto min-h-0'>
        <Outlet />
      </div>
      <LegalFooter />
    </div>
  )
}
