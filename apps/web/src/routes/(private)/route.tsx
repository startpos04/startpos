import { AppWrapper } from '@platform/components/custom/app-wrapper'
import Loading from '@platform/components/custom/loading'
import { localAuthCollection } from '@platform/db/local-auth'
import { useIsOnline } from '@platform/hooks/use-is-online'
import { AuthEngine } from '@platform/lib/better-auth/auth-engine'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { useLiveQuery } from '@tanstack/react-db'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import MountManager from '@/lib/mount-manager'
import { TermsUpdateModal } from './-components/terms-update-modal'
import { WelcomeModal } from './-components/welcome-modal'

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

    // Session exists but no Membership yet â†’ OAuth user needs business setup
    if (isOnline && user && !user.business?.id) {
      navigate({ to: '/register/business-setup' })
      return
    }

    const exists = localAuths.data.find(u => u.id === localUser.id)

    if (exists && isOnline && user) {
      AuthEngine.syncServerToLocal(user)
    }

    MountManager.clear()
  }, [localAuths.isReady, navigate, user])

  if (!user) return <Loading className='w-screen h-screen' />

  return (
    <div className='flex flex-col min-h-screen'>
      <div className='flex-1 flex flex-col min-h-0'>
        <Outlet />
      </div>
      {/* Terms re-acceptance gate â€” shown when CURRENT_TERMS_VERSION > user.termsVersion */}
      <TermsUpdateModal />
      {/* Welcome modal â€” fires once on first login after registration */}
      <WelcomeModal />
    </div>
  )
}
