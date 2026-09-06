import { Tooltip, TooltipContent, TooltipTrigger } from '@platform/components/ui/tooltip'
import { cn } from '@platform/lib/utils'
import { Link } from '@tanstack/react-router'
import { AlertCircleIcon, CheckCircleIcon, CircleDashedIcon, XCircleIcon } from 'lucide-react'
import { Role } from 'prisma/generated/prisma/enums'
import * as React from 'react'
import { useAuthenticatedUser } from '@/lib/better-auth/auth-store'

/**
 * RegistrationStatusIndicator
 *
 * A subtle icon indicator in the app bar showing the business registration status.
 * Only visible to ADMIN and MANAGER roles.
 *
 * Icon States:
 * - ⚠️ (Yellow/Orange) = UNREGISTERED
 * - ⏳ (Blue) = PENDING
 * - ✅ (Green) = REGISTERED
 * - 🔴 (Red) = EXPIRED
 *
 * Clicking the icon navigates to Settings → Compliance page.
 */
export function RegistrationStatusIndicator() {
  const user = useAuthenticatedUser()

  // Get registration status from business
  const registrationStatus = user.business?.registrationStatus ?? 'UNREGISTERED'

  // Determine icon, color, and tooltip based on status
  const statusConfig = React.useMemo(() => {
    switch (registrationStatus) {
      case 'UNREGISTERED':
        return {
          icon: AlertCircleIcon,
          colorClass: 'text-amber-600 hover:text-amber-700 dark:text-amber-500',
          tooltip: 'Business not registered — Click to complete',
          bgClass: 'hover:bg-amber-50 dark:hover:bg-amber-950/20',
        }
      case 'PENDING':
        return {
          icon: CircleDashedIcon,
          colorClass: 'text-blue-600 hover:text-blue-700 dark:text-blue-500',
          tooltip: 'Registration in progress — Click to complete',
          bgClass: 'hover:bg-blue-50 dark:hover:bg-blue-950/20',
        }
      case 'REGISTERED':
        return {
          icon: CheckCircleIcon,
          colorClass: 'text-green-600 hover:text-green-700 dark:text-green-500',
          tooltip: 'Business registered ✓',
          bgClass: 'hover:bg-green-50 dark:hover:bg-green-950/20',
        }
      case 'EXPIRED':
        return {
          icon: XCircleIcon,
          colorClass: 'text-destructive hover:text-destructive/90',
          tooltip: 'Registration expired — Click to renew',
          bgClass: 'hover:bg-destructive/5',
        }
      default:
        return {
          icon: AlertCircleIcon,
          colorClass: 'text-muted-foreground',
          tooltip: 'Unknown status',
          bgClass: 'hover:bg-muted',
        }
    }
  }, [registrationStatus])

  // Only show for ADMIN and MANAGER roles - check AFTER all hooks are called
  const canSee = user?.role === Role.ADMIN || user?.role === Role.OWNER
  if (!canSee) return null

  const Icon = statusConfig.icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to='/settings/compliance'
          className={cn('flex items-center justify-center w-10 h-10 rounded-md transition-colors', statusConfig.colorClass, statusConfig.bgClass)}
        >
          <Icon className='h-5 w-5' />
          <span className='sr-only'>{statusConfig.tooltip}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className='text-xs'>{statusConfig.tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}
