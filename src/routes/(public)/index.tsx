import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import Loading from '@/components/custom/loading'

export const Route = createFileRoute('/(public)/')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate({ from: '/' })

  useEffect(() => {
    navigate({ to: '/login', replace: true })
  }, [navigate])

  return <Loading className='w-screen h-screen' />
}
