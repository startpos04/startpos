/**
 * register.tsx
 *
 * /register — Self-serve registration page.
 *
 * Two-step flow:
 *   Step 1 — Account details: name, email, password, business name.
 *   Step 2 — Adaptive survey (Q1–Q8) to configure the business.
 *             All survey questions except Q1 can be skipped.
 *
 * On submit:
 *   1. Signs up via authClient.signUp.email
 *   2. Calls completeRegistration with surveyAnswers → applies ConfigurationEngine
 *   3. Signs in to get a session with businessId/branchId
 *   4. Redirects to /dashboard
 *
 * OAuth path:
 *   - Google / Facebook buttons trigger authClient.signIn.social
 *   - OAuth users who have no Membership are redirected to
 *     /register/business-setup (handled in (private)/route.tsx)
 */

import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { TextInput } from '@/components/custom/form/text-input'
import { SurveyWizard } from '@/components/custom/onboarding/survey-wizard'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useIsOnline } from '@/hooks/use-is-online'
import { authClient } from '@/lib/better-auth/auth-client'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import type { SurveyAnswers } from '@/lib/onboarding/types'
import { checkEmailAvailable } from '@/lib/queries/check-email-available'
import { completeRegistration } from '@/lib/queries/complete-registration'
import { cn } from '@/lib/utils'
import { setUser } from '@/store/auth-store'

// ---------------------------------------------------------------------------
// Step 1 form schema
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessName: z.string().min(1, 'Business name is required'),
})

type AccountValues = z.infer<typeof accountSchema>

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const LOGIN_WITH = [
  process.env['GOOGLE_CLIENT_SECRET']
    ? {
        id: 'google',
        label: 'Continue with Google',
        icon: (
          <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' fill='#4285F4' />
            <path
              d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
              fill='#34A853'
            />
            <path
              d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
              fill='#FBBC05'
            />
            <path
              d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
              fill='#EA4335'
            />
          </svg>
        ),
      }
    : null,
  process.env['FACEBOOK_CLIENT_SECRET']
    ? {
        id: 'facebook',
        label: 'Continue with Facebook',
        icon: (
          <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24' aria-hidden='true'>
            <path
              d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'
              fill='#1877F2'
            />
          </svg>
        ),
      }
    : null,
].filter((provider): provider is NonNullable<typeof provider> => provider !== null)

export const Route = createFileRoute('/(public)/register')({
  component: RouteComponent,
})

function RouteComponent() {
  const isOnline = useIsOnline()
  const navigate = useNavigate()
  const [step, setStep] = useState<'account' | 'survey'>('account')
  const [accountValues, setAccountValues] = useState<AccountValues | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', businessName: '' } as AccountValues,
    validators: { onChange: accountSchema },
    onSubmit: async ({ value }) => {
      if (!isOnline) {
        toast.error('Registration requires an internet connection.')
        return
      }

      // Check if the email is already registered before sending the user through the survey.
      // Prevents a frustrating experience where they answer all questions only to hit a duplicate error.
      try {
        const { available } = await checkEmailAvailable({ data: { email: value.email } })
        if (!available) {
          toast.error('An account with this email already exists. Please sign in instead.')
          return
        }
      } catch {
        // If the check fails (network hiccup), proceed — the real sign-up will catch duplicates
      }

      setAccountValues(value)
      setStep('survey')
    },
  })

  const handleSurveyComplete = async (surveyAnswers: SurveyAnswers) => {
    if (!accountValues) return
    setIsSubmitting(true)

    try {
      // Step 1: Create the better-auth user record
      const { error: signUpError } = await authClient.signUp.email({
        name: accountValues.name,
        email: accountValues.email,
        password: accountValues.password,
      })

      if (signUpError) {
        toast.error(signUpError.message || 'Registration failed. Please try again.')
        setStep('account')
        return
      }

      // Step 2: Atomically create the tenant record with survey answers
      const result = await completeRegistration({
        data: {
          displayName: accountValues.name,
          businessName: accountValues.businessName,
          surveyAnswers,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Could not complete registration. Please try again.')
        setStep('account')
        return
      }

      // Step 3: Sign in to get a fresh session with businessId/branchId
      await AuthEngine.loginOnline(accountValues.email, accountValues.password, freshUser => {
        setUser(freshUser)
        navigate({ to: '/dashboard' })
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOAuthSignIn = async (provider: string) => {
    if (!isOnline) {
      toast.error('OAuth sign-in requires an internet connection.')
      return
    }
    await authClient.signIn.social({ provider, callbackURL: '/register/business-setup' })
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Survey
  // ---------------------------------------------------------------------------

  if (step === 'survey' && accountValues) {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen overflow-y-auto p-4'>
        <div className='w-full max-w-md mb-4'>
          <h2 className='text-lg font-semibold'>Tell us about your business</h2>
          <p className='text-sm text-muted-foreground mt-0.5'>This helps us set up your store correctly. You can change anything later.</p>
        </div>
        <SurveyWizard onComplete={handleSurveyComplete} isSubmitting={isSubmitting} onBack={() => setStep('account')} />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Account details
  // ---------------------------------------------------------------------------

  return (
    <div className='flex flex-col items-center justify-center min-h-screen overflow-y-auto p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='text-2xl font-bold'>Create your account</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription>Get started with 50 free transactions — no card required.</CardDescription>
        </CardHeader>

        {/* OAuth buttons */}
        {LOGIN_WITH.length ? (
          <CardContent className='space-y-3 pb-0'>
            {LOGIN_WITH.map(({ id, icon, label }) => (
              <Button key={id} type='button' variant='outline' className='w-full' onClick={() => handleOAuthSignIn(id)}>
                {icon}
                {label}
              </Button>
            ))}

            <div className='relative'>
              <div className='absolute inset-0 flex items-center'>
                <Separator />
              </div>
              <div className='relative flex justify-center text-xs uppercase'>
                <span className={cn('bg-card px-2 text-muted-foreground')}>Or register with email</span>
              </div>
            </div>
          </CardContent>
        ) : null}

        <Form onSubmit={form.handleSubmit} className='space-y-6'>
          <CardContent className='space-y-4 pt-4'>
            <form.Field name='name' children={field => <TextInput field={field} label='Full name' placeholder='Juan dela Cruz' />} />
            <form.Field name='email' children={field => <TextInput field={field} label='Email' placeholder='juan@example.com' />} />
            <form.Field name='password' children={field => <TextInput field={field} label='Password' type='password' placeholder='At least 6 characters' />} />
            <form.Field name='businessName' children={field => <TextInput field={field} label='Business name' placeholder="Juan's Store" />} />
          </CardContent>

          <CardFooter className='flex flex-col gap-3'>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit || !isOnline}>
                  {isSubmitting ? <Loader2 className='size-4 mr-2 animate-spin' /> : 'Continue →'}
                </Button>
              )}
            />
            <p className='text-sm text-muted-foreground text-center'>
              Already have an account?{' '}
              <Link to='/login' className='font-medium text-primary underline-offset-4 hover:underline'>
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Form>
      </Card>
    </div>
  )
}
