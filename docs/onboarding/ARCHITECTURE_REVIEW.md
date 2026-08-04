# Business Operating System — Architecture Readiness Review
## Definitive Reference Architecture

**Version:** 1.0
**Date:** August 2026
**Type:** Architecture Design Review — Pre-Implementation
**Reviews:** `ONBOARDING_MASTER_PLAN.md` (the proposed architecture)
**Verdict:** Approved with revisions documented below.

---

## Purpose

This document does three things:

1. **Challenges** the proposed architecture against real implementation constraints.
2. **Simplifies** it — removing components that add complexity without proportional value.
3. **Finalizes** it as the canonical reference for development.

The single success criterion: *can we build exactly this, and will it support the platform for ten years without fundamental redesign?*

This is not the place to add new concepts. It is the place to stress-test existing ones.

---

## Executive Summary of Changes

| Component | Decision | Reason |
|---|---|---|
| Business Digital Twin | **Rejected** | Adds abstraction without solving a new problem; `BusinessCharacteristics` already serves this role |
| Business Intelligence Engine | **Retained, renamed** | Renamed to `CharacteristicsEngine` — clearer single responsibility |
| Growth Detection Engine | **Merged** into `CharacteristicsEngine` | Redundant boundary; growth signals are observation rules |
| Business Health Model | **Retained, simplified** | Reduced to 4 stages; complexity of 6 not justified by use cases |
| Progressive Activation Engine | **Merged** into `RecommendationEngine` | Two engines with overlapping jobs; one delivery system is simpler |
| Recommendation Engine | **Retained, extended** | Absorbs Progressive Activation; now owns all capability surfacing |
| Configuration Engine | **Retained, unchanged** | Clean single responsibility; no changes |
| Capability Lifecycle | **Simplified** to 6 states | PREVIEW and OPTIMIZED removed; not practically distinguishable |
| Business Intent | **Adopted, lightweight** | Intent stored as a characteristic field; no new engine required |
| User Override Engine | **Retained, renamed** | Renamed to `CapabilityControl` — clearer scope |
| Twelve-module architecture | **Reduced to nine** | Simpler, same coverage, clearer boundaries |


---

# Part 1 — Architecture Consistency Review

## 1A — Component-by-Component Verdict

### Question Registry
**Verdict: Retain, unchanged.**
Single responsibility: defines questions and branching logic. No overlap with any other module. The constraint that it never references capability names or config keys is the right guard rail and must be enforced in code review.

---

### Business Characteristic Engine (survey path)
**Verdict: Retain, rename to `SurveyInterpreter`.**
Responsibility: pure function, survey answers → initial `BusinessCharacteristics`. The name "Business Characteristic Engine" is ambiguous because the `CharacteristicsEngine` (below) also produces characteristics. `SurveyInterpreter` is unambiguous: it interprets the survey.

---

### Business Intelligence Engine
**Verdict: Retain, rename to `CharacteristicsEngine`. Absorb Growth Detection.**

The proposed architecture has the Intelligence Engine merging evidence sources and the Growth Detection Engine watching for scale changes. These overlap: a growth threshold crossing is simply an observation rule with a count condition. There is no architectural reason to separate them.

Merged responsibilities:
- Merges survey, config, usage, events, and admin into `LivingCharacteristics`
- Evaluates all observation rules (including growth-threshold rules)
- Applies confidence decay
- Schedules recalculations
- Emits `CHARACTERISTICS_UPDATED` event when a significant change is detected

What was "Growth Detection Engine" is now just the `GROWTH_THRESHOLD` category of observation rules. The `GROWTH_THRESHOLD_CROSSED` synthetic event is replaced by the standard `CHARACTERISTICS_UPDATED` event with a `significantFields` payload listing which characteristics changed. The `RecommendationEngine` subscribes to this and responds accordingly.

This eliminates one module, one event type, one background job, and one scheduler — with no loss of capability.

---

### Capability Resolver
**Verdict: Retain, unchanged.**
Single responsibility: evaluates the full `CAPABILITY_REGISTRY` against a `CharacteristicsSnapshot` and produces `ResolvedCapability[]` with lifecycle state assignments. No overlap.

---

### Profile Classifier
**Verdict: Retain, unchanged.**
Single responsibility: assigns an `OperationalProfile` label from characteristics. Used by the `ConfigurationEngine` for profile-specific defaults and by the `RecommendationEngine` for prioritization context. No overlap.

---

### Configuration Engine
**Verdict: Retain, unchanged.**
Single responsibility: takes resolved capabilities and a profile → produces `BusinessConfiguration` (configs to write, capabilities to grant, post-setup steps). Pure function. No overlap. No changes needed.

---

### Growth Detection Engine
**Verdict: Removed.** Absorbed into `CharacteristicsEngine` as described above.

---

### Recommendation Engine + Progressive Activation Engine
**Verdict: Merge into one `RecommendationEngine`.**

The proposed architecture has two separate engines with nearly identical jobs:
- Progressive Activation: watches for specific events, offers a single capability when a signal fires
- Recommendation Engine: scores all deferred capabilities, ranks them, delivers via display zones

The practical difference is delivery timing (event-triggered vs. batch-scored). Both produce an offer shown to the user. Both write to `BusinessCapabilityState`. Both respect user dismissals. Both read the same registry.

Merging them produces one system with two trigger modes:
1. **Event-triggered**: fires when a `CHARACTERISTICS_UPDATED` event arrives with relevant changed fields
2. **Scheduled**: runs on a configurable interval to score all deferred capabilities and surface any that crossed the recommendation threshold

One engine, one delivery system, one dismissal store. Cleaner.

---

### Business Health Model
**Verdict: Retain, simplify from 6 stages to 4.**

Six stages (`GETTING_STARTED`, `GROWING`, `OPERATIONAL`, `MANAGED`, `OPTIMIZED`, `ENTERPRISE_READY`) is overengineered for a first implementation. `OPERATIONAL` and `MANAGED` are difficult to distinguish in practice. `OPTIMIZED` and `ENTERPRISE_READY` require data that won't exist for months.

Simplified to four stages that are genuinely distinguishable from day one:

| Stage | Practical Meaning |
|---|---|
| `STARTING` | < 3 months, < 3 capabilities active |
| `ACTIVE` | Core capabilities for the profile are enabled; regular transaction volume |
| `ESTABLISHED` | Operational workflows in use (tasks, approvals, reconciliation); multi-employee |
| `SCALING` | Multi-branch OR very high volume OR API active |

Health stage is used only for recommendation context and the dashboard "next step" hint.
Never shown as a score. Never blocks anything.

---

### User Override Engine
**Verdict: Retain, rename to `CapabilityControl`.**

"Override Engine" sounds like it subverts the system. It doesn't — it's the user's intentional control surface. `CapabilityControl` is clearer: it governs user-directed capability state changes, dismissal preferences, and characteristic corrections.

---

### Business Event Bus
**Verdict: Retain, scope clarified.**

The Event Bus is the connective tissue. It must remain a lightweight in-process pub/sub for this phase — no external queue dependency. External queue (Redis, SQS) is an infrastructure upgrade decision, not an architectural one. The interface is the same; the transport is swappable.

---

## 1B — Revised Nine-Module Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   BUSINESS OPERATING SYSTEM                         │
│                                                                     │
│  DISCOVERY                                                          │
│  ┌──────────────────┐   ┌────────────────────────────────────────┐ │
│  │ Question Registry│──▶│ SurveyInterpreter                      │ │
│  └──────────────────┘   │ SurveyAnswers → BusinessCharacteristics│ │
│                         └───────────────────┬──────────────────── ┘ │
│                                             │                       │
│  INTELLIGENCE                               │                       │
│  ┌──────────────────────────────────────────▼────────────────────┐ │
│  │ CharacteristicsEngine                                          │ │
│  │ All sources → LivingCharacteristics → CharacteristicsSnapshot │ │
│  └──────────────────────────────────────────┬────────────────────┘ │
│                           ┌─────────────────┴──────────────────┐   │
│              ┌────────────▼──────────┐       ┌─────────────────▼─┐ │
│              │ CapabilityResolver    │       │ ProfileClassifier  │ │
│              └────────────┬──────────┘       └─────────────────┬─┘ │
│                           └─────────────────┬───────────────────┘   │
│                    ┌────────────────────────▼───────────────────┐   │
│                    │ ConfigurationEngine                         │   │
│                    └────────────────────────┬───────────────────┘   │
│                                             │                       │
│  ADAPTATION                                 │                       │
│                    ┌────────────────────────▼───────────────────┐   │
│                    │ RecommendationEngine                        │   │
│                    │ (event-triggered + scheduled delivery)      │   │
│                    └────────────────────────┬───────────────────┘   │
│                    ┌────────────────────────▼───────────────────┐   │
│                    │ CapabilityControl                           │   │
│                    │ (user accept/dismiss/pause/correct)         │   │
│                    └────────────────────────────────────────────┘   │
│                                                                     │
│  OBSERVABILITY                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ BusinessEventBus  (in-process pub/sub + persisted log)       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```


---

# Part 2 — Business Digital Twin Evaluation

## Decision: Rejected

The Business Digital Twin was proposed as a canonical representation of the customer's
business — products, inventory strategy, employees, customers, suppliers, sales channels,
operational maturity, and business goals all modeled in one place.

### Why It Sounds Appealing

A Digital Twin would give the platform a unified, queryable model of the business
that every engine could read from. Recommendations, health assessment, and capability
evaluation would all read from one source.

### Why It Is Rejected

**It is the same thing we already have, with an extra abstraction layer.**

`BusinessCharacteristics` is already the platform's canonical model of the business.
It is technology-agnostic, domain-focused, and the stable interface between discovery
and all downstream engines. It describes the business in observable facts:
`sellsPhysicalGoods`, `teamSize`, `inventoryCriticality`, `usesSuppliers`.

A "Digital Twin" would either:
a) Contain the same fields as `BusinessCharacteristics` — making it redundant, or
b) Contain the *actual data* (product catalogue, employee list, customer list) — making
   it a database mirror, not an architectural abstraction.

Option (a) adds a layer without value. Option (b) is a reporting database, not an
architectural primitive for the onboarding and capability system.

**The legitimate concern that motivates the Digital Twin idea is covered:**

The proposal listed these as things the Twin should model:
- Products → already in the DB; `catalogueSize` in characteristics
- Services → `sellsServices` characteristic
- Inventory strategy → `inventoryCriticality` characteristic
- Sales channels → `paymentTiming`, `offersDelivery` characteristics
- Employees → `teamSize`, `hasRoleSeparation` characteristics
- Customers → `tracksCustomers`, `hasLoyaltyIntent` characteristics
- Suppliers → `usesSuppliers`, `requiresGoodsReceipt` characteristics
- Branches → `locationCount`, `plansExpansion` characteristics
- Compliance → `isVatRegistered`, `requiresOfficialReceipts` characteristics
- Operational maturity → `BusinessHealthStage`
- Business goals → covered by `BusinessIntent` (see Part 7)

Every concern is already covered. A Digital Twin adds vocabulary without adding capability.

**Verdict:** `BusinessCharacteristics` (with `LivingCharacteristics` wrapping for sourcing)
*is* the Digital Twin. Call it that internally if it helps communication, but it does not
warrant a separate architectural module or data model.


---

# Part 3 — BusinessCharacteristics Model Review

## Verdict: Approved with one addition

The 28-field model from the master plan is validated as correct. Every field describes
the business in technology-agnostic, feature-independent terms. No field references a
capability key or a config key.

**One addition: Business Intent fields**

Short-term business goals belong in `BusinessCharacteristics` as a lightweight extension.
This avoids the need for a separate Intent engine or data model (see Part 7).

```ts
// Add to BusinessCharacteristics:

// Intent — what the business plans to do next
intentToExpand:          boolean   // plans to open more locations
intentToSellOnline:      boolean   // plans e-commerce or online ordering
intentToOfferDelivery:   boolean   // plans delivery (in-house or third-party)
intentToWholesale:       boolean   // plans B2B wholesale sales
intentToFranchise:       boolean   // plans franchise or multi-operator model
intentToManufacture:     boolean   // plans to manufacture products (not just sell)
```

These are collected from two optional survey questions shown only to businesses that
signal scale (medium/large team, or plansExpansion = true):

> "Are you planning any of these in the next 12 months? (select all that apply)"
> [ ] Selling online (website or app)
> [ ] Delivering to customers
> [ ] Selling in bulk to other businesses
> [ ] Opening a franchise or partner locations
> [ ] Making your own products

Intent fields are `SURVEY_ANSWER` source. They are never derived from observation
(you can't infer intent from behavior alone). They expire after 12 months unless
refreshed. When expired, they revert to `false` — not a negative signal, just
"we don't know anymore."

## Fields to Validate (potential cuts)

| Field | Keep? | Reason |
|---|---|---|
| `catalogueSize` | **Yes** | Drives UI defaults (barcode prominence) and recommendation timing |
| `hasLoyaltyIntent` | **Yes** | Valuable signal for future Loyalty capability; cheap to collect |
| `requiresGoodsReceipt` | **Yes** | Derived from `usesSuppliers && teamSize !== 'solo'`; keep as derived field for clarity |
| `taxDisplayMode` | **Yes** | INCLUSIVE vs EXCLUSIVE is a genuine business distinction, not a platform setting |
| `offersDelivery` | **Yes** | Delivery Management is a future capability; capturing intent early is free |
| `hasCorporateBuyers` | **Yes** | Drives corporate TIN/address fields and invoice format |

No fields cut. All 28 original fields plus 6 intent fields = **34 fields total**.

## Technology-Agnostic Validation

Test: can every field be described to a non-technical business owner without mentioning
any software feature?

```
"Do you track how much stock you have?"          → tracksInventory ✓
"How critical is stock accuracy day-to-day?"    → inventoryCriticality ✓
"Are your prices tax-inclusive?"                 → taxDisplayMode ✓
"Do you store products in multiple areas?"       → hasMultipleStockLocations ✓
"Does any action require a manager's approval?"  → requiresApprovals ✓
```

All fields pass. The model is technology-agnostic.


---

# Part 4 — Capability Registry Final Specification

## Complete Metadata Model

Every capability in the registry must declare all of the following. This is the
binding contract. Code review must reject any capability registration that omits
a required field.

```ts
export type CapabilityDefinition = {
  // ── Identity ───────────────────────────────────────────────────────────────
  id:          string            // Matches CapabilityKey or ConfigKey exactly
  label:       string            // Short human-readable name (developer tooling only)
  description: string            // One sentence, plain business language, no jargon
  category:    CapabilityCategory

  // ── Evaluation (pure — no IO) ──────────────────────────────────────────────
  required:   (c: BusinessCharacteristics) => boolean
  boosters:   Array<{ label: string; signal: (c: BusinessCharacteristics) => number }>
  threshold:  number             // Minimum average booster confidence to auto-enable (0–1)

  // ── Configuration output ───────────────────────────────────────────────────
  outputs: (c: BusinessCharacteristics) => CapabilityOutput[]

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  deferrable:         boolean
  activationSignals?: ActivationSignal[]

  // ── Dependencies ──────────────────────────────────────────────────────────
  hardDependencies: string[]     // Must be ENABLED before this capability can be enabled
  softDependencies: string[]     // Enhance this capability; surface together in recommendations
  conflicts:        string[]     // Cannot coexist; enabling this disables the other

  // ── Plan requirement ───────────────────────────────────────────────────────
  minimumPlan: 'any' | 'Starter' | 'Professional' | 'Enterprise'

  // ── User-facing metadata (shown in recommendations and capability cards) ───
  businessValue:         string  // "What you gain" — outcome, not feature name
  estimatedSetupMinutes: number  // Honest estimate; used in recommendation scoring
  learningCurve:         'minimal' | 'easy' | 'moderate' | 'involved'
  canBePaused:           boolean // false = always-on capabilities (POS, Products)
  canBeSelfServed:       boolean // false = requires admin/support to enable

  // ── Recommendation scoring ─────────────────────────────────────────────────
  recommendationScore: (c: BusinessCharacteristics) => number  // 0–1

  // ── Lifecycle signal detection ────────────────────────────────────────────
  // These are evaluated after enablement to advance lifecycle state
  configuredSignal: (summary: BusinessUsageSummary) => boolean
  // configuredSignal = true → state advances ENABLED → CONFIGURED

  // ── Analytics ─────────────────────────────────────────────────────────────
  trackingEvents: string[]       // Event names emitted when this capability is used
                                  // Used for adoption analytics and AI training data

  // ── Migration ─────────────────────────────────────────────────────────────
  upgradePath?:   string         // Capability ID this replaces or supersedes
  migrationNotes?: string        // What existing data needs to be handled on enable

  // ── AI extension ──────────────────────────────────────────────────────────
  aiHints?: {
    signals: string[]            // BusinessUsageSummary fields relevant to this capability
    outcome: string              // What behavior the AI should optimize for
  }
}
```

## Category Registry

```ts
export const CapabilityCategory = {
  SALES:       'SALES',        // POS, checkout, orders, payments, refunds
  INVENTORY:   'INVENTORY',    // Stock tracking, movements, batch management
  PROCUREMENT: 'PROCUREMENT',  // Suppliers, purchase orders, goods receipt
  OPERATIONS:  'OPERATIONS',   // Tasks, sessions, cash reconciliation
  FINANCE:     'FINANCE',      // Tax, compliance, receipts, reporting
  CUSTOMERS:   'CUSTOMERS',    // CRM, loyalty, customer profiles
  TEAM:        'TEAM',         // Employees, roles, permissions
  ANALYTICS:   'ANALYTICS',    // Reports, dashboards, data export
  PLATFORM:    'PLATFORM',     // Billing, subscription, branches, API
  INTEGRATION: 'INTEGRATION',  // External systems, webhooks, API access
} as const
```

## Registry Governance Rules

1. A capability with `required: () => false` is a **registered future capability**.
   It is in the registry, visible in admin tooling, but never surfaced to users.
   When the feature ships, only the `required` predicate changes.

2. A capability with `canBePaused: false` cannot be moved to PAUSED state by the user.
   Always-on capabilities (COMPLETE_CHECKOUT, MANAGE_PRODUCTS) belong here.

3. `hardDependencies` are enforced at enablement time — the engine will not enable a
   capability if a hard dependency is not in ENABLED or CONFIGURED state.

4. `conflicts` are enforced at recommendation time — conflicting capabilities are not
   simultaneously recommended.

5. Every capability must have at least one `trackingEvent`. Zero tracking events means
   we can never measure adoption and can never train a future model.


---

# Part 5 — Capability Lifecycle Validation

## Simplified to Six States

The proposed eight-state lifecycle (`HIDDEN`, `RECOMMENDED`, `PREVIEW`, `ENABLED`,
`CONFIGURED`, `OPTIMIZED`, `PAUSED`, `DEPRECATED`) had two problems:

**PREVIEW** — In practice, "user expressed interest but hasn't set it up yet" is the
same as RECOMMENDED with a clicked flag. It introduces a UI state that requires
separate handling for no behavioral difference. Cut.

**OPTIMIZED** — "All sub-features active; settings tailored" is an aspirational
descriptor with no clear activation condition. Who decides when something is
"optimized"? The `configuredSignal` in the capability definition already advances
ENABLED → CONFIGURED. There is no reliable, universal "optimized" signal. Cut.
Analytics can track this separately without it being a lifecycle state.

### Final Six States

```
HIDDEN ──────▶ RECOMMENDED ──────▶ ENABLED ──────▶ CONFIGURED
                    │                   │
                    ▼                   ▼
                  HIDDEN              PAUSED ──────▶ DEPRECATED
```

| State | Visible? | Functional? | Meaning |
|---|---|---|---|
| `HIDDEN` | No | No | Not applicable, or was permanently dismissed |
| `RECOMMENDED` | Yes — contextual offer | No | Business signals say this would help; offer shown |
| `ENABLED` | Yes | Yes | Active; not yet deeply used |
| `CONFIGURED` | Yes | Yes | Being actively used; key usage signals met |
| `PAUSED` | Yes — indicator only | No | User disabled; all data preserved |
| `DEPRECATED` | No | No | Feature removed from platform; terminal state |

### Valid Transitions

```ts
const LIFECYCLE_TRANSITIONS: Record<CapabilityLifecycleState, CapabilityLifecycleState[]> = {
  HIDDEN:      ['RECOMMENDED'],
  RECOMMENDED: ['ENABLED', 'HIDDEN'],       // HIDDEN = permanently dismissed
  ENABLED:     ['CONFIGURED', 'PAUSED'],
  CONFIGURED:  ['PAUSED'],
  PAUSED:      ['ENABLED', 'DEPRECATED'],
  DEPRECATED:  [],                          // terminal
}
```

### Notes on the Simplification

- The `configuredSignal` function on each capability definition drives ENABLED → CONFIGURED automatically. The `CharacteristicsEngine` evaluates this when processing usage summaries.
- Recommendations are shown for HIDDEN capabilities (when `required` becomes true and recommendation score is sufficient). The user never explicitly moves to RECOMMENDED — the engine places it there.
- ENABLED → CONFIGURED is system-driven. ENABLED → PAUSED is user-driven. Everything else is either system or user.
- PAUSED → ENABLED restores the capability exactly as it was; no re-configuration required.

### Future-Proofing

New capabilities added to the registry use the same six states. No new states should
be added without clear behavioral differences from existing states. If a future
requirement seems to need a new state, first verify it cannot be expressed as a
combination of the existing six plus metadata on the `BusinessCapabilityState` record.


---

# Part 6 — Evolution Strategy Validation

## The Natural Growth Path

The architecture must support a business growing from Lite POS to full enterprise
operations without any forced migration, re-onboarding, or data loss. This is
validated through the natural capability activation path:

```
START: Lite POS
│  Active: POS, Products, Reports, Transaction History
│  All others: HIDDEN
│
├─ First employee added
│    System: CharacteristicsEngine updates teamSize = 'small'
│    RecommendationEngine: surfaces Cash Reconciliation, Tasks
│
├─ Starts tracking stock (organic)
│    System: inventory adjustment count ≥ 10 → tracksInventory = true
│    RecommendationEngine: surfaces Inventory Tracking
│
├─ Adds supplier
│    System: supplierCount ≥ 1 → usesSuppliers = true
│    RecommendationEngine: surfaces Purchase Orders
│
├─ Processes 1,000 transactions
│    System: volume metric → dailyTransactionVolume = 'medium'
│    Profile: may upgrade from LITE_POS → SIMPLE_RETAILER
│
├─ Hires 5th employee
│    System: employeeCount triggers teamSize = 'medium' via observation rule
│    RecommendationEngine: surfaces Role Separation, Approval Workflows
│
├─ Opens second location
│    Event: BRANCH_CREATED → locationCount = 'multiple' (immediate recalculation)
│    ConfigurationEngine: applies branch management outputs automatically
│    Profile: → MULTI_BRANCH_ENTERPRISE
│    TaskTypes: BRANCH_TRANSFER added
│
├─ Reaches 25 registered customers
│    System: customerCount ≥ 25 → tracksCustomers = true
│    RecommendationEngine: surfaces Customer Profiles, Loyalty (when built)
│
└─ Year 2+: AI features, API access, advanced analytics
     System: flags intent-based recommendations when features ship
```

## The Critical Guarantee

At no point in this evolution does the business:
- Answer a second survey
- Lose data from a previous configuration
- Have features removed without explicit consent
- See a "migration required" prompt
- Experience any breaking configuration change

Profile graduation triggers recommendations, not automatic changes.
User intent overrides all automation.

## Validating the Escape Hatches

Every evolution path has a reversal:
- Any capability can be PAUSED (restoring its pre-enabled state)
- Any characteristic can be manually corrected via the Business Profile editor
- Any recommendation can be permanently dismissed
- Any automatically-derived config value can be overridden in Settings

The system can never get a business into a configuration they can't get out of.

---

# Part 7 — Business Intent

## Decision: Adopt as Characteristic Fields

Business intent — what the business *plans* to do next — should influence future
recommendations without forcing configuration today.

### Why Not a Separate Intent Engine

A dedicated "Intent Engine" would need its own storage model, its own evaluation
logic, and its own event subscriptions. But intent fields are just `BusinessCharacteristics`
values with a 12-month expiry. They are sourced from `SURVEY_ANSWER` source and
collected from one optional multi-select question. No new engine warranted.

### Intent Field Behavior

Intent fields added to `BusinessCharacteristics` (see Part 3):
```
intentToExpand, intentToSellOnline, intentToOfferDelivery,
intentToWholesale, intentToFranchise, intentToManufacture
```

**Collection:** One optional survey question at the end of the discovery survey,
shown only if `teamSize ≠ solo` OR `plansExpansion = true`. Multi-select.

**Source:** `SURVEY_ANSWER` — never derived from observation.

**Expiry:** 12 months from collection. After expiry, reverts to `false`. The platform
shows a prompt: "It's been a year since you set up. Are you still planning to [expand /
sell online / ...]?" One confirmation click refreshes the intent.

**Effect on recommendations:**
- `intentToSellOnline = true` → `API Access` recommendation score receives a +0.3 boost
- `intentToOfferDelivery = true` → `Delivery Management` is pre-queued for when it ships
- `intentToExpand = true` → `Multi-Branch` recommendation triggers earlier
- `intentToWholesale = true` → `Customer Profiles` (corporate buyers) recommendation earlier
- Intent fields do not directly enable any capability. They adjust recommendation scores.

**Can intent change?** Yes. The business profile editor exposes all intent fields.
A business can update intent at any time. The change triggers a recommendation rescore.


---

# Part 8 — Event-Driven Architecture Validation

## Core Domain Events (complete list)

```ts
export const BusinessEventType = {
  // Product catalogue
  PRODUCT_CREATED:         'PRODUCT_CREATED',
  COMPONENT_RECIPE_ADDED:  'COMPONENT_RECIPE_ADDED',
  EXPIRY_PRODUCT_ADDED:    'EXPIRY_PRODUCT_ADDED',

  // Inventory
  INVENTORY_ADJUSTED:      'INVENTORY_ADJUSTED',
  INVENTORY_RECEIVED:      'INVENTORY_RECEIVED',
  STOCK_LOCATION_CREATED:  'STOCK_LOCATION_CREATED',
  WASTE_RECORDED:          'WASTE_RECORDED',

  // Procurement
  SUPPLIER_ADDED:          'SUPPLIER_ADDED',
  PURCHASE_ORDER_CREATED:  'PURCHASE_ORDER_CREATED',
  GOODS_RECEIPT_CONFIRMED: 'GOODS_RECEIPT_CONFIRMED',

  // Sales
  TRANSACTION_COMPLETED:   'TRANSACTION_COMPLETED',
  ORDER_CREATED:           'ORDER_CREATED',
  DELIVERY_ORDER_CREATED:  'DELIVERY_ORDER_CREATED',

  // Customers
  CUSTOMER_REGISTERED:     'CUSTOMER_REGISTERED',

  // Team
  EMPLOYEE_INVITED:        'EMPLOYEE_INVITED',
  APPROVAL_WORKFLOW_USED:  'APPROVAL_WORKFLOW_USED',

  // Operational
  CASH_RECONCILIATION_DONE: 'CASH_RECONCILIATION_DONE',

  // Structure
  BRANCH_CREATED:          'BRANCH_CREATED',

  // Platform
  CHARACTERISTICS_UPDATED: 'CHARACTERISTICS_UPDATED',  // emitted by CharacteristicsEngine
  CAPABILITY_STATE_CHANGED: 'CAPABILITY_STATE_CHANGED', // emitted by CapabilityControl
  CONFIG_CHANGED:          'CONFIG_CHANGED',
  SUBSCRIPTION_CHANGED:    'SUBSCRIPTION_CHANGED',
} as const
```

## Event Removed from Previous Design

`GROWTH_THRESHOLD_CROSSED` is removed. It was a synthetic event emitted by the
Growth Detection Engine (now merged). Its role is replaced by `CHARACTERISTICS_UPDATED`
with a `significantFields` payload indicating which characteristics changed and why.

```ts
type CharacteristicsUpdatedPayload = {
  businessId: string
  version: number
  changedFields: Array<{
    field: keyof BusinessCharacteristics
    previousValue: unknown
    newValue: unknown
    source: CharacteristicSource
    confidence: number
  }>
  previousProfile: OperationalProfile
  newProfile: OperationalProfile           // may equal previousProfile
  profileChanged: boolean
}
```

The `RecommendationEngine` subscribes to `CHARACTERISTICS_UPDATED` and re-evaluates
recommendations whenever characteristics change. It filters on `changedFields` to
determine which capabilities may now have a different recommendation score.

## Event Persistence Policy

All events are written to `BusinessEventLog`. Retention:
- **Raw events:** 90 days (sufficient for `CharacteristicsEngine` recalculation windows)
- **Aggregated summaries** (`BusinessUsageSummary`): indefinite (small row, big value)
- **`CHARACTERISTICS_UPDATED` events:** indefinite (audit trail for characteristic changes)
- **`CAPABILITY_STATE_CHANGED` events:** indefinite (capability history)

## Polling vs Events

The architecture eliminates polling everywhere it can.

| Mechanism | Method |
|---|---|
| Characteristic recalculation | Event-driven (triggered by `BusinessEvent`, deduped by scheduler) |
| Recommendation delivery | Event-driven (`CHARACTERISTICS_UPDATED`) + weekly scheduled sweep |
| Lifecycle state advancement (ENABLED → CONFIGURED) | Weekly job evaluating `configuredSignal` for all businesses |
| Intent expiry | Weekly job checking `observedAt` on intent fields |
| Weekly summary aggregation | Scheduled job; output used by all observation rules |

The weekly jobs are the only remaining polling. They are justified: daily granularity
for lifecycle advancement and summary aggregation is appropriate; sub-daily granularity
adds infrastructure cost without user-visible benefit.


---

# Part 9 — Explainability Model

Every recommendation the platform shows must answer all seven questions in the user's
mental checklist. These are not aspirational — they are required fields on every
`Recommendation` record.

```
1. "Why am I seeing this?"
   → recommendation.reason
   Example: "You've added 3 suppliers and created 8 purchase orders"

2. "What business behavior triggered it?"
   → recommendation.signals[]
   Example: ["3 suppliers added", "8 purchase orders this month"]

3. "What benefit will I gain?"
   → recommendation.businessBenefit (from capability.businessValue)
   Example: "Know when goods arrive, catch discrepancies before they hit your inventory"

4. "How much effort is required?"
   → recommendation.estimatedSetupMinutes + recommendation.learningCurve
   Example: "About 15 minutes to set up, easy to learn"

5. "Can I ignore this?"
   → recommendation.canIgnorePermanently = true (always, with one exception)
   Exception: compliance-critical recommendations (e.g. BIR compliance when VAT-registered)
              have canIgnorePermanently = false; they can only be deferred, not dismissed

6. "Can I enable it later?"
   → Every deferred recommendation persists in BusinessCapabilityState indefinitely
   The answer is always yes

7. "Can I undo it?"
   → recommendation.canBePaused (from capability.canBePaused)
   Example: Cash Reconciliation can be paused; POS Checkout cannot
```

## Explainability as a First-Class UI Component

Every recommendation surface in the UI must include:
- The `reason` field as the headline
- The `signals[]` as supporting evidence ("Based on...")
- The `businessBenefit` as the value proposition
- `estimatedSetupMinutes` in the CTA ("Set up in ~15 min")
- A "Why is this shown?" expandable for users who want full transparency

## Explainability for Characteristic Corrections

When the user opens the Business Profile editor, every characteristic shows its
`evidence` field — the human-readable string from the `SourcedValue` that won the
conflict resolution. Examples:

```
"Tracks inventory" → "Based on 15 inventory adjustments this month"
"Uses suppliers"   → "Based on 3 suppliers in your account"
"Team size: Small" → "Based on 4 active employees"
"VAT registered"   → "Set by you in Settings"
"Payment timing"   → "From your setup survey (Aug 2026)"
```

This surfaces the system's reasoning without requiring the user to understand the
architecture. It also makes errors obvious and easy to correct.

---

# Part 10 — User Control Validation

## Control Surface Completeness Check

| What the user needs to control | Mechanism | Implemented in |
|---|---|---|
| Accept a recommendation | `CapabilityControl.accept()` | RECOMMENDED → ENABLED |
| Dismiss a recommendation | `CapabilityControl.dismiss()` | Shows again after 30 days |
| Delay a recommendation | `CapabilityControl.delay(days)` | Shows after specified days |
| Permanently ignore | `CapabilityControl.ignore()` | RECOMMENDED → HIDDEN |
| Manually enable a capability | `CapabilityControl.enable()` | Any state → ENABLED |
| Manually pause a capability | `CapabilityControl.pause()` | ENABLED/CONFIGURED → PAUSED |
| Restore a paused capability | `CapabilityControl.restore()` | PAUSED → ENABLED |
| Correct an inferred characteristic | Business Profile editor | SURVEY_ANSWER → ADMIN_DECISION source |
| See why something was recommended | Recommendation card + "Why?" expand | Inline in UI |
| See where a characteristic came from | Business Profile editor | Per-field `evidence` string |
| Override a config value | Settings → existing config UI | SystemConfig write |

## Automation Boundaries

Automation is permitted to:
- Change `HIDDEN → RECOMMENDED` (surfacing new offers)
- Change `ENABLED → CONFIGURED` when `configuredSignal` is met
- Update `currentProfile` when characteristics change
- Update `healthStage` weekly
- Emit recommendations

Automation is **forbidden** from:
- Changing `RECOMMENDED → ENABLED` (user must accept)
- Changing `CONFIGURED → PAUSED` (user must pause)
- Overwriting `SYSTEM_CONFIG` or `ADMIN_DECISION` source characteristics
- Removing any user-created data when a capability is paused
- Changing the subscription plan

The boundary is explicit: automation recommends and observes. The user decides and acts.


---

# Part 11 — Incremental Delivery Strategy

## The Constraint

Small engineering team. Every phase must ship a usable product. No big-bang releases.
No phase should depend on more than the immediately preceding phase being complete.

## Phase Map

### Phase 1 — Usable Lite POS (Ship first)
*Goal: Replace the business-type selector. Get businesses into the app faster.*

What ships:
- Adaptive survey UI (Question Registry + survey question tree)
- `SurveyInterpreter` (pure function: answers → `BusinessCharacteristics`)
- `CapabilityResolver` (pure function: characteristics + registry → resolved capabilities)
- `ProfileClassifier` (pure function)
- `ConfigurationEngine` (pure function)
- Updated `complete-registration.ts` (survey answers → engine → config applied)
- Lite POS profile (minimal dashboard, two widgets)
- Shadow-running: old `BUSINESS_TYPE_CONFIGS` path runs in parallel for 30 days

**Team size:** 2 engineers. **Duration estimate:** 3–4 weeks.
**What works after this phase:** New registrations get an adaptive survey. Existing registrations unchanged.

---

### Phase 2 — Inventory + Purchasing (Core operational value)
*Goal: Enable the most common growth path from Lite POS.*

What ships:
- `BusinessEventLog` table + event emission in `create-supplier`, `create-product`, `adjust-inventory`
- `BusinessUsageSummary` aggregation job (weekly, simple count queries)
- `OBSERVATION_RULES` (subset: suppliers, inventory, team size — the high-value ones)
- `CharacteristicsEngine` basic implementation (merges survey + events; no decay yet)
- `BusinessCapabilityState` table
- `RecommendationEngine` v1 — event-triggered only: fires one recommendation per activation signal
- Activation signals: `SUPPLIER_ADDED → offer purchase orders`, `catalogue > 20 → offer inventory`
- Deferred capability delivery UI (recommendation card on relevant page)

**What works after this phase:** A Lite POS business that adds a supplier sees an offer to enable purchase orders. A business with 20+ products sees an offer to enable inventory tracking. One recommendation at a time.

---

### Phase 3 — Full Recommendation Engine + Lifecycle
*Goal: Proactive, prioritized, explainable recommendations.*

What ships:
- Full `CharacteristicsEngine` with all observation rules + conflict resolution
- Confidence decay
- `CHARACTERISTICS_UPDATED` event
- `RecommendationEngine` v2 — scheduled scoring + full display zones
- Recommendation card with `reason`, `signals[]`, `businessBenefit`, `estimatedSetupMinutes`
- `BusinessCapabilityState` lifecycle (HIDDEN, RECOMMENDED, ENABLED, CONFIGURED, PAUSED)
- `CapabilityControl` UI (accept, dismiss, delay, ignore permanently, manual enable/pause)
- ENABLED → CONFIGURED advancement via `configuredSignal`

**What works after this phase:** Businesses receive proactive, scored, explainable recommendations. They can accept, dismiss, or control every offer.

---

### Phase 4 — Business Profile + Intelligence + Health
*Goal: Make the platform's understanding of the business transparent and correctable.*

What ships:
- Business Profile editor in Settings (shows all characteristics with source + evidence)
- Characteristic override via `CapabilityControl` (user correction → ADMIN_DECISION source)
- `BusinessHealthStage` (4 stages) computed weekly, drives dashboard "next step" hint
- Intent fields on `BusinessCharacteristics` + intent question in survey
- Intent expiry job
- `CharacteristicsEngine` backfill job for existing businesses
- `CAPABILITY_STATE_CHANGED` event + full audit trail in `BusinessCapabilityState.stateHistory`

**What works after this phase:** Businesses can see why the platform configured them the way it did. They can correct anything. Health stage provides a non-judgmental "next step."

---

### Phase 5 — Growth Triggers + Profile Evolution
*Goal: The platform proactively recognizes business milestones.*

What ships:
- Growth observation rules in `CharacteristicsEngine` (team growth, volume growth, multi-branch)
- Profile graduation notifications ("Your business has grown — new capabilities available")
- Recommendation score boost on `CHARACTERISTICS_UPDATED` with `profileChanged = true`
- Annual intent refresh prompt
- Recommendation rate-limiting and quiet mode (Phase 4 may ship this earlier if fatigue is observed)
- `OperationalProfile` transitions surfaced in the UI

---

### Phase 6 — AI Extension Points + Analytics
*Goal: Collect clean training data; instrument everything; open the AI seam.*

What ships:
- `AIAdapterInterface` (null implementation by default)
- `trackingEvents` emission for every capability
- Recommendation acceptance/dismissal analytics
- Adoption metrics dashboard (internal: health stage distribution, recommendation acceptance rate)
- Capability utilization reports
- Training data pipeline documentation (for when an ML team is ready)

---

### Summary Table

| Phase | Key Deliverable | Team Size | Est. Duration |
|---|---|---|---|
| 1 | Adaptive survey + Lite POS + engines as pure functions | 2 | 3–4 weeks |
| 2 | Event log + basic recommendations + Inventory/Purchasing | 2–3 | 4–5 weeks |
| 3 | Full recommendation engine + lifecycle + CapabilityControl | 2–3 | 4–6 weeks |
| 4 | Business Profile editor + health model + intent | 2 | 3–4 weeks |
| 5 | Growth detection + profile graduation | 1–2 | 2–3 weeks |
| 6 | AI seam + analytics instrumentation | 1–2 | 2–3 weeks |

Each phase is independently valuable and shippable. Phase 1 alone is a significant UX
improvement over the current business-type selector.


---

# Part 12 — Architecture Quality Review

## Scalability

**Strength:** All engines are pure functions. They scale horizontally without shared state.
The `CharacteristicsEngine` is stateless — it reads inputs and returns a value. Background
jobs can be distributed across workers with no coordination.

**Risk:** `BusinessEventLog` table growth at high transaction volumes.
**Mitigation:** Only structurally significant events are logged (not every transaction).
Transaction volume is tracked via `BusinessUsageSummary` aggregates. The log is
bounded by the 90-day retention policy. An additional read replica for analytics
queries is a standard infrastructure upgrade with no architectural change.

**Risk:** Recalculation jobs create DB load during batch windows.
**Mitigation:** The deduplication scheduler ensures one pending job per business.
Weekly summary jobs run during off-peak hours. The observation rules operate on the
pre-aggregated `BusinessUsageSummary`, not raw event queries.

---

## Maintainability

**Strength:** Adding a capability = one registry entry. Adding an observation rule =
one entry in `OBSERVATION_RULES`. Adding a survey question = one entry in the question
tree + one mapping in `SurveyInterpreter`. No cross-file cascades.

**Risk:** The `CAPABILITY_REGISTRY` grows to hundreds of entries over time without
adequate governance.
**Mitigation:** Registry governance rules (Part 4) require all fields to be populated.
A test suite validates every registry entry at build time (required fields, valid
dependency references, no circular dependencies).

**Risk:** The `CharacteristicsEngine`'s observation rules begin overlapping and
contradicting each other as the list grows.
**Mitigation:** Each rule targets one specific characteristic. The conflict resolver
handles cases where multiple rules fire for the same field — the priority ladder ensures
deterministic resolution. A unit test per rule validates it fires only under its
intended conditions.

---

## Extensibility

**Strength:** The `BusinessCharacteristics` contract is the stable API. Both sides
(survey and capabilities) can evolve independently as long as this interface is respected.

**Strength:** Future capabilities (Loyalty, Delivery, Kitchen Display, Reservations)
are already registered with `required: () => false`. They activate when built with a
one-line change.

**Risk:** New capabilities that need new characteristics require changes to two places
(question tree + `BusinessCharacteristics` type). This is unavoidable but is a known,
bounded cost (typically two files).
**Mitigation:** Documented in a "how to add a capability" guide. TypeScript's type
system enforces that all 34 characteristic fields have safe defaults.

---

## Modularity

**Strength:** Nine modules with explicitly typed inputs and outputs. No module knows
about adjacent modules. Interfaces are all in `types.ts`.

**Weakness:** The `CharacteristicsEngine` has grown to absorb Growth Detection. This
is correct (they share data access patterns) but means it has the most responsibilities
of any single module. It should be organized as sub-modules within one file, not split
into multiple modules (that would reintroduce the coordination overhead we removed).

---

## Testability

**Strength:** All nine engines can be tested with Pattern A (pure function, no DB).
The Application Layer (server functions, jobs) is tested with Pattern C1/C2.
No infrastructure needed to test the core intelligence.

**Key test coverage requirements:**
- Every observation rule: unit test that it fires under its conditions and not others
- Every capability definition: `required` predicate, `boosters`, `outputs`
- `CharacteristicConflictResolver`: priority ordering, confidence threshold, decay
- `ProfileClassifier`: every profile, priority order, edge cases
- `RecommendationEngine`: scoring function, display zone assignment, score thresholds
- `SurveyInterpreter`: every answer-to-characteristic mapping, branching logic

---

## Developer Experience

**Strength:** The `CAPABILITY_REGISTRY` is a single file a developer reads to understand
the entire feature surface of the platform. New engineers onboard by reading this one file.

**Weakness:** The architecture requires developers to understand the difference between
`BusinessCharacteristics` (business facts), `LivingCharacteristics` (sourced facts),
and `CharacteristicsSnapshot` (flat projection). Three representations of the same data.

**Mitigation:** Document clearly that `CharacteristicsSnapshot` is the day-to-day
interface. `LivingCharacteristics` is internal to the `CharacteristicsEngine`.
Most engineers never touch the `LivingCharacteristics` type directly.

---

## Performance

**Strength:** The recommendation path does not run on every page load. Recommendations
are pre-computed and cached in `BusinessCapabilityState`. The UI reads from the state
table; it does not re-invoke the engine.

**Risk:** The initial registration flow now runs five pure engine functions in sequence.
**Mitigation:** All five are pure functions operating on small data structures (28–34
fields). Measured time will be microseconds. Not a real risk.

**Risk:** The weekly `BusinessUsageSummary` aggregation job may be slow for high-volume businesses.
**Mitigation:** The summary is a set of simple COUNT queries against indexed columns.
A single business with 50,000 transactions aggregates in milliseconds. For very large
tenants, run the aggregation on a read replica.

---

## Security

**Strength:** All engines are pure functions with no direct DB access. They cannot
be exploited via DB injection. The Application Layer owns all DB access and is the
security boundary.

**Risk:** The Business Profile editor allows users to override any characteristic.
A malicious user could set `isVatRegistered = false` to avoid compliance workflows.
**Mitigation:** Characteristic overrides are logged with `actorId` and `setAt`. They
are a visible audit trail, not a hidden backdoor. Compliance-critical fields (VAT,
receipt requirements) should have a confirmation prompt before override is accepted.

**Risk:** The `BusinessEventLog` contains business activity data. Read access must
be scoped to the business tenant.
**Mitigation:** All EventLog queries must include a `businessId` filter. This is an
existing pattern in the codebase (every model has `businessId` isolation).

---

## Backward Compatibility

**Strength:** All schema changes are additive (nullable columns, new tables). No
existing column changes. Phase 1 can ship without affecting any existing registration.

**Risk:** The survey `SurveyAnswers` type diverges from the existing `CompleteRegistrationInput`.
**Mitigation:** The shadow-running approach in Phase 1 runs both paths. Old path is
removed only after 30 days of parallel operation confirms parity.

---

## Migration Complexity

**Low.** The migration is:
1. Add new nullable columns to `Business`
2. Add new tables (`BusinessCapabilityState`, `BusinessEventLog`)
3. Run backfill job for existing businesses (Phase 4)
4. Switch registration route input after shadow period (Phase 1)
5. Deprecate `businessType` column after 30 days of stable Phase 1

No data transformation of existing records. No downtime.

---

## Operational Complexity

**Risk:** Three background jobs (weekly summary, weekly lifecycle advancement, weekly
decay + intent expiry) must be monitored and alertable.
**Mitigation:** All three jobs are idempotent — running them twice produces the same
result. Failure of any job delays an update but does not corrupt data. Each job should
have a last-run timestamp and a simple health check endpoint.

---

## Learning Curve

**For engineers:** High initial — the architecture has nine modules, 34 characteristic
fields, a six-state lifecycle, and an event bus. The onboarding guide (see Part 13)
and the well-named types reduce this significantly.

**For the business owner:** Near zero. They answer 8–12 questions. They see offers
at relevant moments. They click to enable or dismiss. The architecture's complexity
is invisible.


---

# Part 13 — Reference Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BUSINESS OPERATING SYSTEM                            │
│                                                                             │
│  ╔════════════════════════╗                                                 │
│  ║     REGISTRATION       ║                                                 │
│  ║  complete-registration ║                                                 │
│  ╚══════════╤═════════════╝                                                 │
│             │ SurveyAnswers                                                 │
│  ┌──────────▼──────────────────────────────────────────────────────────┐   │
│  │ SurveyInterpreter                                                    │   │
│  │ (pure fn: SurveyAnswers → BusinessCharacteristics)                  │   │
│  └──────────┬──────────────────────────────────────────────────────────┘   │
│             │ BusinessCharacteristics (initial)                             │
│  ┌──────────▼──────────────────────────────────────────────────────────┐   │
│  │ CharacteristicsEngine                                                │   │
│  │ ┌─────────────────────┐  ┌────────────────────┐  ┌──────────────┐  │   │
│  │ │ Observation Rules   │  │ Conflict Resolver   │  │ Decay Engine │  │   │
│  │ └─────────────────────┘  └────────────────────┘  └──────────────┘  │   │
│  │ All sources → LivingCharacteristics → CharacteristicsSnapshot       │   │
│  └──────────┬──────────────────────────────────────────────────────────┘   │
│             │ CharacteristicsSnapshot                                        │
│             │                                                               │
│  ┌──────────▼───────────┐    ┌────────────────────────────────────────┐    │
│  │ CapabilityResolver   │    │ ProfileClassifier                       │    │
│  │ Registry → states    │    │ snapshot → OperationalProfile           │    │
│  └──────────┬───────────┘    └────────────────┬───────────────────────┘    │
│             │ ResolvedCapability[]             │ OperationalProfile          │
│             └──────────────┬──────────────────┘                             │
│                   ┌────────▼──────────────────────────────────────────┐     │
│                   │ ConfigurationEngine                                │     │
│                   │ resolved + profile → BusinessConfiguration        │     │
│                   └────────┬──────────────────────────────────────────┘     │
│                            │ BusinessConfiguration                           │
│                   ┌────────▼──────────────────────────────────────────┐     │
│                   │ Database Write (complete-registration.$transaction)│     │
│                   │ SystemConfig, CapabilityState, Business fields     │     │
│                   └───────────────────────────────────────────────────┘     │
│                                                                             │
│  ╔════════════════════════╗                                                 │
│  ║   ONGOING OPERATION    ║                                                 │
│  ╚══════════╤═════════════╝                                                 │
│             │                                                               │
│  ┌──────────▼──────────────────────────────────────────────────────────┐   │
│  │ BusinessEventBus                                                     │   │
│  │ Persists to BusinessEventLog                                        │   │
│  │ Fans out to subscribers: CharacteristicsEngine, RecommendationEngine│   │
│  └──────────┬──────────────────────────────────────────────────────────┘   │
│             │ CHARACTERISTICS_UPDATED event                                  │
│  ┌──────────▼──────────────────────────────────────────────────────────┐   │
│  │ RecommendationEngine                                                 │   │
│  │ ┌─────────────────────┐  ┌──────────────────────┐                  │   │
│  │ │ Event-triggered     │  │ Scheduled sweep       │                  │   │
│  │ │ (on CHAR_UPDATED)   │  │ (weekly full rescore) │                  │   │
│  │ └─────────────────────┘  └──────────────────────┘                  │   │
│  │ Writes to BusinessCapabilityState (RECOMMENDED)                     │   │
│  └──────────┬──────────────────────────────────────────────────────────┘   │
│             │ Recommendations surfaced in UI                                 │
│  ┌──────────▼──────────────────────────────────────────────────────────┐   │
│  │ CapabilityControl                                                    │   │
│  │ accept / dismiss / delay / ignore / pause / restore / correct       │   │
│  │ Writes to BusinessCapabilityState, UserOverride, SystemConfig       │   │
│  │ Emits CAPABILITY_STATE_CHANGED → CharacteristicsEngine re-evaluates │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
Registration path:
  SurveyAnswers
    → SurveyInterpreter → BusinessCharacteristics (initial hypothesis)
    → CharacteristicsEngine (wraps in LivingCharacteristics with SURVEY_ANSWER source)
    → CapabilityResolver → ResolvedCapability[] with initial ENABLED/DEFERRED states
    → ProfileClassifier → OperationalProfile
    → ConfigurationEngine → BusinessConfiguration
    → complete-registration.$transaction (persists everything atomically)

Ongoing operation path:
  ServerFunction (create-supplier, etc.)
    → BusinessEventBus.emit(SUPPLIER_ADDED)
    → BusinessEventLog persisted
    → CharacteristicsEngine.scheduleRecalculation(businessId, 'deferred')

  CharacteristicsEngine (batch, 5-min)
    → Reads BusinessUsageSummary + recent BusinessEventLog
    → Evaluates OBSERVATION_RULES against summary
    → Resolves conflicts via ConflictResolver
    → Applies decay to stale observations
    → Updates livingCharacteristics on Business
    → Emits CHARACTERISTICS_UPDATED

  RecommendationEngine (event-triggered, on CHARACTERISTICS_UPDATED)
    → Reads CharacteristicsSnapshot + current BusinessCapabilityState
    → Evaluates CAPABILITY_REGISTRY for HIDDEN/RECOMMENDED capabilities
    → Scores each candidate
    → Caps at 5 active recommendations
    → Writes recommendations to BusinessCapabilityState (state = RECOMMENDED)

  User sees recommendation card in UI
    → Clicks "Enable"
    → CapabilityControl.accept()
    → Applies CapabilityOutput[] via dbTransaction
    → Updates BusinessCapabilityState (state = ENABLED)
    → Emits CAPABILITY_STATE_CHANGED
    → Session refresh → UI picks up new capability
```

---

## Sequence Diagrams

### 1. New Business Registration

```
User          Survey UI        SurveyInterpreter   CharacteristicsEngine   ConfigurationEngine   DB
 │                │                   │                      │                      │              │
 │──answers──────▶│                   │                      │                      │              │
 │                │──SurveyAnswers───▶│                      │                      │              │
 │                │                   │──BusinessChars──────▶│                      │              │
 │                │                   │                      │──CharSnap────────────▶│              │
 │                │                   │                      │  + resolved caps      │              │
 │                │                   │                      │  + profile            │              │
 │                │                   │                      │             ──Config──▶              │
 │                │                   │                      │                      │──$tx─────────▶│
 │                │                   │                      │                      │  SystemConfig │
 │                │                   │                      │                      │  CapState     │
 │                │                   │                      │                      │  Business     │
 │◀──session──────────────────────────────────────────────────────────────────────────────────────│
```

### 2. Organic Growth — Supplier Added

```
User          ServerFn         EventBus        CharacteristicsEngine   RecommendationEngine   UI
 │                │                │                   │                      │               │
 │──add supplier─▶│                │                   │                      │               │
 │                │──emit──────────▶│                  │                      │               │
 │                │    SUPPLIER_ADDED                  │                      │               │
 │◀──success──────│                │──schedule──────────▶│                    │               │
 │                │                │   (deferred 5min)  │                     │               │
 │                │                │                    │ (5 min later)        │               │
 │                │                │                    │──recalculate         │               │
 │                │                │                    │  usesSuppliers=true  │               │
 │                │                │                    │──emit CHAR_UPDATED──▶│               │
 │                │                │                    │                      │──score caps   │
 │                │                │                    │                      │──write RECO   │
 │                │                │                    │                      │──────────────▶│
 │◀──dashboard────────────────────────────────────────────────────────────────────────────────│
   (next load: "You've added a supplier. Track purchase orders?")
```

### 3. User Accepts a Recommendation

```
User         CapabilityControl     DB              EventBus    Session
 │                  │               │                 │           │
 │──accept────────▶ │               │                 │           │
 │                  │──read outputs │                 │           │
 │                  │──$tx──────────▶                 │           │
 │                  │    SystemConfig writes           │           │
 │                  │    CapState → ENABLED            │           │
 │                  │◀──success─────│                 │           │
 │                  │──emit─────────────────────────▶│           │
 │                  │   CAPABILITY_STATE_CHANGED      │           │
 │                  │──refresh──────────────────────────────────▶│
 │◀──new UI state──────────────────────────────────────────────── │
   (capability's module appears in navigation)
```

### 4. Manual Capability Enable (no recommendation)

```
User       Settings UI     CapabilityControl    CapabilityRegistry    DB
 │               │                 │                    │               │
 │──click enable▶│                 │                    │               │
 │               │──enable()──────▶│                    │               │
 │               │                 │──lookup definition─▶│              │
 │               │                 │◀──outputs─────────── │             │
 │               │                 │──validate hard deps  │             │
 │               │                 │──$tx────────────────────────────▶│
 │               │                 │   outputs applied                  │
 │               │                 │   CapState = ENABLED               │
 │               │                 │   UserOverride recorded            │
 │◀──confirmation─────────────────────────────────────────────────────│
```

### 5. Automatic ENABLED → CONFIGURED Advancement

```
WeeklyJob     CharacteristicsEngine    CapabilityRegistry    DB
    │                  │                      │               │
    │──run─────────────▶│                     │               │
    │                  │──read CapStates (ENABLED businesses) │
    │                  │──for each: eval configuredSignal()──▶│
    │                  │◀──true for Inventory (10+ adjustments)│
    │                  │──update CapState: ENABLED→CONFIGURED──▶│
    │                  │──emit CAPABILITY_STATE_CHANGED         │
    │◀──done────────────│                                      │
```

### 6. Recommendation Generation (Scheduled)

```
WeeklyJob    RecommendationEngine    CharacteristicsEngine    DB
    │                │                        │               │
    │──run───────────▶│                        │              │
    │                │──read all businesses with HIDDEN caps  │
    │                │──for each: getSnapshot()──────────────▶│
    │                │◀──CharacteristicsSnapshot──────────────│
    │                │──CapabilityResolver.resolveAll()        │
    │                │──score each HIDDEN cap                  │
    │                │──filter score > 0.3                     │
    │                │──cap at 5 per business                  │
    │                │──write RECOMMENDED states──────────────▶│
    │◀──done─────────│                                         │
```


---

# Part 14 — Final Component Specifications

This section is the binding contract for implementation. Each component's
responsibility, inputs, outputs, and invariants are stated precisely.

---

## SurveyInterpreter

**File:** `src/lib/onboarding/survey-interpreter.ts`
**Type:** Pure function
**Pattern A testable:** Yes

```
Input:   SurveyAnswers
Output:  BusinessCharacteristics

Invariants:
- Never reads from DB
- Never imports capability keys or config keys
- Every output field has a value (never undefined — safe defaults fill gaps)
- Calling with identical answers always returns identical characteristics
```

---

## CharacteristicsEngine

**File:** `src/lib/evolution/characteristics-engine.ts`
**Type:** Pure computation core; Application Layer owns DB reads/writes
**Pattern A testable:** Yes (core logic); Pattern C1 for job integration

```
Input:   IntelligenceEngineInput {
           surveyAnswers:    SurveyAnswers
           systemConfig:     Partial<ConfigKeyTypes>
           recentEvents:     BusinessEvent[]
           usageSummary:     BusinessUsageSummary
           adminOverrides:   AdminCharacteristicOverride[]
         }
Output:  LivingCharacteristics

Invariants:
- Conflict resolver always returns a winner (never undefined)
- ADMIN_DECISION source always wins regardless of confidence
- SURVEY_ANSWER is never mutated (baseline is read-only)
- Decay only reduces confidence; it never removes a value
- snapshot() projection is always a valid BusinessCharacteristics

Sub-responsibilities (organized as internal modules, not separate files):
  ObservationRules:    evaluates OBSERVATION_RULES registry
  ConflictResolver:    applies priority ladder; handles decay
  RecalcScheduler:     deduplicates recalculation jobs by businessId
```

---

## CapabilityResolver

**File:** `src/lib/onboarding/capability-resolver.ts`
**Type:** Pure function
**Pattern A testable:** Yes

```
Input:   CharacteristicsSnapshot + CapabilityDefinition[] (defaults to CAPABILITY_REGISTRY)
Output:  ResolvedCapability[] {
           id:       string
           status:   'enabled' | 'deferred' | 'not_applicable'
           confidence: number
           outputs:  CapabilityOutput[]
         }

Invariants:
- Every capability in the registry produces exactly one ResolvedCapability
- required() = false → status is always 'not_applicable'
- threshold = 0 with no boosters → status is always 'enabled' (always-on capabilities)
- outputs are only populated when status = 'enabled'
- hardDependency not in ENABLED state → status forced to 'deferred' even if confidence ≥ threshold
```

---

## ProfileClassifier

**File:** `src/lib/onboarding/profile-classifier.ts`
**Type:** Pure function
**Pattern A testable:** Yes

```
Input:   CharacteristicsSnapshot + ResolvedCapability[]
Output:  OperationalProfile

Invariants:
- Always returns a value (GENERAL is the floor)
- Classification is deterministic (no randomness)
- Profile order is explicitly documented; first match wins
```

---

## ConfigurationEngine

**File:** `src/lib/onboarding/configuration-engine.ts`
**Type:** Pure function
**Pattern A testable:** Yes

```
Input:   CharacteristicsSnapshot + ResolvedCapability[] + OperationalProfile
Output:  BusinessConfiguration {
           systemConfigs:         Array<{ key, value, scope }>
           enabledCapabilities:   string[]
           deferredCapabilities:  string[]
           operationalProfile:    OperationalProfile
           suggestedPlan:         'Starter' | 'Professional' | 'Enterprise'
           roles:                 RoleConfiguration
           taskTypesEnabled:      string[]
           notificationsEnabled:  string[]
           dashboardWidgets:      string[]   // ordered
           postSetupSteps:        PostSetupStep[]
         }

Invariants:
- Safe defaults are always the starting point; capability outputs override them
- Profile overrides are applied after capability outputs
- Regional overrides are applied last
- No capability output can unset a value set by a higher-priority source
```

---

## BusinessEventBus

**File:** `src/lib/evolution/business-event-bus.ts`
**Type:** In-process pub/sub + persistence
**Pattern B testable:** Yes (mock the DB write)

```
Input:   BusinessEvent<T>
Output:  void (fire-and-forget to subscribers)

Invariants:
- Every emitted event is persisted to BusinessEventLog before subscribers are notified
- Subscriber failures do not affect the emitting server function (errors are logged, not re-thrown)
- Subscribers receive events in registration order (deterministic, not parallel)
- Event emission must not add meaningful latency to the emitting operation
  (target: < 5ms overhead per emit in normal operation)

Subscriber registration (static, at module load):
  1. CharacteristicsEngine  — watches all structural events
  2. RecommendationEngine   — watches CHARACTERISTICS_UPDATED
```

---

## RecommendationEngine

**File:** `src/lib/evolution/recommendation-engine.ts`
**Type:** Pure scoring core; Application Layer owns DB reads/writes and scheduling
**Pattern A testable:** Yes (scoring logic); Pattern C1 for delivery integration

```
Trigger modes:
  Event-triggered: fires on CHARACTERISTICS_UPDATED (reactive)
  Scheduled:       weekly full rescore for all businesses (proactive)

Input:   CharacteristicsSnapshot
         + Map<capabilityId, CapabilityLifecycleState>
         + BusinessHealthStage
         + UserOverride[]                (dismissed/ignored history)

Output:  Recommendation[] {
           capabilityId:            string
           reason:                  string    // "What we noticed"
           signals:                 string[]  // up to 4 supporting observations
           businessBenefit:         string    // from capability.businessValue
           estimatedSetupMinutes:   number
           learningCurve:           string
           score:                   number    // 0–1
           urgency:                 RecommendationUrgency
           displayZone:             RecommendationZone
           blockedBy?:              string[]  // hard dependency IDs not yet enabled
           canDismiss:              boolean
           canDelay:                boolean
           canIgnorePermanently:    boolean
         }

Invariants:
- Maximum 5 recommendations returned per call
- Permanently ignored capabilities are never in the output
- A capability in ENABLED, CONFIGURED, or PAUSED state is never recommended
- A capability whose hardDependencies are not ENABLED gets blockedBy populated
  and appears at the bottom of the list
- Score is always normalized to [0.0, 1.0]
- displayZone is always deterministic from score thresholds:
    > 0.7  → DASHBOARD_CARD
    > 0.5  → CONTEXTUAL
    > 0.3  → SIDEBAR_HINT
    ≤ 0.3  → SETTINGS_SECTION
```

---

## CapabilityControl

**File:** `src/lib/evolution/capability-control.ts`
**Type:** Application Layer (reads/writes DB)
**Pattern B testable:** Yes

```
Methods:
  accept(businessId, capabilityId, actorId)
    → validates RECOMMENDED state, applies outputs, writes ENABLED, emits event

  dismiss(businessId, capabilityId, actorId)
    → sets dismissedAt; remains RECOMMENDED but hidden for 30 days

  delay(businessId, capabilityId, actorId, days)
    → sets remindAfter = now + days

  ignore(businessId, capabilityId, actorId)
    → sets permanentlyIgnored = true; state stays RECOMMENDED (never surfaces again)

  enable(businessId, capabilityId, actorId)
    → manual enable from any state; applies outputs; writes ENABLED; records UserOverride

  pause(businessId, capabilityId, actorId)
    → validates canBePaused = true; writes PAUSED; does NOT delete any data

  restore(businessId, capabilityId, actorId)
    → writes ENABLED from PAUSED; re-applies outputs if needed

  correctCharacteristic(businessId, field, value, actorId, reason?)
    → writes ADMIN_DECISION source to LivingCharacteristics
    → triggers immediate CharacteristicsEngine recalculation

Invariants:
- accept() validates all hardDependencies are ENABLED before proceeding
- pause() is rejected if capability.canBePaused = false
- All methods write to UserOverride log (audit trail)
- All methods emit CAPABILITY_STATE_CHANGED event
```

---

# Part 15 — The Ten Non-Negotiable Rules

These are the architectural invariants that must survive every future change,
every new engineer, and every product pivot. They are the skeleton of the architecture.

**1. The survey never references features.**
No question ID, question text, or answer option should contain a capability key,
config key, or module name. Enforce in code review by text search.

**2. All engines are pure functions.**
`SurveyInterpreter`, `CapabilityResolver`, `ProfileClassifier`, `ConfigurationEngine`,
`CharacteristicsEngine` (core), `RecommendationEngine` (scoring) — no DB calls, no HTTP
calls, no side effects. A function that produces the same output for the same input.
This is what makes the architecture testable without infrastructure.

**3. Capabilities are self-describing.**
No if/else capability logic outside `CAPABILITY_REGISTRY`. If you find yourself
writing `if capability === 'MANAGE_INVENTORY' then ...` anywhere outside the registry
definition, it is a violation.

**4. `BusinessCharacteristics` is the stable API.**
Nothing on the survey side (question tree, answer keys, `SurveyInterpreter`) should
import anything from the capability side (registry, resolver, config engine). Nothing
on the capability side should import anything from the survey side. The `BusinessCharacteristics`
type is the only crossing point.

**5. User intent always wins.**
`ADMIN_DECISION` source always has the highest priority in conflict resolution.
No automated observation can override a value the user explicitly set.

**6. Automation recommends; users decide.**
The state transition `RECOMMENDED → ENABLED` is always user-triggered. Nothing in the
system makes this transition automatically. Ever.

**7. Profile graduation never applies configs.**
A change to `currentProfile` triggers recommendations. It writes nothing to `SystemConfig`
and enables nothing in `BusinessCapabilityState`. Users choose what to adopt.

**8. Pausing a capability preserves all data.**
PAUSED means "the UI hides this and the user can't use it." It does not mean "delete
the data behind it." A business that pauses inventory tracking still has all their
inventory records. Restoring makes them available again.

**9. Every capability has a `trackingEvent`.**
A capability with no analytics instrumentation is a capability we cannot improve.
Required field. No exceptions.

**10. New capabilities require only registry registration.**
When a new feature is built, the developer adds one entry to `CAPABILITY_REGISTRY`.
They do not touch the survey, the `SurveyInterpreter`, the `ProfileClassifier`,
or the `ConfigurationEngine`. If they need to, the architecture has been violated.
The only exception: if the capability requires a new `BusinessCharacteristics` field,
two files change (the type + the survey). This is documented, expected, and bounded.


---

# Part 16 — Final Schema

The complete set of database changes required to implement this architecture.
All existing tables and columns are unchanged unless explicitly noted.

## New Tables

```prisma
// Capability lifecycle state per business
model BusinessCapabilityState {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  capabilityId String   // matches CapabilityDefinition.id

  // Current lifecycle state
  state              String    // CapabilityLifecycleState: HIDDEN|RECOMMENDED|ENABLED|CONFIGURED|PAUSED|DEPRECATED
  confidence         Float     @default(0)
  enteredAt          DateTime  @default(now())
  enteredBy          String?   // userId or 'system'

  // Recommendation metadata (populated when state = RECOMMENDED)
  recommendationScore   Float?
  recommendationReason  String?

  // User control preferences
  dismissedAt        DateTime?
  dismissalCount     Int       @default(0)
  permanentlyIgnored Boolean   @default(false)
  remindAfter        DateTime? // for DELAY action

  // Audit trail
  previousState  String?
  stateHistory   Json?    // Array<{ state, changedAt, changedBy, reason }>

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([businessId, capabilityId])
  @@index([businessId, state])
  @@index([businessId, permanentlyIgnored])
  @@map("business_capability_states")
}

// Persisted event log for observation and replay
model BusinessEventLog {
  id         String   @id @default(cuid())
  type       String   // BusinessEventType value
  businessId String
  branchId   String?
  actorId    String?  // null = system-generated
  occurredAt DateTime @default(now())
  payload    Json

  @@index([businessId, occurredAt])
  @@index([type, businessId])
  @@index([businessId, type, occurredAt]) // for observation rule queries
  @@map("business_event_log")
}

// Weekly aggregated usage summary (materialized, not computed on-demand)
model BusinessUsageSummary {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  periodEnd  DateTime // the Sunday of the week this summary covers

  // Counts used by observation rules
  totalTransactions          Int @default(0)
  transactionsLast30Days     Int @default(0)
  purchaseOrderCount         Int @default(0)
  inventoryAdjustmentCount   Int @default(0)
  taskCount                  Int @default(0)
  employeeCount              Int @default(0)
  branchCount                Int @default(0)
  supplierCount              Int @default(0)
  customerCount              Int @default(0)
  productCount               Int @default(0)
  variantCount               Int @default(0)
  componentRecipeCount       Int @default(0)
  wasteRecordCount           Int @default(0)
  reconciliationCount        Int @default(0)
  deliveryOrderCount         Int @default(0)
  approvalWorkflowUsageCount Int @default(0)

  createdAt DateTime @default(now())

  @@unique([businessId, periodEnd])
  @@index([businessId, periodEnd])
  @@map("business_usage_summaries")
}
```

## New Columns on Business

```prisma
model Business {
  // === ALL EXISTING FIELDS UNCHANGED ===

  // Living characteristics (written by CharacteristicsEngine)
  livingCharacteristics      Json?     // LivingCharacteristics — validated by Zod at read time
  characteristicsVersion     Int       @default(0)
  characteristicsComputedAt  DateTime?

  // Profile and health (written by CharacteristicsEngine + RecommendationEngine)
  currentProfile    String?   // OperationalProfile — live, updates on graduation
  healthStage       String?   // BusinessHealthStage — updates weekly

  // Onboarding metadata
  onboardingSurveyAnswers    Json?     // SurveyAnswers — written once at registration
  onboardingProfile          String?   // initial OperationalProfile — never changes
  onboardingCompletedAt      DateTime?
  onboardingVariantId        String?   // A/B experiment ID

  // Deprecated (retained for backward compat; never written by new code)
  // businessType BusinessType  // @deprecated — use currentProfile

  // Relations
  capabilityStates    BusinessCapabilityState[]
  eventLog            BusinessEventLog[]
  usageSummaries      BusinessUsageSummary[]
}
```

## Migration Notes

1. `businessType` column is NOT dropped in the initial migration. It is marked
   deprecated in schema comments. Dropped after Phase 1 shadow period confirms parity.
2. `deferredCapabilities String[]` from the previous design is NOT added — it is
   replaced by `BusinessCapabilityState` rows with `state = 'RECOMMENDED'`.
3. All new columns on `Business` are nullable with safe defaults — zero migration risk.
4. `BusinessUsageSummary` is new — backfilled by the Phase 2 weekly job on first run.

---

# Part 17 — How to Add a New Capability

This is the developer guide. It should be a three-step process.

## Step 1 — Add the CapabilityKey

In `src/lib/entitlement/capability-keys.ts`:
```ts
export const Capabilities = {
  // ... existing ...
  LOYALTY_POINTS: 'LOYALTY_POINTS',  // add here
} as const
```

## Step 2 — Register in CAPABILITY_REGISTRY

In `src/lib/onboarding/capability-registry.ts`, add one entry:
```ts
{
  id: 'LOYALTY_POINTS',
  label: 'Loyalty and Points',
  description: 'Reward returning customers with points they can redeem on future purchases.',
  category: CapabilityCategory.CUSTOMERS,

  required: c => c.tracksCustomers || c.hasLoyaltyIntent,
  boosters: [
    { label: 'Loyalty intent', signal: c => c.hasLoyaltyIntent ? 1.0 : 0 },
    { label: 'Tracks customers',signal: c => c.tracksCustomers ? 0.6 : 0 },
  ],
  threshold: 0.5,

  outputs: () => [
    { type: 'feature_flag', key: 'LOYALTY_POINTS', value: true },
    { type: 'config', key: 'ENABLE_LOYALTY', value: true, scope: 'BUSINESS' },
  ],

  deferrable: true,
  activationSignals: [
    {
      event: 'CUSTOMER_REGISTERED',
      threshold: 10,
      offerMessage: 'You have 10 customers. Reward them with loyalty points?',
    },
  ],

  hardDependencies: ['MANAGE_CUSTOMERS'],
  softDependencies: ['VIEW_ANALYTICS'],
  conflicts: [],
  minimumPlan: 'Starter',

  businessValue: 'Give customers a reason to come back. Points increase visit frequency.',
  estimatedSetupMinutes: 10,
  learningCurve: 'easy',
  canBePaused: true,
  canBeSelfServed: true,

  recommendationScore: c =>
    (c.tracksCustomers ? 0.5 : 0) + (c.hasLoyaltyIntent ? 0.4 : 0),

  configuredSignal: s => s.customerCount >= 20,

  trackingEvents: ['loyalty_points_enabled', 'loyalty_redemption_processed'],

  aiHints: {
    signals: ['customerCount', 'transactionsLast30Days'],
    outcome: 'Increase customer return rate and transaction frequency.',
  },
},
```

## Step 3 — Add Feature record to the database seeder

In `prisma/seeders/entitlements.ts`, add the feature record so the `EntitlementEngine`
can gate it and plan entitlements can include it.

**That is all.** The survey does not change. The `SurveyInterpreter` does not change.
The `ProfileClassifier` does not change. The `ConfigurationEngine` does not change.
The new capability flows through the pipeline automatically on the next
`CharacteristicsEngine` evaluation.

## Special Case: New Capability Needs a New Characteristic

If the capability requires a signal the current 34 fields don't cover:

**Step 0a** — Add the field to `BusinessCharacteristics` in `types.ts`
**Step 0b** — Add its safe default to `DEFAULT_CHARACTERISTICS`
**Step 0c** — Add an answer mapping in `SurveyInterpreter.derive()` (and optionally
a question to the survey tree if it cannot be inferred from usage)
**Step 0d** — Optionally add an observation rule in `OBSERVATION_RULES` if it can
be derived from usage

Then proceed with Steps 1–3 as normal. Maximum two extra files changed.

---

# Part 18 — What the Architecture Looks Like in 10 Years

The question posed at the start: *can we build exactly this, and will it support the
platform for ten years without fundamental redesign?*

The answer is yes, with one qualification. Here is the reasoning.

## What Remains Stable

**`BusinessCharacteristics`** — This is the most stable thing in the architecture.
Business operations in 2036 will still involve selling things, managing stock, working
with teams, handling compliance, and growing to new locations. The field names may
expand (new characteristics for new business models) but the model's structure —
factual, technology-agnostic, sourced — will not need to change.

**The six lifecycle states** — HIDDEN, RECOMMENDED, ENABLED, CONFIGURED, PAUSED,
DEPRECATED cover every meaningful state a feature can be in for any foreseeable
business context. They are not POS-specific; they are platform-generic.

**The capability registry pattern** — Self-describing capabilities with `required`,
`boosters`, `outputs`, and `activationSignals` is a general pattern that works for
any capability type: features, integrations, compliance modules, AI tools.

**The source priority system** — The decision that `ADMIN_DECISION > SYSTEM_CONFIG >
USAGE_OBSERVATION > BUSINESS_EVENT > SURVEY_ANSWER > AI_INFERENCE` is not
POS-specific. It is a general epistemological priority ordering (explicit > configured
> observed > inferred) that holds for any domain.

## What Will Need Extension, Not Redesign

**New capabilities** — The architecture is explicitly designed for this. Register
and done.

**New characteristics** — Will be needed as new business models emerge (manufacturing,
marketplace, franchise). Adding a field to `BusinessCharacteristics` is additive.

**AI model integration** — The `AIAdapterInterface` seam is already there. Plugging
in a model is a single implementation behind the existing interface.

**New observation rules** — Adding to `OBSERVATION_RULES` requires zero changes to
any engine. Purely additive.

**New profiles** — Adding a profile to `ProfileClassifier` is additive.

## The One Qualification

The `BusinessEventLog` and `BusinessUsageSummary` tables will grow. At meaningful
scale (10,000+ active businesses), the weekly aggregation job will need a read
replica and pagination. This is an infrastructure scaling concern, not an
architectural one. The interface (read the summary, run the rules, write the result)
does not change. Only the infrastructure underneath it scales.

The architecture does not need to be redesigned for scale. It needs infrastructure
investment. Those are different problems.

## The Verdict

**Build exactly this. It will last.**

The constraints that would force a fundamental redesign are:
1. A fundamental change in how businesses operate (no product line exists that doesn't
   have customers, inventory, staff, or transactions in some form)
2. A requirement that capabilities configure themselves without any user input
   (contradicts user control — the intentional design decision)
3. A requirement for real-time, sub-second characteristic updates
   (the batch/event model handles this with 5-minute latency for most updates; true
   real-time would require a streaming infrastructure upgrade, not an architectural change)

None of these are realistic constraints for a POS/BOS platform. The architecture is sound.


---

# Part 19 — Changes to ONBOARDING_MASTER_PLAN.md

This review produces the following concrete changes to the master plan.
The master plan should be updated to reflect these decisions.

## Changes Required

| Section | Change |
|---|---|
| Part 5 — Architecture Overview | Update to 9-module diagram; remove Growth Detection as separate module |
| Part 6 — Business Intelligence Engine | Rename section to "CharacteristicsEngine"; add growth observation rules as subsection |
| Part 10 — Growth Detection Engine | Remove section; content merged into CharacteristicsEngine section |
| Part 11 — Recommendation Engine | Update to reflect absorption of Progressive Activation; two trigger modes documented |
| Part 14 — Progressive Activation Engine | Remove section; content merged into Recommendation Engine section |
| Part 3 — BusinessCharacteristics | Add 6 intent fields; update field count to 34 |
| Part 8 — Capability Lifecycle | Update to 6 states; remove PREVIEW and OPTIMIZED; update transitions |
| Part 12 — Business Health Model | Update to 4 stages; remove GROWING, OPERATIONAL, MANAGED, ENTERPRISE_READY; add STARTING, ACTIVE, ESTABLISHED, SCALING |
| Part 13 — User Override Engine | Rename to CapabilityControl throughout |
| Part 19 — Schema Changes | Add BusinessUsageSummary table; remove deferredCapabilities String[] field |
| Part 20 — Implementation Phasing | Replace with the 6-phase plan from this document |
| Part 23 — File Map | Update to reflect consolidated file structure |

## What Does NOT Change

- Part 1 — Capability Inventory (complete; no changes)
- Part 2 — Capability Dependency Graph (accurate; no changes)
- Part 4 — Adaptive Survey Design (the question tree is validated; no changes)
- Part 16 — Operational Profiles (validated; no changes)
- Part 17 — Lite POS (validated; no changes)
- Part 18 — Evolution Scenarios (validated; no changes)
- Part 21 — Migration from Current System (valid; no changes)
- The ten non-negotiable rules (new in this document; to be added to master plan)

---

# Appendix — Glossary

For any engineer reading the codebase for the first time.

| Term | Definition |
|---|---|
| `BusinessCharacteristics` | The 34-field technology-agnostic description of a business. The stable API between survey and capabilities. |
| `LivingCharacteristics` | The sourced version of `BusinessCharacteristics` — each field wrapped in `SourcedValue<T>` with provenance and confidence. Internal to `CharacteristicsEngine`. |
| `CharacteristicsSnapshot` | A flat projection of `LivingCharacteristics` that downstream pure engines use. Backward-compatible with plain `BusinessCharacteristics`. |
| `SourcedValue<T>` | A value plus its source (where it came from), confidence (0–1), observedAt date, and evidence string. |
| `CharacteristicSource` | Enum: ADMIN_DECISION > SYSTEM_CONFIG > USAGE_OBSERVATION > BUSINESS_EVENT > SURVEY_ANSWER > AI_INFERENCE |
| `CapabilityDefinition` | A full self-describing registry entry for one capability. The single source of truth for what a capability needs and what it produces. |
| `CAPABILITY_REGISTRY` | The array of all `CapabilityDefinition` entries. Reading this one array tells you everything the platform can do. |
| `ResolvedCapability` | The output of evaluating one capability definition against characteristics: `{ id, status, confidence, outputs }` |
| `CapabilityLifecycleState` | One of: HIDDEN, RECOMMENDED, ENABLED, CONFIGURED, PAUSED, DEPRECATED |
| `OperationalProfile` | A named archetype (LITE_POS, FOOD_AND_BEVERAGE, etc.) that emerges from characteristics. Never selected by the user. |
| `BusinessHealthStage` | One of: STARTING, ACTIVE, ESTABLISHED, SCALING. Guides recommendations. Never shown as a score. Never blocks functionality. |
| `BusinessEventBus` | In-process pub/sub. Events are emitted from server functions, persisted to `BusinessEventLog`, and fanned out to registered subscribers. |
| `CharacteristicsEngine` | The engine that merges all evidence sources into `LivingCharacteristics`. Also evaluates observation rules. Also schedules recalculations. |
| `RecommendationEngine` | Scores deferred capabilities against the current snapshot; produces prioritized, explained `Recommendation[]`; handles both event-triggered and scheduled delivery. |
| `CapabilityControl` | The user-facing control layer: accept, dismiss, delay, ignore, enable, pause, restore, correct characteristics. |
| `OBSERVATION_RULES` | The data-driven registry of conditions that update characteristics from usage evidence. `CharacteristicsEngine` evaluates these. |
| `configuredSignal` | A function on each `CapabilityDefinition` that returns `true` when the capability is being actively used. Drives ENABLED → CONFIGURED transition. |
| `BusinessUsageSummary` | A weekly aggregated snapshot of counts (transactions, suppliers, employees, etc.). The input to observation rules. |
| Shadow running | Phase 1 technique: run both old `BUSINESS_TYPE_CONFIGS` path and new engine path in parallel; apply old path; log diffs for 30 days; then switch. |

---

*End of Document*

**Status:** Architecture Readiness Review — Complete.
**Decision:** Approved. Build Phase 1.

**Two documents govern the platform:**
1. `ONBOARDING_MASTER_PLAN.md` — the complete feature and survey reference (update with changes listed in Part 19)
2. `ARCHITECTURE_REVIEW.md` (this document) — the definitive implementation contract

When these conflict, `ARCHITECTURE_REVIEW.md` takes precedence.
