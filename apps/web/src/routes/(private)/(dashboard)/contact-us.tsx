/**
 * contact-us.tsx
 *
 * /contact-us — General contact page.
 * Covers support, sales, license inquiries, feature requests, and bug reports.
 */

import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Separator } from '@platform/components/ui/separator'
import { createFileRoute } from '@tanstack/react-router'
import { BuildingIcon, ExternalLinkIcon, KeyRoundIcon, LifeBuoyIcon, LightbulbIcon, MailIcon, MessageCircleIcon, ServerIcon } from 'lucide-react'
import { useAuthenticatedUser } from '@/lib/better-auth/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/contact-us')({
  component: ContactUsPage,
})

const SUPPORT_EMAIL = 'support@start-pos.app'
const SALES_EMAIL = 'sales@start-pos.app'
const FACEBOOK_URL = 'https://facebook.com/startpos'

// ---------------------------------------------------------------------------
// Reason tiles — shown above the contact channels
// ---------------------------------------------------------------------------

const REASONS = [
  {
    icon: <LifeBuoyIcon className='h-5 w-5' />,
    label: 'Technical support',
    description: "Something isn't working as expected, or you need help with a feature.",
    emailSubjectSuffix: 'Support request',
    email: SUPPORT_EMAIL,
  },
  {
    icon: <ServerIcon className='h-5 w-5' />,
    label: 'Perpetual license',
    description: 'Interested in self-hosting? Ask us about a one-time license for on-premise deployment.',
    emailSubjectSuffix: 'Perpetual license inquiry',
    email: SALES_EMAIL,
  },
  {
    icon: <BuildingIcon className='h-5 w-5' />,
    label: 'Enterprise & custom plans',
    description: 'Need a tailored plan, volume pricing, or a dedicated account manager?',
    emailSubjectSuffix: 'Enterprise inquiry',
    email: SALES_EMAIL,
  },
  {
    icon: <LightbulbIcon className='h-5 w-5' />,
    label: 'Feature request',
    description: 'Have an idea that would make your workflow better? We want to hear it.',
    emailSubjectSuffix: 'Feature request',
    email: SUPPORT_EMAIL,
  },
  {
    icon: <KeyRoundIcon className='h-5 w-5' />,
    label: 'Billing & account',
    description: 'Questions about your invoice, credits, or subscription status.',
    emailSubjectSuffix: 'Billing inquiry',
    email: SUPPORT_EMAIL,
  },
  {
    icon: <LifeBuoyIcon className='h-5 w-5' />,
    label: 'Bug report',
    description: "Found something broken? Let us know and we'll get it fixed.",
    emailSubjectSuffix: 'Bug report',
    email: SUPPORT_EMAIL,
  },
] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ContactUsPage() {
  const user = useAuthenticatedUser()
  const businessName = user.business.name

  function buildMailto(email: string, subjectSuffix: string) {
    const subject = businessName ? `[${subjectSuffix}] ${businessName}` : `[${subjectSuffix}]`
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`
  }

  const defaultMailto = buildMailto(SUPPORT_EMAIL, 'Support request')

  return (
    <div className='flex flex-col gap-8 px-4 max-w-5xl'>
      {/* Page header */}
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Contact us</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Whether you need support, want to explore a license, or have an idea to share — we're here. Pick a topic below and we'll get back to you quickly.
        </p>
      </div>

      {/* Reason tiles */}
      <div className='grid gap-3 sm:grid-cols-2'>
        {REASONS.map(reason => (
          <a
            key={reason.label}
            href={buildMailto(reason.email, reason.emailSubjectSuffix)}
            className='group flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5'
          >
            <span className='mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors'>{reason.icon}</span>
            <div>
              <p className='text-sm font-medium leading-snug'>{reason.label}</p>
              <p className='text-xs text-muted-foreground mt-0.5 leading-relaxed'>{reason.description}</p>
            </div>
          </a>
        ))}
      </div>

      <Separator />

      {/* Contact channels */}
      <div>
        <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3'>Reach us directly</p>
        <div className='grid gap-4 sm:grid-cols-2'>
          {/* Email */}
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex items-center gap-2'>
                <MailIcon className='h-5 w-5 text-primary' />
                <CardTitle className='text-base'>Email us</CardTitle>
              </div>
              <CardDescription>
                Best for detailed questions, license inquiries, or anything that needs a paper trail. We typically reply within one business day.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              <Button asChild className='w-full gap-2'>
                <a href={defaultMailto}>
                  <MailIcon className='h-4 w-4' />
                  Open email
                </a>
              </Button>
              <div className='flex flex-col items-center gap-0.5'>
                <p className='text-xs text-muted-foreground'>{SUPPORT_EMAIL} — support</p>
                <p className='text-xs text-muted-foreground'>{SALES_EMAIL} — sales & licensing</p>
              </div>
            </CardContent>
          </Card>

          {/* Facebook / Chat */}
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex items-center gap-2'>
                <MessageCircleIcon className='h-5 w-5 text-primary' />
                <CardTitle className='text-base'>Message us</CardTitle>
              </div>
              <CardDescription>
                Quickest way to get a response for short questions. Send us a message on Facebook and we'll get back to you shortly.
              </CardDescription>
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
      </div>

      {/* Bug report tips — collapsed to a subtle card, not the page focus */}
      <Card className='border-dashed'>
        <CardHeader className='pb-2'>
          <CardTitle className='text-sm text-muted-foreground'>Reporting a bug? Help us fix it faster</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='text-xs text-muted-foreground space-y-1.5'>
            {[
              'What you were trying to do',
              'What happened vs. what you expected',
              'The page or feature where it occurred',
              'Any error message you saw',
              'Your device and browser (if relevant)',
            ].map(tip => (
              <li key={tip} className='flex items-start gap-2'>
                <span className='mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0' />
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
