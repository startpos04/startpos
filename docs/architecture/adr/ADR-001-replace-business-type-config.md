# ADR-001: Replace BUSINESS_TYPE_CONFIGS with CapabilityRegistry

**Status:** Accepted  
**Date:** August 2026  
**Phase:** 1 (Pre-implementation gate complete)  
**Engineers:** Implementation team

---

## Context

`complete-registration.ts` currently accepts `{ businessType: 'RESTAURANT' | 'GROCERY' | 'RETAIL' }`
and looks up `BUSINESS_TYPE_CONFIGS[businessType]` to produce a fixed config set.

This approach has three problems:

1. **Three business types cannot represent the diversity of real businesses.** A solo street vendor and a multi-branch restaurant chain both register as RESTAURANT but need completely different configurations.

2. **The config is static and never updates.** A business that starts as RETAIL and grows to need inventory tracking, purchase orders, and multi-branch support has no way to receive those configurations without a manual support ticket.

3. **Adding a new capability requires editing `BUSINESS_TYPE_CONFIGS`.** There is no registry; logic is inlined.

---

## Decision

Replace `BUSINESS_TYPE_CONFIGS` with:

1. **Adaptive survey** (`SurveyInterpreter`) — 6–18 questions depending on business type, replacing the static dropdown.
2. **`CAPABILITY_REGISTRY`** (`capability-resolver.ts`) — self-describing capabilities that evaluate against `BusinessCharacteristics`.
3. **`ConfigurationEngine`** — produces `BusinessConfiguration` from resolved capabilities and the operational profile.
4. **Shadow-running** via `ONBOARDING_V2_SHADOW=true` — both engines run in parallel for 30 days, v1 config is applied, diffs are logged.

### What changes

| Component | Before | After |
|---|---|---|
| Registration input | `{ businessType: 'RESTAURANT' \| 'GROCERY' \| 'RETAIL' }` | `{ surveyAnswers: SurveyAnswers }` |
| Config derivation | `BUSINESS_TYPE_CONFIGS[type]` lookup | `ConfigurationEngine.build(...)` |
| Business model | `businessType` column only | + `currentProfile`, `onboardingProfile`, `livingCharacteristics` (Phase 2+) |

### What does NOT change

- The `businessType` column is deprecated but not dropped. Existing businesses are unaffected.
- All `BUSINESS_TYPE_CONFIGS` behavior is preserved via shadow-running comparison.
- The entitlement system (`Feature` + `PlanEntitlement`) is unchanged.

---

## Shadow-Running Acceptance Criteria (R5)

Before cutting over `complete-registration.ts` to use only the v2 engine, the
following thresholds must be met over a 30-day shadow period:

### Go/No-Go Gates

| Capability / Config Key | Max Disagreement Rate | Severity | Action if exceeded |
|---|---|---|---|
| `IS_VAT_REGISTERED` | **2%** | 🔴 Critical (compliance) | Immediate halt — investigate all disagreements before proceeding |
| `ENABLE_ORDER` | **5%** | 🔴 Critical (operational) | Halt — determine root cause before proceeding |
| `PRICE_CONFIGURATION` | **3%** | 🔴 Critical (compliance) | Halt — INCLUSIVE/EXCLUSIVE mismatch affects VAT calculations |
| `ENABLE_PRINT_RECEIPT` | **8%** | 🟡 Investigate | Review but do not halt |
| `ENABLE_CASH_RECONCILIATION` | **10%** | 🟡 Investigate | Review but do not halt |
| `ENABLE_TASK` | **10%** | 🟢 Acceptable | Log only |
| `ENABLE_ORDER_TAB` | **15%** | 🟢 Acceptable | Log only |

### How disagreement rate is calculated

```
disagreement_rate(KEY) = count(v1_value[KEY] ≠ v2_value[KEY]) / total_registrations
```

Measured over a rolling 30-day window on new registrations only.

### Automated halt condition

If any critical gate is breached, the shadow-running comparison job must:
1. Log an alert with the diff details
2. Automatically set `ONBOARDING_V2_SHADOW=false` to stop accumulating bad diffs
3. Send a notification to the engineering team

### Manual review requirement

Before cutting over (even if all gates pass):
- Sample 20 random shadow-run diffs and manually verify each one is expected
- Confirm that any disagreements are explained (e.g. RETAIL with VAT survey answer vs. no VAT in BUSINESS_TYPE_CONFIGS)
- Document the explanation in this ADR as an update

### Rollback strategy

If shadow-running reveals systematic failures after cutover:
1. Set `ONBOARDING_V2_SHADOW=false` — new registrations immediately use v1 path
2. Businesses registered via v2 retain their config (functionally equivalent to v1 for matched profiles)
3. Fix issues, extend shadow period, re-evaluate

---

## Consequences

### Positive
- Any business can now be correctly configured from day one, regardless of type.
- Adding a new capability requires one registry entry — no config table edits.
- Shadow-running provides 30 days of validation data before any risk is taken.
- The survey produces `BusinessCharacteristics`, which is reused by the recommendation and intelligence engines in Phase 2+.

### Negative / Trade-offs
- The input schema for `complete-registration.ts` changes. The registration UI must be updated to pass `surveyAnswers` instead of `businessType`.
- The shadow period adds 30 days before the v1 path can be removed (Phase 6).
- Survey interpretation logic is a new code surface — bugs in `SurveyInterpreter` affect all new registrations.

### Mitigations
- Pattern A tests cover every survey answer mapping.
- `validateRegistry()` catches structural registry errors at build time.
- Shadow-running with defined acceptance criteria catches systematic failures before cutover.

---

## Alternatives Considered

### Alternative 1: Expand BUSINESS_TYPE_CONFIGS to 9 types
Rejected. Each new type still requires manual config editing. The diversity of real businesses cannot be captured by a fixed set of types no matter how many are added.

### Alternative 2: Let businesses configure themselves post-registration
Rejected. Most businesses do not know which config flags to enable. The survey drives discovery; the registry drives configuration — this is the right division of responsibility.

---

## Related

- `ONBOARDING_MASTER_PLAN.md` — full architecture specification
- `PRINCIPAL_ARCHITECT_REVIEW.md` — R5 requirement origin
- Phase 6: ADR-004 (shadow-run retirement) — filed when 30-day criteria are met
