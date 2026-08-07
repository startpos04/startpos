/**
 * contact-us.tsx
 *
 * /contact-us — Support page for users who are stuck or have found a bug.
 * Accessible from the sidebar and from the dashboard support banner.
 */

import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ExternalLinkIcon, LifeBuoyIcon, MailIcon, MessageCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { authStore } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/contact-us')({
  component: ContactUsPage,
})

const SUPPORT_EMAIL = 'support@start-pos.app'
const FACEBOOK_URL = 'https://facebook.com/startpos'

function ContactUsPage() {
  const user = useStore(authStore, state => state.user)

  // Pre-fill subject with business name so support can triage faster
  const emailSubject = user?.business?.name ? `[Support] ${user.business.name} — ` : '[Support] '

  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(emailSubject)}`

  return (
    <div className='flex flex-col gap-6 px-4 max-w-2xl'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-semibold'>Contact us</h1>
        <p className='text-sm text-muted-foreground mt-0.5'>Stuck on something or found a bug? We're here to help — reach out any time.</p>
      </div>

      {/* Support channels */}
      <div className='grid gap-4 sm:grid-cols-2'>
        {/* Email */}
        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center gap-2'>
              <MailIcon className='h-5 w-5 text-primary' />
              <CardTitle className='text-base'>Email support</CardTitle>
            </div>
            <CardDescription>Best for detailed questions, bug reports, or billing issues. We typically reply within one business day.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className='w-full gap-2'>
              <a href={mailtoHref}>
                <MailIcon className='h-4 w-4' />
                Send us an email
              </a>
            </Button>
            <p className='text-xs text-muted-foreground mt-2 text-center'>{SUPPORT_EMAIL}</p>
          </CardContent>
        </Card>

        {/* Facebook / Chat */}
        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center gap-2'>
              <MessageCircleIcon className='h-5 w-5 text-primary' />
              <CardTitle className='text-base'>Message us</CardTitle>
            </div>
            <CardDescription>Quickest way to get a response. Send us a message on Facebook and we'll get back to you shortly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant='outline' className='w-full gap-2'>
              <a href={FACEBOOK_URL} target='_blank' rel='noopener noreferrer'>
                <ExternalLinkIcon className='h-4 w-4' />
                Message on Facebook
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Bug report tips */}
      <Card className='border-dashed'>
        <CardHeader className='pb-3'>
          <div className='flex items-center gap-2'>
            <LifeBuoyIcon className='h-5 w-5 text-muted-foreground' />
            <CardTitle className='text-base text-muted-foreground'>Reporting a bug?</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground mb-3'>Help us fix it faster by including:</p>
          <ul className='text-sm text-muted-foreground space-y-1.5 list-none'>
            {[
              'What you were trying to do',
              'What happened vs. what you expected',
              'The page or feature where it occurred',
              'Any error message you saw',
              'Your device and browser (if relevant)',
            ].map(tip => (
              <li key={tip} className='flex items-start gap-2'>
                <span className='mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0' />
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
