# ADR-003: Confidence Decay Rates for Living Characteristics

**Status:** Accepted  
**Date:** August 2026  
**Deciders:** Engineering team  
**Phase:** 4 — Business Profile + Health + Full Intelligence

---

## Context

`LivingCharacteristics` stores each characteristic field as a `SourcedValue<T>` — a
value annotated with where it came from (`source`), how confident we are it is
still accurate (`confidence: 0.0–1.0`), and when it was last observed (`observedAt`).

As time passes, observations become stale. A business that had one supplier two
years ago may no longer use suppliers. A usage-based observation from six months
ago is less reliable than one from last week. Without decay, the system would
treat a year-old observation with the same confidence as a fresh one, leading to
incorrect capability recommendations being surfaced indefinitely.

### Why decay is needed

Without decay, the following failure modes occur:

1. **Stale RECOMMENDED capabilities** — a business that briefly hit the
   `supplierCount ≥ 1` threshold would see the Purchase Orders recommendation
   indefinitely, even if the supplier was deleted.
2. **No signal for dormant businesses** — a business that stops using the app
   would retain full-confidence characteristics forever, meaning the backfill job
   and recalculation sweeps treat it as if it were active.
3. **ADMIN_DECISION correctness** — without decay, there is no distinction between
   an admin correction made yesterday and one made three years ago. Admin decisions
   should be permanent; usage observations should not be.

### Why this decision was deferred from Phase 2

The Phase 2 roadmap explicitly deferred decay to Phase 4, documented in the
Technical Debt section:

> *"Needs real data to calibrate; implementing theory-based rates is wasteful."*

The decay parameters (grace window and stale threshold) directly affect
recommendation quality. Setting them too aggressively causes valid observations
to expire, producing false "you should set this up" recommendations for active
businesses. Setting them too conservatively defeats the purpose. Without production
data, any values chosen would be pure guesses.

Phase 4 ships the implementation with conservative initial rates. Phase 7 tunes
them using real acceptance and dismissal data after 90 days.

---

## Decision

Implement **linear confidence decay** with a **per-source** grace window and stale
threshold. The decay function is:

```
if age ≤ graceWindowDays:     confidence = original confidence (no decay)
if age ≥ staleAfterDays:      confidence = 0 (fully stale)
if graceWindowDays < age < staleAfterDays:
    decayProgress = (age - graceWindowDays) / (staleAfterDays - graceWindowDays)
    confidence = originalConfidence × (1 - decayProgress)
```

### Source decay parameters (`SOURCE_DECAY_PARAMS` in `src/lib/evolution/types.ts`)

| Source | Grace window | Stale after | Rationale |
|---|---|---|---|
| `ADMIN_DECISION` | ∞ | ∞ | Explicit human override — never expires automatically |
| `SYSTEM_CONFIG` | ∞ | ∞ | Reflects live system state — always current |
| `SURVEY_ANSWER` | ∞ | ∞ | Survey is a one-time statement of intent — does not expire; user must correct explicitly |
| `USAGE_OBSERVATION` | 30 days | 120 days | Usage data refreshes on the weekly job; 30 days of no activity starts decay; fully stale at 4 months |
| `BUSINESS_EVENT` | 60 days | 180 days | Events reflect structural changes (added a branch, hired staff); these change less frequently than usage metrics |
| `AI_INFERENCE` | 14 days | 60 days | AI inferences are the least trustworthy source; they should refresh frequently |

### Why linear decay over exponential or step decay

- **Linear** is easy to understand, audit, and explain to operators.
  "Confidence dropped from 0.95 to 0.71 because the observation is 45 days old
  and the stale threshold is 120 days" is immediately reproducible.
- **Exponential** decay would front-load the decay effect, causing observations
  to lose confidence rapidly in the first few days then plateau. This does not
  match the business reality of weekly job cadence.
- **Step decay** (full confidence → zero at a date threshold) is too abrupt
  and produces hard cutoffs that cause recommendation oscillation near the
  boundary.

### Implementation

File: `src/lib/evolution/characteristics-engine.ts`

```ts
export function applyDecay<T>(
  sourced: SourcedValue<T>,
  now: Date,
  graceWindowDays: number,
  staleAfterDays: number,
): SourcedValue<T>
```

Called during the `computeCharacteristics()` pass, after observation rules are
applied but before the result is projected to flat `BusinessCharacteristics`.
Only `USAGE_OBSERVATION` and `BUSINESS_EVENT` sources are decayed in practice
(all others have `Infinity` parameters which the function short-circuits).

The decay function never mutates the stored value — it returns a new `SourcedValue`
with a lower confidence. The value itself is preserved so it can be restored if
the source re-fires (e.g. the business adds a supplier again).

### Sources that never decay

`ADMIN_DECISION`, `SYSTEM_CONFIG`, and `SURVEY_ANSWER` all have
`graceWindowDays: Infinity`. The `applyDecay` function detects this with
`!isFinite(graceWindowDays)` and returns the original value unchanged.

This is intentional:
- **ADMIN_DECISION** — an operator correction is explicit intent; it should persist
  until the operator changes it again.
- **SYSTEM_CONFIG** — config values are live state; they do not go stale.
- **SURVEY_ANSWER** — the survey is a one-time onboarding statement. It should
  persist until the business corrects it via the Business Profile editor.

---

## Consequences

### Positive

- Stale usage observations no longer produce permanent recommendations.
- Dormant businesses gradually have their characteristics reset toward defaults,
  meaning the recommendation engine stops producing irrelevant offers.
- The implementation is pure (`applyDecay` has no IO) — fully unit-testable with
  fixed `now` dates.
- Admin corrections and live config always win — users never lose their explicit
  settings to background decay.

### Negative / Trade-offs

- **Conservative initial rates** — the chosen rates (30-day grace, 120-day stale
  for usage observations) may be too conservative or too aggressive for some
  business types. Phase 7 threshold tuning is the mechanism for adjusting these
  based on real data.
- **Weekly job dependency** — decay only runs when `runRecalculationBatch()` is
  called. A business that is not in the recalculation queue will not have its
  confidence updated. In practice, any business that receives a new usage event
  will be re-queued, so dormant businesses are the main case where decay lags.
- **Survey answers never expire** — a survey answer from three years ago retains
  full confidence. This is intentional but means the Business Profile editor must
  be the user's path to correction, not an automatic expiry. The passive intent
  field expiry UI (Phase 5, `intent-expiry-checker.ts`) handles the specific case
  of intent fields.

---

## Alternatives considered

### A — Decay all sources uniformly

Rejected. Admin corrections and live config should not expire. A business owner
who explicitly set `tracksInventory = false` should not have that override silently
decay back to `true` because a usage observation exists.

### B — Expiry (hard cutoff rather than decay)

Rejected for the same reasons as step decay above — abrupt cutoffs cause
recommendation oscillation near the boundary date. Linear decay produces a
smooth degradation that the confidence merge logic (higher confidence wins)
handles naturally.

### C — No decay

Rejected. Without decay the system cannot distinguish between fresh observations
and observations from years ago, leading to permanently stale recommendations for
businesses that change how they operate.

---

## Phase 7 tuning guidance

When 90 days of production data is available, run `auditDecayedCharacteristics()`
from `src/lib/evolution/characteristics-engine.ts` against a sample of active
businesses. If ≥ 10% of active businesses have characteristics that have fully
decayed to `confidence = 0`, the grace window is too short for their operating
cadence and should be extended.

Any change to `SOURCE_DECAY_PARAMS` requires a follow-on ADR (ADR-005 or later)
with the data rationale. See `docs/decisions/ADR-005-threshold-change-template.md`.

---

*See also: `src/lib/evolution/types.ts` (SOURCE_DECAY_PARAMS), `src/lib/evolution/characteristics-engine.ts` (applyDecay), `src/lib/evolution/threshold-tuning-guide.ts` (Phase 7 audit tooling).*
