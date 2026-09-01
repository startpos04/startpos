/**
 * terms-update-modal.tsx — ToS/Privacy Policy re-acceptance modal
 *
 * Shown when a returning merchant's stored termsVersion is older than the
 * current CURRENT_TERMS_VERSION constant. The merchant cannot proceed past
 * the private shell until they accept.
 *
 * Behaviour:
 *   - Blocks navigation — no close button, no backdrop dismiss.
 *   - Calls acceptTerms() server function on confirm.
 *   - Updates authStore so the version check passes immediately without reload.
 *   - The check runs on every (private) route mount so it also fires on
 *     returning sessions after a legal document update is shipped.
 *
 * When to bump CURRENT_TERMS_VERSION:
 *   Only on material changes: new data categories, changed retention periods,
 *   altered merchant obligations, changed billing terms.
 *   See complete-registration.ts for the constant definition.
 */

import { useStore } from '@tanstack/react-store'
import { FileText, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { acceptTerms } from '@/lib/server-fn/accept-terms'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '@/lib/server-fn/complete-registration'
import { authStore, refreshAuthUser } from '@/lib/better-auth/auth-store'

// ---------------------------------------------------------------------------
// Version staleness check
// ---------------------------------------------------------------------------

export function isTermsOutdated(userTermsVersion: string | null | undefined): boolean {
  // No version recorded — legacy account created before Phase 0.
  // We require acceptance so we have a proper audit record going forward.
  if (!userTermsVersion) return true
  return userTermsVersion !== CURRENT_TERMS_VERSION
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TermsUpdateModal() {
  const user = useStore(authStore, state => state.user)
  const [accepted, setAccepted] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const needsAcceptance = isTermsOutdated(user?.termsVersion)

  const handleAccept = async () => {
    if (!accepted) return
    setIsSaving(true)
    try {
      await acceptTerms({ data: undefined })
      // Refresh the authStore so termsVersion is updated and this modal
      // won't re-appear on the next route mount within the same session.
      await refreshAuthUser()
      toast.success('Terms accepted. Thank you.')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!needsAcceptance) return null

  return (
    <Dialog
      open={needsAcceptance}
      // Intentionally no onOpenChange — this dialog cannot be dismissed
      // without accepting. The merchant must accept to continue.
    >
      <DialogContent
        className='sm:max-w-md'
        data-testid='terms-update-modal'
        // Remove the default close button by overriding onPointerDownOutside
        onPointerDownOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className='flex items-center gap-2 mb-1'>
            <ShieldCheck className='size-5 text-primary' />
            <DialogTitle className='text-lg'>Updated Terms of Service</DialogTitle>
          </div>
          <DialogDescription className='text-sm leading-relaxed'>
            We've updated our Terms of Service and Privacy Policy. Please review and accept the updated terms to continue using StartPOS.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3 py-2'>
          {/* Summary of what changed */}
          <div className='rounded-lg border bg-muted/50 p-3 space-y-1.5 text-xs text-muted-foreground'>
            <p className='font-semibold text-foreground text-xs uppercase tracking-wide'>What's covered</p>
            <ul className='space-y-1 list-disc list-inside'>
              <li>How we process and store your business and customer data</li>
              <li>BIR 10-year transaction data retention requirements</li>
              <li>Your rights as a data controller for your customers' information</li>
              <li>Subscription, billing, and cancellation terms</li>
            </ul>
          </div>

          {/* Acceptance checkbox */}
          <div className='flex items-start gap-3'>
            <Checkbox
              id='terms-reaccept'
              checked={accepted}
              onCheckedChange={val => setAccepted(val === true)}
              className='mt-0.5'
              data-testid='terms-acceptance-checkbox'
            />
            <label htmlFor='terms-reaccept' className='text-sm leading-snug cursor-pointer'>
              I have read and agree to the updated{' '}
              <a
                href='/terms'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary underline-offset-4 hover:underline font-medium'
                onClick={e => e.stopPropagation()}
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href='/privacy'
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary underline-offset-4 hover:underline font-medium'
                onClick={e => e.stopPropagation()}
              >
                Privacy Policy
              </a>
              . <span className='text-muted-foreground text-xs'>(v{CURRENT_TERMS_VERSION})</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <div className='flex items-center gap-2 w-full'>
            <FileText className='size-3.5 text-muted-foreground shrink-0' />
            <span className='text-xs text-muted-foreground flex-1'>
              Document versions: ToS {CURRENT_TERMS_VERSION} · Privacy {CURRENT_PRIVACY_VERSION}
            </span>
            <Button onClick={handleAccept} disabled={!accepted || isSaving} size='sm' data-testid='accept-terms-button'>
              {isSaving ? <Loader2 className='size-3.5 mr-1 animate-spin' /> : null}
              Accept & Continue
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
