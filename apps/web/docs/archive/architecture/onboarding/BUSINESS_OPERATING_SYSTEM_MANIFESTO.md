# Business Operating System — Manifesto

> *"The platform adapts to the business. The business does not adapt to the platform."*

---

## Preamble

This document is the constitution of the platform.

It does not describe technical implementation. It describes why this platform exists,
what it believes, and how every decision made inside it — from architecture to user
interface to product strategy — must be grounded.

It is written to be read by engineers, designers, and product people. It is written to
outlast any single contributor. It is written to guide humans and AI agents alike when
they face decisions that are not obvious.

When the right answer is unclear, come back here.

---

# I. Vision

## Why This Platform Exists

Most business software is built for a business that already knows exactly what it needs.

It presents a configuration panel. It asks the business to select its type. It unlocks
a set of features. It assumes the business will adapt its operations to match the
software's model of how businesses work.

This assumption is wrong.

Businesses are not uniform. A neighborhood bakery, a medical clinic, a hardware
distributor, and a clothing boutique share almost nothing operationally — yet
traditional software gives them the same menu of features and expects them to figure
out which ones apply.

Small and medium businesses — the businesses that make up the backbone of every
local economy — deserve software that understands them rather than software that
demands to be understood.

This platform exists to answer one question: *what if the software learned how your
business works and configured itself accordingly?*

## The Problem We Are Solving

There are three failure modes in business software:

**Underconfiguration.** The business gets a minimal setup and never discovers the
capabilities that would genuinely help them. They outgrow the software without knowing
it had what they needed.

**Overconfiguration.** The business is forced through a complex setup flow, confronted
with features they don't understand, and burdened with configuration they don't need.
They never fully adopt the software because it feels overwhelming from day one.

**Static configuration.** The business grows and changes. The software doesn't.
What was configured at registration is still configured a year later, even though
the business has evolved. Migration requires starting over.

This platform solves all three. It discovers what the business needs, configures only
what is relevant, and evolves alongside the business as it grows.

---

# II. Mission

## How This Platform Helps Businesses Grow

The platform's mission is to reduce the operational overhead of running a business
so that business owners can focus on what they do best.

We do this not by offering more features, but by offering the *right* features at the
*right* time — without the business having to ask for them.

When a business adds their first supplier, the platform notices and asks if they want
to start tracking purchase orders. When a business hires their first employee, the
platform offers shift reconciliation and task management. When a business opens a
second location, branch management becomes available automatically.

The platform watches. It learns. It suggests. The business decides.

We are not a POS system that businesses grow out of. We are a platform that grows
with businesses, meeting them where they are on day one and remaining relevant on
day one thousand.

---

# III. Core Philosophy

These are not aspirations. They are the load-bearing principles of the platform.
Every feature, every design decision, every line of code must respect them.

---

## 1. The Platform Adapts to the Business

Software that forces businesses to adapt their operations to match a predefined model
is software that works for the software company, not the business.

We start by understanding how the business operates: what it sells, how customers buy,
how stock is managed, how the team is organized. From that understanding, the platform
configures itself. The business never has to learn our terminology, navigate our module
structure, or understand our internal architecture to get value.

*Practical implication: No question in onboarding should reference a module name,
a feature flag, or a technical concept. Questions describe business operations.
The platform translates answers into configuration.*

---

## 2. Intelligence Over Configuration

Traditional software puts the burden of configuration on the user. Hundreds of toggle
switches, nested settings panels, and decisions the user cannot make without
understanding the full consequences.

We replace configuration with intelligence. The platform infers what the business needs
from how it operates. When inference is insufficient, the platform asks a single,
well-formed question — not a configuration screen.

*Practical implication: Every configuration decision the platform can make on behalf
of the business should be made automatically. The user should only be asked to make
decisions that genuinely require their judgment.*

---

## 3. Capabilities Over Feature Checklists

A feature checklist asks: "Do you want inventory management? Yes / No."

A capability asks: "Given what we know about your business, we think inventory
tracking would help you. Here's why. Here's what it will do. Want to enable it?"

Capabilities are self-describing, context-aware, and earned — they emerge from the
business's observed behavior rather than being selected from a menu.

*Practical implication: No capability should be enabled simply because the user
selected it from a list. Every capability activation should be grounded in a real
business signal or a deliberate user decision with a clear explanation.*

---

## 4. Progressive Complexity

A business starting out does not need a full enterprise system. A business that has
been running for three years and has ten employees and two locations does.

The platform must serve both. It does so by starting minimal and growing.

On day one, a solo vendor gets a fast, clean register. Nothing more. As their business
grows — as they hire staff, add suppliers, open branches — the platform offers
progressively more sophisticated tools, one at a time, at the moment they become relevant.

*Practical implication: The Lite POS profile must remain fully functional as a
standalone configuration, not a degraded version of something bigger. Every capability
the platform surfaces later must be genuinely additive, not remediation of something
that was broken.*

---

## 5. Evolution Over Migration

Businesses change. A retail shop starts offering food. A service business begins
selling retail products. A single-location business opens a branch.

Traditional software responds to these changes with migration projects — export your
data, reconfigure from scratch, retrain your staff. This is a failure of platform design.

This platform responds with evolution. Characteristics are observed continuously.
When the business changes, the platform's understanding updates. New capabilities
are offered. The configuration evolves. The business never restarts.

*Practical implication: There must be no configuration decision in this platform that
cannot be reversed, updated, or evolved without starting over. The architecture must
support continuous reconfiguration without data loss.*

---

## 6. Recommendations Over Forced Workflows

The platform never forces a business into a workflow it did not choose.

When the platform detects that a business could benefit from a new capability, it
makes a recommendation. The recommendation explains why it is being made, what benefit
the business will gain, and what effort it will require. The business decides whether
to act on it.

Automation serves the business. The business does not serve the automation.

*Practical implication: The transition from RECOMMENDED to ENABLED is always
user-triggered. No automated process may enable a capability without user consent.*

---

## 7. User Control Is Non-Negotiable

Every automated decision the platform makes can be reversed. Every inferred characteristic
can be corrected. Every recommendation can be dismissed. Every enabled capability can
be paused.

The platform has opinions. The user has veto power. Always.

*Practical implication: CapabilityControl must expose accept, dismiss, delay, ignore,
enable, pause, restore, and characteristic correction for every capability. None of
these controls may be removed or restricted for non-compliance-critical capabilities.*

---

## 8. Simplicity First

The most important design decision this platform makes is choosing what not to include.

Every additional capability, every additional configuration option, every additional
screen adds cognitive load for someone. Before anything is added, the question must
be asked: does this solve a real problem that the business actually has? If the answer
is not clearly yes, it does not belong.

*Practical implication: New capabilities must be justified by observed business need,
not by product instinct or feature parity with competitors. The platform's value is
not in the number of features it has. It is in the quality of the ones it surfaces.*

---

## 9. Business Language, Not Technical Language

A business owner should never have to understand what a module is, what a feature flag
does, or what a capability key means. Every word that appears in the user interface
must be the word the business owner would use to describe their own operations.

"Do you track how much stock you have?" instead of "Enable inventory management."

"At the end of the day, do you count the cash in the drawer?" instead of "Enable
cash reconciliation."

*Practical implication: Every string that appears in the user interface, in
recommendation cards, in onboarding questions, and in capability descriptions must
be reviewed against this principle before shipping. If a business owner would not
say it, it does not belong in the product.*

---

# IV. Product Principles

These apply to every feature and every screen.

**P1 — Solve real problems.**
Every feature must have a clearly articulated business problem it solves. "It rounds
out the module" is not a business problem.

**P2 — Features emerge from capabilities.**
No feature should be built outside of the capability framework. Every new feature is
a new capability entry in the registry, with declared requirements and recommendation
logic.

**P3 — Capabilities emerge from business understanding.**
No capability should be added unless there is a clear business characteristic signal
that indicates when it is relevant. If the platform cannot determine when to recommend
a capability, it should not be in the registry.

**P4 — The user should never feel overwhelmed.**
At any given moment, the user should have at most one clear next step. The dashboard
should surface the most important action. Recommendation cards should be shown one at
a time, not as a checklist.

**P5 — The platform grows naturally.**
A user who uses the platform every day and never reads documentation should gradually
discover its depth through the natural course of their business operations. The
discovery experience is the product, not a tutorial.

**P6 — Every recommendation is explainable.**
A recommendation that cannot explain itself in one plain sentence should not be shown.
"Why am I seeing this?" must always have a clear, honest, and concise answer.

**P7 — Data always belongs to the business.**
Every piece of data the platform collects, every characteristic it derives, every
recommendation it makes — all of it is in service of the business that generated it.
The platform uses it to help. It does not own it.


---

# V. Architecture Principles

These govern every structural decision in the codebase.

---

## AP1 — Single Responsibility

Every module, engine, and function has one job. When a component begins doing two
things, it becomes harder to test, harder to replace, and harder to understand.

The nine modules of the Business Operating System — SurveyInterpreter,
CharacteristicsEngine, CapabilityResolver, ProfileClassifier, ConfigurationEngine,
RecommendationEngine, CapabilityControl, BusinessEventBus, and the Capability Registry
— each have exactly one job. They must remain that way.

*Why it matters: When responsibilities are concentrated, a change to one concern
requires changing unrelated code. The cost of change grows with coupling.*

---

## AP2 — Stable Contracts Between Modules

`BusinessCharacteristics` is the contract between the survey layer and the capability
layer. No module on either side should reach across this boundary.

Every inter-module interface must be explicitly typed. Implicit coupling through shared
mutable state is prohibited. If two modules communicate, they do so through typed inputs
and outputs, not through shared memory or implicit side effects.

*Why it matters: Stable contracts allow either side to evolve independently.
They are what makes the architecture maintainable over a decade.*

---

## AP3 — Pure Functions for Domain Logic

The core engines — SurveyInterpreter, CapabilityResolver, ProfileClassifier,
ConfigurationEngine, and the scoring core of RecommendationEngine — are pure functions.
Same inputs, same outputs. No IO, no database access, no side effects.

The Application Layer (server functions, background jobs) owns all IO. It assembles
the inputs the engines need, calls the engine, and persists the result. It never contains
domain logic.

*Why it matters: Pure functions are testable without infrastructure. The entire
capability evaluation pipeline can be run in a unit test in milliseconds.
This is not a luxury — it is what keeps the team fast as the codebase grows.*

---

## AP4 — Capability-First Architecture

Every new feature is a capability entry before it is a route, a component, or a
server function. The capability definition declares what business signals indicate
need, what configuration it applies, and what usage signals indicate it is being
used. The engineering work follows the capability definition.

*Why it matters: Building routes and screens before defining what business need
they serve results in features that are technically complete and strategically unclear.
The registry forces the question "why does this exist?" before the first line of code.*

---

## AP5 — Event-Driven Where It Adds Value, Not by Default

The event bus is used where it genuinely decouples producers from consumers —
server functions emitting structural events, engines reacting to them without
knowing who sent them. It is not used to add asynchrony for its own sake.

Synchronous code is simpler to debug, simpler to reason about, and simpler to test.
Events are introduced when the alternative is tight coupling between systems that
should not know about each other.

*Why it matters: Event-driven architectures can hide causality. Use events to
enable decoupling, not to obscure data flow.*

---

## AP6 — Domain Boundaries Are Enforced

The BOS domain (characteristics, capabilities, profiles, recommendations) does not
import from the billing domain (entitlements, plans, subscriptions). The billing
domain does not import from the BOS domain.

When these domains need to cooperate, they do so through explicit, narrow interfaces
in the Application Layer — not through shared types, shared imports, or implicit
knowledge of each other's internals.

The BOS Registry is a setup-time tool. The EntitlementEngine is a runtime gate.
They serve different purposes and are never confused.

*Why it matters: Mixed domain boundaries are the primary source of accidental
coupling. Once mixed, they are extremely difficult to separate.*

---

## AP7 — Business-First Modeling

The data model describes the business, not the software. `BusinessCharacteristics`
contains fields like `sellsPhysicalGoods`, `teamSize`, and `inventoryCriticality` —
not `enableInventoryModule` or `hasWarehouse`. The domain model speaks the language
of business operations.

*Why it matters: Software models that mirror business concepts survive platform
changes. Software models that mirror UI structure or module architecture do not.*

---

## AP8 — Incremental by Design

No component should be built in a way that requires another component to be finished
before it delivers value. The architecture supports vertical slices — each phase
delivers working software that a real user can operate.

*Why it matters: A six-month build to a big-bang release is a six-month bet on
requirements not changing. Incremental delivery is how the team learns what actually
matters while building it.*

---

## AP9 — Validate Before Extending

Before adding a new capability, a new characteristic, or a new observation rule,
validate against the build-time registry validation test. Before shipping a phase,
run the full test suite. Before enabling a new behavior in production, shadow-run it.

*Why it matters: Architecture compliance is maintained through validation, not
through trust. Automated checks are the only checks that are reliable.*

---

# VI. UX Principles

---

## UX1 — Conversational Onboarding

The onboarding survey is a conversation, not a form. Questions are asked one at a time.
Each question follows naturally from the previous answer. The survey is not a checklist
of settings — it is the platform learning how the business works.

---

## UX2 — Progressive Disclosure

Complexity is earned, not imposed. A new user sees only what they need to get started.
Depth is revealed as the user demonstrates readiness through their behavior —
by adding products, by processing sales, by growing their team.

---

## UX3 — Minimal Setup

The minimum viable configuration for any business is: create an account, answer a
few questions, add a product, record a sale. Everything beyond that is optional and
offered when it becomes relevant.

No feature should require a lengthy setup process to begin delivering value.
If a feature cannot be activated in under fifteen minutes, it needs to be redesigned.

---

## UX4 — No Unnecessary Configuration

Every configuration decision the platform can make automatically should be made
automatically. Configuration screens exist for decisions that genuinely require
the user's judgment. They do not exist to expose every internal toggle.

---

## UX5 — Context-Aware Recommendations

Recommendations appear on the page or in the context where they are most relevant.
A recommendation to enable purchase orders appears when the user is on the suppliers
page, not on the billing page.

Recommendations are not notifications. They are contextual suggestions that appear
at the moment of maximum relevance.

---

## UX6 — No Jargon

Module names, capability keys, and system configuration terms never appear in the
user interface. The platform speaks the language of the business owner, not the
language of the engineering team.

---

# VII. Capability Philosophy

## What a Capability Is

A capability is a unit of business value that the platform can activate.

It is not a feature toggle. A feature toggle is a switch that turns something on.
A capability is a self-describing unit of functionality that declares what business
conditions indicate it is relevant, what it configures when activated, and what usage
signals indicate it is being used. It has a lifecycle. It can be recommended, enabled,
used, paused, and eventually retired.

Capabilities exist instead of feature toggles because:
- They carry their own recommendation logic. The platform knows when to suggest them.
- They carry their own configuration output. Enabling a capability is deterministic.
- They carry their own adoption signal. The platform knows whether they are being used.
- They can be added to the platform without modifying any existing code.

A feature toggle is a boolean in a configuration file. A capability is a self-aware
unit of business functionality that participates in the platform's intelligence layer.

## How Capabilities Evolve

A capability begins as HIDDEN — present in the registry but not surfaced to the user.
When the platform observes business signals that indicate relevance, the capability
becomes RECOMMENDED. When the user accepts, it becomes ENABLED. As it is used and
configured, it advances to CONFIGURED. If the user no longer needs it, it can be
PAUSED. If the feature is eventually retired from the platform, it transitions to
DEPRECATED.

This lifecycle ensures that capabilities are always in a known state. They are never
lost, never silently removed, and never forced on a business that did not choose them.

---

# VIII. Business Intelligence Philosophy

## How the Platform Learns

The onboarding survey is a hypothesis. It is the platform's best guess about what
the business needs based on a conversation that took five minutes.

That hypothesis is immediately tested by reality. Every time the business adds a
supplier, adjusts inventory, reconciles cash, or grows their team, the platform
observes. The observation rules evaluate this behavior and update the platform's
understanding of the business.

Within weeks, the platform's model of the business is driven primarily by what the
business actually does, not by what the business said during onboarding. The survey
answers become one input among many — the foundation, but not the final word.

## Why Onboarding Is Only the Beginning

Traditional software treats onboarding as a one-time configuration event. You set
up the system once and it runs the same way until you decide to change it.

This platform treats onboarding as the first page of an ongoing conversation.
The platform is always listening. It is always updating its understanding.
It is always preparing the next suggestion at the right moment.

Onboarding is not setup. It is introduction.

---

# IX. Business Evolution Philosophy

## Businesses Are Not Static

A sari-sari store that opens with one employee and twenty products is a different
business than that same store three years later with five employees, two hundred
products, and a regular supplier. The software that served it on day one should
still serve it on day one thousand — not by staying the same, but by growing.

## How the Software Evolves With the Business

The platform's model of the business — `BusinessCharacteristics` — is continuously
updated from observed behavior. When the business grows, the characteristics change.
When characteristics change, the capability evaluation runs again. When new capabilities
become relevant, they are offered.

This process requires no user action. The business simply operates. The platform pays
attention.

Profile graduation — when a business crosses from one operational profile to another —
is automatic. It triggers recommendations, not configuration changes. The business
decides what to adopt. The platform recognizes what is available.

## The Guarantee

A business that starts with the platform will never need to migrate to a different
system because they outgrew it. The platform grows with them. Every capability
they will ever need is already registered in the system, waiting for the right moment
to be offered.

---

# X. Data Ownership Principles

**Business modules own operational data.**
Transactions, inventory records, customers, suppliers, products — this data belongs
to the operational modules that create it. The BOS layer reads summaries; it never
reaches into operational data directly.

**The CharacteristicsEngine owns derived knowledge.**
`LivingCharacteristics` and `BusinessCharacteristics` are derived from observations.
They are produced by the intelligence layer. No other module writes to them
except through the defined input interfaces of the CharacteristicsEngine.

**Capabilities own their metadata.**
Every piece of metadata about a capability — its requirements, its outputs, its
recommendation logic — lives in the capability definition in the registry.
It is not spread across engine code, database records, and documentation.

**Recommendations own no business data.**
The RecommendationEngine scores and surfaces suggestions. It does not store or own
any business operational data. It reads from `BusinessCharacteristics` and
`BusinessCapabilityState`. Both are owned by the intelligence layer.

**Avoid duplicated state.**
If a fact can be derived, derive it. Do not store the same fact in two places and
synchronize them. `BusinessCharacteristics` is derived from survey answers,
usage observations, and config. It is not a copy of those sources — it is a synthesis.

---

# XI. Extension Philosophy

## How Future Capabilities Are Added

Every new capability is a registration, not a modification.

A developer who builds a new feature — Loyalty Points, Delivery Management, Kitchen
Display, AI Forecasting — registers it in the `CAPABILITY_REGISTRY` with its
requirements, boosters, outputs, and activation signals. The survey does not change.
The characteristics model does not change (unless the capability needs a new signal
that existing characteristics cannot provide, in which case one new characteristic
field is added).

The platform's intelligence layer evaluates the new capability automatically for every
business on the next recalculation cycle.

## What Never Changes When Adding a Capability

- The onboarding survey
- The CharacteristicsEngine's merging logic
- The CapabilityResolver's evaluation algorithm
- The ProfileClassifier's classification rules
- The ConfigurationEngine's output logic

These are the stable core. Capabilities register against them; they do not modify them.

---

# XII. Non-Goals

These are things this platform explicitly does not try to be.

**Not an ERP.** This platform does not try to replace accounting systems, HR platforms,
or supply chain management tools. It handles operations at the point of business — sales,
inventory, purchasing, team coordination. Integration with deeper enterprise systems
is a future concern, not a core function.

**Not a collection of disconnected modules.** Every capability in this platform is
connected to the same intelligence layer. There are no "add-ons" that operate in
isolation. Everything the platform knows about a business informs every recommendation
it makes.

**Not configuration-heavy software.** The platform does not present configuration panels
and ask the user to decide. It configures itself. Configuration panels exist for the
few decisions that genuinely require user judgment.

**Not an enterprise solution forced onto small businesses.** A solo vendor should be
able to start using this platform in ten minutes. Complex workflows, approval chains,
and multi-branch coordination are available but never imposed.

**Not a feature parity race.** The platform does not add capabilities because competitors
have them. It adds capabilities because businesses need them. "Competitor X has this
feature" is not a sufficient reason to build anything.

**Not a data vendor.** Business data belongs to the business. This platform never
monetizes, resells, or exposes the operational data of the businesses it serves.

---

# XIII. Engineering Principles

**E1 — Simplicity over cleverness.**
A simple solution that works is worth more than a clever solution that impresses.
When two approaches solve the same problem, choose the one that a new engineer can
understand without explanation.

**E2 — Build incrementally.**
Every phase must leave the system in a deployable state. No phase should depend on
a later phase to make sense. Build the foundation, then build on it.

**E3 — Optimize when data says to.**
Performance optimizations made before the system is under real load are usually
wrong and always expensive. Instrument everything. When data shows a bottleneck,
address it. When intuition says there might be a bottleneck, wait for data.

**E4 — Avoid premature abstraction.**
An abstraction that is not justified by at least two concrete cases is a solution
in search of a problem. The registry pattern is justified. The event bus is justified.
When in doubt, write the concrete solution first.

**E5 — Protect domain boundaries.**
A domain boundary violation is not a minor style issue. It is technical debt that
compounds. When the billing system starts importing from the BOS domain, the
eventual cost is a large refactoring project. Protect boundaries at code review.
An import statement that crosses a domain boundary should require explicit justification.

**E6 — Architecture enables delivery.**
The architecture exists to help the team deliver value faster and more reliably.
When an architectural decision is slowing delivery without providing a proportional
benefit, it must be revisited. Architecture is a means, not an end.

**E7 — Test the domain, not the infrastructure.**
Pure function tests are the foundation. Integration tests confirm the plumbing.
End-to-end tests confirm user scenarios. The balance should be 70% pure function
tests, 20% integration, 10% end-to-end. Inverting this pyramid means the tests
are slow and fragile.

---

# XIV. Decision Framework

When contributors face an uncertain decision, apply this hierarchy.

**1. Business value first.**
Does this decision make the platform more valuable to the businesses it serves?
If yes, it is justified. If no, it needs a different justification.

**2. User experience second.**
Does this decision make the platform easier and more pleasant to use?
Every feature that adds complexity for the user needs disproportionate business
value to justify it.

**3. Maintainability third.**
Does this decision make the codebase easier to understand, modify, and extend?
Code that is clever but unmaintainable is a liability.

**4. Performance fourth.**
Does this decision make the platform faster or more efficient?
Performance matters, but it is fourth — not first.

**5. Implementation complexity last.**
The fact that something is difficult to build is not a reason not to build it.
But it is a reason to look for a simpler approach first.

When any decision produces clear winners at the top of the hierarchy and clear
losers at the bottom, make the decision. When the hierarchy produces a tie, prefer
the option that is easier to change later.

---

# XV. Architecture Governance

## Architecture v1.0 is Frozen

As of August 2026, the Business Operating System architecture has reached v1.0.
It has been through four design iterations, a principal architect review, and a
readiness assessment. It is ready for implementation.

The architecture is now frozen. No component may be redesigned without an approved
Architecture Decision Record.

## Architecture Decision Records

An ADR is required when:
- A new module is proposed
- An existing module's responsibility is changed
- A new type of dependency is introduced between modules
- A non-negotiable architectural rule (the Ten Rules) is proposed to be changed
- A design decision made in v1.0 proves incorrect during implementation

An ADR is not required when:
- A new capability is added to the registry
- A new observation rule is added
- A new survey question is added
- Implementation details are refined within the boundaries of the existing architecture

### ADR Format

```
# ADR-NNN: [Title]

**Date:** [date]
**Status:** Proposed | Accepted | Rejected | Superseded

## Context
What situation led to this decision?

## Decision
What was decided?

## Consequences
What are the positive and negative outcomes of this decision?

## Alternatives Considered
What other options were evaluated?
```

ADRs are stored in `docs/decisions/`. They are numbered sequentially.
Once accepted, an ADR is never edited. If a decision is reversed, a new ADR supersedes it.

## Who Can Approve an ADR

Any ADR that changes the architecture must be reviewed by at least two contributors
before it is accepted. Solo developers should document their reasoning explicitly
and treat the requirement as a self-review forcing function.

---

# XVI. Closing Statement

This platform began as a point of sale system. It has become something more ambitious:
an adaptive operating system that learns from the businesses it serves and grows
alongside them.

The vision — that software should adapt to the business rather than demanding the
business adapt to the software — is not a feature. It is a design philosophy that
must inform every decision made on this project, from the largest architectural choice
to the smallest copy decision on a recommendation card.

Future contributors — whether human engineers, AI agents, or product designers —
inherit a responsibility along with the codebase. That responsibility is to preserve
the principles in this document not as rules enforced by a style guide, but as beliefs
about what software for businesses should be.

The platform is designed to last a decade. The principles in this document are
designed to last longer.

Build with care. Build for the business owner who trusts this platform to help them
run what they have built. That trust is the most important thing in this codebase.

Protect it.

---

*Architecture v1.0 — August 2026*
*This document is a living constitution. It may be amended by unanimous agreement
through the ADR process. Its spirit may never be compromised.*
