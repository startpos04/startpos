import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { AlertCircleIcon, CheckCircleIcon, CircleDashedIcon, ExternalLinkIcon, XCircleIcon } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { getComplianceAdapter } from '@/lib/compliance'
import { cn } from '@startpos-core/lib/utils'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'

/**
 * RegistrationStatusCard
 *
 * Dashboard section showing business registration status with guidance.
 * Only visible to ADMIN and OWNER roles.
 *
 * States:
 * - UNREGISTERED: Shows "Not registered yet" with guidance
 * - PENDING: Shows "Registration in progress" with missing fields
 * - REGISTERED (complete): Hidden (or shows brief success then disappears)
 * - REGISTERED (incomplete): Shows "Data incomplete" with missing fields
 * - EXPIRED: Shows "Registration expired" with renewal prompt
 *
 * Dismissible for UNREGISTERED status (saved to localStorage).
 */
export function RegistrationStatusCard() {
  const user = useStore(authStore, state => state.user)
  const [dismissed, setDismissed] = React.useState(false)

  // Only show for ADMIN and OWNER roles
  const canSee = user?.role === Role.ADMIN || user?.role === Role.OWNER
  if (!canSee) return null

  // Get registration status from business
  const registrationStatus = user?.business?.registrationStatus ?? 'UNREGISTERED'

  // Check if compliance data is complete (for REGISTERED status)
  const isComplianceComplete = React.useMemo(() => {
    if (!user?.business || registrationStatus !== 'REGISTERED') return true

    try {
      const adapter = getComplianceAdapter(user.business.countryCode)
      const complianceData = adapter.extractComplianceData({
        business: user.business as any,
        branch: user.branch as any,
        user: user as any,
      })
      const missingFields = adapter.validateCompliance(complianceData)
      return missingFields.length === 0
    } catch {
      return false
    }
  }, [user, registrationStatus])

  // Check localStorage for dismissal (only for UNREGISTERED status)
  React.useEffect(() => {
    if (registrationStatus === 'UNREGISTERED') {
      const isDismissed = localStorage.getItem('registration-status-dismissed') === 'true'
      setDismissed(isDismissed)
    }
  }, [registrationStatus])

  // Handle dismissal
  const handleDismiss = () => {
    localStorage.setItem('registration-status-dismissed', 'true')
    setDismissed(true)
  }

  // Don't show if dismissed (only for UNREGISTERED)
  if (registrationStatus === 'UNREGISTERED' && dismissed) return null

  // Don't show if REGISTERED and data is complete
  if (registrationStatus === 'REGISTERED' && isComplianceComplete) return null

  // Render appropriate card based on status
  switch (registrationStatus) {
    case 'UNREGISTERED':
      return <UnregisteredCard onDismiss={handleDismiss} />
    case 'PENDING':
      return <PendingCard />
    case 'REGISTERED':
      // If we reach here, data is incomplete
      return <RegisteredIncompleteCard />
    case 'EXPIRED':
      return <ExpiredCard />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// UnregisteredCard — Business not officially registered yet
// ---------------------------------------------------------------------------

interface UnregisteredCardProps {
  onDismiss: () => void
}

function UnregisteredCard({ onDismiss }: UnregisteredCardProps) {
  return (
    <Card className='border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20'>
      <CardHeader className='pb-3'>
        <div className='flex items-start justify-between gap-4'>
          <div className='flex items-start gap-2'>
            <AlertCircleIcon className='h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0' />
            <div>
              <CardTitle className='text-base text-amber-900 dark:text-amber-200'>Business Registration</CardTitle>
              <p className='text-sm text-amber-700 dark:text-amber-300 mt-0.5'>Status: Not Registered Yet</p>
            </div>
          </div>
          <button
            type='button'
            onClick={onDismiss}
            className='text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-xs font-medium'
          >
            Dismiss
          </button>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-amber-800 dark:text-amber-200'>
          Your receipts won't have official tax compliance information. Complete registration when you're ready.
        </p>
        <div className='flex flex-col sm:flex-row gap-2'>
          <Button asChild variant='default' size='sm' className='bg-amber-600 hover:bg-amber-700 text-white'>
            <Link to='/settings/compliance'>
              Complete Registration
              <ExternalLinkIcon className='h-3.5 w-3.5 ml-1.5' />
            </Link>
          </Button>
          <Button
            asChild
            variant='ghost'
            size='sm'
            className='text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/40'
          >
            <a href='https://www.bir.gov.ph/' target='_blank' rel='noopener noreferrer'>
              Learn More
              <ExternalLinkIcon className='h-3.5 w-3.5 ml-1.5' />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PendingCard — Registration in progress
// ---------------------------------------------------------------------------

function PendingCard() {
  const user = useStore(authStore, state => state.user)

  // Get missing fields from compliance validation
  const missingFields = React.useMemo(() => {
    if (!user?.business) return []

    try {
      const adapter = getComplianceAdapter(user.business.countryCode)
      const complianceData = adapter.extractComplianceData({
        business: user.business as any,
        branch: user.branch as any,
        user: user as any,
      })
      return adapter.validateCompliance(complianceData)
    } catch {
      return ['Unable to validate compliance data']
    }
  }, [user])

  return (
    <Card className='border-blue-200 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/20'>
      <CardHeader className='pb-3'>
        <div className='flex items-start gap-2'>
          <CircleDashedIcon className='h-5 w-5 text-blue-600 dark:text-blue-500 mt-0.5 shrink-0' />
          <div>
            <CardTitle className='text-base text-blue-900 dark:text-blue-200'>Business Registration</CardTitle>
            <p className='text-sm text-blue-700 dark:text-blue-300 mt-0.5'>Status: Registration In Progress</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-blue-800 dark:text-blue-200'>Add your TIN, permits, and business details to complete your registration.</p>
        {missingFields.length > 0 && (
          <div className='text-sm'>
            <p className='font-medium text-blue-900 dark:text-blue-200 mb-1'>Missing:</p>
            <p className='text-blue-700 dark:text-blue-300'>{missingFields.join(', ')}</p>
          </div>
        )}
        <Button asChild variant='default' size='sm' className='bg-blue-600 hover:bg-blue-700 text-white'>
          <Link to='/settings/compliance'>
            Complete Registration
            <ExternalLinkIcon className='h-3.5 w-3.5 ml-1.5' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RegisteredIncompleteCard — Marked as registered but data is missing
// ---------------------------------------------------------------------------

function RegisteredIncompleteCard() {
  const user = useStore(authStore, state => state.user)

  // Get missing fields from compliance validation
  const missingFields = React.useMemo(() => {
    if (!user?.business) return []

    try {
      const adapter = getComplianceAdapter(user.business.countryCode)
      const complianceData = adapter.extractComplianceData({
        business: user.business as any,
        branch: user.branch as any,
        user: user as any,
      })
      return adapter.validateCompliance(complianceData)
    } catch {
      return ['Unable to validate compliance data']
    }
  }, [user])

  return (
    <Card className='border-destructive/30 bg-destructive/5'>
      <CardHeader className='pb-3'>
        <div className='flex items-start gap-2'>
          <XCircleIcon className='h-5 w-5 text-destructive mt-0.5 shrink-0' />
          <div>
            <CardTitle className='text-base text-foreground'>Registration Data Incomplete</CardTitle>
            <p className='text-sm text-muted-foreground mt-0.5'>Status: Registered (but data is missing)</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-foreground'>You marked your business as registered but some required information is missing.</p>
        {missingFields.length > 0 && (
          <div className='text-sm'>
            <p className='font-medium text-foreground mb-1'>Missing:</p>
            <p className='text-muted-foreground'>{missingFields.join(', ')}</p>
          </div>
        )}
        <div className='flex flex-col sm:flex-row gap-2'>
          <Button asChild variant='destructive' size='sm'>
            <Link to='/settings/compliance'>
              Fix Now
              <ExternalLinkIcon className='h-3.5 w-3.5 ml-1.5' />
            </Link>
          </Button>
          <Button asChild variant='outline' size='sm'>
            <Link to='/settings/compliance'>Mark as Unregistered</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ExpiredCard — Registration expired (renewal needed)
// ---------------------------------------------------------------------------

function ExpiredCard() {
  return (
    <Card className='border-destructive/30 bg-destructive/5'>
      <CardHeader className='pb-3'>
        <div className='flex items-start gap-2'>
          <XCircleIcon className='h-5 w-5 text-destructive mt-0.5 shrink-0' />
          <div>
            <CardTitle className='text-base text-foreground'>Registration Expired</CardTitle>
            <p className='text-sm text-muted-foreground mt-0.5'>Status: Renewal Required</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-sm text-foreground'>Your business registration has expired. Please renew your registration to continue issuing official receipts.</p>
        <Button asChild variant='destructive' size='sm'>
          <Link to='/settings/compliance'>
            Renew Registration
            <ExternalLinkIcon className='h-3.5 w-3.5 ml-1.5' />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
