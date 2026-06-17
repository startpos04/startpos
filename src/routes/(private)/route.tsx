import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AppWrapper } from '@/components/custom/app-wrapper'
import Loading from '@/components/custom/loading'
import { localAuthCollection } from '@/db/local-auth'
import { useIsOnline } from '@/hooks/use-is-online'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)')({
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
    if (!localAuths.isReady || !localAuths.data) return
    const localUser = isOnline ? user : authStore.state.user

    if (!localUser?.id) {
      navigate({ to: '/login' })
      return
    }

    const exists = localAuths.data.find(u => u.id === localUser.id)

    if (exists && isOnline && user) {
      AuthEngine.syncServerToLocal(user)
    }
  }, [localAuths.isReady, navigate, user])

  if (!user) return <Loading className='w-screen h-screen' />
  return <Outlet />
}
