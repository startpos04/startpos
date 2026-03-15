import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/better-auth/auth-client'
import { getUserId } from '@/lib/better-auth/auth-server'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import z from 'zod'

export const loginValidator = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const Route = createFileRoute('/(auth)/login')({
  component: LoginComponent,
  beforeLoad: async () => {
    const userId = await getUserId()
    if (userId) {
      throw redirect({ to: '/' })
    }
  },
})

function LoginComponent() {
  const navigate = useNavigate()

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(value, {
        onRequest: () => console.log('Loading...'),
        onSuccess: () => {
          navigate({ to: '/', reloadDocument: true })
        },
        onError: ctx => alert(ctx.error.message),
      })
    },
    validators: {
      onBlur: loginValidator,
      onChange: loginValidator,
    },
  })

  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader>
          <CardTitle className='text-2xl font-bold'>Login</CardTitle>
          <CardDescription>Enter your email below to login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={e => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
            className='space-y-6'
          >
            {/* Email Field */}
            <form.Field name='email'>
              {field => (
                <div className='space-y-2'>
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    placeholder='name@example.com'
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={e => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className='text-xs font-medium text-destructive'>{field.state.meta.errors.map(err => err?.message ?? err).join(', ')}</p>
                  )}
                </div>
              )}
            </form.Field>

            {/* Password Field */}
            <form.Field name='password'>
              {field => (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <Label htmlFor={field.name}>Password</Label>
                  </div>
                  <Input
                    id={field.name}
                    type='password'
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={e => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className='text-xs font-medium text-destructive'>{field.state.meta.errors.map(err => err?.message ?? err).join(', ')}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit}>
                  {isSubmitting ? 'Authenticating...' : 'Sign In'}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
