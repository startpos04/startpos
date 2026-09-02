/**
 * survey-wizard.tsx â€” Adaptive onboarding survey UI (Phase 1.4)
 *
 * Multi-step adaptive question tree: Q1 â†’ Q8 with conditional branching.
 * - Q1 (business type) is required â€” the submit button is disabled without it.
 * - All other questions can be skipped; safe defaults apply.
 * - Progress indicator shows approximate steps remaining.
 * - No intermediate server calls â€” answers accumulate in local state.
 * - Mobile-responsive single-column layout.
 *
 * Branching rules (mirrors survey-interpreter.ts logic):
 *   Q3a shown only when Q3 = deferred or mixed
 *   Q3b shown only when Q3 = deferred or mixed
 *   Q4a shown only when Q4 â‰  'no'
 *   Q4b shown only when Q4 â‰  'no' and teamSize â‰  solo
 *   Q4c shown only when any physical/food/raw material selected in Q1
 *   Q5a shown only when Q5 = yes
 *   Q6a shown only when Q6 = yes
 *   Q6b shown only when Q6 = yes
 *
 * @param onComplete - called with the final SurveyAnswers when user submits
 * @param isSubmitting - disables the submit button while the parent is loading
 */

import { Badge } from '@platform/components/ui/badge'
import { Button } from '@platform/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@platform/components/ui/card'
import { cn } from '@platform/lib/utils'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Q1_OPTIONS,
  Q2_OPTIONS,
  Q3_OPTIONS,
  Q3A_OPTIONS,
  Q3B_OPTIONS,
  Q4_OPTIONS,
  Q4A_OPTIONS,
  Q4B_OPTIONS,
  Q4C_OPTIONS,
  Q5_OPTIONS,
  Q5A_OPTIONS,
  Q6_OPTIONS,
  Q6A_OPTIONS,
  Q6B_OPTIONS,
  Q7_OPTIONS,
  Q8_OPTIONS,
  Q9_OPTIONS,
  Q10_OPTIONS,
  Q11_OPTIONS,
  Q12_OPTIONS,
  type SurveyAnswers,
} from '@/lib/onboarding/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SingleOption = { value: string; label: string; description?: string }

type QuestionConfig =
  | { id: keyof SurveyAnswers; type: 'multi'; title: string; subtitle?: string; options: SingleOption[] }
  | { id: keyof SurveyAnswers; type: 'single'; title: string; subtitle?: string; options: SingleOption[] }
  | { id: keyof SurveyAnswers; type: 'skip'; title: string; subtitle?: string; options: SingleOption[] }

// ---------------------------------------------------------------------------
// Question definitions
// ---------------------------------------------------------------------------

const Q1: QuestionConfig = {
  id: 'q1_business_type',
  type: 'multi',
  title: 'What does your business primarily do?',
  subtitle: 'Select all that apply.',
  options: [
    { value: Q1_OPTIONS.PHYSICAL_GOODS, label: 'Sell physical goods', description: 'Products you stock and sell' },
    { value: Q1_OPTIONS.FOOD_BEVERAGE, label: 'Serve food or drinks', description: 'Restaurant, cafÃ©, or catering' },
    { value: Q1_OPTIONS.SERVICES, label: 'Provide services', description: 'Repairs, consultations, etc.' },
    { value: Q1_OPTIONS.RAW_MATERIALS, label: 'Supply raw materials', description: 'Wholesale ingredients or materials' },
  ],
}

const Q2: QuestionConfig = {
  id: 'q2_team_size',
  type: 'single',
  title: 'How many people work here, including yourself?',
  options: [
    { value: Q2_OPTIONS.JUST_ME, label: 'Just me' },
    { value: Q2_OPTIONS.TWO_TO_FIVE, label: '2 to 5 people' },
    { value: Q2_OPTIONS.SIX_TO_TWENTY, label: '6 to 20 people' },
    { value: Q2_OPTIONS.MORE_THAN_TWENTY, label: 'More than 20' },
  ],
}

const Q3: QuestionConfig = {
  id: 'q3_payment_timing',
  type: 'single',
  title: 'When a customer pays, how does it usually work?',
  options: [
    { value: Q3_OPTIONS.IMMEDIATE, label: 'They pay at the counter', description: 'Payment at point of sale' },
    { value: Q3_OPTIONS.DEFERRED, label: 'They order first, pay later', description: 'Restaurant orders, invoices' },
    { value: Q3_OPTIONS.MIXED, label: 'Both happen', description: 'Depends on the customer' },
  ],
}

const Q3A: QuestionConfig = {
  id: 'q3a_fulfillment',
  type: 'multi',
  title: 'How do customers receive what they ordered?',
  subtitle: 'Select all that apply.',
  options: [
    { value: Q3A_OPTIONS.DINE_IN, label: 'Dine in / table service' },
    { value: Q3A_OPTIONS.TAKEOUT, label: 'Takeout / pick up' },
    { value: Q3A_OPTIONS.DELIVERY, label: 'Delivery' },
  ],
}

const Q3B: QuestionConfig = {
  id: 'q3b_order_customization',
  type: 'single',
  title: 'Do customers customize or add extras to orders?',
  options: [
    { value: Q3B_OPTIONS.OFTEN, label: 'Yes, often', description: 'Add-ons, variants, special requests' },
    { value: Q3B_OPTIONS.OCCASIONALLY, label: 'Occasionally' },
    { value: Q3B_OPTIONS.NEVER, label: 'Not really' },
  ],
}

const Q4: QuestionConfig = {
  id: 'q4_inventory_tracking',
  type: 'single',
  title: 'Do you track how much stock you have?',
  options: [
    { value: Q4_OPTIONS.YES_STRICT, label: 'Yes â€” stock levels matter a lot', description: 'Low stock alerts, strict counts' },
    { value: Q4_OPTIONS.YES_RELAXED, label: 'Yes â€” basic tracking is fine' },
    { value: Q4_OPTIONS.PERIODIC, label: 'Periodically, not in real time' },
    { value: Q4_OPTIONS.NO, label: "No, I don't track stock" },
  ],
}

const Q4A: QuestionConfig = {
  id: 'q4a_restock_method',
  type: 'single',
  title: 'How do you replenish stock when it runs low?',
  options: [
    { value: Q4A_OPTIONS.FORMAL_SUPPLIERS, label: 'From registered suppliers', description: 'You create purchase orders' },
    { value: Q4A_OPTIONS.INFORMAL, label: 'Informally â€” cash buys, market runs', description: 'No formal supplier records' },
  ],
}

const Q4B: QuestionConfig = {
  id: 'q4b_stock_locations',
  type: 'single',
  title: 'Do you store stock in different areas or rooms?',
  options: [
    { value: Q4B_OPTIONS.YES, label: 'Yes â€” warehouse, bodega, separate rooms' },
    { value: Q4B_OPTIONS.NO, label: 'No â€” everything in one place' },
  ],
}

const Q4C: QuestionConfig = {
  id: 'q4c_expiry',
  type: 'single',
  title: 'Do any of your products have an expiry date?',
  options: [
    { value: Q4C_OPTIONS.YES_MANY, label: 'Yes â€” most of my products do' },
    { value: Q4C_OPTIONS.SOME, label: 'A few do' },
    { value: Q4C_OPTIONS.NO, label: 'No, none of them do' },
  ],
}

const Q5: QuestionConfig = {
  id: 'q5_role_separation',
  type: 'single',
  title: 'Do different staff members need different levels of access?',
  options: [
    { value: Q5_OPTIONS.YES, label: 'Yes â€” managers vs. cashiers, etc.' },
    { value: Q5_OPTIONS.LATER, label: "Not yet, but I'll set this up later" },
    { value: Q5_OPTIONS.NO, label: 'No â€” everyone has the same access' },
  ],
}

const Q5A: QuestionConfig = {
  id: 'q5a_approvals',
  type: 'single',
  title: 'Do certain actions need manager approval?',
  options: [
    { value: Q5A_OPTIONS.YES_STRICT, label: 'Yes â€” most actions need sign-off' },
    { value: Q5A_OPTIONS.YES_SOME, label: 'Just a few key actions' },
    { value: Q5A_OPTIONS.NO, label: 'No approval workflows needed' },
  ],
}

const Q6: QuestionConfig = {
  id: 'q6_vat_registered',
  type: 'single',
  title: 'Is your business registered for VAT?',
  options: [
    { value: Q6_OPTIONS.YES, label: 'Yes' },
    { value: Q6_OPTIONS.NO, label: 'No' },
    { value: Q6_OPTIONS.UNSURE, label: "I'm not sure" },
  ],
}

const Q6A: QuestionConfig = {
  id: 'q6a_tax_display',
  type: 'single',
  title: 'When you show prices, is tax already included?',
  options: [
    { value: Q6A_OPTIONS.INCLUSIVE, label: 'Yes â€” prices include tax (inclusive)' },
    { value: Q6A_OPTIONS.EXCLUSIVE, label: 'No â€” tax is added on top (exclusive)' },
  ],
}

const Q6B: QuestionConfig = {
  id: 'q6b_official_receipts',
  type: 'single',
  title: 'Do you issue official receipts with regulatory numbers?',
  options: [
    { value: Q6B_OPTIONS.BIR_COMPLIANT, label: 'Yes â€” BIR-registered receipts' },
    { value: Q6B_OPTIONS.INFORMAL, label: 'Just informal receipts or none' },
    { value: Q6B_OPTIONS.NONE, label: "We don't issue receipts" },
  ],
}

const Q7: QuestionConfig = {
  id: 'q7_location_count',
  type: 'single',
  title: 'Do you operate from one place, or multiple?',
  options: [
    { value: Q7_OPTIONS.ONE, label: 'One location' },
    { value: Q7_OPTIONS.MULTIPLE, label: 'Multiple locations or branches' },
  ],
}

const Q8: QuestionConfig = {
  id: 'q8_expansion_plans',
  type: 'single',
  title: 'Do you plan to open more locations in the next year?',
  options: [
    { value: Q8_OPTIONS.YES, label: 'Yes' },
    { value: Q8_OPTIONS.POSSIBLY, label: 'Possibly' },
    { value: Q8_OPTIONS.NO, label: 'Not at the moment' },
  ],
}

const Q9: QuestionConfig = {
  id: 'q9_cash_reconciliation',
  type: 'single',
  title: 'Do you reconcile your cash at the end of each shift?',
  subtitle: 'This helps track how much cash your team collected each day.',
  options: [
    { value: Q9_OPTIONS.YES, label: 'Yes â€” I count cash at end of shift' },
    { value: Q9_OPTIONS.NO, label: "No â€” I don't track this" },
  ],
}

const Q10: QuestionConfig = {
  id: 'q10_operational_tasks',
  type: 'single',
  title: 'Do you use task lists to manage daily operations?',
  subtitle: 'For example: stock counts, shelf refills, opening/closing checklists.',
  options: [
    { value: Q10_OPTIONS.YES, label: 'Yes â€” I track tasks or checklists regularly' },
    { value: Q10_OPTIONS.NO, label: "No â€” I don't use task lists" },
  ],
}

const Q11: QuestionConfig = {
  id: 'q11_batch_preparation',
  type: 'single',
  title: 'Do you prepare food items in batches ahead of time?',
  subtitle: 'For example: sandwiches, pastries, meal prep, or pre-cooked dishes.',
  options: [
    { value: Q11_OPTIONS.YES_RECIPES, label: 'Yes â€” using recipes with ingredients', description: 'Track materials used in production' },
    { value: Q11_OPTIONS.YES_NO_RECIPES, label: 'Yes â€” but without tracking ingredients' },
    { value: Q11_OPTIONS.NO, label: 'No â€” we prepare items on-demand' },
  ],
}

const Q12: QuestionConfig = {
  id: 'q12_business_registration',
  type: 'single',
  title: 'Is your business officially registered with the government?',
  subtitle: 'This helps us set up compliance features like tax receipts and BIR requirements.',
  options: [
    { value: Q12_OPTIONS.REGISTERED, label: 'Yes â€” fully registered', description: 'Have TIN, permits, and official documents' },
    { value: Q12_OPTIONS.PENDING, label: 'Registration in progress', description: 'Applied but not yet complete' },
    { value: Q12_OPTIONS.UNREGISTERED, label: 'Not yet registered', description: 'Operating informally for now' },
  ],
}

// ---------------------------------------------------------------------------
// Derive the ordered question list from current answers (branching logic)
// ---------------------------------------------------------------------------

function getVisibleQuestions(answers: SurveyAnswers): QuestionConfig[] {
  const questions: QuestionConfig[] = [Q1, Q2, Q3]

  const hasDeferred = answers.q3_payment_timing === Q3_OPTIONS.DEFERRED || answers.q3_payment_timing === Q3_OPTIONS.MIXED

  if (hasDeferred) {
    questions.push(Q3A, Q3B)
  }

  const hasPhysical =
    (answers.q1_business_type ?? []).some(v =>
      ([Q1_OPTIONS.PHYSICAL_GOODS, Q1_OPTIONS.FOOD_BEVERAGE, Q1_OPTIONS.RAW_MATERIALS] as const).includes(
        v as typeof Q1_OPTIONS.PHYSICAL_GOODS | typeof Q1_OPTIONS.FOOD_BEVERAGE | typeof Q1_OPTIONS.RAW_MATERIALS,
      ),
    ) || (answers.q1_business_type ?? []).length === 0

  if (hasPhysical) {
    questions.push(Q4)
    const tracksInventory = answers.q4_inventory_tracking && answers.q4_inventory_tracking !== Q4_OPTIONS.NO
    if (tracksInventory) {
      questions.push(Q4A)
      if (answers.q2_team_size !== Q2_OPTIONS.JUST_ME) {
        questions.push(Q4B)
      }
      questions.push(Q4C)
    }
  }

  // Q5 and Q5a only apply when there's more than one person
  if (answers.q2_team_size !== Q2_OPTIONS.JUST_ME) {
    questions.push(Q5)
    if (answers.q5_role_separation === Q5_OPTIONS.YES) {
      questions.push(Q5A)
    }
  }

  questions.push(Q6)
  if (answers.q6_vat_registered === Q6_OPTIONS.YES) {
    questions.push(Q6A, Q6B)
  }

  // Q12: Business registration status â€” shown for all businesses
  questions.push(Q12)

  // Q7 (location) â€” only if team > solo (solo operators assumed single location)
  // Q8 (expansion plans) â€” always shown, even solo users may plan to expand
  if (answers.q2_team_size !== Q2_OPTIONS.JUST_ME) {
    questions.push(Q7)
  }
  questions.push(Q8)

  // Q9: Cash reconciliation â€” shown when the business handles cash (everyone for now)
  questions.push(Q9)

  // Q10: Operational tasks â€” shown for all team sizes, including solo operators.
  // A solo operator may still want to manage personal checklists or future staff tasks.
  questions.push(Q10)

  // Q11: Batch preparation â€” only shown for food & beverage businesses
  const sellsFood = (answers.q1_business_type ?? []).includes(Q1_OPTIONS.FOOD_BEVERAGE)
  if (sellsFood) {
    questions.push(Q11)
  }

  return questions
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SurveyWizardProps {
  onComplete: (answers: SurveyAnswers) => void | Promise<void>
  isSubmitting?: boolean
  /** Show a back button when on the first question (to go back to name/email step) */
  onBack?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyWizard({ onComplete, isSubmitting = false, onBack }: SurveyWizardProps) {
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [step, setStep] = useState(0)

  const questions = useMemo(() => getVisibleQuestions(answers), [answers])
  const current = questions[step]!
  const isLast = step === questions.length - 1
  const _isFirst = step === 0
  const canProceed = current.id !== 'q1_business_type' || (answers.q1_business_type?.length ?? 0) > 0
  const totalSteps = questions.length
  const progress = Math.round(((step + 1) / (totalSteps + 1)) * 100)

  const getValue = (): string | string[] | undefined => answers[current.id]

  const toggleMulti = (value: string) => {
    const existing = (answers[current.id] as string[] | undefined) ?? []
    const next = existing.includes(value) ? existing.filter(v => v !== value) : [...existing, value]
    setAnswers(prev => ({ ...prev, [current.id]: next }))
  }

  const selectSingle = (value: string) => {
    setAnswers(prev => ({ ...prev, [current.id]: value }))
  }

  const handleNext = () => {
    if (isLast) {
      void onComplete(answers)
    } else {
      // Recompute questions with updated answers before advancing so branching
      // changes (e.g. picking "Just me" on Q2) take effect immediately.
      // Find the current question's position in the new list and move to the
      // next one â€” avoids the Math.min clamp silently skipping to the last
      // question when the list shrinks.
      const nextQuestions = getVisibleQuestions(answers)
      const currentIdxInNext = nextQuestions.findIndex(q => q.id === current.id)
      const nextIndex = currentIdxInNext >= 0 ? Math.min(currentIdxInNext + 1, nextQuestions.length - 1) : Math.min(step + 1, nextQuestions.length - 1)
      setStep(nextIndex)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(s => s - 1)
    } else {
      onBack?.()
    }
  }

  const currentValue = getValue()
  const isMulti = current.type === 'multi'
  const selectedValues = isMulti ? ((currentValue as string[] | undefined) ?? []) : []
  const selectedSingle = !isMulti ? (currentValue as string | undefined) : undefined

  // Estimate remaining time (about 30 seconds per remaining question)
  const remainingQuestions = totalSteps - step - 1
  const minutesRemaining = Math.ceil((remainingQuestions * 30) / 60)

  return (
    <div className='w-full max-w-md mx-auto'>
      {/* Progress bar */}
      <div className='mb-4'>
        <div className='flex items-center justify-between text-xs text-muted-foreground mb-1.5'>
          <span>
            Step {step + 1} of {totalSteps}
          </span>
          {remainingQuestions > 0 && (
            <span>
              About {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''} remaining
            </span>
          )}
        </div>
        <div className='h-1.5 w-full bg-muted rounded-full overflow-hidden'>
          <div className='h-full bg-primary rounded-full transition-all duration-300' style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-lg'>{current.title}</CardTitle>
          {current.subtitle && <CardDescription>{current.subtitle}</CardDescription>}
          {current.id === 'q1_business_type' && (
            <Badge variant='outline' className='w-fit text-xs'>
              Required
            </Badge>
          )}
        </CardHeader>

        <CardContent>
          <div className='grid gap-2'>
            {current.options.map(opt => {
              const isSelected = isMulti ? selectedValues.includes(opt.value) : selectedSingle === opt.value

              return (
                <button
                  key={opt.value}
                  type='button'
                  onClick={() => (isMulti ? toggleMulti(opt.value) : selectSingle(opt.value))}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-sm text-left transition-colors',
                    isSelected ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40 hover:bg-muted/30',
                  )}
                >
                  <span className='font-medium'>{opt.label}</span>
                  {opt.description && <span className={cn('text-xs', isSelected ? 'text-primary/70' : 'text-muted-foreground')}>{opt.description}</span>}
                </button>
              )
            })}
          </div>
        </CardContent>

        <CardFooter className='flex gap-2'>
          {(step > 0 || onBack) && (
            <Button type='button' variant='ghost' size='icon' onClick={handleBack} aria-label='Go back'>
              <ChevronLeft className='size-4' />
            </Button>
          )}

          <Button type='button' className='flex-1' onClick={handleNext} disabled={!canProceed || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className='size-4 mr-2 animate-spin' />
                Setting upâ€¦
              </>
            ) : isLast ? (
              "Let's go â†’"
            ) : selectedSingle || selectedValues.length > 0 ? (
              'Next â†’'
            ) : (
              'Skip â†’'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
