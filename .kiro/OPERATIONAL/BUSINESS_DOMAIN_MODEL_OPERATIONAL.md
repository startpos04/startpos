# Business Domain Model — Operational Domain
## Phase 2 — Business Domain Discovery

> **Mode:** Domain-Driven Design consultation. Business model only.
> **Perspective:** Store owner, warehouse staff, purchasing staff, branch manager, cashier, operations manager.
> **Constraint:** No implementation references. No databases, APIs, or frameworks. Business concepts only.
> **Date:** July 30, 2026

---

## Table of Contents

1. [Business Vocabulary](#part-1--business-vocabulary)
2. [Domain Boundaries](#part-2--domain-boundaries)
3. [Operational Lifecycle](#part-3--operational-lifecycle)
4. [Human Workflow](#part-4--human-workflow)
5. [Operational Events](#part-5--operational-events)
6. [Ownership Matrix](#part-6--ownership-matrix)
7. [Future Growth](#part-7--future-growth)
8. [Business Invariants](#part-8--business-invariants)
9. [Natural Aggregates](#part-9--natural-aggregates)
10. [Executive Summary](#part-10--executive-summary)

---

## Part 1 — Business Vocabulary

Retail operations accumulate jargon that different people use differently. This section establishes a precise shared language for the operational domain.

---

### Procurement Vocabulary

**Purchase Request (PR)**
A formal expression of need. Someone inside the business — a store clerk, warehouse staff, or manager — identifies that a product is running low or will be needed and raises a request to buy it. A Purchase Request is an internal document. It has not yet involved a supplier. It is a question: *"Can we buy this?"*

**Purchase Order (PO)**
A formal commitment to a supplier. Once a Purchase Request is approved, the business creates a Purchase Order and sends it to a supplier. A Purchase Order is an external document. It is a promise: *"We will buy this, at this price, in this quantity."* A PO can be partially fulfilled — a supplier may deliver some items now and the rest later.

**Delivery / Supplier Delivery**
The physical arrival of goods at the business premises from a supplier. A delivery may correspond to one Purchase Order or to multiple partial shipments. The delivery is a physical event, not yet a business record until it is inspected.

**Goods Receipt Note (GRN) / Receiving Report**
The formal acknowledgment that goods arrived. A staff member physically counts and compares what arrived against what was ordered. The GRN records: what arrived, in what quantity, in what condition, and when. The GRN is the bridge between the supplier's delivery and the business's inventory. Critically: goods are not yet available for sale until the GRN is accepted.

**Receiving**
The complete activity of accepting a supplier delivery — unloading, counting, inspecting, and recording. Receiving is a process, not a single action. It has distinct stages: arrive → inspect → accept or reject → record.

**Invoice Matching (Three-Way Match)**
In a mature operation, before a supplier is paid, the business matches three documents: the Purchase Order (what was ordered), the Goods Receipt Note (what was received), and the Supplier Invoice (what the supplier is charging). Discrepancies trigger a dispute or hold. This is common in mid-size retail but often omitted in small businesses.

---

### Inventory Vocabulary

**Inventory**
The total quantity of a product currently owned by the business, available or reserved, across all locations. Inventory is a balance — it increases when goods arrive and are accepted, and decreases when goods are sold, transferred out, wasted, or written off.

**Stock**
Often used interchangeably with inventory, but more precisely refers to goods physically present at a specific location at a specific moment. A business has inventory; a shelf has stock.

**Batch**
A specific group of units of a product received together, typically from a single supplier delivery on a single date, often sharing an expiry date and a cost price. Batch tracking matters for FIFO costing, expiry management, and traceability.

**Location**
A physical place where inventory is stored — a warehouse shelf, a backroom, a display rack, a freezer, a branch location. Location management allows a business to know not just *how much* it has but *where* it is.

**Stock Level**
The current quantity of a product at a location or across all locations. A stock level is a derived number — the result of all movements in and out.

**Reorder Point**
The stock level at which the business should initiate a new purchase. When stock falls to or below the reorder point, a Purchase Request should be raised automatically or manually. Often confused with the safety stock level, which is the minimum buffer below which the business should never fall.

**Stock Movement**
Any event that changes the quantity of inventory. Every movement has a reason — sale, purchase receipt, transfer, waste, adjustment. Every movement must be traceable to a business event. Movements are facts of history — they cannot be deleted or modified.

**Adjustment**
A correction to inventory quantity that is not the result of a sale, purchase, or transfer. Adjustments are used to reconcile the recorded stock against the physically counted stock. Every adjustment requires a reason — otherwise the business has no way to investigate discrepancies later.

**Transfer**
The movement of inventory from one location to another. Transfers are not sales and are not losses — they are internal movements. A transfer always has a source location and a destination location. It also has an initiating reason (e.g., shelf refill, branch supply).

**Reservation**
A quantity of inventory that has been committed to a specific purpose but not yet removed from stock. For example, inventory reserved for a pending customer order is no longer available for other sales, but it hasn't physically left the premises yet.

**Write-Off**
The formal removal of inventory from the books due to damage, expiry, theft, or loss. A write-off is a loss event. It reduces inventory and increases the cost of operations. It must be authorized.

---

### Task Vocabulary

**Operational Task**
A defined unit of work assigned to a specific person, with a clear expected outcome, that can be tracked from creation to completion. Operational tasks are the mechanism by which management communicates work that needs to happen to staff who execute it.

**Assignment**
The act of designating a specific person as responsible for executing a task. An unassigned task exists but no one is accountable for it yet.

**Work Order**
A more formal term for a task used in warehouse and manufacturing contexts. A work order authorizes a specific person to perform a specific operation — often with resource implications (take 10 units from shelf A and move them to shelf B).

**Chore**
An informal, recurring operational task with no inventory or financial implications — cleaning, maintenance, equipment check. Chores are tasks but they do not produce business records beyond their own completion.

---

### Approval Vocabulary

**Approval**
A formal authorization by an authorized person that a proposed action may proceed. Approvals exist to protect the business from unauthorized spending, unauthorized inventory changes, and process errors. An approval is not a formality — it is an acceptance of accountability.

**Approver**
The person whose explicit authorization is required before an action can proceed. The approver is accountable for what happens after they approve.

**Authorization Limit**
A constraint that defines the maximum value or scope of what a person can approve without escalation. A cashier can approve a task worth ₱500 in inventory movement but not one worth ₱50,000. Authorization limits are a governance mechanism.

**Rejection**
A decision by an approver that a proposed action should not proceed, along with a reason. A rejection is not a cancellation — it is feedback that something needs to change before resubmission.

---

### Notification Vocabulary

**Notification**
A message from the system to a person, informing them of something that happened that may require their attention or action. A notification is informational. It never makes a decision. It never changes business state by itself.

**Alert**
An urgent notification that signals a condition requiring immediate attention — low stock, system failure, cash discrepancy. Alerts are time-sensitive.

**Reminder**
A notification that a deadline or scheduled action is approaching. Reminders are preemptive — they fire before a problem occurs.

**Escalation**
The routing of a notification to a higher authority when a task or event has not been acted upon within an expected time window. Escalations exist to prevent bottlenecks caused by non-responsive approvers or staff.

---

### Session / Financial Vocabulary

**Shift**
A defined period during which a cashier or vendor operates a point-of-sale station. A shift has a start time and an end time. It has an opening cash float and a closing cash count.

**Cash Reconciliation**
The process of comparing the expected cash in the drawer (opening float + total cash sales) against the actual cash physically counted at the end of a shift. Discrepancies are variances that must be explained.

**Variance**
The difference between expected and actual cash at shift close. A variance can be a shortage (less cash than expected) or an overage (more cash than expected). Both require documentation and review.


---

## Part 2 — Domain Boundaries

Each domain in a well-run business has a clear area of responsibility. When domains take on work that belongs to another, the organization becomes fragile — changes in one area break things in another, and accountability becomes unclear.

---

### Procurement Domain

**Responsibilities:**
- Identifying what needs to be purchased and why
- Managing relationships with suppliers (contact, pricing history, lead time)
- Creating and tracking Purchase Requests
- Creating Purchase Orders against approved requests
- Tracking the status of outstanding orders with suppliers
- Managing the three-way match (PO → GRN → Invoice) when applicable
- Closing Purchase Orders when fully received or cancelled
- Maintaining the purchase history and expenditure records

**Not responsible for:**
- Deciding that inventory is too low (that is an Inventory signal)
- Physically receiving and counting goods (that is Receiving)
- Moving received goods to storage locations (that is Stock Movement)
- Approving the purchase (that is Approval)
- Notifying people about purchase status (that is Notification)

**Inputs:**
- Purchase Request from any operational actor
- Supplier catalogue and pricing (if maintained)
- Approval decision from Approval domain

**Outputs:**
- Purchase Order sent to supplier
- Purchase record for financial history
- Signal to Receiving: "we expect a delivery against PO-001"

**Dependencies:**
- Approval domain (cannot proceed to a PO without authorization)
- Supplier registry (needs supplier contact and pricing reference)
- Receiving domain (needs to know when goods actually arrived)

---

### Receiving Domain

**Responsibilities:**
- Recording the physical arrival of goods at the premises
- Comparing what arrived against what was ordered (PO matching)
- Coordinating inspection of received goods
- Recording the Goods Receipt Note — quantity accepted, quantity rejected, condition notes
- Passing accepted quantities to Inventory for availability
- Flagging discrepancies back to Procurement (short delivery, wrong items, damaged goods)
- Holding rejected goods until resolution

**Not responsible for:**
- Deciding whether to buy (that is Procurement)
- Approving the purchase (that is Approval)
- Storing inventory after acceptance (that is Inventory / Stock Movement)
- Paying the supplier (that is Finance/Accounting, outside this scope)

**Inputs:**
- Expected delivery from Procurement ("PO-001 should arrive")
- Physical delivery from supplier
- Inspection result from the receiving staff

**Outputs:**
- Goods Receipt Note (what was actually accepted)
- Rejection record for unaccepted items
- Inventory increase signal for accepted quantities
- Discrepancy report back to Procurement

**Dependencies:**
- Procurement domain (to know what was expected)
- Inventory domain (to credit accepted stock)
- Inspection process (quality check before acceptance)

---

### Inventory Domain

**Responsibilities:**
- Maintaining the authoritative record of quantities on hand, per product, per location, per batch
- Recording every movement in and out with full traceability
- Calculating stock levels as a derived result of all movements
- Enforcing batch-level tracking (cost price, expiry date, provenance)
- Providing stock level information to other domains (Procurement, Task, Reporting)
- Detecting when stock has fallen to or below the reorder point

**Not responsible for:**
- Deciding what to buy when stock is low (that is Procurement)
- Creating tasks when stock is low (that is Task)
- Sending notifications when stock is low (that is Notification)
- Approving inventory adjustments (that is Approval)
- Physically moving goods (that is operational staff, tracked via Stock Movement records)

**Inputs:**
- Accepted GRN from Receiving (increases inventory)
- Sale completion from POS (decreases inventory)
- Task completion from Task domain (transfers, adjustments, write-offs)
- Manual adjustment with reason and authorization

**Outputs:**
- Current stock levels (consumed by Reporting, Procurement, Task)
- Low stock signals (consumed by Notification)
- Movement history (consumed by Reporting, Audit)
- Cost of goods data (consumed by financial reports)

**Dependencies:**
- Receiving domain (source of inventory additions from suppliers)
- Task domain (source of internal inventory movements)
- POS/Sales domain (source of inventory depletions from sales)
- Approval domain (for authorizing adjustments and write-offs)

---

### Task Domain

**Responsibilities:**
- Representing a defined unit of physical work to be done
- Capturing what work needs to happen, who should do it, and when
- Tracking the lifecycle of work from assignment to completion
- Recording the outcome of the work (what was actually done)
- Enforcing that work is authorized before execution
- Providing the authorization record for any inventory movements it triggers

**Not responsible for:**
- Performing the inventory mutation directly (Inventory domain owns mutations)
- Deciding what work is needed (that comes from a business signal — low stock, schedule, manager discretion)
- Approving itself (that is Approval)
- Sending notifications about its own status (that is Notification)
- Knowing the cost implications of the work (that is Inventory/Costing)

**Inputs:**
- Work request from any operational actor or automated signal
- Approval decision from Approval domain
- Completion report from the executing staff member

**Outputs:**
- Authorized work instruction (the approved task)
- Completion record (what was done, by whom, when)
- Signal to Inventory: "please apply this movement, authorized by task T-001"

**Dependencies:**
- Approval domain (tasks above a certain scope require authorization)
- Inventory domain (tasks that involve stock must reference inventory)
- Employee domain (tasks must be assigned to real people)
- Notification domain (status changes may trigger notifications)


---

### Notification Domain

**Responsibilities:**
- Delivering information about business events to the people who need to know
- Routing notifications to the right people based on role, assignment, and event type
- Tracking whether a notification has been read
- Managing notification priority and urgency
- Scheduling reminders and escalations when action has not been taken

**Not responsible for:**
- Deciding that a business event is significant (that is the producing domain)
- Taking any action as a result of a notification (people take actions, not notifications)
- Changing business state (a notification that creates a task is a design error — the business logic that creates the task belongs to the domain that detected the condition)
- Knowing the details of business rules (it receives events and delivers them)

**Inputs:**
- Business events from all domains (PurchaseApproved, TaskAssigned, LowStockDetected, ShiftClosed, etc.)
- Recipient resolution rules (who should receive this type of notification)

**Outputs:**
- Delivered notification to targeted recipient(s)
- Read/unread state
- Escalation if unacknowledged within a defined window

**Dependencies:**
- Employee domain (to resolve recipient identity)
- All producing domains (as event sources)

---

### Approval Domain

**Responsibilities:**
- Representing the authorization decision for a proposed business action
- Enforcing who is allowed to approve what type of action at what scope
- Recording who approved, when, and any conditions attached
- Routing requests to the correct approver based on type, value, and organizational rules
- Handling rejection with a stated reason
- Supporting escalation when an approval request goes unanswered

**Not responsible for:**
- Deciding the business rules that require approval (those are defined per domain)
- Executing the action being approved (the originating domain does that)
- Tracking what happened after approval (the executing domain does that)

**Inputs:**
- Approval request from any domain (purchase, task, adjustment, write-off)
- Organizational rules (who can approve what)

**Outputs:**
- Approval decision (approved, rejected, escalated)
- Audit record of the decision

**Dependencies:**
- Employee domain (to identify approvers and their authorization limits)
- Notification domain (to inform approvers that a request awaits them)

---

### Reporting Domain

**Responsibilities:**
- Providing visibility into the current and historical state of the business
- Aggregating data from multiple domains into meaningful summaries
- Supporting business decisions with accurate, timely information

**Not responsible for:**
- Creating or changing business records (pure read domain)
- Enforcing business rules
- Sending notifications

**Inputs:**
- All domain records (inventory, purchases, tasks, sales, sessions, movements)

**Outputs:**
- Stock level reports, movement history, cost analysis, sales performance, task completion rates, variance reports

---

### Employee Domain

**Responsibilities:**
- Maintaining the registry of staff members, their roles, and their branch assignments
- Defining what each role is authorized to do
- Managing active/inactive state of employees

**Not responsible for:**
- Assigning tasks (that is a management decision in the Task domain)
- Approving purchases (that is the Approval domain's decision tree)
- Sending notifications (that is Notification)

---

## Part 3 — Operational Lifecycle

### 3.1 Purchase Lifecycle

A Purchase in a real business moves through distinct stages. Collapsing these into a single event ("we bought something") loses critical operational control.

```
IDENTIFIED NEED
  │
  ▼
PURCHASE REQUEST RAISED
  │  Anyone can raise a PR — clerk notices low stock, manager plans ahead, system signals reorder point
  │
  ▼
PURCHASE REQUEST REVIEWED
  │  Manager reviews: Is this needed? Is the quantity right? Is the supplier appropriate?
  │  → Approved: becomes a Purchase Order
  │  → Rejected: returned with reason, requester may revise and resubmit
  │  → Modified: manager adjusts quantity or supplier before approving
  │
  ▼
PURCHASE ORDER CREATED
  │  Formal document sent to supplier. Contains: items, quantities, agreed unit prices, expected delivery date.
  │
  ▼
AWAITING DELIVERY
  │  The PO is open. The business is waiting for the supplier to deliver.
  │  The supplier may deliver partially — some items now, the rest later.
  │
  ▼
GOODS RECEIVED (Partial or Full)
  │  Physical delivery arrives. Receiving staff count and inspect.
  │  → Matches PO: proceed to acceptance
  │  → Discrepancy found: record variance, flag to procurement, hold or accept conditionally
  │
  ▼
GOODS INSPECTION
  │  Quality check: are the goods in acceptable condition? Correct specifications?
  │  → Passed: accept into inventory
  │  → Failed: reject lot, return to supplier, raise dispute
  │
  ▼
GOODS ACCEPTED (Goods Receipt Note confirmed)
  │  Inventory increases. The business now owns this stock.
  │
  ▼
PURCHASE ORDER CLOSED
  │  All expected items have been received (or outstanding items formally resolved — partial acceptance, cancellation of remainder)
  │
  ▼
INVOICE MATCHED (if applicable)
     Supplier invoice matched against PO and GRN. Payment authorized.
```

**Key insight:** The current implementation collapses stages 3 through 9 into a single creation event. Purchase creation is equivalent to the business saying "the goods are already received and accepted." This is accurate for a simple cash-and-carry operation but becomes inadequate as soon as the business has any supplier lead time, partial deliveries, or quality concerns.


---

### 3.2 Task Lifecycle

An Operational Task models a physical unit of work. It should reflect the full real-world lifecycle of that work.

```
WORK NEED IDENTIFIED
  │  Source: manager observation, low stock signal, schedule, policy, customer request
  │
  ▼
TASK DRAFTED
  │  The requester captures: what needs to happen, what resources are involved, by when.
  │  A draft exists but is not yet visible to management queues.
  │  The requester may refine the draft before submitting.
  │
  ▼
TASK SUBMITTED FOR APPROVAL
  │  The requester formally requests authorization.
  │  For routine low-value tasks (general chores), this step may be skipped by policy.
  │
  ▼
TASK REVIEWED BY APPROVER
  │  → Approved: task is authorized for execution; assigned to specific clerk
  │  → Rejected: returned with reason; requester may revise
  │  → Modified: approver adjusts scope (quantity, location) before authorizing
  │
  ▼
TASK ASSIGNED
  │  A specific person is designated as responsible for executing the task.
  │  Assignment may happen at approval or be delegated to a team lead after approval.
  │  The assigned person is notified.
  │
  ▼
TASK ACCEPTED / ACKNOWLEDGED
  │  The assignee acknowledges the task and commits to it.
  │  In many operations this step is implicit — acceptance happens when the person starts.
  │
  ▼
TASK IN PROGRESS
  │  The assignee is physically executing the work.
  │  For inventory-bearing tasks: they are physically moving, counting, or disposing of goods.
  │
  ▼
TASK FULFILLED (Work completed, outcome recorded)
  │  The assignee records what was actually done:
  │  - Actual quantity moved (may differ from suggested quantity)
  │  - Actual location used
  │  - Observations or discrepancies
  │  Inventory is updated at this point — only after the work is recorded, not before.
  │
  ▼
TASK REVIEWED (Post-completion audit)
  │  A supervisor verifies the outcome:
  │  - Was the inventory movement recorded accurately?
  │  - Is the physical count consistent with the record?
  │  → Verified: task is locked; record is final
  │  → Discrepancy found: supervisor may trigger a correction task
  │
  ▼
TASK CLOSED / LOCKED
     Terminal state. The record is the permanent historical reference.
```

**Key insight:** The difference between the suggested quantity (what management thought was needed), the approved quantity (what management authorized), and the verified quantity (what was actually done and confirmed) is critical for operational accuracy. A SHELF_REFILL that was supposed to move 50 units but only 30 were physically available should record 30, not 50. These three quantities serve different business purposes.

---

### 3.3 Inventory Lifecycle

Inventory does not appear — it arrives through a chain of verified events.

```
GOODS ACCEPTED (from Receiving)
  │
  ▼
STOCK AVAILABLE (quantified, located, costed per batch)
  │  The business can now sell, transfer, or use this stock.
  │  Stock is available at a specific location with a known cost price and (if applicable) expiry date.
  │
  ▼
STOCK IN USE
  │  Ongoing state: sales deduct stock, transfers move stock, tasks consume or relocate stock.
  │  Every change is a movement with a business reason.
  │
  ├── Sale → OUT movement (linked to transaction)
  ├── Transfer → OUT from source, IN to destination (linked to task)
  ├── Shelf Refill → OUT from backroom, IN to display (linked to task)
  ├── Waste/Write-off → OUT with waste reason (linked to task or adjustment)
  ├── Stock Count → ADJUSTMENT (linked to count task)
  │
  ▼
STOCK BELOW REORDER POINT
  │  The system detects the balance has crossed the threshold.
  │  This is a signal — not an action. The action (Purchase Request) is a separate business decision.
  │
  ▼
STOCK REPLENISHED (cycle repeats from Receiving)
```

**Key insight:** Inventory is never created or destroyed arbitrarily. Every change traces to a business event: a delivery, a sale, an authorized task, an authorized adjustment. Inventory that cannot be traced to a business event is an operational failure.

---

### 3.4 Notification Lifecycle

Notifications are produced by business events and consumed by people. They should not produce further business events.

```
BUSINESS EVENT OCCURS
  │  (PurchaseApproved, LowStockDetected, TaskAssigned, ShiftClosed, etc.)
  │
  ▼
NOTIFICATION CREATED
  │  The event producer informs the Notification domain.
  │  The Notification domain resolves: who needs to know? at what priority?
  │
  ▼
NOTIFICATION DELIVERED
  │  The notification reaches the intended recipient(s).
  │  Delivery channel: in-app, push, email — depends on urgency and preference.
  │
  ▼
NOTIFICATION READ / ACKNOWLEDGED
  │  The recipient has seen the notification.
  │  For action-required notifications: a reminder fires if unread after a defined window.
  │
  ▼
ACTION TAKEN (optionally)
  │  The person may click through to the relevant record and act.
  │  The action is taken in the relevant domain — not the notification domain.
  │
  ▼
NOTIFICATION ARCHIVED / EXPIRED
     After a defined retention period, notifications are archived.
     Completed or stale notifications do not clutter the active feed.
```

---

### 3.5 Approval Lifecycle

```
APPROVAL REQUEST RAISED
  │  A domain action requires authorization. A request is sent to the designated approver.
  │
  ▼
APPROVER NOTIFIED
  │  The approver receives a notification: "Action X requires your authorization."
  │
  ▼
APPROVER REVIEWS
  │  The approver examines the request: what is being asked, by whom, for what reason.
  │
  ├── APPROVED
  │     The action is authorized. The originating domain proceeds.
  │     Approval is recorded with timestamp and approver identity.
  │
  ├── REJECTED
  │     The action is denied. The reason is recorded.
  │     The requester is notified. They may revise and resubmit.
  │
  └── ESCALATED
        The approver cannot or will not decide. The request goes to a higher authority.
        Escalation may also fire automatically if the approval request is ignored for too long.
```


---

## Part 4 — Human Workflow

### 4.1 Who Creates Purchases?

In a small retail operation, the store owner or branch manager typically creates purchases. In a growing business, the following people may raise Purchase Requests:

- **Warehouse staff** — they physically see that storage is running low
- **Cashier / front-of-house staff** — they notice that a product is selling out on the floor
- **Branch manager** — planning ahead for a promotion or seasonal demand
- **The system** — automatically when a product crosses its reorder point

Regardless of who raises the request, the Purchase Order that goes to the supplier requires authorization. The person who identifies the need is rarely the same person who has the authority to commit business funds.

### 4.2 Who Approves Purchases?

Authorization depends on the value and type of the purchase:

- **Low-value, routine purchases** (e.g., restocking a fast-moving product from an approved supplier) may be pre-authorized by policy — a supervisor can approve with a glance.
- **High-value or unusual purchases** require the branch manager or owner.
- **Emergency purchases** (urgent stockout) may have an expedited approval path — but the approval still happens, even if after the fact.

The approver is not just rubber-stamping — they are verifying: Is the price reasonable? Is this the right supplier? Is the quantity appropriate for current demand?

### 4.3 Who Receives Deliveries?

In a small store, this is often the owner or a senior staff member. In a warehouse operation:

- **Receiving clerk** — physically unloads and counts
- **Quality inspector** — checks condition and specification
- **Warehouse manager** — confirms the GRN is accurate and signs off

These may be the same person in a small business. But the functions are distinct. The person who counts the goods should ideally not be the same person who approves the purchase — this is a basic segregation of duties principle that prevents fraud.

### 4.4 Who Inspects Products?

- For general grocery or FMCG: a basic visual check and count is sufficient.
- For food products: expiry dates, condition of packaging, temperature compliance.
- For high-value items: serial number verification, damage inspection.

Inspection may result in partial acceptance (some items in good condition, others rejected) or full rejection.

### 4.5 Who Creates Tasks?

Tasks can be created by:

- **Management (branch manager, supervisor)** — assigning work to staff
- **Staff (clerk, warehouse)** — raising a task for something they need help with or cannot do alone
- **The system** — automatically when a business condition requires operational response (e.g., low stock triggers a shelf refill task)

The key distinction: the *identification* of work needed can come from anywhere. The *authorization* to act on that work must come from someone with authority.

### 4.6 Who Approves Tasks?

- **GENERAL_CHORE**: Usually no approval needed. The manager trusts the staff to handle routine work.
- **SHELF_REFILL, STOCK_COUNT**: Supervisor sign-off is best practice. The movement of physical inventory should be authorized.
- **WASTE_DISPOSAL**: Always requires management authorization. Writing off stock is a loss event.
- **BRANCH_TRANSFER**: Requires management authorization. Moving stock between locations has financial implications.
- **PURCHASE_REQUEST**: Requires management authorization. It initiates spending.

### 4.7 Who Completes Tasks?

The designated clerk — the person assigned to perform the physical work. In the absence of assignment, any eligible staff member of sufficient role may pick up the task.

The person who completes the task records the outcome: what was actually done, in what quantity, at what location. This is the business record that authorizes the subsequent inventory movement.

### 4.8 Who Verifies Task Completion?

A supervisor or manager, separate from the person who executed the task. The verifier confirms:
- The physical work was done as recorded
- The inventory quantities are consistent with what was claimed
- No discrepancies or unauthorized deviations occurred

### 4.9 Who Is Notified of What?

| Event | Recipient |
|-------|-----------|
| Low stock detected | Branch manager, supervisor |
| Purchase Request raised | Designated approver |
| Purchase approved | Requester |
| Purchase rejected | Requester (with reason) |
| Task assigned | Designated clerk |
| Task due date approaching | Assigned clerk |
| Task overdue | Supervisor, branch manager |
| Task completed | Supervisor (for review) |
| Task rejected | Requester |
| Goods received | Purchasing staff, branch manager |
| Shift closed with variance | Branch manager, supervisor |
| Inventory adjustment made | Branch manager |
| Write-off authorized | Branch manager, owner |

---

### 4.10 Realistic Scenarios

**Scenario A — Routine Shelf Refill (Small Grocery)**

1. Cashier notices the bottled water shelf is nearly empty during the morning shift.
2. Cashier raises a task: "Shelf Refill — Bottled Water — 24 units — from Backroom."
3. Supervisor glances at the task queue, approves it.
4. The next available stock clerk picks it up, takes 24 units from the backroom, stocks the shelf.
5. Clerk marks the task complete, records 24 units moved.
6. At end of day, supervisor reviews completed tasks in batch — verifies and locks.

**Scenario B — Emergency Purchase (Out of Stock Situation)**

1. Manager notices a fast-moving product ran out unexpectedly.
2. Manager raises a Purchase Request directly: 50 units from Supplier X, standard price.
3. Manager is also the approver — self-approves (common in small business).
4. Calls supplier, orders are placed verbally — Purchase Order is recorded.
5. Delivery arrives next morning. Manager counts: 48 units arrived (2 short).
6. GRN records 48 received, notes 2 unit discrepancy.
7. Inventory increases by 48, not 50.
8. PO is closed with a partial acceptance note.

**Scenario C — End-of-Shift Cash Reconciliation**

1. Cashier ends their shift.
2. They count the cash in the drawer: ₱12,400.
3. System shows expected cash: ₱12,600 (₱1,000 opening float + ₱11,600 in cash sales).
4. Variance: -₱200 (shortage).
5. Cashier records the closing count and notes "₱200 short — possible change error."
6. A reconciliation task is created and routed to the shift supervisor.
7. Supervisor reviews at end of day — confirms, marks reviewed, files for monthly audit.

**Scenario D — Waste Disposal (Expired Food Items)**

1. Morning check reveals 15 units of dairy have passed their expiry date.
2. Staff member creates a Waste Disposal task: "Write off 15 units of SKU-DAIRY-001."
3. Branch manager reviews and approves the write-off (it has financial impact).
4. Staff disposes of the items, marks task complete.
5. Inventory decreases by 15 units — movement type: WASTE.
6. Write-off is recorded in the daily loss report.


---

## Part 5 — Operational Events

Business events are facts — things that happened in the past. They are the connective tissue between domains. A domain produces an event when something significant has occurred; other domains react to it. The event itself is immutable — you cannot un-ring the bell.

---

### Purchase Events

**PurchaseRequestRaised**
- Caused by: Staff member identifying a procurement need
- Produced by: Procurement domain
- Reacts to: Approval domain (routes for authorization), Notification domain (informs approver)
- Business meaning: The business has acknowledged a need exists and is formally considering whether to act on it

**PurchaseRequestApproved**
- Caused by: Approver authorizes the request
- Produced by: Approval domain
- Reacts to: Procurement domain (creates the PO), Notification domain (informs requester)
- Business meaning: The business is committed to spending for this procurement

**PurchaseRequestRejected**
- Caused by: Approver denies the request
- Produced by: Approval domain
- Reacts to: Notification domain (informs requester with reason)
- Business meaning: The business has decided this procurement should not proceed as requested

**PurchaseOrderCreated**
- Caused by: Approved PR becomes a formal order
- Produced by: Procurement domain
- Reacts to: Receiving domain (expect a delivery), Notification domain (optionally informs supplier-side contacts)
- Business meaning: A binding commitment to a supplier has been made

**PurchaseOrderDeliveryReceived**
- Caused by: Physical goods arrive at premises
- Produced by: Receiving domain
- Reacts to: Procurement domain (update PO status to partially/fully received)
- Business meaning: The supplier has fulfilled (some or all of) their obligation

**GoodsAccepted**
- Caused by: Receiving staff confirms goods are in acceptable condition and quantity
- Produced by: Receiving domain
- Reacts to: Inventory domain (increase stock), Procurement domain (update PO received quantities), Notification domain (inform purchasing staff)
- Business meaning: The business now legally owns these goods and they are available for operations

**GoodsRejected**
- Caused by: Receiving staff determines goods do not meet acceptance criteria
- Produced by: Receiving domain
- Reacts to: Procurement domain (discrepancy recorded), Notification domain (alert purchasing staff)
- Business meaning: The business is refusing these goods — they must be returned or disputed

**PurchaseOrderClosed**
- Caused by: All expected items received (or outstanding items formally resolved)
- Produced by: Procurement domain
- Reacts to: Reporting domain (update expenditure records)
- Business meaning: This procurement cycle is complete

---

### Task Events

**TaskCreated**
- Caused by: Staff member or system identifies work that needs to happen
- Produced by: Task domain
- Reacts to: Approval domain (if authorization required), Notification domain (inform approver)
- Business meaning: A unit of operational work has been formally acknowledged

**TaskApproved**
- Caused by: Approver authorizes the task
- Produced by: Approval domain
- Reacts to: Task domain (unlock for execution), Notification domain (inform assigned clerk)
- Business meaning: Management has authorized this work and commits the resources described in the task

**TaskRejected**
- Caused by: Approver denies the task
- Produced by: Approval domain
- Reacts to: Task domain (returns to requester), Notification domain (inform requester with reason)
- Business meaning: This work should not happen as described — revise or abandon

**TaskAssigned**
- Caused by: A specific person is designated to execute the task
- Produced by: Task domain
- Reacts to: Notification domain (inform assignee — this is their work now)
- Business meaning: One person is now accountable for this task's completion

**TaskStarted**
- Caused by: Assignee begins physical execution
- Produced by: Task domain
- Reacts to: Notification domain (optionally inform supervisor that work has begun)
- Business meaning: Operational resources are now committed to this task

**TaskFulfilled**
- Caused by: Assignee records completion with actual outcome data
- Produced by: Task domain
- Reacts to: Inventory domain (apply the authorized movement), Notification domain (inform reviewer), Reporting domain (update operational metrics)
- Business meaning: The physical work is done. The business record reflects what actually happened.

**TaskReviewed**
- Caused by: Supervisor verifies and confirms the completion record
- Produced by: Task domain
- Reacts to: Reporting domain (task is final, include in reports)
- Business meaning: An independent party has confirmed the work was done correctly. The record is locked.

**TaskCancelled**
- Caused by: Authorized actor decides the task should not proceed
- Produced by: Task domain
- Reacts to: Notification domain (inform requester and assignee), Inventory domain (release any reservation)
- Business meaning: This unit of work is abandoned. No inventory movement will occur.

---

### Inventory Events

**StockReceived**
- Caused by: GoodsAccepted event from Receiving
- Produced by: Inventory domain
- Reacts to: Reporting domain
- Business meaning: The business's inventory balance has increased by confirmed, accepted goods

**StockDeducted**
- Caused by: POS sale completed
- Produced by: Inventory domain
- Reacts to: Reporting domain, threshold check → potentially LowStockDetected
- Business meaning: Goods have been sold; the business's balance decreases

**StockTransferred**
- Caused by: TaskFulfilled for a transfer-type task
- Produced by: Inventory domain
- Reacts to: Reporting domain
- Business meaning: Goods have moved between locations; net balance unchanged but distribution has changed

**StockAdjusted**
- Caused by: Authorized adjustment (stock count reconciliation, correction)
- Produced by: Inventory domain
- Reacts to: Reporting domain, Audit domain
- Business meaning: A discrepancy between recorded and physical stock has been reconciled

**StockWrittenOff**
- Caused by: TaskFulfilled for a waste/disposal task
- Produced by: Inventory domain
- Reacts to: Reporting domain (loss recorded), Audit domain
- Business meaning: Goods are permanently removed from the business's balance due to damage, expiry, or loss

**LowStockDetected**
- Caused by: Stock balance crossing the reorder point threshold
- Produced by: Inventory domain
- Reacts to: Notification domain (alert managers), Procurement domain (potential auto-PR if policy allows)
- Business meaning: The business is at risk of stockout; action should be considered

---

### Session / Financial Events

**ShiftOpened**
- Caused by: Cashier starts their operating session
- Produced by: Session domain
- Reacts to: Notification domain (inform supervisor that shift has started, if desired)
- Business meaning: A POS station is now active and tracking transactions

**ShiftClosed**
- Caused by: Cashier ends their operating session and submits their closing count
- Produced by: Session domain
- Reacts to: Task domain (creates reconciliation task), Notification domain (inform supervisors)
- Business meaning: The shift is over; the cash position has been submitted for review

**ReconciliationCompleted**
- Caused by: Supervisor reviews and confirms the cash reconciliation
- Produced by: Session domain / Task domain
- Reacts to: Reporting domain (shift summary finalized)
- Business meaning: The shift's financial record is confirmed and locked

**VarianceRecorded**
- Caused by: Discrepancy between expected and actual cash
- Produced by: Session domain
- Reacts to: Notification domain (urgent alert if variance exceeds threshold), Audit domain
- Business meaning: The business has a cash discrepancy that needs explanation and investigation


---

## Part 6 — Ownership Matrix

The core principle here is the **Single Owner Rule**: for every business action, there is exactly one domain that owns the decision, one domain that owns the record, and one domain that owns the reaction.

---

### Inventory Mutations

**Single owner: Inventory domain**

The inventory balance must only change through the Inventory domain. No other domain — not Task, not Purchase, not Notification — changes inventory directly. Instead, every other domain that needs inventory to change *requests* it by producing a business event (GoodsAccepted, TaskFulfilled, SaleCompleted). The Inventory domain processes that event and applies the mutation.

This is critical because: if Task directly mutates inventory, then every future change to inventory rules (FIFO enforcement, reservation logic, batch constraints) requires changing Task. If Inventory owns its own mutations, those rules live in one place.

| Inventory Action | Owner | Authorization Source |
|-----------------|-------|---------------------|
| Stock received (supplier delivery) | Inventory domain | GoodsAccepted from Receiving |
| Stock deducted (POS sale) | Inventory domain | SaleCompleted from POS |
| Stock transferred | Inventory domain | TaskFulfilled (transfer type) |
| Stock adjusted | Inventory domain | AuthorizedAdjustment (via Approval) |
| Stock written off | Inventory domain | TaskFulfilled (waste type) via Approval |
| Stock reserved | Inventory domain | Reservation request from POS/Procurement |

---

### Approvals

**Single owner: Approval domain**

No domain approves its own actions. Task does not approve tasks. Purchase does not approve purchases. Each domain *requests* approval and *reacts* to the decision, but the approval act itself belongs to the Approval domain.

| What Requires Approval | Owner of Approval |
|------------------------|-------------------|
| Purchase Request → Purchase Order | Approval domain |
| Task (inventory-bearing) | Approval domain |
| Inventory Adjustment | Approval domain |
| Write-off | Approval domain |
| High-value transfer | Approval domain |
| Shift variance exceeding threshold | Approval domain |

---

### Assignments

**Single owner: Task domain**

The Task domain owns the assignment — it records who is assigned to what work. The Employee domain provides the registry of who exists and what roles they hold. The Notification domain informs the person they have been assigned. But the act of assignment — linking a person to a task — belongs to Task.

---

### Notifications

**Single owner: Notification domain**

No domain sends its own notifications. Purchase does not send emails. Task does not push alerts. Each domain produces business events. The Notification domain subscribes to those events and handles delivery. This allows notification rules (who gets what, at what priority, via what channel) to change independently of the business logic that generates the event.

---

### Purchase Records

**Single owner: Procurement domain**

The Procurement domain owns the lifecycle of purchase documents — from request through to closure. The Receiving domain owns the GRN (the physical receipt record). These are distinct. A Purchase Order is a commitment; a Goods Receipt Note is evidence of fulfillment.

---

### Audit History / Traceability

**Single owner: Audit domain (or each domain maintains its own immutable log)**

Every business event that changes state should produce an immutable record. This record is never modified or deleted — it is the business's evidence trail. In practice, this means:

- Every inventory movement is permanent
- Every approval decision is permanent
- Every task status transition is timestamped and attributed to a person
- Every purchase creation and void is permanent

The audit trail is not a separate database table — it is the history of events that already happened. Reporting reads it; it is never written to directly.

---

### Reporting

**Single owner: Reporting domain (read-only)**

Reporting reads from all domains. It owns no business records. It makes no decisions. It changes no state. It only reads, aggregates, and presents.

---

### Business Events

**Produced by the domain where the event occurred; consumed by whoever needs to react.**

| Event | Produced By | Consumed By |
|-------|-------------|-------------|
| LowStockDetected | Inventory | Notification, Procurement |
| GoodsAccepted | Receiving | Inventory, Procurement, Notification |
| TaskFulfilled | Task | Inventory, Reporting, Notification |
| PurchaseApproved | Approval | Procurement, Notification |
| ShiftClosed | Session | Task (reconciliation), Notification |
| ReconciliationCompleted | Session/Task | Reporting |

---

### Scheduling

**Owner: Operations/Task domain**

Scheduled work (recurring stock counts, regular maintenance checks, weekly audits) is planned and tracked through the Task domain. The schedule is a task creation trigger — it is not its own domain. A scheduled task is still a task.


---

## Part 7 — Future Growth

The following capabilities are natural extensions of the business model described in this document. The key test for each is: does it require inventing a new concept, or does it fit naturally into the existing vocabulary?

---

### Partial Receiving

The business model already supports this: a Purchase Order has an expected quantity. A Goods Receipt Note records what was actually received on a specific date. Multiple GRNs can be linked to the same PO until the order is fully closed. This is a natural expression of the PO → GRN relationship — no new concept is needed, only the acknowledgment that one PO can have many receipts.

**Stable concept to preserve:** The separation of Purchase Order (commitment) from Goods Receipt Note (evidence of delivery).

---

### Purchase Rejection / Dispute

When received goods do not match the PO (wrong item, wrong quantity, unacceptable condition), the Receiving domain produces a GoodsRejected event. This feeds back to the Procurement domain, which opens a supplier dispute. The business model already supports this by making Receiving a separate domain from Procurement.

**Stable concept to preserve:** Receiving is independent of Procurement. The business does not own goods until Receiving confirms acceptance.

---

### Quality Inspection

Inspection is a step inside the Receiving lifecycle, between "goods arrived" and "goods accepted." A quality inspection process adds specificity: who inspected, what criteria were applied, what the result was. This is an enrichment of the GRN — it does not require a new domain, only a more detailed Receiving process.

**Stable concept to preserve:** Goods are not available to the business until the acceptance step is completed. Inspection is a prerequisite to acceptance.

---

### Batch Inventory

Batch tracking is already a natural property of inventory. Every lot received from a supplier is a batch with its own cost price, receipt date, expiry date, and provenance. FIFO, FEFO (First Expired, First Out), and LIFO costing are expressions of how batches are consumed in order. The business model handles this by treating each accepted lot as a distinct batch within the inventory of a given product.

**Stable concept to preserve:** Each inventory batch is identified by its origin (PO/GRN), its receipt date, its cost, and (if applicable) its expiry.

---

### Warehouse Workflows

A warehouse operation is the same operational model at higher volume and formality. Purchase Requests, Purchase Orders, Receiving, Stock Movements, and Tasks are all the same concepts — the scale and role specialization increase, but the vocabulary stays the same. A pick list, a put-away instruction, and a replenishment order are all forms of Operational Tasks with location-specific context.

**Stable concept to preserve:** The Task as the unit of authorized work. The Location as the unit of physical placement. The Stock Movement as the permanent record of every physical change.

---

### Shelf Replenishment

Shelf replenishment is a TRANSFER task from a backroom location to a display location. The business already understands this — the vocabulary is Location, Stock Level, Reorder Point, and Task. A trigger (stock below threshold at display location) creates a task (bring X units from backroom to display), which is authorized and executed, resulting in a Stock Movement.

**Stable concept to preserve:** The trigger (threshold breach) and the response (task) are separate. The trigger is an Inventory event. The task is the operational response.

---

### Stock Counting

Physical stock counting is a STOCK_COUNT task that produces a reconciliation adjustment. The business model already treats this as: count task → verified quantity → adjustment movement (delta between recorded and physical). When this is done at scale, it becomes a stocktake — many count tasks coordinated by a manager across all product lines in a location, completed in sequence, and reviewed before any adjustments are applied.

**Stable concept to preserve:** No adjustment is applied until the count is reviewed and approved. The count result (physical quantity) and the system record are separate until reconciliation.

---

### Internal Transfers

Transfers between locations within the same branch or between branches are the same concept: a transfer task with a source location, a destination location, and an authorized quantity. Multi-branch transfer adds an organizational dimension (approval requirements may differ, transit time may be relevant) but the business vocabulary does not change.

**Stable concept to preserve:** Every transfer has an authorized source, an authorized destination, and a recorded quantity. A transfer is not complete until both sides are confirmed (goods left source, goods arrived at destination).

---

### Maintenance Tasks

Maintenance is a GENERAL_CHORE with richer metadata: equipment ID, maintenance type, service schedule, resolution notes. The task model supports this because tasks are flexible containers for work. Maintenance tasks do not involve inventory and do not require inventory-domain interaction.

**Stable concept to preserve:** A task is a unit of authorized work. Whether it involves inventory or not is a property of the task type, not the task concept itself.

---

### Scheduled Work

Recurring tasks (weekly stock count, daily shelf check, monthly equipment inspection) are tasks created by a schedule rather than by a person. The schedule is a trigger — just like low stock is a trigger. The resulting task enters the same workflow: created, approved (if required), assigned, executed, reviewed.

**Stable concept to preserve:** All tasks, regardless of how they were created (manual, automated, scheduled), follow the same lifecycle and authorization rules.

---

### Escalations

Escalation is a time-aware behavior in the Approval domain and Notification domain. If an approval request has not been acted upon within a defined window, the request routes to a higher authority. If a task is past its due date and not yet started, an escalation notification fires. These are expressions of business policy, not new domains.

**Stable concept to preserve:** Escalation is a time trigger on an existing event, not a new event type. The Approval domain should have inherent awareness of escalation rules.

---

### Multi-Level Approval

For high-value purchases or tasks exceeding a branch manager's authorization limit, approval escalates up the organizational hierarchy: cashier → supervisor → branch manager → regional manager → owner. This is a routing rule within the Approval domain — the concept of "approval" stays stable; only the routing logic becomes more sophisticated.

**Stable concept to preserve:** Every approval has a single responsible approver at each level. The authorization limit determines what each level can approve.

---

### Supplier Disputes

When a delivered order is wrong, short, or damaged, the business needs to record the dispute, track its resolution, and adjust the PO accordingly. A supplier dispute is an extension of the Procurement domain — it links a GRN discrepancy to a formal communication with the supplier and an expected resolution (credit note, replacement delivery, partial refund).

**Stable concept to preserve:** A Purchase Order is not closed until all discrepancies are resolved. The GRN records facts; the dispute records the resolution process.


---

## Part 8 — Business Invariants

These are rules that must always be true in a correctly operating retail business. They are not implementation constraints — they are facts of how the business world works. Any software that violates these invariants is modeling the business incorrectly.

---

### Inventory Invariants

**INV-1: Inventory cannot become available before acceptance.**
Goods are not in the business's inventory until a receiving staff member has confirmed they arrived, were counted, and are acceptable. A purchase order being approved does not increase inventory. The goods arriving at the door does not increase inventory. Only the Goods Receipt Note confirmation does.

**INV-2: Every inventory mutation must have a traceable business reason.**
Inventory does not change spontaneously. Every increase or decrease traces to: a supplier delivery, a sale, an authorized task, an authorized adjustment, or a system reconciliation. Mutations without a traceable reason are audit failures.

**INV-3: Inventory cannot go below zero as a result of authorized operations.**
A business cannot sell goods it does not have. If a fulfillment task or a sale would bring stock below zero, the business must either reject the operation or raise a discrepancy — it cannot silently complete it.

**INV-4: A stock count reconciliation does not take effect until it is reviewed and approved.**
When staff physically count stock and find a discrepancy, the count is a proposal. The adjustment to the system record requires authorization. Until an authorized person confirms the count, the recorded balance remains unchanged.

**INV-5: Batch cost is established at time of receiving, not at time of sale.**
The cost of a batch of goods is fixed when the goods are accepted. It does not change retroactively when a later purchase happens at a different price. FIFO or FEFO costing uses the cost from each individual batch as goods are consumed in order.

---

### Purchase Invariants

**PUR-1: A Purchase Order cannot be created without an approval.**
The act of committing business funds to a supplier requires authorization. A purchase request may originate from anyone; the purchase order requires sign-off from someone with purchasing authority.

**PUR-2: A Purchase Order cannot be closed if outstanding items have not been resolved.**
If 50 units were ordered and 40 were received, the PO is not complete. It remains open until the remaining 10 units arrive, are formally cancelled, or a discrepancy is resolved with the supplier.

**PUR-3: Voiding a purchase requires authorization equivalent to creating one.**
The reversal of a purchase has the same financial impact as the original purchase. It should not be easier to undo than to do. At minimum, the same authorization level applies.

**PUR-4: A Purchase Request and a Purchase Order are not the same thing.**
A PR is internal — it is a proposal. A PO is external — it is a commitment. Collapsing them loses the distinction between "we're thinking about buying this" and "we have legally committed to buy this."

---

### Task Invariants

**TASK-1: A task never owns inventory.**
A task describes work to be done involving inventory. It does not hold inventory, reserve inventory, or modify inventory directly. The task's fulfillment record is the authorization that Inventory uses to apply the movement.

**TASK-2: Inventory does not change as a result of a task until the task is fulfilled and the outcome is recorded.**
Creating a task does not reduce stock. Approving a task does not reduce stock. Starting a task does not reduce stock. Only the fulfillment record — what was actually done, confirmed by the executing person — authorizes the inventory change.

**TASK-3: The suggested quantity and the verified quantity are different concepts.**
What management thinks needs to happen (suggested quantity) may differ from what the executing staff member actually did (fulfilled quantity) and what a supervisor confirmed happened (verified quantity). All three matter. Collapsing them into one number loses the ability to detect operational discrepancies.

**TASK-4: Every task that affects inventory must be authorized before execution.**
No staff member should be able to move, remove, or adjust inventory without an authorized task. This is the mechanism that prevents unauthorized stock removal.

**TASK-5: A completed and reviewed task is a permanent record.**
A task that has reached the reviewed state is locked. It is part of the business's audit history. It cannot be modified, deleted, or overridden. Corrections are handled through new tasks, not by editing closed ones.

---

### Approval Invariants

**APPR-1: No one approves their own requests.**
The person who requests a purchase cannot approve it themselves (except in very small, single-owner operations where this is a known and accepted risk). Segregation of duties is a basic control.

**APPR-2: An approval decision is permanent.**
An approval is not reversed — it is countered by a rejection, a void, or a correction, each of which creates its own record. The original approval remains in history.

**APPR-3: Approval authority is defined by role and scope, not by identity alone.**
A supervisor can approve a task up to a certain value. Anything above that value requires a higher authority. The constraint is the scope, not the person.

---

### Notification Invariants

**NOTIF-1: Notifications never make business decisions.**
A notification is a message, not an action. Sending a notification does not create a task, modify inventory, or change any business state. If a notification appears to "do something," the business logic doing that thing belongs to the domain that detected the condition, not the notification.

**NOTIF-2: Notification delivery is a best-effort service.**
The failure to deliver a notification does not invalidate the business event that triggered it. The event happened. The notification is a convenience. Critical business processes must not depend on a notification having been read.

**NOTIF-3: Notifications are scoped to their audience.**
A notification about a branch's stock level goes to that branch's management — not to every manager across the entire business. Audience scoping is defined by the business rule, not by the notification system itself.

---

### Session / Reconciliation Invariants

**SESS-1: A shift cannot be opened without a recorded opening cash amount.**
The opening float is the reference point for the entire reconciliation. A shift without a recorded opening amount cannot be accurately reconciled.

**SESS-2: Cash reconciliation requires an independent reviewer.**
The person who operates the cash drawer should not be the person who confirms the reconciliation is correct. The reviewer must be a separate party with the authority to do so.

**SESS-3: A shift's financial record is locked after reconciliation is confirmed.**
Once a supervisor has confirmed the reconciliation, the shift's sales total, opening float, and closing count are permanent. Post-hoc modification invalidates the audit trail.


---

## Part 9 — Natural Aggregates

An aggregate is a cluster of business concepts that belong together, are managed as a unit, and have a clear boundary. The test for an aggregate is: when something inside it changes, does the whole unit need to be consistent? If yes, they belong together.

---

### Purchase Order (Aggregate)

**Why it deserves to exist as its own business concept:**

A Purchase Order is the unit of procurement. It contains the intent (what we want to buy), the commitment (at what price from which supplier), the fulfillment history (what has been received against it), and the status (open, partially received, closed, disputed). All of these are meaningless without the others. The PO number is the reference that connects the internal request, the supplier conversation, the delivery, and the payment.

**What it contains:**
- The approved procurement need (Purchase Request details)
- The supplier and agreed terms
- Line items (product, quantity, unit of measure, agreed unit price)
- Expected delivery date
- Received quantities (one or more Goods Receipt records)
- Status: open, partially received, fully received, closed, disputed

**What it does not contain:**
- Inventory levels (it only records what was ordered and received, not what is currently in stock)
- Task assignments (receiving and put-away are separate work)
- Notification preferences (those belong to the recipient)

---

### Goods Receipt Note (Aggregate)

**Why it deserves to exist as its own business concept:**

A GRN is the evidence document for a specific delivery event. It exists separately from the PO because deliveries do not always match orders — and because the person who receives goods needs a document that records *their* act of receiving, separate from the buyer's commitment. A GRN connects a physical delivery to a business record. Multiple GRNs can exist for one PO (partial deliveries).

**What it contains:**
- Reference to the PO it is fulfilling
- The date of physical arrival
- Who received the goods
- What was received: each item, quantity, and condition
- What was accepted vs. rejected per line
- Inspection notes
- The authorizing signature

**What it does not contain:**
- The original PO terms (referenced, not duplicated)
- The inventory movement record (that is created by Inventory when GRN is accepted — it's a reaction, not part of the GRN)

---

### Operational Task (Aggregate)

**Why it deserves to exist as its own business concept:**

A task is the unit of authorized work. It has a complete internal lifecycle — from identification of need, through authorization, assignment, execution, and post-audit review. Every step of that lifecycle is part of understanding what happened and why. The task's metadata (what product, what quantity, what location) is the business context that makes the work meaningful. The accountability chain (who created it, who approved it, who did it, who reviewed it) is the audit record.

**What it contains:**
- The type and purpose of the work
- The scope: what product, what quantity, what location
- Three distinct quantity fields: suggested (proposed), approved (authorized), verified (confirmed)
- The full accountability chain: creator, approver, clerk, reviewer
- Lifecycle timestamps at each stage
- The current status in the workflow
- Notes and instructions

**What it does not contain:**
- The inventory batch it will modify (it references it, but inventory owns the batch)
- The notification sent about it (notifications are sent by the notification domain based on task events)
- The purchase record resulting from a purchase request (that is created by Procurement when the PR is approved)

---

### Inventory Batch (Aggregate)

**Why it deserves to exist as its own business concept:**

A batch is a specific lot of a specific product, received together, sharing a cost price and (if applicable) an expiry date. In a business with FIFO costing, batch tracking is not optional — it is how cost of goods sold is calculated accurately. In a business with expiry-sensitive products, batch tracking is how spoilage is managed. The batch is the unit of inventory that the business actually holds — not an abstract product quantity.

**What it contains:**
- Which product/variant it belongs to
- Which location it is stored at
- The quantity currently available in this batch
- The cost price at time of receipt
- The batch number (from the supplier or internal)
- The expiry date (if applicable)
- The date received

**What it does not contain:**
- The purchase order it came from (referenced, not owned)
- The movements that consumed from it (movements are immutable records in their own right)

---

### Stock Movement (Aggregate)

**Why it deserves to exist as its own business concept:**

A stock movement is an immutable fact of history. It records that on a specific date, a specific quantity of a specific product moved in a specific direction, for a specific reason, authorized by a specific source. Unlike inventory (which is a current balance), a movement is permanent — it never changes after it is recorded. The movement is the audit trail that makes inventory trustworthy.

**What it contains:**
- The product/variant
- The quantity and unit
- The direction (IN, OUT, TRANSFER, ADJUST, WASTE)
- The source of authorization (task ID, PO ID, sale transaction ID)
- Who performed it
- When it occurred
- The batch it affected
- The source location and (for transfers) the destination location

**What it does not contain:**
- The current stock balance (that is derived from all movements together, not stored in any single movement)
- Business decisions (a movement records what happened; decisions belong to the domain that authorized the movement)

---

### Notification (Aggregate)

**Why it deserves to exist as its own business concept:**

A notification is a discrete message addressed to a specific person about a specific event. It has its own lifecycle: created, delivered, read, and archived. It has a recipient, a subject, a message, a priority, and optionally a reference to the business record that triggered it. Each notification is independent — reading one does not affect others. Batch operations (mark all read) are operations on a collection of notifications, not on a single aggregate.

**What it contains:**
- The recipient
- The type and priority
- The title, message, and optional action link
- The source event reference (what triggered it)
- The read state
- The creation timestamp

**What it does not contain:**
- The business logic that triggered it (that belongs to the producing domain)
- The action the recipient takes in response (that belongs to the action's domain)

---

### Vendor Session (Aggregate)

**Why it deserves to exist as its own business concept:**

A vendor session represents a discrete shift — a bounded period of cashier operation with a defined starting balance and a defined closing reconciliation. It is the unit of accountability for a cashier's financial activity. All transactions during the session are grouped under it, making it possible to verify that the money collected matches the recorded sales. The session is also the trigger for the reconciliation process.

**What it contains:**
- Who operated the session
- Start and end timestamps
- Opening cash float
- Closing cash submitted by the cashier
- Expected cash (calculated from transactions)
- Verified cash (confirmed by supervisor)
- Status: open or closed
- Reference to the reconciliation task

**What it does not contain:**
- The individual transactions (those are owned by the Sales domain; the session is a reference context)
- The reconciliation decision (that is made by the Task and Approval domains)


---

## Part 10 — Executive Summary

### The Simplest Cohesive Operational Model

A growing retail business needs to answer six questions reliably at any point in time:

1. **What do we have?** — Inventory
2. **What are we buying?** — Procurement
3. **What actually arrived?** — Receiving
4. **What work needs to happen?** — Task
5. **Who knows about what?** — Notification
6. **How is the money?** — Session / Reconciliation

Everything else is either a report derived from these six, or an operational detail within one of them.

---

### Fundamental Concepts

These concepts are load-bearing. They will be present in any correctly modeled retail business, regardless of size, software, or geography. They cannot be removed without collapsing the model.

| Concept | Why It Is Fundamental |
|---------|----------------------|
| **Inventory** | The business exists to sell goods. Knowing what you have is prerequisite to everything else. |
| **Stock Movement** | Inventory without movement history is untrustworthy. Every change needs a reason. |
| **Purchase Order** | The formal mechanism for bringing goods into the business. Cannot be omitted if supplier relationships exist. |
| **Goods Receipt** | The act of accepting goods. Separating this from the purchase commitment is what makes inventory trustworthy. |
| **Operational Task** | The mechanism for managing and tracking physical work. Without it, operations are informal and unauditable. |
| **Approval** | The mechanism for preventing unauthorized spending and unauthorized inventory changes. Cannot be optional in any operation with more than one person. |
| **Notification** | The mechanism by which the business keeps the right people informed. Without it, the business operates reactively, always discovering problems too late. |
| **Session / Shift** | The accountability unit for cash-handling operations. Without it, cash discrepancies have no bounded context for investigation. |

---

### Supporting Concepts

These concepts enrich and enable the fundamental concepts but are not independently fundamental. They exist in service of the above.

| Concept | Serves |
|---------|--------|
| Batch | Inventory (enables FIFO, expiry tracking, traceability) |
| Location | Inventory (enables multi-location tracking, shelf replenishment) |
| Reorder Point | Inventory, Procurement (triggers the procurement cycle) |
| Inspection | Receiving (enriches the acceptance decision) |
| Three-Way Match | Procurement (enables financial control) |
| Escalation | Approval, Notification (enables time-aware routing) |
| Authorization Limit | Approval (enables tiered authority) |
| Variance | Session (enables discrepancy investigation) |
| Schedule | Task (enables recurring work without manual creation) |

---

### Concepts That Should Remain Independent

These concepts should never be merged or made to share ownership:

**Purchase ≠ Receiving**
The commitment to buy (PO) and the evidence of receipt (GRN) are different business facts. One is about intention; the other is about what physically happened. Merging them means goods are considered "in stock" the moment someone places an order — which is wrong.

**Task ≠ Inventory**
A task is a plan for work. Inventory is the current state of stock. A task does not hold inventory, and inventory does not own tasks. They interact only at the point of task fulfillment, through a business event.

**Notification ≠ Business Logic**
A notification is a delivery mechanism. The business rule that says "send a notification when stock is low" belongs to the Inventory domain (which detects the condition) or the policy configuration (which defines who gets notified). The notification system just delivers.

**Approval ≠ Business Rule**
The approval is the authorization decision. The business rule that says "purchases over ₱10,000 need branch manager approval" belongs to policy. The Approval domain enforces the rule; it does not own the rule.

**Reporting ≠ State Management**
Reports describe what happened. They are never the source of truth. You do not update a business record by editing a report.

---

### Concepts That Should Never Own Another Domain's Responsibilities

| This domain... | Must never... | Because... |
|----------------|---------------|------------|
| **Task** | Mutate inventory directly | If Task owns inventory changes, inventory rules must live in Task — they belong in Inventory |
| **Notification** | Create tasks or make decisions | Notification is a messenger, not an actor |
| **Purchase** | Accept its own requests | No domain should approve its own actions |
| **Inventory** | Decide what work needs to happen | Inventory signals conditions; Task and Procurement decide the response |
| **Session** | Own task lifecycle | Session creates a reconciliation need; Task owns the process of resolving it |
| **Reporting** | Write business records | Reports are read-only derivations, not business truth |
| **Employee** | Make assignment decisions | Employee provides the registry; Task and Approval make the decisions |

---

### The Operational Model in One Paragraph

A retail business operates by knowing what it has (Inventory), deciding what to buy (Procurement), confirming what arrived (Receiving), organizing the physical work that keeps the operation running (Task), making sure the right people know what is happening (Notification), and verifying that its cash position is accurate at the end of every shift (Session). Each of these is a distinct responsibility with a clear owner. When something in one domain changes — goods arrive, stock runs low, a task is completed — that domain produces a business event, and the relevant other domains react. No domain reaches into another domain to make changes. The business logic that governs each domain lives inside that domain. The history of everything that happened is permanently recorded and never modified. These principles are true whether the business has one cashier or five hundred, one location or fifty.

---

*End of Business Domain Model — Operational Domain*
*Phase 2 — Business Domain Discovery*
*This document models the business, not the software. No implementation decisions have been made.*
