# ADR-005: Threshold Change — [CAPABILITY_ID or RULE_NAME]

**Status:** [Proposed | Accepted | Superseded by ADR-NNN]  
**Date:** [YYYY-MM-DD]  
**Deciders:** Engineering team  
**Phase:** 7 — Threshold Tuning + Production Hardening  
**Data window:** [Start date] → [End date] (minimum 90 days required)

---

> **How to use this template**
>
> Copy this file to `docs/decisions/ADR-005-[short-description].md`.
> Fill in every section. Do not skip the data section — a threshold change
> without data rationale is an architectural violation.
>
> Run `pnpm test` after any change to confirm the registry validation passes.
> Delete this instruction block before merging.

---

## What is being changed

**File:** `src/lib/onboarding/capability-registry.ts` (or `observation-rules.ts` for rule confidence)

**Change type:** _(circle one)_
- Capability `threshold` value
- Capability `recommendationScore()` function weights
- ObservationRule `confidence` value
- `SOURCE_DECAY_PARAMS` grace/stale window
- Other: ___________

**Before:**
```ts
// Example — replace with actual before value
threshold: 0.4,
```

**After:**
```ts
// Example — replace with actual after value
threshold: 0.6,
```

---

## Data that supports this change

> All fields below are required. If any are unavailable, the change is premature.

| Metric | Value |
|---|---|
| Data window start | [date] |
| Data window end | [date] |
| Total businesses in sample | [N] |
| Total recommendations issued | [N] |
| Acceptance rate (before change) | [X%] |
| Dismissal rate (before change) | [X%] |
| Abandonment rate (before change) | [X%] |
| Avg days from RECOMMENDED → ENABLED | [N days] |
| Threshold used by `auditThresholds()` that flagged this | LOW_ACCEPTANCE / HIGH_DISMISSAL / HIGH_ACCEPTANCE / SLOW_ACTIVATION |
| Severity reported | action-required / warn / info |

**Source queries:**
```ts
// Show the exact fetchRecommendationAnalytics() call and auditThresholds() output
// that produced the data above. This makes the ADR reproducible.
import { fetchRecommendationAnalytics } from '@/lib/evolution/recommendation-analytics'
import { auditThresholds } from '@/lib/evolution/threshold-tuning-guide'

const report = await fetchRecommendationAnalytics()
const audit = auditThresholds(report.stats)
// → paste relevant output here
```

---

## Worked example (MANAGE_INVENTORY — hypothetical)

> This section shows a complete worked example. Replace with your actual data.

**Capability:** `MANAGE_INVENTORY`  
**Change:** Raise `threshold` from `0.4` → `0.55`

**Data (hypothetical — not real production numbers):**

| Metric | Value |
|---|---|
| Data window | 2026-08-01 → 2026-11-01 (92 days) |
| Total businesses in sample | 847 |
| Total MANAGE_INVENTORY recommendations | 312 |
| Acceptance rate | 9.3% |
| Dismissal rate | 61.2% |
| Avg days to enable (accepted) | 18.4 days |
| auditThresholds() signal | LOW_ACCEPTANCE + HIGH_DISMISSAL |
| Severity | action-required |

**Interpretation:**  
312 businesses were shown MANAGE_INVENTORY, but only 29 enabled it. 191 dismissed it.
The current `threshold = 0.4` allows the capability to surface when the average booster
score is low — businesses with a single supplier or minimal inventory activity are
seeing the recommendation before they genuinely need it.

**Proposed change:**  
Raise `threshold` to `0.55`. This requires a higher average booster confidence before
the capability auto-enables or surfaces as RECOMMENDED. Businesses with `inventoryCriticality
= 'strict'` or `usesSuppliers = true AND tracksInventory = true` will still see it;
businesses with only one weak signal will not.

**Expected outcome:**  
Recommendation count drops by approximately 40% (targeting the low-signal businesses).
Acceptance rate should rise above the 15% baseline. Verify after 30 days of production.

---

## Risk assessment

**What could go wrong:**  
- If the threshold is raised too aggressively, businesses that genuinely need inventory
  tracking may not see the recommendation. Monitor acceptance rate for 30 days after
  the change.
- The `recommendationScore()` function may also need adjustment — if it returns high
  values even at low booster averages, raising the threshold alone is insufficient.

**Rollback:**  
Revert the threshold value in `capability-registry.ts`. The change is a one-line edit
with no DB migration required. No `pnpm prisma migrate` needed.

**Verification:**  
After 30 days, re-run `auditThresholds()`. The LOW_ACCEPTANCE flag for this capability
should no longer appear at action-required severity.

---

## Consequences

**Positive:**  
- Recommendation quality improves for this capability.
- Dismissal rate drops, reducing recommendation fatigue.

**Negative / trade-offs:**  
- Some businesses that would have benefited from the capability may not see it.
  They can still enable it manually via Settings → Capabilities.

---

*For the threshold audit tool, see `src/lib/evolution/threshold-tuning-guide.ts`.*  
*For the raw analytics query, see `src/lib/evolution/recommendation-analytics.ts`.*  
*For the observation rule audit, query `BusinessEventLog WHERE type = CAPABILITY_STATE_CHANGED`.*
