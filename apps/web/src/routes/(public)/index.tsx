import Loading from '@platform/components/custom/loading'
import { authStore } from '@platform/lib/better-auth/auth-store'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/(public)/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate({ from: '/' })

  useEffect(() => {
    const authedUser = user ?? authStore.state.user
    if (authedUser?.id && authedUser.landingPage) {
      navigate({ to: authedUser.landingPage, replace: true })
    } else {
      navigate({ to: '/login', replace: true })
    }
  }, [user, navigate])

  return <Loading className='w-screen h-screen' />
}
