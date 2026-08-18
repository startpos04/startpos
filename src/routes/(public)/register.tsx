/**
 * register.tsx
 *
 * /register — Self-serve registration page.
 *
 * Three-step flow:
 *   Step 1 — Account details: name, email, password, business name.
 *   Step 2 — Email OTP verification: 6-digit code sent to the entered email.
 *   Step 3 — Adaptive survey (Q1–Q8) to configure the business.
 *             All survey questions except Q1 can be skipped.
 *
 * On submit:
 *   1. Checks email availability.
 *   2. Sends a 6-digit OTP via authClient.emailOtp.sendVerificationOtp().
 *   3. User enters OTP → verified via authClient.emailOtp.verifyEmail().
 *   4. Calls registerWithSurvey — creates the auth user + full tenant record
 *      atomically. If survey config fails, no user is left orphaned.
 *   6. Signs in to get a session with businessId/branchId.
 *   7. Redirects to /dashboard.
 *
 * OAuth path:
 *   - Google / Facebook buttons trigger authClient.signIn.social.
 *   - OAuth users who have no Membership are redirected to
 *     /register/business-setup (handled in (private)/route.tsx).
 */

import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2, Mail } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { TextInput } from '@/components/custom/form/text-input'
import { SurveyWizard } from '@/components/custom/onboarding/survey-wizard'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useIsOnline } from '@/hooks/use-is-online'
import { authClient } from '@/lib/better-auth/auth-client'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import type { SurveyAnswers } from '@/lib/onboarding/types'
import { checkEmailAvailable } from '@/lib/server-fn/check-email-available'
import { registerWithSurvey } from '@/lib/server-fn/complete-registration'
import { fetchFeatureFlags } from '@/lib/server-fn/fetch-feature-flags'
import { sendRegistrationOTP, verifyRegistrationOTP } from '@/lib/server-fn/send-registration-otp'
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
  contactNumber: z.string().min(1, 'Contact number is required'),
  // Legal consent — must be checked to proceed. The checkbox is the user's
  // binding acceptance of the Terms of Service and Privacy Policy.
  termsAccepted: z.boolean().refine(v => v === true, {
    message: 'You must agree to the Terms of Service and Privacy Policy to continue.',
  }),
})

type AccountValues = z.infer<typeof accountSchema>

// ---------------------------------------------------------------------------
// OTP_LENGTH — must match the value configured in auth.ts emailOTP plugin
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6

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
  loader: () => fetchFeatureFlags(),
  component: RouteComponent,
})

// ---------------------------------------------------------------------------
// OTP step component
// ---------------------------------------------------------------------------

interface OtpStepProps {
  email: string
  onVerified: () => void
  onBack: () => void
}

function OtpStep({ email, onVerified, onBack }: OtpStepProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Focus the first empty slot on mount
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const otp = digits.join('')

  const handleChange = (index: number, value: string) => {
    // Allow paste of the full code into any cell
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const next = [...digits]
      for (let i = 0; i < pasted.length; i++) {
        next[i] = pasted[i] ?? ''
      }
      setDigits(next)
      const focusAt = Math.min(pasted.length, OTP_LENGTH - 1)
      inputRefs.current[focusAt]?.focus()
      return
    }

    const digit = value.replace(/\D/g, '')
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async () => {
    if (otp.length < OTP_LENGTH) return
    setIsVerifying(true)
    try {
      console.log('[OtpStep] Verifying OTP for:', email, 'otp:', otp)
      const result = await verifyRegistrationOTP({ data: { email, otp } })
      if (!result.success) {
        toast.error(result.error || 'Invalid or expired code. Please try again.')
        setDigits(Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
        return
      }
      onVerified()
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setIsResending(true)
    try {
      console.log('[OtpStep] Resending OTP to:', email)
      const result = await sendRegistrationOTP({ data: { email } })
      if (!result.success) {
        toast.error(result.error || 'Could not resend code. Please try again.')
        return
      }
      toast.success('A new code has been sent.')
      setCooldown(60)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className='flex flex-col items-center justify-center h-full overflow-y-auto p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='text-2xl font-bold'>Check your email</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription>
            We sent a {OTP_LENGTH}-digit code to <span className='font-medium text-foreground'>{email}</span>. Enter it below to continue.
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-6'>
          {/* OTP digit inputs */}
          <fieldset className='flex justify-center gap-2 border-0 p-0 m-0'>
            <legend className='sr-only'>One-time password</legend>
            {digits.map((digit, i) => (
              <Input
                key={digit}
                ref={el => {
                  inputRefs.current[i] = el
                }}
                type='text'
                inputMode='numeric'
                maxLength={OTP_LENGTH} // allows paste detection
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
                className={cn('w-11 h-14 text-center text-xl font-semibold tracking-widest p-0', digit && 'border-primary')}
              />
            ))}
          </fieldset>

          {/* Verify button */}
          <Button className='w-full' onClick={handleVerify} disabled={otp.length < OTP_LENGTH || isVerifying}>
            {isVerifying ? <Loader2 className='size-4 mr-2 animate-spin' /> : <Mail className='size-4 mr-2' />}
            Verify email
          </Button>

          {/* Resend */}
          <p className='text-sm text-center text-muted-foreground'>
            Didn't receive it?{' '}
            {cooldown > 0 ? (
              <span className='text-muted-foreground'>Resend in {cooldown}s</span>
            ) : (
              <button
                type='button'
                onClick={handleResend}
                disabled={isResending}
                className='font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50'
              >
                {isResending ? 'Sending…' : 'Resend code'}
              </button>
            )}
          </p>
        </CardContent>

        <CardFooter>
          <Button type='button' variant='ghost' className='w-full' onClick={onBack}>
            ← Back
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function RouteComponent() {
  const isOnline = useIsOnline()
  const navigate = useNavigate()
  const { emailVerificationEnabled } = Route.useLoaderData()
  const [step, setStep] = useState<'account' | 'verify-email' | 'survey'>('account')
  const [accountValues, setAccountValues] = useState<AccountValues | null>(null)
  // Records the exact moment the user checked the ToS/Privacy Policy checkbox
  // and submitted Step 1. Passed to completeRegistration for audit purposes.
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', businessName: '', contactNumber: '', termsAccepted: false } as AccountValues,
    validators: { onSubmit: accountSchema },
    onSubmit: async ({ value }) => {
      if (!isOnline) {
        toast.error('Registration requires an internet connection.')
        return
      }

      // Check if the email is already registered before sending an OTP.
      // Prevents a frustrating experience where they enter a code only to hit a duplicate error.
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
      setConsentTimestamp(new Date().toISOString())

      if (!emailVerificationEnabled) {
        // Skip OTP step entirely — go straight to survey
        setStep('survey')
        return
      }

      // Send the OTP before advancing to the verify step
      console.log('[register] Sending OTP to:', value.email)
      let sendResult: { success: boolean; error?: string }
      try {
        sendResult = await sendRegistrationOTP({ data: { email: value.email } })
        console.log('[register] sendRegistrationOTP result:', JSON.stringify(sendResult))
      } catch (e) {
        console.error('[register] sendRegistrationOTP threw:', e)
        toast.error('Could not send verification code. Please try again.')
        return
      }

      if (!sendResult.success) {
        toast.error(sendResult.error || 'Could not send verification code. Please try again.')
        return
      }

      setStep('verify-email')
    },
  })

  const handleSurveyComplete = async (surveyAnswers: SurveyAnswers) => {
    if (!accountValues) return
    setIsSubmitting(true)

    try {
      // Single atomic call — the Better Auth user + account rows are created
      // inside the same Prisma transaction as the business/branch/membership.
      // If the survey config or any later step fails, zero rows are committed
      // and the user can retry without hitting a "email already exists" error.
      const result = await registerWithSurvey({
        data: {
          email: accountValues.email,
          password: accountValues.password,
          name: accountValues.name,
          displayName: accountValues.name,
          businessName: accountValues.businessName,
          contactNumber: accountValues.contactNumber,
          surveyAnswers,
          ...(consentTimestamp ? { termsAcceptedAt: consentTimestamp } : {}),
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Could not complete registration. Please try again.')
        setStep('account')
        return
      }

      // Sign in to get a fresh session with businessId/branchId
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
  // Step 2 — Email OTP verification
  // ---------------------------------------------------------------------------

  if (step === 'verify-email' && accountValues) {
    return <OtpStep email={accountValues.email} onVerified={() => setStep('survey')} onBack={() => setStep('account')} />
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Survey
  // ---------------------------------------------------------------------------

  if (step === 'survey' && accountValues) {
    return (
      <div className='flex flex-col items-center justify-center h-full overflow-y-auto p-4'>
        <div className='w-full max-w-md mb-4'>
          <h2 className='text-lg font-semibold'>Tell us about your business</h2>
          <p className='text-sm text-muted-foreground mt-0.5'>This helps us set up your store correctly. You can change anything later.</p>
        </div>
        <SurveyWizard
          onComplete={handleSurveyComplete}
          isSubmitting={isSubmitting}
          onBack={() => setStep(emailVerificationEnabled ? 'verify-email' : 'account')}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Account details
  // ---------------------------------------------------------------------------

  return (
    <div className='flex flex-col items-center justify-center h-full overflow-y-auto p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='text-2xl font-bold'>Create your account</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription>30-day free trial with 500 transactions plus 50 credits — no card required.</CardDescription>
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
            <form.Field name='contactNumber' children={field => <TextInput field={field} label='Contact number' placeholder='+63 912 345 6789' />} />
            <form.Field name='businessName' children={field => <TextInput field={field} label='Business name' placeholder="Juan's Store" />} />

            {/* Legal consent checkbox — required before proceeding */}
            <form.Field name='termsAccepted'>
              {field => (
                <div className='space-y-1'>
                  <div className='flex items-start gap-3'>
                    <input
                      id='terms-accepted'
                      type='checkbox'
                      checked={field.state.value}
                      onChange={e => field.handleChange(e.target.checked)}
                      onBlur={field.handleBlur}
                      className='mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary cursor-pointer'
                      aria-describedby={field.state.meta.errors.length ? 'terms-error' : undefined}
                    />
                    <label htmlFor='terms-accepted' className='text-sm text-muted-foreground leading-snug cursor-pointer'>
                      I agree to the{' '}
                      <a
                        href='/terms'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='font-medium text-primary underline-offset-4 hover:underline'
                        onClick={e => e.stopPropagation()}
                      >
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a
                        href='/privacy'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='font-medium text-primary underline-offset-4 hover:underline'
                        onClick={e => e.stopPropagation()}
                      >
                        Privacy Policy
                      </a>
                    </label>
                  </div>
                  {field.state.meta.errors.length > 0 && (
                    <p id='terms-error' className='text-sm text-destructive' role='alert'>
                      {field.state.meta.errors[0]?.message ?? String(field.state.meta.errors[0])}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
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
