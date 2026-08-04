# Business Evolution Engine — Master Plan
## Onboarding & Capability Lifecycle Architecture

**Version:** 1.0 (consolidated from three design iterations)
**Date:** August 2026
**Status:** Architecture Design — Not yet implemented

---

## What This Document Is

This is the single authoritative reference for how the platform discovers what a
business needs, configures itself accordingly, and continues to learn and adapt as
the business grows.

It covers everything in one place:

- The complete platform capability inventory (what exists today)
- The adaptive onboarding survey (what we ask and why)
- The `BusinessCharacteristics` model (the stable contract between survey and features)
- The Capability Registry architecture (how capabilities self-describe their requirements)
- The Business Intelligence Engine (how the platform learns from ongoing behavior)
- The Growth Detection and Recommendation engines (how the platform coaches the business)
- The User Override and Control model (how the user stays in charge)
- The Capability Lifecycle (the eight states a capability moves through)
- The Business Health model
- The AI extension seam
- Schema changes, migration strategy, implementation phasing, risks, and trade-offs

---

## Core Philosophy

**The platform is not a configuration wizard. It is an adaptive business operating system.**

The onboarding survey is an initial conversation — a first hypothesis about what the
business needs. Everything the business does after that is evidence. The platform
continuously updates its understanding and surfaces the right capabilities at the
right moment, without overwhelming the user or requiring manual reconfiguration.

```
OLD APPROACH
Register → Pick business type → Get a fixed config → Done forever

THIS APPROACH
Survey (initial hypothesis)
      +
Ongoing behavior (continuous observation)
      +
Explicit user decisions (always in control)
      ↓
Living understanding of the business
      ↓
Right capabilities, at the right time, with clear explanations
```

Three principles govern every design decision:

1. **The survey discovers the business. It never asks about features.**
   No question should expose an internal module name or config key.

2. **Capabilities are self-describing. The engine never hard-codes feature logic.**
   Adding a new feature requires one registry entry. Nothing else changes.

3. **User intent always wins.**
   Every automated decision is revocable. Every inference is correctable.

---

## Table of Contents

1. Platform Capability Inventory
2. Capability Dependency Graph
3. The `BusinessCharacteristics` Model
4. Adaptive Survey Design
5. Architecture Overview — The Twelve Modules
6. Business Intelligence Engine
7. Capability Registry
8. Capability Lifecycle
9. Configuration Engine
10. Growth Detection Engine
11. Recommendation Engine
12. Business Health Model
13. User Override and Control Engine
14. Progressive Activation Engine
15. AI Extension Points
16. Operational Profiles
17. Lite POS — First-Class Minimal Profile
18. Business Evolution Scenarios
19. Schema Changes
20. Implementation Phasing
21. Migration from Current System
22. Risks and Trade-offs
23. File Map


---

# Part 1 — Platform Capability Inventory

A complete audit of every major capability in the platform as of the codebase audit.
Derived from `capability-keys.ts`, `prisma/schema.prisma`, `ConfigKey`, and route analysis.

## 1A — Operational Capabilities
Blocked when the subscription lapses (marked `isOperational = true` on the `Feature` record).

| Capability Key | Module | Description | Config Dependency |
|---|---|---|---|
| `COMPLETE_CHECKOUT` | POS | Process a sale at the point of sale | — |
| `CREATE_ORDER` | Orders | Create a kitchen/service order before payment | `ENABLE_ORDER=true` |
| `EDIT_ACTIVE_ORDER` | Orders | Modify an in-progress order | `ENABLE_ORDER_TAB=true` |
| `RECORD_PAYMENT` | POS | Record payment splits (cash, card, e-wallet) | — |
| `ISSUE_REFUND` | POS | Process a refund against a prior transaction | — |
| `PRINT_RECEIPT` | POS | Print or generate a receipt | `ENABLE_PRINT_RECEIPT=true` |
| `START_VENDOR_SESSION` | Sessions | Open a shift for end-of-day reconciliation | `ENABLE_CASH_RECONCILIATION=true` |
| `CREATE_PURCHASE` | Purchasing | Create a purchase order from a supplier | — |
| `MANAGE_INVENTORY` | Inventory | Adjust, transfer, or write off stock | — |
| `CREATE_TASK` | Tasks | Create operational workflow tasks | `ENABLE_TASK=true` |

## 1B — Management Capabilities
Always accessible regardless of subscription status (read-only when expired).

| Capability Key | Module | Description |
|---|---|---|
| `MANAGE_PRODUCTS` | Products | Create and manage the product catalogue |
| `MANAGE_EMPLOYEES` | Employees | Add staff, assign roles and branch access |
| `MANAGE_CUSTOMERS` | CRM | Create and manage customer profiles |
| `MANAGE_SUPPLIERS` | Purchasing | Create and manage supplier records |
| `VIEW_SALES_REPORTS` | Reporting | Revenue, margin, and product performance reports |
| `VIEW_INVENTORY_REPORTS` | Reporting | Stock level, movement, and valuation reports |
| `VIEW_TRANSACTION_HISTORY` | Reporting | Full paginated transaction audit trail |
| `VIEW_ORDER_HISTORY` | Reporting | Order history with status and items |
| `VIEW_ANALYTICS` | Analytics | Dashboard analytics (add-on) |
| `EXPORT_DATA` | Data | CSV exports for inventory, transactions |
| `MANAGE_SETTINGS` | Settings | Units, categories, locations, suppliers |
| `MANAGE_BRANCHES` | Multi-Branch | Add and manage additional branches |
| `MANAGE_BILLING` | Billing | View and manage subscription and billing |
| `REACTIVATE_SUBSCRIPTION` | Billing | Reactivate after expiry |
| `ACCESS_API` | API | Programmatic API access for integrations |

## 1C — System Configuration Settings (ConfigKey)

| Key | Scope | Default | What It Controls |
|---|---|---|---|
| `ENABLE_ORDER` | Business | false | Activates the Orders module |
| `ENABLE_ORDER_TAB` | Business | false | Allows editing an active order before payment |
| `ENABLE_CASH_RECONCILIATION` | Business | false | Activates vendor sessions and end-of-day cash audit |
| `ENABLE_TASK` | Business | false | Activates operational task workflow |
| `ENABLE_PRINT_RECEIPT` | Business | false | Enables receipt printing |
| `PRICE_CONFIGURATION` | Business | EXCLUSIVE | INCLUSIVE (tax in price) vs EXCLUSIVE (tax added on top) |
| `IS_VAT_REGISTERED` | Business | false | Whether the business is VAT-registered |
| `VAT_RATE` | Business | 12 | Default VAT rate (%) |
| `LOCALE` | Business | en-PH | Language and locale |
| `CURRENCY` | Business | PHP | Display currency |
| `LOW_STOCK_THRESHOLD` | Branch | 20 | Units below which low-stock alert fires |
| `BUFFER_RATE` | Branch | 20 | % markup buffer in costing reports |
| `AUTO_APPROVE_LOW_STOCK_REFILL` | Business | true | Auto-approve shelf refill tasks on low-stock |
| `HINT_FREQUENCY_DAYS` | Business | 1 | Days between showing the same onboarding hint |
| `HINT_DISPLAY_SECONDS` | Business | 6 | Auto-dismiss timeout for hints |

## 1D — Operational Workflows

| Workflow | States | Key Dependencies |
|---|---|---|
| Purchase Order | DRAFT → PENDING_APPROVAL → APPROVED → RECEIVED → VOIDED / CLOSED | Suppliers, Products |
| Goods Receipt Note | PENDING → CONFIRMED / DISPUTED | Purchase Orders |
| Operational Task | DRAFT → PENDING → APPROVED → IN_PROGRESS → FULFILLED → REVIEWED / CANCELLED | `ENABLE_TASK=true` |
| Vendor Session | OPEN → CLOSED | `ENABLE_CASH_RECONCILIATION=true` |
| Order / Kitchen Tab | PENDING → PREPARING → SERVED / CANCELLED | `ENABLE_ORDER=true` |

## 1E — Task Types

| Task Type | Purpose | Enabled When |
|---|---|---|
| `SHELF_REFILL` | Move stock from backroom to display | Multiple stock locations |
| `PURCHASE_REQUEST` | Request procurement from a supplier | Has suppliers |
| `BRANCH_TRANSFER` | Move stock between branches | Multi-branch enabled |
| `STOCK_COUNT` | Physical audit of inventory | Inventory tracking active |
| `WASTE_DISPOSAL` | Write off damaged or expired goods | Has perishables |
| `CASH_RECONCILIATION` | End-of-day cash drawer audit | Cash reconciliation active |
| `GENERAL_CHORE` | Freeform operational task | Always available |

## 1F — Notifications

| Type | Trigger |
|---|---|
| `LOW_STOCK` | Inventory falls below `LOW_STOCK_THRESHOLD` |
| `NEW_ORDER` | Order created (if `ENABLE_ORDER=true`) |
| `TASK_ASSIGNED` | Task assigned to an employee |
| `TASK_OVERDUE` | Task past due date |
| `PURCHASE_PENDING_APPROVAL` | Purchase above threshold awaiting manager sign-off |
| `CREDIT_LOW_BALANCE` | Prepaid credit balance below threshold |
| `COMPLIANCE_REMINDER` | BIR registration data incomplete |
| `SYSTEM_ALERT` | Platform-level notification (always active) |

## 1G — Future Capabilities (planned, not yet built)

These are registered in the Capability Registry today with `required: () => false`.
When each ships, only the registry entry changes — the survey does not.

| Capability | Signal That Suggests It | Current Status |
|---|---|---|
| Loyalty / Points | Returning customers, loyalty intent | Planned |
| Kitchen Display System | Sells food, high order customization | Planned |
| Delivery Management | Offers delivery orders | Planned |
| Reservations | Table management, service bookings | Planned |
| Workforce Scheduling | Medium/large team | Planned |
| AI Inventory Forecasting | Strict inventory criticality, perishables | Planned |
| CSV Product Importer | Large catalogue | In design |
| Self-Hosted License | Enterprise contracts | Designed, not built |


---

# Part 2 — Capability Dependency Graph

```
PLATFORM CORE (always active)
├── Authentication
│   └── Roles: ADMIN, SUPERVISOR, CASHIER, SERVICE_PROVIDER
│
├── Product Catalogue [MANAGE_PRODUCTS]
│   ├── Required: Categories, Units
│   ├── Optional: Variants (size, color, flavor, portion, material)
│   ├── Optional: Product Components (recipe / bundle / addon)
│   ├── Optional: Expiry tracking (Product.hasExpiry)
│   ├── Optional: Deposit tracking (Product.requiresDeposit)
│   └── Optional: Service duration (Product.durationMinutes)
│
└── Settings [MANAGE_SETTINGS]
    ├── Units, Categories, Locations, Suppliers, Customers

POS / SALES ENGINE
├── COMPLETE_CHECKOUT [always]
│   ├── Required: Products with prices
│   ├── Optional: Customer attachment [MANAGE_CUSTOMERS]
│   ├── Optional: Receipt printing [PRINT_RECEIPT]
│   ├── Optional: Tax compliance (VAT, SC/PWD, BIR fields)
│   └── Optional: Inventory deduction [MANAGE_INVENTORY]
│
├── CREATE_ORDER [ENABLE_ORDER]
│   ├── Required: COMPLETE_CHECKOUT
│   ├── Optional: EDIT_ACTIVE_ORDER [ENABLE_ORDER_TAB]
│   ├── Optional: Order types (DINE_IN, TAKEOUT, DELIVERY)
│   └── Optional: Add-ons / modifiers per item
│
├── ISSUE_REFUND [always]
│   └── Required: prior COMPLETE_CHECKOUT transaction
│
└── START_VENDOR_SESSION [ENABLE_CASH_RECONCILIATION]
    └── Produces: CASH_RECONCILIATION task

INVENTORY ENGINE
├── MANAGE_INVENTORY
│   ├── Required: Products, Locations
│   ├── Movement types: IN, OUT, ADJUST, WASTE, EXTERNAL_TRANSFER, INTERNAL_TRANSFER
│   ├── Optional: Batch + expiry tracking
│   ├── Optional: Costing method (FIFO, Moving Average, Specific)
│   └── Feeds: VIEW_INVENTORY_REPORTS
│
└── Tasks [ENABLE_TASK]
    ├── SHELF_REFILL → needs Locations (source + target)
    ├── PURCHASE_REQUEST → needs Suppliers
    ├── BRANCH_TRANSFER → needs MANAGE_BRANCHES
    ├── STOCK_COUNT → needs MANAGE_INVENTORY
    ├── WASTE_DISPOSAL → needs MANAGE_INVENTORY
    ├── CASH_RECONCILIATION → needs START_VENDOR_SESSION
    └── GENERAL_CHORE → no dependencies

PURCHASING ENGINE [CREATE_PURCHASE]
├── Required: MANAGE_SUPPLIERS, Products
├── Optional: Approval workflow (PENDING_APPROVAL state, needs SUPERVISOR role)
├── Optional: Goods Receipt Notes (PENDING → CONFIRMED / DISPUTED)
│   └── CONFIRMED credits inventory [MANAGE_INVENTORY]
└── Feeds: VIEW_INVENTORY_REPORTS (cost data)

CRM [MANAGE_CUSTOMERS]
├── Optional: Attach customer to transaction
├── Optional: SC/PWD discount compliance
├── Optional: Corporate buyer TIN + address
└── Feeds: VIEW_TRANSACTION_HISTORY (customer history)

MULTI-BRANCH [MANAGE_BRANCHES]
├── Required: Multiple branches in DB
├── Optional: Per-branch inventory
├── Optional: BRANCH_TRANSFER task type
└── Optional: Per-branch settings and compliance registry

REPORTING (always accessible)
├── VIEW_SALES_REPORTS → needs at least one COMPLETE_CHECKOUT
├── VIEW_TRANSACTION_HISTORY → needs at least one COMPLETE_CHECKOUT
├── VIEW_INVENTORY_REPORTS → needs MANAGE_INVENTORY
├── VIEW_ORDER_HISTORY → needs CREATE_ORDER
├── EXPORT_DATA → available when data exists
└── VIEW_ANALYTICS → plan add-on

BILLING (always accessible)
├── MANAGE_BILLING
├── REACTIVATE_SUBSCRIPTION
└── ACCESS_API [Enterprise plan only]
```

## Conflicting Configurations

| Conflict | Resolution |
|---|---|
| `PRICE_CONFIGURATION=INCLUSIVE` with `IS_VAT_REGISTERED=false` | Force `PRICE_CONFIGURATION=EXCLUSIVE` — inclusive pricing implies VAT |
| `ENABLE_ORDER=false` with `ENABLE_ORDER_TAB=true` | Force `ENABLE_ORDER_TAB=false` — tab requires orders |
| `ENABLE_CASH_RECONCILIATION=false` with `CASH_RECONCILIATION` task | Suppress that task type from the creation UI |
| `MANAGE_BRANCHES` without plan entitlement | Show upgrade prompt; do not silently fail |


---

# Part 3 — The `BusinessCharacteristics` Model

`BusinessCharacteristics` is the stable contract between the survey and every
downstream module. The survey produces it. Capabilities consume it. Neither side
knows about the other's internals. It describes the business as observable facts —
never feature flags, never config keys, never module names.

```ts
/**
 * BusinessCharacteristics
 *
 * Design constraints:
 *   - Fields are factual ("sellsPhysicalGoods") not prescriptive ("needsInventory")
 *   - No capability keys, no config keys, no module names
 *   - Safe defaults produce the most minimal configuration
 *   - Every field can be sourced from survey, usage, config, or admin override
 */
export type BusinessCharacteristics = {
  // Scale
  dailyTransactionVolume: 'minimal' | 'low' | 'medium' | 'high'
  teamSize:               'solo' | 'small' | 'medium' | 'large'
  locationCount:          'one' | 'multiple'

  // What is sold
  sellsPhysicalGoods:   boolean
  sellsPreparedFood:    boolean
  sellsServices:        boolean
  sellsRawMaterials:    boolean
  catalogueSize:        'tiny' | 'small' | 'medium' | 'large'
  hasProductVariants:   boolean
  hasProductComponents: boolean
  hasPerishables:       boolean

  // Sales process
  paymentTiming:            'immediate' | 'deferred' | 'mixed'
  requiresTableManagement:  boolean
  hasOrderCustomization:    boolean
  offersDelivery:           boolean

  // Inventory
  tracksInventory:            boolean
  inventoryCriticality:       'none' | 'relaxed' | 'standard' | 'strict'
  hasMultipleStockLocations:  boolean
  usesSuppliers:              boolean
  requiresGoodsReceipt:       boolean
  hasRegularWaste:            boolean

  // Team and operations
  hasRoleSeparation:   boolean
  requiresApprovals:   boolean
  usesOperationalTasks: boolean

  // Finance and compliance
  handlesCash:              boolean
  reconcilesCash:           boolean
  isVatRegistered:          boolean
  taxDisplayMode:           'inclusive' | 'exclusive' | 'mixed'
  requiresOfficialReceipts: boolean
  hasCorporateBuyers:       boolean

  // Customers
  tracksCustomers:  boolean
  hasLoyaltyIntent: boolean

  // Growth
  plansExpansion:            boolean
  needsExternalIntegrations: boolean
}
```

## Safe Defaults

When a question is not reached (path pruned) or the survey is incomplete, every
field resolves to its safe default. Safe defaults always produce the most minimal
configuration — nothing is enabled that wasn't signalled.

```ts
export const DEFAULT_CHARACTERISTICS: BusinessCharacteristics = {
  dailyTransactionVolume: 'low',
  teamSize: 'solo',
  locationCount: 'one',
  sellsPhysicalGoods: true,   // assume something is being sold
  sellsPreparedFood: false,
  sellsServices: false,
  sellsRawMaterials: false,
  catalogueSize: 'small',
  hasProductVariants: false,
  hasProductComponents: false,
  hasPerishables: false,
  paymentTiming: 'immediate',
  requiresTableManagement: false,
  hasOrderCustomization: false,
  offersDelivery: false,
  tracksInventory: false,
  inventoryCriticality: 'none',
  hasMultipleStockLocations: false,
  usesSuppliers: false,
  requiresGoodsReceipt: false,
  hasRegularWaste: false,
  hasRoleSeparation: false,
  requiresApprovals: false,
  usesOperationalTasks: false,
  handlesCash: true,          // cash is the universal fallback
  reconcilesCash: false,
  isVatRegistered: false,
  taxDisplayMode: 'exclusive',
  requiresOfficialReceipts: false,
  hasCorporateBuyers: false,
  tracksCustomers: false,
  hasLoyaltyIntent: false,
  plansExpansion: false,
  needsExternalIntegrations: false,
}
```

## Living Characteristics — How the Model Evolves

After registration, `BusinessCharacteristics` is no longer static. Each field becomes
a `SourcedValue<T>` — the raw value plus where it came from, how confident the system
is, and when it was last observed. The Business Intelligence Engine merges evidence
from all sources and resolves conflicts using a priority ladder.

```ts
export type SourcedValue<T> = {
  value:       T
  source:      CharacteristicSource
  confidence:  number    // 0.0–1.0
  observedAt:  Date
  evidence?:   string    // Human-readable explanation (for the user-facing profile editor)
}

// Source priority (highest to lowest):
// ADMIN_DECISION > SYSTEM_CONFIG > USAGE_OBSERVATION > BUSINESS_EVENT > SURVEY_ANSWER > AI_INFERENCE
```

Survey answers are the initial hypothesis. They are never deleted but can be
outranked by any higher-priority source. A business that said "I don't track
inventory" on Day 1 and has since created 30 purchase orders will have
`usesSuppliers` and `tracksInventory` updated to `true` by `USAGE_OBSERVATION`
sources, overriding the original survey answer.


---

# Part 4 — Adaptive Survey Design

## Design Philosophy

The survey is a dynamic interview, not a form. It walks a decision tree shaped by
previous answers. Most businesses answer 8–12 questions. Complex businesses reach 18.

Three principles govern every question:

1. **Justification** — A question is only asked if its answer changes at least one
   `BusinessCharacteristics` field. If no answer variant changes anything, cut it.
2. **Branching** — No question appears unless a prior answer made it relevant.
   The tree is pruned aggressively at every node.
3. **Deferral** — If a characteristic can be inferred from usage (the system will
   observe it anyway), don't ask. Ask only what the system cannot discover on its own.

## Question Classification

Every question from the original 33-question design was evaluated against these principles.

| Question | Classification | Reason |
|---|---|---|
| Typical daily sales volume | **Core** | Sets `dailyTransactionVolume`; affects profile and plan suggestion |
| Team size | **Core** | Single most important branching gate — eliminates entire sections |
| One location or multiple | **Core** | Determines multi-branch path immediately |
| What do you sell | **Core** | Primary branching question — shapes the entire remaining tree |
| How many products | **Deferred** | Inferable from product setup; not worth asking upfront |
| Products with variants | **Conditional** | Only if sellsPhysicalGoods or sellsPreparedFood |
| Products with expiry dates | **Conditional** | Only if sellsPhysicalGoods or sellsPreparedFood |
| Products made from ingredients | **Conditional** | Only if sellsPreparedFood or sellsRawMaterials |
| Pay immediately or order first | **Core** | Primary sales flow gate |
| Table / takeout / delivery | **Conditional** | Only if paymentTiming = deferred or mixed |
| Customizations and add-ons | **Conditional** | Only if paymentTiming = deferred or mixed |
| Anonymous vs recorded customers | **Deferred** | Inferable from usage patterns |
| SC/PWD special pricing | **Conditional** | Only if isVatRegistered = true |
| Stock accuracy criticality | **Conditional** | Only if tracksInventory = true |
| Multiple stock locations | **Conditional** | Only if tracksInventory = true AND teamSize ≠ solo |
| How do you restock | **Core (gated)** | Shown if tracksInventory = true; determines usesSuppliers |
| Regular tracked suppliers | **Removed** | Redundant — restock question captures it |
| Waste write-offs | **Conditional** | Only if hasPerishables = true |
| Payment methods | **Core (gated)** | If teamSize ≠ solo or dailyVolume ≥ medium |
| Cash reconciliation | **Conditional** | Only if handlesCash = true |
| VAT registered | **Core** | Significant compliance branch |
| Tax in price or added on top | **Conditional** | Only if isVatRegistered = true |
| Different access levels | **Conditional** | Only if teamSize ≠ solo |
| Approval workflows | **Conditional** | Only if teamSize = medium or large |
| Assign and track staff tasks | **Conditional** | Only if teamSize ≠ solo |
| Loyalty and returning customers | **Deferred** | Detected from transaction patterns |
| Corporate buyers / tax invoices | **Conditional** | Only if isVatRegistered = true |
| Importance of performance reports | **Removed** | Everyone wants reports — not discriminating |
| How often to check stock levels | **Removed** | Replaced by stock criticality question |
| Permanent audit trail | **Removed** | Always enabled; not configurable |
| Plans to open new locations | **Core** | Directly maps to plansExpansion |
| External system integrations | **Conditional** | Only if dailyVolume = high or teamSize = large |
| BIR-compliant official receipts | **Conditional** | Only if isVatRegistered = true |

**Result:** 33 original questions → 8–18 adaptive questions depending on the path.

## The Question Tree

```
START
│
Q1: What does your business primarily do? (multi-select, always shown)
    [A] Sell physical products (goods, merchandise)
    [B] Sell food or beverages you prepare on-site
    [C] Provide services (repairs, treatments, appointments)
    [D] Sell raw materials or wholesale to other businesses
│
Q2: How many people work here, including yourself? (always shown)
    [A] Just me
    [B] 2 to 5 people
    [C] 6 to 20 people
    [D] More than 20 people
│
Q3: When a customer pays, how does it usually work? (always shown)
    [A] They pay right away — I ring them up at the counter
    [B] They order and I collect payment when they're ready
    [C] Both happen depending on the situation
    │
    ├── [if B or C] Q3a: How do customers receive what they ordered?
    │       [A] They sit at a table (dine-in)
    │       [B] They pick it up at the counter (takeout)
    │       [C] It's delivered to them
    │       [D] A mix of the above
    │
    └── [if B or C] Q3b: Do customers customize or add extras to orders?
            [A] Yes, very often — modifiers and add-ons are common
            [B] Occasionally
            [C] No, orders are always the same
│
[if Q1 includes A or D]
Q4: Do you track how much stock you have?
    [A] Yes — I need to know my stock levels at all times
    [B] I check periodically but don't track it in real time
    [C] No — I don't track stock
    │
    ├── [if A or B] Q4a: How do you replenish stock when it runs low?
    │       [A] I order from specific suppliers and track those orders
    │       [B] I buy from wherever is available without formal tracking
    │
    ├── [if A + teamSize ≠ solo] Q4b: Do you store stock in different areas or rooms?
    │       [A] Yes, different storage areas or zones
    │       [B] No, everything is in one place
    │
    └── [if Q1 includes A or B] Q4c: Do any of your products have an expiry date?
            [A] Yes, quite a few
            [B] Some do
            [C] No
│
[if teamSize ≠ solo]
Q5: Do different staff members need different levels of access?
    [A] Yes — I need to control what each person can do
    [B] Not right now, but I'd like that option later
    [C] No — everyone has the same access
    │
    └── [if A + teamSize = medium or large] Q5a: Do certain actions need manager approval?
            [A] Yes — purchases, adjustments, and big decisions need sign-off
            [B] Only for larger or unusual requests
            [C] No, anyone can do what they need to do
│
Q6: Is your business registered for VAT? (always shown)
    [A] Yes, we are VAT-registered
    [B] No
    [C] I'm not sure
    │
    ├── [if A] Q6a: When you show prices, is tax already included?
    │       [A] Yes — the price shown is the final price including tax
    │       [B] No — tax is added at checkout on top of the shown price
    │
    └── [if A] Q6b: Do you issue official receipts with regulatory numbers?
            [A] Yes, we're required to issue BIR-compliant receipts
            [B] We print informal receipts but don't require full compliance yet
            [C] We don't currently issue printed receipts
│
Q7: Do you operate from one place, or multiple? (always shown)
    [A] Just one location
    [B] Multiple locations, branches, or outlets
│
[if Q7=B, or high volume, or large team]
Q8: Do you plan to open more locations in the next year?
    [A] Yes, expansion is in my near-term plans
    [B] Possibly, but nothing definite
    [C] No plans right now
```

## Question Count by Business Type

| Business type | Questions | Characteristics derived |
|---|---|---|
| Solo street food vendor | 8 | 12 |
| Small retail shop, no staff | 9 | 15 |
| Restaurant with staff | 13 | 22 |
| Multi-branch wholesale | 15 | 28 |
| Solo service provider | 6 | 10 |
| Large enterprise retailer | 15 | 30+ |

## Answer-to-Characteristic Mapping

The `BusinessCharacteristicEngine` is a pure function that translates survey answers
into the `BusinessCharacteristics` object. Key mappings:

```ts
// Q1 multi-select → product type flags
sellsPhysicalGoods = q1.includes('physical_goods')
sellsPreparedFood  = q1.includes('food_beverage')
sellsServices      = q1.includes('services')
sellsRawMaterials  = q1.includes('raw_materials')

// Q2 → teamSize
'just_me'      → 'solo'
'2_to_5'       → 'small'
'6_to_20'      → 'medium'
'more_than_20' → 'large'

// Q3 → paymentTiming
'pay_right_away'  → 'immediate'
'order_then_pay'  → 'deferred'
'both'            → 'mixed'

// Q3a → table/delivery flags (only if paymentTiming ≠ immediate)
requiresTableManagement = q3a.includes('dine_in')
offersDelivery          = q3a.includes('delivery')

// Q4 → inventory
tracksInventory      = q4 !== 'no'
inventoryCriticality = q4 === 'yes_strict' ? 'strict'
                     : q4 === 'yes_relaxed' ? 'standard'
                     : q4 === 'periodic' ? 'relaxed' : 'none'

// Q4a → suppliers
usesSuppliers        = q4a === 'formal_suppliers'
requiresGoodsReceipt = usesSuppliers && teamSize !== 'solo'

// Q5/Q5a → team
hasRoleSeparation    = q5 === 'yes'
requiresApprovals    = q5a === 'yes_strict' || q5a === 'yes_some'

// Q6 → compliance
isVatRegistered          = q6 === 'yes'
taxDisplayMode           = q6a === 'inclusive' ? 'inclusive' : 'exclusive'
requiresOfficialReceipts = q6b === 'bir_compliant'

// Q7/Q8 → location
locationCount  = q7 === 'multiple' ? 'multiple' : 'one'
plansExpansion = q8 === 'yes' || locationCount === 'multiple'
```


---

# Part 5 — Architecture Overview

The engine has twelve single-responsibility modules organized into four layers.
Each module has a typed input, a typed output, and no knowledge of adjacent modules.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BUSINESS EVOLUTION ENGINE                             │
│                                                                              │
│  DISCOVERY LAYER                                                             │
│  ┌───────────────┐    ┌────────────────────────────────────────────────┐   │
│  │   Question    │───▶│   Business Characteristic Engine (survey)      │   │
│  │   Registry    │    │   SurveyAnswers → initial BusinessCharacteristics│   │
│  └───────────────┘    └───────────────────────┬────────────────────────┘   │
│                                               │ initial hypothesis          │
│  INTELLIGENCE LAYER                           │                             │
│  ┌────────────────────────────────────────────▼───────────────────────────┐ │
│  │              Business Intelligence Engine                              │ │
│  │   survey + events + usage + config + admin → LivingCharacteristics    │ │
│  │   Projects to CharacteristicsSnapshot for downstream pure engines     │ │
│  └────────────────────────────────────────────┬───────────────────────────┘ │
│                              ┌─────────────────┴──────────────────┐         │
│              ┌───────────────▼──────────┐         ┌───────────────▼───────┐ │
│              │   Capability Resolver    │         │  Profile Classifier   │ │
│              │   (lifecycle-aware)      │         │  (growth-aware)       │ │
│              └───────────────┬──────────┘         └───────────────┬───────┘ │
│                              └──────────────┬──────────────────────┘         │
│                    ┌─────────────────────────▼────────────────────────────┐  │
│                    │              Configuration Engine                    │  │
│                    └─────────────────────────┬────────────────────────────┘  │
│                                              │                               │
│  ADAPTATION LAYER                            │                               │
│       ┌──────────────────────────────────────▼──────────────────────────┐   │
│       │   Growth Detection Engine                                        │   │
│       └──────────────────────────────────────┬──────────────────────────┘   │
│       ┌──────────────────────────────────────▼──────────────────────────┐   │
│       │   Recommendation Engine                                          │   │
│       └──────────────────────────────────────┬──────────────────────────┘   │
│       ┌──────────────────────────────────────▼──────────────────────────┐   │
│       │   Business Health Model                                          │   │
│       └──────────────────────────────────────┬──────────────────────────┘   │
│       ┌──────────────────────────────────────▼──────────────────────────┐   │
│       │   User Override & Control Engine                                 │   │
│       └──────────────────────────────────────┬──────────────────────────┘   │
│       ┌──────────────────────────────────────▼──────────────────────────┐   │
│       │   Progressive Activation Engine                                  │   │
│       └────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  OBSERVABILITY LAYER                                                         │
│       ┌────────────────────────────────────────────────────────────────┐    │
│       │   Business Event Bus  (typed events → all subscribers)         │    │
│       └────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Module | Layer | Responsibility |
|---|---|---|
| Question Registry | Discovery | Defines adaptive questions and branching rules |
| Business Characteristic Engine | Discovery | Translates survey answers to initial characteristics |
| Business Intelligence Engine | Intelligence | Merges all sources into living characteristics |
| Capability Resolver | Intelligence | Evaluates the full registry; assigns lifecycle state |
| Profile Classifier | Intelligence | Classifies operational profile; detects growth transitions |
| Configuration Engine | Intelligence | Produces persisted config from resolved capabilities |
| Business Event Bus | Observability | Routes typed business events to all subscribers |
| Growth Detection Engine | Adaptation | Detects scale changes; fires threshold events |
| Recommendation Engine | Adaptation | Produces prioritized, explained recommendations |
| Business Health Model | Adaptation | Measures platform adoption depth |
| User Override Engine | Adaptation | Manages user decisions on capabilities and characteristics |
| Progressive Activation Engine | Adaptation | Delivers and tracks activation offers |


---

# Part 6 — Business Intelligence Engine

The Intelligence Engine is the only module with write access to `Business.livingCharacteristics`.
It merges all evidence sources into a single `LivingCharacteristics` object using priority
rules and confidence scoring, then projects a flat `CharacteristicsSnapshot` for the pure
engines downstream.

## Source Priority

```
1. ADMIN_DECISION      — Explicit platform admin override. Overrides everything.
2. SYSTEM_CONFIG       — User explicitly changed a config key in Settings.
3. USAGE_OBSERVATION   — Derived from sustained app usage (minimum counts required).
                         Confidence decays if usage stops for 90+ days.
4. BUSINESS_EVENT      — From a single meaningful event (branch created, etc.).
                         Lower than sustained usage because events can be reversed.
5. SURVEY_ANSWER       — What the user answered on Day 1. Never deleted.
                         The permanent baseline — overridden by any higher source.
6. AI_INFERENCE        — Future model-derived inference. Never overrides explicit sources.
```

## Confidence Decay

Usage-based observations age. After a grace window, confidence starts declining.
A characteristic with confidence below 0.3 is treated as stale and falls back
to the next-priority source.

| Source | Grace Window | Fully Stale After |
|---|---|---|
| ADMIN_DECISION | Never | Never |
| SYSTEM_CONFIG | Never | Never |
| USAGE_OBSERVATION | 30 days | 120 days |
| BUSINESS_EVENT | 60 days | 180 days |
| SURVEY_ANSWER | Never | Never |
| AI_INFERENCE | 14 days | 60 days |

## Observation Rules Registry

Each characteristic has observation rules — conditions on the usage summary and event log
that update the characteristic's value and source. All rules are data, not code branches.

Sample rules:

```
tracksInventory = true     when: inventoryAdjustmentCount ≥ 10           (USAGE_OBSERVATION, 0.90)
tracksInventory = true     when: purchaseOrderCount ≥ 3                  (USAGE_OBSERVATION, 0.95)
usesSuppliers = true       when: supplierCount ≥ 1                       (BUSINESS_EVENT, 0.95)
teamSize = 'small'         when: employeeCount ≥ 2 AND ≤ 5              (USAGE_OBSERVATION, 0.99)
teamSize = 'medium'        when: employeeCount ≥ 6 AND ≤ 20             (USAGE_OBSERVATION, 0.99)
teamSize = 'large'         when: employeeCount > 20                      (USAGE_OBSERVATION, 0.99)
locationCount = 'multiple' when: branchCount ≥ 2                         (BUSINESS_EVENT, 1.0)
tracksCustomers = true     when: customerCount ≥ 10                      (USAGE_OBSERVATION, 0.85)
reconcilesCash = true      when: reconciliationCount ≥ 5                 (USAGE_OBSERVATION, 0.90)
requiresApprovals = true   when: approvalWorkflowUsageCount ≥ 3         (USAGE_OBSERVATION, 0.85)
hasProductComponents = true when: componentRecipeCount ≥ 3               (USAGE_OBSERVATION, 0.95)
hasRegularWaste = true     when: wasteRecordCount ≥ 2                    (USAGE_OBSERVATION, 0.80)
inventoryCriticality=strict when: inventoryAdjustments/30days > 4        (USAGE_OBSERVATION, 0.85)
dailyVolume = 'high'       when: transactionsLast30Days / 30 > 100       (USAGE_OBSERVATION, 0.90)
```

## Recalculation Strategy

Recalculations are batched, not run on every event.

| Trigger | Priority | Timing |
|---|---|---|
| Branch created, config changed, subscription upgraded | Immediate | Within seconds |
| Product created, supplier added, transaction volume change | Deferred | 5-minute batch |
| Scheduled decay sweep | Background | Weekly |
| On-demand | API call | When Recommendation Engine needs fresh data |

The scheduler deduplicates by `businessId` — no matter how many events fire for the
same business, at most one pending job exists at a time.


---

# Part 7 — Capability Registry

Every capability is self-describing. It declares the business characteristics it
requires, the boosters that raise its confidence, and the config outputs it produces
when enabled. The Capability Resolver evaluates the full registry dynamically —
no scoring matrix lives anywhere else.

**Adding a new capability = adding one entry to this registry. Nothing else changes.**

## Capability Definition Type

```ts
export type CapabilityDefinition = {
  id: string               // Matches CapabilityKey or ConfigKey
  label: string            // Human-readable, developer tooling only
  description: string      // Plain-language business benefit
  category: CapabilityCategory

  // Evaluation
  required:  (c: BusinessCharacteristics) => boolean   // Gate: must be true to proceed
  boosters:  Array<{
    label:  string
    signal: (c: BusinessCharacteristics) => number     // 0.0–1.0
  }>
  threshold: number        // Minimum average booster confidence to auto-enable

  // Outputs when enabled
  outputs: (c: BusinessCharacteristics) => CapabilityOutput[]

  // Lifecycle
  deferrable:         boolean
  activationSignals?: ActivationSignal[]    // What usage events trigger a deferred offer

  // Metadata (used by Recommendation Engine)
  estimatedSetupMinutes: number
  learningCurve:         'minimal' | 'easy' | 'moderate' | 'involved'
  businessValue:         string        // "What you'll gain" shown in recommendations
  hardDependencies:      string[]      // Must be ENABLED before this can be enabled
  softDependencies:      string[]      // Enhance this capability
  conflicts:             string[]      // Cannot coexist with these
  minimumPlan:           'any' | 'Starter' | 'Professional' | 'Enterprise'
  recommendationCriteria:(c: BusinessCharacteristics) => number   // 0.0–1.0

  // Lifecycle signals
  configuredSignals: (summary: BusinessUsageSummary) => boolean   // Is it being used?
  optimizedSignals:  (summary: BusinessUsageSummary) => boolean   // Is it fully utilized?

  // AI extension point
  aiHints?: { signals: string[]; outcome: string }
}
```

## Capability Resolver Logic

```
For each CapabilityDefinition in the registry:

1. Check required(characteristics)
   → false: status = NOT_APPLICABLE, stop

2. Compute confidence = average of all booster signals

3. If no boosters defined: confidence = 1.0 (binary — required gate is sufficient)

4. If confidence ≥ threshold: status = ENABLED, apply outputs

5. If confidence < threshold AND deferrable: status = DEFERRED
   → queued for Progressive Activation

6. If confidence < threshold AND NOT deferrable: status = NOT_APPLICABLE
```

## Selected Capability Definitions

### Always-On (every business)
`COMPLETE_CHECKOUT`, `RECORD_PAYMENT`, `ISSUE_REFUND`, `MANAGE_PRODUCTS`,
`VIEW_SALES_REPORTS`, `VIEW_TRANSACTION_HISTORY`, `EXPORT_DATA`, `MANAGE_SETTINGS`,
`MANAGE_EMPLOYEES`, `MANAGE_BILLING`, `REACTIVATE_SUBSCRIPTION`

All have `required: () => true`, no boosters, threshold 0. Always enabled.

### Conditional Examples

**Order Queue (`ENABLE_ORDER`)**
```
required:  c => c.paymentTiming !== 'immediate'
boosters:  deferred payment (+1.0), table management (+0.8), food (+0.7), customization (+0.5)
threshold: 0.5
outputs:   ENABLE_ORDER=true, ENABLE_ORDER_TAB=(if customization or table)
deferrable: true
activationSignal: first_food_product_added → "Enable an order queue for your food items?"
```

**Inventory Management (`MANAGE_INVENTORY`)**
```
required:  c => c.tracksInventory
boosters:  physical goods (+0.8), raw materials (+1.0), strict criticality (+1.0), suppliers (+0.5)
threshold: 0.4
outputs:   MANAGE_INVENTORY=true, VIEW_INVENTORY_REPORTS=true,
           LOW_STOCK_THRESHOLD=(10 if strict, 20 otherwise)
deferrable: true
activationSignal: catalogue_size_exceeds(20) → "You have 20+ products. Track stock levels?"
```

**Purchase Orders (`CREATE_PURCHASE`)**
```
required:  c => c.usesSuppliers
boosters:  goods receipt (+0.9), approvals (+0.7), strict inventory (+0.6), raw materials (+0.8)
threshold: 0.4
outputs:   CREATE_PURCHASE=true, MANAGE_SUPPLIERS=true
deferrable: true
activationSignal: first_supplier_added → "You've added a supplier. Track purchase orders?"
```

**Cash Reconciliation (`ENABLE_CASH_RECONCILIATION`)**
```
required:  c => c.handlesCash
boosters:  explicitly reconciles (+1.0), role separation (+0.6), medium/large team (+0.5), high volume (+0.4)
threshold: 0.5
outputs:   ENABLE_CASH_RECONCILIATION=true
deferrable: true
activationSignal: first_employee_invited → "Enable shift cash reconciliation?"
              AND cash_payment_count > 50 → "You've processed 50 cash transactions. Reconcile?"
```

**Multi-Branch (`MANAGE_BRANCHES`)**
```
required:  c => c.locationCount === 'multiple' || c.plansExpansion
boosters:  already multi-location (+1.0), expansion planned (+0.7), large team (+0.4)
threshold: 0.4
outputs:   MANAGE_BRANCHES=true
deferrable: true
activationSignal: second_branch_added → "Enable Branch Management?"
```

### Future Capabilities (registered, not built)

These have `required: () => false`. When the feature ships, only the `required`
predicate changes. The survey does not change.

| Capability ID | Activation when built |
|---|---|
| `LOYALTY_POINTS` | `required: c => c.tracksCustomers \|\| c.hasLoyaltyIntent` |
| `KITCHEN_DISPLAY` | `required: c => c.sellsPreparedFood && c.hasOrderCustomization` |
| `DELIVERY_MANAGEMENT` | `required: c => c.offersDelivery` |
| `RESERVATIONS` | `required: c => c.requiresTableManagement \|\| c.sellsServices` |
| `WORKFORCE_SCHEDULING` | `required: c => c.teamSize === 'medium' \|\| c.teamSize === 'large'` |
| `AI_INVENTORY_FORECASTING` | `required: c => c.inventoryCriticality === 'strict'` |


---

# Part 8 — Capability Lifecycle

Capabilities move through eight states. The state machine governs when a capability
is visible, functional, and how it progresses toward full utilization.

```
HIDDEN ──▶ RECOMMENDED ──▶ PREVIEW ──▶ ENABLED ──▶ CONFIGURED ──▶ OPTIMIZED
                │                                        │
                ▼                                        ▼
              HIDDEN                                   PAUSED ──▶ DEPRECATED
```

| State | Visible to User? | Functional? | Meaning |
|---|---|---|---|
| HIDDEN | No | No | Not applicable or not yet signalled |
| RECOMMENDED | Yes (subtle) | No | Business signals suggest it could help |
| PREVIEW | Yes (prominent) | No | User expressed interest; setup offered |
| ENABLED | Yes | Yes | Active but not deeply configured |
| CONFIGURED | Yes | Yes | Being actively used with real data |
| OPTIMIZED | Yes | Yes | All sub-features active; settings tailored |
| PAUSED | Yes (indicator) | No | User temporarily disabled; data preserved |
| DEPRECATED | No | No | Feature removed; business migrated away |

**Valid transitions:**
```
HIDDEN      → RECOMMENDED
RECOMMENDED → PREVIEW, HIDDEN (dismissed permanently)
PREVIEW     → ENABLED, RECOMMENDED (user wants to think)
ENABLED     → CONFIGURED, PAUSED
CONFIGURED  → OPTIMIZED, PAUSED
OPTIMIZED   → PAUSED
PAUSED      → ENABLED, DEPRECATED
```

Each capability's state per business is persisted in `BusinessCapabilityState`.
The `configuredSignals` and `optimizedSignals` functions on the capability definition
determine when the state should advance from ENABLED → CONFIGURED → OPTIMIZED.
These transitions are suggested (shown as a "You're getting the most from this"
indicator), not forced.

---

# Part 9 — Configuration Engine

Consumes resolved capabilities and the operational profile to produce the
`BusinessConfiguration` object that `complete-registration.ts` persists.

**Outputs:**
- `systemConfigs` — the full set of `ConfigKey` values to write to `SystemConfig` table
- `enabledCapabilities` — `CapabilityKey` values to grant on the Trial plan
- `deferredCapabilities` — capability IDs queued for Progressive Activation
- `operationalProfile` — the classified profile label
- `suggestedPlan` — Starter / Professional / Enterprise
- `roles` — which roles to present in the first invite flow
- `taskTypesEnabled` — which task types appear in the task creation UI
- `notificationsEnabled` — which notification types are activated
- `dashboardWidgets` — ordered widget IDs for the initial dashboard
- `postSetupSteps` — the guided next-steps shown after registration

**Config resolution logic:**
1. Start from universal safe defaults (all features off, EXCLUSIVE pricing, PHP locale)
2. Apply all `outputs` from enabled capabilities (overrides defaults)
3. Apply profile-level overrides (e.g. FOOD_AND_BEVERAGE forces INCLUSIVE pricing when VAT signal is ambiguous)
4. Apply regional overrides (locale, currency, VAT rate)

**Plan suggestion logic:**
```
Enterprise  → multi-branch OR large team OR needs integrations
Professional → (tracks inventory AND uses suppliers) OR F&B profile OR wholesale profile
               OR (medium team AND requires approvals)
Starter     → everything else
```

---

# Part 10 — Growth Detection Engine

Watches for meaningful scale changes and emits `GROWTH_THRESHOLD_CROSSED` events
that trigger fresh recommendations. Growth detection is about pattern recognition,
not just counting — a business that doubled volume in one week gets higher urgency
than one that doubled over six months.

## Growth Thresholds

| ID | Signal | Urgency | Cooldown |
|---|---|---|---|
| `team-grew-to-small` | employeeCount ≥ 2 | suggested | 60 days |
| `team-grew-to-medium` | employeeCount ≥ 6 | recommended | 90 days |
| `product-catalogue-large` | productCount ≥ 100 | suggested | 90 days |
| `product-catalogue-very-large` | productCount ≥ 500 | recommended | 180 days |
| `high-transaction-volume` | avg daily TXs > 100 | recommended | 30 days |
| `rapid-growth` | volume doubled vs. prior 30 days | important | 30 days |
| `suppliers-multiple` | supplierCount ≥ 3 | suggested | 60 days |
| `customer-base-growing` | customerCount ≥ 25 | suggested | 90 days |
| `multi-branch` | branchCount ≥ 2 | important | 365 days |
| `first-anniversary` | business age ≥ 365 days | informational | 365 days |

Each threshold has a cooldown — the same threshold never fires again until the
cooldown passes. This prevents noise from businesses that hover near a boundary.

---

# Part 11 — Recommendation Engine

Generates a prioritized, explained list of recommendations for deferred and hidden
capabilities. Maximum 5 active recommendations at a time.

## Recommendation Record

Each recommendation carries:
- `reason` — "What we noticed" (e.g. "You've added 3 suppliers")
- `businessBenefit` — "What you'll gain" (from capability metadata)
- `estimatedSetupMinutes` — effort signal
- `signals` — up to 4 specific observations that triggered this
- `urgency` — informational / suggested / recommended / important
- `displayZone` — where to show it (dashboard card / contextual / sidebar / settings)
- `blockedBy` — prerequisites not yet met, with a plain-English message
- `canDismiss`, `canDelay`, `canIgnorePermanently` — user control flags

## Scoring

Each recommendation gets a composite score (0.0–1.0) from four factors:

```
capabilityRelevance × 0.40   (how strongly the required conditions are met)
growthAlignment     × 0.30   (does a growth threshold relate to this capability?)
businessValueRating × 0.20   (category-based importance: Sales=1.0, Inventory=0.9, etc.)
setupFriction       × 0.10   (inverse of setup effort: 5 min=1.0, 120 min=0.1)
```

Score thresholds for display zone:
- `> 0.7` → Dashboard card (most prominent)
- `> 0.5` → Contextual (on the relevant page)
- `> 0.3` → Sidebar hint
- `≤ 0.3` → Settings section (discoverable but not pushed)


---

# Part 12 — Business Health Model

Measures how fully the platform is being used relative to what is available
for the business's operational profile. Used only to guide recommendations
and provide a "next best step." Never blocks functionality. Never shown as
a grade or score.

## Health Stages

| Stage | Meaning | Next Step Hint |
|---|---|---|
| GETTING_STARTED | Recent registration, few capabilities active | Add your first product; process your first sale |
| GROWING | Active usage, core capabilities enabled | Review the recommendations on your dashboard |
| OPERATIONAL | All profile-recommended capabilities enabled | You're fully set up. Look at what could be optimized |
| MANAGED | Approval workflows, tasks, and reconciliation active | Enable analytics to see performance trends |
| OPTIMIZED | 5+ capabilities in CONFIGURED or OPTIMIZED state | Review analytics to find further improvements |
| ENTERPRISE_READY | Multi-branch, large team, analytics, API access | Connect external systems via the API |

Classification works by evaluating criteria from most specific stage to least, taking
the first stage whose criteria are fully satisfied. `GETTING_STARTED` is always the
floor — every business qualifies for it.

---

# Part 13 — User Override and Control Engine

Every automated decision is revocable. The user always has the final word.

## User Actions on Recommendations

| Action | Effect |
|---|---|
| Accept | Enables the capability; applies outputs; updates lifecycle state |
| Dismiss | Hides for 30 days; shows again after cooldown |
| Delay | "Remind me in 30 days"; sets a future reminder |
| Ignore permanently | Never shown again for this capability |

## Manual Capability Control

Users can manually enable or pause any capability from **Settings → Capabilities**.
Manually enabling a capability applies the same outputs as an automated acceptance.
Manually pausing moves the capability to the PAUSED lifecycle state; data is preserved.

## Characteristic Override

From **Settings → Business Profile**, users see every characteristic in plain language
with its source ("Based on your survey", "Based on your activity", "Set by you").

If the system inferred something wrong, the user can correct it directly. A corrected
characteristic gets `ADMIN_DECISION` source at maximum priority — it overrides all
automated observations until the user changes it again.

```
┌──────────────────────────────────────────────────────────────┐
│  Business Profile                                            │
│                                                              │
│  Tracks inventory   ■ Yes  ○ No   [Based on your activity]  │
│  Uses suppliers     ■ Yes  ○ No   [Based on your activity]  │
│  Team size          Small (2–5)▼  [Based on your activity]  │
│  Payment timing     Immediate ▼   [From your survey]        │
│  VAT registered     ■ Yes  ○ No   [From settings you set]   │
│                                                              │
│  Editing a value will update your recommendations.          │
│  The system will continue to observe your actual usage.     │
└──────────────────────────────────────────────────────────────┘
```

---

# Part 14 — Progressive Activation Engine

Delivers activation offers at the moment a usage signal fires. Operates on the list
of `deferredCapabilities` from each business's `BusinessCapabilityState`.

## Activation Signals

Each capability's registry definition declares what events trigger an offer:

```
SUPPLIER_ADDED                  → Offer purchase orders
EMPLOYEE_INVITED                → Offer cash reconciliation, task management
CUSTOMER_REGISTERED             → Offer customer profiles
BRANCH_CREATED                  → Offer branch management
FIRST_FOOD_PRODUCT_ADDED        → Offer order queue
CATALOGUE_SIZE_EXCEEDS(20)      → Offer inventory tracking
CASH_PAYMENT_COUNT_EXCEEDS(50)  → Offer receipt printing, cash reconciliation
GROWTH_THRESHOLD_CROSSED        → Re-evaluate all deferred capabilities
```

## Rate Limiting

To prevent offer fatigue:
- Maximum 1 new offer shown per session per day
- Dismissed offers have a 30-day cooldown
- Permanently ignored offers are never shown again
- A business that dismisses 3+ offers in a row enters quiet mode (no offers for 30 days)

## Acceptance Flow

```
User accepts offer
    → Server re-evaluates capability against current characteristics
    → If still ENABLED: applies outputs via dbTransaction
    → Removes capability from deferredCapabilities
    → Writes ENABLED state to BusinessCapabilityState
    → Session refresh so UI picks up new capabilities
    → Tutorial hint shown for the new module
```

---

# Part 15 — AI Extension Points

No AI is built. Every extension point is a typed interface a future model can
implement without touching surrounding code.

```ts
interface AIAdapterInterface {
  // Infer characteristics the rule-based engine can't directly observe
  inferCharacteristics?(input): Promise<Partial<LivingCharacteristics>>

  // Re-rank a list of recommendations based on business-specific predictions
  reRankRecommendations?(recommendations, context): Promise<Recommendation[]>

  // Detect anomalies in business activity (unusual refunds, volume drops, etc.)
  detectAnomalies?(summary, history): Promise<AnomalySignal[]>

  // Generate natural-language explanation for a recommendation
  explainRecommendation?(recommendation, characteristics): Promise<string>
}
```

The adapter is a global singleton, `null` by default. When null, the engine behaves
exactly as the rule-based system. No conditional branches anywhere in the codebase.

The system accumulates labeled training data from day one:
- `BusinessEventLog` — labeled behavioral events
- `BusinessCapabilityState.stateHistory` — ground truth for accepted recommendations
- `UserOverride` records — negative signals (dismissed recommendations)
- `BusinessUsageSummary` snapshots — aggregated behavioral features

When an ML team is ready, the data is already structured. No retroactive collection needed.


---

# Part 16 — Operational Profiles

Profiles are named archetypes that emerge from characteristics. The user never
selects a profile. The `ProfileClassifier` assigns one after every recalculation.
Profiles drive opinionated defaults and recommendation prioritization.

| Profile | Key Signals | Suppressed Capabilities | Suggested Plan |
|---|---|---|---|
| `LITE_POS` | Solo, immediate payment, no inventory, no suppliers | Inventory, purchasing, tasks, CRM | Starter |
| `SIMPLE_RETAILER` | Physical goods, immediate payment, solo/small team | Order queue | Starter |
| `FOOD_AND_BEVERAGE` | Prepared food, deferred payment | — | Professional |
| `SERVICE_BUSINESS` | Services only, no physical goods, no inventory | Inventory, purchasing, stock tasks | Starter |
| `WHOLESALE_DISTRIBUTION` | Raw materials, formal suppliers, strict inventory | Order queue | Professional |
| `QUICK_SERVICE` | High volume, immediate payment, small/medium team | — | Professional |
| `INVENTORY_INTENSIVE` | Physical goods, strict inventory, formal suppliers | — | Professional |
| `MULTI_BRANCH_ENTERPRISE` | Multiple locations OR expansion, medium/large team | — | Enterprise |
| `GENERAL` | Mixed or unclear signals — no dominant pattern | — | Starter |

**Classification priority order** (first match wins):
```
MULTI_BRANCH_ENTERPRISE → FOOD_AND_BEVERAGE → WHOLESALE_DISTRIBUTION →
SERVICE_BUSINESS → INVENTORY_INTENSIVE → QUICK_SERVICE → SIMPLE_RETAILER → LITE_POS → GENERAL
```

**Profile graduation** — when a business crosses into a new profile:
- New profile's additional defaults are applied incrementally
- New capabilities are offered via the Recommendation Engine (never silently enabled)
- Explicitly paused capabilities are not re-enabled
- `currentProfile` on the `Business` record is updated
- `onboardingProfile` retains the original for analytics comparison

---

# Part 17 — Lite POS — First-Class Minimal Profile

Lite POS is not a restricted mode. It is the correct configuration for a business
that genuinely only needs a fast register. It is the default starting state from
which every business naturally grows.

## What Lite POS Enables

| Capability | State |
|---|---|
| POS Checkout, Payments, Refunds | ENABLED |
| Product Catalogue, Settings | ENABLED |
| Sales Reports, Transaction History | ENABLED |
| Manage Employees, Billing | ENABLED |
| Receipt Printing | DEFERRED — offered after 10 cash transactions |
| Inventory Tracking | DEFERRED — offered after 20 products added |
| Purchase Orders | DEFERRED — offered on first supplier added |
| Cash Reconciliation | DEFERRED — offered on first employee invite |
| Task Management | DEFERRED — offered on first employee invite |
| Everything else | HIDDEN |

## Dashboard (Lite POS)

```
┌────────────────────────────┐
│  [Go to POS]               │
│  [View today's sales]      │
└────────────────────────────┘
```

Just two widgets. All other modules are accessible from the sidebar but not pushed
onto the dashboard. The experience is a dedicated cash register, not a management suite.

## The Evolution Ladder

```
LITE POS (Day 1)
├── First employee invited
│     → Offer: Cash Reconciliation, Task Management
├── 20 products added
│     → Offer: Inventory Tracking
├── First supplier added
│     → Offer: Purchase Orders
├── Transaction volume > 100/day
│     → Offer: Analytics, Role Separation
├── Second branch added
│     → Branch Management auto-activates
│     → Profile: MULTI_BRANCH_ENTERPRISE
└── VAT registration confirmed
      → Receipt compliance activates automatically
```

A Lite POS business never hits a wall. Capabilities appear exactly when they become
relevant. No migration. No plan change required unless the capability is plan-gated.


---

# Part 18 — Business Evolution Scenarios

These scenarios show how the engine adapts to five different businesses over time.
They serve as validation that the architecture handles real-world diversity correctly.

## Sari-Sari Store (Solo Micro-Retailer)

```
DAY 1 — Registration
  Survey: 6 questions (physical goods, solo, immediate payment, no VAT)
  Profile: LITE_POS | Health: GETTING_STARTED
  Enabled: POS, Products, Sales Reports, Transaction History

WEEK 2 — 30 products added
  Growth: catalogue-size-large threshold (productCount > 20)
  Offer: "You have 30 products. Want to track stock levels?" → Dismissed

MONTH 2 — First employee hired
  Event: EMPLOYEE_INVITED
  Offer 1: "Enable shift cash reconciliation" → Accepted
  Offer 2: "Assign tasks to your helper" → Delayed
  Profile: LITE_POS → SIMPLE_RETAILER (teamSize now 'small')

MONTH 3 — First supplier added
  Event: SUPPLIER_ADDED
  Intelligence: usesSuppliers=true (BUSINESS_EVENT, 0.95) overrides survey answer
  Offer: "Track what you order from suppliers?" → Accepted

MONTH 5 — 15 purchase orders created
  Intelligence: tracksInventory=true (USAGE_OBSERVATION, 0.90)
  Offer: "Enable inventory tracking to know when you're running low" → Accepted
  Profile: SIMPLE_RETAILER → INVENTORY_INTENSIVE

MONTH 8 — Stable state
  Health: MANAGED
  Intelligence source: 70% USAGE_OBSERVATION, 20% BUSINESS_EVENT, 10% SURVEY_ANSWER
  Only original survey answers still governing: locale, currency
```

## Café (Food and Beverage)

```
DAY 1 — Registration
  Survey: 13 questions (food + small team + order-first + VAT)
  Profile: FOOD_AND_BEVERAGE | Health: GETTING_STARTED
  Enabled: POS, Orders (with tab), Receipts, Cash Reconciliation, Tasks, Inventory, VAT

MONTH 2 — 10 customers recorded
  Intelligence: tracksCustomers=true (0.85)
  Offer: "Enable Customer Profiles to track their visits" → Accepted

MONTH 6 — 80 transactions/day
  Growth: high-transaction-volume threshold
  Offer: "Analytics can show which menu items drive revenue" → Accepted (Professional plan)
  Health: GETTING_STARTED → GROWING

YEAR 1 — Stable
  Health: OPERATIONAL
  Intelligence source: 65% USAGE_OBSERVATION, 25% BUSINESS_EVENT, 10% SURVEY_ANSWER
  Pending (feature not built): Reservations, Kitchen Display
```

## Beauty Salon (Service Business)

```
DAY 1 — Registration
  Survey: 7 questions (services, solo, order-first, not VAT)
  Profile: SERVICE_BUSINESS | Health: GETTING_STARTED
  Enabled: POS, Order Queue, Customer Profiles, Sales Reports
  Suppressed: Inventory, Purchasing, Stock tasks

MONTH 3 — Starts selling retail products (hair care)
  Event: PRODUCT_CREATED ×12
  Intelligence: sellsPhysicalGoods=true inferred (below threshold — only 12 products)
  No offer yet

MONTH 4 — Hires assistant
  Event: EMPLOYEE_INVITED
  Offer: "Enable task assignments" → Accepted
  Profile still: SERVICE_BUSINESS

MONTH 6 — productCount = 35
  Growth: product-catalogue-large threshold
  Intelligence: tracksInventory=true (USAGE_OBSERVATION, 0.9)
  Offer: "Enable stock tracking for your retail products" → Accepted
  Profile: SERVICE_BUSINESS → GENERAL (now sells both services AND physical goods)

NOTE: Profile changed because behavior changed, not because business type was re-selected.
```

## Pharmacy (Regulated Retail)

```
DAY 1 — Registration
  Survey: 16 questions (physical goods + expiry + suppliers + VAT + large team + approvals)
  Profile: INVENTORY_INTENSIVE | Health: GETTING_STARTED
  Enabled: Full stack — all operational capabilities, VAT (EXCLUSIVE), receipts

DAY 3 — BIR compliance data entered
  Event: CONFIG_CHANGED (BIR_TIN set)
  Capability: PRINT_RECEIPT advances ENABLED → CONFIGURED

MONTH 1 — Expiry products added
  Intelligence: hasPerishables=true (0.95)
  Offer: "Enable expiry tracking and batch management" → Accepted
  Task type WASTE_DISPOSAL added to task creation

MONTH 3 — Approval workflow used 15 times
  Intelligence: requiresApprovals=true (0.85) — confirms original survey answer
  Health: GETTING_STARTED → OPERATIONAL
```

## Wholesaler (Multi-Branch Distribution)

```
DAY 1 — Registration
  Survey: 15 questions (raw materials + multiple planned + large team + strict inventory)
  Profile: WHOLESALE_DISTRIBUTION | Suggested plan: Professional

MONTH 6 — Second branch (route/depot) opened
  Event: BRANCH_CREATED
  Intelligence: locationCount='multiple' (BUSINESS_EVENT, 1.0) — immediate recalculation
  Growth: multi-branch threshold → urgency: important
  Branch management auto-activates (locationCount=multiple sufficient)
  Task type BRANCH_TRANSFER added
  Profile: WHOLESALE_DISTRIBUTION → MULTI_BRANCH_ENTERPRISE

YEAR 1 — Transaction volume doubles in 30 days
  Growth: rapid-growth threshold → urgency: important
  Dashboard card: "Your transaction volume has nearly doubled.
                  Your setup may benefit from additional operational controls."
  Offers: Analytics (0.73), API Access (0.65)
  Health: MANAGED → OPTIMIZED after Analytics accepted
```


---

# Part 19 — Schema Changes

All changes are additive. No existing column is renamed or dropped.

## New Tables

```prisma
// Tracks the lifecycle state of each capability per business
model BusinessCapabilityState {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  capabilityId String

  state        String   // CapabilityLifecycleState
  confidence   Float
  enteredAt    DateTime @default(now())
  enteredBy    String?  // userId or 'system'

  recommendationReason String?
  recommendationScore  Float?

  dismissedAt        DateTime?
  dismissalCount     Int       @default(0)
  permanentlyIgnored Boolean   @default(false)

  previousState String?
  stateHistory  Json?    // Array of { state, changedAt, changedBy, reason }

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([businessId, capabilityId])
  @@index([businessId, state])
  @@map("business_capability_states")
}

// Persists all significant business events for observation and replay
model BusinessEventLog {
  id         String   @id @default(cuid())
  type       String   // BusinessEventType
  businessId String
  branchId   String?
  actorId    String?
  occurredAt DateTime @default(now())
  payload    Json

  @@index([businessId, occurredAt])
  @@index([type, businessId])
  @@map("business_event_log")
}
```

## New Columns on Business

```prisma
model Business {
  // ... all existing fields unchanged ...

  // Living characteristics
  livingCharacteristics      Json?
  characteristicsVersion     Int       @default(0)
  characteristicsComputedAt  DateTime?

  // Profile and health
  currentProfile             String?   // live OperationalProfile (updated on recalculation)
  healthStage                String?   // BusinessHealthStage
  lastCharacteristicsEvent   DateTime?

  // Onboarding (Iteration 2 fields — retained)
  onboardingSurveyAnswers    Json?
  onboardingProfile          String?   // original profile at registration
  deferredCapabilities       String[]  @default([])
  onboardingVariantId        String?
  onboardingCompletedAt      DateTime?

  // Relations (new)
  capabilityStates  BusinessCapabilityState[]
  eventLog          BusinessEventLog[]
}
```

Note: `businessType BusinessType` is deprecated but not removed yet. It is used
by existing registrations. Removed in a follow-up migration after the new onboarding
is confirmed stable for 30 days.

---

# Part 20 — Implementation Phasing

Each phase is independently deployable. No phase requires a coordinated release.

| Phase | What Ships | Risk |
|---|---|---|
| **1** | Survey UI (adaptive question tree, replaces business-type form) | Low — new UI behind feature flag |
| **2** | `BusinessCharacteristicEngine`, `CapabilityRegistry`, `CapabilityResolver`, `ConfigurationEngine`, `ProfileClassifier` as pure functions with Pattern A tests | Zero — no production changes |
| **3** | Connect Phase 2 engines to `complete-registration.ts`; shadow-run both old and new in parallel for 30 days; compare diffs | Medium — shadow-run before cutover |
| **4** | Cut over `complete-registration.ts` to new engine; remove `BUSINESS_TYPE_CONFIGS` fallback | Low — confirmed by shadow data |
| **5** | `BusinessEventLog` table + event emission points in server functions | Low — additive logging only |
| **6** | `BusinessIntelligenceEngine` + `OBSERVATION_RULES` + `RecalculationScheduler` | Low — pure functions + background job |
| **7** | `BusinessCapabilityState` table + Capability Lifecycle state machine | Low — new table, no breaking changes |
| **8** | `GrowthDetectionEngine` + `GROWTH_THRESHOLDS` + background job | Low — pure functions + batch job |
| **9** | `RecommendationEngine` + scoring + display zones | Medium — first user-facing change |
| **10** | Intelligence Engine backfill (write `livingCharacteristics` for existing businesses) | Medium — bulk writes, schedule off-peak |
| **11** | `UserOverride` engine + Settings → Capabilities UI + Settings → Business Profile editor | Medium — UI work |
| **12** | `BusinessHealthModel` + dashboard "next step" hint | Low — additive UI |
| **13** | Weekly decay job + recalculation scheduler production tuning | Low — background job |
| **14** | AI adapter interface + null implementation | Low — no-op by design |
| **15** | Remove `deferredCapabilities` legacy field; remove deprecated `businessType` | Low — cleanup |

---

# Part 21 — Migration from the Current System

## What Exists Today

The current `complete-registration.ts` accepts `{ businessName, displayName, businessType }`
and looks up `BUSINESS_TYPE_CONFIGS[businessType]` to produce a fixed config set.
Three business types exist: `RESTAURANT`, `GROCERY`, `RETAIL`.

## What Changes

| Component | Before | After |
|---|---|---|
| Registration input | `{ businessType: 'RESTAURANT' \| 'GROCERY' \| 'RETAIL' }` | `{ surveyAnswers: SurveyAnswers }` |
| Config derivation | `BUSINESS_TYPE_CONFIGS[type]` lookup | `ConfigurationEngine.build(...)` |
| Business model | `businessType` column | `currentProfile` + `onboardingProfile` + `livingCharacteristics` |

## Existing Businesses

All existing businesses retain their configuration untouched. No retroactive changes.
The migration applies new nullable columns with safe defaults. Old businesses get:
- `onboardingProfile = null` (signals "pre-new-system")
- `livingCharacteristics = null` (populated by Phase 10 backfill job)
- `deferredCapabilities = []`
- `BusinessCapabilityState` rows created from their current active config (Phase 10)

## Shadow Running (Phase 3)

Before cutting over, run both engines in parallel for 30 days:
```ts
// In complete-registration.ts, during Phase 3
const v1Config = BUSINESS_TYPE_CONFIGS[data.businessType]
const v2Config = ConfigurationEngine.build(chars, resolved, profile)
logConfigComparison(v1Config, v2Config, data.businessType)  // analytics only
await applyConfig(v1Config, prisma)                          // apply v1 (safe)
```

This produces a diff dataset across real registrations, allowing threshold tuning
before the switch happens.

---

# Part 22 — Risks and Trade-offs

## Key Risks

**Threshold calibration** — Booster confidence thresholds are hypotheses until real
data validates them. Mitigation: shadow-running (Phase 3) and admin analytics tooling
that shows confidence scores. Accept that some businesses start with slightly wrong
configs; Progressive Activation corrects misses quickly.

**Event log growth** — `BusinessEventLog` accumulates over time. Mitigation: only
structurally significant events are logged (not every transaction); 90-day retention
for raw events; aggregates kept indefinitely. Requires retention job from Phase 5.

**Recommendation fatigue** — Too many offers too fast. Mitigation: hard 5-recommendation
cap; 30-day dismiss cooldown; quiet mode after 3 dismissals in a row.

**Surprise profile graduation** — A profile change could trigger unexpected recommendations.
Mitigation: profile graduation only triggers recommendations, never config writes.
Existing settings are never overwritten by a profile change.

**Pure functions vs. async reality** — Pure engines need DTOs; assembling those DTOs
requires DB reads. Mitigation: the Application Layer (server functions / jobs) owns all
DB reads; engines remain pure and testable with Pattern A tests.

## Core Trade-offs

| Decision | Gain | Cost |
|---|---|---|
| `BusinessCharacteristics` as stable interface | Survey and capabilities evolve independently | One extra translation layer; bugs in the Characteristic Engine affect all downstream |
| Confidence-based resolver | Handles ambiguous businesses gracefully | Requires calibration data; less predictable than hard rules |
| Deferred capabilities + Progressive Activation | Short onboarding; most users see 8 questions | Requires activation delivery to work reliably — if it doesn't, businesses stay at Lite POS |
| JSON column for `livingCharacteristics` | Schema flexibility without migrations | No DB constraints; must validate at app layer with Zod |
| Profile graduation as recommendations-only | User always in control | Some businesses may benefit from auto-enabling without knowing about it |

## Non-Negotiable Design Constraints

These constraints must be upheld in every code review and every future change:

1. The survey never references capability names or config keys.
2. All capabilities are self-describing — no if/else capability logic outside the registry.
3. All engines are pure functions — DTOs in, values out, no IO.
4. User intent always wins — explicit configuration overrides any inferred characteristic.
5. Profile graduation never automatically applies configs or enables capabilities.
6. `BusinessCharacteristics` is the stable API boundary — rename nothing casually.
7. Extensibility requires only registration — new capability = one registry entry.

---

# Part 23 — File Map

## New Source Files

```
src/lib/onboarding/
├── types.ts                           — All shared types for the engine
├── business-characteristic-engine.ts  — Pure: SurveyAnswers → BusinessCharacteristics
├── capability-registry.ts             — CAPABILITY_REGISTRY (all definitions)
├── capability-resolver.ts             — Pure: characteristics + registry → ResolvedCapability[]
├── profile-classifier.ts              — Pure: characteristics + resolved → OperationalProfile
├── configuration-engine.ts            — Pure: resolved + profile → BusinessConfiguration
└── defaults.ts                        — DEFAULT_CHARACTERISTICS, REGIONAL_OVERRIDES

src/lib/evolution/
├── types.ts                           — LivingCharacteristics, BusinessEvent, Recommendation…
├── business-event-bus.ts              — In-process pub/sub router
├── business-intelligence-engine.ts    — Merge all sources → LivingCharacteristics
├── observation-rules.ts               — OBSERVATION_RULES registry
├── characteristic-conflict-resolver.ts — Priority + decay logic
├── growth-detection-engine.ts         — GrowthDetectionEngine + GROWTH_THRESHOLDS
├── recommendation-engine.ts           — Scoring + prioritization + explainability
├── business-health-model.ts           — HEALTH_STAGE_CRITERIA + classifier
├── user-override-engine.ts            — Override types + manual capability control
├── recalculation-scheduler.ts         — Deduplicating recalculation queue
└── ai-adapter-interface.ts            — AIAdapterInterface (null by default)
```

## Tests

All engine files are Pattern A (pure functions — no DB, no mocks needed):
```
__tests__/unit/lib/onboarding/
├── business-characteristic-engine.test.ts
├── capability-resolver.test.ts
├── profile-classifier.test.ts
└── configuration-engine.test.ts

__tests__/unit/lib/evolution/
├── business-intelligence-engine.test.ts
├── observation-rules.test.ts
├── growth-detection-engine.test.ts
├── recommendation-engine.test.ts
├── business-health-model.test.ts
└── characteristic-conflict-resolver.test.ts

__tests__/integration/evolution/
└── characteristics-recalculation.integration.test.ts  — Pattern C1
```

## Modified Files

```
prisma/schema.prisma
  — Add BusinessCapabilityState, BusinessEventLog models
  — Add new nullable columns to Business model
  — Deprecate (keep) businessType field

src/lib/queries/complete-registration.ts
  — Update input schema: remove businessType, add surveyAnswers
  — Replace BUSINESS_TYPE_CONFIGS lookup with ConfigurationEngine.build()
  — Write initial BusinessCapabilityState rows

src/lib/queries/create-supplier.ts, create-employee.ts, create-branch.ts, etc.
  — Add BusinessEventBus.emit() after each successful mutation

src/lib/entitlement/capability-keys.ts
  — Add future capability keys as they are built
```

---

*End of Document*

**Single source of truth for:** onboarding survey design, capability architecture,
business intelligence engine, growth detection, recommendations, and all related
schema and implementation concerns.

**Implementation starting point:** Phase 1 (survey UI) and Phase 2 (pure engine functions)
can proceed in parallel. Phase 5 (event logging) can begin as soon as any Phase 2
engine is merged — it has no dependencies on the others.
