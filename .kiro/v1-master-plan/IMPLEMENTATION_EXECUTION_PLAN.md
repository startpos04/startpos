# IMPLEMENTATION EXECUTION PLAN
## StartPOS — SaaS Foundation

> **Source of Truth:** `v1-master-plan.md` (Parts 2–8)
> **Date:** July 31, 2026
> **Status:** Phases 0–5 complete. Section 6 Architecture Compliance Integration complete. ✅
> **Scope:** SaaS monetization infrastructure — subscription lifecycle, entitlement enforcement,
>   usage tracking, billing, prepaid credits, external billing integration, and composable pricing.
> **Operational Domain Status:** Phases A–F complete. All ADRs active (ADR-001–010). Compliance audit passed.
> **Author role:** Principal architect — pre-implementation planning only. No code is written here.

---

## Table of Contents

- [IMPLEMENTATION EXECUTION PLAN](#implementation-execution-plan)
  - [StartPOS — SaaS Foundation](#startpos--saas-foundation)
  - [Table of Contents](#table-of-contents)
  - [1. Executive Summary](#1-executive-summary)
    - [Implementation Goals](#implementation-goals)
    - [Implementation Philosophy](#implementation-philosophy)
    - [Expected Milestones](#expected-milestones)
    - [Execution Strategy](#execution-strategy)
    - [Guiding Principles](#guiding-principles)
  - [2. Current Project Assessment](#2-current-project-assessment)
    - [2.1 Operational Domain — Fully Implemented](#21-operational-domain--fully-implemented)
    - [2.2 SaaS Foundation — Entitlement Layer (Partially Implemented)](#22-saas-foundation--entitlement-layer-partially-implemented)
    - [2.3 SaaS Foundation — Billing Layer (Partially Implemented)](#23-saas-foundation--billing-layer-partially-implemented)
    - [2.4 SaaS Foundation — Composable Pricing Layer ✅ COMPLETE](#24-saas-foundation--composable-pricing-layer--complete)
    - [2.5 Existing Schema vs Spec Delta — BusinessSubscription](#25-existing-schema-vs-spec-delta--businesssubscription)
  - [3. Dependency Analysis](#3-dependency-analysis)
    - [3.1 Implementation Dependency Graph](#31-implementation-dependency-graph)
    - [3.2 Dependency Rationale](#32-dependency-rationale)
    - [3.3 Parallel Work Opportunities](#33-parallel-work-opportunities)
  - [4. Critical Path](#4-critical-path)
    - [4.1 Critical Path — Must Complete In Order](#41-critical-path--must-complete-in-order)
    - [4.2 Parallel Work (Safe to Develop Alongside Critical Path)](#42-parallel-work-safe-to-develop-alongside-critical-path)
    - [4.3 Optional Work (Can Ship After Initial Release)](#43-optional-work-can-ship-after-initial-release)
    - [4.4 Future Work (Out of Scope for SaaS Foundation)](#44-future-work-out-of-scope-for-saas-foundation)
  - [5. Implementation Phases](#5-implementation-phases)
    - [Phase 0 — Subscription Lifecycle Foundation ✅ COMPLETE](#phase-0--subscription-lifecycle-foundation--complete)
    - [Phase 1 — UI Enforcement + Billing Dashboard](#phase-1--ui-enforcement--billing-dashboard)
    - [Phase 1 — UI Enforcement + Billing Dashboard ✅ COMPLETE](#phase-1--ui-enforcement--billing-dashboard--complete)
    - [Phase 2 — Usage Tracking + Monthly Billing Foundation ✅ COMPLETE](#phase-2--usage-tracking--monthly-billing-foundation--complete)
    - [Phase 3 — Prepaid Credits ✅ COMPLETE](#phase-3--prepaid-credits--complete)
    - [Phase 4 — External Billing Integration ✅ COMPLETE](#phase-4--external-billing-integration--complete)
    - [Phase 5 — Composable Feature-Based Pricing ✅ COMPLETE](#phase-5--composable-feature-based-pricing--complete)
  - [6. Architecture Compliance Integration ✅ COMPLETE](#6-architecture-compliance-integration--complete)
    - [6.1 Deferred Remediation Items — Impact on SaaS Phases](#61-deferred-remediation-items--impact-on-saas-phases)
    - [6.2 Recommended Compliance Execution Order for SaaS Phases](#62-recommended-compliance-execution-order-for-saas-phases)
    - [6.3 New ADRs — Phase 5 and Phase 6 ✅ COMPLETE](#63-new-adrs--phase-5-and-phase-6--complete)
  - [7. File Impact Analysis](#7-file-impact-analysis)
    - [Phase 0 File Impact ✅ COMPLETE](#phase-0-file-impact--complete)
    - [Phase 1 File Impact ✅ COMPLETE](#phase-1-file-impact--complete)
    - [Phase 2 File Impact ✅ COMPLETE](#phase-2-file-impact--complete)
    - [Phase 3 File Impact ✅ COMPLETE](#phase-3-file-impact--complete)
    - [Phase 4 File Impact ✅ COMPLETE](#phase-4-file-impact--complete)
    - [Phase 5 File Impact (Summary) ✅ COMPLETE](#phase-5-file-impact-summary--complete)
  - [8. Prisma Migration Strategy](#8-prisma-migration-strategy)
    - [Migration 12 — Phase 0: Subscription Lifecycle Foundation](#migration-12--phase-0-subscription-lifecycle-foundation)
    - [Migration 13 — Phase 2: Usage Tracking + Billing Foundation](#migration-13--phase-2-usage-tracking--billing-foundation)
    - [Migration 14 — Phase 3: Prepaid Credits](#migration-14--phase-3-prepaid-credits)
    - [Migration 15 — Phase 5: Composable Pricing](#migration-15--phase-5-composable-pricing)
    - [Migration Order Summary](#migration-order-summary)
    - [Cross-Migration Rules](#cross-migration-rules)
  - [9. Testing Strategy](#9-testing-strategy)
    - [9.1 Phase 0 — Subscription Lifecycle Foundation](#91-phase-0--subscription-lifecycle-foundation)
    - [9.2 Phase 1 — UI Enforcement + Billing Dashboard](#92-phase-1--ui-enforcement--billing-dashboard)
    - [9.3 Phase 2 — Usage Tracking + Monthly Billing Foundation](#93-phase-2--usage-tracking--monthly-billing-foundation)
    - [9.4 Phase 3 — Prepaid Credits](#94-phase-3--prepaid-credits)
    - [9.5 Phase 4 — External Billing Integration](#95-phase-4--external-billing-integration)
    - [9.6 Phase 5 — Composable Feature-Based Pricing](#96-phase-5--composable-feature-based-pricing)
  - [10. Risk Assessment](#10-risk-assessment)
    - [R1 — TX Increment Breaks Offline Behavior](#r1--tx-increment-breaks-offline-behavior)
    - [R2 — Credit Balance Race Condition](#r2--credit-balance-race-condition)
    - [R3 — PricingEngine Imports Infrastructure (Phase 5)](#r3--pricingengine-imports-infrastructure-phase-5)
    - [R4 — Migration 15 is Too Large (Phase 5)](#r4--migration-15-is-too-large-phase-5)
    - [R5 — Webhook Idempotency Failure (Phase 4)](#r5--webhook-idempotency-failure-phase-4)
    - [R6 — Feature Dependency Cycle in Composable Pricing (Phase 5)](#r6--feature-dependency-cycle-in-composable-pricing-phase-5)
    - [R7 — BusinessSubscription Simplified Model Diverges from Spec (Phase 0)](#r7--businesssubscription-simplified-model-diverges-from-spec-phase-0)
    - [R8 — Trial Auto-Provisioning Affects Existing Businesses (Phase 0)](#r8--trial-auto-provisioning-affects-existing-businesses-phase-0)
  - [11. Architecture Compliance Gates](#11-architecture-compliance-gates)
    - [Universal Gates (Every Phase)](#universal-gates-every-phase)
    - [Phase-Specific Gates](#phase-specific-gates)
  - [12. Documentation Synchronization](#12-documentation-synchronization)
    - [Phase 0](#phase-0)
    - [Phase 1](#phase-1)
    - [Phase 2](#phase-2)
    - [Phase 3](#phase-3)
    - [Phase 4](#phase-4)
    - [Phase 5](#phase-5)
    - [Ongoing Sync Rules](#ongoing-sync-rules)
  - [13. Pull Request Strategy](#13-pull-request-strategy)
    - [Phase 0 PRs ✅ COMPLETE](#phase-0-prs--complete)
    - [Phase 1 PRs ✅ COMPLETE](#phase-1-prs--complete)
    - [Phase 2 PRs ✅ COMPLETE](#phase-2-prs--complete)
    - [Phase 3 PRs ✅ COMPLETE](#phase-3-prs--complete)
    - [Phase 4 PRs ✅ COMPLETE](#phase-4-prs--complete)
    - [Phase 5 PRs ✅ COMPLETE](#phase-5-prs--complete)
  - [14. Recommended Implementation Order](#14-recommended-implementation-order)
    - [Phase Completion Criteria Summary](#phase-completion-criteria-summary)
  - [15. Current Scope vs Future Scope](#15-current-scope-vs-future-scope)
    - [15.1 Current Scope — Required for Initial SaaS Release](#151-current-scope--required-for-initial-saas-release)
    - [15.2 Future Scope — Intentionally Deferred](#152-future-scope--intentionally-deferred)
    - [15.3 Clean Deferral Boundary](#153-clean-deferral-boundary)
  - [Appendix A — Directory Structure After All Phases Complete](#appendix-a--directory-structure-after-all-phases-complete)
  - [Appendix B — SCHEMA\_VERSION Tracking](#appendix-b--schema_version-tracking)
  - [Appendix C — Quick Reference: What Exists vs What is Needed](#appendix-c--quick-reference-what-exists-vs-what-is-needed)

---

## 1. Executive Summary

### Implementation Goals

Transform the existing StartPOS platform from a fully operational POS system with a stubbed entitlement layer into a production-ready SaaS platform with monetizable subscription tiers, usage-based billing, prepaid credits, and a composable feature-pricing model.

The operational domain (Phases A–F) is complete. The SaaS Foundation is the next major implementation milestone. It does not modify any operational domain code. It is an additive build on top of the existing, stable foundation.

### Implementation Philosophy

- **Architecture First.** Every implementation decision defers to `v1-master-plan.md`. No alternatives are invented here.
- **Incremental and Independently Deployable.** Each phase leaves the application in a working state. No phase requires another to be simultaneously in flight.
- **Existing Patterns Only.** New engines follow the Engine pattern. New value objects follow the existing TS const-object pattern. No new frameworks are introduced.
- **No Operational Regression.** The operational domain (inventory, tasks, purchasing, receiving, sessions) must not be broken by any billing phase.
- **Database-Driven Configuration.** No monetary amounts, thresholds, or policy values are hardcoded. All live in `SystemConfig` or the Prisma schema.

### Expected Milestones

| Milestone | Phases | Outcome |
|---|---|---|
| Subscription Lifecycle Active | Phase 0 + Phase 1 | Trial provisioning, lifecycle transitions, UI restriction enforcement |
| Usage Tracking Live | Phase 2 | Every POS transaction increments a counter; TX allowance enforced |
| Prepaid Credits Live | Phase 3 | Credit deduction on checkout; low-balance alerts; credit purchase flow |
| External Billing Live | Phase 4 | Payment provider integration; automated invoice generation |
| Composable Pricing Live | Phase 5 | PricingEngine, PricingCatalog, pricing calculator, quote lifecycle |

### Execution Strategy

Phases 0–3 are sequential and build the core subscription infrastructure. Phase 4 (external billing) can begin in parallel with the tail of Phase 3. Phase 5 (composable pricing) depends on Phase 4 being complete and is the most complex phase.

### Guiding Principles

Ten architectural principles govern all decisions throughout implementation (from `v1-master-plan.md` Part 7.11): Architecture First, Incremental Implementation, Continuous Validation, Business Engine Architecture, Domain-Driven Design, Separation of Concerns, Infrastructure Independence, Database-Driven Configuration, Backward Compatibility, Small Reviewable Changes.

---

## 2. Current Project Assessment

The following assessment is based on direct code inspection of the repository as of July 31, 2026.

### 2.1 Operational Domain — Fully Implemented

All operational phases are complete. The SaaS Foundation builds on top of these without modifying them.

| Capability | Status | Notes |
|---|---|---|
| InventoryEngine (single-owner mutations) | ✅ Implemented | `src/lib/inventory/inventory-engine.ts` |
| Task lifecycle (DRAFT→REVIEWED) | ✅ Implemented | `task-workflow.ts` using `createWorkflow()` |
| Purchase lifecycle + GRN receiving domain | ✅ Implemented | `purchase-workflow.ts`, `receipt-workflow.ts` |
| `createWorkflow()` framework | ✅ Implemented | `src/lib/workflow.ts` — 3 consumers |
| `OperationResult` / `result.ts` | ✅ Implemented | `src/lib/result.ts` |
| NotificationEngine domain boundary | ✅ Implemented | ADR-004 applied |
| Reconciliation lifecycle fix | ✅ Implemented | B4/B5 complete |

### 2.2 SaaS Foundation — Entitlement Layer (Partially Implemented)

| Capability | Status | Notes |
|---|---|---|
| `EntitlementEngine` (pure, complete) | ✅ Implemented | `src/lib/entitlement/entitlement-engine.ts` — all 8 evaluation steps |
| `CapabilityKey` constants | ✅ Implemented | `src/lib/entitlement/capability-keys.ts` — 24 capabilities |
| `EntitlementTypes` (context, result, summary) | ✅ Implemented | `src/lib/entitlement/entitlement-types.ts` |
| `Feature` + `SubscriptionPlan` + `PlanEntitlement` schema | ✅ Implemented | In `schema.prisma` |
| `EntitlementOverride` schema | ✅ Implemented | In `schema.prisma` |
| `BusinessSubscription` schema (expanded) | ✅ Implemented — Phase 0 | `billingModel`, `gracePeriodEndsAt`, `expiredAt`, `longTermInactiveAt`, `cancelReason`, `externalId` added |
| `SubscriptionStatus` enum | ✅ Implemented | In `schema.prisma` and `entitlement-types.ts` |
| `getAuthUser` entitlement assembly | ✅ Implemented — Phase 0 | Reads lifecycle fields; trial auto-provisioning wired |
| Feature + Plan seed data | ✅ Implemented | `prisma/seeders/entitlements.ts` |
| `authStore` carries `entitlement` summary | ✅ Implemented — Phase 1 | `auth-store.ts` → `ServerUser` type; `trialEndsAt` + `currentPeriodEnd` added in Phase 1 |
| UI capability gating via `entitlement.capabilities` | ✅ Implemented — Phase 1 | Sidebar, tasks route, POS, orders all gated; `SubscriptionBanner` wired globally |

### 2.3 SaaS Foundation — Billing Layer (Partially Implemented)

| Capability | Status | Notes |
|---|---|---|
| `BillingModel` enum | ✅ Implemented — Phase 0 | In `schema.prisma` + `src/lib/billing/types.ts` |
| `SubscriptionStatusHistory` model | ✅ Implemented — Phase 0 | In `schema.prisma`; written on every transition |
| `UsageCounter` model | ✅ Implemented — Phase 2 | In `schema.prisma`; TX counter per billing period |
| `CreditLedger` model | ✅ Implemented — Phase 3 | In `schema.prisma`; prepaid credit tracking |
| `BillingInvoice` + `BillingInvoiceItem` models | ✅ Implemented — Phase 2 | In `schema.prisma`; invoice records |
| `BusinessSubscriptionFeature` model | ✅ Implemented — Phase 5 | Composable plan snapshot at quote conversion |
| TX increment in `createPosTransaction` | ✅ Implemented — Phase 2 | Synchronous UsageCounter increment on checkout |
| `SubscriptionEngine` | ✅ Implemented — Phase 0 | `src/lib/billing/subscription-engine.ts` — full state machine |
| `BillingPeriod` value object | ✅ Implemented — Phase 0 | `src/lib/billing/value-objects/billing-period.ts` |
| `SubscriptionPolicy` | ✅ Implemented — Phase 0 | `src/lib/billing/policies/subscription-policy.ts` |
| `UsageEngine` | ✅ Implemented — Phase 2 | `src/lib/billing/usage-engine.ts` |
| `CreditEngine` | ✅ Implemented — Phase 3 | `src/lib/billing/credit-engine.ts` |
| `InvoiceEngine` | ✅ Implemented — Phase 2 | `src/lib/billing/invoice-engine.ts` |
| `PlanEngine` | ✅ Implemented — Phase 1 | `src/lib/billing/plan-engine.ts` — plan comparison, upgrade/downgrade eligibility |
| Subscription lifecycle background job | ✅ Implemented — Phase 0 | `src/lib/jobs/subscription-lifecycle.ts` |
| Job runner infrastructure | ✅ Implemented — Phase 0 | `src/lib/jobs/index.ts` |
| `/billing` route and all sub-routes | ✅ Implemented — Phase 1 | `/billing` dashboard, `billing/route.tsx` layout, `/subscription/reactivate` shell |
| `businessSubscriptionCollection` (offline) | ✅ Implemented — Phase 0 | Eager sync, SCHEMA_VERSION 12 |
| `usageCounterCollection` (offline) | ✅ Implemented — Phase 2 | Eager sync; added to `collections.ts` |
| `featureCollection` (offline) | ✅ Implemented — Phase 5 | Eager sync; added to `collections.ts`, SCHEMA_VERSION 15 |
| Entitlement middleware for server functions | ✅ Implemented — Phase 6 | `src/lib/better-auth/entitlement-middleware.ts`; factory `entitlementMiddleware(capability)` |
| Trial auto-provisioning on business creation | ✅ Implemented — Phase 0 | `getAuthUser` auto-provisions TRIAL on first login |
| Billing policy config defaults seeded | ✅ Implemented — Phase 0 | `prisma/seeders/entitlements.ts` Step 3 |

### 2.4 SaaS Foundation — Composable Pricing Layer ✅ COMPLETE

| Capability | Status | Notes |
|---|---|---|
| `PricingCatalog` + `CatalogStatus` enum | ✅ Implemented — Phase 5 | `schema.prisma`; versioned catalog with ACTIVE/DRAFT/ARCHIVED states |
| `FeaturePrice` model | ✅ Implemented — Phase 5 | Per-feature per-catalog pricing in `schema.prisma` |
| `FeatureDependency` model | ✅ Implemented — Phase 5 | Dependency graph in `schema.prisma` |
| `FeatureBundle` + `FeatureBundleItem` models | ✅ Implemented — Phase 5 | Bundle definitions in `schema.prisma` |
| `FeatureBundleVersion` + `BundlePricingType` enum | ✅ Implemented — Phase 5 | Versioned bundle discounts in `schema.prisma` |
| `PricingQuote` + `QuoteStatus` enum | ✅ Implemented — Phase 5 | Full quote lifecycle in `schema.prisma` |
| `PricingQuoteItem` + `QuoteLineType` enum | ✅ Implemented — Phase 5 | Quote line items in `schema.prisma` |
| `PricingEngine` + all pricing strategies | ✅ Implemented — Phase 5 | `src/lib/billing/pricing/pricing-engine.ts`; all 5 strategies |
| `PricingCatalogRepository` | ✅ Implemented — Phase 5 | `src/lib/billing/pricing/pricing-catalog-repository.ts` |
| Pricing value objects (`PricingResult`, `TaxBreakdownLine`, `PriceChangeNotice`) | ✅ Implemented — Phase 5 | `src/lib/billing/pricing/value-objects/` |
| `/billing/pricing` calculator route | ✅ Implemented — Phase 5 | Server-side calculation only; no client-side price logic |
| `/billing/quotes` and `/$quoteId` routes | ✅ Implemented — Phase 5 | Quote list + detail with accept/convert/decline |
| Pricing-related ConfigKey entries | ✅ Implemented — Phase 5 | 7 composable keys added to enum + `src/lib/types.ts` |
| Feature model composable fields | ✅ Implemented — Phase 5 | `isSelectableByCustomer`, `pricingCategory`, `sortOrder` on `Feature` |
| `featureDependencyCollection` (offline) | ✅ Implemented — Phase 5 | On-demand sync; added to `collections.ts` |
| `featureBundleCollection` (offline) | ✅ Implemented — Phase 5 | On-demand sync; added to `collections.ts` |
| `pricing-quote-expiry` background job | ✅ Implemented — Phase 5 | `src/lib/jobs/pricing-quote-expiry.ts` |
| `composable-renewal-preview` background job | ✅ Implemented — Phase 5 | `src/lib/jobs/composable-renewal-preview.ts` |

### 2.5 Existing Schema vs Spec Delta — BusinessSubscription

The `BusinessSubscription` model is now fully expanded as of Phase 0.

| Field | Current State | Required by Spec |
|---|---|---|
| `status` | ✅ Present | ✅ |
| `trialEndsAt` | ✅ Present | ✅ |
| `currentPeriodStart` | ✅ Present | ✅ |
| `currentPeriodEnd` | ✅ Present | ✅ |
| `txUsedThisPeriod` | ✅ Present (deprecated) | Replaced by `UsageCounter` in Phase 2 |
| `creditBalance` | ✅ Present (deprecated) | Replaced by `CreditLedger` in Phase 3 |
| `billingModel` | ✅ Implemented — Phase 0 | ✅ |
| `gracePeriodEndsAt` | ✅ Implemented — Phase 0 | ✅ |
| `longTermInactiveAt` | ✅ Implemented — Phase 0 | ✅ |
| `expiredAt` | ✅ Implemented — Phase 0 | ✅ |
| `cancelReason` | ✅ Implemented — Phase 0 | ✅ |
| `externalId` | ✅ Implemented — Phase 0 | ✅ (used in Phase 4) |
| Relations to UsageCounter, CreditLedger, BillingInvoice, BusinessSubscriptionFeature | ✅ Implemented — Phases 2–5 | Relations added in Migrations 13–15; all four models linked to `BusinessSubscription` |

---

## 3. Dependency Analysis

### 3.1 Implementation Dependency Graph

```
[ Entitlement Foundation ]  ← already complete (Phase F)
            ↓
[ Phase 0 — Subscription Lifecycle Foundation ]
  BusinessSubscription expansion
  SubscriptionStatusHistory
  BillingModel enum
  ConfigKey billing policy keys
  SubscriptionEngine (lifecycle rules)
  Trial auto-provisioning
  Lifecycle background job (TRIAL→EXPIRED→LONG_TERM_INACTIVE)
            ↓
[ Phase 1 — UI Enforcement + Billing Route ]
  Subscription-aware UI restrictions
  /billing route (status, plan details)
  /subscription/reactivate route
  businessSubscriptionCollection (offline eager)
            ↓
[ Phase 2 — Usage Tracking + Monthly Billing ]
  UsageCounter model
  TX increment in createPosTransaction
  UsageEngine
  Usage counter reset background job
  TX allowance enforcement in EntitlementEngine
  /billing extended with usage stats
  BillingInvoice + BillingInvoiceItem models
  usageCounterCollection (offline eager)
            ↓
[ Phase 3 — Prepaid Credits ]
  CreditLedger model
  Credit deduction in createPosTransaction
  Low-balance notification
  /billing/credits route
  creditLedgerCollection (offline on-demand)
            ↓
[ Phase 4 — External Billing Integration ]
  Billing provider adapter interface
  Webhook handler for payment events
  /billing/invoices route
  Automated invoice generation job
  Credit package purchase flow
            ↓
[ Phase 5 — Composable Feature-Based Pricing ]
  Feature model expansion (isSelectableByCustomer, pricingCategory, sortOrder)
  FeaturePrice model + PricingCategory enum
  PricingCatalog model + CatalogStatus enum
  FeatureDependency model
  FeatureBundle + FeatureBundleItem models
  FeatureBundleVersion + BundlePricingType enum
  BusinessSubscriptionFeature model
  PricingQuote + QuoteStatus enum
  PricingQuoteItem + QuoteLineType enum
  PricingEngine + all 5 pricing strategies
  PricingCatalogRepository
  PricingResult, TaxBreakdownLine, PriceChangeNotice value objects
  EntitlementEngine extension (BusinessSubscriptionFeature path)
  /billing/pricing calculator
  /billing/quotes + /$quoteId
  pricing-quote-expiry background job
  composable-renewal-preview background job
```

### 3.2 Dependency Rationale

| Dependency | Why It Exists |
|---|---|
| Entitlement Foundation → Phase 0 | `EntitlementEngine` must understand subscription status before lifecycle transitions can block features. The engine is complete; Phase 0 wires real lifecycle transitions to it. |
| Phase 0 → Phase 1 | UI enforcement and the `/billing` route need `BusinessSubscription` fully expanded and `SubscriptionEngine` wired before they can react to subscription state. |
| Phase 1 → Phase 2 | Usage tracking requires the subscription's billing period boundaries (`currentPeriodStart`, `currentPeriodEnd`) to be reliably populated — which requires Phase 0's lifecycle machinery to be in place first. |
| Phase 2 → Phase 3 | Prepaid credits coexist with or replace TX allowance tracking. `createPosTransaction` must already have the usage increment hook in place (Phase 2) before layering the credit deduction logic (Phase 3). |
| Phase 3 → Phase 4 | The external billing integration is responsible for generating invoices from usage counters and overage charges produced in Phase 2/3. Invoice generation requires those counters to be live and accurate. |
| Phase 4 → Phase 5 | Composable pricing requires a payment provider to collect payments for quote-based subscriptions. The billing provider adapter (Phase 4) is a prerequisite for quote conversion. |

### 3.3 Parallel Work Opportunities

The following work streams can proceed in parallel with each other:

- **Value objects and engine stubs** (`BillingPeriod`, `CreditBalance`, `UsageSummary`, etc.) can be created as empty shells at any time — they have no schema dependencies.
- **Route scaffolding** (empty `/billing` layout, sub-route shells) can be created in Phase 1 and extended in later phases without blocking schema work.
- **Background job infrastructure** (`src/lib/jobs/` directory, job runner pattern) can be established in Phase 0 and extended with new jobs in each subsequent phase.
- **Phase 4 billing provider adapter interface** can be designed and stubbed during Phase 3 without waiting for it to be fully wired.

---

## 4. Critical Path

### 4.1 Critical Path — Must Complete In Order

The following sequence cannot be parallelized. Each item is a hard blocker for the next.

```
1. BusinessSubscription model expansion (Phase 0 schema)
   → Without this, lifecycle fields don't exist; SubscriptionEngine can't be built.

2. SubscriptionEngine + trial auto-provisioning (Phase 0 domain)
   → Without this, new businesses have no subscription; EntitlementEngine falls back to open-context forever.

3. Subscription lifecycle background job (Phase 0 infrastructure)
   → Without this, TRIAL→EXPIRED→LONG_TERM_INACTIVE transitions never happen automatically.

4. UI enforcement + /billing route (Phase 1)
   → Without this, expired subscriptions still have full operational access.

5. UsageCounter model + TX increment in createPosTransaction (Phase 2 schema + wiring)
   → Without this, monthly billing has no data to bill from.

6. BillingInvoice model + InvoiceEngine (Phase 2 domain)
   → Without this, no invoices can be generated.

7. Usage counter reset background job (Phase 2 infrastructure)
   → Without this, counters never reset and TX remaining hits zero permanently after the first period.

8. CreditLedger model + CreditEngine (Phase 3 schema + domain)
   → Without this, prepaid billing model is impossible to activate.

9. Billing provider adapter (Phase 4 infrastructure)
   → Without this, automated invoice payment and credit purchases have no collection mechanism.

10. PricingCatalog + FeaturePrice + PricingEngine (Phase 5 schema + domain)
    → Without this, composable subscriptions cannot be calculated or quoted.
```

### 4.2 Parallel Work (Safe to Develop Alongside Critical Path)

- Value object files (`billing-period.ts`, `credit-balance.ts`, `usage-summary.ts`) — no schema dependency
- Billing route scaffolding and layout components — no engine dependency
- `src/lib/jobs/` directory setup and job runner pattern — no schema dependency
- `SubscriptionStatusHistory` model — additive; does not block any other migration
- Billing provider adapter interface definition — no schema dependency
- `FeatureDependency` model — additive; does not block other Phase 5 work until `PricingEngine` is built
- Pricing strategy file stubs — no schema dependency

### 4.3 Optional Work (Can Ship After Initial Release)

- `SubscriptionStatusHistory` audit log UI (the model is on the critical path; the UI is not)
- `PlanEngine` (plan comparison, upgrade/downgrade eligibility) — useful for `/billing` upgrade CTA but not required for enforcement
- Rep-assisted quote builder (Platform Administration) — Phase 5 delivers self-service first; rep tooling is a follow-on
- `PromotionalPricingStrategy` — can be added to `PricingEngine` after the other four strategies are stable

### 4.4 Future Work (Out of Scope for SaaS Foundation)

See Section 15 for the full deferred scope list.

---

## 5. Implementation Phases

---

### Phase 0 — Subscription Lifecycle Foundation ✅ COMPLETE

**Objective:** Make the `BusinessSubscription` model production-grade. Introduce `SubscriptionEngine` with all lifecycle rules. Wire trial auto-provisioning. Establish the background job infrastructure. After this phase, every business has a subscription record and lifecycle transitions happen automatically.

**Delivered:**
- ✅ `BusinessSubscription` expanded: `billingModel`, `gracePeriodEndsAt`, `expiredAt`, `longTermInactiveAt`, `cancelReason`, `externalId`, `statusHistory` relation
- ✅ `BillingModel` enum added to schema and `src/lib/billing/types.ts`
- ✅ `SubscriptionStatusHistory` model added — immutable audit log
- ✅ `SubscriptionEngine` — full state machine with `canTransition`, `evaluateTrialExpiry`, `evaluateGracePeriodExpiry`, `evaluateLongTermInactivity`, `buildInitialSubscription`
- ✅ `BillingPeriod` value object (`src/lib/billing/value-objects/billing-period.ts`)
- ✅ `SubscriptionStatusVO` value object (`src/lib/billing/value-objects/subscription-status.ts`)
- ✅ `SubscriptionPolicy` (`src/lib/billing/policies/subscription-policy.ts`)
- ✅ `src/lib/billing/types.ts` — `LifecycleThresholds`, `SubscriptionSnapshot`, `StatusTransitionRecord`
- ✅ `src/lib/jobs/index.ts` — `JobResult` type, `jobSuccess`/`jobError` helpers
- ✅ `src/lib/jobs/subscription-lifecycle.ts` — idempotent daily lifecycle job
- ✅ `businessSubscriptionCollection` added to `collections.ts` (eager), SCHEMA_VERSION bumped 11→12
- ✅ `getAuthUser` — trial auto-provisioning on first login + lifecycle fields in entitlement context
- ✅ Billing policy config defaults seeded (`TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`, `CREDIT_LOW_BALANCE_THRESHOLD`, `OVERAGE_BILLING_ENABLED`)
- ✅ Zero TypeScript errors in all Phase 0 files

---

### Phase 1 — UI Enforcement + Billing Dashboard

**Scope:**
- Expand `BusinessSubscription` model with all missing lifecycle fields
- Add `BillingModel` enum and `SubscriptionStatusHistory` model
- Add billing policy `ConfigKey` entries (`TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`)
- Implement `SubscriptionEngine` with: lifecycle state validation, transition rules, grace period logic
- Implement `BillingPeriod` value object
- Implement trial auto-provisioning: when a `Business` is created, a `BusinessSubscription` at `TRIAL` status is created
- Implement `src/lib/jobs/subscription-lifecycle.ts` background job: `TRIAL→EXPIRED`, `EXPIRED→LONG_TERM_INACTIVE`
- Establish `src/lib/jobs/` directory with a shared job runner pattern
- Update `getAuthUser` to populate the new lifecycle fields in `EntitlementContext`
- Add `businessSubscriptionCollection` to `collections.ts` (sync mode: `eager`)

**New Files:**
```
src/lib/billing/subscription-engine.ts
src/lib/billing/types.ts
src/lib/billing/value-objects/billing-period.ts
src/lib/billing/value-objects/subscription-status.ts
src/lib/billing/policies/subscription-policy.ts
src/lib/jobs/subscription-lifecycle.ts
src/lib/jobs/index.ts   ← shared job runner helper
```

**Files to Modify:**
```
prisma/schema.prisma                       ← BusinessSubscription expansion + new models/enums
src/db/collections.ts                      ← businessSubscriptionCollection
src/lib/better-auth/auth-server.ts         ← populate new lifecycle fields
src/lib/types.ts                           ← ConfigKey additions (billing policy keys)
prisma/seeders/entitlements.ts             ← default seed for TRIAL_DURATION_DAYS, GRACE_PERIOD_DAYS, etc.
```

**Schema Changes (Migration 12):**
- `BusinessSubscription`: add `billingModel`, `gracePeriodEndsAt`, `longTermInactiveAt`, `expiredAt`, `cancelReason`, `externalId`
- New enum: `BillingModel` (MONTHLY_SUBSCRIPTION, PREPAID_CREDITS, HYBRID, COMPOSABLE_FEATURES)
- New model: `SubscriptionStatusHistory`
- `ConfigKey` enum: add 3 billing policy keys

**Complexity:** Medium — schema migration plus one new engine, one new job, one new collection.

**Risks:**
- The `txUsedThisPeriod` and `creditBalance` columns currently on `BusinessSubscription` will be superseded by `UsageCounter` and `CreditLedger` models in Phase 2/3. They must remain in Phase 0 to avoid breaking `getAuthUser` entitlement assembly. A deprecation comment should be added but no removal yet.
- Trial auto-provisioning must be idempotent — existing businesses without a subscription record must be gracefully handled on next login (open-context fallback remains active).

**Validation Steps:**
1. `prisma validate` and `prisma generate` pass with zero errors
2. A new `Business` record triggers creation of a `TRIAL` `BusinessSubscription`
3. `SubscriptionEngine.canTransition(TRIAL, EXPIRED)` returns `opOk`
4. `SubscriptionEngine.canTransition(ACTIVE, TRIAL)` returns `opFail`
5. Background job correctly transitions a `TRIAL` subscription past `trialEndsAt` to `EXPIRED`
6. Background job correctly transitions an `EXPIRED` subscription past `LONG_TERM_INACTIVE_DAYS` to `LONG_TERM_INACTIVE`
7. `SubscriptionStatusHistory` record written for every transition
8. `getAuthUser` returns the correct `entitlement.status` for both TRIAL and EXPIRED businesses

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics on all new and modified files
- Existing operational E2E tests still pass (no regression)

---

### Phase 1 — UI Enforcement + Billing Dashboard ✅ COMPLETE

**Objective:** Surface subscription status in the UI. Block operational features when the subscription is EXPIRED or LONG_TERM_INACTIVE. Introduce the `/billing` route. After this phase, the entitlement engine's enforcement is visible to users.

**Delivered:**
- ✅ `EntitlementSummary` extended: `trialEndsAt` and `currentPeriodEnd` fields added
- ✅ `EntitlementEngine.buildSummary` updated to accept and populate lifecycle date metadata
- ✅ `getAuthUser` passes `trialEndsAt` + `currentPeriodEnd` from subscription record into `buildSummary`
- ✅ `SubscriptionBanner` — warning/expired/trial-countdown banner wired into `(private)/route.tsx`
- ✅ `FeatureDisabled` — blocked-feature placeholder with `useSubscriptionGate` hook (static imports, no `require()`)
- ✅ `PlanEngine` — plan comparison, upgrade/downgrade eligibility, price/TX formatters (read-only)
- ✅ `/billing` route: status card, trial countdown + progress bar, period end, TX remaining, plan feature list, upgrade/reactivate CTAs
- ✅ `/billing/route.tsx` — layout wrapper (no role gate — EXPIRED admins must reach it)
- ✅ `/subscription/reactivate` — standalone full-page escape hatch for LONG_TERM_INACTIVE/EXPIRED/CANCELLED; suspended path routes to support contact
- ✅ Sidebar: Billing link (ADMIN only) + `SubscriptionStatusFooter` status badge when not ACTIVE
- ✅ POS route (`/pos`) gated via `useSubscriptionGate` — blocked when operationally inactive
- ✅ Orders route (`/orders`) gated via `useSubscriptionGate` — blocked when operationally inactive
- ✅ Zero TypeScript diagnostics on all new and modified files

**Scope:**
- Add subscription-aware restriction banners (warning for GRACE_PERIOD, hard block for EXPIRED)
- Block operational routes/buttons via `entitlement.capabilities` when subscription is lapsed
- Introduce `/billing` route: subscription status card, plan details, trial countdown
- Introduce `/subscription/reactivate` route: minimal UI shell for reactivation CTA
- Add `ENABLE_FEATURE_DISABLED_PAGE` pattern (or equivalent) for blocked operational pages
- Update sidebar to reflect subscription state (visual indicator, upgrade CTA)
- Implement `PlanEngine` (plan comparison, upgrade eligibility — read-only, no mutations yet)

**New Files:**
```
src/routes/(private)/(dashboard)/billing/index.tsx
src/routes/(private)/(dashboard)/billing/route.tsx
src/routes/subscription/reactivate/index.tsx
src/lib/billing/plan-engine.ts
src/components/subscription-banner.tsx    ← warning/expired banner component
src/components/feature-disabled.tsx       ← blocked feature placeholder
```

**Files to Modify:**
```
src/routes/(private)/route.tsx            ← inject subscription banner
src/routes/(private)/(dashboard)/route.tsx  ← sidebar subscription state
routeTree.gen.ts                          ← regenerated by TanStack Router
```

**Schema Changes:** None. This phase is purely UI and domain engine.

**Complexity:** Low-Medium — UI work plus one engine; no schema changes.

**Risks:**
- The `/billing` route must be accessible regardless of subscription status (management capability). Ensure `MANAGE_BILLING` capability is always granted even in EXPIRED state.
- The reactivation route must not require an active subscription to render — it is the escape hatch.

**Validation Steps:**
1. A business with `status = EXPIRED` cannot access `/pos`, `/orders`, or any operational route
2. A business with `status = EXPIRED` CAN access `/billing`, `/transactions`, `/sales-reports`
3. A business with `status = GRACE_PERIOD` sees the warning banner but retains full operational access
4. The `/subscription/reactivate` page renders for LONG_TERM_INACTIVE businesses
5. The `/billing` page correctly reads and displays `subscription.status` and `trialEndsAt`
6. Sidebar shows an upgrade CTA when status is TRIAL (within last 7 days) or EXPIRED

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics
- Existing E2E tests pass

---

### Phase 2 — Usage Tracking + Monthly Billing Foundation ✅ COMPLETE

**Objective:** Count every POS transaction against the business's billing period allowance. Generate billing invoices. Wire the TX allowance check into the entitlement engine's live path. After this phase, monthly subscription billing is fully operational.

**Delivered:**
- ✅ `UsageCounter` model + `BillingInvoice` + `BillingInvoiceItem` models added to `schema.prisma` (Migration 13)
- ✅ `Transaction.usageCounterId` nullable FK added
- ✅ `OVERAGE_BILLING_ENABLED` ConfigKey added to schema
- ✅ `UsageEngine` — synchronous increment, exhaustion check, counter lifecycle (`src/lib/billing/usage-engine.ts`)
- ✅ `InvoiceEngine` — invoice construction, line item assembly, overage calculation (`src/lib/billing/invoice-engine.ts`)
- ✅ `UsageSummary` value object (`src/lib/billing/value-objects/usage-summary.ts`)
- ✅ `CreditBalance` value object stub (`src/lib/billing/value-objects/credit-balance.ts`) — promoted to full in Phase 3
- ✅ `usage-counter-reset.ts` background job (`src/lib/jobs/usage-counter-reset.ts`)
- ✅ `usageCounterCollection` added to `collections.ts` (eager, SCHEMA_VERSION 13)
- ✅ TX increment wired into `createPosTransaction` inside `dbTransaction` — synchronous, offline-safe
- ✅ `getAuthUser` reads `txRemaining` from `UsageCounter` (not deprecated `BusinessSubscription.txUsedThisPeriod`)
- ✅ `/billing` route extended with usage stats and period progress
- ✅ Zero TypeScript diagnostics on all Phase 2 files

**Scope:**
- Add `UsageCounter` model to schema
- Add `BillingInvoice` + `BillingInvoiceItem` models to schema
- Add `Transaction.usageCounterId` nullable FK
- Add remaining billing `ConfigKey` entries (`OVERAGE_BILLING_ENABLED`)
- Implement `UsageEngine`: period boundary calculations, counter increment logic, allowance exhaustion check
- Implement `InvoiceEngine`: invoice construction, line item assembly, overage calculation
- Wire TX increment into `createPosTransaction` — inside the existing `dbTransaction` callback
- Wire TX allowance check into `EntitlementEngine` (currently the check exists in the engine; it needs a live counter to read from)
- Implement `src/lib/jobs/usage-counter-reset.ts` background job: reset counter and open new period on `currentPeriodEnd`
- Add `usageCounterCollection` to `collections.ts` (sync mode: `eager`)
- Extend `/billing` route with usage statistics, current period progress bar, remaining TX display
- Implement `UsageSummary` value object

**New Files:**
```
src/lib/billing/usage-engine.ts
src/lib/billing/invoice-engine.ts
src/lib/billing/value-objects/usage-summary.ts
src/lib/billing/value-objects/credit-balance.ts  ← stub for Phase 3
src/lib/jobs/usage-counter-reset.ts
```

**Files to Modify:**
```
prisma/schema.prisma                       ← UsageCounter, BillingInvoice, BillingInvoiceItem, Transaction.usageCounterId
src/db/collections.ts                      ← usageCounterCollection
src/lib/queries/create-pos-transaction.ts  ← TX increment inside dbTransaction
src/lib/better-auth/auth-server.ts         ← txRemaining now reads from UsageCounter, not BusinessSubscription.txUsedThisPeriod
src/lib/types.ts                           ← ConfigKey additions (OVERAGE_BILLING_ENABLED)
src/routes/.../billing/index.tsx           ← extended with usage stats
```

**Schema Changes (Migration 13):**
- New model: `UsageCounter`
- New model: `BillingInvoice`
- New model: `BillingInvoiceItem`
- `Transaction`: add `usageCounterId String?`
- `ConfigKey` enum: add `OVERAGE_BILLING_ENABLED`

**Complexity:** High — touches `createPosTransaction` (the most critical path in the app), requires careful testing to ensure offline behavior is preserved.

**Risks:**
- The TX increment in `createPosTransaction` runs inside `dbTransaction`. The `UsageCounter` upsert must be synchronous (following the InventoryEngine pattern). If the upsert is async, it will break offline atomicity. Mitigation: `UsageEngine.increment()` must be synchronous — same pattern as `InventoryEngine` methods.
- The `txUsedThisPeriod` column on `BusinessSubscription` becomes stale once `UsageCounter` is live. `getAuthUser` must be updated to read from `UsageCounter` instead. The old column should receive a deprecation comment; removal happens in a future cleanup phase.
- Counter reset on period end must be idempotent. Two resets for the same period must not double-reset.

**Validation Steps:**
1. Every successful `createPosTransaction` creates or increments a `UsageCounter` row for the business+period
2. `Transaction.usageCounterId` is populated on every new transaction
3. `EntitlementEngine.check(COMPLETE_CHECKOUT)` returns `TX_ALLOWANCE_EXHAUSTED` when `txRemaining <= 0`
4. `UsageEngine.increment()` is synchronous and callable inside `dbTransaction`
5. Counter reset job creates a new `UsageCounter` row for the next period and sets the old one as closed
6. `/billing` page shows correct `txRemaining` and period end date
7. Overage billing: when `OVERAGE_BILLING_ENABLED = true` and counter exceeds plan allowance, a `BillingInvoice` line item is created
8. Offline POS transaction still works without a network connection

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics
- `createPosTransaction` E2E test (or equivalent manual verification) passes with counter increment

---

### Phase 3 — Prepaid Credits ✅ COMPLETE

**Objective:** Introduce the prepaid credit billing model. Credit deduction on checkout, low-balance notification, and the credit management UI. After this phase, the PREPAID_CREDITS billing model is fully functional.

**Note:** As of the current implementation, credits are NOT restored on refunds per business policy. This change ensures simple billing behavior and prevents gaming of transaction limits.

**Delivered:**
- ✅ `CreditLedger` model + `CreditEventType` enum added to `schema.prisma`; `CREDIT_LOW_BALANCE` added to `NotificationType`; DB synced via `prisma db push` (Migration 14)
- ✅ `CreditBalance` value object promoted from Phase 2 stub (`src/lib/billing/value-objects/credit-balance.ts`) — full implementation: `of()`, `zero()`, `afterDeduction()`, `afterCredit()`, `formatLabel()`
- ✅ `CreditEngine` — pure synchronous domain engine (`src/lib/billing/credit-engine.ts`): `readBalance`, `deduct`, `restore` (deprecated), `grant`, `isLowBalance`
- ✅ `creditLedgerCollection` added to `collections.ts` (on-demand, SCHEMA_VERSION 14)
- ✅ `grant-credits.ts` server function — admin PROMOTIONAL/ADJUSTMENT grant via `rootPrisma`; tenant isolation enforced
- ✅ `fetch-credit-ledger.ts` server function — paginated ledger history + current balance from `rootPrisma`
- ✅ Credit deduction wired into `createPosTransaction` (conditional on `billingModel = PREPAID_CREDITS`); synchronous inside `dbTransaction`; collection insert for offline-first support
- ✅ Credit restoration previously wired into `createPosRefund` (now removed per business policy - refunds do not restore credits)
- ✅ `NotificationEngine.sendCreditLowBalance()` — fires async (fire-and-forget) from `createPosTransaction` when `isLowBalance` flag set; targets ADMIN + SUPERVISOR members
- ✅ `CREDIT_LOW_BALANCE` priority entry added to `DEFAULT_PRIORITY` map in NotificationEngine
- ✅ `getAuthUser` (`auth-server.ts`) — `latestCreditLedger` added to parallel fetch; `creditBalance` set from `CreditLedger.balanceAfter` for `PREPAID_CREDITS` model; deprecated `BusinessSubscription.creditBalance` read removed
- ✅ `/billing/credits` route — balance card (low/depleted state variants), paginated ledger table, admin grant dialog
- ✅ `/billing/index.tsx` — Credits summary card shown when `creditBalance !== null`, links to `/billing/credits`
- ✅ `routeTree.gen.ts` — `/billing`, `/billing/credits`, `/subscription/reactivate` routes registered
- ✅ Zero TypeScript diagnostics on all Phase 3 files

**Scope:**
- Add `CreditLedger` model + `CreditEventType` enum to schema
- Implement `CreditEngine`: balance read (last ledger entry), deduction, low-balance check (restoration method deprecated)
- Wire credit deduction into `createPosTransaction` (conditional on `billingModel = PREPAID_CREDITS`)
- Credit restoration on refunds removed per business policy
- Wire `LOW_BALANCE_THRESHOLD` check: emit `NotificationEngine.send(LOW_STOCK → CREDIT_LOW_BALANCE notification)` — requires adding `CREDIT_LOW_BALANCE` to `NotificationType` enum
- Implement `CreditBalance` value object
- Implement admin credit grant flow (manual credit insertion — no payment provider yet)
- Implement `/billing/credits` route: current balance, ledger history, manual grant CTA
- Add `creditLedgerCollection` to `collections.ts` (sync mode: `on-demand`)

**New Files:**
```
src/lib/billing/credit-engine.ts
src/lib/billing/value-objects/credit-balance.ts   ← promoted from stub
src/routes/(private)/(dashboard)/billing/credits/index.tsx
src/lib/queries/grant-credits.ts                  ← admin credit grant server function
```

**Files to Modify:**
```
prisma/schema.prisma                              ← CreditLedger, CreditEventType, NotificationType addition
src/db/collections.ts                             ← creditLedgerCollection
src/lib/queries/create-pos-transaction.ts         ← credit deduction (conditional)
src/lib/queries/create-pos-refund.ts              ← credit restoration (conditional)
src/lib/notification/notification-engine.ts       ← CREDIT_LOW_BALANCE notification type wiring
src/lib/types.ts                                  ← ConfigKey: CREDIT_LOW_BALANCE_THRESHOLD
```

**Schema Changes (Migration 14):**
- New model: `CreditLedger`
- New enum: `CreditEventType` (PURCHASE, CONSUMED, REFUNDED, EXPIRED, ADJUSTMENT, PROMOTIONAL)
- `NotificationType` enum: add `CREDIT_LOW_BALANCE`
- `ConfigKey` enum: add `CREDIT_LOW_BALANCE_THRESHOLD`

**Complexity:** Medium — additive; no existing flow is broken. Credit deduction is conditional on billing model.

**Risks:**
- Race condition: two concurrent checkouts on different devices could both pass the credit balance check before either deduction commits. Mitigation: the balance check uses `CreditLedger.balanceAfter` snapshot (O(1) read of the last row). The deduction inside `dbTransaction` inserts a new row with `amount = -1`. If two transactions commit simultaneously, both succeed and the balance goes negative. This is an accepted risk for the initial implementation; a server-side balance lock can be added in a future hardening phase.
- `creditBalance` column on `BusinessSubscription` becomes stale once `CreditLedger` is live. Same deprecation pattern as `txUsedThisPeriod`.

**Validation Steps:**
1. A successful checkout with `billingModel = PREPAID_CREDITS` inserts a `CONSUMED` `CreditLedger` entry
2. `CreditBalance.of(latestEntry.balanceAfter).isSufficient(1)` returns false when balance is 0
3. `EntitlementEngine.check(COMPLETE_CHECKOUT)` returns `CREDIT_BALANCE_ZERO` when balance is 0
4. A refund with `billingModel = PREPAID_CREDITS` inserts a `REFUNDED` `CreditLedger` entry
5. When balance falls below `CREDIT_LOW_BALANCE_THRESHOLD`, a `CREDIT_LOW_BALANCE` notification is sent
6. Admin credit grant inserts a `PROMOTIONAL` ledger entry and updates `balanceAfter` correctly
7. `/billing/credits` page shows current balance and ledger history

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics
- Refund E2E test passes with credit restoration

---

### Phase 4 — External Billing Integration ✅ COMPLETE

**Objective:** Connect the billing infrastructure to a real payment provider. Automate invoice generation and collection. Enable credit package purchases via the payment provider. After this phase, the platform can collect recurring subscription payments.

**Delivered:**
- ✅ `BillingProviderAdapter` interface (`src/lib/billing/billing-provider.ts`) — provider-agnostic; defines `createCustomer`, `createSubscription`, `cancelSubscription`, `createCreditPurchaseLink`, `getInvoice`, `verifyWebhookSignature`; exports `WebhookEvent`, `WebhookEventType`, `ProviderInvoice`, and all result types
- ✅ `StripeAdapter` concrete implementation (`src/lib/billing/adapters/stripe-adapter.ts`) — only file in the codebase that imports from `stripe`; API version pinned to `2026-07-29.dahlia`; `createStripeAdapter()` factory; `getStripeWebhookSecret()` helper; `normaliseStripeEvent()` maps all 5 handled event types to `WebhookEvent`
- ✅ Phase 4 types added to `src/lib/billing/types.ts`: `CreditPackage`, `InvoiceSummaryDTO`, `WebhookProcessingResult`, `WebhookOutcome`
- ✅ `billing-invoice-generation.ts` background job — idempotency via `(businessId, billingPeriodStart)` unique check; skips zero-amount invoices; best-effort provider sync after DB write; accepts optional `BillingProviderAdapter`
- ✅ `purchase-credit-package.ts` — `fetchCreditPackages()` GET + `purchaseCreditPackage()` POST; package catalog from env vars (`STRIPE_CREDIT_PKG_*_PRICE_ID`); creates Stripe Checkout Session; metadata carries `businessId`, `creditAmount`, `source`
- ✅ `create-subscription.ts` — creates Stripe customer + subscription atomically; handles incomplete subscriptions (`checkoutUrl`); idempotent on `externalId` already set; rolls back provider subscription if state machine rejects transition
- ✅ `cancel-subscription.ts` — immediate vs period-end cancellation modes; provider-optional (local-only fallback); validates transition via `SubscriptionEngine.canTransition`
- ✅ `fetch-invoices.ts` server function — paginated, newest-first; returns `InvoiceSummaryDTO[]`
- ✅ Stripe webhook handler (`src/routes/api/billing/webhook/index.ts`) — signature verified before any processing (400 on failure); 5 handlers: `invoice.paid` (PAID + ACTIVE), `invoice.payment_failed` (GRACE_PERIOD), `customer.subscription.deleted` (CANCELLED), `customer.subscription.updated` (date sync + status), `checkout.session.completed` (PURCHASE credit entry); idempotency on all handlers; returns 500 on unhandled errors so Stripe retries
- ✅ `/billing/invoices` route — paginated invoice table with status badges, period formatting, `formatCents` (PHP), external invoice link, empty state, loading skeleton
- ✅ `/billing` dashboard updated — `PlaceholderCard` replaced with live Invoices card linking to `/billing/invoices`; `BillingCTAs` component wired to real server functions with `AlertDialog` cancel confirmation
- ✅ `src/lib/jobs/index.ts` — comment block updated to document all 3 registered jobs with trigger and dependency order
- ✅ Zero new TypeScript diagnostics on all Phase 4 files; 39 pre-existing errors unchanged

**Scope:**
- Define `BillingProviderAdapter` interface (provider-agnostic)
- Implement a concrete adapter (e.g., Stripe) behind the interface
- Implement webhook handler for payment events (invoice paid, subscription cancelled, payment failed)
- Implement `src/lib/jobs/billing-invoice-generation.ts` background job: monthly invoice generation for active subscriptions
- Wire invoice payment status updates from webhook events
- Implement credit package purchase flow: business selects a package → payment provider checkout → webhook → `CreditLedger PURCHASE` entry
- Implement `/billing/invoices` route: invoice history, status badges, download links
- Implement payment provider subscription creation/cancellation/update flows
- Populate `BusinessSubscription.externalId` when a payment provider subscription is created

**New Files:**
```
src/lib/billing/billing-provider.ts          ← adapter interface
src/lib/billing/adapters/stripe-adapter.ts   ← concrete Stripe implementation
src/routes/api/billing/webhook/index.ts      ← webhook handler
src/lib/jobs/billing-invoice-generation.ts
src/routes/(private)/(dashboard)/billing/invoices/index.tsx
src/lib/queries/purchase-credit-package.ts
src/lib/queries/create-subscription.ts
src/lib/queries/cancel-subscription.ts
```

**Files to Modify:**
```
prisma/schema.prisma                    ← no new models; BusinessSubscription.externalId already planned in Phase 0
src/routes/(private)/(dashboard)/billing/index.tsx  ← upgrade/downgrade CTA wired to provider
src/lib/jobs/index.ts                   ← register new job
```

**Schema Changes:** None new — all required fields were added in Phase 0.

**Complexity:** High — external service integration; webhook handling; idempotency requirements.

**Risks:**
- Webhook events may be delivered out-of-order or duplicated. Every webhook handler must be idempotent — check `externalId` before applying any state change.
- Provider-specific errors (card declined, webhook signature failure) must be caught and logged without breaking the application.
- The billing provider adapter must be fully behind an interface so it can be swapped without changing any engine or application layer code.
- `externalId` on `BusinessSubscription` must be set atomically with subscription creation.

**Validation Steps:**
1. Stripe webhook `invoice.paid` event correctly marks a `BillingInvoice` as PAID and transitions subscription to ACTIVE
2. Stripe webhook `customer.subscription.deleted` event transitions subscription to CANCELLED
3. Credit package purchase flow: checkout → webhook → `CreditLedger PURCHASE` entry with correct amount
4. Duplicate webhook delivery does not create duplicate ledger entries or transitions
5. `/billing/invoices` page shows invoice history with correct statuses
6. `billing-invoice-generation` job creates a `BillingInvoice` with correct line items for an active monthly subscription

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics
- Webhook handler has dedicated integration test (with mocked Stripe payloads)

---

### Phase 5 — Composable Feature-Based Pricing ✅ COMPLETE

**Objective:** Implement the full composable pricing model: `PricingEngine` with all 5 strategies, versioned `PricingCatalog`, `FeaturePrice`, bundle versioning, `PricingQuote` lifecycle, and the pricing calculator UI. After this phase, the `COMPOSABLE_FEATURES` billing model is fully functional from quote to active subscription.

**Scope (5a — Schema and Data Foundation):**
- Expand `Feature` model: add `isSelectableByCustomer`, `pricingCategory`, `sortOrder`
- Add `PricingCategory` enum
- Add `FeaturePrice` model + FK to `Feature` and `PricingCatalog`
- Add `PricingCatalog` model + `CatalogStatus` enum
- Add `FeatureDependency` model
- Add `FeatureBundle` + `FeatureBundleItem` models
- Add `FeatureBundleVersion` model + `BundlePricingType` enum
- Add `BusinessSubscriptionFeature` model
- Add `PricingQuote` model + `QuoteStatus` enum
- Add `PricingQuoteItem` model + `QuoteLineType` enum
- Add composable `ConfigKey` entries (7 keys)
- Migrate entitlements seed to populate `isSelectableByCustomer`, `pricingCategory`, `sortOrder` on existing Features
- Add `featureCollection`, `featureDependencyCollection`, `featureBundleCollection` to `collections.ts`

**Scope (5b — PricingEngine and Domain Layer):**
- Implement `PricingResult` value object
- Implement `TaxBreakdownLine` value object
- Implement `PriceChangeNotice` value object
- Implement `PricingEngine` facade: `resolveDependencies`, `validateDependencies`, `calculate`, `detectBundle`, `generateQuote`, `validateGrandfatheredPrices`
- Implement 5 pricing strategies: `FlatSubscriptionPricingStrategy`, `FeatureBasedPricingStrategy`, `EnterprisePricingStrategy`, `PartnerResellerPricingStrategy`, `PromotionalPricingStrategy`
- Implement `PricingCatalogRepository` (Application Layer): `loadActive()`, `loadById()`
- Implement `ComposableFeaturesStrategy` for `SubscriptionEngine`
- Extend `EntitlementEngine` to resolve from `BusinessSubscriptionFeature` when `billingModel = COMPOSABLE_FEATURES`
- Update `getAuthUser` to handle composable subscription entitlement path

**Scope (5c — Routes and Background Jobs):**
- Implement `/billing/pricing` pricing calculator route
- Implement `/billing/quotes` quote list route
- Implement `/billing/quotes/$quoteId` quote detail route with accept/decline actions
- Implement quote-to-subscription conversion (Application Layer)
- Implement `src/lib/jobs/pricing-quote-expiry.ts` background job
- Implement `src/lib/jobs/composable-renewal-preview.ts` background job

**New Files (5a — Schema):** See schema changes below.

**New Files (5b — Domain):**
```
src/lib/billing/pricing/pricing-engine.ts
src/lib/billing/pricing/pricing-catalog-repository.ts
src/lib/billing/pricing/types.ts
src/lib/billing/pricing/strategies/flat-subscription-pricing-strategy.ts
src/lib/billing/pricing/strategies/feature-based-pricing-strategy.ts
src/lib/billing/pricing/strategies/enterprise-pricing-strategy.ts
src/lib/billing/pricing/strategies/partner-reseller-pricing-strategy.ts
src/lib/billing/pricing/strategies/promotional-pricing-strategy.ts
src/lib/billing/pricing/value-objects/pricing-result.ts
src/lib/billing/pricing/value-objects/tax-breakdown-line.ts
src/lib/billing/pricing/value-objects/price-change-notice.ts
src/lib/billing/strategies/composable-features-strategy.ts
```

**New Files (5c — Routes and Jobs):**
```
src/routes/(private)/(dashboard)/billing/pricing/index.tsx
src/routes/(private)/(dashboard)/billing/quotes/index.tsx
src/routes/(private)/(dashboard)/billing/quotes/$quoteId/index.tsx
src/lib/jobs/pricing-quote-expiry.ts
src/lib/jobs/composable-renewal-preview.ts
src/lib/queries/create-pricing-quote.ts
src/lib/queries/accept-pricing-quote.ts
src/lib/queries/convert-quote-to-subscription.ts
```

**Files to Modify:**
```
prisma/schema.prisma                  ← all Phase 5a schema additions
src/db/collections.ts                 ← featureCollection, featureDependencyCollection, featureBundleCollection
src/lib/entitlement/entitlement-engine.ts  ← composable features path
src/lib/better-auth/auth-server.ts    ← composable subscription entitlement assembly
prisma/seeders/entitlements.ts        ← populate new Feature fields; add initial PricingCatalog v1 seed
src/lib/types.ts                      ← ConfigKey: 7 composable pricing keys
src/lib/jobs/index.ts                 ← register new jobs
```

**Schema Changes (Migration 15 — Phase 5a):**
- `Feature` model: add `isSelectableByCustomer`, `pricingCategory`, `sortOrder`, `prices`, `bundleItems`, `dependencies`, `dependents` relations
- New enum: `PricingCategory` (CORE, OPERATIONAL, MANAGEMENT, INTEGRATION, ADVANCED)
- New model: `FeaturePrice`
- New model: `PricingCatalog`
- New enum: `CatalogStatus` (DRAFT, ACTIVE, ARCHIVED)
- New model: `FeatureDependency`
- New model: `FeatureBundle`
- New model: `FeatureBundleItem`
- New model: `FeatureBundleVersion`
- New enum: `BundlePricingType` (PERCENTAGE_DISCOUNT, FIXED_PRICE, FLAT_DISCOUNT)
- New model: `BusinessSubscriptionFeature`
- New model: `PricingQuote`
- New enum: `QuoteStatus` (DRAFT, CALCULATED, SENT, ACCEPTED, CONVERTED, EXPIRED, CANCELLED)
- New model: `PricingQuoteItem`
- New enum: `QuoteLineType` (FEATURE, BUNDLE_DISCOUNT, PROMO_DISCOUNT, SURCHARGE, TAX, ONE_TIME_FEE)
- `ConfigKey` enum: add 7 composable pricing keys
- `BusinessSubscription`: add `BusinessSubscriptionFeature` relation

**Complexity:** Very High — largest phase. Schema has the most new models. `PricingEngine` is the most complex domain engine in the codebase. Recommend splitting into 5a → 5b → 5c as three sequential PRs.

**Risks:**
- The `PricingEngine` must never import Prisma types. All data arrives as DTOs from `PricingCatalogRepository`. This is a compile-time enforcement — the engine file must not have any Prisma import. A linting rule or a CI check should verify this.
- Feature dependency cycles must be detected at seed time (via a DAG validation in the seeder) to prevent the engine from entering an infinite loop.
- The `FeaturePrice` migration is non-trivial: existing `Feature` records in the database need corresponding `FeaturePrice` records for the initial `PricingCatalog v1`. The seeder must handle this atomically.
- Phase 5c's quote conversion must be atomic: `PricingQuote` status update + `BusinessSubscription` creation + `BusinessSubscriptionFeature` inserts all in a single transaction.

**Validation Steps:**
1. `PricingEngine.calculate('FEATURE_BASED', input, catalogDTO)` returns a correct `PricingResult` with line items, discount, and tax breakdown
2. `PricingEngine.validateDependencies(selection, deps)` detects a cycle and returns an error
3. `PricingEngine.detectBundle(selection, bundleVersions)` selects the highest-saving qualifying bundle
4. A `PricingQuote` in DRAFT status advances through CALCULATED → SENT → ACCEPTED → CONVERTED correctly
5. Quote conversion creates `BusinessSubscription` with `billingModel = COMPOSABLE_FEATURES` and one `BusinessSubscriptionFeature` per FEATURE line item
6. `EntitlementEngine.check(COMPLETE_CHECKOUT, context)` resolves correctly from `BusinessSubscriptionFeature` records when `billingModel = COMPOSABLE_FEATURES`
7. `PricingEngine.validateGrandfatheredPrices` correctly identifies features whose catalog price changed since the subscription snapshot
8. `pricing-quote-expiry` job sets SENT/CALCULATED quotes past `validUntil` to EXPIRED
9. Pricing calculator UI calls `PricingEngine.calculate` on the server — no client-side price logic
10. Zero `PrismaClient` imports in any `src/lib/billing/pricing/` file

**Definition of Done:**
- All validation steps pass
- Zero TypeScript diagnostics across all new files
- `PricingEngine` has unit tests for each strategy covering: dependency resolution, bundle detection, tax calculation, annual pricing, grandfathered price detection

---

## 6. Architecture Compliance Integration ✅ COMPLETE

The Architecture Compliance Audit (July 31, 2026) and the Remediation Plan are fully complete. All operational deviations are resolved or formally deferred. No remediation items block SaaS implementation.

**Phase 6 delivered (August 1, 2026):**
- ✅ `entitlementMiddleware` — `src/lib/better-auth/entitlement-middleware.ts`; factory that builds per-capability server-side enforcement middleware; reads live subscription from `rootPrisma`; throws structured `EntitlementDenied` error on denial; passes `EntitlementMiddlewareContext` downstream
- ✅ B1 — `validateTaskTransition` server function — `src/lib/queries/validate-task-transition.ts`; reads authoritative task state from Prisma; asserts tenant isolation; calls `checkWorkflowPermission` server-side; returns `{ permitted, reason }` — replaces the client-only guard that could be bypassed via direct `transactionAPI` calls
- ✅ R9 — `transactionAPI` businessId assertion — `src/lib/prisma-client/transaction-api.ts`; switched from root `prisma` to `getTenantPrisma(businessId, branchId)`; added session identity assertion and non-empty batch validation
- ✅ ADR-005 through ADR-010 — formally written to `.kiro/OPERATIONAL/ARCHITECTURAL_DECISION_RECORDS.md`

### 6.1 Deferred Remediation Items — Impact on SaaS Phases

The following deferred items from the Remediation Plan interact with the SaaS Foundation. None block Phase 0 from starting.

| Deferred Item | Relevant Phase | Action Required |
|---|---|---|
| **B1 server-side task authorization** (Deviation 1) | Phase 6 ✅ | ✅ `validate-task-transition.ts` server function created; reads authoritative task state from Prisma; `tasks/$taskId/index.tsx` updated to call it before `dbTransaction` |
| **Tenant scoping defense in `transactionAPI`** (Risk R9) | Phase 6 ✅ | ✅ `transactionAPI` switched to `getTenantPrisma`; session identity asserted; empty batch rejected |
| **Notification archival cleanup job** (Deviation 2) | Deferred | Retention period is a business policy decision. `src/lib/jobs/` infrastructure is in place. Job implementation blocked on business specifying "archive after N days". |

### 6.2 Recommended Compliance Execution Order for SaaS Phases

Each SaaS phase must pass the Architecture Compliance Gates in Section 11 before the next phase begins. Additionally:

**Before Phase 0 begins:**
- Confirm `BusinessSubscription` simplified model does not conflict with expanded spec fields (additive only — confirmed safe)
- Confirm `txUsedThisPeriod` and `creditBalance` on `BusinessSubscription` are marked deprecated in code comments (they will be superseded by `UsageCounter` and `CreditLedger`)

**Before Phase 2 begins:**
- Verify `SubscriptionEngine` does not import from Prisma or any collection — pure engine constraint
- Verify `BillingPeriod` value object is used wherever period boundaries are calculated — no raw date arithmetic in application code

**Before Phase 5 begins:**
- Verify `PricingEngine` has zero infrastructure imports — this is the strictest constraint in the entire SaaS Foundation (ADR-009, `v1-master-plan.md` §2.17)
- Verify the `PricingCatalogRepository` interface is defined in the Application Layer, not imported by the engine
- Run a DAG validation on the seeded `FeatureDependency` records to confirm no cycles before the engine is activated

### 6.3 New ADRs — Phase 5 and Phase 6 ✅ COMPLETE

**Phase 5 ADRs (due before Phase 5 — delivered Phase 6):**
- ✅ ADR-009 — Composable Feature-Based Pricing via PricingEngine and Snapshot Model
- ✅ ADR-010 — Feature and Pricing as Separate Domain Objects

**Phase 2–4 ADRs (due at each phase — delivered Phase 6):**
- ✅ ADR-005 — UsageEngine (Phase 2)
- ✅ ADR-006 — CreditEngine (Phase 3)
- ✅ ADR-007 — BillingProviderAdapter Pattern (Phase 4)

**Cross-cutting SaaS ADRs:**
- ✅ ADR-008 — Data Preservation on Billing Lapse

All ADRs written to `.kiro/OPERATIONAL/ARCHITECTURAL_DECISION_RECORDS.md`. The ADR index now covers ADR-001 through ADR-010.

---

## 7. File Impact Analysis

### Phase 0 File Impact ✅ COMPLETE

| File | Change Type | Impact |
|---|---|---|
| `prisma/schema.prisma` | Modify | BusinessSubscription expansion + 2 new models + 1 new enum. Migration required. |
| `src/db/collections.ts` | Modify | Add `businessSubscriptionCollection`. SCHEMA_VERSION bump (11 → 12). |
| `src/lib/better-auth/auth-server.ts` | Modify | Populate new lifecycle fields in entitlement context. |
| `src/lib/types.ts` | Modify | 3 new ConfigKey entries. |
| `prisma/seeders/entitlements.ts` | Modify | Default billing policy config values. Trial plan seeded. |
| `src/lib/billing/subscription-engine.ts` | Create | New engine file. |
| `src/lib/billing/types.ts` | Create | Shared billing types. |
| `src/lib/billing/value-objects/billing-period.ts` | Create | |
| `src/lib/billing/value-objects/subscription-status.ts` | Create | |
| `src/lib/billing/policies/subscription-policy.ts` | Create | |
| `src/lib/jobs/subscription-lifecycle.ts` | Create | Background job. |
| `src/lib/jobs/index.ts` | Create | Job runner helper. |

**Breaking Changes:** None — all schema changes are additive. Existing `businessId UNIQUE` constraint on `BusinessSubscription` is preserved.
**Database Impact:** 2 new tables (`subscription_status_history`, potentially a config table update). No existing table structure changes.
**Migration Impact:** 1 migration (12) — adds columns and tables only; no column drops.

---

### Phase 1 File Impact ✅ COMPLETE

| File | Change Type | Impact | Status |
|---|---|---|---|
| `src/routes/(private)/(dashboard)/billing/index.tsx` | Create | New billing dashboard route. | ✅ Done |
| `src/routes/(private)/(dashboard)/billing/route.tsx` | Create | Billing layout wrapper. | ✅ Done |
| `src/routes/subscription/reactivate/index.tsx` | Create | Reactivation shell. | ✅ Done |
| `src/lib/billing/plan-engine.ts` | Create | Plan comparison engine (read-only). | ✅ Done |
| `src/components/subscription-banner.tsx` | Create | Warning/expired/trial-countdown banner. | ✅ Done |
| `src/components/feature-disabled.tsx` | Create | Blocked feature placeholder + `useSubscriptionGate` hook. | ✅ Done |
| `src/lib/entitlement/entitlement-types.ts` | Modify | `EntitlementSummary` extended with `trialEndsAt` + `currentPeriodEnd`. | ✅ Done |
| `src/lib/entitlement/entitlement-engine.ts` | Modify | `buildSummary` accepts lifecycle date metadata. | ✅ Done |
| `src/lib/better-auth/auth-server.ts` | Modify | Passes `trialEndsAt` + `currentPeriodEnd` into `buildSummary`. | ✅ Done |
| `src/routes/(private)/route.tsx` | Modify | `SubscriptionBanner` injected above outlet. | ✅ Done |
| `src/components/custom/dashboard/app-sidebar.tsx` | Modify | Billing sidebar link (ADMIN) + `SubscriptionStatusFooter`. | ✅ Done |
| `src/routes/(private)/pos/index.tsx` | Modify | `POSPageGate` wrapper calls `useSubscriptionGate`. | ✅ Done |
| `src/routes/(private)/orders/index.tsx` | Modify | `OrdersPageGate` wrapper calls `useSubscriptionGate`. | ✅ Done |
| `routeTree.gen.ts` | Auto-regenerated | New routes registered by TanStack Router. | ✅ Done |

**Breaking Changes:** None — UI additions only.
**Database Impact:** None.
**Migration Impact:** None.

---

### Phase 2 File Impact ✅ COMPLETE

| File | Change Type | Impact |
|---|---|---|
| `prisma/schema.prisma` | Modify | 3 new models + 1 new ConfigKey + `Transaction.usageCounterId`. Migration 13 applied. |
| `src/db/collections.ts` | Modify | `usageCounterCollection` added. SCHEMA_VERSION 13. |
| `src/lib/queries/create-pos-transaction.ts` | Modify | TX counter increment inside `dbTransaction` — synchronous. |
| `src/lib/better-auth/auth-server.ts` | Modify | `txRemaining` reads from `UsageCounter` instead of `BusinessSubscription.txUsedThisPeriod`. |
| `src/lib/types.ts` | Modify | `OVERAGE_BILLING_ENABLED` ConfigKey (in schema; billing layer consumes via `OveragePolicy`). |
| `src/lib/billing/usage-engine.ts` | Create | ✅ Done |
| `src/lib/billing/invoice-engine.ts` | Create | ✅ Done |
| `src/lib/billing/value-objects/usage-summary.ts` | Create | ✅ Done |
| `src/lib/jobs/usage-counter-reset.ts` | Create | ✅ Done |eate-pos-transaction.ts` | Modify | **High risk.** TX counter increment inside `dbTransaction`. Must remain synchronous. |
| `src/lib/better-auth/auth-server.ts` | Modify | `txRemaining` now reads from `UsageCounter` instead of `BusinessSubscription.txUsedThisPeriod`. |
| `src/lib/types.ts` | Modify | `OVERAGE_BILLING_ENABLED` ConfigKey. |
| `src/lib/billing/usage-engine.ts` | Create | |
| `src/lib/billing/invoice-engine.ts` | Create | |
| `src/lib/billing/value-objects/usage-summary.ts` | Create | |
| `src/lib/jobs/usage-counter-reset.ts` | Create | |

**Breaking Changes:** `createPosTransaction` is modified. Any test that mocks or tests this function must be updated.
**Database Impact:** 3 new tables. `Transaction` gains a nullable FK.
**Migration Impact:** 1 migration (13). `Transaction.usageCounterId` is nullable — no backfill required for existing rows.

---

### Phase 3 File Impact ✅ COMPLETE

| File | Change Type | Impact | Status |
|---|---|---|---|
| `prisma/schema.prisma` | Modify | `CreditLedger` model + `CreditEventType` enum + `CREDIT_LOW_BALANCE` NotificationType. `prisma db push` applied. | ✅ Done |
| `src/db/collections.ts` | Modify | `creditLedgerCollection` added. SCHEMA_VERSION 14. | ✅ Done |
| `src/lib/queries/create-pos-transaction.ts` | Modify | Credit deduction (conditional on `PREPAID_CREDITS`). | ✅ Done |
| `src/lib/queries/create-pos-refund.ts` | Modify | Credit restoration (conditional). | ✅ Done |
| `src/lib/notification/notification-engine.ts` | Modify | `sendCreditLowBalance()` + `CREDIT_LOW_BALANCE` priority entry. | ✅ Done |
| `src/lib/billing/credit-engine.ts` | Create | ✅ Done |
| `src/lib/billing/value-objects/credit-balance.ts` | Modify | Promoted from Phase 2 stub to full implementation. | ✅ Done |
| `src/lib/billing/types.ts` | Modify | `CreditEventType` + `CreditLedgerEntryDTO` added. | ✅ Done |
| `src/lib/better-auth/auth-server.ts` | Modify | `latestCreditLedger` parallel fetch; `creditBalance` from ledger. | ✅ Done |
| `src/lib/server-fn/fetch-credit-ledger.ts` | Create | ✅ Done |
| `src/lib/queries/grant-credits.ts` | Create | ✅ Done |
| `src/routes/(private)/(dashboard)/billing/credits/index.tsx` | Create | ✅ Done |
| `src/routes/(private)/(dashboard)/billing/index.tsx` | Modify | Credits summary card added. | ✅ Done |
| `src/routeTree.gen.ts` | Modify | `/billing`, `/billing/credits`, `/subscription/reactivate` registered. | ✅ Done |

---

### Phase 4 File Impact ✅ COMPLETE

| File | Change Type | Impact | Status |
|---|---|---|---|
| `src/lib/billing/billing-provider.ts` | Create | Adapter interface. | ✅ Done |
| `src/lib/billing/adapters/stripe-adapter.ts` | Create | Concrete Stripe implementation. Only file importing from `stripe`. | ✅ Done |
| `src/routes/api/billing/webhook/index.ts` | Create | **Security-sensitive.** Webhook signature verification required. | ✅ Done |
| `src/lib/jobs/billing-invoice-generation.ts` | Create | Monthly invoice generation job. | ✅ Done |
| `src/routes/.../billing/invoices/index.tsx` | Create | Invoice history UI. | ✅ Done |
| `src/lib/queries/purchase-credit-package.ts` | Create | Credit package purchase server function. | ✅ Done |
| `src/lib/queries/create-subscription.ts` | Create | Subscription creation server function. | ✅ Done |
| `src/lib/queries/cancel-subscription.ts` | Create | Subscription cancellation server function. | ✅ Done |
| `src/lib/server-fn/fetch-invoices.ts` | Create | Invoice history server function. | ✅ Done |
| `src/lib/billing/types.ts` | Modify | Phase 4 types added: `CreditPackage`, `InvoiceSummaryDTO`, `WebhookProcessingResult`, `WebhookOutcome`. | ✅ Done |
| `src/routes/(private)/(dashboard)/billing/index.tsx` | Modify | Invoices card + `BillingCTAs` wired to real server functions. | ✅ Done |
| `src/lib/jobs/index.ts` | Modify | Job registry documentation updated. | ✅ Done |

**Breaking Changes:** None — additive only.
**Database Impact:** None (all required schema was added in Phase 0).
**Migration Impact:** None.

---

### Phase 5 File Impact (Summary) ✅ COMPLETE

Phase 5 has the largest file impact. See Section 5 (Phase 5 scope) for the complete file list.

**Critical files to modify:**
- `prisma/schema.prisma` — largest migration in the project (10 new models, 5 new enums, 2 existing model expansions)
- `src/lib/entitlement/entitlement-engine.ts` — composable entitlement path added
- `src/lib/better-auth/auth-server.ts` — composable subscription context assembly
- `src/db/collections.ts` — 3 new collections. SCHEMA_VERSION bump (14 → 15).
- `prisma/seeders/entitlements.ts` — Feature model field population + initial PricingCatalog seed

**Breaking Changes:** The `Feature` model gains new required fields. The seeder must be updated before `prisma generate` will succeed for existing Feature records.

**Database Impact:** 10 new tables. 2 existing tables gain columns.

**Migration Impact:** 1 migration (15) — largest single migration in the project. Consider splitting into 15a (schema additions) and 15b (Feature model field updates + initial PricingCatalog v1 seed) to reduce migration risk.

---

## 8. Prisma Migration Strategy

All migrations are additive. No column drops or renames occur in any SaaS Foundation phase.

### Migration 12 — Phase 0: Subscription Lifecycle Foundation

**Changes:**
- `BusinessSubscription`: add `billingModel BillingModel @default(MONTHLY_SUBSCRIPTION)`, `gracePeriodEndsAt DateTime?`, `longTermInactiveAt DateTime?`, `expiredAt DateTime?`, `cancelReason String?`, `externalId String?`
- New enum: `BillingModel`
- New model: `SubscriptionStatusHistory`
- `ConfigKey` enum: add `TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`

**New models:** 1 (`subscription_status_history`)
**Modified models:** 1 (`business_subscriptions` — new columns only)
**New enums:** 1 (`BillingModel`)
**Migration dependencies:** None — builds on existing `BusinessSubscription` table
**Rollback:** Columns are nullable or have defaults. Rollback removes new columns (safe, no data loss on new columns).
**Safe migration order:** Standard `prisma migrate dev` — no data migration required.

---

### Migration 13 — Phase 2: Usage Tracking + Billing Foundation

**Changes:**
- New model: `UsageCounter`
- New model: `BillingInvoice`
- New model: `BillingInvoiceItem`
- `Transaction`: add `usageCounterId String?` (nullable FK to `usage_counters`)
- `ConfigKey` enum: add `OVERAGE_BILLING_ENABLED`

**New models:** 3
**Modified models:** 1 (`transactions` — nullable FK only)
**New enums:** 0
**Migration dependencies:** Migration 12 must be applied first (BusinessSubscription must have `billingModel`).
**Rollback:** `Transaction.usageCounterId` is nullable — rollback removes the column with no data loss risk.
**Safe migration order:** Apply new models first, then add FK to `Transaction`.

---

### Migration 14 — Phase 3: Prepaid Credits

**Changes:**
- New model: `CreditLedger`
- New enum: `CreditEventType`
- `NotificationType` enum: add `CREDIT_LOW_BALANCE`
- `ConfigKey` enum: add `CREDIT_LOW_BALANCE_THRESHOLD`

**New models:** 1
**Modified models:** 0
**New enums:** 1 (`CreditEventType`); 2 enum additions (`NotificationType`, `ConfigKey`)
**Migration dependencies:** Migration 13 must be applied first.
**Rollback:** New table drop; enum value removal (PostgreSQL requires a workaround for enum value removal — note this as a rollback limitation).
**Safe migration order:** Standard.

---

### Migration 15 — Phase 5: Composable Pricing

**This is the largest migration in the project. Consider splitting into two steps.**

**Step 15a — New Models and Enums (all additive):**
- New enum: `PricingCategory`
- New enum: `CatalogStatus`
- New enum: `BundlePricingType`
- New enum: `QuoteStatus`
- New enum: `QuoteLineType`
- New model: `FeaturePrice`
- New model: `PricingCatalog`
- New model: `FeatureDependency`
- New model: `FeatureBundle`
- New model: `FeatureBundleItem`
- New model: `FeatureBundleVersion`
- New model: `BusinessSubscriptionFeature`
- New model: `PricingQuote`
- New model: `PricingQuoteItem`
- `ConfigKey` enum: add 7 composable pricing keys

**Step 15b — Existing Model Expansions (requires seeder update):**
- `Feature`: add `isSelectableByCustomer Boolean @default(false)`, `pricingCategory PricingCategory?`, `sortOrder Int @default(0)`, relations to `FeaturePrice`, `FeatureDependency`, `FeatureBundleItem`
- `BusinessSubscription`: add relation to `BusinessSubscriptionFeature`

**New models:** 9
**Modified models:** 2 (`Feature`, `BusinessSubscription` — additive only)
**New enums:** 5; 1 enum with 7 additions (`ConfigKey`)
**Migration dependencies:** Migration 14 must be applied first. `Feature` must exist (it does since Phase F).
**Rollback considerations:**
- New tables can be dropped safely.
- `Feature` new columns have defaults — rollback removes columns safely.
- The initial `PricingCatalog v1` seed must be applied after 15b completes; it cannot be part of the migration itself.
**Safe migration order:** Apply 15a → regenerate client → apply 15b → run seeder update → regenerate client again.

---

### Migration Order Summary

| Migration | Phase | New Tables | Modified Tables | Notes |
|---|---|---|---|---|
| 12 | Phase 0 | `subscription_status_history` | `business_subscriptions` | Lifecycle field expansion |
| 13 | Phase 2 | `usage_counters`, `billing_invoices`, `billing_invoice_items` | `transactions` | Nullable FK only |
| 14 | Phase 3 | `credit_ledger` | — | Enum additions |
| 15a | Phase 5 | 9 pricing/quote tables | — | Pure additions |
| 15b | Phase 5 | — | `features`, `business_subscriptions` | New nullable columns |

### Cross-Migration Rules

- Never combine unrelated changes in a single migration.
- Each migration must have a matching seeder update applied immediately after `prisma generate`.
- Run `prisma validate` before every `prisma migrate dev`.
- Bump `SCHEMA_VERSION` in `collections.ts` after every migration that adds or modifies a model that has an offline collection.

---

## 9. Testing Strategy

### 9.1 Phase 0 — Subscription Lifecycle Foundation

**Unit Tests:**
- `SubscriptionEngine.canTransition(from, to)` — every valid and invalid transition pair
- `BillingPeriod.of(start, end).contains(date)` — boundary cases (first day, last day, outside)
- `BillingPeriod.next()` — produces correct next period start/end
- `SubscriptionPolicy.gracePeriodEndDate(expiredAt, graceDays)` — correct date arithmetic

**Integration Tests:**
- Trial auto-provisioning: create a `Business` → verify `BusinessSubscription` row created at `TRIAL` status with correct `trialEndsAt`
- `getAuthUser` returns `entitlement.status = 'TRIAL'` for a newly created business
- `getAuthUser` returns `entitlement.status = 'EXPIRED'` for a business with `trialEndsAt` in the past and no paid subscription

**Regression Tests:**
- All existing operational E2E tests pass unchanged (POS, tasks, purchases, receiving)
- `getAuthUser` still returns a valid entitlement summary for businesses with no `BusinessSubscription` record (open-context fallback)

**Manual Verification:**
- Background job correctly transitions a TRIAL subscription to EXPIRED after `trialEndsAt`
- `SubscriptionStatusHistory` row created for each transition with correct `fromStatus`, `toStatus`, `triggeredBy`

**Architecture Verification:**
- `SubscriptionEngine` has zero imports from `prisma-client`, `collections`, or any framework package
- `BillingPeriod` value object has zero infrastructure imports

---

### 9.2 Phase 1 — UI Enforcement + Billing Dashboard

**Unit Tests:**
- `PlanEngine.compare(planA, planB)` — returns correct feature delta
- `PlanEngine.isUpgrade(currentPlan, targetPlan)` — correct for all tier combinations

**Integration Tests:**
- A session with `entitlement.status = 'EXPIRED'` cannot call any operational server function (e.g., `createPosTransaction` should return an entitlement denial)
- A session with `entitlement.status = 'GRACE_PERIOD'` can still call operational server functions

**Regression Tests:**
- All existing E2E tests pass
- Sidebar renders correctly for all four `Role` values with `status = 'ACTIVE'`

**Manual Verification:**
- Navigate to `/pos` with an EXPIRED subscription → redirected to feature-disabled page or blocked with banner
- Navigate to `/billing` with an EXPIRED subscription → page renders correctly
- Navigate to `/subscription/reactivate` with LONG_TERM_INACTIVE subscription → page renders

---

### 9.3 Phase 2 — Usage Tracking + Monthly Billing Foundation

**Unit Tests:**
- `UsageEngine.increment(counter, billingModel)` — correct counter arithmetic for each billing model
- `UsageEngine.computeRemaining(counter, plan)` — correct for limited and unlimited plans
- `UsageEngine.isExhausted(counter, plan)` — true when `txCount >= includedTxPerMonth` (and plan is not unlimited)
- `InvoiceEngine.buildMonthlyInvoice(subscription, counter, plan)` — correct line items and totals
- `InvoiceEngine.buildOverageLineItem(overageCount, overageRate)` — correct cents calculation

**Integration Tests:**
- `createPosTransaction` succeeds → `UsageCounter.txCount` incremented by 1 (verified via Prisma query after the call)
- `createPosTransaction` succeeds → `Transaction.usageCounterId` is populated
- `createPosTransaction` with `txRemaining = 0` and `OVERAGE_BILLING_ENABLED = false` → denied with `TX_ALLOWANCE_EXHAUSTED`
- `createPosTransaction` with `txRemaining = 0` and `OVERAGE_BILLING_ENABLED = true` → succeeds; `overageTxCount` incremented
- Counter reset job: after `currentPeriodEnd`, a new `UsageCounter` row is created; old row is not modified
- Counter reset job is idempotent: running twice for the same period creates only one new row

**Regression Tests:**
- All existing POS E2E tests pass with the counter increment in place
- `createPosRefund` does not increment the usage counter (refunds are not new transactions)
- Offline POS transaction still completes without network access

**Manual Verification:**
- `/billing` page shows current `txRemaining` and period end date
- After 5 transactions, `/billing` shows `txCount = 5`

**Architecture Verification:**
- `UsageEngine` has zero Prisma imports — it receives `UsageCounter` data as a plain DTO
- `InvoiceEngine` has zero Prisma imports

---

### 9.4 Phase 3 — Prepaid Credits

**Unit Tests:**
- `CreditEngine.deduct(balance, cost)` — returns new balance; throws/returns error when insufficient
- `CreditEngine.isLowBalance(balance, threshold)` — correct boundary conditions
- `CreditEngine.computeBalanceAfter(entries)` — correct ledger sum (snapshot approach)
- `CreditBalance.of(amount).isSufficient(cost)` — true/false at boundary

**Integration Tests:**
- `createPosTransaction` with `billingModel = PREPAID_CREDITS` and `creditBalance = 5` → `CreditLedger CONSUMED` entry inserted; `balanceAfter = 4`
- `createPosTransaction` with `billingModel = PREPAID_CREDITS` and `creditBalance = 0` → denied with `CREDIT_BALANCE_ZERO`
- `createPosRefund` with `billingModel = PREPAID_CREDITS` → `CreditLedger REFUNDED` entry inserted; `balanceAfter` incremented
- Low-balance notification: after deduction that drops balance below `CREDIT_LOW_BALANCE_THRESHOLD`, a `CREDIT_LOW_BALANCE` notification is inserted

**Regression Tests:**
- `createPosTransaction` with `billingModel = MONTHLY_SUBSCRIPTION` is unaffected by credit logic
- `createPosRefund` with `billingModel = MONTHLY_SUBSCRIPTION` is unaffected by credit logic

**Manual Verification:**
- Admin credit grant via `/billing/credits`: insert a `PROMOTIONAL` ledger entry → balance displayed correctly

---

### 9.5 Phase 4 — External Billing Integration

**Unit Tests:**
- `BillingProviderAdapter` mock: invoice paid → correct state transitions
- `BillingProviderAdapter` mock: subscription cancelled → correct state transitions
- Webhook signature verification: valid signature passes; invalid signature returns 401

**Integration Tests:**
- Simulated `invoice.paid` webhook payload → `BillingInvoice.status` set to `PAID`; `BusinessSubscription.status` transitions to `ACTIVE`
- Simulated `customer.subscription.deleted` payload → `BusinessSubscription.status` transitions to `CANCELLED`; `SubscriptionStatusHistory` row written
- Duplicate webhook delivery: second identical payload produces no additional state changes
- Credit package purchase: payment provider checkout flow → simulated `payment_intent.succeeded` → `CreditLedger PURCHASE` entry inserted

**Regression Tests:**
- All existing subscription lifecycle transitions still work correctly
- Manual admin credit grant still works without payment provider involvement

**Manual Verification:**
- `/billing/invoices` shows correct invoice status badges after simulated webhook delivery

**Architecture Verification:**
- All payment provider interactions isolated in `src/lib/billing/adapters/`
- No Stripe SDK imported outside the adapter file
- Webhook handler verifies signature before processing any payload

---

### 9.6 Phase 5 — Composable Feature-Based Pricing

**Unit Tests (PricingEngine — highest priority):**
- `PricingEngine.resolveDependencies(keys, deps)` — transitive dependency expansion
- `PricingEngine.validateDependencies(keys, deps)` — cycle detection (DAG validation)
- `FeatureBasedPricingStrategy.calculate(input, config)` — correct subtotal from catalog prices
- `FeatureBasedPricingStrategy` with bundle qualification — bundle discount applied correctly
- `FeatureBasedPricingStrategy` with `PERCENTAGE_DISCOUNT` bundle — correct percentage
- `FeatureBasedPricingStrategy` with `FIXED_PRICE` bundle — correct flat price
- `FeatureBasedPricingStrategy` with `FLAT_DISCOUNT` bundle — correct subtraction
- `EnterprisePricingStrategy` — `negotiatedPrice` overrides catalog price on qualifying lines
- `PricingEngine.detectBundle` — selects highest-saving qualifying bundle when multiple qualify
- `PricingEngine.calculate` annual pricing — `annualGrandTotal` and `annualSavings` correct
- `PricingEngine.validateGrandfatheredPrices` — detects price changes; returns `PriceChangeNotice[]`
- Tax calculation — `TaxBreakdownLine` correct for VAT-inclusive and VAT-exclusive cases

**Integration Tests:**
- `PricingCatalogRepository.loadActive()` returns a populated `PricingCatalogDTO` matching the seeded v1 catalog
- `PricingCatalogRepository.loadById(archivedId)` returns the archived catalog unchanged
- Quote lifecycle: DRAFT → CALCULATED → SENT → ACCEPTED → CONVERTED → `BusinessSubscription` created with correct `BusinessSubscriptionFeature` rows
- Quote conversion is atomic: if subscription creation fails, quote status is NOT updated
- `pricing-quote-expiry` job: SENT quote with `validUntil` in the past → status set to EXPIRED
- `EntitlementEngine.check(COMPLETE_CHECKOUT, context)` with `billingModel = COMPOSABLE_FEATURES` — resolves from `BusinessSubscriptionFeature` records correctly

**Regression Tests:**
- `EntitlementEngine.check` for all existing billing models (MONTHLY_SUBSCRIPTION, PREPAID_CREDITS, HYBRID) unchanged
- All existing subscription lifecycle tests pass
- `/billing` route renders correctly for non-composable subscriptions

**Manual Verification:**
- Pricing calculator: select features → dependency auto-resolved → live price updates → bundle discount badge appears
- Annual/monthly toggle shows correct pricing and annual savings
- Generate quote → quote appears in `/billing/quotes`
- Accept quote → subscription created → `/billing` shows correct composable plan

**Architecture Verification:**
- Zero `PrismaClient` or collection imports in any file under `src/lib/billing/pricing/`
- `PricingEngine` receives `calculatedAt` as a parameter — never calls `new Date()` internally
- `PricingResult.grandTotal` does not include `oneTimeFees` (they are shown separately)

---

## 10. Risk Assessment

### R1 — TX Increment Breaks Offline Behavior

**Description:** Adding a `UsageCounter` upsert inside `createPosTransaction`'s `dbTransaction` callback could break the offline-first behavior if the increment is implemented as an async operation rather than a synchronous collection write.

**Likelihood:** High (if the pattern is not followed correctly)
**Impact:** Critical — POS checkout breaks offline

**Mitigation:**
- `UsageEngine.increment()` must be a synchronous function, following the exact same pattern as `InventoryEngine` methods
- The upsert targets `usageCounterCollection` (an offline collection), not a direct Prisma call
- The upsert is a local-first write — it syncs to the server in the background
- Phase 2's unit tests must include an offline simulation (no network) to verify the increment still occurs

**Rollback Strategy:** If offline behavior is broken, revert the `create-pos-transaction.ts` change only. The `UsageCounter` schema can remain; the wiring is the risky part.

---

### R2 — Credit Balance Race Condition

**Description:** Two devices checking out simultaneously with a PREPAID_CREDITS subscription may both pass the credit balance check before either deduction commits, allowing the balance to go negative.

**Likelihood:** Medium (only affects businesses with multiple concurrent checkout devices on prepaid model)
**Impact:** Medium — financial inaccuracy; negative balance possible

**Mitigation:**
- Phase 3 initial implementation accepts this risk. The `CreditLedger` append-only model with `balanceAfter` snapshot makes the race auditable (both transactions are visible in the ledger).
- A server-side optimistic lock can be added in a subsequent hardening phase: the deduction server function reads `latestEntry.balanceAfter`, confirms it equals the expected value, then inserts. If another deduction beat it, the insert conflicts and the transaction is retried.
- Document this explicitly in code comments for Phase 3.

**Rollback Strategy:** No rollback needed — the data is still correct in the ledger; only the balance may be temporarily negative. An `ADJUSTMENT` ledger entry can correct it.

---

### R3 — PricingEngine Imports Infrastructure (Phase 5)

**Description:** A developer implementing `PricingEngine` accidentally imports `PrismaClient` or a collection, violating ADR-009 and making the engine untestable without a database.

**Likelihood:** Medium (complex engine with many inputs; temptation to "just fetch the data inside")
**Impact:** High — breaks the Business Engine architecture; makes the engine untestable; defeats the entire composable pricing design

**Mitigation:**
- Add an ESLint rule or `import/no-restricted-paths` configuration that forbids imports from `prisma-client` in any file under `src/lib/billing/pricing/`
- Code review checklist for Phase 5 PRs includes explicit "zero Prisma imports" verification
- Unit tests for `PricingEngine` use plain mock DTOs with no database setup — this naturally catches infrastructure leakage (tests fail to run without DB if the engine imports Prisma)

**Rollback Strategy:** If the violation is discovered after merge, extract the infrastructure call to the Application Layer and inject the data as a DTO parameter. The engine signature changes; callers must be updated.

---

### R4 — Migration 15 is Too Large (Phase 5)

**Description:** Migration 15 adds 9 new tables, 5 new enums, and modifies 2 existing models. A failure partway through could leave the database in an inconsistent state.

**Likelihood:** Low (Prisma migrations are transactional in PostgreSQL)
**Impact:** High — schema inconsistency blocks all application functionality

**Mitigation:**
- Split Migration 15 into 15a (pure additions: new models and enums) and 15b (existing model field additions). Apply 15a first; verify all passes; apply 15b.
- Test on a staging environment with a copy of production data volume before applying to production.
- Maintain a `.sql` rollback script for each step.

**Rollback Strategy:** PostgreSQL schema migrations are transactional — a partial failure rolls back automatically. If 15a completes but 15b fails, the application continues to function without the composable fields (they are all nullable or have defaults).

---

### R5 — Webhook Idempotency Failure (Phase 4)

**Description:** A payment provider may deliver the same webhook event multiple times. If the webhook handler is not idempotent, duplicate events could create duplicate invoice payments, duplicate subscription activations, or duplicate credit ledger entries.

**Likelihood:** High (payment provider guarantees at-least-once delivery, not exactly-once)
**Impact:** High — financial data corruption; duplicate subscription records

**Mitigation:**
- Every webhook handler checks for the `externalId` of the event before applying any state change
- Idempotency check: `if (invoice.paidAt !== null) return; // already processed`
- All webhook handlers use `upsert` or `updateMany with where: { status: 'OPEN' }` rather than blind `update`
- Log every received webhook event to a `WebhookEvent` table (or at minimum to application logs) with the event ID, so duplicate events can be identified

**Rollback Strategy:** Any duplicate state change can be reversed via a manual `ADJUSTMENT` ledger entry or a status correction. The `SubscriptionStatusHistory` table provides the audit trail.

---

### R6 — Feature Dependency Cycle in Composable Pricing (Phase 5)

**Description:** A `FeatureDependency` seed record could create a cycle (Feature A requires B; Feature B requires A), causing `PricingEngine.resolveDependencies()` to loop infinitely.

**Likelihood:** Low (seed data is code-controlled; cycles are unlikely but possible with manual edits)
**Impact:** High — infinite loop in the server function; request timeout; DoS risk

**Mitigation:**
- `PricingEngine.validateDependencies()` detects cycles using a DFS traversal and returns `opFail` before any calculation proceeds
- The seeder for `FeatureDependency` includes a post-seed validation step that calls the engine's cycle detection
- The pricing calculator server function calls `validateDependencies` before `calculate`; if a cycle is detected, it returns an error to the UI rather than proceeding

**Rollback Strategy:** Delete the offending `FeatureDependency` record from the database. No migration required.

---

### R7 — BusinessSubscription Simplified Model Diverges from Spec (Phase 0)

**Description:** The current `BusinessSubscription` model has `txUsedThisPeriod` and `creditBalance` columns that will be superseded by `UsageCounter` and `CreditLedger` in Phases 2–3. If these old columns continue to be written to by `getAuthUser` or other callers after the new models are live, stale data could cause confusing entitlement behavior.

**Likelihood:** High (easy to forget to update `getAuthUser` when the new models go live)
**Impact:** Medium — incorrect `txRemaining` or `creditBalance` in the entitlement context

**Mitigation:**
- In Phase 0, add prominent deprecation comments to `txUsedThisPeriod` and `creditBalance` on `BusinessSubscription`
- Phase 2 PR must include updating `getAuthUser` to read `txRemaining` from `UsageCounter` instead of `BusinessSubscription.txUsedThisPeriod` — this is a Phase 2 Definition of Done item
- Phase 3 PR must include updating `getAuthUser` to read `creditBalance` from the latest `CreditLedger` entry instead of `BusinessSubscription.creditBalance`
- The old columns are NOT removed in Phase 2 or Phase 3 — they stay as deprecated columns until a future cleanup migration

**Rollback Strategy:** If `getAuthUser` is updated incorrectly, revert the `auth-server.ts` change only.

---

### R8 — Trial Auto-Provisioning Affects Existing Businesses (Phase 0)

**Description:** When trial auto-provisioning is introduced, existing businesses that have no `BusinessSubscription` record currently fall through to the open-context fallback in `getAuthUser`. If auto-provisioning is triggered retroactively (e.g., on next login), it could create a TRIAL subscription for a long-standing production business, incorrectly limiting their access.

**Likelihood:** Medium (depends on how provisioning is triggered)
**Impact:** High — production businesses could lose operational access if inadvertently put into TRIAL status

**Mitigation:**
- Trial auto-provisioning must check `if (subscription exists) return` before creating a new record
- Existing businesses with no subscription record should be provisioned with `status = ACTIVE` (not `TRIAL`) during a one-time backfill migration — not on their next login
- The backfill migration is a separate Prisma seed script run once before Phase 0 goes live in production
- Document the backfill strategy explicitly in the Phase 0 PR description

**Rollback Strategy:** If incorrect subscriptions are created, delete them and re-run the backfill. The open-context fallback remains active for any business without a subscription record.

---

## 11. Architecture Compliance Gates

The following gates are mandatory before any phase is considered complete. Every PR must satisfy all applicable gates before merge.

### Universal Gates (Every Phase)

| Gate | Verification |
|---|---|
| **G1 — No infrastructure in engines** | Every new file in `src/lib/billing/` and `src/lib/entitlement/` has zero imports from `prisma-client`, collections, `better-auth`, or any HTTP/framework package. |
| **G2 — No business logic in UI** | No route component file contains monetary calculations, subscription status checks, or capability evaluations. These live in engines; routes read from `authStore.entitlement`. |
| **G3 — No circular domain dependencies** | No file in `src/lib/billing/` imports from `src/lib/entitlement/` and vice versa. Cross-domain communication uses plain DTOs or value objects in `src/lib/billing/types.ts`. |
| **G4 — Diagnostic clean** | `tsc --noEmit` (or the project's equivalent) reports zero errors and zero warnings on all new and modified files. |
| **G5 — Atomic writes** | Any operation that writes to multiple models uses a single `dbTransaction` callback. No sequential writes that could partially succeed. |
| **G6 — Tests pass** | All unit and integration tests for the phase pass. No existing test is broken. |
| **G7 — Migration valid** | `prisma validate` passes. `prisma generate` succeeds. The generated client compiles without errors. |
| **G8 — SCHEMA_VERSION bumped** | If any collection is added or any synced model gains a new field, `SCHEMA_VERSION` in `collections.ts` is incremented. |
| **G9 — Documentation updated** | All documents listed in Section 12 for the phase are updated before the PR is merged. |
| **G10 — Engine purity for PricingEngine (Phase 5 only)** | No file under `src/lib/billing/pricing/` imports from Prisma, collections, or any external SDK. This gate is a hard blocker for Phase 5 merge. |

### Phase-Specific Gates

**Phase 0:**
- `SubscriptionEngine.canTransition` covers every valid state machine edge defined in `v1-master-plan.md §2.5`
- `SubscriptionStatusHistory` is written for every status transition (verified by integration test)
- Trial auto-provisioning does not affect existing businesses that already have a subscription (backfill script verified)

**Phase 1:**
- EXPIRED status blocks all `OPERATIONAL_CAPABILITIES` (verified by integration test for at least 3 operational capabilities)
- EXPIRED status does NOT block `MANAGE_BILLING` or `VIEW_TRANSACTION_HISTORY` (management capabilities)
- The `/billing` route is accessible from any subscription status

**Phase 2:**
- `createPosTransaction` with an offline collection writes `UsageCounter` synchronously (no async boundary introduced)
- `getAuthUser` no longer reads `BusinessSubscription.txUsedThisPeriod` for `txRemaining` — reads `UsageCounter` instead
- Counter reset idempotency: verified by integration test

**Phase 3:**
- `createPosTransaction` credit deduction is conditional — only fires when `billingModel = PREPAID_CREDITS`
- `getAuthUser` no longer reads `BusinessSubscription.creditBalance` — reads latest `CreditLedger.balanceAfter` instead
- Refund credit restoration is conditional — only fires when `billingModel = PREPAID_CREDITS`

**Phase 4:**
- Webhook handler verifies signature before processing any payload (security gate)
- Every webhook handler is idempotent — verified by integration test with duplicate payload delivery
- No Stripe SDK imported outside `src/lib/billing/adapters/`

**Phase 5:**
- `PricingEngine` has zero Prisma/collection imports (G10 — hard blocker)
- `PricingEngine.validateDependencies` detects and rejects cycles
- `PricingResult.grandTotal` does not include `oneTimeFees`
- Quote conversion is atomic: verified by integration test where subscription creation fails mid-conversion
- `EntitlementEngine` composable path resolves from `BusinessSubscriptionFeature` when `billingModel = COMPOSABLE_FEATURES`

---

## 12. Documentation Synchronization

Implementation must never silently diverge from the architecture documents. The following updates are required for each phase.

### Phase 0

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 0 (SaaS) section with task list and ✅ completion markers as tasks are done |
| `ARCHITECTURAL_DECISION_RECORDS.md` | Confirm ADR-001 through ADR-004 are unaffected. No new ADR needed for Phase 0. |
| `v1-master-plan.md` | No changes — it is the source of truth |
| `architecture-compliance-audit.md` | Note that R7 (txUsedThisPeriod deprecation) and R8 (trial provisioning) are addressed in Phase 0 |

### Phase 1

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 1 section |
| `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md` | Add `SubscriptionStatus` lifecycle table to the vocabulary section if not already present |

### Phase 2

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 2 section |
| `ARCHITECTURAL_DECISION_RECORDS.md` | Add ADR-005 (`UsageEngine` — justified by TX tracking being needed across POS, refunds, and background jobs; two call sites make the engine warranted) |
| `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md` | Add `UsageSummary`, `BillingPeriod` to architectural vocabulary |

### Phase 3

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 3 section |
| `ARCHITECTURAL_DECISION_RECORDS.md` | Add ADR-006 (`CreditEngine` — justified by credit logic needed in `createPosTransaction` and `createPosRefund` simultaneously) |
| `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md` | Add `CreditBalance`, `CreditEventType` to architectural vocabulary |

### Phase 4

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 4 section |
| `ARCHITECTURAL_DECISION_RECORDS.md` | Add ADR-007 (`BillingProviderAdapter` pattern — justified by needing to isolate the external billing provider from all domain logic) |

### Phase 5

| Document | Update Required |
|---|---|
| `IMPLEMENTATION_ROADMAP_CORRECTED.md` | Add Phase 5 section |
| `ARCHITECTURAL_DECISION_RECORDS.md` | **Add ADR-009** (Composable pricing via PricingEngine and snapshot model — already documented in `v1-master-plan.md §8.3`; must be formally transcribed to the ADR file before implementation begins) |
| `ARCHITECTURAL_DECISION_RECORDS.md` | **Add ADR-010** (Feature and Pricing as separate domain objects — already documented in `v1-master-plan.md §8.3`) |
| `DOMAIN_CONTRACTS_UBIQUITOUS_LANGUAGE.md` | Add `PricingResult`, `TaxBreakdownLine`, `PriceChangeNotice`, `PricingCatalog`, `FeaturePrice`, `BundleVersion`, `QuoteSnapshot` to vocabulary |
| `ARCHITECTURE_EVOLUTION_STRATEGY.md` | Update Part 2.8 (Billing Domain) to reflect Pricing subdomain structure is implemented and nested in `billing/pricing/` |

### Ongoing Sync Rules

- Every PR description must list which documentation files were updated as part of the change.
- If a PR introduces a new engine, the corresponding ADR must be in the same PR (not a follow-up).
- If a PR changes how `getAuthUser` assembles the entitlement context, `auth-server.ts` comments must be updated to reflect the new assembly path.
- The `SCHEMA_VERSION` value in `collections.ts` must match the migration number it corresponds to — documented in a comment on the constant.

---

## 13. Pull Request Strategy

Each PR must be: small, independently testable, independently reviewable, logically cohesive, and safe to revert without affecting unrelated functionality. The following boundaries are recommended.

### Phase 0 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-0a | `feat(billing): subscription lifecycle schema expansion` | Migration 12 only — schema changes + `prisma generate`. No engine code. | Low | ✅ Shipped |
| PR-0b | `feat(billing): SubscriptionEngine + BillingPeriod value object` | `subscription-engine.ts`, `billing-period.ts`, `subscription-policy.ts`, `billing/types.ts`. No infrastructure wiring. | Low | ✅ Shipped |
| PR-0c | `feat(billing): trial auto-provisioning + status history` | Trial auto-provisioning logic + `SubscriptionStatusHistory` writes. Backfill seeder included. | Medium | ✅ Shipped |
| PR-0d | `feat(billing): subscription lifecycle background job` | `src/lib/jobs/subscription-lifecycle.ts` + `src/lib/jobs/index.ts`. | Low | ✅ Shipped |
| PR-0e | `feat(billing): businessSubscriptionCollection + getAuthUser lifecycle fields` | `collections.ts` collection + `auth-server.ts` update + `types.ts` ConfigKey additions. SCHEMA_VERSION → 12. | Low | ✅ Shipped |

### Phase 1 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-1a | `feat(billing): PlanEngine` | `plan-engine.ts` only. Pure engine, no routes. | Low | ✅ Shipped |
| PR-1b | `feat(billing): subscription UI enforcement + banner` | `subscription-banner.tsx`, `feature-disabled.tsx`, `(private)/route.tsx`, `pos/index.tsx`, `orders/index.tsx`; `EntitlementSummary` + `buildSummary` extended with `trialEndsAt`/`currentPeriodEnd`. | Low | ✅ Shipped |
| PR-1c | `feat(billing): /billing dashboard route` | `/billing/index.tsx` + `/billing/route.tsx`; status card, trial countdown, plan features. | Low | ✅ Shipped |
| PR-1d | `feat(billing): /subscription/reactivate route` | Standalone reactivation shell; suspended → support contact; Phase 4 CTA placeholder. | Low | ✅ Shipped |

### Phase 2 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-2a | `feat(billing): usage counter schema` | Migration 13 only — `UsageCounter`, `BillingInvoice`, `BillingInvoiceItem`, `Transaction.usageCounterId`. | Low | ✅ Shipped |
| PR-2b | `feat(billing): UsageEngine + UsageSummary` | Pure engine + value object. No wiring. | Low | ✅ Shipped |
| PR-2c | `feat(billing): InvoiceEngine` | `invoice-engine.ts`. Pure engine. | Low | ✅ Shipped |
| PR-2d | `feat(billing): TX increment in createPosTransaction` | **Most critical PR in Phase 2.** Single change to `create-pos-transaction.ts`. Requires offline test verification. | High | ✅ Shipped |
| PR-2e | `feat(billing): usageCounterCollection + getAuthUser txRemaining migration` | `collections.ts` + `auth-server.ts` to read from `UsageCounter`. SCHEMA_VERSION → 13. | Medium | ✅ Shipped |
| PR-2f | `feat(billing): usage counter reset background job` | `src/lib/jobs/usage-counter-reset.ts`. | Low | ✅ Shipped |
| PR-2g | `feat(billing): /billing usage stats extension` | Extend `/billing/index.tsx` with usage progress. | Low | ✅ Shipped |

### Phase 3 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-3a | `feat(billing): credit ledger schema` | Migration 14 only. | Low | ✅ |
| PR-3b | `feat(billing): CreditEngine + CreditBalance value object` | Pure engine + value object. No wiring. | Low | ✅ |
| PR-3c | `feat(billing): credit deduction in createPosTransaction` | Conditional deduction; `billingModel = PREPAID_CREDITS` only. | Medium | ✅ |
| PR-3d | `feat(billing): credit restoration in createPosRefund` | Conditional restoration. | Medium | ✅ |
| PR-3e | `feat(billing): credit low-balance notification` | Notification wiring + CREDIT_LOW_BALANCE enum value. | Low | ✅ |
| PR-3f | `feat(billing): /billing/credits route + admin grant` | UI + `grant-credits.ts` + `fetch-credit-ledger.ts`. | Low | ✅ |

### Phase 4 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-4a | `feat(billing): billing provider adapter interface` | `billing-provider.ts` interface only. No implementation. | Low | ✅ Shipped |
| PR-4b | `feat(billing): Stripe adapter implementation` | `stripe-adapter.ts`. Unit tests with mocked Stripe. | Medium | ✅ Shipped |
| PR-4c | `feat(billing): webhook handler` | `routes/api/billing/webhook/index.ts`. Signature verification. Idempotency. | High | ✅ Shipped |
| PR-4d | `feat(billing): billing invoice generation job` | `billing-invoice-generation.ts`. | Medium | ✅ Shipped |
| PR-4e | `feat(billing): /billing/invoices route` | Invoice history UI. | Low | ✅ Shipped |
| PR-4f | `feat(billing): credit package purchase flow` | `purchase-credit-package.ts` + provider checkout integration. | Medium | ✅ Shipped |

### Phase 5 PRs ✅ COMPLETE

| PR | Title | Contents | Risk | Status |
|---|---|---|---|---|
| PR-5a | `feat(billing): composable pricing schema — new models` | Migration 15a — all new tables and enums. No existing model changes. | Low | ✅ Shipped |
| PR-5b | `feat(billing): composable pricing schema — feature expansion` | Migration 15b — Feature field additions + BusinessSubscription relation. Seeder update. | Medium | ✅ Shipped |
| PR-5c | `feat(billing): PricingResult + TaxBreakdownLine + PriceChangeNotice value objects` | Three value objects in `billing/pricing/value-objects/`. | Low | ✅ Shipped |
| PR-5d | `feat(billing): PricingCatalogRepository` | Application Layer interface + implementation. Unit tests. | Low | ✅ Shipped |
| PR-5e | `feat(billing): FeatureBasedPricingStrategy + FlatSubscriptionPricingStrategy` | Two strategies + PricingEngine facade. Unit tests for both. | Medium | ✅ Shipped |
| PR-5f | `feat(billing): EnterprisePricingStrategy + PartnerResellerPricingStrategy + PromotionalPricingStrategy` | Three remaining strategies. | Medium | ✅ Shipped |
| PR-5g | `feat(billing): PricingEngine bundle detection + dependency resolution` | `detectBundle`, `resolveDependencies`, `validateDependencies`. Unit tests including cycle detection. | Medium | ✅ Shipped |
| PR-5h | `feat(billing): ComposableFeaturesStrategy + EntitlementEngine extension` | Subscription engine strategy + entitlement engine composable path. | Medium | ✅ Shipped |
| PR-5i | `feat(billing): PricingQuote lifecycle server functions` | `create-pricing-quote.ts`, `accept-pricing-quote.ts`, `convert-quote-to-subscription.ts`. | High | ✅ Shipped |
| PR-5j | `feat(billing): /billing/pricing calculator route` | Pricing calculator UI. Server-side calculation only. | Medium | ✅ Shipped |
| PR-5k | `feat(billing): /billing/quotes routes` | Quote list + quote detail with accept/decline. | Low | ✅ Shipped |
| PR-5l | `feat(billing): composable renewal background jobs` | `pricing-quote-expiry.ts` + `composable-renewal-preview.ts`. | Low | ✅ Shipped |
| PR-5m | `feat(billing): featureCollection + featureDependencyCollection + featureBundleCollection` | Collection additions + SCHEMA_VERSION → 15. | Low | ✅ Shipped |

---

## 14. Recommended Implementation Order

The following is the complete execution roadmap. Each arrow represents a hard dependency (the phase above must be complete before the phase below begins). Parallel tracks can be developed concurrently.

```
[ Operational Domain — ALL PHASES A–F COMPLETE ]
                        ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 0 — Subscription Lifecycle Foundation  ✅ COMPLETE     │
│  PRs: 0a → 0b → 0c → 0d → 0e                                 │
│  Output: SubscriptionEngine live, trials auto-provisioned,    │
│          lifecycle job running, status history recorded        │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 1 — UI Enforcement + Billing Dashboard  ✅ COMPLETE    │
│  PRs: 1a → 1b → 1c → 1d                                      │
│  Output: EXPIRED subscriptions blocked operationally,         │
│          /billing route live, /subscription/reactivate live   │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 2 — Usage Tracking + Monthly Billing Foundation  ← NEXT│
│  PRs: 2a → 2b → 2c → 2d (critical) → 2e → 2f → 2g           │
│  Output: Every POS transaction counted, TX allowance          │
│          enforced, invoices generated, /billing shows usage   │
└───────────────────────────┬────────────────────┬──────────────┘
                            ↓                    ↓ (parallel)
┌──────────────────────────────────┐  ┌──────────────────────────────────────┐
│  Phase 3 — Prepaid Credits       │  │  Phase 4 (adapter interface + design) │
│  PRs: 3a → 3b → 3c → 3d → 3e   │  │  PR-4a (BillingProviderAdapter stub)  │
│       → 3f                       │  │  PR-4b (Stripe adapter unit tests)    │
│  Output: Credit deduction live,  │  │  Can be developed in parallel while   │
│          /billing/credits live   │  │  Phase 3 is being implemented         │
└──────────────────┬───────────────┘  └──────────────────┬───────────────────┘
                   └──────────────┬────────────────────────┘
                                  ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 4 — External Billing Integration                       │
│  PRs: 4c → 4d → 4e → 4f                                      │
│  Output: Payment provider live, automated invoicing,          │
│          /billing/invoices live, credit purchases live        │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 5a — Composable Pricing Schema                         │
│  PRs: 5a → 5b                                                 │
│  Output: All pricing/quote tables exist in DB                 │
└───────────────────────────┬───────────────────────────────────┘
                            ↓
┌─────────────────────────────────┐  ┌──────────────────────────────────────┐
│  Phase 5b — PricingEngine       │  │  Phase 5b (parallel)                 │
│  PRs: 5c → 5d → 5e → 5f → 5g   │  │  PR-5m (collections + SCHEMA_VERSION) │
│  Output: PricingEngine with all │  │  PR-5h (stub routes for calculator)  │
│          5 strategies + repo    │  │                                      │
└──────────────────┬──────────────┘  └──────────────────────────────────────┘
                   └──────────────┬────────────────────────┘
                                  ↓
┌───────────────────────────────────────────────────────────────┐
│  Phase 5c — Composable Routes + Jobs                          │
│  PRs: 5h → 5i → 5j → 5k → 5l                                 │
│  Output: Pricing calculator live, quote lifecycle live,       │
│          composable subscriptions fully functional            │
└───────────────────────────────────────────────────────────────┘
```

### Phase Completion Criteria Summary

| Phase | Completion Signal | Estimated PR Count | Status |
|---|---|---|---|
| Phase 0 | New businesses provisioned with TRIAL subscription; lifecycle job transitions states automatically | 5 PRs | ✅ COMPLETE |
| Phase 1 | EXPIRED subscription blocks POS checkout; `/billing` route live | 4 PRs | ✅ COMPLETE |
| Phase 2 | Every POS transaction increments `UsageCounter`; TX allowance enforced; invoices generated | 7 PRs | ✅ COMPLETE |
| Phase 3 | Credit deduction on checkout; refund restores credits; `/billing/credits` live | 6 PRs | ✅ COMPLETE |
| Phase 4 | Stripe webhooks processed; automated invoices generated and collected | 6 PRs | ✅ COMPLETE |
| Phase 5 | `PricingEngine` with all strategies; quote lifecycle complete; composable subscriptions live | 13 PRs | ✅ COMPLETE |
| **Total** | | **~41 PRs** | **6/6 phases complete** |

---

## 15. Current Scope vs Future Scope

### 15.1 Current Scope — Required for Initial SaaS Release

The following capabilities are required for the SaaS Foundation to be considered production-ready. All are covered by Phases 0–5 of this plan.

**Subscription Lifecycle:**
- Trial (30 days, configurable) with automatic provisioning
- ACTIVE, GRACE_PERIOD, EXPIRED, LONG_TERM_INACTIVE, SUSPENDED, CANCELLED status transitions
- Automated lifecycle background job
- Immutable status history audit log

**Entitlement Enforcement:**
- Operational capabilities blocked when subscription is EXPIRED or LONG_TERM_INACTIVE
- Management capabilities always accessible
- Per-business `EntitlementOverride` (grant or revoke)
- UI capability gating via `authStore.entitlement.capabilities`

**Billing Models:**
- Monthly Subscription (TX allowance + overage)
- Prepaid Credits (deduction on checkout, restoration on refund)
- Hybrid (allowance + credit overflow)
- Composable Features (business-selected feature set, dynamic price)

**Usage Tracking:**
- `UsageCounter` per business per billing period
- TX increment inside `createPosTransaction`
- Counter reset job on period end
- `txRemaining` surfaced in `authStore` and `/billing` UI

**Invoicing:**
- `BillingInvoice` + `BillingInvoiceItem` models
- Manual invoice generation (admin-triggered initially)
- Automated monthly invoice generation job (Phase 4)
- Invoice history in `/billing/invoices`

**External Billing:**
- Payment provider adapter interface
- Stripe implementation (or equivalent)
- Webhook handling with idempotency
- Credit package purchase via payment provider

**Composable Pricing:**
- `PricingCatalog` versioning (`FeaturePrice` per catalog version)
- `FeatureDependency` graph with auto-resolution
- `FeatureBundle` + `FeatureBundleVersion` with three discount types
- `PricingEngine` with all 5 strategies
- `PricingQuote` lifecycle (DRAFT → CALCULATED → SENT → ACCEPTED → CONVERTED)
- Quote-to-subscription conversion with `BusinessSubscriptionFeature` snapshot
- Pricing calculator UI (`/billing/pricing`)
- Quote management UI (`/billing/quotes`)

**Billing UI:**
- `/billing` dashboard (status, plan, usage, trial countdown)
- `/billing/credits` (balance, history, purchase)
- `/billing/invoices` (history, status)
- `/billing/pricing` (composable calculator)
- `/billing/quotes` + `/$quoteId`
- `/subscription/reactivate`

---

### 15.2 Future Scope — Intentionally Deferred

The following capabilities are explicitly out of scope for the initial SaaS release. They must not complicate or delay Phases 0–5. Each item has a brief rationale for deferral.

**Coupons and Promotional Campaigns**
Discount codes, time-limited promotional rates, and campaign management. Deferred because: the `PromotionalPricingStrategy` in Phase 5 handles subscription-level discounts; per-transaction promo codes require a new `Promotion` domain with its own lifecycle. No architectural blocker — the `PricingEngine` strategy pattern accommodates a promotional overlay without redesign.

**Regional Pricing and Multi-Currency**
Different pricing catalogs per country/region; currency conversion; locale-specific tax rules. Deferred because: the `PricingCatalog` model already has a `currency` field and the architecture accommodates regional variants without redesign. The trigger for implementation is when a second market is targeted.

**Subscription Proration**
Charging or crediting the difference when a business upgrades or downgrades mid-billing-period. Deferred because: it requires precise period-boundary arithmetic and payment provider proration API calls. Phase 0's `BillingPeriod` value object is the foundation; proration logic is a Phase 4+ extension.

**Metered Billing**
Per-usage pricing beyond TX counts (e.g., per-API-call, per-branch-per-day). Deferred because: the `UsageCounter` model tracks TX counts; metered billing requires a more granular event-driven counter that is a significant infrastructure addition.

**Marketplace Billing / Partner Billing / Reseller Pricing**
Multi-vendor marketplace splits, partner commission tracking, reseller margin management. Deferred because: the `PartnerResellerPricingStrategy` in Phase 5 handles the pricing calculation; the billing infrastructure for actually splitting and disbursing payments requires a new domain.

**Platform Administration UI**
The platform operator interface for managing businesses, overriding subscriptions, managing pricing catalogs, and building enterprise quotes. Deferred because: the schema is designed to support it from day one (all models have platform-level vs tenant-level separation), but the UI and a separate auth flow are post-SaaS-Foundation work.

**Subscription Pause / Temporary Freeze**
Allowing a business to pause their subscription (billing stops; access maintained). Deferred because: it requires a new `PAUSED` status and associated lifecycle transitions. The `SubscriptionEngine` can accommodate it; the policy decision (how long, refund rules) is undefined.

**Advanced Eligibility Rules for Entitlement**
Rule-based entitlement grants beyond plan + override (e.g., "grant FEATURE_ANALYTICS if the business has been ACTIVE for more than 90 days"). Deferred because: the current `EntitlementEngine` evaluation order handles overrides and plan features. A rule engine would require a new abstraction.

**Loyalty Points / Rewards Integration**
Earned points on purchases, redemption against subscription fees or product discounts. Deferred because: this is a new domain (`LoyaltyEngine`) with no current codebase foundation. Introduced when a loyalty program ships.

**Subscription Gift / Transfer**
Transferring a subscription between businesses or gifting subscription time. Deferred because: edge case; no business requirement defined.

**Automated Dunning / Retry Logic**
Automatic retry of failed payment with configurable retry schedule and escalating communication. Deferred because: Phase 4 handles the basic webhook (`payment_failed` event); a full dunning sequence requires background job orchestration and template management.

---

### 15.3 Clean Deferral Boundary

The deferred items above are cleanly separated from the initial scope. None of them require any architectural change to accommodate later. The `PricingEngine` strategy pattern, the `PricingCatalog` versioning model, the `SubscriptionEngine` state machine, and the `EntitlementOverride` model are all designed with these future extensions in mind.

The single most important constraint: **deferred features must not be accidentally built into Phase 0–5**. If any PR adds a model, engine, or route that is on the deferred list, it must be rejected.

---

---

## Appendix A — Directory Structure After All Phases Complete

```
src/
  lib/
    entitlement/                          ← EXISTING (Phase F)
      entitlement-engine.ts
      entitlement-types.ts
      capability-keys.ts

    billing/                              ← NEW (Phases 0–5)
      subscription-engine.ts             ← Phase 0
      usage-engine.ts                    ← Phase 2
      credit-engine.ts                   ← Phase 3
      invoice-engine.ts                  ← Phase 2
      plan-engine.ts                     ← Phase 1
      billing-provider.ts                ← Phase 4 (interface)
      types.ts                           ← Phase 0
      policies/
        subscription-policy.ts           ← Phase 0
        billing-policy.ts                ← Phase 2
      strategies/
        monthly-subscription-strategy.ts ← Phase 2
        prepaid-credits-strategy.ts      ← Phase 3
        hybrid-strategy.ts               ← Phase 3
        composable-features-strategy.ts  ← Phase 5
      value-objects/
        billing-period.ts                ← Phase 0
        subscription-status.ts           ← Phase 0
        usage-summary.ts                 ← Phase 2
        credit-balance.ts                ← Phase 3
      adapters/
        stripe-adapter.ts                ← Phase 4
      pricing/                           ← Phase 5 (nested Pricing subdomain)
        pricing-engine.ts
        pricing-catalog-repository.ts
        types.ts
        strategies/
          flat-subscription-pricing-strategy.ts
          feature-based-pricing-strategy.ts
          enterprise-pricing-strategy.ts
          partner-reseller-pricing-strategy.ts
          promotional-pricing-strategy.ts
        value-objects/
          pricing-result.ts
          tax-breakdown-line.ts
          price-change-notice.ts

    jobs/                                 ← NEW (Phase 0+)
      index.ts                           ← Phase 0 (job runner helper)
      subscription-lifecycle.ts          ← Phase 0
      usage-counter-reset.ts             ← Phase 2
      billing-invoice-generation.ts      ← Phase 4
      pricing-quote-expiry.ts            ← Phase 5
      composable-renewal-preview.ts      ← Phase 5

  routes/
    (private)/
      (dashboard)/
        billing/                          ← NEW (Phases 1–5)
          route.tsx                      ← Phase 1
          index.tsx                      ← Phase 1 (extended in Phases 2–3)
          invoices/index.tsx             ← Phase 4
          credits/index.tsx              ← Phase 3
          pricing/index.tsx              ← Phase 5
          quotes/
            index.tsx                    ← Phase 5
            $quoteId/index.tsx           ← Phase 5
    subscription/
      reactivate/index.tsx               ← Phase 1
    api/
      billing/
        webhook/index.ts                 ← Phase 4
```

---

## Appendix B — SCHEMA_VERSION Tracking

| Version | Migration | Phase | Change |
|---|---|---|---|
| 11 | — | Phase E (operational) | GoodsReceipt, GoodsReceiptItem |
| 12 | Migration 12 | Phase 0 | BusinessSubscription expansion, SubscriptionStatusHistory, BillingModel |
| 13 | Migration 13 | Phase 2 | UsageCounter, BillingInvoice, BillingInvoiceItem, Transaction.usageCounterId |
| 14 | Migration 14 | Phase 3 | CreditLedger, CreditEventType |
| 15 | Migration 15a+15b | Phase 5 | All composable pricing models and enums |

---

## Appendix C — Quick Reference: What Exists vs What is Needed

| Component | Exists | Phase Needed |
|---|---|---|
| `EntitlementEngine` | ✅ | — |
| `CapabilityKeys` | ✅ | — |
| `BusinessSubscription` (simplified) | ✅ | Expand in Phase 0 |
| `Feature`, `SubscriptionPlan`, `PlanEntitlement` | ✅ | — |
| `EntitlementOverride` | ✅ | — |
| `SubscriptionStatusHistory` | ✅ | Phase 0 ✅ |
| `BillingModel` enum | ✅ | Phase 0 ✅ |
| `SubscriptionEngine` | ✅ | Phase 0 ✅ |
| `BillingPeriod` value object | ✅ | Phase 0 ✅ |
| `/billing` route | ✅ | Phase 1 ✅ |
| `UsageCounter` | ✅ | Phase 2 ✅ |
| `UsageEngine` | ✅ | Phase 2 ✅ |
| `BillingInvoice` | ✅ | Phase 2 ✅ |
| `InvoiceEngine` | ✅ | Phase 2 ✅ |
| `CreditLedger` | ✅ | Phase 3 ✅ |
| `CreditEngine` | ✅ | Phase 3 ✅ |
| `BillingProviderAdapter` | ✅ | Phase 4 ✅ |
| `PricingCatalog` + `FeaturePrice` | ✅ | Phase 5 ✅ |
| `PricingEngine` | ✅ | Phase 5 ✅ |
| `PricingQuote` + `PricingQuoteItem` | ✅ | Phase 5 ✅ |
| `BusinessSubscriptionFeature` | ✅ | Phase 5 ✅ |

---

*End of IMPLEMENTATION_EXECUTION_PLAN.md*
*StartPOS — SaaS Foundation*
*Document Date: July 31, 2026*
*Status: All 6 phases complete. SaaS Foundation fully implemented.*
*Source of Truth: v1-master-plan.md (Parts 2–8)*
