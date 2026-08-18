/**
 * settings/-account/index.tsx
 *
 * Account tab — Phase 1 legal compliance.
 *
 * Surfaces:
 *   - Consent record (when the merchant accepted the ToS/Privacy Policy)
 *   - Account deletion request action (email-based, Phase 1)
 *
 * The deletion request does NOT delete data immediately. It sends a
 * structured email to support, who processes within 30 days. BIR-required
 * transaction records are always retained (10-year rule). This is disclosed
 * to the merchant inline before they confirm.
 */

import { AlertTriangle, FileText, Loader2, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { WarningPrompt } from '@/components/custom/prompt/warning-prompt'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import dayjs from '@/lib/dayjs'
import MountManager from '@/lib/mount-manager'
import { requestAccountDeletion } from '@/lib/server-fn/request-account-deletion'
import { authStore } from '@/store/auth-store'

export function AccountPage() {
  const { user } = authStore.state
  const [isRequesting, setIsRequesting] = useState(false)

  const handleRequestDeletion = () => {
    MountManager.show(WarningPrompt, {
      title: 'Request Account Deletion',
      description: (
        <div className='space-y-3 text-sm'>
          <p>Before we can delete your account, our support team will contact you to confirm. Please read the following carefully:</p>
          <div className='bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2'>
            <div className='flex items-start gap-2 text-amber-800 dark:text-amber-300'>
              <AlertTriangle className='size-4 mt-0.5 shrink-0' />
              <div className='space-y-1'>
                <p className='font-semibold text-xs uppercase tracking-wide'>Data retention notice</p>
                <p className='text-xs'>
                  Transaction records containing BIR-required data (official receipt numbers, TINs, SC/PWD information) cannot be erased. Under BIR Revenue
                  Regulations 17-2013, these must be retained for <strong>10 years</strong>. Account deletion means <strong>access termination</strong>, not
                  full data erasure.
                </p>
              </div>
            </div>
          </div>
          <p className='text-muted-foreground text-xs'>
            A support request will be sent to our team. We will reach out within 3 business days to confirm and process your request.
          </p>
        </div>
      ) as unknown as string,
      onConfirm: async () => {
        setIsRequesting(true)
        try {
          const result = await requestAccountDeletion({ data: undefined })
          if (!result.ok) {
            toast.error(result.error)
            return false
          }
          toast.success('Deletion request sent. Our team will contact you within 3 business days.')
          return true
        } catch {
          toast.error('Something went wrong. Please try again or contact support@start-pos.app directly.')
          return false
        } finally {
          setIsRequesting(false)
        }
      },
    })
  }

  return (
    <div className='px-4 py-4 space-y-4 max-w-2xl'>
      {/* Legal consent record */}
      <div>
        <h2 className='text-base font-semibold'>Account</h2>
        <p className='text-xs text-muted-foreground mt-0.5'>Legal consent record and account lifecycle actions.</p>
      </div>

      <Card>
        <CardHeader className='pb-2 pt-3 px-4'>
          <CardTitle className='text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5'>
            <FileText className='size-3.5' />
            Legal Consent
          </CardTitle>
        </CardHeader>
        <CardContent className='px-4 pt-0 pb-4 space-y-3'>
          {user.termsAcceptedAt ? (
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>Terms of Service</span>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30'>
                    Accepted
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    {dayjs(user.termsAcceptedAt).format('MMM D, YYYY')}
                    {user.termsVersion ? ` · v${user.termsVersion}` : ''}
                  </span>
                </div>
              </div>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>Privacy Policy</span>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='text-xs text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30'>
                    Accepted
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    {user.privacyAcceptedAt ? dayjs(user.privacyAcceptedAt).format('MMM D, YYYY') : dayjs(user.termsAcceptedAt).format('MMM D, YYYY')}
                    {user.privacyVersion ? ` · v${user.privacyVersion}` : ''}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className='text-xs text-muted-foreground'>No consent record found. This account was created before consent recording was introduced.</p>
          )}
          <Separator />
          <p className='text-xs text-muted-foreground'>
            View our{' '}
            <a href='/terms' target='_blank' rel='noopener noreferrer' className='text-primary underline-offset-4 hover:underline'>
              Terms of Service
            </a>{' '}
            and{' '}
            <a href='/privacy' target='_blank' rel='noopener noreferrer' className='text-primary underline-offset-4 hover:underline'>
              Privacy Policy
            </a>
            .
          </p>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className='border-destructive/30'>
        <CardHeader className='pb-2 pt-3 px-4'>
          <CardTitle className='text-xs font-semibold uppercase tracking-wide text-destructive flex items-center gap-1.5'>
            <ShieldAlert className='size-3.5' />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className='px-4 pt-0 pb-4'>
          <div className='flex items-start justify-between gap-4'>
            <div className='space-y-0.5'>
              <p className='text-sm font-medium'>Delete this account</p>
              <p className='text-xs text-muted-foreground'>
                Sends a deletion request to our support team. BIR-required transaction data is retained for 10 years regardless.
              </p>
            </div>
            <Button
              variant='outline'
              size='sm'
              className='shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10'
              onClick={handleRequestDeletion}
              disabled={isRequesting}
            >
              {isRequesting ? <Loader2 className='size-3.5 animate-spin' /> : <Trash2 className='size-3.5' />}
              Request Deletion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
