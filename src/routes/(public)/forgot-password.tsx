/**
 * forgot-password.tsx
 *
 * /forgot-password — Three-step password reset flow.
 *
 *   Step 1 — Email: user enters their email address.
 *   Step 2 — OTP: 6-digit code sent to that email.
 *   Step 3 — New password: user sets their new password.
 *
 * Always shows "If an account exists, a code was sent" on step 1 submit
 * to prevent email enumeration.
 */

import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { TextInput } from '@/components/custom/form/text-input'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useIsOnline } from '@/hooks/use-is-online'
import { resetForgotPassword, sendForgotPasswordOTP, verifyForgotPasswordOTP } from '@/lib/server-fn/forgot-password-otp'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(public)/forgot-password')({
  component: RouteComponent,
})

// ---------------------------------------------------------------------------
// Step 2 — OTP verification
// ---------------------------------------------------------------------------

interface OtpStepProps {
  email: string
  onVerified: (otp: string) => void
  onBack: () => void
}

function OtpStep({ email, onVerified, onBack }: OtpStepProps) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const otp = digits.join('')

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const next = [...digits]
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i] ?? ''
      setDigits(next)
      inputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
      return
    }
    const digit = value.replace(/\D/g, '')
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus()
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
      const result = await verifyForgotPasswordOTP({ data: { email, otp } })
      if (!result.success) {
        toast.error(result.error || 'Invalid or expired code.')
        setDigits(Array(OTP_LENGTH).fill(''))
        inputRefs.current[0]?.focus()
        return
      }
      onVerified(otp)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (cooldown > 0) return
    setIsResending(true)
    try {
      await sendForgotPasswordOTP({ data: { email } })
      toast.success('A new code has been sent.')
      setCooldown(60)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setIsResending(false)
    }
  }

  return (
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
        <fieldset className='flex justify-center gap-2 border-0 p-0 m-0'>
          <legend className='sr-only'>One-time password</legend>
          {digits.map((digit, i) => (
            <Input
              key={`otp-${digit}`}
              ref={el => {
                inputRefs.current[i] = el
              }}
              type='text'
              inputMode='numeric'
              maxLength={OTP_LENGTH}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
              className={cn('w-11 h-14 text-center text-xl font-semibold tracking-widest p-0', digit && 'border-primary')}
            />
          ))}
        </fieldset>

        <Button className='w-full' onClick={handleVerify} disabled={otp.length < OTP_LENGTH || isVerifying}>
          {isVerifying ? <Loader2 className='size-4 mr-2 animate-spin' /> : 'Verify code'}
        </Button>

        <p className='text-sm text-center text-muted-foreground'>
          Didn't receive it?{' '}
          {cooldown > 0 ? (
            <span>Resend in {cooldown}s</span>
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
  )
}

// ---------------------------------------------------------------------------
// Step 3 — New password
// ---------------------------------------------------------------------------

const newPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  })
  .refine(v => v.password === v.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type NewPasswordValues = z.infer<typeof newPasswordSchema>

interface NewPasswordStepProps {
  email: string
  otp: string
  onBack: () => void
}

function NewPasswordStep({ email, otp, onBack }: NewPasswordStepProps) {
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: { password: '', confirmPassword: '' } as NewPasswordValues,
    validators: { onChange: newPasswordSchema },
    onSubmit: async ({ value }) => {
      const result = await resetForgotPassword({
        data: { email, otp, newPassword: value.password },
      })
      if (!result.success) {
        toast.error(result.error || 'Password reset failed. Please try again.')
        return
      }
      toast.success('Password reset successfully. Please sign in.')
      navigate({ to: '/login' })
    },
  })

  return (
    <Card className='w-full max-w-md'>
      <CardHeader>
        <div className='flex justify-between items-center'>
          <CardTitle className='text-2xl font-bold'>New password</CardTitle>
          <ThemeToggle />
        </div>
        <CardDescription>Choose a strong password for your account.</CardDescription>
      </CardHeader>

      <Form onSubmit={form.handleSubmit} className='space-y-6'>
        <CardContent className='space-y-4'>
          <form.Field
            name='password'
            children={field => <TextInput field={field} label='New password' type='password' placeholder='At least 6 characters' />}
          />
          <form.Field
            name='confirmPassword'
            children={field => <TextInput field={field} label='Confirm password' type='password' placeholder='Repeat your new password' />}
          />
        </CardContent>

        <CardFooter className='flex flex-col gap-3'>
          <form.Subscribe
            selector={state => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button type='submit' className='w-full' disabled={!canSubmit}>
                {isSubmitting ? (
                  <Loader2 className='size-4 mr-2 animate-spin' />
                ) : (
                  <>
                    <Lock className='size-4 mr-2' />
                    Reset password
                  </>
                )}
              </Button>
            )}
          />
          <Button type='button' variant='ghost' className='w-full' onClick={onBack}>
            ← Back
          </Button>
        </CardFooter>
      </Form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Email form + orchestration
// ---------------------------------------------------------------------------

const emailSchema = z.object({
  email: z.string().email('Invalid email address'),
})

type EmailValues = z.infer<typeof emailSchema>

function RouteComponent() {
  const isOnline = useIsOnline()
  const [step, setStep] = useState<'email' | 'otp' | 'new-password'>('email')
  const [email, setEmail] = useState('')
  const [verifiedOtp, setVerifiedOtp] = useState('')

  const form = useForm({
    defaultValues: { email: '' } as EmailValues,
    validators: { onChange: emailSchema },
    onSubmit: async ({ value }) => {
      if (!isOnline) {
        toast.error('Password reset requires an internet connection.')
        return
      }
      // Always call — silently no-ops for unknown emails to prevent enumeration
      await sendForgotPasswordOTP({ data: { email: value.email } })
      setEmail(value.email)
      setStep('otp')
      toast.success('If an account exists for that email, a code has been sent.')
    },
  })

  // ---------------------------------------------------------------------------
  // Step 2 — OTP
  // ---------------------------------------------------------------------------

  if (step === 'otp') {
    return (
      <div className='flex flex-col items-center justify-center h-full p-4'>
        <OtpStep
          email={email}
          onVerified={otp => {
            setVerifiedOtp(otp)
            setStep('new-password')
          }}
          onBack={() => setStep('email')}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step 3 — New password
  // ---------------------------------------------------------------------------

  if (step === 'new-password') {
    return (
      <div className='flex flex-col items-center justify-center h-full p-4'>
        <NewPasswordStep email={email} otp={verifiedOtp} onBack={() => setStep('otp')} />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Email
  // ---------------------------------------------------------------------------

  return (
    <div className='flex flex-col items-center justify-center h-full p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='text-2xl font-bold'>Forgot password</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription>Enter your email and we'll send you a reset code.</CardDescription>
        </CardHeader>

        <Form onSubmit={form.handleSubmit} className='space-y-6'>
          <CardContent className='space-y-4'>
            <form.Field name='email' children={field => <TextInput field={field} label='Email' placeholder='name@example.com' />} />
          </CardContent>

          <CardFooter className='flex flex-col gap-3'>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit || !isOnline}>
                  {isSubmitting ? <Loader2 className='size-4 mr-2 animate-spin' /> : 'Send reset code'}
                </Button>
              )}
            />
            <p className='text-sm text-muted-foreground text-center'>
              Remember your password?{' '}
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
