/**
 * business-setup.tsx
 *
 * /register/business-setup — OAuth interstitial screen.
 *
 * Shown only to OAuth users (Google / Facebook) immediately after their
 * provider callback, before the app loads. OAuth provides name + email but
 * not business name or type. This screen collects those two required fields,
 * then calls completeRegistration atomically.
 *
 * No back button, no skip. These two fields are required to create the
 * business record. The screen is intentionally minimal — the user has just
 * authenticated and wants to be in the app.
 *
 * If the user already has a Membership (re-visiting the URL), they are
 * redirected to /dashboard immediately.
 */

import { useForm } from '@tanstack/react-form'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Form } from '@/components/custom/form'
import { TextInput } from '@/components/custom/form/text-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { completeRegistration } from '@/lib/queries/complete-registration'
import { refreshSession } from '@/lib/queries/refresh-session'
import { cn } from '@/lib/utils'
import { authStore, setUser } from '@/store/auth-store'

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

const businessSetupSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(100),
  businessType: z.enum(['RESTAURANT', 'GROCERY', 'RETAIL']),
})

type BusinessSetupValues = z.infer<typeof businessSetupSchema>

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/(public)/register/business-setup')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const user = useStore(authStore, state => state.user)

  // If already has a business (Membership exists), redirect to app
  useEffect(() => {
    if (user?.business?.id) {
      navigate({ to: '/dashboard', replace: true })
    }
  }, [user, navigate])

  const form = useForm({
    defaultValues: {
      businessName: '',
      businessType: 'RETAIL' as BusinessTypeValue,
    } as BusinessSetupValues,
    validators: { onChange: businessSetupSchema },
    onSubmit: async ({ value }) => {
      const result = await completeRegistration({
        data: {
          displayName: user?.name ?? '',
          businessName: value.businessName,
          businessType: value.businessType,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Could not complete setup. Please try again.')
        return
      }

      // Patch the existing session with the new businessId/branchId, then
      // fetch the fresh ServerUser so the app loads with the correct tenant.
      const refreshResult = await refreshSession()
      if (refreshResult.success && refreshResult.user) {
        setUser(refreshResult.user)
      }

      navigate({ to: '/dashboard', replace: true })
    },
  })

  return (
    <div className='flex flex-col items-center justify-center min-h-screen overflow-y-auto p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-xl font-bold'>One last thing</CardTitle>
          <CardDescription>Tell us about your business so we can set things up for you.</CardDescription>
        </CardHeader>

        <Form onSubmit={form.handleSubmit} className='space-y-6'>
          <CardContent className='space-y-4'>
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

          <CardFooter>
            <form.Subscribe
              selector={state => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button type='submit' className='w-full' disabled={!canSubmit}>
                  {isSubmitting ? <Loader2 className='size-4 mr-2 animate-spin' /> : "Let's go →"}
                </Button>
              )}
            />
          </CardFooter>
        </Form>
      </Card>
    </div>
  )
}
