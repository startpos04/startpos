/**
 * business-setup.tsx
 *
 * /register/business-setup — OAuth interstitial screen.
 *
 * Shown only to OAuth users (Google / Facebook) immediately after their
 * provider callback, before the app loads. OAuth provides name + email but
 * not business name. This screen collects:
 *   - Business name (required)
 *   - Adaptive survey Q1–Q8 (Q1 required, rest skippable)
 *
 * If the user already has a Membership, they are redirected to /dashboard.
 */

import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/components/ui/card'
import { Input } from '@platform/components/ui/input'
import { Label } from '@platform/components/ui/label'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { authStore, setUser } from '@/lib/better-auth/auth-store'
import type { SurveyAnswers } from '@/lib/onboarding/types'
import { completeRegistration } from '@/lib/server-fn/complete-registration'
import { refreshSession } from '@/lib/server-fn/refresh-session'
import { SurveyWizard } from './-components/survey-wizard'

const businessNameSchema = z.string().min(1).max(100)

export const Route = createFileRoute('/(public)/register/business-setup')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const user = useStore(authStore, state => state.user)
  const [step, setStep] = useState<'name' | 'survey'>('name')
  const [businessName, setBusinessName] = useState('')
  const [nameError, setNameError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // If already has a business, redirect to app
  useEffect(() => {
    if (user?.business?.id) {
      navigate({ to: '/dashboard', replace: true })
    }
  }, [user, navigate])

  const handleNameContinue = () => {
    const result = businessNameSchema.safeParse(businessName.trim())
    if (!result.success) {
      setNameError('Business name is required.')
      return
    }
    setNameError('')
    setStep('survey')
  }

  const handleSurveyComplete = async (surveyAnswers: SurveyAnswers) => {
    setIsSubmitting(true)
    try {
      const result = await completeRegistration({
        data: {
          displayName: user?.name ?? '',
          businessName: businessName.trim(),
          surveyAnswers,
        },
      })

      if (!result.success) {
        toast.error(result.error || 'Could not complete setup. Please try again.')
        setStep('name')
        return
      }

      const refreshResult = await refreshSession()
      if (refreshResult.success && refreshResult.user) {
        setUser(refreshResult.user, refreshResult.user.authorization)
      }

      navigate({ to: '/dashboard', replace: true })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2 — Survey
  // ---------------------------------------------------------------------------

  if (step === 'survey') {
    return (
      <div className='flex flex-col items-center justify-center min-h-screen overflow-y-auto p-4'>
        <div className='w-full max-w-md mb-4'>
          <h2 className='text-lg font-semibold'>Tell us about your business</h2>
          <p className='text-sm text-muted-foreground mt-0.5'>This helps us set up your store correctly. You can change anything later.</p>
        </div>
        <SurveyWizard onComplete={handleSurveyComplete} isSubmitting={isSubmitting} onBack={() => setStep('name')} />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Business name
  // ---------------------------------------------------------------------------

  return (
    <div className='flex flex-col items-center justify-center min-h-screen overflow-y-auto p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle className='text-xl font-bold'>One last thing</CardTitle>
          <CardDescription>What's your business called?</CardDescription>
        </CardHeader>

        <CardContent className='space-y-2'>
          <Label htmlFor='business-name'>Business name</Label>
          <Input
            id='business-name'
            ref={inputRef}
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="Juan's Store"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleNameContinue()
            }}
          />
          {nameError && <p className='text-xs text-destructive'>{nameError}</p>}
        </CardContent>

        <CardFooter>
          <Button className='w-full' onClick={handleNameContinue} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='size-4 mr-2 animate-spin' />
                Setting up…
              </>
            ) : (
              'Continue â†’'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
