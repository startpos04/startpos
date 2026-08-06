# Capability Guide

**For:** Developers adding, modifying, or understanding capabilities in the BOS (Business Operating System).  
**Version:** 1.0 — August 2026

---

## What is a capability?

A capability is a named business function that the platform can enable, recommend, pause, or retire for a specific business. Examples: `MANAGE_INVENTORY`, `CREATE_ORDER`, `APPROVAL_WORKFLOW`.

Three things a capability governs:
1. **When to configure it** — `required()` and `boosters[]` determine whether a business needs this function.
2. **What to apply when it is enabled** — `outputs()` writes the `SystemConfig` keys that activate the feature.
3. **How to undo it** — `rollbackOutputs()` reverses those config keys when the capability is paused.

A capability does **not** govern runtime access. Whether a user can reach a screen at runtime is the job of the **EntitlementEngine** (subscription plan check), which is completely separate from this registry. Never consult the BOS registry during a runtime access check.

---

## Three-step registration

### Step 1 — Add the capability to `CAPABILITY_REGISTRY`

File: `src/lib/onboarding/capability-registry.ts`

Add one entry to the `CONDITIONAL` array (or `ALWAYS_ON` if the capability applies to every business). The complete `CapabilityDefinition` shape is in `src/lib/onboarding/types.ts`. Every field is required.

```ts
{
  id: 'LOYALTY_POINTS',
  label: 'Loyalty Points',
  description: 'Award and redeem points at checkout.',
  category: 'CRM',

  // required(): the gate — must this capability exist for this business at all?
  // Return true = the capability is relevant; false = never surface it.
  required: (c) => c.tracksCustomers,

  // boosters[]: factors that raise the recommendation score.
  // label is shown as the "why is this shown?" reason in the UI.
  boosters: [
    { label: 'tracks customers', signal: (c) => c.tracksCustomers ? 0.9 : 0 },
    { label: 'high transaction volume', signal: (c) => c.dailyTransactionVolume === 'high' ? 0.7 : 0 },
    { label: 'loyalty intent', signal: (c) => c.hasLoyaltyIntent ? 1.0 : 0 },
  ],

  // threshold: minimum recommendationScore() return value to surface as RECOMMENDED.
  // 0 = always surface if required() is true.
  threshold: 0.4,

  // outputs(): SystemConfig keys written when the capability is enabled.
  outputs: () => [{ key: 'ENABLE_LOYALTY', value: 'true' }],

  // rollbackOutputs(): reverses outputs() when the capability is paused.
  rollbackOutputs: () => [{ key: 'ENABLE_LOYALTY', value: 'false' }],

  deferrable: true,

  // configuredSignal(): returns true when the business has genuinely used this capability.
  // When true, state advances ENABLED → CONFIGURED automatically.
  configuredSignal: (s) => (s.customerCount ?? 0) >= 20,

  estimatedSetupMinutes: 10,
  isComplex: false,
  businessValue: 'Keep customers coming back with points they can redeem at checkout.',
  hardDependencies: ['COMPLETE_CHECKOUT'],
  relatedCapabilities: [],
  conflicts: [],
  minimumPlan: 'Premium',

  // recommendationScore(): composite signal score (0.0–1.0).
  // Used as the "relevance" factor (40% weight) in RecommendationEngine scoring.
  recommendationScore: (c) => c.hasLoyaltyIntent ? 1.0 : c.tracksCustomers ? 0.6 : 0,
},
```

### Step 2 — Add the feature to the Feature seeder

File: `prisma/seed/features.ts` (or the equivalent seeder in your project).

Every capability ID must correspond to a `Feature` row. Without this, the entitlement system cannot reference the capability and the runtime access check will fail.

```ts
{ key: 'LOYALTY_POINTS', name: 'Loyalty Points', description: '...' }
```

### Step 3 — Add a `PlanEntitlement` row

File: `prisma/seed/plan-entitlements.ts` (or equivalent).

Decide which subscription plans include this capability. The `minimumPlan` field in the registry is documentation only — the actual enforcement is in the `PlanEntitlement` table.

```ts
{ planName: 'Premium', featureKey: 'LOYALTY_POINTS', usageLimit: null }
```

After these three steps, run `pnpm prisma db seed` and the capability is live.

---

## Worked example: `LOYALTY_POINTS`

Suppose you are adding a loyalty-points capability that should:
- Appear for businesses that track customers
- Score higher when the business has stated loyalty intent
- Enable when the `Premium` plan is active
- Apply config key `ENABLE_LOYALTY=true` on enable
- Advance to CONFIGURED once the business has 20+ customers

**1. Registry entry** — see the full example above in Step 1.

**2. Feature seeder** — add one row:
```ts
{ key: 'LOYALTY_POINTS', name: 'Loyalty Points', description: 'Award and redeem points at checkout.' }
```

**3. PlanEntitlement seeder** — gate to Premium:
```ts
{ planName: 'Premium', featureKey: 'LOYALTY_POINTS' }
```

**4. Run and verify:**
```bash
pnpm prisma db seed
pnpm test  # registry-validation.test.ts catches broken deps and cycles
```

**5. Manual check** — create a business with `tracksCustomers: true` and `hasLoyaltyIntent: true`. The recommendation engine should surface `LOYALTY_POINTS` as a high-importance recommendation. Verify in the app under Settings → Capabilities.

---

## Where to find the tests

| What you want to test | Pattern | Location |
|---|---|---|
| The registry itself (no broken deps, no cycles) | Pattern A | `__tests__/unit/lib/onboarding/registry-validation.test.ts` |
| `required()` and `recommendationScore()` for a capability | Pattern A | `__tests__/unit/lib/evolution/recommendation-engine.test.ts` |
| `outputs()` / `rollbackOutputs()` applied via CapabilityControl | Pattern B | `__tests__/unit/lib/evolution/capability-control.test.ts` |
| `configuredSignal()` advancing ENABLED → CONFIGURED | Pattern A | `__tests__/unit/lib/evolution/configured-signal.test.ts` |
| Full recommendation pipeline (DB-backed) | Pattern C1 | `__tests__/integration/` |

When you add a capability, the minimum test requirement is:
- One `registry-validation.test.ts` run (already covers all capabilities — no new test needed unless you add a new validation rule)
- One Pattern A test confirming `required()` returns the right value for your trigger condition
- One Pattern A test confirming `recommendationScore()` returns a value above `threshold` when the target signals are present

---

## Important: EntitlementEngine is separate from the BOS Registry

The `CAPABILITY_REGISTRY` controls **setup-time configuration** (what gets enabled for a business and when).

The `EntitlementEngine` controls **runtime access** (whether a user can perform an action right now, based on their subscription plan).

These are two different questions. Never call the EntitlementEngine from inside a capability definition. Never consult the BOS Registry from inside a runtime access check. The boundary is enforced by the architecture compliance checklist run at the end of every phase.

---

## Common mistakes

**Missing `rollbackOutputs`.**  
Every capability must have `rollbackOutputs()` defined — even if it just returns `[]`. The pause operation calls it. If it is missing, the registry validation test will fail.

**Putting logic in `outputs()` that reads from the DB.**  
`outputs()` is a pure function. It receives `BusinessCharacteristics` only. If you need a DB value, read it in the Application Layer and pass it through characteristics or use a separate server function.

**Registering a capability without a Feature seeder entry.**  
The capability will appear in Settings → Capabilities but the EntitlementEngine will not find a matching feature, producing a runtime error. Always do all three steps.

**Using `isComplex: true` for capabilities with setup time < 30 minutes.**  
`isComplex` affects how the UI presents the capability to the user. Reserve it for capabilities that genuinely require multiple configuration steps (e.g. multi-branch setup, external integrations).

**Overlapping `required()` gates without `hardDependencies`.**  
If capability B only makes sense when capability A is already enabled, declare it in `hardDependencies: ['A']`. The recommendation engine uses this to suppress B until A is active.

---

*For architecture decisions affecting this registry, see `docs/decisions/ADR-001-replace-business-type-config.md` and the `ARCHITECTURE_REVIEW.md`.*
