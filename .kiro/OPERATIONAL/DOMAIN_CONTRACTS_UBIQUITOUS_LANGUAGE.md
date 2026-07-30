# Operational Domain Contracts & Ubiquitous Language
## Phase 4 — Constitutional Reference

> **Status:** Authoritative. Supersedes informal usage in all previous documents.
> **Mode:** Principal DDD Architect. No implementation. No redesign. Formalization only.
> **Inputs:** Phase 1 (Architecture Audit) · Phase 2 (Business Domain Model) · Phase 3 (Evolution Strategy)
> **Purpose:** Single source of truth for naming, boundaries, contracts, events, and invariants.
> **Date:** July 30, 2026

---

## Table of Contents

1. [Ubiquitous Language](#part-1--ubiquitous-language)
2. [Bounded Context Contracts](#part-2--bounded-context-contracts)
3. [Business Events Catalogue](#part-3--business-events-catalogue)
4. [Commands vs Events](#part-4--commands-vs-events)
5. [Ownership Matrix](#part-5--ownership-matrix)
6. [Domain Policies](#part-6--domain-policies)
7. [Business Invariants](#part-7--business-invariants)
8. [Canonical State Machines](#part-8--canonical-state-machines)
9. [Domain Interaction Rules](#part-9--domain-interaction-rules)
10. [Extension Contracts](#part-10--extension-contracts)
11. [Architectural Vocabulary](#part-11--architectural-vocabulary)
12. [Domain Contracts](#part-12--domain-contracts)
13. [Validation Checklist](#part-13--validation-checklist)
14. [Final Executive Summary](#part-14--final-executive-summary)

---

## Part 1 — Ubiquitous Language

This vocabulary is canonical. Every engineer, designer, product manager, and stakeholder uses these terms with these meanings. No synonyms are permitted for core concepts. When a new term is needed, it is added here before it is used anywhere else.

---

### Purchase Request

**Definition:** A formal internal proposal to acquire goods or services from a supplier.

**Business meaning:** Someone inside the business has identified a need and is requesting authorization to act on it. A Purchase Request does not commit funds. It is a question: "Should we buy this?"

**Responsibilities:**
- Capture what is needed, in what quantity, from which supplier, and why
- Wait for an approval decision before advancing

**Non-responsibilities:**
- Does not commit to any supplier
- Does not affect inventory
- Does not generate a financial obligation

**Owner:** Procurement domain

**Relationships:** Created before a Purchase Order. May result in a Purchase Order (approved) or be abandoned (rejected or cancelled).

**Lifecycle:** DRAFT → SUBMITTED → APPROVED / REJECTED

**Examples:** A warehouse clerk notices bottled water is low and raises a request for 5 cases from Supplier X.

---

### Purchase Order

**Definition:** A formal, authorized commitment to acquire specific goods from a specific supplier at a specific price.

**Business meaning:** The business has decided to buy. A Purchase Order is an external document that creates an obligation. "We will buy this, at this price, in this quantity, by this date."

**Responsibilities:**
- Record the agreed terms of a procurement
- Track which line items have been received against the order
- Remain open until all items are received, cancelled, or disputed

**Non-responsibilities:**
- Does not receive goods (that is Receiving)
- Does not increase inventory (that is Inventory, triggered by Receiving)
- Does not pay the supplier (that is Finance)

**Owner:** Procurement domain

**Relationships:** Created from an approved Purchase Request. Fulfilled by one or more Goods Receipts.

**Lifecycle:** CREATED → PARTIALLY_RECEIVED → RECEIVED → CLOSED / DISPUTED

**Examples:** A ₱12,000 order for 100kg of rice from Magsaysay Grains, expected next Tuesday.

---

### Goods Receipt (GRN)

**Definition:** The formal record of a specific physical delivery against a Purchase Order, including quantities accepted and rejected after inspection.

**Business meaning:** Goods have arrived. Someone physically counted them, checked their condition, and decided what to accept. The GRN is the evidence that specific goods entered the business's possession.

**Responsibilities:**
- Record what arrived, in what quantity, on what date
- Record what was accepted and what was rejected
- Authorize the Inventory domain to increase stock for accepted quantities

**Non-responsibilities:**
- Does not create the Purchase Order
- Does not pay the supplier
- Does not move goods to a storage location (that is a Task)

**Owner:** Receiving domain

**Relationships:** A GRN belongs to exactly one Purchase Order. One PO can have multiple GRNs (partial deliveries).

**Lifecycle:** PENDING → INSPECTED → ACCEPTED / PARTIALLY_ACCEPTED / REJECTED

**Examples:** 95 of 100 ordered rice bags arrived in good condition. 5 were damaged. GRN records 95 accepted, 5 rejected.

---

### Receiving

**Definition:** The complete business process of accepting a supplier delivery — from physical arrival through inspection to formal acceptance and inventory credit.

**Business meaning:** Receiving is not a single event. It is a process with distinct stages. The business does not own goods until Receiving completes.

**Stages:** Arrival → Count → Inspect → Accept or Reject → Record GRN → Authorize inventory credit

**Owner:** Receiving domain

---

### Inventory

**Definition:** The authoritative, current record of goods owned by the business, organized by product variant, location, and batch.

**Business meaning:** Inventory answers the question: "What do we have, where is it, how much does it cost, and when does it expire?" Inventory is always a balance — the result of all movements in and out.

**Responsibilities:**
- Maintain accurate stock levels per variant, per location, per batch
- Record every stock change as an immutable movement
- Detect when stock falls to or below a reorder point

**Non-responsibilities:**
- Does not decide what to buy (Procurement does)
- Does not create tasks (Task domain does)
- Does not send notifications (Notification domain does)
- Does not approve changes (Approval domain does)

**Owner:** Inventory domain

---

### Inventory Batch

**Definition:** A discrete group of units of a specific product received together from a specific source on a specific date, sharing a cost price and (when applicable) an expiry date.

**Business meaning:** A batch is the unit of inventory the business actually holds and manages. It is not an abstraction — it is a physical lot.

**Owner:** Inventory domain

**Lifecycle:** Created when a GRN is accepted → consumed as goods are sold, transferred, or written off → exhausted when quantity reaches zero

**Examples:** 50kg of flour received on July 15 at ₱85/kg, batch number FLOUR-2026-0715, expires March 2027.

---

### Inventory Mutation

**Definition:** Any change to the quantity of an inventory batch, always accompanied by a business reason and traceable to an authorizing business event.

**Business meaning:** Inventory does not change spontaneously. Every mutation is either an increase (goods received) or a decrease (sold, transferred out, wasted, adjusted). Every mutation is permanent and auditable.

**Owner:** Inventory domain (sole owner)

**Types:**
- **Receipt** — increase from accepted Goods Receipt
- **Deduction** — decrease from a completed sale
- **Transfer Out / In** — paired decrease and increase from an authorized task
- **Adjustment** — correction from an authorized and reviewed stock count
- **Write-Off** — permanent removal from an authorized waste disposal task

**Every mutation requires:**
1. A business reason
2. An authorizing source (task ID, GRN ID, transaction ID)
3. The person who performed it
4. A timestamp

---

### Inventory Movement

**Definition:** The immutable record of a single inventory mutation event.

**Business meaning:** An Inventory Movement is the audit trail entry for a mutation. It is never modified after creation. It is the permanent evidence of every change to stock levels.

**Owner:** Inventory domain

**Relationship:** An Inventory Movement belongs to exactly one Inventory Batch. It references exactly one authorizing source.

---

### Task

**Definition:** A discrete, bounded unit of physical operational work assigned to a specific person, authorized by management, with a recorded outcome.

**Business meaning:** A Task is how management communicates authorized work to staff. It answers: "What needs to happen, who should do it, what resources are involved, and when?" A Task coordinates human beings — it does not perform work itself.

**Responsibilities:**
- Capture what work needs to happen and why
- Record who is responsible at each accountability stage
- Track progress through the workflow
- Record what actually happened (the outcome)
- Authorize inventory mutations that result from the work

**Non-responsibilities:**
- Does not mutate inventory directly
- Does not send notifications
- Does not approve itself
- Does not own inventory

**Owner:** Task domain

**Lifecycle:** DRAFT → PENDING → APPROVED → IN_PROGRESS → FULFILLED → REVIEWED

---

### Assignment

**Definition:** The act of designating a specific person as responsible for executing a Task.

**Business meaning:** Assignment creates accountability. An unassigned task has no responsible party. An assigned task has exactly one person who is expected to execute it.

**Owner:** Task domain

**Examples:** "You, Maria, are responsible for restocking the water shelf today."

---

### Approval

**Definition:** The formal authorization by an authorized person that a proposed business action may proceed.

**Business meaning:** An Approval is not a formality — it is the act of an authorized person accepting accountability for what follows. Approvals prevent unauthorized spending, unauthorized inventory changes, and process errors.

**Responsibilities:**
- Record who authorized, when, and under what conditions
- Route requests to the correct approver based on type and scope
- Handle rejection with a stated reason
- Support escalation when unactioned

**Non-responsibilities:**
- Does not execute the approved action
- Does not own the record of the action

**Owner:** Approval domain

**Applies to:** Purchase Requests, inventory-bearing Tasks, stock adjustments, write-offs

---

### Notification

**Definition:** A message from the system to a specific person, informing them that a business event has occurred that may require their attention or action.

**Business meaning:** A Notification is information, not action. It tells someone something happened. What they do about it is their decision, recorded by the relevant domain.

**Responsibilities:**
- Deliver messages to the correct recipients
- Track whether the message has been read
- Escalate if urgency warrants and the message is unread

**Non-responsibilities:**
- Does not create tasks
- Does not change any business state
- Does not make decisions

**Owner:** Notification domain

---

### Business Event

**Definition:** An immutable record of something significant that has already happened in the business domain.

**Business meaning:** An event is a fact of history. It is named in the past tense. It cannot be recalled, reversed, or modified. Other domains react to events.

**Characteristics:**
- Named in past tense: `PurchaseApproved`, `TaskFulfilled`, `GoodsAccepted`
- Immutable once produced
- Carries the minimum payload needed for consumers to react
- Produced by exactly one domain

**Relationship to Notification:** An event may trigger a notification, but the event and the notification are distinct. The event is a domain fact; the notification is a delivery mechanism.

---

### Business Operation

**Definition:** A complete unit of business activity that spans multiple steps and produces a meaningful business outcome.

**Examples:** "Procure stock" is an operation. "Close a shift" is an operation. "Complete a shelf refill" is an operation. Each operation encompasses a workflow.

**Relationship to Task:** A Task is the operational record of one human-executed step within an Operation.

---

### Session (Vendor Session / Shift)

**Definition:** A bounded period of cashier operation at a point-of-sale station, opened with a declared cash float and closed with a submitted cash count.

**Business meaning:** A Session is the unit of financial accountability for a cashier. All transactions during a session are attributed to it. Session close triggers the reconciliation process.

**Owner:** Session domain

**Lifecycle:** OPEN → CLOSED

---

### Transfer

**Definition:** The authorized movement of inventory from one location to another, with no change to the business's total inventory balance.

**Types:**
- **Internal Transfer (Shelf Refill):** Same branch, from backroom to display or between storage locations
- **External Transfer (Branch Transfer):** Between branches; decreases sending branch inventory, increases receiving branch inventory

**Owner:** Task domain (authorization), Inventory domain (mutation)

---

### Adjustment

**Definition:** A correction to inventory quantity that reconciles the system record against the physically counted stock, authorized by a reviewer.

**Business meaning:** When physical stock differs from the recorded balance, an Adjustment closes the gap. Every adjustment requires a reason and authorization — it is a financially significant event.

**Owner:** Inventory domain (mutation), Approval domain (authorization)

---

### Inspection

**Definition:** The quality and quantity check performed on goods at the time of physical delivery before they are formally accepted into inventory.

**Business meaning:** Inspection is the gate between "goods arrived" and "goods accepted." Failing inspection prevents unacceptable goods from entering the business's inventory.

**Owner:** Receiving domain

---

### Reservation

**Definition:** A quantity of inventory committed to a specific purpose but not yet physically removed from stock.

**Business meaning:** Reserved inventory is unavailable for other purposes. It has been spoken for but not yet consumed. Reservation prevents double-allocation.

**Owner:** Inventory domain

---

### Report

**Definition:** A read-only aggregation of historical business data presented to support decision-making.

**Business meaning:** Reports describe what happened. They are never the source of truth for any record. They do not create, modify, or delete business data.

**Owner:** Reporting domain (read-only; no mutations permitted)

---

### Policy

**Definition:** A business rule that governs how a domain behaves in a given situation, implemented as a decision within the domain rather than a separate concept.

**Examples:**
- "A purchase above ₱10,000 requires branch manager approval." → Procurement policy
- "A task of type GENERAL_CHORE does not require approval." → Task policy
- "Stock below the reorder point triggers a notification to the branch manager." → Inventory policy

**Relationship to Invariant:** A Policy is configurable; an Invariant is not. Policies can change with business rules. Invariants are always true.

---

### Workflow

**Definition:** The ordered sequence of states and transitions that an aggregate moves through during its lifecycle.

**Examples:** The Task workflow: DRAFT → PENDING → APPROVED → IN_PROGRESS → FULFILLED → REVIEWED. Each transition requires a specific actor with a specific role.

---

### State

**Definition:** The current phase in a workflow that determines what actions are permitted on an aggregate at a given moment.

**Relationship:** A State belongs to exactly one aggregate. Multiple aggregates can share a state name (e.g., both Task and Purchase can have a PENDING state), but these are independent states in independent state machines.

---

### Business Rule

**Definition:** A constraint that must be satisfied for a business action to be valid.

**Examples:**
- "A task can only be approved by a SUPERVISOR or ADMIN."
- "An inventory mutation must reference an authorizing event."
- "A GRN cannot be created for a closed Purchase Order."

**Relationship to Policy:** A Business Rule is the specific constraint; a Policy is the broader principle that motivates it.

---

### Variance

**Definition:** The difference between an expected and an actual quantity, typically in the context of cash reconciliation or stock counts.

**Business meaning:** A variance is a discrepancy that requires explanation and authorization. It is not automatically corrected — it is recorded, reviewed, and resolved deliberately.

---

### Write-Off

**Definition:** The authorized, permanent removal of inventory from the business's books due to damage, expiry, theft, or unrecoverable loss.

**Business meaning:** A write-off is a loss event. It reduces the business's inventory balance and increases its cost of operations. It requires management authorization.

**Owner:** Task domain (authorization via waste task), Inventory domain (mutation)


---

## Part 2 — Bounded Context Contracts

Each bounded context is a distinct domain with its own model, language, and responsibilities. The contract defines the exact boundary — what each context owns, what it produces, what it consumes, and what it is forbidden from doing.

---

### Procurement Context

**Purpose:** Own the complete lifecycle of acquiring goods from external suppliers, from the initial need through to order closure.

**Public Responsibilities:**
- Accept Purchase Requests from any operational actor
- Track Purchase Order status against supplier deliveries
- Provide purchase history for financial reporting

**Private Responsibilities:**
- Evaluate whether a purchase request is reasonable (price check, supplier validation)
- Manage supplier registry
- Generate structured Purchase Order IDs

**Allowed Inputs:**
- Purchase Request from any authenticated user
- Approval decision from Approval context
- Goods Receipt confirmation from Receiving context (to close line items)

**Produced Outputs:**
- `PurchaseRequestRaised` event
- `PurchaseOrderCreated` event
- `PurchaseOrderClosed` event
- `PurchaseVoided` event
- Purchase record for reporting

**Events Emitted:** `PurchaseRequestRaised`, `PurchaseOrderCreated`, `PurchaseOrderClosed`, `PurchaseVoided`

**Events Consumed:** `PurchaseRequestApproved`, `PurchaseRequestRejected`, `GoodsAccepted`, `GoodsPartiallyAccepted`

**Dependencies:** Approval context (authorization), Receiving context (delivery confirmation), Supplier registry (Employee/Settings context)

**Forbidden Responsibilities:**
- May NOT credit inventory directly
- May NOT approve its own purchase requests
- May NOT send notifications directly (emits events; Notification context delivers)
- May NOT create tasks (a PURCHASE_REQUEST task is a different concept — it is a Task that requests a purchase; the purchase itself is owned by this context)

---

### Receiving Context

**Purpose:** Own the process of physically accepting supplier deliveries — counting, inspecting, and formally accepting or rejecting goods.

**Public Responsibilities:**
- Record the physical arrival of goods
- Produce the Goods Receipt Note for each delivery event
- Communicate acceptance decisions to Inventory and Procurement

**Private Responsibilities:**
- Guide the inspection process per product type
- Record discrepancies between PO quantities and received quantities
- Track rejected items until resolution

**Allowed Inputs:**
- Expected delivery signal from Procurement context ("PO-001 is awaiting delivery")
- Physical delivery (supplier delivery event)
- Inspection result from receiving staff

**Produced Outputs:**
- `GoodsAccepted` event (authorizes inventory credit)
- `GoodsPartiallyAccepted` event (partial acceptance)
- `GoodsRejected` event (dispute signal to Procurement)
- Goods Receipt Note record

**Events Emitted:** `GoodsAccepted`, `GoodsPartiallyAccepted`, `GoodsRejected`

**Events Consumed:** `PurchaseOrderCreated` (to know what to expect)

**Dependencies:** Procurement context (expected deliveries), Inventory context (to authorize credit)

**Forbidden Responsibilities:**
- May NOT credit inventory directly (it authorizes; Inventory acts)
- May NOT approve purchases
- May NOT create tasks

---

### Inventory Context

**Purpose:** Own the authoritative stock record — every batch, every level, every movement — and be the sole executor of all inventory mutations.

**Public Responsibilities:**
- Maintain the current stock level per variant, per location, per batch
- Execute inventory mutations when authorized by business events
- Detect stock level threshold conditions
- Provide stock data to all consumers

**Private Responsibilities:**
- Enforce FIFO/FEFO batch consumption order
- Maintain the immutable movement history
- Manage batch expiry tracking

**Allowed Inputs:**
- `GoodsAccepted` from Receiving (stock increase)
- `TaskFulfilled` from Task context (transfer, adjustment, write-off, or refill)
- `SaleCompleted` from POS/Sales context (stock decrease)
- Authorized adjustment from Approval context

**Produced Outputs:**
- `StockReceived` event
- `StockDeducted` event
- `StockTransferred` event
- `StockAdjusted` event
- `StockWrittenOff` event
- `LowStockDetected` event
- Inventory Movement records (immutable audit trail)

**Events Emitted:** `StockReceived`, `StockDeducted`, `StockTransferred`, `StockAdjusted`, `StockWrittenOff`, `LowStockDetected`

**Events Consumed:** `GoodsAccepted`, `TaskFulfilled`, `SaleCompleted`, `PurchaseVoided`

**Dependencies:** Receiving (source of stock additions), Task (source of internal movements), POS/Sales (source of depletions)

**Forbidden Responsibilities:**
- May NOT create tasks (detects the condition; Task context creates the response)
- May NOT send notifications (emits `LowStockDetected`; Notification context delivers)
- May NOT approve adjustments (emits the need; Approval context authorizes)
- May NOT be written to by any context other than through its own mutation handlers

---

### Task Context

**Purpose:** Own the full lifecycle of all operational work — from request through authorization, execution, and post-audit review.

**Public Responsibilities:**
- Accept task creation requests from any operational actor or system trigger
- Enforce the task workflow (state transitions, role and identity checks)
- Record the outcome of completed work including actual quantities
- Authorize inventory mutations via the `TaskFulfilled` event

**Private Responsibilities:**
- Manage the per-task-type metadata schema
- Enforce the three-quantity model (suggested, approved, verified)
- Maintain accountability chain (creator, approver, clerk, reviewer)

**Allowed Inputs:**
- Task creation request from any authenticated user
- `LowStockDetected` from Inventory (auto-creates SHELF_REFILL task)
- `ShiftOpened` from Session (auto-creates CASH_RECONCILIATION task)
- Status transition commands from authorized users

**Produced Outputs:**
- `TaskCreated` event
- `TaskApproved` event
- `TaskAssigned` event
- `TaskStarted` event
- `TaskFulfilled` event (carries outcome data; consumed by Inventory)
- `TaskReviewed` event
- `TaskCancelled` event

**Events Emitted:** All task lifecycle events listed above

**Events Consumed:** `LowStockDetected`, `ShiftOpened`, `PurchaseRequestApproved` (to link PURCHASE_REQUEST task to resulting PO)

**Dependencies:** Approval context (for task authorization), Inventory context (task references batches), Employee context (assignment resolution)

**Forbidden Responsibilities:**
- May NOT mutate inventory directly
- May NOT approve its own tasks
- May NOT send notifications (emits events; Notification context delivers)
- May NOT own financial records

---

### Notification Context

**Purpose:** Deliver timely, relevant messages to the right people based on business events. Nothing more.

**Public Responsibilities:**
- Subscribe to business events from all contexts
- Resolve the correct recipients based on event type and organizational rules
- Deliver in-app notifications
- Track read/unread state
- Archive stale notifications

**Private Responsibilities:**
- Manage notification priority rules
- Schedule reminder delivery for unread notifications
- Manage escalation timers for action-required notifications

**Allowed Inputs:**
- Any business event from any context (subscribed, not polled)
- Read/dismiss commands from authenticated users

**Produced Outputs:**
- Notification records (delivered to recipients)
- `NotificationRead` internal state change
- `NotificationEscalated` event (when unread past threshold)

**Events Emitted:** None that affect business state. Internal only.

**Events Consumed:** All published business events

**Dependencies:** Employee context (recipient identity and roles)

**Forbidden Responsibilities:**
- May NOT create business records
- May NOT create tasks
- May NOT change any domain state
- May NOT make approval decisions
- May NOT route itself — recipient resolution must be rule-driven, not hardcoded per notification call site

---

### Approval Context

**Purpose:** Be the single authoritative record of every authorization decision in the business.

**Public Responsibilities:**
- Accept approval requests from any domain
- Route requests to the correct approver based on type, scope, and value
- Record every decision (approved, rejected, escalated) with timestamp and identity
- Support escalation when requests are unactioned

**Private Responsibilities:**
- Enforce authorization limits by role and value threshold
- Manage escalation rules

**Allowed Inputs:**
- Approval request from Procurement (purchase), Task (task authorization), Inventory (adjustment)
- Approval decision from an authorized user
- Escalation trigger (time-based)

**Produced Outputs:**
- `ApprovalGranted` event
- `ApprovalRejected` event
- `ApprovalEscalated` event
- Approval record (permanent, immutable)

**Events Emitted:** `ApprovalGranted`, `ApprovalRejected`, `ApprovalEscalated`

**Events Consumed:** None from domain contexts — it receives requests synchronously and responds with events

**Dependencies:** Employee context (approver identity and role)

**Forbidden Responsibilities:**
- May NOT execute the approved action
- May NOT approve its own requests
- May NOT change business state beyond recording the decision

---

### Reporting Context

**Purpose:** Provide accurate, timely, read-only views of business performance.

**Public Responsibilities:**
- Aggregate data from all contexts into meaningful summaries
- Support date-range filtering, grouping, and export

**Private Responsibilities:** None — purely read

**Allowed Inputs:** Read-only access to all domain records

**Produced Outputs:** Report data only. No events.

**Events Emitted:** None

**Events Consumed:** None — reads from persistent records, not event streams

**Forbidden Responsibilities:**
- May NOT write to any domain record
- May NOT create events
- May NOT make business decisions

---

### Audit Context

**Purpose:** Preserve the immutable historical record of every significant business state change.

**Public Responsibilities:**
- Provide queryable history of all domain events
- Ensure no audit record is ever modified or deleted

**Private Responsibilities:**
- Index audit records for efficient query by actor, date, domain, and record ID

**Allowed Inputs:** Immutable state-change records from all contexts (append-only)

**Produced Outputs:** Audit trail queries for compliance and investigation

**Forbidden Responsibilities:**
- May NOT modify or delete any record
- May NOT initiate business actions

---

### Employee Context

**Purpose:** Maintain the authoritative registry of people, their roles, and their organizational assignments.

**Public Responsibilities:**
- Provide identity resolution for assignment and approval routing
- Manage active/inactive employee status
- Define what each role is permitted to do

**Forbidden Responsibilities:**
- May NOT assign tasks (Task context does that)
- May NOT approve actions (Approval context does that)
- May NOT send notifications (Notification context does that)

---

### Session Context

**Purpose:** Own the cashier shift lifecycle — opening, transaction tracking, and reconciliation initiation.

**Public Responsibilities:**
- Record shift open with opening cash float
- Aggregate transactions during the shift
- Calculate expected cash at shift close
- Record the cashier's submitted closing count
- Produce the `ShiftClosed` event

**Forbidden Responsibilities:**
- May NOT own the reconciliation task (Task context owns the task)
- May NOT approve the reconciliation (Approval context does that)
- May NOT send notifications (Notification context does that)


---

## Part 3 — Business Events Catalogue

Business events are the lingua franca between contexts. Every event is a completed business fact, named in past tense, immutable once produced, and carries the minimum payload required for all consumers to react correctly.

---

### Category: Procurement Events

---

**`PurchaseRequestRaised`**
- **Business meaning:** Someone inside the business has formally identified a procurement need and submitted it for review.
- **Producer:** Procurement context
- **Consumers:** Approval context (routes for authorization), Notification context (notifies designated approver)
- **Required payload:** `requestId`, `requestedBy`, `supplierId`, `lineItems[]` (variantId, quantity, unitId, estimatedUnitCost), `reason`, `branchId`, `businessId`, `raisedAt`
- **Business invariants:** The request must reference at least one line item. The requester cannot be the approver.
- **Side effects:** An approval request is created. The approver receives a notification.
- **Visibility:** Branch management and above.

---

**`PurchaseRequestApproved`**
- **Business meaning:** An authorized person has decided the procurement should proceed.
- **Producer:** Approval context
- **Consumers:** Procurement context (advances to Purchase Order), Notification context (notifies requester)
- **Required payload:** `requestId`, `approvedBy`, `approvedAt`, `approvedQuantities[]` (may differ from requested), `notes`
- **Business invariants:** The approver must have the authority level for this purchase scope. The approver is not the requester.
- **Side effects:** A Purchase Order is created.

---

**`PurchaseRequestRejected`**
- **Business meaning:** An authorized person has decided the procurement should not proceed as proposed.
- **Producer:** Approval context
- **Consumers:** Procurement context (marks request as rejected), Notification context (notifies requester with reason)
- **Required payload:** `requestId`, `rejectedBy`, `rejectedAt`, `reason`
- **Side effects:** Requester is notified with the rejection reason. Request may be revised and resubmitted.

---

**`PurchaseOrderCreated`**
- **Business meaning:** A binding commitment to a supplier has been created.
- **Producer:** Procurement context
- **Consumers:** Receiving context (expects a delivery), Notification context (optionally notifies purchasing staff)
- **Required payload:** `purchaseId`, `purchaseOrderNumber`, `supplierId`, `lineItems[]`, `expectedDeliveryDate`, `branchId`, `businessId`, `createdAt`
- **Business invariants:** A PO must have at least one line item. A PO must reference a valid supplier.

---

**`PurchaseOrderClosed`**
- **Business meaning:** All outstanding items on the order have been received or formally resolved.
- **Producer:** Procurement context
- **Consumers:** Reporting context
- **Required payload:** `purchaseId`, `closedAt`, `closeReason` (FULLY_RECEIVED | PARTIALLY_ACCEPTED | CANCELLED)

---

**`PurchaseVoided`**
- **Business meaning:** An existing purchase record has been reversed. Any inventory credited from this purchase must be reversed.
- **Producer:** Procurement context
- **Consumers:** Inventory context (reverses all mutations from this purchase), Reporting context, Audit context
- **Required payload:** `purchaseId`, `voidedBy`, `voidedAt`, `reason`
- **Business invariants:** A void requires authorization equivalent to the original purchase. A void is irreversible.

---

### Category: Receiving Events

---

**`GoodsAccepted`**
- **Business meaning:** Specific goods have been physically received, counted, and formally accepted into the business's possession.
- **Producer:** Receiving context
- **Consumers:** Inventory context (credits accepted quantities), Procurement context (updates PO received quantities), Notification context
- **Required payload:** `grnId`, `purchaseId`, `receivedBy`, `receivedAt`, `acceptedLines[]` (variantId, quantity, unitId, batchNumber, costPrice, expiryDate, locationId)
- **Business invariants:** Accepted quantity may not exceed ordered quantity plus a configurable tolerance. Cannot be produced for a closed PO.
- **Side effects:** Inventory is credited. PO line items are updated. This is the event that creates inventory — nothing before it does.

---

**`GoodsPartiallyAccepted`**
- **Business meaning:** A delivery was received but some items were rejected.
- **Producer:** Receiving context
- **Consumers:** Inventory context (credits accepted only), Procurement context (discrepancy flag), Notification context
- **Required payload:** `grnId`, `purchaseId`, `acceptedLines[]`, `rejectedLines[]` (with rejection reason), `receivedAt`

---

**`GoodsRejected`**
- **Business meaning:** An entire delivery was refused — no items accepted.
- **Producer:** Receiving context
- **Consumers:** Procurement context (flags PO as disputed), Notification context (urgent alert to purchasing staff)
- **Required payload:** `grnId`, `purchaseId`, `rejectedBy`, `rejectedAt`, `reason`

---

### Category: Inventory Events

---

**`StockReceived`**
- **Business meaning:** Inventory has increased because goods were formally accepted.
- **Producer:** Inventory context
- **Consumers:** Reporting context
- **Required payload:** `movementId`, `variantId`, `batchId`, `quantity`, `locationId`, `source` (grnId), `recordedAt`

---

**`StockDeducted`**
- **Business meaning:** Inventory has decreased because goods were sold.
- **Producer:** Inventory context
- **Consumers:** Reporting context; threshold check that may produce `LowStockDetected`
- **Required payload:** `movementId`, `variantId`, `batchId`, `quantity`, `source` (transactionId), `recordedAt`

---

**`StockTransferred`**
- **Business meaning:** Inventory has moved from one location to another. Net balance unchanged for internal transfers; sending branch balance decreases for external transfers.
- **Producer:** Inventory context
- **Consumers:** Reporting context
- **Required payload:** `movementId`, `variantId`, `batchId`, `quantity`, `sourceLocationId`, `targetLocationId`, `targetBranchId` (nullable), `source` (taskId), `recordedAt`

---

**`StockAdjusted`**
- **Business meaning:** Inventory quantity has been corrected following an authorized stock count reconciliation.
- **Producer:** Inventory context
- **Consumers:** Reporting context, Audit context
- **Required payload:** `movementId`, `variantId`, `batchId`, `previousQuantity`, `adjustedQuantity`, `delta`, `source` (taskId), `authorizedBy`, `recordedAt`

---

**`StockWrittenOff`**
- **Business meaning:** Inventory has been permanently removed from the business's books due to damage, expiry, or unrecoverable loss.
- **Producer:** Inventory context
- **Consumers:** Reporting context, Audit context
- **Required payload:** `movementId`, `variantId`, `batchId`, `quantity`, `reason`, `source` (taskId), `authorizedBy`, `recordedAt`

---

**`LowStockDetected`**
- **Business meaning:** A product's stock level has fallen to or below its defined reorder point.
- **Producer:** Inventory context
- **Consumers:** Task context (may auto-create SHELF_REFILL task per policy), Notification context (alerts branch management)
- **Required payload:** `variantId`, `currentQuantity`, `reorderThreshold`, `locationId`, `branchId`, `businessId`, `detectedAt`
- **Business invariants:** This event is informational. Its consumers decide whether and how to respond. The event itself creates no records.

---

### Category: Task Events

---

**`TaskCreated`**
- **Business meaning:** A unit of operational work has been formally recorded.
- **Producer:** Task context
- **Consumers:** Notification context (if an approver is designated), Approval context (if immediate approval routing is configured)
- **Required payload:** `taskId`, `type`, `createdBy`, `suggestedQty`, `metadata` (type-specific context), `assignedClerkId` (nullable), `assignedApproverId` (nullable), `dueDate` (nullable), `branchId`, `businessId`, `createdAt`

---

**`TaskApproved`**
- **Business meaning:** An authorized manager has decided this work should proceed and has committed the described resources.
- **Producer:** Task context (on receiving `ApprovalGranted`)
- **Consumers:** Notification context (notifies assigned clerk), Task context (internal: unlocks task for execution)
- **Required payload:** `taskId`, `approvedBy`, `approvedQty`, `approvedAt`, `notes`
- **Business invariants:** `approvedQty` may differ from `suggestedQty`. The approver cannot be the clerk.

---

**`TaskAssigned`**
- **Business meaning:** A specific person is now accountable for executing this task.
- **Producer:** Task context
- **Consumers:** Notification context (notifies the assigned clerk)
- **Required payload:** `taskId`, `assignedTo`, `assignedBy`, `assignedAt`

---

**`TaskStarted`**
- **Business meaning:** The assigned person has physically begun working on this task.
- **Producer:** Task context
- **Consumers:** Notification context (optionally notifies supervisor)
- **Required payload:** `taskId`, `startedBy`, `startedAt`

---

**`TaskFulfilled`**
- **Business meaning:** The physical work is complete. The clerk has recorded what was actually done.
- **Producer:** Task context
- **Consumers:** Inventory context (applies the authorized mutation), Notification context (notifies reviewer), Reporting context
- **Required payload:** `taskId`, `type`, `fulfilledBy`, `verifiedQty`, `metadata` (actual outcome), `fulfilledAt`
- **Business invariants:** `verifiedQty` is the authoritative quantity for the inventory mutation. It is what the clerk physically counted/moved, not what was suggested.
- **Side effects:** Inventory context applies the mutation using the task as authorization.

---

**`TaskReviewed`**
- **Business meaning:** A supervisor has independently verified the completion record and confirmed its accuracy. The task is now locked.
- **Producer:** Task context
- **Consumers:** Reporting context, Audit context
- **Required payload:** `taskId`, `reviewedBy`, `reviewedAt`, `notes`
- **Business invariants:** The reviewer cannot be the clerk who fulfilled the task. Once reviewed, no field of the task may be modified.

---

**`TaskCancelled`**
- **Business meaning:** This unit of work has been abandoned and will not be executed.
- **Producer:** Task context
- **Consumers:** Notification context (notifies affected parties), Inventory context (releases any reservation)
- **Required payload:** `taskId`, `cancelledBy`, `cancelledAt`, `reason`
- **Business invariants:** Only authorized roles may cancel. Terminal tasks (REVIEWED) cannot be cancelled.

---

### Category: Session Events

---

**`ShiftOpened`**
- **Business meaning:** A cashier has started their operating shift with a declared opening cash float.
- **Producer:** Session context
- **Consumers:** Task context (creates CASH_RECONCILIATION task at DRAFT), Notification context (optionally notifies supervisor)
- **Required payload:** `sessionId`, `cashierId`, `openingCash`, `startTime`, `branchId`, `businessId`

---

**`ShiftClosed`**
- **Business meaning:** A cashier has ended their shift and submitted their closing cash count.
- **Producer:** Session context
- **Consumers:** Task context (advances CASH_RECONCILIATION task to IN_PROGRESS/FULFILLED), Notification context (notifies supervisors with expected vs. actual)
- **Required payload:** `sessionId`, `cashierId`, `closingCash`, `expectedCash`, `variance`, `endTime`
- **Business invariants:** A shift cannot be closed without a submitted closing count.

---

**`ReconciliationConfirmed`**
- **Business meaning:** A supervisor has verified the cash reconciliation and locked the shift's financial record.
- **Producer:** Session context (on receiving `TaskReviewed` for the reconciliation task)
- **Consumers:** Reporting context
- **Required payload:** `sessionId`, `confirmedBy`, `verifiedCash`, `variance`, `confirmedAt`

---

### Category: Approval Events

---

**`ApprovalGranted`**
- **Business meaning:** An authorized person has approved the requested action.
- **Producer:** Approval context
- **Consumers:** The originating context that submitted the approval request
- **Required payload:** `approvalId`, `requestType`, `requestId`, `approvedBy`, `approvedAt`, `conditions` (nullable)

---

**`ApprovalRejected`**
- **Business meaning:** An authorized person has declined the requested action.
- **Producer:** Approval context
- **Consumers:** The originating context, Notification context
- **Required payload:** `approvalId`, `requestType`, `requestId`, `rejectedBy`, `rejectedAt`, `reason`

---

**`ApprovalEscalated`**
- **Business meaning:** An approval request has been unactioned past its deadline and has been routed to a higher authority.
- **Producer:** Approval context (time-triggered)
- **Consumers:** Notification context (notifies the escalation target), Audit context
- **Required payload:** `approvalId`, `escalatedTo`, `escalatedAt`, `originalDeadline`


---

## Part 4 — Commands vs Events

These four categories are the building blocks of domain interaction. Their distinction must be understood clearly, because confusing them is the most common source of coupling and ownership violations.

---

### Commands

**Definition:** A request from one actor or context asking a domain to perform an action. A command may be accepted or rejected. It is directed at a specific domain.

**Ownership:** The receiving domain owns the decision of whether to accept or reject.

**Naming convention:** Imperative verb-noun. Present tense. Example: `ApprovePurchaseRequest`, `FulfillTask`, `CloseSession`

**Lifecycle:**
1. Issued by the caller
2. Received and validated by the target domain
3. Either accepted (resulting in a state change + event) or rejected (with a reason)

**Key distinction from events:** A command is a request; it may fail. An event is a fact; it already happened.

**Examples:**

| Command | Target Domain | Success Event |
|---------|--------------|---------------|
| `ApprovePurchaseRequest` | Approval context | `PurchaseRequestApproved` |
| `FulfillTask` | Task context | `TaskFulfilled` |
| `AcceptGoodsReceipt` | Receiving context | `GoodsAccepted` |
| `CloseSession` | Session context | `ShiftClosed` |
| `VoidPurchase` | Procurement context | `PurchaseVoided` |
| `CreateTask` | Task context | `TaskCreated` |
| `AdjustInventory` | Inventory context | `StockAdjusted` |

---

### Business Events

**Definition:** An immutable, past-tense record that a significant business fact has occurred. Events are produced after a command succeeds. They are published to any interested consumers.

**Ownership:** The domain that owns the business fact produces the event. No other domain produces events on its behalf.

**Naming convention:** Past tense noun-verb or noun-verb-noun. Example: `TaskFulfilled`, `GoodsAccepted`, `LowStockDetected`

**Lifecycle:**
1. Produced after a successful command
2. Published to interested consumers
3. Immutable — never modified, never retracted
4. Consumers react independently and asynchronously (or synchronously — the mechanism is an implementation detail; the contract is not)

**Examples:**

| Event | Produced by | Consumed by |
|-------|-------------|-------------|
| `TaskFulfilled` | Task context | Inventory context, Notification context |
| `GoodsAccepted` | Receiving context | Inventory context, Procurement context |
| `LowStockDetected` | Inventory context | Task context, Notification context |
| `ShiftClosed` | Session context | Task context, Notification context |
| `PurchaseRequestApproved` | Approval context | Procurement context, Notification context |

---

### Queries

**Definition:** A request for data from a domain. Queries are read-only. They do not change state. They do not produce events.

**Ownership:** The domain that owns the data serves the query. The caller receives data but takes no action within the domain.

**Naming convention:** Interrogative verb-noun. Example: `GetTasksByStatus`, `GetInventoryLevel`, `GetPurchaseHistory`

**Lifecycle:**
1. Issued by the caller
2. Executed by the data-owning domain
3. Returns data (no side effects, no events)

**Key distinction:** A query never triggers anything. If reading data has a side effect (e.g., "mark as read"), the side effect is a command, not part of the query.

**Examples:**

| Query | Data Owner | Returns |
|-------|-----------|---------|
| `GetCurrentStockLevel(variantId)` | Inventory context | Current quantity per batch and location |
| `GetTasksByBranch(branchId, status)` | Task context | Task list with accountability chain |
| `GetPurchaseHistory(supplierId)` | Procurement context | Purchase records with GRN status |
| `GetSessionSummary(sessionId)` | Session context | Sales total, expected cash, status |
| `GetNotificationsByUser(userId)` | Notification context | Unread and recent notifications |

---

### Notifications (as a category, distinct from the Notification domain)

**Definition:** Messages delivered to people to inform them of business events. Notifications are produced by the Notification context in response to business events. They do not represent commands or queries.

**Ownership:** Notification context owns delivery. The business event that triggered the notification belongs to the emitting domain.

**Key distinction from events:** A business event is a domain fact for machine consumption. A notification is a human-readable message derived from that event.

**Key distinction from commands:** A notification informs; it does not request action. If a notification appears to "require" an action, that action is a command the recipient chooses to issue — the notification does not issue it.

---

### Side Effects

**Definition:** Consequential actions taken by a domain in reaction to a command or event. Side effects are owned by the reacting domain, not the originating domain.

**Ownership rule:** The domain that owns a side effect is responsible for it. If Task creates inventory movements when fulfilling a task, that side effect belongs to the Inventory domain reacting to `TaskFulfilled` — not to the Task domain.

**The critical distinction:** When domain A directly calls domain B's mutation functions, that is not a side effect — it is direct coupling. A true side effect is domain B reacting to an event from domain A through its own mutation handler.

**Examples of correct side effects:**

| Event | Side Effect | Owner of Side Effect |
|-------|-------------|---------------------|
| `TaskFulfilled` | Inventory mutation | Inventory context |
| `GoodsAccepted` | Stock increase | Inventory context |
| `LowStockDetected` | Notification delivered | Notification context |
| `ShiftClosed` | Reconciliation task advanced | Task context |
| `PurchaseRequestRaised` | Approver notification | Notification context |

**Examples of incorrect side effects (coupling violations):**

| Anti-pattern | Why it's wrong |
|-------------|---------------|
| Task component calls `inventoryCollection.update()` directly | Task is executing Inventory's mutation — wrong owner |
| `NotificationEngine.checkLowStock()` calls `operationalTaskCollection.insert()` | Notification context is creating Tasks — wrong owner |
| Session close dialog calls `operationalTaskCollection.update()` directly | UI component is executing Task domain mutations — wrong owner |


---

## Part 5 — Ownership Matrix

The Single Owner Rule: every business decision, every mutation, and every event has exactly one domain that is accountable for it. When ownership is unclear, find the domain whose invariants would be violated if the action went wrong.

---

### Inventory Availability

**Owner: Inventory context**

Inventory is available when a GRN is accepted (for received goods) or when a task is fulfilled and the movement is recorded. No other event makes inventory available.

No other domain may declare inventory available. Procurement may create a PO; Receiving may accept delivery; but only the Inventory context's mutation handler changes the balance.

---

### Inventory Mutations

**Owner: Inventory context (sole, exclusive)**

No other context mutates inventory. All other contexts produce the events or complete the tasks that authorize the Inventory context to mutate.

| Mutation type | Authorizing source |
|--------------|-------------------|
| Stock increase from supplier | `GoodsAccepted` event from Receiving |
| Stock decrease from sale | `SaleCompleted` event from POS |
| Stock transfer (internal) | `TaskFulfilled` (SHELF_REFILL or INTERNAL_TRANSFER task) |
| Stock transfer (external) | `TaskFulfilled` (BRANCH_TRANSFER task) |
| Stock adjustment | `TaskFulfilled` (STOCK_COUNT task) + prior `ApprovalGranted` |
| Stock write-off | `TaskFulfilled` (WASTE_DISPOSAL task) + prior `ApprovalGranted` |
| Stock reversal (purchase void) | `PurchaseVoided` event from Procurement |

---

### Purchase Approval

**Owner: Approval context**

No context approves its own actions. The Procurement context submits an approval request. The Approval context makes the decision and produces `ApprovalGranted` or `ApprovalRejected`. The Procurement context reacts.

---

### Goods Acceptance

**Owner: Receiving context**

Only the Receiving context can produce `GoodsAccepted`. The physical act of receiving and the business record of acceptance both belong to Receiving. Procurement does not accept goods; it creates the order. Inventory does not accept goods; it processes the credit after acceptance.

---

### Task Assignment

**Owner: Task context**

The Task context records the assignment. The Employee context provides the registry of who exists. Assignment decisions come from management (human command). The Notification context delivers the notification. But the act of recording "this task is assigned to this person" belongs to the Task context.

---

### Task Completion Record

**Owner: Task context**

The Task context owns the fulfillment record — what was done, by whom, in what quantity. The Inventory context uses this record as authorization for the inventory mutation, but does not own the record itself.

---

### Notification Creation

**Owner: Notification context**

No domain creates notifications directly. Every domain emits events. The Notification context subscribes to events and creates notification records as a reaction. The decision of who to notify, at what priority, and via what channel belongs exclusively to the Notification context (or its configurable rules).

---

### Audit Recording

**Owner: Audit context (or each domain's own immutable event log)**

Each domain maintains the immutable record of its own state changes. The Audit context aggregates these for cross-domain investigation. No domain modifies another domain's audit records.

---

### Reporting Updates

**Owner: Reporting context**

Reports are derived views. They are updated by the Reporting context reading from domain records. No domain pushes data to the Reporting context — Reporting pulls.

---

### Business Event Publication

**Owner: The domain where the fact occurred**

| Event | Owner |
|-------|-------|
| All purchase events | Procurement context |
| All receiving events | Receiving context |
| All inventory events | Inventory context |
| All task events | Task context |
| All session events | Session context |
| All approval events | Approval context |

No event may be published by a domain that did not produce the underlying business fact.

---

### Scheduling

**Owner: Task context**

Scheduled work — recurring tasks, periodic audits — are task creation triggers. The schedule is metadata that causes a task to be created. Once created, the task follows the standard task lifecycle. The schedule does not own the task; the Task context does.

---

### Authorization Limits

**Owner: Approval context**

The rules defining who can approve what type of action at what value threshold belong to the Approval context. Individual domains declare that they need approval (by submitting a request); they do not define the approval rules themselves.

---

### Stock Level Detection

**Owner: Inventory context**

The detection of a low stock condition and the emission of `LowStockDetected` belong to the Inventory context. What happens in response to that event belongs to the consuming contexts (Task creates a task if policy says so; Notification delivers an alert).


---

## Part 6 — Domain Policies

Policies are the configurable behavioral rules that govern how domains respond to conditions. Unlike invariants, policies can change — they represent business decisions, not physical laws.

---

### P-INV-01: Inventory Credit on Acceptance Only
Inventory increases only when goods are formally accepted by the Receiving context. A Purchase Order being approved, a delivery arriving at the premises, or a supplier invoice being received does not increase inventory. Only `GoodsAccepted` does.

---

### P-INV-02: Every Inventory Mutation is Traceable
Every change to an inventory batch is accompanied by an Inventory Movement record that identifies the authorizing event, the actor, and the timestamp. An inventory mutation without a corresponding movement is a data integrity failure.

---

### P-INV-03: Reorder Point Triggers a Signal, Not an Action
When stock crosses the reorder threshold, the Inventory context emits `LowStockDetected`. What happens next is a policy decision. By default: a SHELF_REFILL task is auto-created and management is notified. This default can be changed. The signal itself cannot.

---

### P-INV-04: Batch Cost Is Fixed at Acceptance
The cost price of an inventory batch is established when the `GoodsAccepted` event is processed. It is never retroactively modified. Subsequent purchases at different prices create new batches with new costs. Historical batches retain their original cost for FIFO accuracy.

---

### P-TASK-01: Tasks Coordinate People, Not Systems
A task is a human work instruction. Its purpose is to communicate authorized work to a person and record that the work was done. A task does not execute inventory mutations — it authorizes a person to do work, and the outcome of that work is recorded, after which the relevant domain reacts.

---

### P-TASK-02: Tasks Require Authorization for Inventory-Bearing Work
Any task that involves moving, adjusting, or removing inventory requires approval before execution. The approval level required is configurable by task type and by the value of inventory involved. The approval must be recorded before the task may advance to IN_PROGRESS.

**Exception by policy:** Tasks of type GENERAL_CHORE (no inventory involved) do not require approval. This exception is declared explicitly in policy, not silently embedded in the state machine.

---

### P-TASK-03: The Three Quantities Serve Different Purposes
- **Suggested quantity:** What the requester proposes is needed.
- **Approved quantity:** What management has authorized to be moved or adjusted.
- **Verified quantity:** What the clerk physically counted or moved.

These three quantities may differ. Discrepancies between approved and verified quantity are operational variances that require explanation. Inventory mutation uses the verified quantity, not the suggested or approved quantity.

---

### P-TASK-04: Auto-Generated Tasks Are Subject to Policy
When the system generates a task automatically (e.g., from `LowStockDetected` or `ShiftOpened`), the task is created at DRAFT or PENDING depending on the configured policy for that task type. Auto-generation does not bypass the approval requirement unless an explicit policy exception grants it.

---

### P-PURCH-01: No Purchase Without Authorization
A Purchase Order may not be created without an approval decision on the underlying Purchase Request. For low-value or routine purchases, the approval may be auto-granted by policy. This auto-grant is still an authorization decision — it is explicit, logged, and configurable. There is no path that bypasses authorization entirely.

---

### P-PURCH-02: Purchase Voiding Requires Equivalent Authorization
Voiding a purchase has the same financial consequence as creating one. It requires authorization at the same level as the original purchase. An auto-authorized routine purchase may be voided by any authorized user; a high-value purchase void requires branch manager approval.

---

### P-NOTIF-01: Notifications Are Informational Only
A notification informs a person that something happened. It does not create business records. It does not make decisions. If a notification appears to "do" something, the business logic doing that thing belongs to the domain that detected the condition, not to the Notification context.

---

### P-NOTIF-02: Recipients Are Resolved by Role and Assignment
Notification recipients are determined by: (a) the role required for the event type, and (b) any specific assignment in the triggering record. A task-assigned notification goes to the assigned clerk. A low-stock notification goes to all branch managers and supervisors. These rules are configurable.

---

### P-APPR-01: No Self-Approval
No user approves their own requests. No domain approves its own actions. This is enforced at the authorization layer, not as a business rule to be checked at the UI.

---

### P-APPR-02: Approval Is Role-Scoped, Not Individual-Scoped
An authorization limit is defined by role and scope, not by individual identity. Any user in the SUPERVISOR role may approve purchases up to ₱10,000. Any user in the ADMIN role may approve up to ₱50,000. Specific assignment (e.g., "only Maria can approve this task") overrides but does not replace role-based rules.

---

### P-SESS-01: Every Shift Has an Independent Reconciliation
Each shift produces exactly one CASH_RECONCILIATION task. The reconciliation task follows the standard task lifecycle. The shift's financial record is locked when the reconciliation task reaches REVIEWED. A shift cannot be reconciled without the reconciliation task being reviewed.

---

### P-SESS-02: Variance Is Documented, Not Corrected Automatically
When a cash variance is found at shift close, it is recorded and routed for supervisor review. The system does not automatically adjust the expected cash or ignore the discrepancy. The supervisor makes the determination.


---

## Part 7 — Business Invariants

Invariants are absolute rules. They are not configurable. They are not exceptions to policy. If an invariant is violated, a business process has failed, not just a software rule.

Each invariant identifies the protected domain, the reason it exists, and the impact of violation.

---

### INV-01: Inventory Cannot Exist Without a Source

**Rule:** Every unit of inventory in the system traces to a `GoodsAccepted` event from a Goods Receipt. Inventory that has no traceable source is a data integrity failure.

**Protected domains:** Inventory, Audit

**Reason:** Without provenance, inventory is untrustworthy. It cannot be costed accurately (no batch cost), cannot be audited (no receiving record), and cannot be disputed with a supplier.

**Impact if violated:** FIFO costing fails. Audit trail has unexplained gaps. Regulatory compliance risk.

---

### INV-02: Inventory Cannot Change Without a Movement Record

**Rule:** Every change to an inventory batch quantity is accompanied by an Inventory Movement record. No batch quantity may be modified without a corresponding movement being created in the same atomic operation.

**Protected domains:** Inventory, Audit

**Reason:** The movement history is the audit trail for inventory. If a movement can be skipped, the history is incomplete and cannot be trusted.

**Impact if violated:** Unexplained stock discrepancies. Cannot reconstruct how inventory reached its current state. FIFO calculations are incorrect.

---

### INV-03: Inventory Cannot Become Negative Through Authorized Operations

**Rule:** An authorized inventory mutation (sale, transfer, write-off, adjustment) must not reduce an inventory batch below zero. If insufficient stock exists, the operation must be blocked or flagged — it cannot silently proceed.

**Protected domains:** Inventory

**Reason:** Negative inventory is a logical impossibility — you cannot have less than zero of a physical good. Permitting it means the records no longer describe reality.

**Impact if violated:** Costing becomes meaningless. Reorder logic fails. Financial reports are incorrect.

---

### INV-04: A Stock Count Adjustment Is Not Applied Until Reviewed

**Rule:** When a stock count produces a quantity that differs from the recorded balance, the adjustment is not applied until an authorized reviewer confirms the count. The proposed count is a claim; the reviewed adjustment is a fact.

**Protected domains:** Inventory, Approval

**Reason:** Physical counts can be wrong. A second set of eyes prevents errors from becoming permanent corrections. The review is the authorization.

**Impact if violated:** Incorrect inventory records confirmed without independent verification. Unexplained stock losses or gains.

---

### INV-05: Batch Cost Is Established at Receipt, Never Retroactively Changed

**Rule:** The cost price of an inventory batch is recorded when the batch is created (at goods receipt). It is never modified after creation. Subsequent purchases at different prices create new batches.

**Protected domains:** Inventory, Reporting

**Reason:** FIFO costing requires that each batch carries its original cost. If costs are overwritten, the cost of goods sold calculation is incorrect and historical financial reports become unreliable.

**Impact if violated:** COGS calculations are wrong. Gross profit reports are incorrect. Historical periods cannot be accurately reconstructed.

---

### INV-06: Tasks Never Own Inventory

**Rule:** A Task references inventory (via variantId, locationId, batchId) but never holds, reserves, or modifies inventory. The Task is an authorization record. The Inventory context acts on it.

**Protected domains:** Task, Inventory

**Reason:** If Tasks owned inventory state, inventory rules would have to be enforced in the Task context. Every future change to inventory behavior would require changes to the Task context.

**Impact if violated:** Inventory rules become fragmented. Task changes have unexpected inventory side effects. Testing inventory behavior requires testing task behavior.

---

### INV-07: Every Task That Affects Inventory Must Be Authorized Before Execution

**Rule:** A task of any type that involves an inventory movement (SHELF_REFILL, BRANCH_TRANSFER, STOCK_COUNT, WASTE_DISPOSAL, PURCHASE_REQUEST) must have passed through the approval stage before it may be advanced to IN_PROGRESS. This includes auto-generated tasks, unless an explicit policy exception declares auto-approval for that task type.

**Protected domains:** Task, Inventory, Approval

**Reason:** Unauthorized inventory movements are operational failures. The approval is the control that prevents unauthorized removal, movement, or adjustment of stock.

**Impact if violated:** Untracked inventory losses. Staff can move stock without management knowledge. Financial and operational reports are unreliable.

---

### INV-08: Goods Receipt Belongs to Exactly One Purchase Order

**Rule:** A Goods Receipt Note cannot exist without a corresponding Purchase Order. It is not valid to accept goods into inventory without a prior authorized order.

**Protected domains:** Receiving, Procurement

**Reason:** Accepting goods without a PO means the business has no authorized baseline to compare against. It cannot detect short delivery, wrong items, or inflated costs.

**Impact if violated:** Unauthorized goods enter inventory. Supplier accountability is lost. Three-way match is impossible.

---

### INV-09: A Reviewed Task Cannot Be Modified or Deleted

**Rule:** Once a task reaches the REVIEWED state, no field may be modified and the record may not be deleted. Corrections are handled through new records.

**Protected domains:** Task, Audit

**Reason:** A reviewed task is an audited record. Modifying it after review destroys the audit trail. The reviewer's sign-off means they confirmed specific data — changing that data invalidates the confirmation.

**Impact if violated:** Audit trail manipulation. The reviewer's accountability is compromised.

---

### INV-10: Notifications Never Make Business Decisions

**Rule:** A notification record does not cause any business state to change. Reading, dismissing, or ignoring a notification has no effect on any domain record outside the Notification context.

**Protected domains:** Notification, all other domains

**Reason:** If notifications could trigger business actions, the business logic for those actions would be split between the notification system and the domain. Notifications would become a hidden control flow mechanism.

**Impact if violated:** Business logic becomes dependent on notification delivery. Failed or unread notifications silently prevent business processes.

---

### INV-11: Reports Are Read-Only

**Rule:** No reporting query, report generation, or data export operation modifies any business record. Reports observe; they do not act.

**Protected domains:** All producing domains, Reporting

**Reason:** If reports could write data, the Reporting context would become an undocumented business logic path. Changes to reporting would unexpectedly affect operational data.

**Impact if violated:** Unpredictable side effects from viewing reports. Audit trail contaminated by reporting reads.

---

### INV-12: A Closed Purchase Order Cannot Receive New Goods

**Rule:** Once a Purchase Order reaches CLOSED status (all items received or formally resolved), no new Goods Receipt may be created against it.

**Protected domains:** Procurement, Receiving

**Reason:** A closed PO is a completed procurement cycle. Accepting goods against a closed PO would create inventory with no valid authorization trail and could permit fraud.

**Impact if violated:** Goods are accepted without valid authorization. Inventory has ghost stock.

---

### INV-13: Variance Is Recorded, Never Silently Corrected

**Rule:** When a stock count or cash reconciliation finds a discrepancy, the discrepancy is recorded as a variance and requires authorized review. The system does not automatically adjust the balance to match the count without a reviewer confirming the adjustment.

**Protected domains:** Inventory, Session, Approval

**Reason:** Automatic variance resolution hides operational failures. Variances are evidence of problems (theft, miscounting, system errors) that need investigation.

**Impact if violated:** Operational problems are masked. Recurring discrepancies go undetected. Accountability is lost.


---

## Part 8 — Canonical State Machines

These are the official, authoritative state machines for every major domain aggregate. Every implementation must conform to these. Deviations require a documented policy exception.

---

### Purchase Lifecycle

```
                    ┌──────────────────────────────────┐
                    │         PURCHASE                  │
                    └──────────────────────────────────┘

  [User creates request]
          │
          ▼
      ┌───────┐
      │ DRAFT │ ◄─── Requester saves work-in-progress
      └───────┘
          │  [User submits for approval]
          ▼
  ┌────────────────┐
  │ PENDING_APPR.  │ ◄─── Awaiting authorization decision
  └────────────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌──────────┐  ┌──────────┐
│ APPROVED │  │ REJECTED │ ◄─── Terminal (may revise and resubmit)
└──────────┘  └──────────┘
    │
    │  [Goods arrive and are accepted via GRN]
    ▼
┌──────────────────┐
│ PARTIALLY_RECVD  │ ◄─── Some line items received, remainder outstanding
└──────────────────┘
    │  [All items received or resolved]
    ▼
┌──────────┐
│ RECEIVED │
└──────────┘
    │  [PO formally closed]
    ▼
┌────────┐
│ CLOSED │ ◄─── Terminal (immutable)
└────────┘

Exceptional path (from any pre-CLOSED state):
    │  [Authorized void]
    ▼
┌────────┐
│ VOIDED │ ◄─── Terminal (inventory reversed)
└────────┘

Quick-receive shortcut (cash-and-carry operations):
DRAFT → RECEIVED directly (auto-approve + auto-accept GRN)
This is a configured policy, not the default lifecycle.
```

**User actions:** Create, Submit, Approve/Reject, Void
**Automatic transitions:** APPROVED → PARTIALLY_RECEIVED (on first GRN acceptance), PARTIALLY_RECEIVED → RECEIVED (on all items resolved)
**Terminal states:** REJECTED, CLOSED, VOIDED

---

### Goods Receipt Lifecycle

```
  [Delivery arrives]
          │
          ▼
      ┌─────────┐
      │ PENDING │ ◄─── GRN created; goods not yet inspected
      └─────────┘
          │  [Receiving staff counts and inspects]
          ▼
    ┌───────────┐
    │ INSPECTED │
    └───────────┘
          │
    ┌─────┼─────────┐
    ▼     ▼         ▼
┌──────┐ ┌──────────┐ ┌──────────┐
│ACCPTD│ │PART_ACCPT│ │ REJECTED │
└──────┘ └──────────┘ └──────────┘
All terminal. Inventory credited for accepted quantities only.
```

---

### Task Lifecycle

```
                    ┌──────────────────────────────────┐
                    │         OPERATIONAL TASK          │
                    └──────────────────────────────────┘

  [Any user creates task / system auto-generates]
          │
          ▼
      ┌───────┐
      │ DRAFT │ ◄─── Saved locally; not yet visible to management queues
      └───────┘
          │  [User submits for approval]
          ▼
    ┌─────────┐
    │ PENDING │ ◄─── Awaiting authorization
    └─────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌──────────┐  ┌───────────┐
│ APPROVED │  │ CANCELLED │ ◄─── Terminal (rejected by approver)
└──────────┘  └───────────┘
    │  [Assigned clerk starts work]
    ▼
┌─────────────┐
│ IN_PROGRESS │
└─────────────┘
    │
    ├──────────────────┐
    ▼                  ▼
┌───────────┐    ┌───────────┐
│ FULFILLED │    │ CANCELLED │ ◄─── Terminal (halted mid-execution)
└───────────┘    └───────────┘
    │  [Supervisor verifies and locks]
    ▼
┌──────────┐
│ REVIEWED │ ◄─── Terminal, immutable (locked forever)
└──────────┘

Policy exception — GENERAL_CHORE:
PENDING → IN_PROGRESS directly (approval not required by policy)
This is a policy rule, explicitly configured, not a workflow bypass.
```

**User actions:** Create, Submit, Approve, Reject, Start, Fulfill, Review, Cancel
**Automatic transitions:** Auto-generation from events sets initial state per policy (DRAFT or PENDING)
**Terminal states:** CANCELLED, REVIEWED

**The three quantities at each stage:**
- At DRAFT/PENDING: `suggestedQty` is set. `approvedQty` and `verifiedQty` are null.
- At APPROVED: `approvedQty` is set (may differ from `suggestedQty`).
- At FULFILLED: `verifiedQty` is set (what was physically done).
- Inventory mutation uses `verifiedQty`.

---

### Inventory Batch Lifecycle

```
  [GoodsAccepted event]
          │
          ▼
   ┌────────────┐
   │  AVAILABLE │ ◄─── Quantity > 0, location assigned
   └────────────┘
          │
  ┌───────┼──────────┐
  ▼       ▼          ▼
[Sale] [Transfer] [Adjustment]
  │       │          │
  └───────┴──────────┘
          │  [Quantity reaches 0]
          ▼
   ┌────────────┐
   │  EXHAUSTED │ ◄─── Terminal (batch record retained for history)
   └────────────┘
```

**Special state:** RESERVED — a portion of an AVAILABLE batch is committed to a pending order or task. Reserved quantity is unavailable for other purposes.

---

### Notification Lifecycle

```
  [Business event emitted]
          │
          ▼
  ┌──────────────┐
  │   DELIVERED  │ ◄─── Created and sent to recipient
  └──────────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
┌────────┐  ┌──────────┐
│  READ  │  │ UNREAD   │ ◄─── [Reminder fires after configurable window]
└────────┘  └──────────┘
    │           │  [Escalation threshold crossed]
    │           ▼
    │     ┌────────────┐
    │     │ ESCALATED  │
    │     └────────────┘
    ▼
┌──────────┐
│ ARCHIVED │ ◄─── After retention period (not deleted)
└──────────┘
```

---

### Session (Shift) Lifecycle

```
  [Cashier opens shift with declared float]
          │
          ▼
      ┌──────┐
      │ OPEN │ ◄─── Transactions accumulate; CASH_RECONCILIATION task at DRAFT
      └──────┘
          │  [Cashier submits closing count]
          ▼
    ┌────────┐
    │ CLOSED │ ◄─── CASH_RECONCILIATION task advances per path
    └────────┘
    Terminal. Reconciliation task lifecycle continues independently.
```

---

### Approval Request Lifecycle

```
  [Domain submits approval request]
          │
          ▼
  ┌──────────┐
  │  PENDING │ ◄─── Awaiting approver action; approver notified
  └──────────┘
          │
   ┌──────┼──────────┐
   ▼      ▼          ▼
┌──────┐ ┌─────────┐ ┌──────────┐
│APPRVD│ │REJECTED │ │ESCALATED │
└──────┘ └─────────┘ └──────────┘
  │ Terminal   │ Terminal    │  [Escalation target responds]
  └────────────┴────────────┘
                    ▼
            [APPROVED or REJECTED at higher level]
```


---

## Part 9 — Domain Interaction Rules

These rules define how bounded contexts may and may not communicate. Violating them is an architectural defect, not an implementation detail.

---

### Allowed Communication Patterns

**Pattern 1: Event-Driven Reaction**
Domain A completes an operation and emits an event. Domain B has a registered handler for that event and reacts autonomously.

```
Inventory context emits LowStockDetected
→ Task context handler creates a SHELF_REFILL task
→ Notification context handler delivers an alert to managers
```

This is the preferred pattern for cross-domain side effects. Neither Task nor Notification is coupled to Inventory's internal implementation.

---

**Pattern 2: Command with Response**
Domain A sends a command to Domain B requesting a specific action. Domain B validates, executes, and returns a success/failure response. Domain A reacts to the outcome.

```
Procurement context sends ApprovePurchaseRequest to Approval context
→ Approval context validates, records decision, emits ApprovalGranted
→ Procurement context reacts to ApprovalGranted by creating the PO
```

---

**Pattern 3: Query for Data**
Domain A requests data from Domain B's read model. Domain B returns data without side effects.

```
Task context queries Inventory context for current stock level of a variant
→ Inventory context returns quantity per batch and location
→ Task context uses this to populate the suggested quantity
```

---

**Pattern 4: Shared Reference Data**
Domains reference shared, stable data — product catalogue, supplier registry, employee registry — without owning it.

```
Task context references variantId (owned by Product catalogue context)
Procurement context references supplierId (owned by Supplier registry)
```

Reference data is read-only from the perspective of the consuming context.

---

### Forbidden Communication Patterns

**Forbidden 1: Direct Cross-Domain Mutation**
Domain A must not call Domain B's collection or repository write methods directly.

```
❌ Task context calls inventoryCollection.update() directly
❌ NotificationEngine calls operationalTaskCollection.insert()
❌ Session close dialog calls operationalTaskCollection.update()
```

These are direct coupling violations. Every cross-domain state change must flow through an event or a command contract.

---

**Forbidden 2: Domain B Reading Domain A's Internal State**
Domain A's internal data model is private. Domain B may only consume data through Domain A's published read model or query interface.

```
❌ Notification context reaches into Task context to find the clerk's email
✓ Notification context queries Employee context for the clerk's notification preferences
```

---

**Forbidden 3: Circular Dependency**
Domain A depends on Domain B which depends on Domain A. This creates an indissoluble coupling that prevents either domain from changing independently.

```
❌ Task context emits TaskFulfilled → Inventory context emits StockAdjusted → Task context reacts
```

The correct direction: Task emits events. Inventory reacts. Inventory emits its own events. Task does not consume Inventory events — it only produces task events.

---

**Forbidden 4: Notification Context Producing Business Records**
The Notification context may produce notification records only. It may not produce purchase records, task records, inventory movements, or any other domain record.

```
❌ Notification context creates a Task when a LOW_STOCK notification is sent
✓ Task context creates a Task when it consumes the LowStockDetected event
```

---

**Forbidden 5: Reporting Context Writing Data**
The Reporting context is read-only. Any operation that reads data and then modifies it (e.g., "mark as viewed," "export and archive") must split these into a query (Reporting) and a command (the relevant domain).

---

### Dependency Direction

The canonical dependency direction for this domain is:

```
UI Layer
  └─> Application/Service Layer
        └─> Domain Service (business logic)
              └─> Domain Model (aggregates, events)
                    └─> Infrastructure (collections, sync, storage)
```

Dependencies always point inward. Inner layers know nothing about outer layers.

Cross-context dependencies flow:
```
Procurement ──depends on──> Approval (for authorization)
Task ──depends on──> Approval (for authorization)
Inventory ──depends on──> Receiving (as event source)
All contexts ──emit to──> Notification (one-way, no dependency)
All contexts ──publish to──> Audit (one-way, append-only)
Reporting ──reads from──> All contexts (read-only, no dependency)
```

---

### Shared Concepts (Context Map)

Some concepts appear in multiple contexts but are owned by one:

| Concept | Owning Context | Borrowing Contexts |
|---------|---------------|-------------------|
| ProductVariant | Product catalogue | Inventory, Task, Procurement |
| Supplier | Supplier registry | Procurement, Receiving |
| Employee / User | Employee context | Task, Approval, Notification, Session |
| Location | Branch/Settings context | Inventory, Task |
| Branch | Multi-tenancy context | All contexts |

Borrowing contexts hold a reference (ID) to the owning context's record. They never duplicate the owned record's fields in their own domain model.

---

### Cross-Domain Coordination (Sagas / Process Managers)

Some business operations span multiple domains and require coordination across multiple events. These are process flows, not individual domain actions.

**Purchase Procurement Flow:**
```
PurchaseRequestRaised → (Approval) → PurchaseRequestApproved → (Procurement) → 
PurchaseOrderCreated → (Receiving) → GoodsAccepted → (Inventory) → StockReceived
```

No single domain owns this entire flow. Each domain owns its step. The coordination is emergent from event subscriptions.

**Shift Reconciliation Flow:**
```
ShiftClosed → (Task) → CASH_RECONCILIATION task advances → (Task workflow) → 
TaskFulfilled → (Approval/Review) → TaskReviewed → (Session) → ReconciliationConfirmed
```


---

## Part 10 — Extension Contracts

Every future capability described here must extend existing domain concepts rather than introduce a parallel model. If a new capability cannot fit within the existing vocabulary and state machines, that is a signal that either the vocabulary needs enriching (add a new concept with a precise definition) or the design of the new capability is incorrect.

---

### Partial Receiving

**Extends:** Goods Receipt (GRN) and Purchase Order

**Contract:** A GRN may accept fewer units than ordered on any line item. When this happens, the PO line item is partially fulfilled. The PO remains PARTIALLY_RECEIVED until all line items are resolved. Multiple GRNs can exist for one PO.

**New concept required:** None. The existing GRN and PO concepts support this by design.

**Invariant preserved:** INV-01 (inventory credit only on acceptance) and INV-08 (GRN must reference a PO).

---

### Quality Inspection

**Extends:** Goods Receipt (adds an inspection record before acceptance decision)

**Contract:** Between PENDING and acceptance, a GRN enters an INSPECTED state. The inspection records: inspector identity, criteria applied, pass/fail per lot. Acceptance is conditional on passing inspection. Failed lots are recorded as rejected.

**New concept required:** `InspectionRecord` — a sub-record of GRN with criteria, results, and inspector identity.

**Invariant preserved:** INV-01 (inspection is a prerequisite to acceptance, not a bypass of it).

---

### Purchase Rejection and Disputes

**Extends:** Procurement domain and Receiving domain

**Contract:** A `GoodsRejected` or `GoodsPartiallyAccepted` event triggers a dispute flag on the PO. The dispute records the discrepancy, the supplier's response, and the resolution (credit note, replacement, price adjustment). The PO is not closed until the dispute is resolved.

**New concept required:** `SupplierDispute` — linked to a PO, tracking the discrepancy and its resolution.

**Invariant preserved:** INV-12 (PO cannot close with unresolved items).

---

### Batch Inventory and FEFO

**Extends:** Inventory batch management

**Contract:** Inventory batches already have `expiryDate`. FEFO (First Expired, First Out) is a consumption policy — when consuming stock, the batch with the earliest expiry is consumed first. FEFO is a configuration of the batch consumption order, not a new concept.

**New concept required:** A `ConsumptionPolicy` attribute on the product: FIFO, FEFO, or LIFO. The Inventory context applies this when selecting batches to consume.

---

### Internal Transfers

**Extends:** Task (SHELF_REFILL or INTERNAL_TRANSFER type) and Inventory (INTERNAL_TRANSFER movement)

**Contract:** Moving stock between locations within the same branch is an INTERNAL_TRANSFER task. It has a source location and a target location. On fulfillment, two movements are created: an OUT from the source and an IN to the destination.

**New concept required:** None. The existing Task and InventoryMovement concepts support this. The `INTERNAL_TRANSFER` MovementType already exists.

---

### Branch (External) Transfers

**Extends:** Task (BRANCH_TRANSFER type) and Inventory (EXTERNAL_TRANSFER movement)

**Contract:** Moving stock between branches requires an authorized BRANCH_TRANSFER task. On fulfillment, the sending branch records an OUT movement. The receiving branch records an IN movement against a corresponding receiving task or confirmation. Both movements reference the same task authorization.

**New concept required:** A `TransferAcknowledgement` at the receiving branch — confirming the goods arrived. Until acknowledged, the receiving branch's inventory is not credited.

---

### Warehouse Operations

**Extends:** Task domain (adds warehouse-specific task types), Location model (adds zone, aisle, bin hierarchy)

**Contract:** Warehouse operations are tasks with more structured location data. Pick lists are SHELF_REFILL or INTERNAL_TRANSFER tasks. Put-away tasks are INTERNAL_TRANSFER tasks from a receiving location to a storage location. The task vocabulary is identical; the metadata becomes more structured.

**New concepts required:** Warehouse location hierarchy (Zone → Aisle → Bay → Bin). These are enrichments to the existing Location concept.

---

### Stock Counting (Stocktake)

**Extends:** Task (STOCK_COUNT type) and Inventory (StockAdjusted event)

**Contract:** A stocktake is a collection of STOCK_COUNT tasks coordinated by a manager, covering all product lines in a location. Tasks are created in batch. Each is individually fulfilled by a clerk. No adjustment is applied until all tasks in the stocktake are reviewed and the manager approves the batch reconciliation.

**New concept required:** `StocktakeSession` — a group of STOCK_COUNT tasks that are committed as a batch. Adjustments are applied only when the session is approved.

---

### Maintenance Tasks

**Extends:** Task (GENERAL_CHORE or a new MAINTENANCE task type)

**Contract:** Maintenance tasks describe equipment service, repairs, or compliance checks. They involve no inventory. They may reference an equipment identifier in metadata. They follow the same task lifecycle.

**New concept required:** `MaintenanceMetadata` as a task type-specific metadata schema. No change to the core task model.

---

### Scheduled / Recurring Work

**Extends:** Task domain

**Contract:** A schedule is a rule that creates tasks automatically at defined intervals. The schedule is not a task; it is a factory for tasks. Created tasks enter the normal task lifecycle. The schedule does not bypass approval.

**New concept required:** `TaskSchedule` — defines the task type, recurrence pattern, and default assignment. This is metadata that creates tasks; it does not replace the task lifecycle.

---

### Escalations

**Extends:** Approval domain and Notification domain

**Contract:** An escalation is a time-triggered re-routing of an unactioned approval request to a higher authority. It is a property of the Approval lifecycle, not a new domain concept. An escalation produces an `ApprovalEscalated` event.

**New concept required:** Escalation rules as configuration within the Approval domain.

---

### Multi-Level Approval

**Extends:** Approval domain

**Contract:** Some purchase values or task types require sequential approval from multiple authority levels. This is a routing configuration in the Approval domain. Each level produces an `ApprovalGranted` event. The next level is notified. The action proceeds only after all required levels approve.

**New concept required:** `ApprovalChain` — an ordered list of authority levels required for a given approval type and value threshold.

---

### Subscription Restrictions

**Extends:** Entitlement context (already exists)

**Contract:** The existing `EntitlementEngine` already supports capability gating, usage limits, transaction allowances, and credit balances. Subscription restrictions are a matter of populating the entitlement context with real subscription data rather than the current open-context fallback.

**New concept required:** `BusinessSubscription` — the active plan with its status, dates, and allocated quotas. This is Phase 3 of the entitlement roadmap.

---

### Returns and Refunds

**Extends:** Procurement domain (supplier returns), POS/Sales domain (customer refunds)

**Contract:** A supplier return is the reverse of a Goods Receipt — it produces a `GoodsReturnedToSupplier` event, which decreases inventory and creates a corresponding dispute or credit note record. A customer refund is a negative transaction in the POS domain.

**New concept required:** `ReturnAuthorization` — the approval record for returning goods to a supplier.


---

## Part 11 — Architectural Vocabulary

This is the canonical naming standard. One concept has exactly one name. Synonyms are explicitly noted and prohibited in new development. This applies to: documentation, code identifiers, database columns, API fields, event names, UI labels, and test descriptions.

---

### Core Domain Terms (Canonical Names)

| Canonical Name | Prohibited Synonyms | Context |
|---------------|---------------------|---------|
| **Purchase Request** | PR, Requisition, Procurement Request | A request to buy goods before authorization |
| **Purchase Order** | PO, Purchase, Order (in procurement context) | An authorized commitment to a supplier |
| **Goods Receipt** | GRN, Receiving Record, Delivery Note, Receipt | The formal acceptance record of a delivery |
| **Inventory Batch** | Batch, Lot, Stock Entry, Inventory Record | A discrete group of units received together |
| **Inventory Mutation** | Stock Update, Inventory Change, Stock Adjustment (when generic) | Any change to inventory quantity |
| **Inventory Movement** | Movement Record, Stock Log, Audit Entry, History | The immutable audit record of a mutation |
| **Operational Task** | Task, Work Order, Chore, Job (use Task) | A unit of authorized operational work |
| **Task Fulfillment** | Task Completion, Task Execution, Task Done | The recording of what was physically done |
| **Assignment** | Delegation, Handoff, Allocation | Designating a person to execute a task |
| **Approval** | Authorization, Sign-off, Clearance (use Approval) | The formal authorization decision |
| **Approval Request** | Pending Approval, Awaiting Sign-off | The submitted request awaiting a decision |
| **Notification** | Alert (use only for urgent), Message, Notice | An in-system message to a person |
| **Alert** | (reserved for HIGH/URGENT priority notifications only) | An urgent, time-sensitive notification |
| **Business Event** | Event, Message, Signal, Fact | An immutable record of a business fact |
| **Session** | Shift, Vendor Session, Cash Session | A cashier's operating period |
| **Variance** | Discrepancy, Difference, Gap | Difference between expected and actual |
| **Write-Off** | Wastage (use for the act), Disposal, Loss | Permanent removal of inventory from books |
| **Waste** | Spoilage, Damage, Expired Stock (use Waste) | The category of goods written off |
| **Adjustment** | Correction, Reconciliation Adjustment, Fix | An authorized inventory quantity correction |
| **Transfer** | Movement (when cross-location), Relocation | Movement of inventory between locations |
| **Reorder Point** | Low Stock Threshold, Reorder Level, Min Stock | The quantity that triggers a reorder signal |

---

### Status and State Values (Canonical Names)

| Aggregate | Status | Prohibited Alternatives |
|-----------|--------|------------------------|
| Purchase | DRAFT, PENDING_APPROVAL, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, VOIDED | do not use: pending, open, complete, deleted |
| Task | DRAFT, PENDING, APPROVED, IN_PROGRESS, FULFILLED, REVIEWED, CANCELLED | do not use: done, complete, closed, rejected (use CANCELLED) |
| GRN | PENDING, INSPECTED, ACCEPTED, PARTIALLY_ACCEPTED, REJECTED | do not use: received, confirmed, done |
| Session | OPEN, CLOSED | do not use: active, inactive, ended |
| Notification | DELIVERED, READ, ESCALATED, ARCHIVED | do not use: seen, dismissed, deleted |
| Approval Request | PENDING, APPROVED, REJECTED, ESCALATED | do not use: open, closed, accepted |

---

### Event Naming Convention

- **Format:** PastTenseNounVerb or NounPastTenseVerb
- **Casing:** PascalCase for event type names
- **Examples:** `TaskFulfilled`, `GoodsAccepted`, `LowStockDetected`, `PurchaseRequestApproved`, `ShiftClosed`
- **Anti-patterns:** `task_complete`, `goods_received_ok`, `low_stock`, `purchase_done`

---

### Command Naming Convention

- **Format:** ImperativeVerbNoun
- **Casing:** PascalCase
- **Examples:** `FulfillTask`, `AcceptGoodsReceipt`, `ApprovePurchaseRequest`, `CloseSession`
- **Anti-patterns:** `task_fulfill`, `goods_acceptance`, `doApprove`

---

### Query Naming Convention

- **Format:** Get + Noun + Filter description
- **Casing:** PascalCase
- **Examples:** `GetTasksByStatus`, `GetInventoryLevelByVariant`, `GetPurchasesBySupplier`

---

### Service and Handler Naming Convention

| Layer | Convention | Example |
|-------|-----------|---------|
| Domain service | `{Domain}Service` | `InventoryService`, `TaskService` |
| Event handler | `handle{EventName}` | `handleTaskFulfilled`, `handleLowStockDetected` |
| Command handler | `{CommandName}Handler` | `FulfillTaskHandler` |
| Query handler | `{QueryName}Handler` | `GetTasksByStatusHandler` |

---

### File and Module Organization Convention

```
src/lib/{domain}/
  {domain}-service.ts       ← Domain service (mutations, business rules)
  {domain}-queries.ts       ← Read queries (no mutations)
  {domain}-events.ts        ← Event type definitions
  {domain}-policies.ts      ← Configurable policy rules
  {domain}-workflow.ts      ← State machine (for workflow domains)
```

---

### Prohibited Language

The following terms should not appear in new code, documentation, or events because they are ambiguous or have been superseded by canonical names:

| Prohibited | Use instead |
|-----------|-------------|
| `void` (as a status word) | VOIDED |
| `delete` (for business records) | Archive, Cancel, or Void as appropriate |
| `update` (as a business concept) | The specific action: Approve, Fulfill, Adjust, etc. |
| `stock` (as a standalone identifier) | Inventory or Inventory Batch |
| `order` (in procurement context) | Purchase Order |
| `order` (in sales context) | Sales Order or Customer Order |
| `receipt` (alone) | Goods Receipt or Payment Receipt (disambiguate) |
| `complete` (as a task status) | FULFILLED (task is done but not yet reviewed) or REVIEWED (locked) |
| `close` (for tasks) | REVIEWED |
| `reject` (for tasks) | CANCEL with reason |


---

## Part 12 — Domain Contracts

These are the conceptual contracts that every implementation of these domains must satisfy. They describe behavior, not structure.

---

### Inventory Contract

```
Contract: InventoryDomain

MUST:
  - Be the only writer of inventory batch quantities
  - Create an Inventory Movement for every mutation
  - Link every mutation to an authorizing source (event or ID)
  - Emit LowStockDetected when a batch falls to or below its reorder point
  - Prevent quantity from dropping below zero on authorized operations
  - Apply batch cost at creation time; never modify batch cost after creation
  - Enforce FIFO (or configured consumption policy) when consuming across batches

MUST NOT:
  - Create tasks
  - Send notifications
  - Approve its own adjustments
  - Accept mutations without an authorizing source
  - Allow any other domain to write to inventory batches directly

GUARANTEES:
  - Every inventory batch traces to a GoodsAccepted event
  - Every inventory change has a corresponding Inventory Movement record
  - The movement history is complete and immutable
```

---

### Task Contract

```
Contract: TaskDomain

MUST:
  - Maintain the official task state machine as defined in the canonical state machines
  - Record three distinct quantities: suggestedQty, approvedQty, verifiedQty
  - Enforce role-based and identity-based transition guards at the service layer (not UI only)
  - Produce TaskFulfilled with verifiedQty as the authoritative outcome quantity
  - Reject edits and deletes on tasks in FULFILLED, REVIEWED, or CANCELLED states
  - Create tasks in response to LowStockDetected and ShiftOpened events per configured policy
  - Record full accountability chain: creator, approver, clerk, reviewer, canceler

MUST NOT:
  - Mutate inventory directly
  - Approve its own tasks
  - Allow status transitions that are not defined in the canonical state machine
  - Allow modification of REVIEWED tasks

GUARANTEES:
  - Every task that affects inventory has an approved quantity before execution begins
  - Every task fulfillment carries the verified quantity
  - The task record is immutable after REVIEWED
```

---

### Procurement Contract

```
Contract: ProcurementDomain

MUST:
  - Require an approval decision before a Purchase Order may be created
  - Track the received/outstanding status of each PO line item
  - Produce PurchaseVoided to authorize inventory reversal
  - Generate structured, human-readable Purchase Order IDs
  - Link Purchase Orders to their originating Purchase Requests

MUST NOT:
  - Credit inventory directly
  - Approve its own purchase requests
  - Close a PO with unresolved outstanding items

GUARANTEES:
  - Every Purchase Order has a traceable authorization source
  - A voided purchase always triggers inventory reversal
  - PO IDs are unique within a branch for a given period
```

---

### Receiving Contract

```
Contract: ReceivingDomain

MUST:
  - Require a Purchase Order reference before a GRN can be created
  - Record accepted and rejected quantities per line item
  - Produce GoodsAccepted (or GoodsPartiallyAccepted) to authorize inventory credit
  - Prevent acceptance of quantities exceeding ordered quantities beyond tolerance

MUST NOT:
  - Credit inventory directly
  - Create Purchase Orders
  - Accept goods for a CLOSED Purchase Order

GUARANTEES:
  - Inventory is only credited for quantities confirmed in a GRN
  - Every GRN traces to a Purchase Order
```

---

### Notification Contract

```
Contract: NotificationDomain

MUST:
  - Consume business events from all domains
  - Resolve recipients by role and/or explicit assignment
  - Deliver notification records to resolved recipients
  - Track read state per recipient
  - Archive notifications after the configured retention period

MUST NOT:
  - Create any business record (tasks, inventory mutations, purchases, etc.)
  - Make approval decisions
  - Change business state in any domain
  - Hold business logic for what action should follow a notification

GUARANTEES:
  - Every notification traces to a business event
  - Notification delivery failure does not invalidate the triggering business event
  - Notification recipients are resolved by rule, not hardcoded per call site
```

---

### Approval Contract

```
Contract: ApprovalDomain

MUST:
  - Accept approval requests from any domain
  - Enforce that the approver is not the requester
  - Record every decision (approved, rejected, escalated) immutably
  - Route to the correct approver based on configured authorization rules
  - Support escalation on unactioned requests

MUST NOT:
  - Execute the action being approved
  - Approve requests without an identified approver
  - Modify approval records after they are created

GUARANTEES:
  - Every approval decision is permanently recorded with approver identity and timestamp
  - No approval request is automatically approved without an explicit authorization decision (auto-approval is a configured decision, not a silent bypass)
```

---

### Business Event Contract

```
Contract: BusinessEvents

Every event MUST:
  - Be named in past tense (PascalCase)
  - Be produced by exactly one domain
  - Carry a minimum payload sufficient for all known consumers to react
  - Include: eventId, producedAt, producedBy (domain), branchId, businessId
  - Be immutable after production

Every event MUST NOT:
  - Be retracted or modified
  - Be produced by a domain that did not own the underlying fact
  - Contain implementation details (collection names, database IDs only if stable)
  - Cause side effects within the producing domain
    (side effects belong to consuming domains)
```

---

### Workflow Contract

```
Contract: DomainWorkflows

Every state machine MUST:
  - Define all valid states
  - Define all valid transitions between states
  - Define the role/identity requirements for each transition
  - Define which states are terminal
  - Define which states permit mutation of the record

MUST NOT:
  - Allow transitions that are not defined in the canonical state machine
  - Allow business logic to bypass state machine enforcement
  - Have state transitions owned by UI components (state machines belong to domain services)
```


---

## Part 13 — Validation Checklist

This checklist is used in pull request reviews, architecture reviews, and new feature discussions. Every item should be answerable with "Yes," "No," or "N/A." A "No" without documented justification is a blocker.

---

### Domain Boundary Checks

- [ ] **Does this feature introduce a new business concept?**
  If yes: Is it defined in the Ubiquitous Language (Part 1)? Is it added before implementation begins?

- [ ] **Does this feature assign responsibility to a new domain?**
  If yes: Is that domain's contract updated to reflect the new responsibility?

- [ ] **Does this feature move responsibility between domains?**
  If yes: Is both the current owner and the new owner updated in the Ownership Matrix (Part 5)?

- [ ] **Does any domain in this feature write to another domain's collection or model directly?**
  If yes: This is a direct coupling violation. The side effect must be refactored to an event-driven reaction.

- [ ] **Does the Notification context create any business record as part of this feature?**
  If yes: This is a Policy P-NOTIF-01 violation. The business logic must move to the correct domain.

- [ ] **Does the Reporting context write any business record?**
  If yes: This is an INV-11 violation.

---

### Business Invariant Checks

- [ ] **Does this feature increase inventory without a GoodsAccepted event?**
  If yes: INV-01 violation. No path may create inventory outside of the Receiving domain.

- [ ] **Does this feature mutate inventory without creating an Inventory Movement?**
  If yes: INV-02 violation. Every mutation must have a movement record.

- [ ] **Could this feature produce negative inventory quantities?**
  If yes: INV-03 violation. Insufficient stock must be flagged, not silently allowed.

- [ ] **Does this feature apply a stock count adjustment without prior reviewer confirmation?**
  If yes: INV-04 violation.

- [ ] **Does this feature modify batch cost price after the batch is created?**
  If yes: INV-05 violation.

- [ ] **Does a Task in this feature mutate inventory directly?**
  If yes: INV-06 violation.

- [ ] **Does this feature allow any state transition not defined in the canonical state machines (Part 8)?**
  If yes: Workflow contract violation.

- [ ] **Does this feature allow editing or deleting a REVIEWED, FULFILLED (in audit context), or CLOSED record?**
  If yes: INV-09 violation.

- [ ] **Does a notification in this feature change business state?**
  If yes: INV-10 violation.

---

### Event Checks

- [ ] **Does this feature produce a new business event?**
  If yes: Is it defined in the Business Events Catalogue (Part 3)? Is it named in past tense? Does it carry the required payload?

- [ ] **Is the event produced by the correct domain (the domain where the business fact occurred)?**
  If no: Wrong producer — event ownership violation.

- [ ] **Are all consumers of this event identified?**
  If no: Document the consumers before merging.

- [ ] **Does this feature introduce a side effect that is owned by the producing domain rather than a consuming domain?**
  If yes: The side effect must be moved to the consumer.

---

### Vocabulary Checks

- [ ] **Does this feature use any prohibited synonyms from Part 11?**
  If yes: Replace with canonical names before merging.

- [ ] **Are new status values consistent with the canonical state machine values (Part 8)?**
  If no: Align with canonical names.

- [ ] **Are new event names in PascalCase past tense?**
  If no: Rename to conform.

- [ ] **Are new command names in PascalCase imperative?**
  If no: Rename to conform.

---

### Ownership Checks

- [ ] **Is there exactly one owner for every new business decision introduced by this feature?**
  If no: Resolve ownership before merging.

- [ ] **Does this feature respect the dependency direction (inner layers never depend on outer layers)?**
  If no: Restructure the dependency.

- [ ] **Is authorization enforced at the service layer, not only at the UI layer?**
  If no: Add server-side enforcement.

---

### Approval Checks

- [ ] **Does any domain in this feature approve its own actions?**
  If yes: P-APPR-01 violation.

- [ ] **Does any approval in this feature silently bypass the authorization decision?**
  If yes: Auto-approval must be explicit policy, not silence.

---

### Extension Checks

- [ ] **Does this new capability extend an existing domain concept (as described in Part 10)?**
  If no: Review whether a genuinely new concept is needed (add to Ubiquitous Language) or whether the design is creating a parallel model (which should be redesigned).

- [ ] **Can this new capability be accommodated by the existing canonical state machines, or does a state machine change require this checklist to be run again on the state machine itself?**


---

## Part 14 — Final Executive Summary

### The Complete Operational Domain Language

The operational domain is governed by eight primary contexts: Procurement, Receiving, Inventory, Task, Notification, Approval, Session, and Reporting. Each context has a precise, non-overlapping responsibility. The language connecting them is built on three pillars:

1. **Aggregates** — Purchase Order, Goods Receipt, Inventory Batch, Operational Task, Notification, Vendor Session. Each aggregate owns its own lifecycle and state machine.

2. **Business Events** — `GoodsAccepted`, `TaskFulfilled`, `LowStockDetected`, `PurchaseRequestApproved`, `ShiftClosed`, and all other past-tense domain facts. Events are the only permissible mechanism for cross-domain state change.

3. **Policies and Invariants** — the configurable rules (policies) and the absolute rules (invariants) that govern when and how each domain may act.

---

### The Most Important Architectural Contracts

**Contract 1: Inventory owns all inventory mutations.**
No other context writes to inventory. All contexts that need inventory to change produce events. The Inventory context reacts.

**Contract 2: Tasks produce TaskFulfilled — Inventory reacts.**
A task that involves moving stock produces `TaskFulfilled` with `verifiedQty`. The Inventory context handles the mutation. The Task context never calls `inventoryCollection.update()`.

**Contract 3: Notifications never create business records.**
The Notification context delivers messages. It does not create tasks, purchase requests, or any other domain record. The logic that creates records belongs to the domain that detected the condition.

**Contract 4: Goods are not available before acceptance.**
The `GoodsAccepted` event from the Receiving context is the only mechanism by which inventory increases from a supplier delivery. No other event, no other context, no other action credits inventory from a delivery.

**Contract 5: Authorization is enforced at the service layer.**
Role checks and identity checks are enforced in domain service functions, not only in UI components. A user who constructs a direct request must receive the same authorization rejection as a user who uses the UI.

---

### The Strongest Business Invariants

In priority order of business impact:

1. **INV-01** — Inventory credit only on GoodsAccepted. (Revenue and cost integrity)
2. **INV-02** — Every mutation has a movement record. (Audit trail completeness)
3. **INV-05** — Batch cost fixed at receipt. (FIFO and financial accuracy)
4. **INV-09** — Reviewed tasks are immutable. (Audit trail integrity)
5. **INV-13** — Variances documented, not silently corrected. (Accountability)
6. **INV-06** — Tasks never own inventory. (Domain separation)
7. **INV-10** — Notifications never change business state. (Domain integrity)

---

### The Most Critical Ownership Rules

| Decision | Owner | Why It Must Be This Owner |
|----------|-------|--------------------------|
| Inventory mutations | Inventory context | Single writer prevents rule fragmentation |
| Task authorization | Approval context (via service layer) | Self-approval is a control failure |
| Goods acceptance | Receiving context | Only physical receipt authorizes credit |
| Notification delivery | Notification context | Recipient rules must be centralized |
| Business event publication | The domain where the fact occurred | Events are facts — only the fact-owner may assert them |

---

### The Event Philosophy

Events are the foundational communication mechanism of this domain. The philosophy is:

**"Something happened. Here is the fact. React if you care."**

- Events are not commands. They do not instruct; they inform.
- Events are not notifications. They are machine-readable facts, not human-readable messages.
- Events do not return results. They are fire-and-observe.
- Events are immutable. Once produced, they are history.
- Events are owned by their producer. No other domain speaks on behalf of another.

The practical consequence: every cross-domain side effect in the current system that is implemented as a direct function call (Task UI calling `inventoryCollection.update()`, `NotificationEngine` calling `operationalTaskCollection.insert()`) is a violation of this philosophy and a target for migration.

---

### The Long-Term Architectural Vision

A mature version of this system has:

- **One Inventory Service** — the sole gateway to all inventory state. Every inventory mutation flows through it. No other code path exists.
- **One Task Service** — enforces the canonical state machine server-side. Emits correctly named events. Never touches inventory.
- **One Notification Service** — subscribes to all domain events. Resolves recipients by rule. Delivers messages. Creates nothing else.
- **One Procurement Service** — owns the purchase lifecycle from DRAFT to CLOSED. Requires authorization at the service layer.
- **One Receiving Service** — owns the GRN lifecycle. Is the gateway between supplier deliveries and inventory credit.
- **Named TypeScript event types** — every business event is a typed object, not an anonymous function call. Event contracts are compile-time verifiable.
- **Zero business logic in UI components** — the UI presents state and captures intent. Every mutation flows through a service function.
- **Zero direct cross-domain collection writes** — every domain mutation is owned by its domain's service.

This vision does not require a rewrite. It is reached incrementally through the phases defined in Phase 3. Each phase moves one or more violations into compliance with this document.

---

### Concepts Requiring Further Discovery Before Implementation

The following concepts are referenced in this document but require additional business clarification before their implementation can be specified:

| Concept | Open Questions |
|---------|---------------|
| **Authorization Limits** | What are the exact thresholds? By role? By purchase type? Is this a fixed config or a dynamic setting per business? |
| **Escalation Rules** | After how many hours does an unacknowledged approval escalate? Who is the escalation target for each role level? |
| **Auto-Approval Policy** | Which task types and purchase values are auto-approved? Is this business-type-specific (restaurant vs. grocery)? |
| **FEFO / LIFO Policy** | Is consumption policy configurable per product, per category, or per business type? |
| **Notification Retention Period** | How long should notifications be retained before archival? Is this configurable per business? |
| **Transfer Acknowledgement** | For branch transfers, is the receiving-branch acknowledgement a formal receiving step (new GRN-like record) or a simple confirmation? |
| **Partial Acceptance Tolerance** | What percentage discrepancy between ordered and received quantities is acceptable before triggering a dispute? |
| **StocktakeSession** | Is a full stocktake a first-class domain concept (needs its own lifecycle) or just a grouping of individual STOCK_COUNT tasks? |
| **Purchase Request vs. Quick Receive** | Is the policy for auto-approving small purchases configurable per branch, per business type, or global? What is the default threshold? |

These questions are not implementation decisions — they are business decisions. They must be answered before the corresponding features in Phase D and Phase E of the evolution roadmap are implemented.

---

*End of Operational Domain Contracts & Ubiquitous Language*
*Phase 4 — Constitutional Reference*

*This document is the single source of truth for the operational domain.*
*All future implementation, code review, architectural discussion, and testing strategy*
*should reference this document as the authoritative standard.*

*Version 1.0 — July 30, 2026*
*Authors: Architecture Team (Phase 1–3 findings), DDD consultation (Phase 4 formalization)*
