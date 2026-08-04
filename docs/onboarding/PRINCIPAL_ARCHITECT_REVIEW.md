# Principal Architect Design Review
## Architecture Readiness Gate

**Date:** August 2026
**Reviewer Role:** Principal Software Architect (first engagement with this project)
**Documents Reviewed:** `ONBOARDING_MASTER_PLAN.md`, `ARCHITECTURE_REVIEW.md`
**Gate Decision:** See Part 10.

---

## Opening Statement

I reviewed this architecture as someone who did not design it and has no emotional
investment in its decisions. My job is to find what breaks before the engineers do.

The architecture is ambitious and, in large parts, well-reasoned. It has also been
through enough iteration cycles that it carries the weight of all its previous
versions — some concepts that were useful in an earlier design have calcified into
complexity in the final one.

My findings are direct. Where I agree, I say so briefly. Where I disagree, I say
so at length, because disagreement is where the value is.

---

## Table of Contents

1. Architecture Stress Test
2. Simplicity Review
3. Overengineering Review
4. Incremental Delivery Review
5. Capability Registry Review
6. Business Intelligence Review — Boundary Validation
7. Failure Scenarios
8. Developer Experience
9. Domain Boundary Review
10. Final Readiness Scores
11. Implementation Readiness Verdict


---

# Part 1 — Architecture Stress Test

## Finding 1.1 — LivingCharacteristics is a leaky abstraction

**Severity: Medium**

The architecture defines three representations of the same data:
- `BusinessCharacteristics` — 34 plain fields, the stable API
- `LivingCharacteristics` — each field wrapped in `SourcedValue<T>`, internal to `CharacteristicsEngine`
- `CharacteristicsSnapshot` — flat projection of `LivingCharacteristics` plus `_meta`

The stated purpose: downstream pure engines see `BusinessCharacteristics`; only the `CharacteristicsEngine` sees `LivingCharacteristics`. But `CharacteristicsSnapshot` adds `_meta` to `BusinessCharacteristics` and is what the engines actually receive.

This creates a practical problem: developers who look at `CapabilityResolver`'s input type see `CharacteristicsSnapshot`, navigate to its definition, see it extends `BusinessCharacteristics & { _meta }`, then wonder why `_meta` exists and whether they should use it. When they look at the `CharacteristicsEngine`, they see `LivingCharacteristics` with a completely different structure. Three names for the same data invite confusion about which one to use where.

**Recommendation:** Collapse to two representations.
- `BusinessCharacteristics` — the stable type. Used everywhere: survey, engines, registry functions.
- `LivingCharacteristics` — internal to `CharacteristicsEngine` only. Never exported to other modules.

Remove `CharacteristicsSnapshot` entirely. The `_meta` fields (`version`, `computedAt`, `businessId`, `dominantSource`) are operational metadata needed by the persistence layer, not by the engines. Pass them as a separate parameter where needed, or read them directly from the `Business` record. The pure engine functions take `BusinessCharacteristics`. Full stop.

This change simplifies the type surface from three to two and removes the confusion about which representation to use.

---

## Finding 1.2 — The RecalculationScheduler is an in-memory singleton

**Severity: High**

The proposed `RecalculationScheduler` holds a `Map<businessId, RecalculationJob>` in memory. This means:

1. On server restart, all pending recalculation jobs are silently lost.
2. In a multi-process or multi-instance deployment, each instance has its own scheduler map — no coordination.
3. If the server crashes between an event emission and the 5-minute batch processing, the characteristic update never happens.

For Phase 1 (single server), this is acceptable. For any production deployment with auto-scaling or multiple instances, this silently drops updates.

**Recommendation:** Replace the in-memory map with a simple database-backed queue from day one. The implementation cost is minimal: a `CharacteristicsRecalculationQueue` table with columns `(businessId, priority, scheduledAt, processedAt)` and a unique constraint on `businessId`. The scheduler upserts a row; the job runner processes rows where `processedAt IS NULL`. On restart, nothing is lost. On multi-instance deployment, row-level locking handles coordination.

This is not premature optimization — it is avoiding a known failure mode that will be expensive to fix after data has been silently dropped in production.

---

## Finding 1.3 — The BusinessEventBus has a hidden coupling

**Severity: Medium**

The Event Bus is described as "in-process pub/sub." Subscribers are registered statically at module load. Two subscribers are listed: `CharacteristicsEngine` and `RecommendationEngine`.

The problem: the server function that creates a supplier imports the EventBus. The EventBus has `CharacteristicsEngine` as a subscriber. `CharacteristicsEngine` imports `OBSERVATION_RULES`. `OBSERVATION_RULES` imports types from `capability-registry.ts`. `capability-registry.ts` has capability functions.

At module load, creating a supplier transitively loads the entire capability registry. This is not dangerous per se, but it means that any syntax error, missing import, or broken capability definition will crash every server function that emits any event — including the basic POS checkout.

**Recommendation:** The Event Bus must not couple the subscriber implementations at module load. Use a registration pattern where subscribers register themselves at startup, not through static imports:

```ts
// At app startup, not at module definition:
BusinessEventBus.subscribe('SUPPLIER_ADDED', CharacteristicsEngine.handleEvent)
BusinessEventBus.subscribe('CHARACTERISTICS_UPDATED', RecommendationEngine.handleEvent)
```

The EventBus itself imports nothing but its own types. Subscribers import the EventBus. This breaks the implicit dependency chain from server functions to capability definitions.

---

## Finding 1.4 — The Capability Registry has no validation at build time

**Severity: Medium**

The `CAPABILITY_REGISTRY` is a runtime constant. Nothing prevents a developer from:
- Adding a capability with a `hardDependency` that references a non-existent capability ID
- Adding a capability whose `required` function references a characteristic field that was renamed
- Adding a circular dependency (`A hardDepends B`, `B hardDepends A`)
- Omitting a required metadata field (TypeScript helps here, but `aiHints` is optional)

These errors will not be caught until the engine runs in production with a real business.

**Recommendation:** Add a registry validation function that runs at test time and in the CI pipeline:

```ts
function validateRegistry(registry: CapabilityDefinition[]): string[] {
  const ids = new Set(registry.map(c => c.id))
  const errors: string[] = []

  for (const cap of registry) {
    // Check hard dependencies exist
    for (const dep of cap.hardDependencies) {
      if (!ids.has(dep)) errors.push(`${cap.id}: hardDependency '${dep}' not found in registry`)
    }
    // Check conflicts reference real capabilities
    for (const conflict of cap.conflicts) {
      if (!ids.has(conflict)) errors.push(`${cap.id}: conflict '${conflict}' not found in registry`)
    }
    // Check no capability depends on itself
    if (cap.hardDependencies.includes(cap.id)) {
      errors.push(`${cap.id}: capability depends on itself`)
    }
    // Detect circular dependencies (DFS)
    // ... standard cycle detection
  }
  return errors
}
```

A single test that calls `validateRegistry(CAPABILITY_REGISTRY)` and asserts `errors.length === 0` catches all of these at build time. This test is free to write and worth more than any runtime guard.

---

## Finding 1.5 — The RecommendationEngine's 5-recommendation cap is not enough

**Severity: Low**

The hard cap of 5 active recommendations is a reasonable anti-fatigue measure, but it creates a hidden prioritization problem: a new business in Phase 1 with a Lite POS profile may have 0 recommendations (all capabilities HIDDEN). A business in Phase 3 may have 12 eligible recommendations but only sees 5.

The problem is not the cap itself — it is that the architecture does not define which 5 are chosen from 12 eligible, how often the 5 rotate, or what happens to capabilities ranked 6–12. They silently don't appear. The business that would benefit from capability #6 never learns it exists.

**Recommendation:** Alongside the active recommendation cap, add a "Discover more" section in Settings that shows all RECOMMENDED-eligible capabilities, regardless of score, with their business value description. This is not a recommendation card — it is a passive catalogue. No urgency, no dismissal prompt. Just "here are things your business could use."

The 5-cap then applies only to active recommendations shown on the dashboard and contextual pages. The catalogue shows everything. This way no capability is permanently invisible, and the fatigue prevention mechanism targets the right surface (proactive pushes, not passive discovery).

---

## Finding 1.6 — `SYSTEM_CONFIG` source priority is ambiguous

**Severity: Medium**

The source priority ladder places `SYSTEM_CONFIG` (priority 80) above `USAGE_OBSERVATION` (priority 60). The rationale: if a user explicitly changed a config key, that should override what the system observed.

But there is an important edge case: a user sets `ENABLE_ORDER=false` via Settings (generating a `SYSTEM_CONFIG` source for `paymentTiming`). They then process 500 orders over two months (generating a `USAGE_OBSERVATION` source for `paymentTiming = 'deferred'` with confidence 0.9). According to the priority rules, the config setting wins — the system will still infer `paymentTiming = 'immediate'` because of the `SYSTEM_CONFIG` source, even though the business is demonstrably operating with deferred payments.

This is wrong. `SYSTEM_CONFIG` should inform characteristics derived from config keys, not override characteristics that are independently observable. `ENABLE_ORDER=true` is evidence that `paymentTiming` is deferred, but 500 confirmed deferred-payment orders is stronger evidence.

**Recommendation:** `SYSTEM_CONFIG` as a source should apply only to characteristics that are *definitionally equivalent* to a config key (e.g. `isVatRegistered` ↔ `IS_VAT_REGISTERED=true`). For characteristics that can be independently observed, `USAGE_OBSERVATION` should be able to override `SYSTEM_CONFIG` when its confidence is high (≥ 0.85).

Add a per-field flag to `BusinessCharacteristics` metadata: `directlyMappedToConfig: boolean`. When `true`, `SYSTEM_CONFIG` is authoritative. When `false`, `USAGE_OBSERVATION` can override it.


---

# Part 2 — Simplicity Review

## Can any two engines become one?

After the previous review reduced twelve modules to nine, I looked again at whether
any of the remaining nine can be merged without losing a meaningful boundary.

**SurveyInterpreter + CharacteristicsEngine?**
No. The SurveyInterpreter is a pure, simple function called once. The CharacteristicsEngine
is a complex, continuously-running observer. They have entirely different lifecycles,
different inputs, and different call frequencies. Merging them conflates "initial setup"
with "ongoing operation." Keep separate.

**CapabilityResolver + ProfileClassifier?**
These are called in sequence and both take `BusinessCharacteristics` as input.
They could be a single function that returns both `ResolvedCapability[]` and `OperationalProfile`.

However, they have different responsibilities and different change rates. The `CapabilityResolver`
changes every time a capability is added. The `ProfileClassifier` changes only when a profile
is added. Tests for each are independent. Merging them would make both harder to test in isolation.

**Verdict: Keep separate. The current nine-module architecture is the right size.**

## Is every abstraction solving a real problem?

| Abstraction | Real problem it solves | Verdict |
|---|---|---|
| `LivingCharacteristics` / `SourcedValue<T>` | Knowing where a value came from, how confident we are, and when it was last confirmed | Solves a real problem — but see Finding 1.1 for the implementation simplification |
| `ObservationRules` registry | Separating "what we detect" from "how we detect it" | Solves a real problem — adding a rule is one data entry |
| `ConfiguredSignal` per capability | Automatically advancing ENABLED → CONFIGURED | Real problem — prevents capabilities being forever "enabled but never used" |
| `trackingEvents` per capability | Analytics instrumentation tied to capability definition | Real problem — eliminates forgetting to instrument a feature |
| `aiHints` per capability | Training data for future ML models | **Speculative** — no ML team, no model, no training pipeline |

**One abstraction to cut:** `aiHints` in `CapabilityDefinition`. It is future intent masquerading as architecture. The `trackingEvents` field already captures behavioral signals. When an ML team exists, they will instrument exactly what they need. A `{ signals: string[], outcome: string }` annotation written today by a product engineer is unlikely to be what an ML engineer needs in three years.

Remove `aiHints` from `CapabilityDefinition`. The `trackingEvents` field remains — that is real, measurable, and immediately useful for product analytics.

## Would a new developer understand this within a reasonable time?

Tested by tracing "add a new capability" as a new engineer:

1. Read the "How to Add a Capability" guide — straightforward.
2. Add `CapabilityKey` to `capability-keys.ts` — obvious.
3. Add entry to `CAPABILITY_REGISTRY` — the type is complex (14 required fields) but the guide has a worked example.
4. Add `Feature` record to the seeder — not mentioned in the guide until Step 3, which is a gap.
5. Understand why the seeder step is needed — requires knowledge of the `EntitlementEngine` and `PlanEntitlement`, which is not documented in the onboarding architecture docs.

**Gap found:** The "How to Add a Capability" guide assumes knowledge of the entitlement system that is not covered in either document. A new engineer following the guide exactly will ship a capability that evaluates correctly in the BOS engine but is not gateable by the billing system.

**Recommendation:** Add Step 4 explicitly: "Add to the `Feature` seeder AND add to the relevant `PlanEntitlement` records, otherwise the `EntitlementEngine` will deny access regardless of the BOS registry."


---

# Part 3 — Overengineering Review

For each component, I answer: should this exist **now**, **later**, or **never**?

---

## AI Extension Points (`AIAdapterInterface`)
**Verdict: Later. Not now.**

The interface is defined, has five methods, and is described as "null by default." The
architecture spends a full section on it, describes training data strategy, and discusses
injection points in three engines.

The interface is harmless — a null implementation costs nothing. But the documentation
overhead creates an expectation that the AI layer is architecturally significant. It is
not yet. It is a seam for future work.

**Action:** Keep the `AIAdapterInterface` type definition (ten lines). Remove the detailed
documentation about training data pipelines, inference injection points, and the five-method
breakdown from the reference architecture. When an ML team exists, they write their own spec.
The seam is the only thing that belongs in the architecture today.

---

## Confidence Decay System
**Verdict: Later. Not now.**

Confidence decay is the mechanism by which `USAGE_OBSERVATION` values expire if the
business stops doing the thing we observed. Example: a business that tracked inventory
for six months and then stopped should eventually have `tracksInventory` revert to its
survey answer.

The architecture specifies decay rates for every source type (`graceWindowDays`,
`staleAfterDays`) and a weekly decay sweep job.

This is solving a real problem — but it is a Phase 4 problem. In Phase 1 and 2, no
business has been on the system long enough for decay to matter. Implementing it in
Phase 2 adds a background job, a decay calculation function, and additional parameters
to the conflict resolver before there is any real evidence that decay is needed.

**Action:** Remove the decay system from Phases 1–3. Add it in Phase 4 with real data
showing which characteristics are becoming stale in practice. The observation rules
can be tuned then based on evidence, not theory. The architecture documents the concept;
the implementation is deferred.

---

## `BusinessUsageSummary` as a Persisted Model
**Verdict: Now — but simpler than specified.**

The architecture specifies a `BusinessUsageSummary` Prisma model with 17 count fields,
persisted weekly. This is correct in principle — observation rules should not run raw
aggregate queries on every recalculation.

But 17 pre-defined count fields is premature. New observation rules will need counts
that aren't in this list. Adding a new count requires a migration, not just a new rule.

**Alternative:** Store the summary as a `Json` column — `BusinessUsageSummary.data Json` — and compute whatever counts are needed by the current observation rules. When a new rule needs a new count, it is added to the aggregation job and to the JSON document with no migration.

This is slightly less queryable, but the summary is only read by the `CharacteristicsEngine`,
not by ad-hoc queries. JSON storage fits the access pattern and is migration-free.

---

## Intent Fields in `BusinessCharacteristics`
**Verdict: Later. The 12-month expiry is premature complexity.**

Adding intent fields (`intentToExpand`, `intentToSellOnline`, etc.) is reasonable.
The 12-month expiry mechanism — with a job to clear expired intent and a prompt to
refresh it — is premature. It adds a background job, a UI prompt, and a staleness
concept to what is fundamentally a simple boolean field.

**Action:** Add intent fields. Remove the expiry mechanism. Instead, when the Business Profile
editor is shown, the intent fields are displayed with their `observedAt` date.
"You mentioned you plan to sell online (set 14 months ago). Still accurate? [Yes / No]"
This is a passive display, not an automated expiry job. Simpler, less infrastructure,
same user experience.

---

## Recommendation Rate Limiting and Quiet Mode
**Verdict: Now — but after Phase 2 data exists.**

The architecture specifies: max 1 offer per session per day, 30-day dismiss cooldown,
quiet mode after 3 dismissals in a row. These are sensible anti-fatigue measures.

But implementing all three before any real users have dismissed any recommendations
is premature optimization. The thresholds are guesses.

**Action:** Implement the **30-day dismiss cooldown** from day one — it is a simple
`dismissedAt` timestamp check. Defer the "1 per session per day" limit and quiet mode
to Phase 3 when real dismissal rate data exists. Use that data to set the thresholds.

---

## Business Health Model (4 stages)
**Verdict: Now — but deferred to Phase 4.**

The previous review already reduced health stages from 6 to 4 (STARTING, ACTIVE,
ESTABLISHED, SCALING). These are clear and useful.

However, they require `BusinessUsageSummary` data and `BusinessCapabilityState` history
to evaluate correctly. Implementing health before both of those are populated (Phases 2–3)
produces only `STARTING` for every business, which provides no value.

**Action:** Implement the health model in Phase 4, not Phase 3. No change to the design;
only the phase assignment.


---

# Part 4 — Incremental Delivery Review

## Phase 1 — Is it truly standalone?

Phase 1 delivers the adaptive survey, the pure engines, and a new registration flow.
After Phase 1, new businesses get an adaptive survey and correct initial configuration.
Existing businesses are unaffected.

**Question:** Does Phase 1 require `BusinessCapabilityState`, `BusinessEventLog`, or
`BusinessUsageSummary` tables?

Answer: No. Phase 1 only needs the new nullable columns on `Business` (survey answers,
profile, `livingCharacteristics`). The capability state table, event log, and summary
table are all Phase 2+.

**Verdict: Phase 1 is genuinely standalone.** It can ship before any other phase is started.

**However:** The shadow-running requirement — running old and new engines in parallel for 30 days — is described but not fully specified. Who monitors the diff logs? What is the acceptance criterion? "No significant divergence" is not a definition.

**Recommendation:** Define "significant divergence" concretely before Phase 1 ships:
- `ENABLE_ORDER` disagreement rate > 5% → investigate
- `IS_VAT_REGISTERED` disagreement rate > 2% → investigate (compliance-critical)
- Any always-on capability disabled by new engine → immediate halt

These thresholds give the team a clear go/no-go signal at the end of the 30-day window.

---

## Phase 2 — Event logging and basic recommendations

Phase 2 adds `BusinessEventLog`, `BusinessUsageSummary`, `BusinessCapabilityState`,
event emission in server functions, and v1 of the `RecommendationEngine`.

**Concern:** Event emission is described as happening in individual server functions
(`create-supplier.ts`, `create-employee.ts`, etc.). This creates a maintenance burden:
every new server function must remember to emit. When someone writes a new server
function and forgets to emit, the characteristic update silently never happens.

**Recommendation:** Implement event emission as a PostToolUse hook or a transaction
wrapper, not as manual calls in individual functions. The application layer should emit
automatically when certain models are created or updated. Options:

1. **Prisma middleware:** intercept `supplier.create`, `product.create`, etc. at the
   Prisma client level and emit the corresponding event. Zero changes needed in server
   functions when new features are added.
2. **`dbTransaction` wrapper extension:** extend the existing `dbTransaction` to accept
   an optional `events` parameter. The transaction wrapper emits after successful commit.

Either option eliminates the "forgot to emit" failure mode permanently.

---

## Phase 3 — Full Recommendation Engine

Phase 3 delivers scored recommendations, display zones, explainability fields, and
the full lifecycle. This is the phase where the product changes most visibly for users.

**Concern:** Phase 3 has the most UI work (recommendation cards, dismiss flows,
capability control panel) and the most engine complexity (scoring, prioritization,
rate limiting) landing simultaneously. For a small team, this is a risk.

**Recommendation:** Split Phase 3 into 3a and 3b:
- **Phase 3a:** Capability lifecycle states and CapabilityControl (accept/dismiss/pause).
  No scoring. Every deferred capability gets surfaced with equal visibility (simple list,
  no scoring, no display zones). User can enable or dismiss from this list.
- **Phase 3b:** Recommendation scoring, display zones, urgency, and contextual placement.

3a delivers user control. 3b delivers intelligent prioritization. Both are valuable
independently. Shipping 3a first means users can act on recommendations even before
the scoring is tuned.

---

## Phase Check: Every Phase Leaves a Useful Product

| Phase | Product state after shipping |
|---|---|
| 1 | Adaptive survey replaces business-type selector. New businesses get correct config. |
| 2 | Platform learns from behavior. First "did you know you could..." offers appear. |
| 3a | Users can see and control all deferred capabilities. Full lifecycle UI. |
| 3b | Recommendations are scored, prioritized, and contextually placed. |
| 4 | Businesses can see and correct how the platform understands them. |
| 5 | Health model, profile graduation, intent refresh. |
| 6 | Analytics, AI seam. |

**Verdict: The phasing is sound.** With the Phase 3 split, every phase is independently
shippable and leaves a meaningfully better product than the one before it.


---

# Part 5 — Capability Registry Review

## Current metadata fields and their verdict

| Field | Keep? | Justification |
|---|---|---|
| `id` | Yes | Identity — non-negotiable |
| `label` | Yes | Developer tooling — low cost, high value |
| `description` | Yes | Shown in recommendations and capability cards — user-facing |
| `category` | Yes | Grouping and recommendation scoring — measurably useful |
| `required` | Yes | Core to capability evaluation — cannot be removed |
| `boosters` | Yes | Core to confidence scoring — cannot be removed |
| `threshold` | Yes | Core to ENABLED vs DEFERRED decision — cannot be removed |
| `outputs` | Yes | The point of enabling a capability — cannot be removed |
| `deferrable` | Yes | Determines whether a capability queues or silently stays HIDDEN |
| `activationSignals` | Yes | The event-driven offer mechanism — core to progressive activation |
| `hardDependencies` | Yes | Enforced at enablement — prevents broken configs |
| `softDependencies` | **Reconsider** | Currently described as "enhance this capability; surface together." What does "surface together" mean in implementation? If it means recommendation co-location, that requires engine logic. If it means UI grouping, that is a UI concern. The field adds metadata without a clear consumer. |
| `conflicts` | Yes | Enforced at recommendation time — prevents incompatible configs |
| `minimumPlan` | Yes | Enforced at enablement — prevents enabling features beyond the plan |
| `businessValue` | Yes | Shown in recommendations — user-facing, directly valuable |
| `estimatedSetupMinutes` | Yes | Shown in recommendations — reduces friction by setting expectations |
| `learningCurve` | **Reconsider** | 'minimal' / 'easy' / 'moderate' / 'involved' — who sets this? Who validates it? It is a subjective assessment that cannot be measured. Consider replacing with a simpler `isComplex: boolean` that triggers a "this may take some time to set up" indicator. |
| `canBePaused` | Yes | Controls the pause action — directly enforced |
| `canBeSelfServed` | **Remove** | All capabilities in the current registry are self-served. When one is not, the restriction should be enforced by a plan check or an admin gate, not by a metadata flag that requires engine handling. |
| `recommendationScore` | Yes | Core scoring function — cannot be removed |
| `configuredSignal` | Yes | Drives ENABLED → CONFIGURED — the only signal that advances the lifecycle automatically |
| `trackingEvents` | Yes | Analytics instrumentation — required (see Ten Rules) |
| `upgradePath` | **Later** | No capability currently supersedes another. Add when the first upgrade path is needed. |
| `migrationNotes` | **Later** | Same. Add when the first migration is needed. |
| `aiHints` | **Remove** | Speculative (see Part 3). |

**Net result:** Remove `canBeSelfServed`, `aiHints`, `upgradePath`, `migrationNotes`.
Simplify `softDependencies` to `relatedCapabilities: string[]` with a clear definition:
"IDs of capabilities that, when co-enabled, provide a better experience. Used for
recommendation grouping in the UI." Simplify `learningCurve` to `isComplex: boolean`.

**Metadata count before:** 24 fields
**Metadata count after:** 19 fields — a 20% reduction with no loss of real functionality.

## Is the Registry the Single Source of Truth?

**Concern:** The architecture describes the `CAPABILITY_REGISTRY` as the single source
of truth for capability behavior. But there is a second source of truth: the `Feature`
and `PlanEntitlement` tables in the database.

A capability's behavior is split across:
- `CAPABILITY_REGISTRY` (required conditions, outputs, recommendation logic)
- `Feature` table (isOperational flag, label, description)
- `PlanEntitlement` table (which plans include this capability, usage limits)
- `SystemConfig` (the actual config values that enable/disable it at runtime)

If a capability is in the registry but missing from the `Feature` seeder, the
`EntitlementEngine` will deny access. If it is in the `Feature` table but not in the
registry, the recommendation system will never surface it.

**Recommendation:** The registry comment that says "this is the single source of truth"
should be amended to: "this is the single source of truth for *activation logic and
recommendation behavior*." The billing and entitlement system (`Feature` + `PlanEntitlement`)
remains the source of truth for *access gating*. These are complementary, not competing.
The "How to Add a Capability" guide must document both steps.


---

# Part 6 — Business Intelligence Review — Boundary Validation

## The Boundaries as Defined

```
SurveyInterpreter       → responsible for: survey answers → initial characteristics
CharacteristicsEngine   → responsible for: ongoing observation, merging sources, emitting updates
CapabilityResolver      → responsible for: evaluating capabilities against characteristics
ProfileClassifier       → responsible for: assigning operational profile
ConfigurationEngine     → responsible for: producing BusinessConfiguration from resolved caps
RecommendationEngine    → responsible for: scoring and surfacing recommendations
CapabilityControl       → responsible for: user-directed capability state changes
BusinessEventBus        → responsible for: routing events between producers and consumers
```

## Boundary Violations Found

**Violation 1: ConfigurationEngine knows about plans**

`ConfigurationEngine.suggestPlan()` is a method on the Configuration Engine that
suggests 'Starter', 'Professional', or 'Enterprise'. Plan suggestion is a business
concern that depends on the operational profile and characteristics. However, plan
names are billing concepts. The Configuration Engine is a capability configuration
engine — it should not know that "Starter" and "Professional" exist.

**Fix:** Remove `suggestPlan()` from `ConfigurationEngine`. Move it to a standalone
`PlanAdvisor` function called by `complete-registration.ts` after the configuration is
built. `complete-registration.ts` already orchestrates the full pipeline; it can call
one more pure function.

```ts
// In complete-registration.ts, after ConfigurationEngine:
const suggestedPlan = PlanAdvisor.suggest(characteristics, profile)
```

`PlanAdvisor` is a three-line function. It does not warrant a full module — just a named
export in `configuration-engine.ts` or a separate lightweight file.

---

**Violation 2: RecommendationEngine knows about display zones**

`RecommendationZone` (DASHBOARD_CARD, CONTEXTUAL, SIDEBAR_HINT, SETTINGS_SECTION) is
a UI layout concept. The `RecommendationEngine` should not be deciding where in the
UI a recommendation appears. It should be deciding *how important* a recommendation is.
The UI layer should decide *where* to show something based on importance.

This is not purely cosmetic — it creates a coupling between the engine and the UI
layout. If the UI is redesigned (e.g. the dashboard is replaced with a command palette),
the engine must change even though the business logic did not.

**Fix:** Replace `displayZone` with `importance: 'low' | 'medium' | 'high' | 'critical'`.
The UI layer maps importance to display zones according to its own layout rules. The engine
knows how important something is; the UI knows where to show important things.

---

**Violation 3: CharacteristicsEngine is doing too much**

After absorbing Growth Detection, the CharacteristicsEngine is responsible for:
1. Merging evidence sources with priority resolution
2. Evaluating observation rules
3. Applying confidence decay (deferred but designed)
4. Scheduling recalculation jobs
5. Emitting `CHARACTERISTICS_UPDATED` events
6. Producing `LivingCharacteristics`
7. Projecting `CharacteristicsSnapshot`

Responsibility 4 (scheduling) is orchestration, not intelligence. The `CharacteristicsEngine`
should be pure computation. The scheduler belongs in the Application Layer — the background
job that calls the engine. The engine takes inputs and returns characteristics. The job
handles scheduling, DB reads, and DB writes.

**Fix:** `CharacteristicsEngine` is a pure function (Finding 1.1 already suggested this).
`RecalculationScheduler` (database-backed, per Finding 1.2) is a separate infrastructure
concern owned by the job runner. The engine does not know the scheduler exists.

---

## Clean Boundary After Fixes

```
SurveyInterpreter
  Input:  SurveyAnswers
  Output: BusinessCharacteristics
  Knows nothing about: capabilities, config, plans, billing

CharacteristicsEngine (pure core)
  Input:  IntelligenceEngineInput { survey, config, events, usageSummary, adminOverrides }
  Output: BusinessCharacteristics (merged, resolved, decayed when applicable)
  Knows nothing about: capabilities, config keys, plans, UI, scheduling

RecalculationJob (Application Layer)
  Reads: DB → assembles IntelligenceEngineInput
  Calls: CharacteristicsEngine.compute()
  Writes: DB → livingCharacteristics, emits CHARACTERISTICS_UPDATED

CapabilityResolver (pure)
  Input:  BusinessCharacteristics + CapabilityDefinition[]
  Output: ResolvedCapability[]
  Knows nothing about: plans, billing, scheduling, DB

ProfileClassifier (pure)
  Input:  BusinessCharacteristics + ResolvedCapability[]
  Output: OperationalProfile
  Knows nothing about: plans, billing, scheduling, DB

ConfigurationEngine (pure)
  Input:  BusinessCharacteristics + ResolvedCapability[] + OperationalProfile
  Output: BusinessConfiguration (without plan suggestion)
  Knows nothing about: plans, billing, scheduling, DB

PlanAdvisor (pure, lightweight)
  Input:  BusinessCharacteristics + OperationalProfile
  Output: 'Starter' | 'Professional' | 'Enterprise'
  Knows nothing about: capabilities, config, DB

RecommendationEngine (pure scoring core)
  Input:  BusinessCharacteristics + capability states + user preferences
  Output: Recommendation[] with importance (not display zones)
  Knows nothing about: UI layout, plans, scheduling

CapabilityControl (Application Layer)
  Reads/writes DB
  Calls: CapabilityResolver (to re-evaluate after manual changes)
  Emits: CAPABILITY_STATE_CHANGED

BusinessEventBus (infrastructure)
  No business logic
  No domain knowledge
  Routes events from producers to registered subscribers
```


---

# Part 7 — Failure Scenarios

## Scenario 1 — Survey answers are incorrect

A restaurant owner selects "I don't track stock" because they misunderstood the question.
They are actually managing 200 ingredients.

**How the architecture handles it:**
- Initial config: inventory tracking HIDDEN, no low-stock alerts
- When they start adjusting inventory: `USAGE_OBSERVATION` source fires within 5 minutes
- `inventoryAdjustmentCount ≥ 10` → `tracksInventory = true` overrides the survey answer
- `RecommendationEngine` surfaces "Enable inventory tracking"
- Business accepts; they are fully operational within days of starting

**Assessment: Handled correctly.** The architecture specifically solves this case.
The survey is the initial hypothesis. Usage observation is the correction mechanism.

---

## Scenario 2 — User skips onboarding entirely

A business owner clicks through the survey without answering anything.

**How the architecture handles it:**
- All fields resolve to safe defaults (Lite POS profile)
- The business starts with minimal config: POS, products, reports
- Progressive capability offers appear as they use the product

**Concern:** "Safe defaults produce Lite POS" means a restaurant that skipped the survey
gets no order queue, no VAT config, no inclusive pricing. Their first sales will be
processed with incorrect tax settings.

**This is the genuine weak point.** An aggressive "skip" path produces an actively wrong
configuration for some business types.

**Mitigation:** The survey must not be fully skippable. The first question ("what does
your business do?") should be required with no skip option. If the user selects food/beverage,
the second question ("pay immediately or order first?") should also be required.

Two required questions handle the highest-risk misconfiguration cases (VAT mode,
order queue) without making onboarding feel burdensome. Everything else can be skipped.
The `SurveyInterpreter` should validate that at minimum Q1 has an answer before
allowing the registration to complete.

---

## Scenario 3 — Capabilities are manually enabled before recommendations

A technically-savvy owner enables inventory tracking manually from Settings on Day 1,
before any observation rules have fired.

**How the architecture handles it:**
- `CapabilityControl.enable()` sets state to ENABLED
- Records `UserOverride` with `MANUALLY_ENABLE` action
- Emits `CAPABILITY_STATE_CHANGED`
- `CharacteristicsEngine` recalculates: `SYSTEM_CONFIG` source for `tracksInventory = true`
  (because the user explicitly enabled it, which is evidence)
- Future observation rules for `tracksInventory` still fire, but `SYSTEM_CONFIG` priority means
  a manual disable would take effect correctly too

**Assessment: Handled correctly.** The only nuance: `CapabilityControl.enable()` should
write to `SystemConfig` (setting `MANAGE_INVENTORY=true` if such a config key exists)
so the `CharacteristicsEngine` sees a `SYSTEM_CONFIG` source the next time it runs.

---

## Scenario 4 — Capabilities are manually disabled

A business pauses inventory tracking because they are doing a manual audit.

**How the architecture handles it:**
- `CapabilityControl.pause()` → state = PAUSED
- Config `MANAGE_INVENTORY` → false
- Inventory data is preserved (the pause guarantee)
- UI hides the inventory module
- `CharacteristicsEngine` does NOT change `tracksInventory` — the characteristic
  describes the business, not the software. The business still tracks inventory even
  if the module is paused.
- When they restore: `CapabilityControl.restore()` → state = ENABLED, config restored

**Concern:** The `CharacteristicsEngine` should not be deriving `tracksInventory = false`
from the fact that the module is PAUSED. But observation rules watch `inventoryAdjustmentCount`
— if the business cannot make adjustments while paused, the count will stop growing,
and after 120 days the decay mechanism would drop the observation confidence below the
threshold, potentially triggering a recommendation to enable it again.

**Mitigation:** A business in PAUSED state for a capability should not receive a
recommendation to enable that same capability. The `RecommendationEngine` already
excludes PAUSED capabilities from recommendations. The decay risk is real only if
the pause lasts more than the `graceWindowDays` (30 days). For operational pauses
(audit, maintenance) this is very unlikely. Document this edge case; do not over-engineer
a solution for it before evidence shows it is a real problem.

---

## Scenario 5 — Business changes direction

A restaurant pivots to purely delivery-only. No more dine-in. Table management
becomes irrelevant.

**How the architecture handles it:**
- `requiresTableManagement` characteristic: was `true` (from survey), still `true` (no observation rule to set it false)
- `CREATE_ORDER` capability remains ENABLED
- The business owner can pause `CREATE_ORDER` from `CapabilityControl` → PAUSED
- Or they can open the Business Profile editor and set `requiresTableManagement = false` → ADMIN_DECISION source
- The `RecommendationEngine` would not re-recommend it (it was PAUSED or the characteristic changed)

**Concern:** The observation rules are predominantly additive (they detect things being
used, not things stopping). There are no "de-activation" observation rules — no rule
that fires when a characteristic should become `false` based on non-usage.

This is a deliberate design decision (don't remove what the user enabled). But it means
the `CharacteristicsEngine` will accumulate `true` values that no longer reflect reality,
unless the user actively corrects them.

**Assessment:** This is an acceptable trade-off. The system is optimistic by design —
it assumes things in use stay in use. Businesses that truly change direction can use
the Business Profile editor. Documenting this design choice explicitly prevents future
engineers from adding "de-activation" observation rules that could silently disable
capabilities.

**Add to documentation:** "Observation rules are additive only. They raise characteristics
to `true`; they do not lower them to `false`. A business that stops doing something
retains the characteristic until manually corrected or until the value decays past the
confidence threshold (if decay is enabled). This is intentional."

---

## Scenario 6 — Multiple administrators configure the system differently

Two admins at the same business simultaneously change settings.

**How the architecture handles it:**
- `SystemConfig` writes are DB operations with standard row-level locking
- Two simultaneous writes to the same config key: last-write wins (Prisma default behavior)
- The `CharacteristicsEngine` recalculates after each write — both will see the latest config
- The `UserOverride` log records both actions with `actorId` and timestamps

**Assessment: Handled by existing DB concurrency.** No special handling needed.
The `UserOverride` audit trail provides the accountability layer.

---

## Scenario 7 — A future module is removed from the platform

A capability that was enabled for many businesses is retired.

**How the architecture handles it:**
- Capability transitions to `DEPRECATED` state
- `DEPRECATED` is a terminal state — no transitions out
- For businesses that had it ENABLED: `CapabilityControl` runs a migration that transitions
  ENABLED → DEPRECATED, removes the config outputs, preserves the data
- The capability's `outputs` (config writes) are reversed: `ENABLE_FEATURE=false`
- `BusinessCapabilityState` retains the record with `state = DEPRECATED`

**Concern:** The architecture does not specify a downgrade path for capability outputs.
`outputs()` produces config writes when enabling. What reverses them when DEPRECATED?

**Recommendation:** Add a `rollbackOutputs: (c: BusinessCharacteristics) => CapabilityOutput[]`
optional field to `CapabilityDefinition`. When a capability is PAUSED or DEPRECATED,
the `rollbackOutputs` function is called to produce the reversal writes. For most
capabilities, this is simply the same keys set to `false` or their safe defaults.
For capabilities with no `rollbackOutputs`, the engine produces no reversal — the
outputs persist (safe for most config toggles).

This field should be added now, even though no capability is currently deprecated,
because retrofitting it later requires touching every capability definition.


---

# Part 8 — Developer Experience

## Adding a New Capability — File Count

Under the revised architecture (post this review), how many files does a developer touch?

| Step | File(s) |
|---|---|
| Add `CapabilityKey` | `src/lib/entitlement/capability-keys.ts` |
| Add registry entry | `src/lib/onboarding/capability-registry.ts` |
| Add `Feature` seeder row | `prisma/seeders/entitlements.ts` |
| Add `PlanEntitlement` rows | `prisma/seeders/entitlements.ts` (same file) |
| Add Pattern A tests | `__tests__/unit/lib/onboarding/capability-registry.test.ts` |

**Total: 3 files** (capability-keys, capability-registry, entitlements seeder).
The test file is new but does not require touching existing files.

This is acceptable. The stated goal was "one entry in the registry, nothing else." The
seeder step is unavoidable because the entitlement system is a separate concern that
the registry deliberately does not own. The "How to Add a Capability" guide must make
this explicit.

## Can a Developer Understand the Capability Lifecycle Quickly?

Test: a developer reads only `BusinessCapabilityState` and the six lifecycle states.
Can they understand what the system does without reading the engines?

The six states are: HIDDEN, RECOMMENDED, ENABLED, CONFIGURED, PAUSED, DEPRECATED.

These are English words with obvious meaning. The transition rules are explicit.
The `enteredBy` field tells you whether a transition was system-driven or user-driven.
The `stateHistory` JSON provides a full audit trail.

**Verdict: Yes.** A developer can understand the lifecycle without reading the engines.
This is good architecture.

## Testing Difficulty

All pure functions (SurveyInterpreter, CapabilityResolver, ProfileClassifier,
ConfigurationEngine, CharacteristicsEngine core, RecommendationEngine scoring) are
testable with Pattern A — no database, no mocks, no infrastructure.

The Application Layer (RecalculationJob, CapabilityControl) is testable with Pattern B
(in-memory mocks) or Pattern C1 (real DB in integration tests).

**One gap:** The `OBSERVATION_RULES` registry. Each rule is a predicate function. Testing
all rules requires constructing `BusinessUsageSummary` objects for each rule's boundary
conditions. This is straightforward but tedious if there are 20+ rules. A test helper
that produces a minimal `BusinessUsageSummary` with all counts at zero and allows
overriding individual counts would make these tests much faster to write.

**Recommendation:** Add a `createUsageSummary(overrides: Partial<BusinessUsageSummary>)` test helper:
```ts
const summary = createUsageSummary({ supplierCount: 1 })
expect(OBSERVATION_RULES.find(r => r.characteristic === 'usesSuppliers')!
  .condition(summary, [])).toBe(true)
```

## Documentation Gap

The two architecture documents (`ONBOARDING_MASTER_PLAN.md`, `ARCHITECTURE_REVIEW.md`)
are comprehensive but they are 1,400 and 1,500 lines respectively. A new engineer
joining the team and asked to add a capability faces a wall of documentation.

**Recommendation:** Add a single two-page `CAPABILITY_GUIDE.md` that covers:
1. What a capability is (three sentences)
2. The three-step registration process
3. One complete worked example
4. Where to find the tests

This document is what a developer actually reaches for. The architecture documents
remain as reference material.


---

# Part 9 — Domain Boundary Review

## Are business models dependent on UI?

**No.** `BusinessCharacteristics`, `CapabilityDefinition`, `LivingCharacteristics`,
`OperationalProfile` — none of these import from any UI component. The architecture
correctly separates domain models from presentation.

The one previous violation — `displayZone` in `RecommendationEngine` — has been
corrected in Part 6 to `importance`. The UI layer owns display zone logic.

## Are capability definitions dependent on workflows?

**Partially.** The `outputs()` function on a capability can write `ENABLE_TASK=true`,
which enables the task workflow. This is a config write that *enables* a workflow,
not a dependency on the workflow's internals. The capability does not import from
the task engine. This is acceptable — the capability declares what config to set;
the config controls behavior at runtime.

## Is configuration dependent on onboarding?

**No.** The `ConfigurationEngine` is called by `complete-registration.ts` at registration,
but also by `CapabilityControl.enable()` when a capability is manually enabled. The
engine does not know it is being called from registration. Configuration is independent.

## Is the event bus domain-aware?

**Yes, but incorrectly so.** The `BusinessEventBus` as described has subscriber
registration that is coupled to specific engines:
```ts
BusinessEventBus.subscribe('SUPPLIER_ADDED', CharacteristicsEngine.handleEvent)
```

The event bus should be a generic infrastructure component — a router. It should not
know what `CharacteristicsEngine` is. The subscriber registration should happen at
the application startup layer, not inside the event bus.

**Fix:** The event bus exposes `subscribe(type, handler)` and `emit(event)`. That is all.
The bootstrap code (app initialization) calls `subscribe()` for each engine. The event
bus does not import any engine. This is already addressed in the module-load coupling
fix from Finding 1.3 but worth stating as a domain boundary principle.

## The Entitlement System Boundary

The architecture describes two systems that both gate capability access:
1. **BOS Registry** — gates based on business characteristics (who should have it)
2. **EntitlementEngine** — gates based on subscription plan (who is allowed to have it)

These serve different purposes and must not be conflated. The correct behavior is:

```
User tries to use capability X
  ↓
EntitlementEngine.check(X, context)
  → GRANTED? → allow
  → FEATURE_NOT_IN_PLAN? → show upgrade prompt (billing boundary)
  → SUBSCRIPTION_EXPIRED? → show reactivation prompt

Note: BOS Registry is NOT consulted at runtime for access decisions.
BOS Registry is consulted at configuration time (registration, capability activation).
```

The `CAPABILITY_REGISTRY` is a *setup-time* tool. The `EntitlementEngine` is a
*runtime* tool. They must never be confused.

**Risk:** If an engineer treats the `CAPABILITY_REGISTRY` as a runtime access gate,
they will bypass the billing system and allow businesses to use features above their
plan. The documentation must state this boundary explicitly.

**Add to documentation and to the registry file header:**
```
// CAPABILITY_REGISTRY governs:
//   - Whether a capability should be configured for a business (setup time)
//   - Whether a capability should be recommended (ongoing)
//   - What config values are applied when a capability is enabled (setup time)
//
// CAPABILITY_REGISTRY does NOT govern:
//   - Whether a user can access a capability at runtime (that is EntitlementEngine)
//   - Whether a subscription plan includes a capability (that is PlanEntitlement)
```


---

# Part 10 — Final Readiness Scores

Scores are from 1 (critical problems) to 10 (excellent). Every score below 9 includes
a brief explanation of what prevents a higher score and what would improve it.

---

## Scalability — 7/10

**Why not higher:** The in-memory `RecalculationScheduler` (Finding 1.2) is a real
scalability problem under multi-instance deployment. Until it is replaced with a
DB-backed queue, the architecture cannot scale horizontally without silently dropping
characteristic updates.

**What would make it a 9:** Replace the in-memory scheduler with a DB-backed queue
(one table, 30 lines of code, zero architectural changes). This is a Phase 2 task.

The rest of the architecture scales well. Pure functions are stateless. The `BusinessUsageSummary`
model makes observation rules O(1) per business regardless of raw event volume.

---

## Maintainability — 8/10

**Why not higher:** Three type names for the same data (`BusinessCharacteristics`,
`LivingCharacteristics`, `CharacteristicsSnapshot`) create maintenance confusion.
The entitlement system / BOS registry split is not clearly documented in the codebase
itself — only in architecture documents. Engineers will introduce boundary violations.

**What would make it a 9:** Collapse `CharacteristicsSnapshot` (Finding 1.1). Add the
registry boundary comment block (Part 9). Add build-time registry validation (Finding 1.4).

---

## Extensibility — 9/10

**Why not higher:** Adding a capability that needs a new characteristic requires
changing two files instead of one. This is unavoidable — the characteristic model
and the survey interpreter must both be updated. It is a known, documented, and bounded
cost. The architecture earns a 9 for making every other extension path a single-file change.

---

## Simplicity — 7/10

**Why not higher:** The architecture accumulated complexity across four design iterations.
Several things remain that were added early and never removed:
- `aiHints` in the capability definition
- Three representations of characteristics
- `canBeSelfServed` metadata field
- Confidence decay system documented in detail but deferred
- `learningCurve` with four values where a boolean suffices

With the simplifications recommended in Parts 2, 3, and 5 applied, this rises to 8.5.
Without them, it is 7 — technically correct but unnecessarily dense.

---

## Testability — 9/10

**Why not higher:** The `OBSERVATION_RULES` registry lacks a test helper for constructing
`BusinessUsageSummary` inputs (Part 8). Without it, tests for observation rules will
be verbose and slow to write. This is a small gap in an otherwise excellent testability story.

All engines are pure functions testable with Pattern A. Integration points are well-scoped
to the Application Layer. The capability lifecycle states are individually testable.

---

## Developer Experience — 7/10

**Why not higher:** The documentation is thorough but too long for day-to-day use.
A developer asked to add a capability faces 3,000+ lines of architecture documentation
before reaching the practical guide. The missing `CAPABILITY_GUIDE.md` (Part 8) would
close this gap significantly.

The seeder step not being mentioned in the current guide (Part 2 finding) is a real
onboarding trap — a developer will ship a capability that works in the BOS but is
blocked by the entitlement system.

**What would make it an 8:** Write `CAPABILITY_GUIDE.md` with one worked example.
Add the seeder step to the guide. These are two hours of documentation work.

---

## Product Flexibility — 9/10

**Why not higher:** The architecture handles everything from a solo street vendor to
a multi-branch enterprise without any design changes. New profiles, new capabilities,
new observation rules — all are additive.

The only constraint: a new business model that fundamentally changes what `BusinessCharacteristics`
can express (e.g. a franchise model where the franchisor configures templates that
franchisees inherit) would require a significant extension to the characteristics
model and the configuration engine. This is a real future constraint, not a current one.

---

## Incremental Deliverability — 9/10

**Why not higher:** Phase 3 as specified is large. The split into Phase 3a and 3b
(Part 4) is recommended and not yet reflected in the architecture documents.

With the Phase 3 split applied, every phase delivers a meaningfully better product.
Without it, Phase 3 is a multi-month delivery with no intermediate checkpoint.

---

## Long-Term Sustainability — 8/10

**Why not higher:** The architecture is built for the platform's current domain (POS /
BOS for small-to-medium businesses). Over ten years, the platform may need to support:
- Multi-tenant franchise models (franchisor manages template configs)
- API-first businesses (no direct users, pure machine clients)
- Marketplace models (multiple vendors in one platform instance)

None of these require fundamental redesign of the characteristic model or capability
registry, but they would require extensions to the `ConfigurationEngine` and
`ProfileClassifier` that are not currently designed for.

This is an acceptable trade-off — designing for these now would be premature.
The architecture earns an 8 for being extensible in the foreseeable future while
honestly not claiming to anticipate everything.

---

## Summary Table

| Quality | Score | Blocker? |
|---|---|---|
| Scalability | 7/10 | Yes — in-memory scheduler must be fixed before multi-instance deployment |
| Maintainability | 8/10 | No — manageable with documentation and build-time validation |
| Extensibility | 9/10 | No |
| Simplicity | 7/10 | No — but accumulated complexity will slow Phase 1 |
| Testability | 9/10 | No |
| Developer Experience | 7/10 | No — but the seeder gap is a real delivery risk |
| Product Flexibility | 9/10 | No |
| Incremental Deliverability | 9/10 | No — with Phase 3 split applied |
| Long-Term Sustainability | 8/10 | No |
| **Average** | **8.1/10** | |


---

# Part 11 — Implementation Readiness Verdict

## Verdict: Ready with minor refinements

The architecture is sound. The core design decisions — `BusinessCharacteristics` as
the stable contract, self-describing capability registry, living characteristics with
source provenance, six-state lifecycle, pure-function engines with an Application Layer
that owns IO — are all correct and will withstand ten years of platform growth.

There are no fundamental flaws requiring redesign. There are a specific set of
refinements that must be made before Phase 1 ships, and a set that can be addressed
in later phases.

---

## Required Before Phase 1

These must be resolved before a single line of implementation code is written.

**R1 — Replace in-memory scheduler with DB-backed queue.**
Risk class: production correctness. A multi-instance deployment will silently drop
characteristic updates with the in-memory design. This takes one migration and one
small table. Cost: two hours. Risk of not doing it: silent data loss in production.

**R2 — Collapse CharacteristicsSnapshot.**
Risk class: developer confusion and technical debt. Three type names for one data
structure will cause boundary violations within the first month. Eliminating
`CharacteristicsSnapshot` is a type-definition change, not a logic change.
Cost: two hours. Risk of not doing it: growing confusion about which type to use where.

**R3 — Fix EventBus module-load coupling.**
Risk class: cascading failures. A broken capability definition should not crash the
create-supplier server function. The fix is a startup-time subscription pattern instead
of static imports. Cost: two hours. Risk of not doing it: the first syntax error in
the capability registry crashes every server function that emits events.

**R4 — Add registry build-time validation test.**
Risk class: broken capabilities silently not working. A `validateRegistry()` function
called in a single test catches circular dependencies, missing references, and invalid
IDs before they reach production. Cost: two hours. Risk of not doing it: broken
capabilities that pass TypeScript checks but fail at runtime.

**R5 — Define shadow-running acceptance criteria.**
Risk class: premature production cutover. "No significant divergence" is not a
definition. Define specific disagreement rate thresholds for each capability type
before the shadow period starts. Cost: one hour to write. Risk of not doing it:
premature cutover based on subjective assessment.

**R6 — Add `rollbackOutputs` to `CapabilityDefinition`.**
Risk class: inability to cleanly deprecate capabilities. Once a capability is in
production and enabled for businesses, removing it requires output reversal logic.
Without `rollbackOutputs`, this is unspecified. Adding the field now, even with
empty implementations, costs thirty minutes. Retrofitting it when the first capability
is deprecated could take days.

---

## Recommended Before Phase 2

These are not blocking Phase 1 but should be resolved before Phase 2 ships.

**P2-1 — Write `CAPABILITY_GUIDE.md` (two pages).**
The seeder step gap will cause delivery failures in Phase 2 when engineers write
their first new capabilities. A two-page guide closes this.

**P2-2 — Implement event emission via middleware, not manual calls.**
Manual `BusinessEventBus.emit()` calls in individual server functions will be missed
as new functions are written. Prisma middleware or `dbTransaction` extension eliminates
this class of error permanently.

**P2-3 — Move plan suggestion to `PlanAdvisor`.**
`ConfigurationEngine` should not know about billing plan names.
This is a clean boundary violation that is cheapest to fix before it propagates.

**P2-4 — Replace `displayZone` with `importance` in Recommendation.**
The UI layout should own display zone logic, not the engine.
Fix before the recommendation UI is built in Phase 3a.

---

## Deferred to Later Phases (do not implement early)

- Confidence decay system → Phase 4
- AI extension interface → Phase 5 (keep the type; remove detailed documentation)
- Business Health Model → Phase 4
- Intent field expiry mechanism → Phase 4 (intent fields yes; expiry job no)
- Recommendation rate limiting beyond dismiss cooldown → Phase 3b

---

## The Six Required Fixes in Concrete Terms

| # | Fix | Where | Estimated Cost |
|---|---|---|---|
| R1 | DB-backed RecalculationQueue table + job | New migration + job file | 3 hours |
| R2 | Remove CharacteristicsSnapshot; engines take BusinessCharacteristics | types.ts + 3 engine files | 2 hours |
| R3 | EventBus subscriber registration at startup | business-event-bus.ts + bootstrap | 2 hours |
| R4 | Registry validation test | __tests__/unit/lib/onboarding/registry.test.ts | 2 hours |
| R5 | Shadow-running acceptance criteria | Document + monitoring checklist | 1 hour |
| R6 | rollbackOutputs field on CapabilityDefinition | types.ts + capability-registry.ts | 1 hour |

**Total estimated cost: 11 hours.** These are not expensive. They prevent expensive problems.

---

## Closing Statement

I was asked to determine whether this architecture is ready for implementation.
It is — with eleven hours of specific, bounded work done first.

The vision is correct. The platform should be an adaptive operating system that
learns from businesses rather than a configuration wizard. The characteristic model
is stable. The capability registry pattern is sound. The lifecycle states are sufficient.
The pure-function engine architecture makes the system testable without infrastructure.

The weaknesses found are implementation-level, not design-level. None require
reconsidering the core approach. The architecture will support the platform for the
next decade.

Make the six required fixes. Write the capability guide. Start Phase 1.

