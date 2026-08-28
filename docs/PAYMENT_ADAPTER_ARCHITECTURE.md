# Payment Adapter Architecture

## 1. Purpose

This document describes the architectural design for supporting multiple payment providers (Stripe, Manual GCash, future providers such as PayMongo, Xendit, bank transfer) in the StartPOS SaaS platform through a unified payment adapter system.

The objective is to refactor the current single-provider architecture so that Stripe and Manual GCash become implementations of a common payment-provider interface, enabling future providers to be added without modifying the core subscription lifecycle, entitlement logic, or unrelated billing functionality.

This is the primary reference for the payment adapter refactoring implementation and serves as the authoritative design record for all multi-provider payment architecture.

---

## 2. Current Architecture Audit

### 2.1 What Already Exists

**Provider Abstraction Layer:**
The codebase has a well-structured provider abstraction in `src/lib/billing/billing-provider.ts`. The `BillingProviderAdapter` interface already defines:

```typescript
createCustomer()
createSubscription()
updateSubscription()
cancelSubscription()
createCreditPurchaseLink()
createAddonSubscription()
getInvoice()
createCustomerPortalSession()
verifyWebhookSignature()
```

The interface returns provider-agnostic DTOs like `CreateSubscriptionResult`, `WebhookEvent` — the webhook handler never touches provider SDK types directly. **This is already the correct foundation for multi-provider support.**

**Stripe Adapter:**
`src/lib/billing/adapters/stripe-adapter.ts` is the only Stripe-coupled file. It:
- Is the sole importer of the `stripe` npm package
- Implements `BillingProviderAdapter` fully
- Normalizes Stripe events to `WebhookEvent` in `normaliseStripeEvent()`
- Exports two factory functions: `createStripeAdapter()` and `getStripeWebhookSecret()`

**Domain Engines (No Changes Needed):**
All billing engines are pure functions with no infrastructure dependencies:

| Engine | Responsibility | Provider-Awareness |
|---|---|---|
| `SubscriptionEngine` | State machine transitions, lifecycle evaluation | ✅ None |
| `InvoiceEngine` | Invoice assembly from usage counters and plan config | ✅ None |
| `CreditEngine` | Credit ledger deduction, granting, balance reads | ✅ None |
| `UsageEngine` | Transaction count tracking, overage computation | ✅ None |
| `PlanEngine` | Plan entitlement resolution | ✅ None |
| `EntitlementEngine` | Capability checking, feature access control | ✅ None |

**Webhook Handler:**
`src/routes/api/billing/webhook/index.ts` handles all five event types and routes them to handler functions. The handler functions operate exclusively on `WebhookEvent` (the normalized DTO). The only Stripe-specific code is in the signature verification step at the top of the POST handler.

**Background Jobs:**
Both background jobs are provider-agnostic:
- `billing-invoice-generation.ts` — accepts `BillingProviderAdapter | null` via injection
- `subscription-lifecycle.ts` — pure DB + engine work; no provider calls

### 2.2 Where Provider-Specific Logic Exists

**Hardcoded Adapter Instantiation:**
Three server functions call `createStripeAdapter()` directly:

| File | Coupling |
|---|---|
| `src/lib/server-fn/create-subscription.ts` | `createStripeAdapter()`, `STRIPE_PLAN_*_PRICE_ID` env vars |
| `src/lib/server-fn/cancel-subscription.ts` | `createStripeAdapter()` |
| `src/lib/server-fn/purchase-credit-package.ts` | `createStripeAdapter()`, `STRIPE_CREDIT_PKG_*_PRICE_ID` env vars |
| `src/lib/server-fn/purchase-addon-subscription.ts` | `createStripeAdapter()`, `STRIPE_ADDON_*_PRICE_ID` env vars |
| `src/routes/api/billing/webhook/index.ts` | `createStripeAdapter()`, `getStripeWebhookSecret()` |

**Type Naming:**
`CreditPackage` in `src/lib/billing/types.ts` has a `stripePriceId` field — leaks provider name into shared domain type.

**Missing Schema Fields:**
- `Business.externalCustomerId` — not stored (customer ID passed in-memory)
- `BillingInvoice.providerName` — missing (cannot distinguish Stripe vs future provider invoices)
- No `Payment` or `PaymentAttempt` table — payment history not tracked independently of subscriptions

**Webhook Route:**
Single `/api/billing/webhook` route currently expects only Stripe webhooks with Stripe signature format.

### 2.3 Manual GCash Status

**Current Status:** The manual GCash payment system referenced in the instructions **does not yet exist** in the codebase.

Found GCash references:
- `POS_PAYMENT_METHOD` enum has `GCASH` value (for in-store POS transactions)
- No `ManualPaymentRequest` model
- No `ManualPaymentStatus` enum  
- No admin approval workflow
- No manual payment submission pages

**This means:** The manual GCash system described in `GCASH-PAYMENT-SYSTEM.md` is a **feature specification**, not an existing implementation. The refactoring task includes:
1. Implementing the manual payment adapter architecture
2. Building the manual GCash payment flow as the first manual provider
3. Ensuring future manual providers (bank transfer, Maya manual) can reuse the infrastructure

---

## 3. Architectural Principle

### 3.1 Core Boundary

**The billing/subscription system must NOT know how an individual payment provider works.**

Desired flow:

```
Subscription / Billing Engine
            |
            v
    Payment Service Layer
            |
            v
    Payment Provider Registry
            |
      +-----+------+----------------+
      |            |                |
      v            v                v
 StripeAdapter  ManualAdapter   FutureAdapter
      |            |                |
      v            v                v
 Stripe API    Manual Review    Provider API
```

The core system requests a payment operation. The selected adapter handles provider-specific behavior. The subscription system reacts to the resulting payment outcome rather than knowing whether payment came from Stripe, GCash, PayMongo, etc.

### 3.2 Provider vs Payment Method

Keep **provider** and **payment method** conceptually separate:

```
provider = STRIPE
method   = CARD

provider = MANUAL  
method   = GCASH

provider = PAYMONGO (future)
method   = GCASH

provider = MANUAL
method   = BANK_TRANSFER
```

This distinction matters because the same payment method may eventually be available through multiple providers.

---

## 4. Payment Provider Interface

### 4.1 Capability Concept

Providers have different capabilities. Introduce capability flags to avoid forcing every adapter to implement operations it cannot support:

```typescript
type ProviderCapabilities = {
  supportsAutomaticConfirmation: boolean   // Stripe: true, Manual: false
  supportsManualReview: boolean            // Stripe: false, Manual: true  
  supportsWebhook: boolean                 // Stripe: true, Manual: false
  supportsRefund: boolean                  // Stripe: true, Manual: manual
  supportsRecurring: boolean               // Stripe: true, Manual: false
  supportsCustomerPortal: boolean          // Stripe: true, Manual: false
}
```

UI and billing workflows use capabilities instead of hardcoded checks like `if provider === GCASH`.

### 4.2 Extended Adapter Interface

The existing `BillingProviderAdapter` interface is already excellent. Extensions needed:

```typescript
export interface BillingProviderAdapter {
  // --- Existing methods (no changes) ---
  createCustomer(...)
  createSubscription(...)
  updateSubscription(...)
  cancelSubscription(...)
  createCreditPurchaseLink(...)
  createAddonSubscription(...)
  getInvoice(...)
  createCustomerPortalSession(...)
  verifyWebhookSignature(...)
  
  // --- New methods for multi-provider support ---
  
  /**
   * Get provider capabilities
   * Used by UI and billing workflows to adapt behavior
   */
  getCapabilities(): ProviderCapabilities
  
  /**
   * Get provider identity
   * Returns machine-readable provider ID (e.g., 'stripe', 'manual', 'paymongo')
   */
  getProviderId(): PaymentProviderId
  
  /**
   * Get human-readable provider name
   * Returns display name (e.g., 'Stripe', 'Manual Payment', 'PayMongo')
   */
  getProviderName(): string
  
  /**
   * Create refund (future)
   * Not all providers support automated refunds
   * Manual providers return 'manual' in result
   */
  createRefund(params: {
    externalPaymentId: string
    amount: number
    reason?: string
  }): Promise<RefundResult>
}
```

---

## 5. Provider Registry

### 5.1 Registry Design

Create a provider registry/service responsible for resolving available payment adapters.

**File:** `src/lib/billing/payment-provider-registry.ts`

```typescript
export type PaymentProviderId = 'stripe' | 'manual' | 'paymongo' | 'xendit' | 'bank_transfer'

export type PaymentProviderConfig = {
  providerId: PaymentProviderId
  displayName: string
  isEnabled: boolean
  availableInCountries?: string[]  // ISO codes, undefined = everywhere
  
  // Configuration
  requiresApproval: boolean
  gracePeriodDays?: number
  
  // Provider-specific config (type-safe union)
  config: StripeProviderConfig | ManualProviderConfig | GenericProviderConfig
}

export class PaymentProviderRegistry {
  private providers: Map<PaymentProviderId, BillingProviderAdapter> = new Map()
  private configs: Map<PaymentProviderId, PaymentProviderConfig> = new Map()
  
  /**
   * Register a payment provider adapter
   */
  register(providerId: PaymentProviderId, adapter: BillingProviderAdapter, config: PaymentProviderConfig): void
  
  /**
   * Get adapter by provider ID
   */
  getAdapter(providerId: PaymentProviderId): BillingProviderAdapter | null
  
  /**
   * Get all enabled providers
   */
  getEnabledProviders(country?: string): PaymentProviderConfig[]
  
  /**
   * Get provider configuration
   */
  getConfig(providerId: PaymentProviderId): PaymentProviderConfig | null
  
  /**
   * Check if provider is enabled
   */
  isProviderEnabled(providerId: PaymentProviderId): boolean
}

// Global registry instance
export const paymentProviderRegistry = new PaymentProviderRegistry()

// Register providers at app startup
paymentProviderRegistry.register('stripe', createStripeAdapter(), {
  providerId: 'stripe',
  displayName: 'Credit/Debit Card',
  isEnabled: !!process.env['STRIPE_SECRET_KEY'],
  requiresApproval: false,
  config: { /* stripe config */ }
})

paymentProviderRegistry.register('manual', createManualPaymentAdapter(), {
  providerId: 'manual',
  displayName: 'Manual Payment',
  isEnabled: true,
  availableInCountries: ['PH'],
  requiresApproval: true,
  gracePeriodDays: 7,
  config: { /* manual config */ }
})
```

### 5.2 Provider Selection

**File:** `src/lib/billing/payment-provider-service.ts`

```typescript
export class PaymentProviderService {
  /**
   * Get provider adapter for a business
   * Resolution order:
   * 1. Business.preferredPaymentProvider (if set)
   * 2. Most recent payment provider (from Payment records)
   * 3. Platform default (Stripe)
   */
  getProviderForBusiness(businessId: string): Promise<BillingProviderAdapter>
  
  /**
   * Get available providers for a business
   * Filters by country, enabled status, etc.
   */
  getAvailableProviders(businessId: string): Promise<PaymentProviderConfig[]>
  
  /**
   * Set preferred provider for a business
   */
  setPreferredProvider(businessId: string, providerId: PaymentProviderId): Promise<void>
}
```

---

## 6. Payment Records Architecture

### 6.1 Payment History

Payment history must permanently identify the provider that processed the payment. **Historical records must NOT change when the customer later switches providers.**

**New Schema:**

```prisma
// ---------------------------------------------------------------------------
// Payment — Universal payment record
// Tracks all payments regardless of provider
// ---------------------------------------------------------------------------
model Payment {
  id                   String         @id @default(cuid())
  businessId           String
  business             Business       @relation(fields: [businessId], references: [id], onDelete: Cascade)
  
  // Provider identification (permanent, immutable)
  provider             PaymentProvider  // STRIPE, MANUAL, PAYMONGO, etc.
  paymentMethod        PaymentMethod    // CARD, GCASH, MAYA, BANK_TRANSFER, etc.
  
  // Payment details
  amount               Int              // cents
  currency             String           @default("PHP")
  status               PaymentStatus    // PENDING, SUCCEEDED, FAILED, REFUNDED, etc.
  
  // Provider references
  providerTransactionId String?         // Stripe: pi_xxx, Manual: null
  providerReference     String?         // User-provided reference number for manual payments
  providerMetadata      Json?           // Provider-specific data
  
  // Relationships
  subscriptionId       String?
  subscription         BusinessSubscription? @relation(fields: [subscriptionId], references: [id])
  invoiceId            String?
  invoice              BillingInvoice?  @relation(fields: [invoiceId], references: [id])
  
  // Manual payment approval (if applicable)
  requiresApproval     Boolean          @default(false)
  approvedAt           DateTime?
  approvedById         String?
  approvedBy           User?            @relation(fields: [approvedById], references: [id])
  rejectedAt           DateTime?
  rejectionReason      String?
  
  // Audit
  proofImageUrl        String?          @db.Text  // For manual payments
  notes                String?          @db.Text
  actorId              String?          // User who initiated payment
  
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt
  
  @@index([businessId, createdAt])
  @@index([provider, status])
  @@index([subscriptionId])
  @@map("payments")
}

// ---------------------------------------------------------------------------
// PaymentAttempt — Retry tracking
// ---------------------------------------------------------------------------
model PaymentAttempt {
  id             String    @id @default(cuid())
  paymentId      String
  payment        Payment   @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  
  attemptNumber  Int       @default(1)
  status         String    // PENDING, SUCCEEDED, FAILED
  failureCode    String?
  failureMessage String?
  
  createdAt      DateTime  @default(now())
  
  @@index([paymentId])
  @@map("payment_attempts")
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
enum PaymentProvider {
  STRIPE
  MANUAL
  PAYMONGO
  XENDIT
  BANK_TRANSFER
}

enum PaymentMethod {
  CARD
  GCASH
  MAYA
  BANK_TRANSFER
  GRABPAY
  SHOPEE_PAY
  PAYMAYA
  OTHER
}

enum PaymentStatus {
  PENDING
  PENDING_APPROVAL     // Manual payments awaiting admin review
  SUCCEEDED
  FAILED
  EXPIRED
  REFUNDED
  CANCELLED
}
```

### 6.2 Relationship to Subscription

Payments remain separate from subscriptions:

```
Subscription (one)
    |
    +-- Payment (many)
    +-- Payment
    +-- Payment
```

Payment success flows into billing engine:
```
Payment succeeds → Payment recorded → Billing Engine → Subscription updated
```

The billing engine doesn't care whether payment was Stripe, GCash, or another provider.

### 6.3 Updates to Existing Models

```prisma
model Business {
  // ... existing fields ...
  
  // Provider tracking
  externalCustomerId       String?  // Provider customer ID (Stripe: cus_xxx, Manual: businessId)
  preferredPaymentProvider PaymentProvider?  // User's chosen default provider
  
  payments                 Payment[]
}

model BillingInvoice {
  // ... existing fields ...
  
  // Provider tracking
  providerName  String?  // "stripe" | "manual" | "paymongo"
  
  payments      Payment[]
}

model BusinessSubscription {
  // ... existing fields ...
  
  // Provider tracking (keep existing externalId)
  externalId    String?  // Provider subscription ID
  
  payments      Payment[]
}
```

---

## 7. Manual Payment Adapter Architecture

### 7.1 Generic Manual Provider

The manual adapter should be designed so that GCash is not the only possible manual payment method. Future methods include:
- GCASH
- BANK_TRANSFER
- MAYA (manual)
- OTHER_MANUAL

**File:** `src/lib/billing/adapters/manual-adapter.ts`

```typescript
export type ManualPaymentProviderConfig = {
  providerId: 'manual'
  paymentMethod: PaymentMethod  // GCASH, BANK_TRANSFER, etc.
  
  // Display configuration
  accountName: string
  accountNumber: string
  paymentInstructions: string
  
  // Behavior
  gracePeriodDays: number
  autoExpireDays: number  // Auto-expire pending requests after N days
}

export class ManualPaymentAdapter implements BillingProviderAdapter {
  constructor(private config: ManualPaymentProviderConfig) {}
  
  getCapabilities(): ProviderCapabilities {
    return {
      supportsAutomaticConfirmation: false,
      supportsManualReview: true,
      supportsWebhook: false,
      supportsRefund: false,  // Manual refunds handled outside system
      supportsRecurring: false,
      supportsCustomerPortal: false,
    }
  }
  
  getProviderId(): PaymentProviderId {
    return 'manual'
  }
  
  getProviderName(): string {
    return 'Manual Payment'
  }
  
  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    // Manual provider doesn't create external customer records
    // Return businessId as synthetic customer ID
    return { externalCustomerId: params.businessId }
  }
  
  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    // Manual subscriptions don't use external subscription IDs
    // Create a Payment record in PENDING_APPROVAL status
    // Return synthetic subscription ID and no checkout URL
    
    const payment = await prisma.payment.create({
      data: {
        businessId: params.metadata.businessId,
        provider: 'MANUAL',
        paymentMethod: this.config.paymentMethod,
        amount: /* extract from metadata */,
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        providerReference: params.metadata.referenceNo,
        proofImageUrl: params.metadata.proofImageUrl,
        notes: params.metadata.notes,
        actorId: params.metadata.userId,
      }
    })
    
    return {
      externalSubscriptionId: payment.id,  // Use payment ID as synthetic subscription ID
      checkoutUrl: null,  // No external checkout for manual payments
      currentPeriodStart: new Date(),
      currentPeriodEnd: addMonths(new Date(), 1),
    }
  }
  
  async cancelSubscription(params: CancelSubscriptionParams): Promise<CancelSubscriptionResult> {
    // Manual subscriptions don't have external cancellation
    // Just return immediate cancellation
    return {
      cancelledAt: new Date(),
      immediate: true,
    }
  }
  
  async createCreditPurchaseLink(params: CreateCreditPurchaseLinkParams): Promise<CreatePaymentLinkResult> {
    // Create a Payment record in PENDING_APPROVAL status
    // Return a URL to the payment submission page with the payment ID
    const payment = await prisma.payment.create({
      data: {
        businessId: params.metadata.businessId,
        provider: 'MANUAL',
        paymentMethod: this.config.paymentMethod,
        amount: /* extract from metadata */,
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        providerMetadata: params.metadata,
      }
    })
    
    return {
      url: `/billing/manual-payment/${payment.id}`,
      externalSessionId: payment.id,
      expiresAt: addDays(new Date(), this.config.autoExpireDays),
    }
  }
  
  async verifyWebhookSignature(params: VerifyWebhookParams): Promise<WebhookEvent> {
    // Manual providers don't have webhooks
    throw new Error('[ManualAdapter] Manual payment provider does not support webhooks')
  }
  
  // ... other methods throw "not supported" errors or return null
}
```

### 7.2 Manual Payment Workflow

The manual payment workflow is handled through the `Payment` model state machine:

```
User submits payment
        |
        v
PENDING_APPROVAL
        |
   Admin review
     /         \
    v           v
SUCCEEDED    REJECTED
    |
    v
Subscription activated
```

**Server Functions:**

```typescript
// src/lib/server-fn/submit-manual-payment.ts
export const submitManualPayment = createServerFn()
  .inputValidator(SubmitManualPaymentSchema)
  .handler(async ({ data, context }) => {
    const adapter = paymentProviderRegistry.getAdapter('manual')
    
    // Create payment in PENDING_APPROVAL status
    const result = await adapter.createSubscription({
      metadata: {
        businessId: context.user.businessId,
        userId: context.user.id,
        planId: data.planId,
        referenceNo: data.referenceNo,
        proofImageUrl: data.proofImageUrl,
        notes: data.notes,
      },
      ...
    })
    
    // Payment is now awaiting admin approval
    return { success: true, paymentId: result.externalSubscriptionId }
  })

// src/lib/server-fn/review-manual-payment.ts
export const reviewManualPayment = createServerFn()
  .middleware([authMiddleware, requirePermission(Permissions.ADMIN_APPROVE_PAYMENTS)])
  .inputValidator(ReviewPaymentSchema)
  .handler(async ({ data, context }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: data.paymentId },
      include: { subscription: true },
    })
    
    if (!payment || payment.status !== 'PENDING_APPROVAL') {
      return { success: false, error: 'Payment not found or already reviewed' }
    }
    
    if (data.approved) {
      // APPROVE: Update payment status and activate subscription
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCEEDED',
            approvedAt: new Date(),
            approvedById: context.user.id,
          },
        })
        
        // Activate subscription using SubscriptionEngine
        const subscription = await tx.businessSubscription.findUnique({
          where: { businessId: payment.businessId },
        })
        
        if (subscription) {
          const transition = SubscriptionEngine.buildTransitionRecord(
            subscription,
            SubscriptionStatus.ACTIVE,
            `Manual payment approved by ${context.user.name}`,
            context.user.id
          )
          
          // Apply transition...
        }
      })
      
      return { success: true }
    } else {
      // REJECT: Update payment status
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          rejectedAt: new Date(),
          rejectionReason: data.rejectionReason,
        },
      })
      
      return { success: true }
    }
  })
```

---

## 8. Provider Configuration

### 8.1 Configuration Architecture

Provider configuration must not be scattered through application code. Use a centralized configuration system:

**File:** `src/lib/billing/provider-config.ts`

```typescript
export type ProviderConfigMap = {
  stripe: StripeProviderConfig
  manual: ManualProviderConfig
  paymongo?: PayMongoProviderConfig
  xendit?: XenditProviderConfig
}

export type StripeProviderConfig = {
  secretKey: string
  webhookSecret: string
  planPriceIds: Record<string, string>
  creditPackagePriceIds: Record<string, string>
  addonPriceIds: Record<string, string>
}

export type ManualProviderConfig = {
  paymentMethod: PaymentMethod
  accountName: string
  accountNumber: string
  paymentInstructions: string
  gracePeriodDays: number
  autoExpireDays: number
}

export function loadProviderConfigs(): ProviderConfigMap {
  return {
    stripe: {
      secretKey: process.env['STRIPE_SECRET_KEY'] ?? '',
      webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
      planPriceIds: {
        starter_monthly: process.env['STRIPE_PLAN_STARTER_PRICE_ID'] ?? '',
        starter_annual: process.env['STRIPE_PLAN_STARTER_ANNUAL_PRICE_ID'] ?? '',
        // ... etc
      },
      creditPackagePriceIds: {
        credits_10: process.env['STRIPE_CREDIT_PKG_10_PRICE_ID'] ?? '',
        // ... etc
      },
      addonPriceIds: {
        branch: process.env['STRIPE_ADDON_BRANCH_PRICE_ID'] ?? '',
        // ... etc
      },
    },
    manual: {
      paymentMethod: 'GCASH',
      accountName: process.env['GCASH_ACCOUNT_NAME'] ?? 'StartPOS Business',
      accountNumber: process.env['GCASH_ACCOUNT_NUMBER'] ?? '09171234567',
      paymentInstructions: process.env['GCASH_PAYMENT_INSTRUCTIONS'] ?? 'Transfer to GCash number above...',
      gracePeriodDays: 7,
      autoExpireDays: 7,
    },
  }
}
```

### 8.2 Provider Enable/Disable

Providers can be enabled/disabled via configuration:

```typescript
export function isProviderEnabled(providerId: PaymentProviderId): boolean {
  const config = loadProviderConfigs()
  
  switch (providerId) {
    case 'stripe':
      return !!config.stripe.secretKey
    case 'manual':
      return true  // Manual provider always available
    case 'paymongo':
      return !!config.paymongo?.secretKey
    default:
      return false
  }
}
```

---

## 9. Webhook Architecture

### 9.1 Multi-Provider Webhook Routes

Create provider-specific webhook routes:

```
/api/billing/webhook/stripe   ← existing handler, minimal changes
/api/billing/webhook/manual   ← new (or N/A if no webhooks)
/api/billing/webhook/paymongo ← future
```

**Shared Handler Functions:**

Extract handler logic to shared functions that operate on normalized `WebhookEvent` DTO:

**File:** `src/routes/api/billing/webhook/-shared/handlers.ts`

```typescript
export async function handlePaymentSucceeded(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handlePaymentFailed(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleSubscriptionActivated(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleSubscriptionCancelled(event: WebhookEvent): Promise<WebhookProcessingResult>
export async function handleCheckoutCompleted(event: WebhookEvent): Promise<WebhookProcessingResult>
```

Each provider route handles only:
1. Reading provider-specific header
2. Calling adapter's `verifyWebhookSignature()`
3. Writing `WebhookEvent` row for idempotency
4. Dispatching to shared handlers

### 9.2 Provider-Agnostic Event Types

Expand `WebhookEventType` to be provider-agnostic:

```typescript
export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.pending'
  | 'subscription.activated'
  | 'subscription.updated'
  | 'subscription.cancelled'
  | 'checkout.completed'
  | 'refund.succeeded'
  | 'refund.failed'
```

Stripe adapter maps:
- `invoice.paid` → `payment.succeeded`
- `invoice.payment_failed` → `payment.failed`
- `customer.subscription.updated` → `subscription.updated`
- `customer.subscription.deleted` → `subscription.cancelled`
- `checkout.session.completed` → `checkout.completed`

Manual adapter doesn't use webhooks — approval is synchronous via admin UI.

### 9.3 Webhook Idempotency

Add `WebhookEvent` table for cross-provider idempotency:

```prisma
model WebhookEvent {
  id             String   @id @default(cuid())
  provider       PaymentProvider
  externalId     String   // Provider event ID
  eventType      String   // Normalized event type
  status         String   @default("RECEIVED")  // RECEIVED, PROCESSED, SKIPPED, ERROR
  rawPayload     Json     // Full provider payload for replay
  errorMessage   String?
  processedAt    DateTime?
  
  businessId     String?  // Resolved after processing
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  @@unique([provider, externalId])  // Idempotency constraint
  @@index([provider, status])
  @@map("webhook_events")
}
```

---

## 10. Renewal and Reminder Architecture

### 10.1 Provider-Agnostic Reminders

Refactor reminder system to be provider-aware rather than GCash-specific:

**File:** `src/lib/jobs/subscription-reminder.ts`

```typescript
export async function sendRenewalReminders() {
  const now = new Date()
  const sevenDaysFromNow = addDays(now, 7)
  
  // Find subscriptions expiring in 7 days
  const expiringSubscriptions = await prisma.businessSubscription.findMany({
    where: {
      status: 'ACTIVE',
      currentPeriodEnd: {
        gte: now,
        lte: sevenDaysFromNow,
      },
    },
    include: {
      business: true,
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })
  
  for (const subscription of expiringSubscriptions) {
    const lastPayment = subscription.payments[0]
    const provider = lastPayment?.provider ?? 'STRIPE'
    
    // Get provider adapter to check capabilities
    const adapter = paymentProviderRegistry.getAdapter(provider)
    const capabilities = adapter?.getCapabilities()
    
    // Only send reminders for non-automatic providers
    if (!capabilities?.supportsAutomaticConfirmation) {
      await sendRenewalReminder(subscription, provider)
    }
  }
}
```

**Key Changes:**
- Lookup last payment provider instead of assuming GCash
- Check provider capabilities to determine if reminder needed
- Works for any manual provider (GCash, bank transfer, Maya manual, etc.)

---

## 11. UI Requirements

### 11.1 Payment Method Selection

**File:** `src/routes/(private)/(dashboard)/business/billing/payment-method-setup.tsx`

```tsx
export function PaymentMethodSetupPage() {
  const availableProviders = useQuery({
    queryKey: ['payment-providers'],
    queryFn: async () => {
      const service = new PaymentProviderService()
      return service.getAvailableProviders(businessId)
    },
  })
  
  return (
    <div className='space-y-6'>
      <h1>Choose Payment Method</h1>
      
      <div className='grid md:grid-cols-2 gap-4'>
        {availableProviders.data?.map(provider => (
          <PaymentProviderCard
            key={provider.providerId}
            provider={provider}
            onSelect={() => handleSelectProvider(provider.providerId)}
          />
        ))}
      </div>
    </div>
  )
}

function PaymentProviderCard({ provider, onSelect }: Props) {
  const capabilities = provider.capabilities
  
  return (
    <Card onClick={onSelect}>
      <CardHeader>
        <CardTitle>{provider.displayName}</CardTitle>
        {provider.requiresApproval && (
          <Badge>Requires Approval</Badge>
        )}
      </CardHeader>
      <CardContent>
        <p>{provider.description}</p>
        
        {capabilities.supportsAutomaticConfirmation && (
          <div className='flex items-center gap-2'>
            <CheckCircle2Icon className='h-4 w-4' />
            <span>Instant activation</span>
          </div>
        )}
        
        {!capabilities.supportsRecurring && (
          <div className='flex items-center gap-2'>
            <AlertTriangleIcon className='h-4 w-4' />
            <span>Manual renewal required</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

### 11.2 Billing Dashboard Updates

**File:** `src/routes/(private)/(dashboard)/business/billing/index.tsx`

Add provider display:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Payment Method</CardTitle>
  </CardHeader>
  <CardContent>
    <div className='flex items-center justify-between'>
      <span className='text-muted-foreground'>Current provider</span>
      <span className='font-medium'>
        {paymentProviderRegistry.getAdapter(business.preferredPaymentProvider)?.getProviderName() ?? 'Not set'}
      </span>
    </div>
    
    <Button onClick={() => navigate('/billing/payment-method-setup')}>
      Change payment method
    </Button>
  </CardContent>
</Card>
```

---

## 12. Error Handling & Payment Outcomes

### 12.1 Provider-Independent Status Mapping

Define application-level payment statuses:

```typescript
export const PaymentStatus = {
  PENDING: 'PENDING',
  PENDING_APPROVAL: 'PENDING_APPROVAL',  // Manual payments awaiting review
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REFUNDED: 'REFUNDED',
} as const

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus]
```

Map provider-specific statuses into these application-level states:

```typescript
// Stripe adapter
function mapStripePaymentStatus(stripeStatus: string): PaymentStatus {
  switch (stripeStatus) {
    case 'succeeded': return PaymentStatus.SUCCEEDED
    case 'processing': return PaymentStatus.PENDING
    case 'requires_action': return PaymentStatus.PENDING
    case 'canceled': return PaymentStatus.CANCELLED
    case 'failed': return PaymentStatus.FAILED
    default: return PaymentStatus.PENDING
  }
}

// Manual adapter
function mapManualPaymentStatus(manualStatus: string): PaymentStatus {
  // All manual payments start as PENDING_APPROVAL
  // Admin action changes to SUCCEEDED or FAILED
  return manualStatus
}
```

### 12.2 Failure Codes

Track provider-specific failure codes in Payment metadata:

```prisma
model Payment {
  // ... other fields ...
  
  status              PaymentStatus
  providerFailureCode String?       // Stripe: card_declined, Manual: null
  failureMessage      String?       // Human-readable error
  providerMetadata    Json?         // Full provider-specific data
}
```

---

## 13. Idempotency & Duplicate Protection

### 13.1 Payment Idempotency

Ensure duplicate payment requests don't accidentally extend subscription multiple times:

```typescript
// src/lib/server-fn/process-payment.ts
export async function processPayment(paymentId: string) {
  return await prisma.$transaction(async (tx) => {
    // Lock payment row for update
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      // Add FOR UPDATE lock if DB supports it
    })
    
    if (!payment) throw new Error('Payment not found')
    
    if (payment.status !== 'PENDING_APPROVAL') {
      // Already processed
      return { success: true, alreadyProcessed: true }
    }
    
    // Process payment...
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'SUCCEEDED', approvedAt: new Date() },
    })
    
    // Activate subscription...
    // (SubscriptionEngine guarantees idempotent transitions)
    
    return { success: true, alreadyProcessed: false }
  })
}
```

### 13.2 Webhook Idempotency

Use `WebhookEvent` unique constraint on `[provider, externalId]`:

```typescript
// Webhook handler
try {
  await prisma.webhookEvent.create({
    data: {
      provider: event.provider,
      externalId: event.id,
      eventType: event.type,
      status: 'RECEIVED',
      rawPayload: event,
    },
  })
} catch (error) {
  if (error.code === 'P2002') {
    // Unique constraint violation = already processed
    return { status: 200, body: { outcome: 'SKIPPED' } }
  }
  throw error
}
```

---

## 14. Testing Strategy

### 14.1 Core Payment Behavior Tests

```typescript
describe('Payment Adapter Architecture', () => {
  describe('Payment creation', () => {
    it('should create payment with correct provider')
    it('should prevent duplicate payments')
    it('should normalize provider status to application status')
  })
  
  describe('Subscription activation', () => {
    it('should activate subscription on Stripe payment')
    it('should activate subscription on manual payment approval')
    it('should not activate on payment failure')
  })
  
  describe('Provider switching', () => {
    it('should allow switching from Stripe to Manual')
    it('should preserve historical Stripe payments after switch')
    it('should use new provider for future payments')
  })
})
```

### 14.2 Stripe Adapter Tests

```typescript
describe('StripeAdapter', () => {
  it('should preserve existing Stripe behavior')
  it('should map Stripe events to WebhookEvent')
  it('should handle webhook idempotency')
})
```

### 14.3 Manual Adapter Tests

```typescript
describe('ManualPaymentAdapter', () => {
  it('should create payment in PENDING_APPROVAL status')
  it('should prevent duplicate pending requests')
  it('should activate subscription on approval')
  it('should not activate on rejection')
  it('should be idempotent for repeated approval')
})
```

### 14.4 Architecture Test: Fake Provider

Create a lightweight fake provider to validate architecture:

```typescript
class FakeProviderAdapter implements BillingProviderAdapter {
  async createSubscription(params) {
    return {
      externalSubscriptionId: 'fake_sub_123',
      checkoutUrl: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: addMonths(new Date(), 1),
    }
  }
  
  // ... minimal implementations
}

describe('Architecture validation', () => {
  it('should support registering fake provider', () => {
    paymentProviderRegistry.register('fake', new FakeProviderAdapter(), {
      providerId: 'fake',
      displayName: 'Fake Provider',
      isEnabled: true,
      requiresApproval: false,
    })
    
    expect(paymentProviderRegistry.isProviderEnabled('fake')).toBe(true)
  })
  
  it('should create subscription via fake provider without modifying core logic', async () => {
    const service = new PaymentProviderService()
    await service.setPreferredProvider(businessId, 'fake')
    
    const result = await createSubscription({ planId: 'plan_123' })
    
    expect(result.success).toBe(true)
    // Verify subscription created, no changes to SubscriptionEngine, EntitlementEngine, etc.
  })
})
```

---

## 15. Migration Strategy

### 15.1 Implementation Phases

**Phase 1 — Audit & Boundary Definition (✅ COMPLETE)**
- ✅ Understand current Stripe implementation
- ✅ Identify provider-specific coupling points
- ✅ Define adapter boundary and capabilities
- ✅ Document architecture

**Phase 2 — Schema & Infrastructure (Week 1)**
- Add `Payment`, `PaymentAttempt`, `WebhookEvent` models
- Add `Business.preferredPaymentProvider`, `Business.externalCustomerId`
- Add `BillingInvoice.providerName`
- Add `PaymentProvider`, `PaymentMethod`, `PaymentStatus` enums
- Run migrations

**Phase 3 — Provider Registry (Week 1)**
- Create `PaymentProviderRegistry` class
- Create `PaymentProviderService` class
- Add provider configuration loading
- Register Stripe adapter in registry
- Create factory function `getBillingAdapter(businessId)`

**Phase 4 — Refactor Stripe Integration (Week 2)**
- Update server functions to use `getBillingAdapter()` instead of `createStripeAdapter()`
- Add `getCapabilities()`, `getProviderId()`, `getProviderName()` to Stripe adapter
- Create shared webhook handlers in `-shared/handlers.ts`
- Move Stripe webhook route to `/api/billing/webhook/stripe`
- Update Stripe adapter to write `Payment` records
- Verify existing Stripe behavior still works

**Phase 5 — Implement Manual Adapter (Week 2-3)**
- Create `ManualPaymentAdapter` class
- Implement `createSubscription()` for manual payments
- Implement payment submission UI (`/billing/manual-payment`)
- Implement admin approval UI (`/(admin)/payment-approvals`)
- Implement payment status tracking
- Register manual adapter in registry
- Test manual payment flow end-to-end

**Phase 6 — UI Refactoring (Week 3)**
- Create payment method selection UI
- Update billing dashboard to show current provider
- Update subscription flow to check provider capabilities
- Add provider badges and status indicators
- Remove GCash-specific hardcoded logic

**Phase 7 — Renewal Reminders (Week 3)**
- Refactor `manual-payment-reminders` job to be provider-agnostic
- Check provider capabilities instead of hardcoded GCash checks
- Test reminders for both Stripe and Manual providers

**Phase 8 — Testing & Validation (Week 4)**
- Run existing billing tests
- Add new adapter tests
- Add fake provider test
- Manual end-to-end testing of both providers
- Load testing (if needed)

**Phase 9 — Documentation & Cleanup (Week 4)**
- Update API documentation
- Document provider configuration
- Document how to add new providers
- Clean up deprecated code
- Code review

### 15.2 Rollout Safety

**Feature Flags:**
```typescript
export function isMultiProviderEnabled(): boolean {
  return process.env['ENABLE_MULTI_PROVIDER'] === 'true'
}

// In server functions
export const createSubscription = createServerFn()
  .handler(async ({ data, context }) => {
    if (isMultiProviderEnabled()) {
      const service = new PaymentProviderService()
      const adapter = await service.getProviderForBusiness(businessId)
      // ... new flow
    } else {
      const adapter = createStripeAdapter()
      // ... old flow
    }
  })
```

**Gradual Migration:**
1. Deploy Phase 2-4 (infrastructure + refactored Stripe) with feature flag OFF
2. Test thoroughly in staging
3. Enable feature flag for internal testing
4. Deploy Phase 5 (manual adapter)
5. Enable manual provider for PH country only
6. Monitor for issues
7. Gradually roll out to more users

---

## 16. Definition of Done

The implementation is considered architecturally successful when:

✅ **Stripe Adapter**
- Stripe works through the common payment adapter boundary
- Stripe adapter implements `getCapabilities()`, `getProviderId()`, `getProviderName()`
- Stripe webhooks route to `/api/billing/webhook/stripe`
- Existing Stripe tests continue to pass

✅ **Manual Adapter**
- Manual GCash works through the common payment adapter boundary
- Manual adapter implements full `BillingProviderAdapter` interface
- Payment submission UI functional
- Admin approval UI functional
- Manual payment flow end-to-end tested

✅ **Architecture**
- Subscription lifecycle remains provider-independent
- Entitlement logic remains provider-independent
- Payment history records actual provider used
- Historical payments cannot be reassigned to another provider
- Provider capabilities are represented cleanly
- Manual-review logic is reusable for future manual providers

✅ **Infrastructure**
- Provider configuration is centralized
- Provider enable/disable is possible
- Provider registry works correctly
- Webhook processing is provider-specific but normalized before reaching core billing
- Payment records are created for all providers

✅ **UI**
- Payment method selection UI works
- Billing dashboard shows current provider
- Provider badges display correctly
- No provider-specific hardcoded checks in UI

✅ **Background Jobs**
- Renewal reminders are not hardcoded to GCash
- Reminders check provider capabilities
- Jobs work for both Stripe and Manual providers

✅ **Testing**
- Duplicate payments safely handled
- Duplicate webhooks safely handled
- Existing billing tests pass
- New adapter tests pass
- Fake third provider can be added without modifying core subscription/entitlement logic

---

## 17. Important Non-Goals

**DO NOT:**
- Build a huge generic payment framework
- Rewrite the entire billing system unnecessarily
- Integrate every possible provider now
- Implement PayMongo just to prove the architecture
- Add unnecessary abstractions
- Duplicate subscription logic inside each adapter
- Duplicate entitlement logic inside each adapter
- Make the UI aware of provider implementation details
- Store provider credentials insecurely
- Rewrite historical payment records when a customer changes provider
- Make breaking changes to existing Stripe functionality

**The objective is simple extensibility, not maximum abstraction.**

---

## 18. Architectural Rules

### The most important rule:

> **The billing engine owns business rules. The payment adapter owns provider mechanics.**

**Business rules** (owned by billing engine):
- Subscription lifecycle (TRIAL → ACTIVE → EXPIRED → etc.)
- Entitlement activation
- Billing periods
- Trial handling
- Payment application to subscription
- Subscription extension
- Account state transitions

**Provider mechanics** (owned by adapter):
- Stripe API calls
- Stripe webhooks
- GCash payment instructions
- GCash proof submission
- GCash manual approval
- PayMongo API calls
- Provider-specific statuses
- Provider-specific references
- Provider-specific configuration

**Do not cross these boundaries unless there is a clear reason.**

---

## 19. Files Summary

### New Files (10)

1. `src/lib/billing/payment-provider-registry.ts` — Provider registry and resolution
2. `src/lib/billing/payment-provider-service.ts` — Business-level provider selection service
3. `src/lib/billing/provider-config.ts` — Centralized provider configuration
4. `src/lib/billing/adapters/manual-adapter.ts` — Manual payment adapter implementation
5. `src/lib/server-fn/submit-manual-payment.ts` — Server function for manual payment submission
6. `src/lib/server-fn/review-manual-payment.ts` — Server function for admin payment review
7. `src/routes/api/billing/webhook/-shared/handlers.ts` — Shared webhook event handlers
8. `src/routes/(private)/(dashboard)/business/billing/payment-method-setup.tsx` — Payment method selection UI
9. `src/routes/(private)/(dashboard)/business/billing/manual-payment.tsx` — Manual payment submission UI
10. `src/routes/(admin)/payment-approvals.tsx` — Admin payment approval dashboard

### Modified Files (9)

1. `prisma/base/billing.prisma` — Add Payment, PaymentAttempt, WebhookEvent models; update Business, BillingInvoice, BusinessSubscription
2. `src/lib/billing/billing-provider.ts` — Add `getCapabilities()`, `getProviderId()`, `getProviderName()` methods
3. `src/lib/billing/adapters/stripe-adapter.ts` — Implement new interface methods, write Payment records
4. `src/lib/billing/types.ts` — Add PaymentProvider, PaymentMethod, PaymentStatus enums
5. `src/lib/server-fn/create-subscription.ts` — Use `PaymentProviderService` instead of `createStripeAdapter()`
6. `src/lib/server-fn/cancel-subscription.ts` — Use `PaymentProviderService` instead of `createStripeAdapter()`
7. `src/lib/server-fn/purchase-credit-package.ts` — Use `PaymentProviderService` instead of `createStripeAdapter()`
8. `src/routes/api/billing/webhook/index.ts` — Move to `/webhook/stripe`, use shared handlers
9. `src/routes/(private)/(dashboard)/business/billing/index.tsx` — Add payment method display

### Files Requiring No Changes (6)

- `src/lib/billing/subscription-engine.ts` — Already provider-agnostic
- `src/lib/billing/credit-engine.ts` — Already provider-agnostic
- `src/lib/billing/invoice-engine.ts` — Already provider-agnostic
- `src/lib/billing/usage-engine.ts` — Already provider-agnostic
- `src/lib/entitlement/entitlement-engine.ts` — Already provider-agnostic
- `src/lib/jobs/subscription-lifecycle.ts` — No provider calls

---

## 20. Future Provider Examples

### 20.1 Adding PayMongo (Example)

**Step 1:** Implement adapter

```typescript
// src/lib/billing/adapters/paymongo-adapter.ts
export class PayMongoAdapter implements BillingProviderAdapter {
  async createSubscription(...) { /* PayMongo API calls */ }
  async verifyWebhookSignature(...) { /* PayMongo webhook verification */ }
  // ... etc
}
```

**Step 2:** Register provider

```typescript
// src/lib/billing/payment-provider-registry.ts
paymentProviderRegistry.register('paymongo', createPayMongoAdapter(), {
  providerId: 'paymongo',
  displayName: 'PayMongo',
  isEnabled: !!process.env['PAYMONGO_SECRET_KEY'],
  requiresApproval: false,
  availableInCountries: ['PH'],
})
```

**Step 3:** Add webhook route

```typescript
// src/routes/api/billing/webhook/paymongo/index.ts
export const Route = createFileRoute('/api/billing/webhook/paymongo/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const adapter = createPayMongoAdapter()
        const event = await adapter.verifyWebhookSignature(...)
        
        // Use shared handlers
        const result = await handlePaymentSucceeded(event)
        
        return Response.json(result)
      },
    },
  },
})
```

**Step 4:** Configuration

```bash
PAYMONGO_SECRET_KEY=sk_test_xxx
PAYMONGO_PUBLIC_KEY=pk_test_xxx
PAYMONGO_PLAN_STARTER_PRICE_ID=price_xxx
```

**No changes needed to:**
- Subscription engine
- Entitlement engine
- Billing UI (automatically shows new provider)
- Background jobs
- Core business logic

---

## 21. Risk Assessment

### 21.1 Known Risks

**Risk 1: Race Conditions in Manual Payment Approval**
- **Impact:** Medium — Duplicate approvals could double-activate subscription
- **Mitigation:** Use database transactions with row locks, check payment status before approval
- **Priority:** Phase 5

**Risk 2: Webhook Delivery Failures**
- **Impact:** High — Subscription not activated if webhook lost
- **Mitigation:** Webhook idempotency via `WebhookEvent` table, Stripe automatic retries, manual reconciliation job
- **Priority:** Phase 4

**Risk 3: Provider Configuration Errors**
- **Impact:** Medium — Incorrect price IDs cause payment failures
- **Mitigation:** Validation at startup, comprehensive error messages, configuration documentation
- **Priority:** Phase 2

**Risk 4: Historical Data Integrity**
- **Impact:** High — Losing payment provider information breaks accounting
- **Mitigation:** Immutable Payment records with provider field, never update provider after creation
- **Priority:** Phase 2

**Risk 5: Provider Switching Confusion**
- **Impact:** Low — Users may not understand why payment method changed
- **Mitigation:** Clear UI messaging, provider badges, email notifications
- **Priority:** Phase 6

### 21.2 Mitigations Applied

✅ **Provider Isolation:** Each adapter is isolated; bugs in one provider don't affect others
✅ **Immutable Payment Records:** Provider field is permanent; historical data integrity preserved
✅ **Capability-Based UI:** UI adapts to provider capabilities; no hardcoded assumptions
✅ **Idempotency:** Webhooks, payment approval, subscription activation all idempotent
✅ **Gradual Rollout:** Feature flags allow phased deployment with rollback capability

---

## 22. References

### Related Documents
- `XENDIT_ARCHITECTURE.md` — Similar multi-provider architecture for Xendit (can be merged into this architecture)
- `payment-engine.md` — PaymentEngine implementation (precursor to this architecture)
- `v1-master-plan.md` — Overall billing system architecture
- `BILLING_STATE_MACHINE.md` — Subscription lifecycle state machine

### External Resources
- [Stripe API Documentation](https://stripe.com/docs/api)
- [PayMongo API Documentation](https://developers.paymongo.com)
- [Xendit API Documentation](https://developers.xendit.co)

---

**Last Updated:** August 28, 2026  
**Version:** 1.0  
**Status:** Architecture Design - Ready for Implementation  
**Author:** Architecture Team  
**Reviewers:** Development Team, Product Team

---

## Appendix A: GCash Manual Payment Specification

The manual GCash payment system requirements (from `GCASH-PAYMENT-SYSTEM.md`) are fully incorporated into this architecture as the first implementation of the `ManualPaymentAdapter`.

**Key Requirements Preserved:**
- User submits payment proof (screenshot)
- Optional reference number and notes
- Admin reviews and approves/rejects
- Subscription activates on approval
- Monthly renewal reminders for manual payments
- Payment history and audit trail
- Duplicate submission prevention

**Key Changes from Original Spec:**
- Uses generic `Payment` model instead of `ManualPaymentRequest`
- Uses `PaymentStatus` enum instead of `ManualPaymentStatus`
- Provider-agnostic architecture allows future manual methods
- Configuration moved to centralized `provider-config.ts`
- Webhook architecture supports multiple providers (though Manual doesn't use webhooks)

All functional requirements from the original GCash spec are preserved and enhanced through the multi-provider architecture.
