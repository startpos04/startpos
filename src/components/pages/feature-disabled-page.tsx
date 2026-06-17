import { Link, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ShieldAlertIcon } from 'lucide-react'
import { useEffect } from 'react'
import { authStore } from '@/store/auth-store'

export function FeatureDisabledPage() {
  const user = useStore(authStore, state => state.user)
  const navigate = useNavigate()

  useEffect(() => {
    navigate({ to: '/unauthorized', replace: true })
  }, [])

  return (
    <div className='flex h-[80vh] flex-col items-center justify-center text-center px-4'>
      <div className='bg-destructive/10 text-destructive p-4 rounded-full mb-4'>
        <ShieldAlertIcon size={40} />
      </div>
      <h1 className='text-2xl font-bold tracking-tight text-foreground sm:text-3xl'>Feature Disabled</h1>
      <p className='mt-2 text-muted-foreground max-w-sm'>
        This module is currently turned off in your system configurations. Please contact your administrator to enable it.
      </p>
      <Link
        to={user.landingPage}
        className='mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/95'
      >
        Return to Dashboard
      </Link>
    </div>
  )
}
