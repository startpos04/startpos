import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import z from 'zod'
import { Form } from '@startpos-core/components/custom/form'
import { TextInput } from '@startpos-core/components/custom/form/text-input'
import { ThemeToggle } from '@startpos-core/components/custom/theme/theme-toggle'
import { Button } from '@startpos-core/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@startpos-core/components/ui/card'
import { useIsOnline } from '@startpos-core/hooks/use-is-online'
import { AuthEngine } from '@startpos-core/lib/better-auth/auth-engine'
import { RoleLandingPages } from '@startpos-core/lib/better-auth/auth-server'

const loginSchema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginValues = z.infer<typeof loginSchema>

export const Route = createFileRoute('/(public)/login')({
  component: RouteComponent,
})

function RouteComponent() {
  const isOnline = useIsOnline()
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: { email: '', password: '' } as LoginValues,
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      if (isOnline) {
        await AuthEngine.loginOnline(value.email, value.password, user => navigate({ to: RoleLandingPages[user.role] }))
      } else {
        await AuthEngine.loginOffline(value.email, value.password, user => navigate({ to: RoleLandingPages[user.role] }))
      }
    },
  })

  return (
    <div className='flex flex-col items-center justify-center h-full p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle className='text-2xl font-bold'>Login</CardTitle>
            <ThemeToggle />
          </div>
          <CardDescription>{isOnline ? 'Enter your credentials to sign in.' : 'Offline Mode: Use your last known credentials.'}</CardDescription>
        </CardHeader>
        <Form onSubmit={form.handleSubmit} className='space-y-6'>
          <CardContent className='space-y-4'>
            <form.Field name='email' children={field => <TextInput field={field} label='Email' placeholder='name@example.com' data-testid='email-input' />} />
            <form.Field name='password' children={field => <TextInput field={field} label='Password' type='password' data-testid='password-input' />} />
          </CardContent>

          <CardFooter className='flex flex-col gap-4'>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit} data-testid='login-button'>
                  {isSubmitting ? <Loader2 className='size-4 mr-2 animate-spin' /> : 'Sign in'}
                </Button>
              )}
            />
            <div className='flex flex-col items-center gap-1'>
              <Link to='/forgot-password' className='text-sm font-medium text-primary underline-offset-4 hover:underline'>
                Forgot your password?
              </Link>
              <p className='text-sm text-muted-foreground text-center'>
                Don't have an account?{' '}
                <Link to='/register' className='font-medium text-primary underline-offset-4 hover:underline'>
                  Create one free
                </Link>
              </p>
            </div>
          </CardFooter>
        </Form>
      </Card>
    </div>
  )
}
