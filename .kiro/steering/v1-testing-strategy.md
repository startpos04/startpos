---
inclusion: always
---

# V1 Testing Strategy — Business Confidence Pyramid

This steering file establishes the testing strategy for Start POS V1 launch. It builds on the existing testing patterns with specific focus on business-critical scenarios that answer: **"Can I confidently put this in a real business?"**

## The Three-Layer Strategy

```
                 ┌─────────────────┐
                 │      E2E        │  <-- Business flows
                 │ Business flows  │      "Can customer 
                 │ "Can customer   │       actually use it?"
                 │ actually use it?"│
                 └────────┬────────┘
                          │
                 ┌────────▼────────┐
                 │   Integration   │  <-- Systems working
                 │ Systems working │      together
                 │ together        │
                 └────────┬────────┘
                          │
                 ┌────────▼────────┐
                 │      Unit       │  <-- Business rules
                 │ Business rules  │      & edge cases
                 │ & edge cases    │
                 └─────────────────┘
```

You're not choosing one layer. You're building all three because each gives you a **different kind of confidence**.

## Layer 1: Unit Tests — Prove the Logic

**Purpose:** Validate business rules, calculations, and edge cases in isolation.  
**Confidence:** "The math is correct."

### V1 Priority Areas (Pattern A)

**Business Logic Engines:**
- `EntitlementEngine` — capability evaluation logic
- `SubscriptionEngine` — status transitions (TRIAL → ACTIVE → EXPIRED)  
- `CreditEngine` — balance calculations, deductions, refunds
- `PriceEngine` — tax calculations, discount applications
- `InventoryEngine` — stock calculations, movement tracking
- `UsageCounter` — transaction limits, period resets
- `BOS CapabilityResolver` — adaptive capability assignment

**Critical Calculations:**
```ts
// Example: Credit deduction edge cases
it('prevents negative balance when concurrent deductions exceed available credits', () => {
  const snapshot = { balanceAfter: 5 }
  const result1 = CreditEngine.canDeduct(snapshot, 3) // true
  const result2 = CreditEngine.canDeduct(snapshot, 4) // true
  // But only ONE should actually succeed
  expect(result1.available && result2.available).toBe(false) // R2 race condition
})
```

**Configuration Consistency:**
- Trial limits match across seeders, UI copy, and business logic
- Plan entitlements are correctly applied
- System config defaults are valid

### Unit Test Rules for V1

1. **Test edge cases that could break real businesses:**
   - Zero/negative quantities
   - Concurrent operations
   - Boundary conditions (exactly at limit)
   - Configuration edge cases

2. **Test configuration consistency:**
   - Constants match between files
   - Business rules align with marketing copy
   - Default values are sensible

3. **Focus on financial accuracy:**
   - Tax calculations are precise
   - Credit/transaction accounting is exact
   - Pricing calculations handle edge cases

## Layer 2: Integration Tests — Prove Systems Work Together

**Purpose:** Validate that engines + database + business logic cooperate correctly.  
**Confidence:** "The parts work together without data corruption."

### V1 Priority Flows (Pattern C1/C2)

**Registration & Onboarding:**
```ts
describe('Complete Registration Flow', () => {
  it('creates trial subscription with correct limits and grants complimentary credits', () => withRollback(async () => {
    // Tests: User → Business → Branch → Subscription → Credits in one transaction
    // Verifies: FK constraints, unique constraints, transaction atomicity
  }))
})
```

**Core POS Operations:**
- **Transaction Creation:** Product → Order → Payment → Transaction → Receipt → Inventory update
- **Credit Deduction:** Transaction cost → Credit balance update → Usage counter increment
- **Inventory Movement:** Sale → Stock reduction → Movement record → Low stock alert
- **Refund Processing:** Transaction reversal → Inventory adjustment (no credit restoration per business policy)

**Subscription Lifecycle:**
- **Trial → Paid:** Status transition + capability changes + usage counter reset
- **Payment Failure:** Grace period → Warning notifications → Access restriction
- **Webhook Processing:** Stripe event → Subscription update → Capability refresh

**Multi-System Coordination:**
- **Purchase → GRN → Inventory:** Purchase approval → Goods receipt → Stock increase
- **Task → Approval → Execution:** Task creation → Supervisor approval → Inventory effect
- **BOS Recalculation:** Characteristic change → Capability re-evaluation → UI update

### Integration Test Rules for V1

1. **Test real database constraints:**
   - FK violations are handled gracefully
   - Unique constraints prevent duplicates
   - Transactions roll back correctly on errors

2. **Test cross-system data flow:**
   - Webhook → Database → UI state consistency
   - Background jobs update the right records
   - Notifications fire for the right events

3. **Test business-critical atomicity:**
   - Payment + subscription update happen together or not at all
   - Sale + inventory + credit deduction are atomic
   - Approval + status change + notification are consistent

## Layer 3: E2E Tests — Prove Customer Journey

**Purpose:** Validate complete customer workflows from browser perspective.  
**Confidence:** "A real customer can accomplish their business goals."

### V1 Critical Journeys (Playwright)

**New Customer Success Path:**
```
Register → Verify → Onboarding → Business Setup → Create Product → Open Shift → Make Sale → Print Receipt → Verify Data
```

**Daily Operations Path:**
```
Login → Open Shift → Process Orders → Handle Refund → Reconcile Cash → Close Shift → View Reports
```

**Business Growth Path:**
```
Trial Usage → Upgrade → Add Employee → Configure Branches → Purchase Inventory → Generate Reports
```

**Error Recovery Paths:**
```
Payment Failed → Grace Period → Update Payment → Access Restored
Inventory Empty → Restock → Purchase Approval → Goods Receipt → Stock Available
```

### E2E Test Rules for V1

1. **Test real business scenarios:**
   - Multiple products in one transaction
   - Split payments across methods
   - Employee role restrictions in practice
   - Multi-branch inventory coordination

2. **Test error conditions customers will encounter:**
   - Network failures during checkout
   - Browser refresh during critical operations
   - Concurrent user actions
   - Subscription expiration during active use

3. **Test the complete value delivery:**
   - Customer can accomplish their core business objective
   - Data integrity is maintained through the entire flow
   - No broken links or dead ends in critical paths

## V1 Test Coverage Requirements

### Must Test (Launch Blockers)
- **POS Transaction Flow** — End-to-end sale with receipt printing
- **Credit Deduction Accuracy** — Exact accounting, no double-deduction
- **Subscription Trial → Paid** — Seamless upgrade without data loss  
- **Inventory Consistency** — Sale → Stock reduction → Movement tracking
- **Employee Role Enforcement** — Cashier cannot access admin functions
- **Refund Correctness** — Inventory adjustment without credit restoration (per business policy)

### Should Test (Quality Assurance)
- **Webhook Recovery** — Failed webhook retries and eventual consistency
- **Concurrent User Actions** — Multiple employees using same branch
- **Edge Case Handling** — Zero quantities, negative adjustments, boundary conditions
- **Onboarding Variations** — Different business types get appropriate capabilities
- **Report Accuracy** — Sales reports match transaction totals

### Nice to Test (Future Confidence)
- **Performance Under Load** — Multiple transactions per minute
- **Browser Compatibility** — Critical flows work in common browsers
- **Offline Recovery** — Graceful handling when network is unreliable
- **Data Export Accuracy** — CSV exports match database state

## V1 Test Organization

### File Structure
```
__tests__/
├── unit/
│   ├── lib/
│   │   ├── billing/           # CreditEngine, SubscriptionEngine, PriceEngine
│   │   ├── entitlement/       # EntitlementEngine, capability resolution
│   │   └── inventory/         # InventoryEngine, movement calculations
│   └── routes/                # UI copy consistency, form validation
├── integration/
│   ├── registration/          # Complete signup → trial → onboarding
│   ├── pos/                   # Transaction creation, credit deduction
│   ├── billing/               # Subscription lifecycle, webhooks
│   └── inventory/             # Purchase → GRN → stock updates
└── e2e/
    ├── customer-journey/      # New customer → first sale
    ├── daily-operations/      # Employee workflows
    └── admin-management/      # Business configuration
```

### Test Naming Convention

**Unit Tests:** `<engine-name>.<method>.test.ts`
- `credit-engine.deduct.test.ts`
- `entitlement-engine.check.test.ts`
- `subscription-engine.transition.test.ts`

**Integration Tests:** `<feature-area>.<operation>.integration.test.ts`
- `registration.complete-signup.integration.test.ts`
- `pos.create-transaction.integration.test.ts`
- `billing.subscription-lifecycle.integration.test.ts`

**E2E Tests:** `<user-goal>.spec.ts`
- `first-sale.spec.ts`
- `daily-operations.spec.ts`
- `subscription-upgrade.spec.ts`

## When to Write Each Layer

### Development Phase (Feature Building)
1. **Start with Unit Tests** — Test business logic as you build it
2. **Add Integration Tests** — Once feature works manually, test system interactions
3. **Add E2E Tests** — After integration tests pass, verify user experience

### Bug Fix Phase
1. **Reproduce in lowest possible layer** — Unit if possible, integration if needed
2. **Fix the code** — Minimum change to make test pass
3. **Verify no regression in higher layers** — Run integration and E2E to confirm

### Pre-Launch Phase (V1 Readiness)
1. **Audit critical journeys** — Every customer success path has E2E coverage
2. **Audit edge cases** — Financial operations have comprehensive unit coverage
3. **Audit system boundaries** — External service integration has integration coverage

## V1 Success Metrics

**Unit Test Success:**
- All business logic engines have >90% branch coverage
- Edge cases that could cause financial errors are tested
- Configuration consistency is validated

**Integration Test Success:**
- All critical multi-system flows are tested
- Database constraints and transactions are verified
- External service boundaries are properly mocked

**E2E Test Success:**
- New customer can complete first sale within 10 minutes
- Employee can process 10 transactions without errors
- Admin can configure business and see accurate reports

**Overall Success:**
- Test suite runs in <5 minutes (unit + integration)
- E2E suite runs in <15 minutes
- Zero false positives (tests don't fail when code is correct)
- High confidence: "We can put this in front of real businesses"

---

## Quick Reference: Which Test Type?

```
Building a new calculation engine?           → Unit Test (Pattern A)
Wiring engine + database together?           → Integration (Pattern C1)
Testing Stripe webhook handling?             → Integration (Pattern C2)
Validating a complete user workflow?         → E2E Test
Reproducing a customer-reported bug?         → Start with lowest layer that reproduces
Adding a new field to a form?                → Unit Test for validation, E2E for UX
Changing subscription status logic?          → Unit + Integration + E2E (all layers)
```

**Golden Rule:** Every customer-facing feature needs all three layers. Every business-critical calculation needs bulletproof unit tests. Every multi-system interaction needs integration verification.