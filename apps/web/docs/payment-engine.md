# PaymentEngine Implementation Plan

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Last Updated**: August 28, 2026  
**Note**: Currently only Stripe and GCash manual payments exist. This plan adds PaymentEngine abstraction for multiple providers.

---

## Overview
Implement a PaymentEngine following the existing engine architecture (PriceEngine, UnitEngine, TaxEngine) to handle multiple payment methods (Stripe, GCash, future providers) with a config-driven, extensible design.

## Goals
1. Centralized payment method configuration and orchestration
2. Zero option fatigue - smart defaults based on user state
3. Easy extensibility for future payment providers (Maya, PayMongo, etc.)
4. Consistent with existing codebase architecture
5. Pure utility functions - no React/UI logic in engine

---

## Step 1: Update Database Schema

**File:** `web/prisma/schema.prisma`

### Actions:
1. Add `preferredPaymentMethod` field to `Business` model
2. Create `PaymentMethodType` enum
3. Add `paymentMethod` field to `ManualPaymentRequest` model
4. Run migration: `pnpm prisma migrate dev --name add_payment_method_preference`

### Code Changes:

```prisma
model Business {
  id                        String                @id @default(cuid())
  name                      String
  // ... existing fields
  preferredPaymentMethod    PaymentMethodType?    // NEW: User's saved payment preference
}

// NEW ENUM
enum PaymentMethodType {
  STRIPE
  GCASH_MANUAL
  MAYA_MANUAL
  PAYMONGO
  BANK_TRANSFER
}

model ManualPaymentRequest {
  id              String               @id @default(cuid())
  businessId      String
  business        Business             @relation(fields: [businessId], references: [id])
  planId          String
  plan            SubscriptionPlan     @relation(fields: [planId], references: [id])
  amount          Int
  paymentMethod   PaymentMethodType    // NEW: Track which payment method was used
  referenceNo     String?
  proofImageUrl   String               @db.Text
  notes           String?              @db.Text
  status          ManualPaymentStatus  @default(PENDING)
  reviewNotes     String?              @db.Text
  reviewedAt      DateTime?
  reviewedById    String?
  reviewedBy      User?                @relation(fields: [reviewedById], references: [id])
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([businessId])
  @@index([status])
}
```

---

## Step 2: Create Payment Provider Interface

**File:** `web/src/lib/billing/payment-methods/payment-provider.interface.ts` (NEW)

### Purpose:
Define the contract that all payment providers must follow.

### Code:

```typescript
import type { LucideIcon } from 'lucide-react'

/**
 * Payment method type identifier
 * Add new methods here as they're implemented
 */
export type PaymentMethodType = 
  | 'STRIPE' 
  | 'GCASH_MANUAL'
  | 'MAYA_MANUAL'
  | 'PAYMONGO'
  | 'BANK_TRANSFER'

/**
 * Configuration for a payment provider
 * Used by PaymentEngine to orchestrate payment flows
 */
export interface PaymentProviderConfig {
  // ========== Identity ==========
  id: PaymentMethodType
  name: string                      // Display name: "Credit/Debit Card"
  description: string               // User-facing description
  icon: LucideIcon                  // Icon component from lucide-react
  
  // ========== Display ==========
  badges?: string[]                 // e.g., ['Recommended', 'Popular in PH']
  displayOrder: number              // Sort order (lower = shown first)
  isEnabled: boolean                // Feature flag - can disable temporarily
  
  // ========== Capabilities ==========
  isAutomatic: boolean              // true = auto-renewal (Stripe), false = manual (GCash)
  requiresManualApproval: boolean   // true = admin must approve payment
  supportsRecurring: boolean        // true = supports subscription auto-renewal
  gracePeriodDays?: number          // For manual methods: days before expiration
  
  // ========== Availability ==========
  availableInCountries?: string[]   // ISO country codes. Undefined = available everywhere
  
  // ========== Routes ==========
  setupRoute?: string               // Where to send users to make payment (e.g., '/billing/gcash-payment')
  manageRoute?: string              // Where users manage this payment method (e.g., '/billing/portal')
}
```

---

## Step 3: Create Stripe Provider Configuration

**File:** `web/src/lib/billing/payment-methods/stripe-provider.ts` (NEW)

### Purpose:
Configuration for Stripe payment method.

### Code:

```typescript
import { CreditCardIcon } from 'lucide-react'
import type { PaymentProviderConfig } from './payment-provider.interface'

/**
 * Stripe Payment Provider Configuration
 * Handles credit/debit card payments with automatic recurring billing
 */
export const StripeProvider: PaymentProviderConfig = {
  id: 'STRIPE',
  name: 'Credit/Debit Card',
  description: 'Instant activation with automatic monthly renewal via Stripe',
  icon: CreditCardIcon,
  badges: ['Recommended', 'Instant Activation'],
  displayOrder: 1,
  isEnabled: true,
  
  // Capabilities
  isAutomatic: true,
  requiresManualApproval: false,
  supportsRecurring: true,
  
  // Routes
  manageRoute: '/billing/portal',
}
```

---

## Step 4: Create GCash Provider Configuration

**File:** `web/src/lib/billing/payment-methods/gcash-provider.ts` (NEW)

### Purpose:
Configuration for GCash manual payment method.

### Code:

```typescript
import { PhoneIcon } from 'lucide-react'
import type { PaymentProviderConfig } from './payment-provider.interface'

/**
 * GCash Manual Payment Provider Configuration
 * Handles manual GCash transfers with admin approval
 */
export const GCashProvider: PaymentProviderConfig = {
  id: 'GCASH_MANUAL',
  name: 'GCash Transfer',
  description: 'Pay via GCash mobile wallet. Admin approval within 24 hours.',
  icon: PhoneIcon,
  badges: ['Popular in Philippines'],
  displayOrder: 2,
  isEnabled: true,
  
  // Capabilities
  isAutomatic: false,
  requiresManualApproval: true,
  supportsRecurring: false,
  gracePeriodDays: 7,
  
  // Availability
  availableInCountries: ['PH'],
  
  // Routes
  setupRoute: '/billing/gcash-payment',
}
```

---

## Step 5: Create PaymentEngine Core

**File:** `web/src/lib/billing/payment-engine.ts` (NEW)

### Purpose:
Main engine that orchestrates payment method logic. Pure utility class with static methods.

### Code:

```typescript
import { StripeProvider } from './payment-methods/stripe-provider'
import { GCashProvider } from './payment-methods/gcash-provider'
import type { PaymentProviderConfig, PaymentMethodType } from './payment-methods/payment-provider.interface'

/**
 * PaymentEngine
 * 
 * Central orchestrator for payment method configuration and routing.
 * Follows same architectural pattern as PriceEngine, UnitEngine, TaxEngine.
 * 
 * Design principles:
 * - Pure utility functions (no React, no UI)
 * - Config-driven (easy to add new providers)
 * - Single source of truth for payment method logic
 * - Extensible without modifying existing code
 */

// ========== Registry ==========
// Add new payment providers here
const PAYMENT_PROVIDERS: PaymentProviderConfig[] = [
  StripeProvider,
  GCashProvider,
  // Future providers added here (Maya, PayMongo, etc.)
]

export const PaymentEngine = {
  /**
   * Get all enabled payment methods, optionally filtered by country
   * Used by payment method selection UI
   * 
   * @param country - ISO country code (e.g., 'PH', 'US')
   * @returns Sorted array of available payment providers
   * 
   * @example
   * const methods = PaymentEngine.getAvailableProviders('PH')
   * // Returns: [StripeProvider, GCashProvider]
   */
  getAvailableProviders(country?: string): PaymentProviderConfig[] {
    return PAYMENT_PROVIDERS
      .filter(provider => {
        // Filter disabled providers
        if (!provider.isEnabled) return false
        
        // Filter by country availability
        if (provider.availableInCountries && country) {
          return provider.availableInCountries.includes(country)
        }
        
        return true
      })
      .sort((a, b) => a.displayOrder - b.displayOrder)
  },

  /**
   * Get a specific payment provider by ID
   * 
   * @param id - Payment method type
   * @returns Provider config or undefined if not found
   * 
   * @example
   * const gcash = PaymentEngine.getProvider('GCASH_MANUAL')
   */
  getProvider(id: PaymentMethodType): PaymentProviderConfig | undefined {
    return PAYMENT_PROVIDERS.find(p => p.id === id)
  },

  /**
   * Check if a payment method requires grace period
   * Used to determine if user should be put in GRACE_PERIOD status
   * 
   * @param methodId - Payment method type
   * @returns true if method requires manual approval
   * 
   * @example
   * PaymentEngine.requiresGracePeriod('GCASH_MANUAL') // true
   * PaymentEngine.requiresGracePeriod('STRIPE') // false
   */
  requiresGracePeriod(methodId: PaymentMethodType): boolean {
    const provider = this.getProvider(methodId)
    return provider?.requiresManualApproval ?? false
  },

  /**
   * Get grace period duration in days for a payment method
   * 
   * @param methodId - Payment method type
   * @returns Number of days (default: 7)
   * 
   * @example
   * PaymentEngine.getGracePeriodDays('GCASH_MANUAL') // 7
   */
  getGracePeriodDays(methodId: PaymentMethodType): number {
    const provider = this.getProvider(methodId)
    return provider?.gracePeriodDays ?? 7
  },

  /**
   * Check if payment method supports automatic renewal
   * 
   * @param methodId - Payment method type
   * @returns true if supports auto-renewal
   * 
   * @example
   * PaymentEngine.supportsAutoRenewal('STRIPE') // true
   * PaymentEngine.supportsAutoRenewal('GCASH_MANUAL') // false
   */
  supportsAutoRenewal(methodId: PaymentMethodType): boolean {
    const provider = this.getProvider(methodId)
    return provider?.supportsRecurring ?? false
  },

  /**
   * Get user-friendly display name for a payment method
   * 
   * @param methodId - Payment method type
   * @returns Display name (e.g., "Credit/Debit Card")
   * 
   * @example
   * PaymentEngine.getDisplayName('STRIPE') // "Credit/Debit Card"
   */
  getDisplayName(methodId: PaymentMethodType): string {
    const provider = this.getProvider(methodId)
    return provider?.name ?? 'Unknown'
  },

  /**
   * Get the setup/payment submission route for a method
   * 
   * @param methodId - Payment method type
   * @param planId - Optional plan ID to include in query params
   * @returns Full route path with query params
   * 
   * @example
   * PaymentEngine.getSetupRoute('GCASH_MANUAL', 'plan_123')
   * // Returns: '/billing/gcash-payment?planId=plan_123'
   */
  getSetupRoute(methodId: PaymentMethodType, planId?: string): string {
    const provider = this.getProvider(methodId)
    if (!provider?.setupRoute) return '/billing/plans'
    return planId ? `${provider.setupRoute}?planId=${planId}` : provider.setupRoute
  },

  /**
   * Determine which subscription flow to use
   * Core routing logic - decides where to send user when they click "Subscribe"
   * 
   * @param methodId - User's preferred payment method (or null if not set)
   * @param planId - Plan they're subscribing to
   * @returns Flow type and optional redirect URL
   * 
   * Flow types:
   * - 'select-method': User needs to choose payment method first
   * - 'stripe-checkout': Redirect to Stripe (handled by existing logic)
   * - 'manual-payment': Redirect to manual payment submission page
   * 
   * @example
   * // No payment method set - must choose first
   * PaymentEngine.getSubscriptionFlow(null, 'plan_123')
   * // Returns: { type: 'select-method', redirectUrl: '/billing/payment-method-setup?planId=plan_123' }
   * 
   * // Has Stripe - go straight to checkout
   * PaymentEngine.getSubscriptionFlow('STRIPE', 'plan_123')
   * // Returns: { type: 'stripe-checkout' }
   * 
   * // Has GCash - go to payment submission
   * PaymentEngine.getSubscriptionFlow('GCASH_MANUAL', 'plan_123')
   * // Returns: { type: 'manual-payment', redirectUrl: '/billing/gcash-payment?planId=plan_123' }
   */
  getSubscriptionFlow(
    methodId: PaymentMethodType | null | undefined,
    planId: string
  ): {
    type: 'stripe-checkout' | 'manual-payment' | 'select-method'
    redirectUrl?: string
  } {
    // No payment method set - user must choose first
    if (!methodId) {
      return {
        type: 'select-method',
        redirectUrl: `/billing/payment-method-setup?planId=${planId}`,
      }
    }

    const provider = this.getProvider(methodId)

    // Stripe - use existing checkout flow
    if (provider?.id === 'STRIPE') {
      return { type: 'stripe-checkout' }
    }

    // Manual payment method with setup route
    if (provider?.setupRoute) {
      return {
        type: 'manual-payment',
        redirectUrl: `${provider.setupRoute}?planId=${planId}`,
      }
    }

    // Fallback - shouldn't happen, but handle gracefully
    return {
      type: 'select-method',
      redirectUrl: `/billing/payment-method-setup?planId=${planId}`,
    }
  },
}
```

---

## Step 6: Create Server Function to Save Payment Method

**File:** `web/src/lib/server-fn/set-payment-method.ts` (NEW)

### Purpose:
Server function to save user's payment method preference to database.

### Code:

```typescript
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { PaymentMethodType } from 'prisma/generated/prisma/enums'
import { getAuthUser } from '../better-auth/auth-server'
import { prisma } from '../prisma-client'

const setPaymentMethodSchema = z.object({
  paymentMethod: z.nativeEnum(PaymentMethodType),
})

export type SetPaymentMethodInput = z.infer<typeof setPaymentMethodSchema>

/**
 * Server function to set user's preferred payment method
 * Called when user selects payment method for first time or switches methods
 */
export const setPaymentMethod = createServerFn({ method: 'POST' })
  .inputValidator((data: SetPaymentMethodInput) => setPaymentMethodSchema.parse(data))
  .handler(async ({ data }) => {
    // Authenticate
    const authUser = await getAuthUser()
    if (!authUser?.businessId) {
      throw new Error('Authentication required')
    }

    // Save preference to database
    await prisma.business.update({
      where: { id: authUser.businessId },
      data: { preferredPaymentMethod: data.paymentMethod },
    })

    return { success: true }
  })
```

---

## Step 7: Create Payment Method Setup Page

**File:** `web/src/routes/(private)/(dashboard)/billing/payment-method-setup.tsx` (NEW)

### Purpose:
Page where users choose their payment method (shown once when first subscribing or when switching).

### Key Features:
- Shows only enabled & region-appropriate payment methods
- Uses PaymentEngine to get available options
- Displays method badges, icons, descriptions
- Saves preference and redirects to appropriate flow

### Code:

```typescript
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ArrowLeftIcon, CheckCircle2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PaymentEngine } from '@/lib/billing/payment-engine'
import type { PaymentMethodType } from '@/lib/billing/payment-methods/payment-provider.interface'
import { setPaymentMethod } from '@/lib/server-fn/set-payment-method'
import { authStore, refreshUser } from '@/store/auth-store'

export const Route = createFileRoute('/(private)/(dashboard)/billing/payment-method-setup')({
  validateSearch: (search: Record<string, unknown>) => ({
    planId: (search['planId'] as string) || '',
  }),
  component: PaymentMethodSetupPage,
})

function PaymentMethodSetupPage() {
  const navigate = useNavigate()
  const { planId } = useSearch({ from: Route.fullPath })
  const { user } = useStore(authStore)

  // Get available payment methods for user's region
  const availableMethods = PaymentEngine.getAvailableProviders(user?.business?.country)

  // Mutation to save payment method choice
  const mutation = useMutation({
    mutationFn: setPaymentMethod,
    onSuccess: async (_, variables) => {
      // Refresh user data to get updated payment method
      await refreshUser()

      // Determine next step based on chosen payment method
      const flow = PaymentEngine.getSubscriptionFlow(variables.data.paymentMethod, planId)

      if (flow.type === 'stripe-checkout') {
        // For Stripe, go back to plans page which will handle Stripe redirect
        navigate({ to: '/billing/plans' })
      } else if (flow.redirectUrl) {
        // For manual methods, go to their payment submission page
        navigate({ to: flow.redirectUrl as any })
      }
    },
    onError: (error: Error) => {
      toast.error('Failed to set payment method', {
        description: error.message,
      })
    },
  })

  const handleSelectMethod = (methodId: PaymentMethodType) => {
    mutation.mutate({ data: { paymentMethod: methodId } })
  }

  return (
    <div className='max-w-4xl mx-auto px-4 py-8 space-y-6'>
      {/* Header */}
      <div>
        <Button variant='ghost' size='sm' onClick={() => navigate({ to: '/billing/plans' })} className='mb-2 -ml-2'>
          <ArrowLeftIcon className='mr-2 h-4 w-4' />
          Back to Plans
        </Button>
        <h1 className='text-2xl font-bold tracking-tight'>Choose Payment Method</h1>
        <p className='text-muted-foreground mt-1'>Select how you'd like to pay for your subscription. You can change this later from your billing settings.</p>
      </div>

      {/* Payment method cards */}
      <div className='grid md:grid-cols-2 gap-4'>
        {availableMethods.map(method => {
          const Icon = method.icon

          return (
            <Card
              key={method.id}
              className='cursor-pointer hover:border-primary hover:shadow-md transition-all group'
              onClick={() => handleSelectMethod(method.id)}
            >
              <CardHeader>
                <div className='flex items-start gap-3'>
                  <div className='rounded-full bg-primary/10 p-3 group-hover:bg-primary/20 transition-colors'>
                    <Icon className='h-6 w-6 text-primary' />
                  </div>
                  <div className='flex-1'>
                    <CardTitle className='text-lg'>{method.name}</CardTitle>
                    <div className='flex flex-wrap gap-2 mt-1'>
                      {method.badges?.map(badge => (
                        <Badge key={badge} variant='secondary' className='text-xs'>
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-3'>
                <CardDescription className='text-sm'>{method.description}</CardDescription>

                {/* Show warning for manual approval methods */}
                {method.requiresManualApproval && (
                  <Alert className='border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'>
                    <AlertDescription className='text-xs text-amber-800 dark:text-amber-400'>
                      ⏱️ Requires admin approval • Processing time: up to 24 hours
                    </AlertDescription>
                  </Alert>
                )}

                {/* Show benefit for automatic methods */}
                {method.isAutomatic && (
                  <div className='flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400'>
                    <CheckCircle2Icon className='h-3.5 w-3.5' />
                    <span>Instant activation • Auto-renewal enabled</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Step 8: Update Plans Page to Use PaymentEngine

**File:** `web/src/routes/(private)/(dashboard)/billing/plans/index.tsx` (MODIFY)

### Changes Needed:
1. Import PaymentEngine
2. Update subscribe button handler to check payment method
3. Route to appropriate flow based on PaymentEngine logic

### Code to Add/Modify:

```typescript
// Add import at top
import { PaymentEngine } from '@/lib/billing/payment-engine'

// Find the subscribe/upgrade button click handler and replace with:
const handleSubscribe = (planId: string) => {
  const flow = PaymentEngine.getSubscriptionFlow(
    user?.business?.preferredPaymentMethod,
    planId
  )

  if (flow.type === 'select-method' && flow.redirectUrl) {
    // User needs to choose payment method first
    navigate({ to: flow.redirectUrl as any })
  } else if (flow.type === 'stripe-checkout') {
    // Existing Stripe checkout logic
    createStripeCheckoutSession(planId)
  } else if (flow.type === 'manual-payment' && flow.redirectUrl) {
    // Manual payment method
    navigate({ to: flow.redirectUrl as any })
  }
}
```

### Specific Location:
Look for button click handlers that currently redirect to Stripe checkout. Replace that logic with the PaymentEngine flow check above.

---

## Step 9: Update Billing Dashboard to Show Payment Method

**File:** `web/src/routes/(private)/(dashboard)/billing/index.tsx` (MODIFY)

### Changes Needed:
Add a "Payment Method" card in the right sidebar showing current method with option to change.

### Code to Add:

```typescript
// Add import at top
import { PaymentEngine } from '@/lib/billing/payment-engine'

// Add this card in the right sidebar (around line 450, in the sticky column):
{/* Payment Method Card */}
<Card>
  <CardHeader className='pb-2'>
    <div className='flex items-center gap-2'>
      <CreditCardIcon className='h-4 w-4 text-muted-foreground' />
      <CardTitle className='text-sm font-semibold'>Payment Method</CardTitle>
    </div>
    <CardDescription className='text-xs'>How you pay for your subscription</CardDescription>
  </CardHeader>
  <CardContent className='space-y-3'>
    <div className='flex items-center justify-between text-sm'>
      <span className='text-muted-foreground'>Current method</span>
      <span className='font-medium'>
        {user?.business?.preferredPaymentMethod
          ? PaymentEngine.getDisplayName(user.business.preferredPaymentMethod)
          : 'Not set'}
      </span>
    </div>
    <Button size='sm' variant='outline' className='w-full' asChild>
      <Link to='/billing/payment-method-setup'>
        Change payment method
      </Link>
    </Button>
  </CardContent>
</Card>
```

---

## Step 10: Update GCash Payment Page to Use PaymentEngine

**File:** `web/src/routes/(private)/(dashboard)/billing/gcash-payment.tsx` (MODIFY)

### Changes Needed:
1. Import PaymentEngine
2. Use engine to get GCash provider config for display
3. Use `paymentMethod` field when submitting payment

### Code Changes:

```typescript
// Add import at top
import { PaymentEngine } from '@/lib/billing/payment-engine'

// Get GCash provider config for display
const gcashProvider = PaymentEngine.getProvider('GCASH_MANUAL')

// Update the submit mutation to include paymentMethod:
submitMutation.mutate({
  planId: selectedPlan.id,
  amount,
  paymentMethod: 'GCASH_MANUAL', // Add this field
  referenceNo: referenceNo.trim() || undefined,
  notes: notes.trim() || undefined,
  proofImageUrl: base64String,
})
```

### Update submitGcashPayment server function:

**File:** `web/src/lib/server-fn/submit-gcash-payment.ts` (MODIFY)

```typescript
// Update input type to include paymentMethod:
export type SubmitGcashPaymentInput = {
  planId: string
  amount: number
  paymentMethod: 'GCASH_MANUAL'  // Add this
  referenceNo?: string
  notes?: string
  proofImageUrl: string
}

// Update the create call to include paymentMethod:
const paymentRequest = await prisma.manualPaymentRequest.create({
  data: {
    businessId: authUser.businessId,
    planId: data.planId,
    amount: data.amount,
    paymentMethod: data.paymentMethod,  // Add this
    referenceNo: data.referenceNo,
    proofImageUrl: data.proofImageUrl,
    notes: data.notes,
    status: ManualPaymentStatus.PENDING,
  },
})
```

---

## Testing Checklist

After implementation, verify these scenarios:

### First-Time User Flow
- [ ] New user with no payment method set
- [ ] Clicks "Subscribe" on any plan
- [ ] Redirected to `/billing/payment-method-setup`
- [ ] Sees 2 payment options (Stripe and GCash)
- [ ] Selecting Stripe redirects to Stripe checkout
- [ ] Selecting GCash redirects to GCash payment page
- [ ] Payment method preference is saved to database

### Existing Stripe User Flow
- [ ] User with `preferredPaymentMethod='STRIPE'`
- [ ] Clicks "Subscribe" or "Upgrade"
- [ ] Goes directly to Stripe checkout (no method selection)
- [ ] Can see "Payment Method: Credit/Debit Card" on billing page
- [ ] Can click "Change payment method" to switch to GCash

### Existing GCash User Flow
- [ ] User with `preferredPaymentMethod='GCASH_MANUAL'`
- [ ] Clicks "Subscribe" or "Renew"
- [ ] Goes directly to GCash payment submission page
- [ ] Can see "Payment Method: GCash Transfer" on billing page
- [ ] Can click "Change payment method" to switch to Stripe

### Payment Method Display
- [ ] Billing dashboard shows current payment method
- [ ] Shows "Not set" if no method chosen
- [ ] "Change payment method" link works correctly
- [ ] Payment method badges display correctly on setup page

### Region-Specific Filtering
- [ ] Philippine users see GCash option
- [ ] Non-PH users don't see GCash option (if country detection implemented)

### Database Verification
- [ ] `preferredPaymentMethod` is saved correctly
- [ ] `ManualPaymentRequest.paymentMethod` is populated

---

## Files Created/Modified Summary

### New Files (7):
1. `web/src/lib/billing/payment-methods/payment-provider.interface.ts`
2. `web/src/lib/billing/payment-methods/stripe-provider.ts`
3. `web/src/lib/billing/payment-methods/gcash-provider.ts`
4. `web/src/lib/billing/payment-engine.ts`
5. `web/src/lib/server-fn/set-payment-method.ts`
6. `web/src/routes/(private)/(dashboard)/billing/payment-method-setup.tsx`
7. Migration file (auto-generated)

### Modified Files (4):
1. `web/prisma/schema.prisma` - Add fields and enum
2. `web/src/routes/(private)/(dashboard)/billing/plans/index.tsx` - Use PaymentEngine
3. `web/src/routes/(private)/(dashboard)/billing/index.tsx` - Add payment method card
4. `web/src/routes/(private)/(dashboard)/billing/gcash-payment.tsx` - Use PaymentEngine
5. `web/src/lib/server-fn/submit-gcash-payment.ts` - Add paymentMethod field

---

## Future Extensibility

To add a new payment method (e.g., Maya):

1. Create provider config: `web/src/lib/billing/payment-methods/maya-provider.ts`
2. Add to `PAYMENT_PROVIDERS` array in `payment-engine.ts`
3. Add enum value to `PaymentMethodType` in `schema.prisma`
4. Create payment submission page if manual (like GCash page)
5. Run migration

**No changes needed to:**
- UI components (read from engine)
- Routing logic (engine handles it)
- Business logic (engine orchestrates)

---

## Architecture Benefits

✅ **Consistent** - Follows existing engine pattern (PriceEngine, UnitEngine)
✅ **Extensible** - Add payment methods without modifying existing code
✅ **Maintainable** - Single source of truth for payment method logic
✅ **Testable** - Pure functions, easy to unit test
✅ **User-friendly** - No option fatigue, smart defaults
✅ **Type-safe** - Full TypeScript support with proper types
✅ **Config-driven** - Easy to enable/disable methods via feature flags

---

## Notes for AI Agent

1. **Follow exact file structure** - Create files in specified locations
2. **Import statements** - Use absolute imports with `@/` prefix
3. **Code style** - Match existing codebase conventions
4. **Type safety** - Ensure all TypeScript types are properly defined
5. **Error handling** - Include proper error handling in server functions
6. **Comments** - Add JSDoc comments for all public functions
7. **Migration** - Don't forget to run Prisma migration after schema changes
8. **Testing** - Manual testing required after implementation

---

## Implementation Order

Execute in this exact order to avoid dependency issues:

1. Step 1: Database schema
2. Step 2: Interface definition
3. Step 3-4: Provider configs
4. Step 5: PaymentEngine
5. Step 6: Server function
6. Step 7: Payment method setup page
7. Step 8-10: Update existing pages

---

**End of Implementation Plan**
