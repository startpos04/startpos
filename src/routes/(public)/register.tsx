/**
 * register.tsx
 *
 * /register — Self-serve registration page.
 *
 * Email/password path:
 *   - Collects name, email, password, business name, and business type.
 *   - Signs up via authClient.signUp.email.
 *   - Calls completeRegistration to atomically create the tenant record.
 *   - Refreshes the session so getAuthUser() returns a full ServerUser.
 *   - Redirects to /dashboard.
 *
 * OAuth path:
 *   - Google / Facebook buttons trigger authClient.signIn.social.
 *   - OAuth users who have no Membership are redirected to
 *     /register/business-setup (handled in (private)/route.tsx).
 */

import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { TextInput } from '@/components/custom/form/text-input'
import { ThemeToggle } from '@/components/custom/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useIsOnline } from '@/hooks/use-is-online'
import { authClient } from '@/lib/better-auth/auth-client'
import { AuthEngine } from '@/lib/better-auth/auth-engine'
import { completeRegistration } from '@/lib/queries/complete-registration'
import { cn } from '@/lib/utils'
import { setUser } from '@/store/auth-store'

// ---------------------------------------------------------------------------
// Business type selection
// ---------------------------------------------------------------------------

const BUSINESS_TYPES = [
  { value: 'RESTAURANT', label: 'Restaurant', emoji: '🍽' },
  { value: 'GROCERY', label: 'Grocery', emoji: '🛒' },
  { value: 'RETAIL', label: 'Retail', emoji: '🏪' },
] as const

type BusinessTypeValue = (typeof BUSINESS_TYPES)[number]['value']

// ---------------------------------------------------------------------------
// Form schema
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessName: z.string().min(1, 'Business name is required'),
  businessType: z.enum(['RESTAURANT', 'GROCERY', 'RETAIL']),
})

type RegisterValues = z.infer<typeof registerSchema>

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(public)/register')({
  component: RouteComponent,
})

function RouteComponent() {
  const isOnline = useIsOnline()
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      businessName: '',
      businessType: 'RETAIL' as BusinessTypeValue,
    } as RegisterValues,
    validators: { onChange: registerSchema },
    onSubmit: async ({ value }) => {
      if (!isOnline) {
        toast.error('Registration requires an internet connection.')
        return
      }

      // Step 1: Create the better-auth user record
      const { error: signUpError } = await authClient.signUp.email({
        name: value.name,
        email: value.email,
        password: value.password,
      })

      if (signUpError) {
        toast.error(signUpError.message || 'Registration failed. Please try again.')
        return
      }

      // Step 2: Atomically create the tenant record
      const result = await completeRegistration({
        data: {
          displayName: value.name,
          businessName: value.businessName,
          businessType: value.businessType,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Could not complete registration. Please try again.')
        return
      }

      // Step 3: Sign in again to get a fresh session with businessId/branchId injected.
      // The session created by signUp.email has no businessId yet (Membership didn't
      // exist at that point). Signing in again fires the session.create.before hook
      // which now finds the Membership and injects the correct businessId/branchId.
      await AuthEngine.loginOnline(value.email, value.password, freshUser => {
        setUser(freshUser)
        navigate({ to: '/dashboard' })
      })
    },
  })

  const handleOAuthSignIn = async (provider: 'google' | 'facebook') => {
    if (!isOnline) {
      toast.error('OAuth sign-in requires an internet connection.')
      return
    }

    await authClient.signIn.social({
      provider,
      callbackURL: '/register/business-setup',
    })
  }

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
        <CardContent className='space-y-3 pb-0'>
          <Button type='button' variant='outline' className='w-full' onClick={() => handleOAuthSignIn('google')}>
            <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24' aria-hidden='true'>
              <path
                d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                fill='#4285F4'
              />
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
            Continue with Google
          </Button>

          <Button type='button' variant='outline' className='w-full' onClick={() => handleOAuthSignIn('facebook')}>
            <svg className='mr-2 h-4 w-4' viewBox='0 0 24 24' aria-hidden='true'>
              <path
                d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'
                fill='#1877F2'
              />
            </svg>
            Continue with Facebook
          </Button>

          <div className='relative'>
            <div className='absolute inset-0 flex items-center'>
              <Separator />
            </div>
            <div className='relative flex justify-center text-xs uppercase'>
              <span className='bg-card px-2 text-muted-foreground'>Or register with email</span>
            </div>
          </div>
        </CardContent>

        {/* Email/password form */}
        <Form onSubmit={form.handleSubmit} className='space-y-6'>
          <CardContent className='space-y-4 pt-4'>
            <form.Field name='name' children={field => <TextInput field={field} label='Full name' placeholder='Juan dela Cruz' />} />
            <form.Field name='email' children={field => <TextInput field={field} label='Email' placeholder='juan@example.com' />} />
            <form.Field name='password' children={field => <TextInput field={field} label='Password' type='password' placeholder='At least 6 characters' />} />
            <form.Field name='businessName' children={field => <TextInput field={field} label='Business name' placeholder="Juan's Store" />} />

            <form.Field
              name='businessType'
              children={field => (
                <div className='space-y-2'>
                  <Label>Business type</Label>
                  <div className='grid grid-cols-3 gap-2'>
                    {BUSINESS_TYPES.map(bt => (
                      <button
                        key={bt.value}
                        type='button'
                        onClick={() => field.handleChange(bt.value)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors',
                          field.state.value === bt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50',
                        )}
                      >
                        <span className='text-2xl'>{bt.emoji}</span>
                        <span className='font-medium'>{bt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            />
          </CardContent>

          <CardFooter className='flex flex-col gap-3'>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit || !isOnline}>
                  {isSubmitting ? <Loader2 className='size-4 mr-2 animate-spin' /> : 'Create account'}
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
