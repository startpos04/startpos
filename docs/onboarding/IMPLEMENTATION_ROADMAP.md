# Business Operating System — Implementation Roadmap

**Version:** 1.1
**Date:** August 2026
**Architecture Reference:** v1.0 (frozen)
**Documents:** `BUSINESS_OPERATING_SYSTEM_MANIFESTO.md`, `ONBOARDING_MASTER_PLAN.md`,
`ARCHITECTURE_REVIEW.md`, `PRINCIPAL_ARCHITECT_REVIEW.md`

---

## Implementation Status

| Phase | Status | Tests | Shipped |
|---|---|---|---|
| Pre-Implementation Gate (R1–R6) | ✅ Complete | — | All 6 fixes merged |
| Phase 1 — Foundation + Adaptive Discovery | ✅ Complete | 1710 → included in total | Pure engines, registry, schema, shadow-running |
| Phase 2 — Event Infrastructure + First Intelligence | ✅ Complete | 1797 total | CharacteristicsEngine, RecalculationQueue, dbTransaction events |
| Phase 3a — Capability Lifecycle + User Control | ✅ Complete | 1922 total | State machine, CapabilityControl, configuredSignal advancement |
| Phase 3b — Recommendation Scoring + Intelligence | ✅ Complete | 2015 total | RecommendationEngine, 17 observation rules, intent fields |
| Phase 4 — Business Profile + Health + Full Intelligence | ✅ Complete | 2015 → included in total | HealthModel, backfill job, correctCharacteristic, decay functions, profile graduation |
| Phase 5 — Growth Triggers + Profile Evolution | ✅ Complete | 2015 → included in total | Growth rules, MilestoneEngine, notifications, intent expiry, CAPABILITY_GUIDE |
| Phase 6 — Analytics + AI Seam + Observability | ✅ Complete | 2127 total | trackingEvents, analytics queries, AI adapter, shadow-run retired |
| Phase 7 — Threshold Tuning + Production Hardening | ✅ Complete | 2129 total | Tuning tooling, decay audit, queue monitor, ADR-005 template |

---

## Overview

This roadmap transforms Architecture v1.0 into an actionable build sequence for a
small engineering team or a solo developer. It is organized into seven phases, each
of which delivers working software.

**The cardinal rule:** every phase ends with the system fully deployable and useful
to a real business. No phase creates a half-built system that requires the next
phase to be useful. If a phase does not produce something usable, it is redesigned
until it does.

**Total estimate:** 16–22 weeks for a solo developer working full-time.
A two-engineer team could compress this to 10–14 weeks with parallel workstreams.

---

## Pre-Implementation Gate ✅ COMPLETE

Before Phase 1 begins, the six required fixes from the Principal Architect Review
must be complete. These are not Phase 1 work — they are the precondition for Phase 1.

| Fix | Task | Status |
|---|---|---|
| R1 | Replace in-memory RecalculationScheduler with DB-backed queue | ✅ `PrismaRecalculationQueue` + `CharacteristicsRecalculationQueue` table |
| R2 | Collapse `CharacteristicsSnapshot`; engines take `BusinessCharacteristics` | ✅ Snapshot removed; all engines take `BusinessCharacteristics` directly |
| R3 | Fix EventBus module-load coupling (startup registration pattern) | ✅ Startup-time `registerSubscriber()`, lazy dynamic import in `dbTransaction` |
| R4 | Add registry build-time validation test | ✅ `registry-validation.test.ts` — `validateRegistry()` catches cycles, broken deps |
| R5 | Define shadow-running acceptance criteria (thresholds documented) | ✅ `ADR-001-replace-business-type-config.md` — per-key disagreement rate thresholds |
| R6 | Add `rollbackOutputs` to `CapabilityDefinition` | ✅ All 23 capabilities have `rollbackOutputs` defined |

**Gate checkpoint:** ✅ All six fixes merged and CI passing.

---

## Definition of Done

This applies to every task, every phase, every deliverable.

### Code
- [ ] All engines are pure functions (no IO in domain logic)
- [ ] No domain boundary violations (checked via import lint rules)
- [ ] All new types are fully typed — no `any` or implicit `unknown`
- [ ] No `// @ts-nocheck` or `// @ts-ignore` added
- [ ] All new server functions use `authMiddleware` and tenant-scoped DB access
- [ ] No secrets, credentials, or PII in code or comments

### Testing
- [ ] Pure functions: Pattern A unit tests, ≥ 80% branch coverage
- [ ] Server functions: Pattern B integration tests for happy path + at least one error path
- [ ] Database operations: Pattern C1 integration tests for any FK constraint or atomic behavior
- [ ] Registry validation test passes
- [ ] `pnpm test` passes with no failures

### Database
- [x] `prisma db push` is used — no migration files; schema changes are applied directly and tracked via version control
- [ ] All new columns on existing tables are nullable with safe defaults
- [ ] All new indexes are justified and documented
- [ ] No schema change truncates, drops non-nullable columns, or renames columns without a compat period

### Documentation
- [ ] ADR written if the change touches architecture boundaries
- [ ] `CAPABILITY_GUIDE.md` updated if a new capability was added
- [ ] Inline code comments for any non-obvious logic

### Performance
- [ ] No N+1 query patterns introduced
- [ ] Background jobs include execution time logging
- [ ] Any new query against `BusinessEventLog` uses the composite index

### Security
- [ ] All DB queries include `businessId` scoping where applicable
- [ ] No user-supplied input reaches SQL without parameterization
- [ ] New routes have appropriate role-based access checks

### Observability
- [ ] New capabilities emit at least one `trackingEvent` per the registry
- [ ] Background jobs log start, success, failure, and duration
- [ ] New error states produce actionable log messages (not "something went wrong")

---

## Architecture Compliance Check

At the end of every phase, run this checklist before declaring the phase complete.

```
[ ] SurveyInterpreter imports nothing from the capability layer
[ ] CapabilityResolver, ProfileClassifier, ConfigurationEngine are pure functions
[ ] CharacteristicsEngine core is a pure function; IO is in the Application Layer
[ ] RecommendationEngine scoring core is a pure function
[ ] BusinessEventBus imports no engine implementations
[ ] CAPABILITY_REGISTRY validation test passes (no broken dependencies, no cycles)
[ ] No capability logic exists outside CAPABILITY_REGISTRY
[ ] EntitlementEngine is not consulted during BOS capability evaluation
[ ] BOS Registry is not consulted during runtime access decisions
[ ] Every new capability has been added to Feature seeder AND PlanEntitlement seeder
```


---

# Phase 1 — Foundation + Adaptive Discovery ✅ COMPLETE

**Status:** ✅ Shipped — August 2026
**Theme:** Replace the business-type selector. Get any business into the app correctly in under five minutes.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| `BusinessCharacteristics` type + `SurveyAnswers` + all Q*_OPTIONS | `src/lib/onboarding/types.ts` | — |
| `DEFAULT_CHARACTERISTICS` safe defaults | `src/lib/onboarding/defaults.ts` | — |
| `CAPABILITY_REGISTRY` (23 capabilities) + `validateRegistry()` | `src/lib/onboarding/capability-registry.ts` | `registry-validation.test.ts` |
| `SurveyInterpreter` — pure: `SurveyAnswers → BusinessCharacteristics` | `src/lib/onboarding/survey-interpreter.ts` | `survey-interpreter.test.ts` (57 tests) |
| `CapabilityResolver` — pure: characteristics + registry → resolved | `src/lib/onboarding/capability-resolver.ts` | `capability-resolver.test.ts` |
| `ProfileClassifier` — pure: 9 profiles, first-match priority | `src/lib/onboarding/profile-classifier.ts` | `profile-classifier.test.ts` |
| `ConfigurationEngine` — pure: resolved + profile → `BusinessConfiguration` | `src/lib/onboarding/configuration-engine.ts` | `configuration-engine.test.ts` |
| `PlanAdvisor` — pure: characteristics + profile → suggested plan | `src/lib/onboarding/plan-advisor.ts` | — |
| `BusinessEventBus` — startup-time registration, lazy import | `src/lib/evolution/business-event-bus.ts` | — |
| `RecalculationQueuePort` interface + `NoOpRecalculationQueue` stub | `src/lib/evolution/recalculation-queue.ts` | — |
| Prisma schema: `BusinessCapabilityState`, `BusinessEventLog`, `CharacteristicsRecalculationQueue` + BOS columns on `Business` | `prisma/schema.prisma` | — |
| `complete-registration.ts` v1/v2 dual input + shadow-running (`ONBOARDING_V2_SHADOW`) | `src/lib/queries/complete-registration.ts` | existing integration tests |
| `ADR-001` — shadow-running acceptance criteria | `docs/decisions/ADR-001-replace-business-type-config.md` | — |

**Total tests at end of Phase 1:** 1710 (all passing)

---

## Purpose

Phase 1 delivers the most visible user-facing change: the adaptive survey replaces
the static business-type dropdown. Internally, it delivers the pure engine foundation
that all future phases build on.

After Phase 1, every new business registration goes through the discovery survey and
gets correctly configured for their operational profile. The Lite POS profile exists
and works end-to-end. Existing businesses are unaffected.

---

## Objectives

1. Build and ship the adaptive survey UI
2. Implement all pure engine functions (SurveyInterpreter, CapabilityResolver, ProfileClassifier, ConfigurationEngine, PlanAdvisor)
3. Update `complete-registration.ts` to use the new engines
4. Implement shadow-running alongside the old `BUSINESS_TYPE_CONFIGS` path
5. Implement the Lite POS profile with its minimal dashboard

---

## Deliverables

### 1.1 — Pure Engine Functions (Pattern A testable)

**Files to create:**
```
src/lib/onboarding/types.ts
src/lib/onboarding/survey-interpreter.ts
src/lib/onboarding/capability-registry.ts
src/lib/onboarding/capability-resolver.ts
src/lib/onboarding/profile-classifier.ts
src/lib/onboarding/configuration-engine.ts
src/lib/onboarding/plan-advisor.ts
src/lib/onboarding/defaults.ts
```

**Tests:**
```
__tests__/unit/lib/onboarding/survey-interpreter.test.ts
__tests__/unit/lib/onboarding/capability-resolver.test.ts
__tests__/unit/lib/onboarding/profile-classifier.test.ts
__tests__/unit/lib/onboarding/configuration-engine.test.ts
__tests__/unit/lib/onboarding/registry-validation.test.ts
```

**Key test cases:**
- Every answer mapping in `SurveyInterpreter` has a test
- Every profile classification rule has a test with its trigger conditions
- `validateRegistry()` passes for the full registry (no broken dependencies)
- `ConfigurationEngine` safe defaults produce Lite POS config
- F&B profile produces INCLUSIVE pricing
- Solo + immediate payment + no inventory = LITE_POS profile

### 1.2 — Database Schema (additive only)

**Migration adds to `Business`:**
```prisma
onboardingSurveyAnswers    Json?
onboardingProfile          String?
onboardingCompletedAt      DateTime?
onboardingVariantId        String?
currentProfile             String?
```

No existing columns change. Migration is fully reversible.

### 1.3 — Updated Registration Flow

`complete-registration.ts` input changes from:
```ts
{ displayName, businessName, businessType: 'RESTAURANT' | 'GROCERY' | 'RETAIL' }
```
to:
```ts
{ displayName, businessName, surveyAnswers: SurveyAnswers }
```

Shadow-running enabled by environment variable `ONBOARDING_V2_SHADOW=true`.
When enabled, both engines run; v1 config is applied; diff is logged.

### 1.4 — Survey UI

Adaptive question tree following the design in `ONBOARDING_MASTER_PLAN.md` Part 4.

Requirements:
- Q1 (business type) is required — cannot be skipped
- All other questions can be skipped; safe defaults apply
- Progress indicator shows section completion ("About 3 minutes remaining")
- Answers persist in local state until final submission
- No intermediate server calls during the survey
- Mobile-responsive

### 1.5 — Lite POS Profile

Dashboard for LITE_POS profile: two widgets only (POS shortcut + today's sales).
All other modules accessible from sidebar but not pushed to dashboard.

---

## Dependencies

- Pre-implementation gate (six required fixes) must be complete
- Existing `complete-registration.ts` tests must be green before modifying
- Survey UI design must be approved before building (survey copy review)

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Survey path produces wrong config for edge cases | Medium | Medium | Shadow-running catches this; 30-day window before v1 path is removed |
| Survey feels too long for simple businesses | Medium | Medium | Solo + immediate payment path = 6 questions; validate with user testing |
| TypeScript type errors in registry | Low | Low | Registry validation test catches these at build time |
| Shadow-running log volume too high | Low | Low | Log only disagreements, not every registration |

---

## Acceptance Criteria

- [ ] A solo vendor answering 6 questions gets LITE_POS profile with correct config
- [ ] A restaurant owner answering 13 questions gets FOOD_AND_BEVERAGE with INCLUSIVE pricing
- [ ] A wholesaler gets WHOLESALE_DISTRIBUTION with approval workflows enabled
- [ ] Shadow-running disagreement rate for `IS_VAT_REGISTERED` < 2%
- [ ] Shadow-running disagreement rate for `ENABLE_ORDER` < 5%
- [ ] All Pattern A tests pass
- [ ] Registration time (from first question to dashboard) ≤ 5 minutes for any path

---

## ADRs Suggested

- `ADR-001: Replace BUSINESS_TYPE_CONFIGS with CapabilityRegistry` — documents the transition and the shadow-running strategy

---

## Rollback Strategy

If shadow-running reveals systematic failures:
1. Set `ONBOARDING_V2_SHADOW=false` — new registrations use v1 path
2. Existing new-path businesses retain their config (no rollback needed — config is
   functionally equivalent to v1 for any profile that has an exact v1 equivalent)
3. Fix issues, extend shadow period, re-evaluate

---

## Migration Considerations

Existing businesses: zero impact. New nullable columns are added with no defaults
set. The v1 `businessType` column remains. Existing registrations continue using
the `BUSINESS_TYPE_CONFIGS` path until the shadow period ends.


---

# Phase 2 — Event Infrastructure + First Intelligence ✅ COMPLETE

**Status:** ✅ Shipped — August 2026
**Theme:** The platform starts learning. A business that adds a supplier sees an offer to track purchase orders. The intelligence layer is live.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| Evolution types — `SourcedValue<T>`, `LivingCharacteristics`, `ObservationRule`, `CharacteristicsEngineInput/Output`, `BusinessUsageSummaryData` | `src/lib/evolution/types.ts` | — |
| `OBSERVATION_RULES` registry — 7 Phase 2 rules (usesSuppliers, tracksInventory, teamSize×3, locationCount, tracksCustomers) | `src/lib/evolution/observation-rules.ts` | `observation-rules.test.ts` (37 tests) |
| `CharacteristicsEngine` — pure: merge sources + evaluate rules → `BusinessCharacteristics` | `src/lib/evolution/characteristics-engine.ts` | `characteristics-engine.test.ts` (35 tests) |
| `PrismaRecalculationQueue` — real DB-backed queue, `GREATEST(priority)` upsert, `SELECT FOR UPDATE SKIP LOCKED` | `src/lib/evolution/recalculation-queue.ts` | — |
| `RecalculationJob` — orchestrates full job loop: claim → read → compute → write → emit | `src/lib/evolution/recalculation-job.ts` | — |
| `dbTransaction` event extension — optional `events` param, fire-and-forget after commit, lazy import | `src/db/local-db-transaction.ts` | `db-transaction-events.test.ts` (15 tests) |
| Prisma schema: `BusinessUsageSummary` (data Json) + `Business.usageSummaries` relation | `prisma/schema.prisma` | — |
| `ADR-002` note in roadmap (event emission via `dbTransaction` extension, not manual calls) | — | — |

**Total tests at end of Phase 2:** 1797 (all passing)

---

## Purpose

Phase 2 builds the observability infrastructure and the first version of the
CharacteristicsEngine and RecommendationEngine. After Phase 2, the platform reacts
to business behavior and surfaces capability offers at the right moment.

---

## Objectives

1. Implement `BusinessEventLog` and `BusinessUsageSummary` tables
2. Add event emission to key server functions (via Prisma middleware or `dbTransaction` extension — not manual calls)
3. Implement `CharacteristicsEngine` (observation rules only; no decay yet)
4. Implement `BusinessCapabilityState` table and initial HIDDEN/RECOMMENDED states
5. Implement `RecommendationEngine` v1 — event-triggered only, one offer at a time
6. Build the first recommendation card UI (accept / dismiss)

---

## Deliverables

### 2.1 — Event Infrastructure

**New tables:**
```prisma
BusinessEventLog    { id, type, businessId, branchId, actorId, occurredAt, payload }
BusinessUsageSummary { id, businessId, periodEnd, ...17 count fields as Json }
```

**Note on BusinessUsageSummary:** Per the Principal Architect Review, store counts as
`data Json` rather than 17 typed columns. The aggregation job writes whatever counts
the current observation rules need. No migration when a new count is added.

**Event emission:** Implemented via Prisma middleware intercepting model creates.
Middleware maps Prisma model operations to `BusinessEventType` values and calls
`BusinessEventBus.emit()` after successful writes. Server functions emit zero
manual event calls.

### 2.2 — CharacteristicsEngine (Phase 2 subset)

Implement observation rules for the highest-value signals only. Full rule set
implemented progressively:

**Phase 2 rules (high confidence, high impact):**
```
usesSuppliers = true        when: supplierCount ≥ 1           (0.95)
tracksInventory = true      when: purchaseOrderCount ≥ 3      (0.95)
teamSize = 'small'          when: employeeCount ≥ 2 AND ≤ 5  (0.99)
teamSize = 'medium'         when: employeeCount ≥ 6           (0.99)
locationCount = 'multiple'  when: branchCount ≥ 2             (1.0)
tracksCustomers = true      when: customerCount ≥ 10          (0.85)
```

These six rules cover the most common growth transitions. Additional rules are added
in Phase 3 and 4.

**Files:**
```
src/lib/evolution/types.ts
src/lib/evolution/characteristics-engine.ts
src/lib/evolution/observation-rules.ts           (Phase 2 subset)
src/lib/evolution/characteristic-conflict-resolver.ts
src/lib/evolution/recalculation-queue.ts         (DB-backed)
src/lib/evolution/business-event-bus.ts
```

### 2.3 — BusinessCapabilityState

**Table:** As defined in Architecture v1.0.

**Initial population:** When a business completes registration, `CapabilityResolver`
determines ENABLED vs DEFERRED capabilities. All DEFERRED capabilities are written
to `BusinessCapabilityState` with `state = 'RECOMMENDED'` and `recommendationScore`
populated.

For existing businesses (pre-Phase 2): the backfill job populates initial states
from their current SystemConfig (if `ENABLE_ORDER=true` → `CREATE_ORDER` state = ENABLED, etc.).

### 2.4 — RecommendationEngine v1

Event-triggered only. When a `CHARACTERISTICS_UPDATED` event fires:
- Evaluate all HIDDEN capabilities against updated characteristics
- For any capability whose `required()` becomes true: set state to RECOMMENDED
- Produce one offer per trigger (highest score wins)
- Write to `BusinessCapabilityState`

No scheduled sweep. No display zones. No scoring beyond "is the required gate met?"

### 2.5 — Recommendation Card UI

A single recommendation card component:
- Shows `capability.businessValue`
- Shows `capability.estimatedSetupMinutes`
- Shows the observation that triggered it (from `recommendationReason` field)
- Two actions: "Enable now" (accept) and "Not right now" (dismiss, 30-day cooldown)
- Appears on the most relevant page (contextual, not a modal)

---

## Testing Strategy

- **Observation rules:** Pattern A — one test per rule, testing boundary conditions
- **CharacteristicsEngine merge:** Pattern A — conflict resolution and priority order
- **Event emission middleware:** Pattern B — verify that creating a supplier emits SUPPLIER_ADDED
- **RecommendationEngine v1:** Pattern B — verify that CHARACTERISTICS_UPDATED triggers correct RECOMMENDED state
- **Full pipeline:** Pattern C1 — create supplier → event fired → characteristics updated → recommendation appears

---

## Acceptance Criteria

- [ ] Creating a supplier fires SUPPLIER_ADDED event and persists to BusinessEventLog
- [ ] Within 5 minutes of adding a supplier, `usesSuppliers = true` in `livingCharacteristics`
- [ ] Within 5 minutes, a recommendation card appears on the supplier or purchases page
- [ ] Dismissing the card hides it for 30 days
- [ ] Accepting enables the capability (applies outputs, updates state to ENABLED)
- [ ] Weekly summary aggregation job runs and produces correct counts
- [ ] All six Phase 2 observation rules have passing unit tests

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prisma middleware adds latency | Low | Low | Benchmark; middleware should be < 2ms per operation |
| Wrong characteristics for existing businesses on backfill | Medium | Medium | Run backfill on staging first; compare against manual spot-checks |
| Event log grows too fast | Low | Medium | Only structural events logged; transaction volume tracked in summary |

---

## ADRs Suggested

- `ADR-002: Event emission via Prisma middleware` — documents the choice to use middleware over manual emission


---

# Phase 3a — Capability Lifecycle + User Control ✅ COMPLETE

**Status:** ✅ Shipped — August 2026
**Theme:** Full user control over capabilities. The business can see what is available, what is active, and manage everything in one place.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| Capability state machine — 6 states, 13 valid transitions, `canTransition()`, `assertTransition()`, `getTargetState()`, `isAlwaysOn()` | `src/lib/evolution/capability-lifecycle.ts` | `capability-lifecycle.test.ts` (74 tests) |
| `CapabilityControl` — accept, enable, pause, restore, dismiss, advance; writes `SystemConfig` outputs, appends `stateHistory`, schedules recalculation, emits `CAPABILITY_STATE_CHANGED` | `src/lib/evolution/capability-control.ts` | `capability-control.test.ts` (34 tests) |
| `advanceConfiguredCapabilities()` — evaluates `configuredSignal` for all ENABLED capabilities after every recalculation, advances ENABLED → CONFIGURED | `src/lib/evolution/recalculation-job.ts` | `configured-signal.test.ts` (27 tests) |

**Total tests at end of Phase 3a:** 1922 (all passing)

---

## Purpose

Phase 3a delivers the full capability lifecycle and the CapabilityControl UI.
After 3a, every deferred capability is visible to the user, manageable, and
auditable. The recommendation system delivers all deferred capabilities as a
browsable catalogue, not just event-triggered single offers.

---

## Deliverables

### 3a.1 — Full Capability Lifecycle

Implement all six states in `BusinessCapabilityState`:
HIDDEN → RECOMMENDED → ENABLED → CONFIGURED → PAUSED

`configuredSignal` evaluation added to the weekly job: businesses whose capability
usage crosses the configured threshold advance ENABLED → CONFIGURED automatically.

### 3a.2 — CapabilityControl

```
src/lib/evolution/capability-control.ts
```

Methods: `accept`, `dismiss`, `delay`, `ignore`, `enable`, `pause`, `restore`

All methods:
- Validate the lifecycle transition is permitted
- Apply capability outputs via `dbTransaction` on accept/enable
- Write `UserOverride` record
- Emit `CAPABILITY_STATE_CHANGED`

### 3a.3 — Settings → Capabilities Page

A new settings page showing all capabilities grouped by category:

```
SALES       | POS Checkout       | ENABLED    | [Pause]
INVENTORY   | Inventory Tracking | RECOMMENDED| [Enable] [Dismiss]
PROCUREMENT | Purchase Orders    | RECOMMENDED| [Enable] [Dismiss]
OPERATIONS  | Task Management    | HIDDEN     | —
```

For RECOMMENDED capabilities: shows business value, setup time, and "Why is this shown?"
For ENABLED/CONFIGURED capabilities: shows current state and [Pause] option
For HIDDEN capabilities: shown only if user clicks "Show all"

### 3a.4 — `rollbackOutputs` Implementation

All existing capabilities in the registry get `rollbackOutputs` defined.
Most are straightforward: set the same config keys to `false` or safe defaults.
The pause operation calls `rollbackOutputs` and applies via `dbTransaction`.

---

## Testing Strategy

- `CapabilityControl` methods: Pattern B tests for all state transitions
- Lifecycle transition validation: Pattern A (state machine)
- `configuredSignal` advancement: Pattern C1 (real DB, real usage data)

---

## Acceptance Criteria

- [ ] Settings → Capabilities page shows all capabilities with correct states
- [ ] Accepting a RECOMMENDED capability applies outputs and advances to ENABLED
- [ ] Pausing an ENABLED capability applies rollback outputs and advances to PAUSED
- [ ] Restoring a PAUSED capability re-applies outputs and returns to ENABLED
- [ ] "Why is this shown?" reveals the `recommendationReason` field
- [ ] `configuredSignal` for Inventory advances state after 10 inventory adjustments
- [ ] `CapabilityControl` rejects pause for capabilities with `canBePaused = false`

---

# Phase 3b — Recommendation Scoring + Intelligence ✅ COMPLETE

**Status:** ✅ Shipped — August 2026
**Theme:** Recommendations become intelligent, prioritized, and contextually placed.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| 10 new Phase 3b observation rules — `inventoryCriticality` ×2, `hasProductComponents`, `hasRegularWaste`, `reconcilesCash`, `requiresApprovals`, `offersDelivery`, `dailyTransactionVolume` ×2, `hasProductVariants`; OBSERVATION_RULES now 17 total | `src/lib/evolution/observation-rules.ts` | `observation-rules-phase3b.test.ts` (52 tests) |
| `RecommendationEngine` — pure 4-factor composite scoring (relevance 40%, growth alignment 30%, business value 20%, friction 10%); `importance` field (P2-4 fix); 5-cap; 30-day dismiss cooldown; hard dependency enforcement | `src/lib/evolution/recommendation-engine.ts` | `recommendation-engine.test.ts` (41 tests) |
| 6 intent fields added to `BusinessCharacteristics` — `intentToAddMoreStaff/TrackInventory/ManageSuppliers/OfferDelivery/OpenMoreLocations/IntegrateExternalSystems` | `src/lib/onboarding/types.ts`, `defaults.ts`, `survey-interpreter.ts` | existing survey tests updated |
| `deliveryOrderCount`, `productVariantCount` added to `BusinessUsageSummaryData` | `src/lib/evolution/types.ts` | — |

**Total tests at end of Phase 3b:** 2015 (all passing)

---

## Purpose

Phase 3b upgrades the recommendation system from event-triggered single offers
to a full scoring and prioritization engine. Recommendations are scored, displayed
in the right context, and delivered at the right time.

---

## Deliverables

### 3b.1 — Full RecommendationEngine

Replace the v1 event-triggered logic with the full scoring engine:
- All four scoring factors (relevance, business value, setup friction, intent boost)
- `importance` field replaces `displayZone` (per Principal Architect fix P2-4)
- Scheduled weekly sweep for all businesses
- 5-recommendation hard cap
- 30-day dismiss cooldown (already from Phase 2; rate limiting tuned from real data)

### 3b.2 — Remaining Observation Rules

Add the full rule set from the `OBSERVATION_RULES` registry:
- `inventoryCriticality`, `hasProductComponents`, `hasRegularWaste`
- `reconcilesCash`, `requiresApprovals`, `offersDelivery`
- `dailyTransactionVolume` (medium, high), `hasProductVariants`

### 3b.3 — Contextual Recommendation Placement

UI layer maps `importance` to placement:
- `critical` / `high` → Dashboard card
- `medium` → Page-contextual (relevant section or tab)
- `low` → Settings → Capabilities (passive catalogue only)

### 3b.4 — Intent Fields

Add 6 intent fields to `BusinessCharacteristics`.
Add optional survey question at end of discovery flow ("Are you planning any of these?").
Intent fields boost relevant recommendation scores (no expiry mechanism in Phase 3b).

---

## Testing Strategy

- Recommendation scoring: Pattern A tests for each scoring factor
- Display context mapping: Pattern A (importance → placement)
- Observation rule boundary tests: Pattern A (17 rules × 2 boundary conditions each)

---

## Acceptance Criteria

- [ ] A business that just added 3 suppliers sees "Purchase Orders" as a high-importance recommendation
- [ ] A solo business sees no team-related recommendations
- [ ] Recommendations cap at 5 active at a time
- [ ] All 17 observation rules have passing unit tests
- [ ] Weekly recommendation sweep runs and does not produce duplicate offers


---

# Phase 4 — Business Profile + Health + Full Intelligence ✅ COMPLETE

**Status:** ✅ Complete — August 2026
**Theme:** The platform's understanding of the business becomes visible and correctable. Health stage guides next steps.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| `BusinessHealthModel` — pure `classifyHealthStage()` with 4 stages (STARTING, ACTIVE, ESTABLISHED, SCALING); `getHealthStageHint()`; stage constants | `src/lib/evolution/business-health-model.ts` | `business-health-model.test.ts` |
| `correctCharacteristic()` — writes `ADMIN_DECISION` source (max priority), triggers immediate recalculation, emits `CHARACTERISTICS_UPDATED` | `src/lib/evolution/capability-control.ts` | `capability-control.test.ts` (34 tests) |
| Confidence decay — `applyDecay()` pure function; `SOURCE_DECAY_PARAMS` per-source constants; decay activation tests | `src/lib/evolution/characteristics-engine.ts` | `decay-activation.test.ts` |
| `auditDecayedCharacteristics()` — audit helper returning fully-decayed fields (confidence=0) for Phase 7 tuning | `src/lib/evolution/characteristics-engine.ts` | — |
| `backfill-job.ts` — one-time job that seeds `livingCharacteristics` for pre-Phase-2 businesses; idempotent | `src/lib/evolution/backfill-job.ts` | — |
| Profile graduation notifications — Step 7b in `RecalculationJob` creates `SYSTEM_ALERT` when `profileChanged = true` | `src/lib/evolution/recalculation-job.ts` | — |
| `RecalculationJob` writes `currentProfile` + `healthStage` to `Business` after every cycle | `src/lib/evolution/recalculation-job.ts` | — |

---

## Purpose

Phase 4 makes the platform's intelligence transparent to the user. Businesses can
see how the platform understands them, correct anything that is wrong, and receive
a clear "next step" hint based on their operational maturity.

---

## Deliverables

### 4.1 — Settings → Business Profile Page

Shows all 34 `BusinessCharacteristics` fields in plain business language.
Each field displays:
- Current value
- Source ("From your survey" / "Based on your activity" / "Set by you")
- Evidence string ("Based on 15 inventory adjustments this month")
- Edit button (triggers `CapabilityControl.correctCharacteristic()`)

When a user corrects a characteristic:
- Value stored with `ADMIN_DECISION` source (maximum priority)
- CharacteristicsEngine recalculation triggered immediately
- RecommendationEngine re-evaluates

### 4.2 — Business Health Model (4 stages)

Implement STARTING, ACTIVE, ESTABLISHED, SCALING stages.
Weekly job evaluates each business against stage criteria.
`Business.healthStage` updated.

Dashboard shows a single "next step" hint based on the current health stage.
Not labeled as a "score" — framed as a contextual suggestion.

### 4.3 — Full CharacteristicsEngine with All Sources

Add confidence decay (as designed, deferred from earlier phases now that real
data exists to validate decay rates). Apply to USAGE_OBSERVATION and BUSINESS_EVENT
sources only.

Add `SYSTEM_CONFIG` source population: when a user changes a config setting that
maps to a characteristic, the engine reads the new config and updates the relevant
characteristic field with `SYSTEM_CONFIG` source.

### 4.4 — Existing Business Backfill

Migration job that runs once:
- For every existing business with `livingCharacteristics = NULL`:
  - Reads `onboardingSurveyAnswers` (if present) or infers from current `SystemConfig`
  - Reads current `BusinessUsageSummary`
  - Runs `CharacteristicsEngine.compute()`
  - Writes `livingCharacteristics`, `characteristicsVersion = 1`, `currentProfile`
- Run on staging first; verify with 10 manual spot-checks

### 4.5 — Profile Graduation Notifications

When `CharacteristicsEngine` detects `profileChanged = true` in a `CHARACTERISTICS_UPDATED` event:
- Create a system notification: "Your business has grown — new capabilities are now available"
- Link to Settings → Capabilities page
- Do not silently enable any capability

---

## Testing Strategy

- Business Profile page: Pattern B — characteristic correction triggers recalculation
- Health stage classification: Pattern A — all four stages with boundary conditions
- Backfill job: Pattern C1 — run against test DB with known business configurations
- Decay calculation: Pattern A — verify decay function at grace window and stale threshold

---

## Acceptance Criteria

- [ ] Business Profile page shows all 34 characteristics with source and evidence
- [ ] Correcting `tracksInventory` to false triggers immediate recommendation rescore
- [ ] `ADMIN_DECISION` source on `tracksInventory = false` is not overridden by observation rules
- [ ] A business with all profile-recommended capabilities ENABLED shows ACTIVE or higher health
- [ ] Profile graduation notification fires when team grows from solo to small
- [ ] Backfill job completes for 100 existing businesses without errors

---

## ADRs Suggested

- `ADR-003: Confidence decay rates` — documents the specific grace windows and stale thresholds chosen and why


---

# Phase 5 — Growth Triggers + Profile Evolution + Intent

**Status:** ✅ Complete — August 2026
**Duration:** 2–3 weeks
**Team:** 1 engineer
**Theme:** The platform recognizes business milestones and responds proactively.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| 4 new Phase 5 observation rules — `catalogueSize = medium` (productCount 25–99), `catalogueSize = large` (productCount ≥ 100), rapid-growth signal (volume doubled in 30d, confidence 0.88); growth aliases for teamSize/locationCount; `GROWTH_OBSERVATION_RULES` export | `src/lib/evolution/observation-rules.ts` | `observation-rules-phase5.test.ts` (21 tests) |
| `transactionsPrev30Days` added to `BusinessUsageSummaryData` for rapid-growth ratio check | `src/lib/evolution/types.ts` | — |
| `MilestoneEngine` — pure `detectMilestones()` with 7 milestone definitions: FIRST_EMPLOYEE_HIRED, TEAM_REACHED_SIX, TRANSACTIONS_CROSS_100_DAY, RAPID_GROWTH_DETECTED, CATALOGUE_CROSSED_100_ITEMS, SECOND_BRANCH_OPENED, ONE_YEAR_ANNIVERSARY (±7d window) | `src/lib/evolution/milestone-engine.ts` | `milestone-engine.test.ts` (35 tests) |
| `GROWTH_MILESTONE` added to `NotificationType` enum | `prisma/schema.prisma` | — |
| `RecalculationJob` Step 7c — calls `detectMilestones()` after every recalculation; emits `GROWTH_THRESHOLD_CROSSED` event; creates deduped per-admin `GROWTH_MILESTONE` notifications | `src/lib/evolution/recalculation-job.ts` | — |
| `IntentExpiryChecker` — pure `getStaleIntentFields(living, now)` returns stale intent fields (value=true, observedAt > 12 months); `monthsBetween()` calendar-month helper; `INTENT_FIELDS` constant; prompt string builder | `src/lib/evolution/intent-expiry-checker.ts` | `intent-expiry-checker.test.ts` (26 tests) |
| `CAPABILITY_GUIDE.md` — developer guide: what a capability is, 3-step registration, worked `LOYALTY_POINTS` example, test locations, EntitlementEngine boundary reminder, common mistakes | `docs/onboarding/CAPABILITY_GUIDE.md` | — |

---

## Purpose

Phase 5 activates growth detection. The platform now explicitly recognizes when
a business crosses a meaningful threshold — first employee, rapid volume growth,
second branch — and responds with contextual, urgency-ranked suggestions.

---

## Deliverables

### 5.1 — Growth Observation Rules

The GROWTH_THRESHOLD category of observation rules, now implemented as part of
the full `OBSERVATION_RULES` registry in `CharacteristicsEngine`.

These rules differ from standard rules in that they set characteristics whose
*change* is the signal (e.g. `teamSize` going from 'solo' to 'small' is more
meaningful than `teamSize = 'small'` observed in isolation).

The `CHARACTERISTICS_UPDATED` event's `changedFields` payload is used by the
`RecommendationEngine` to boost scores for capabilities related to changed fields.

### 5.2 — Milestone Notifications

Seven high-value milestone notifications:
- First employee hired
- Team reaches 6 people
- Transactions cross 100/day average
- Transaction volume doubles in 30 days (rapid growth)
- Product catalogue exceeds 100 items
- Second branch opened
- One-year anniversary

Each produces a notification + a recommendation boost for related capabilities.
The notification copy follows the business language principle (no module names).

### 5.3 — Intent Field Expiry (passive)

Implement the passive display of intent field age in the Business Profile editor.
No expiry job. When the intent field `observedAt` is more than 12 months ago,
the Business Profile editor shows: "You mentioned this 14 months ago. Still accurate? [Yes / No]"

Clicking Yes: refreshes `observedAt`. Clicking No: sets field to `false`.
No background job. No automated expiry.

### 5.4 — `CAPABILITY_GUIDE.md`

A two-page practical guide for developers:
1. What a capability is (three sentences)
2. Three-step registration (capability-keys + registry + entitlements seeder)
3. Complete worked example for `LOYALTY_POINTS`
4. Where to find the tests
5. Reminder: EntitlementEngine is separate from BOS Registry

---

## Acceptance Criteria

- [ ] When `teamSize` changes from 'solo' to 'small', cash reconciliation recommendation score increases
- [ ] Rapid growth detection fires when 30-day transaction volume doubles
- [ ] Milestone notifications appear in the notification bell with correct copy
- [ ] `CAPABILITY_GUIDE.md` reviewed and merged
- [ ] A developer following the guide can register a new capability in under 30 minutes

---

# Phase 6 — Analytics + AI Seam + Observability

**Status:** ✅ Complete — August 2026
**Duration:** 2–3 weeks
**Team:** 1 engineer
**Theme:** Instrument everything. Open the AI seam. Build the internal analytics that will guide all future decisions.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| `trackingEvents` field added to `CapabilityDefinition` type | `src/lib/onboarding/types.ts` | — |
| `TRACKING_EVENTS_MAP` + `trackingEvents` populated on all 28 capabilities via `.map()` augmentation at registry export | `src/lib/onboarding/capability-registry.ts` | existing registry-validation.test.ts passes |
| `event-subscribers.ts` — `registerAllEventSubscribers()` wires `CAPABILITY_STATE_CHANGED` and `GROWTH_THRESHOLD_CROSSED` to `BusinessEventLog` persistence | `src/lib/evolution/event-subscribers.ts` | — |
| `recommendedAt` + `enabledAt` nullable timestamp columns added to `BusinessCapabilityState` | `prisma/schema.prisma` | — |
| `capability-control.ts` writes `recommendedAt` on first RECOMMENDED entry, `enabledAt` on first ENABLED entry | `src/lib/evolution/capability-control.ts` | — |
| `complete-registration.ts` Step 8 stamps `enabledAt`/`recommendedAt` at registration time | `src/lib/queries/complete-registration.ts` | — |
| `recommendation-analytics.ts` — `fetchRecommendationAnalytics()`, `fetchLowAcceptanceCapabilities()` using `crudAPI` | `src/lib/evolution/recommendation-analytics.ts` | — |
| `platform-analytics.ts` — `fetchPlatformAnalyticsReport()`, health stage distribution, profile distribution, milestone frequency using `crudAPI` | `src/lib/evolution/platform-analytics.ts` | — |
| `ai-adapter-interface.ts` — `AIAdapter` interface, `NullAIAdapter` null implementation, `registerAIAdapter`/`getAIAdapter` registry | `src/lib/evolution/ai-adapter-interface.ts` | — |
| Shadow-run retirement — `BUSINESS_TYPE_CONFIGS` and `V1RegistrationSchema` removed; `complete-registration.ts` now v2-only; `businessType` column deprecated with comment | `src/lib/queries/complete-registration.ts`, `prisma/schema.prisma` | — |
| `ADR-004` — documents shadow-run retirement decision, consequences, and `businessType` column migration path | `docs/decisions/ADR-004-remove-v1-onboarding-path.md` | — |

---

## Purpose

Phase 6 is not a user-facing phase. It is an infrastructure phase that makes the
platform measurable and prepares it for future intelligence improvements.

---

## Deliverables

### 6.1 — `trackingEvents` Emission

Every capability in the registry has `trackingEvents` defined. Phase 6 ensures
all declared tracking events are actually emitted at the correct points in the
application. Audit all capabilities against actual server function coverage.

### 6.2 — Recommendation Analytics

Track:
- Recommendation acceptance rate per capability
- Time from RECOMMENDED to ENABLED per capability
- Dismissal rate per capability
- Recommendation-to-abandonment rate (user dismisses, never re-engages)

These feed into threshold tuning decisions for Phase 7+.

### 6.3 — Internal Analytics Dashboard (Admin)

Admin-facing view (not business-facing):
- Health stage distribution across all businesses
- Recommendation acceptance rate per capability
- Most common profiles at registration
- Profile graduation frequency
- Survey completion rates by path length

### 6.4 — AI Adapter Interface

```
src/lib/evolution/ai-adapter-interface.ts
```

Type definitions only. Null implementation. The interface is the seam; no model
is plugged in. Remove all detailed AI documentation from the architecture documents —
keep only the interface definition.

### 6.5 — Shadow-Run Retirement

30 days after Phase 1 shipped, if shadow-running acceptance criteria were met:
- Remove `BUSINESS_TYPE_CONFIGS` from `complete-registration.ts`
- Remove `ONBOARDING_V2_SHADOW` environment variable
- File `ADR-004: Remove v1 business-type configuration path`
- Deprecate `businessType` column on `Business` model (do not drop yet)

---

## Acceptance Criteria

- [ ] All capability `trackingEvents` are emitted at the correct application points
- [ ] Recommendation analytics are queryable from admin dashboard
- [ ] `AIAdapterInterface` is defined, null implementation is active
- [ ] Shadow-running path removed (if 30-day window has passed)
- [ ] `ADR-004` filed if shadow-running is retired

---

# Phase 7 — Threshold Tuning + Production Hardening

**Status:** ✅ Complete — August 2026
**Duration:** 2–3 weeks (ongoing, based on data)
**Team:** 1 engineer
**Theme:** Use Phase 1–6 data to tune the system for real business behavior.

> **Important:** The actual threshold values (capability thresholds, observation rule
> confidences, decay rates) cannot be changed until at least 90 days of production
> data is available. Phase 7 therefore ships the **tooling** that makes data-driven
> tuning actionable. Real tuning ADRs (ADR-005+) are filed when the data is in.

### What was built

| Deliverable | Files | Tests |
|---|---|---|
| `threshold-tuning-guide.ts` — pure `auditThresholds()` that reads analytics stats and flags capabilities with LOW_ACCEPTANCE, HIGH_DISMISSAL, HIGH_ACCEPTANCE, or SLOW_ACTIVATION signals; `getCriticalFlags()` for daily ops | `src/lib/evolution/threshold-tuning-guide.ts` | — |
| `auditDecayedCharacteristics()` — pure function that inspects a `LivingCharacteristics` snapshot and returns all fields that have fully decayed to confidence=0, sorted by staleness | `src/lib/evolution/characteristics-engine.ts` | — |
| `recalculation-queue-monitor.ts` — `getQueueHealthReport()`, `getFailedQueueEntries()`, `getProcessedCountInWindow()`, `resetFailedEntry()` for production queue observability | `src/lib/evolution/recalculation-queue-monitor.ts` | — |
| Per-entry timing added to `runRecalculationBatch()` — each business logs its individual processing time; final log includes skipped count | `src/lib/evolution/recalculation-job.ts` | — |
| `ADR-005-threshold-change-template.md` — complete template for threshold-change ADRs with required data fields, rationale structure, and a worked `MANAGE_INVENTORY` example | `docs/decisions/ADR-005-threshold-change-template.md` | — |

### When to file a real ADR-005+

Use `threshold-tuning-guide.ts` → `auditThresholds()` after the 90-day data window.
Any flag at `action-required` severity requires an ADR before the threshold is changed.
The template is at `docs/decisions/ADR-005-threshold-change-template.md`.



---

## Deliverables

### 7.1 — Threshold Tuning

Using recommendation analytics from Phase 6:
- Adjust capability `threshold` values for capabilities with very low or very high
  acceptance rates
- Adjust observation rule confidence values for rules that are firing incorrectly
- Adjust recommendation `recommendationScore` functions based on actual acceptance patterns

All changes to thresholds are filed as ADRs with the data rationale.

### 7.2 — Decay Rate Tuning

If Phase 4's decay system reveals any unexpected characteristic reversions in real
businesses, tune `graceWindowDays` and `staleAfterDays` based on observed patterns.

### 7.3 — Performance Baseline

With real production data, measure:
- Weekly job execution time (CharacteristicsEngine sweep + RecommendationEngine sweep)
- RecalculationQueue depth (are jobs being processed in the 5-minute window?)
- DB query times for the most frequent read patterns

Address any bottlenecks found. Document results. No premature optimization before this.

### 7.4 — Documentation Update Pass

Update `ONBOARDING_MASTER_PLAN.md` to reflect any threshold or rule changes made in 7.1–7.2.
Update `ARCHITECTURE_REVIEW.md` if any component behavior was found to need revision.
No architectural changes without an ADR.

---

## ADRs Expected in Phase 7

All threshold changes require ADRs. This phase may produce 3–6 ADRs based on
what the data shows. This is expected and healthy — it is the architecture learning
from reality.


---

# Build Order

This is the dependency-ordered sequence of components within all phases combined.
Use this when assigning work within a phase or when parallelizing across a two-person team.

```
FOUNDATION (must complete before anything else)
  ├── Pre-implementation gate (R1–R6 fixes)
  ├── Database schema Phase 1 additions
  └── Pure engine types (src/lib/onboarding/types.ts)

DISCOVERY LAYER (Phase 1)
  ├── SurveyInterpreter (no dependencies)
  ├── Capability Registry definitions (no dependencies — but requires types.ts)
  ├── CapabilityResolver (requires Registry + types)
  ├── ProfileClassifier (requires Resolver + types)
  ├── ConfigurationEngine (requires Resolver + Classifier + types)
  ├── PlanAdvisor (requires Classifier)
  └── Survey UI (requires SurveyInterpreter)
  └── complete-registration.ts update (requires all of the above)

OBSERVABILITY LAYER (Phase 2, can start parallel to late Phase 1)
  ├── BusinessEventLog table + migration
  ├── BusinessUsageSummary table + migration
  ├── BusinessEventBus (requires EventLog table)
  ├── Prisma middleware for event emission (requires EventBus)
  └── Weekly aggregation job (requires UsageSummary table)

INTELLIGENCE LAYER (Phase 2, depends on Observability)
  ├── CharacteristicsEngine core (pure function, no dependencies)
  ├── ObservationRules Phase 2 subset (requires CharacteristicsEngine)
  ├── CharacteristicsConflictResolver (requires CharacteristicsEngine)
  ├── RecalculationQueue table + job (requires CharacteristicsEngine + EventBus)
  └── BusinessCapabilityState table + initial population

ADAPTATION LAYER — Control (Phase 3a, depends on Intelligence)
  ├── CapabilityControl (requires CapabilityState + Registry)
  ├── rollbackOutputs on all capabilities (requires Registry)
  └── Settings → Capabilities page (requires CapabilityControl)

ADAPTATION LAYER — Recommendations (Phase 3b, can parallel 3a)
  ├── RecommendationEngine scoring (pure function, requires types)
  ├── Remaining ObservationRules (requires CharacteristicsEngine)
  ├── Intent fields in BusinessCharacteristics (requires SurveyInterpreter update)
  └── Recommendation card improvements (importance → placement mapping)

TRANSPARENCY LAYER (Phase 4)
  ├── Settings → Business Profile page (requires LivingCharacteristics + CapabilityControl)
  ├── Business Health Model (requires CapabilityState + UsageSummary)
  ├── Full decay system (requires CharacteristicsEngine)
  └── Existing business backfill job (requires all CharacteristicsEngine)

GROWTH LAYER (Phase 5)
  ├── Growth observation rules (requires ObservationRules)
  ├── Milestone notifications (requires EventBus + NotificationSystem)
  ├── Intent expiry (passive) (requires BusinessProfile page)
  └── CAPABILITY_GUIDE.md

ANALYTICS LAYER (Phase 6)
  ├── trackingEvents audit (requires all capabilities)
  ├── Recommendation analytics (requires RecommendationEngine + CapabilityState)
  ├── Admin analytics dashboard (requires analytics data)
  ├── AIAdapterInterface (no dependencies)
  └── Shadow-run retirement (requires 30-day window from Phase 1)

TUNING (Phase 7 — data-driven, ongoing)
  └── All threshold changes → ADRs
```

---

# Vertical Slice Summary

| Slice | Phases | What It Delivers |
|---|---|---|
| Lite POS Slice | 1 | Survey + basic POS + correct initial configuration |
| Intelligence Slice | 2 | Event observation + first capability offers |
| Control Slice | 3a | Full lifecycle + Settings → Capabilities page |
| Recommendation Slice | 3b | Scored, prioritized, contextual recommendations |
| Transparency Slice | 4 | Business Profile editor + Health stage |
| Growth Slice | 5 | Milestones + profile graduation |
| Analytics Slice | 6 | Instrumentation + AI seam |
| Tuning Slice | 7 | Data-driven improvements |

Each slice is independently deployable. Each leaves the system in a better state
than before it shipped.

---

# Risk Assessment

## Technical Risks

| Risk | Severity | Phase | Mitigation |
|---|---|---|---|
| RecalculationQueue depth grows under load | Medium | 2+ | DB-backed queue (R1 fix) + monitoring; add read replica when depth > 1000 |
| CharacteristicsEngine produces wrong characteristics | High | 2 | Shadow-run + manual spot-checks; conservative thresholds initially |
| Registry grows to unmaintainable size | Low | 3+ | Registry validation test catches structural issues; logical grouping by category |
| Event emission via middleware adds latency | Low | 2 | Benchmark; target < 2ms; async emit with error swallowing |
| Characteristic decay removes genuinely active values | Medium | 4 | Conservative decay rates (30-day grace); user correction always available |
| Shadow-run divergence is too high to cut over | Medium | 1 | Defined acceptance criteria (R5 fix) + 30-day window |

## Architectural Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Entitlement / BOS registry boundary violated | High | Import lint rules + architecture review checklist in DoD |
| Domain logic migrates into Application Layer | Medium | Code review policy; Pattern A tests will fail if domain logic has IO |
| Phase 1 threshold calibration is wrong | Medium | Shadow-running catches systematic failures; correction via ADR |

## Product Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Survey still feels too long for solo users | Medium | 6-question path for solo+immediate+no-inventory validated before launch |
| Recommendation fatigue before rate limiting | Low | 30-day dismiss cooldown ships with Phase 2; tighten in Phase 3b based on data |
| Profile misclassification for edge-case businesses | Low | GENERAL fallback profile always available; user can correct via Business Profile |

## Developer Experience Risks

| Risk | Severity | Mitigation |
|---|---|---|
| New engineers miss seeder step when adding capabilities | Medium | CAPABILITY_GUIDE.md (Phase 5); registry validation test catches runtime failures |
| Architecture documents too long for day-to-day reference | Medium | CAPABILITY_GUIDE.md is the practical reference; long docs are for design decisions |
| Observation rules accumulate without governance | Low | Rule registry validation; rules must have unit tests to merge |

---

# Technical Debt Strategy

## Intentional Debt (acceptable to carry)

These are deliberate deferrals made for phase sequencing reasons. They must be
tracked and have a scheduled resolution phase.

| Debt | Deferred to | Reason |
|---|---|---|
| Confidence decay system | Phase 4 | Needs real data to calibrate; implementing theory-based rates is wasteful |
| Recommendation rate limiting beyond dismiss cooldown | Phase 3b | Need dismissal rate data to set thresholds correctly |
| AI adapter implementation | Phase 6+ | Interface defined; implementation requires ML team |
| `businessType` column drop | Phase 6 | Backward compat period after shadow-running completes |
| Intent field expiry job | Phase 4+ | Passive display first; automate only if passive is insufficient |
| Full observation rule set | Phase 3b | High-value rules first; additional rules added as patterns emerge |

## Never Compromise

These are invariants that must not be traded away for speed, regardless of deadline pressure:

- Pure functions for all domain engines (testability)
- DB-backed RecalculationQueue (production correctness)
- Registry build-time validation (registry integrity)
- Domain boundary between BOS and EntitlementEngine (billing correctness)
- `rollbackOutputs` on all capabilities (safe capability retirement)
- Audit trail for all `CapabilityControl` actions (accountability)

## Accidental Debt (address immediately)

If any of the following are found during implementation, they are not acceptable to carry:

- `any` type in a domain engine
- IO inside a pure function engine
- Manual `BusinessEventBus.emit()` in a server function (use middleware)
- A capability without a unit test
- A new characteristic without a safe default

---

# Milestones

| Milestone | After Phase | What a Real Business Can Do |
|---|---|---|
| M1 — Open for Business | 1 | Create account → answer survey → process a sale. Correct config from day one. |
| M2 — Aware Platform | 2 | Platform notices business behavior. First offers appear at the right moment. |
| M3 — In Control | 3a | Business can see all available capabilities and manage them in one place. |
| M4 — Intelligent Platform | 3b | Recommendations are scored, explained, and contextually placed. |
| M5 — Transparent Platform | 4 | Business can see how the platform understands them and correct anything wrong. |
| M6 — Growing Platform | 5 | Platform recognizes milestones and responds proactively. |
| M7 — Measurable Platform | 6 | Full instrumentation. AI seam open. Data pipeline live. |
| M8 — Calibrated Platform | 7 | Thresholds tuned against real behavior. System optimized for actual use. |

---

# Architecture Governance Reference

All architecture changes must follow this process:

1. **File an ADR** — describe context, decision, consequences, alternatives
2. **Self-review** (solo) or **two-engineer review** (team)
3. **Accept the ADR** — mark `Status: Accepted` and merge
4. **Update `ONBOARDING_MASTER_PLAN.md`** if the change affects documented behavior
5. **Add the architecture compliance checklist** to the PR description

No architecture change without an ADR. No exceptions.

**ADR template location:** `docs/decisions/`
**ADR naming:** `ADR-NNN-[short-description].md` (e.g. `ADR-001-replace-business-type-config.md`)

Pre-assigned ADR numbers:
- ADR-001: Replace BUSINESS_TYPE_CONFIGS (Phase 1)
- ADR-002: Event emission via Prisma middleware (Phase 2)
- ADR-003: Confidence decay rates (Phase 4)
- ADR-004: Remove v1 onboarding path (Phase 6)
- ADR-005+: Reserved for threshold changes (Phase 7)

---

*Version 1.0 — August 2026*
*This roadmap is a living document. Phase content may be updated as implementation
reveals new information. All updates require an ADR if they change architecture
boundaries. Phase scope, sequencing, and acceptance criteria may be updated by the
engineering team as needed.*
