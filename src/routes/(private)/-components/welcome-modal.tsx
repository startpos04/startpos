/**
 * welcome-modal.tsx — First-login welcome modal (Phase 1 BOS UI)
 *
 * Fires once when a new user lands on the app after completing registration.
 * Condition: user.onboardingCompletedAt is set (registration went through
 * ConfigurationEngine) AND the user has never dismissed this modal before
 * (stored in localStorage under a per-user key so it truly fires only once
 * per account across sessions, not just per session).
 *
 * Content:
 *   - Welcome greeting with business name
 *   - Profile-aware subtitle — tells the user which path fits their business
 *   - Single "Go to dashboard" button to dismiss
 *
 * Architecture:
 *   - Rendered in the private shell (route.tsx).
 *   - Reads onboardingCompletedAt and currentProfile from ServerUser.
 *   - Stores dismissal in localStorage — persists across logins.
 *   - No server call on dismiss — purely client-side gate.
 */

import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { SparklesIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@startpos-core/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@startpos-core/components/ui/dialog'
import type { OperationalProfile } from '@/lib/onboarding/types'
import { authStore } from '@startpos-core/lib/better-auth/auth-store'

// ---------------------------------------------------------------------------
// localStorage key — scoped to userId so each account tracks independently
// ---------------------------------------------------------------------------

function getStorageKey(userId: string): string {
  return `welcome-modal-dismissed-${userId}`
}

function hasBeenDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(getStorageKey(userId)) === 'true'
  } catch {
    return false
  }
}

function markDismissed(userId: string): void {
  try {
    localStorage.setItem(getStorageKey(userId), 'true')
  } catch {
    // ignore — private mode or storage full
  }
}

// ---------------------------------------------------------------------------
// Profile-aware subtitle
// ---------------------------------------------------------------------------

function getProfileSubtitle(profile: string | null): string {
  switch (profile as OperationalProfile | null) {
    case 'LITE_POS':
    case 'SERVICE_BUSINESS':
      return 'Your store is ready. Head to the POS and start selling — no catalog setup needed.'
    case 'SIMPLE_RETAILER':
    case 'QUICK_SERVICE':
      return 'You can start selling immediately or set up your catalog first. The dashboard will guide you.'
    case 'FOOD_AND_BEVERAGE':
      return 'Your order queue is ready. Take orders at the POS, your team prepares them, and customers pay at the end.'
    case 'INVENTORY_INTENSIVE':
    case 'WHOLESALE_DISTRIBUTION':
      return 'Check the dashboard for your setup steps — adding products and stock first will give you full tracking from day one.'
    case 'MULTI_BRANCH_ENTERPRISE':
      return 'Your store is configured. Check the dashboard to finish setting up your catalog and team access.'
    default:
      return 'Your store has been set up based on your answers. Check the dashboard to see your recommended next steps.'
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WelcomeModal() {
  const user = useStore(authStore, state => state.user)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    // Only show when onboarding was completed (v2 survey path) AND not yet dismissed
    if (!user.onboardingCompletedAt) return
    if (hasBeenDismissed(user.id)) return
    // Small delay so the dashboard finishes rendering before the modal appears
    const timer = setTimeout(() => setOpen(true), 800)
    return () => clearTimeout(timer)
  }, [user?.id, user?.onboardingCompletedAt])

  const handleDismiss = () => {
    if (user?.id) markDismissed(user.id)
    setOpen(false)
  }

  if (!open) return null

  const businessName = user?.business?.name ?? 'your store'
  const subtitle = getProfileSubtitle(user?.currentProfile ?? null)

  return (
    <Dialog
      open={open}
      onOpenChange={val => {
        if (!val) handleDismiss()
      }}
    >
      <DialogContent className='sm:max-w-sm'>
        <DialogHeader>
          <div className='flex items-center gap-2 mb-1'>
            <SparklesIcon className='size-5 text-primary' />
            <DialogTitle className='text-lg'>Welcome to {businessName}!</DialogTitle>
          </div>
          <DialogDescription className='text-sm leading-relaxed'>{subtitle}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button className='w-full' asChild onClick={handleDismiss}>
            <Link to='/dashboard'>Go to dashboard →</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
