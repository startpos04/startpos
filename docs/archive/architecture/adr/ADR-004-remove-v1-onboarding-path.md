# ADR-004: Remove v1 Onboarding Path

**Status:** Accepted  
**Date:** August 2026  
**Deciders:** Engineering team  
**Phase:** 6 — Analytics + AI Seam + Observability

---

## Context

Phase 1 introduced the adaptive survey (v2) registration path alongside the original
`BUSINESS_TYPE_CONFIGS` (v1) path. A 30-day shadow-running period ran both paths
concurrently: the v1 config was applied to the DB; the v2 config was computed and
any disagreements were logged to console as `[completeRegistration] SHADOW_DIFF`.

The shadow-running acceptance criteria were defined in
`ADR-001-replace-business-type-config.md`:

| Config key | Max disagreement rate |
|---|---|
| `IS_VAT_REGISTERED` | < 2% |
| `ENABLE_ORDER` | < 5% |
| All other keys | < 10% |

After 30+ days of production traffic, the disagreement logs were reviewed. The v2
path produced functionally equivalent or improved configuration for all observed
business types. No systematic mis-classifications were found.

---

## Decision

**Remove the v1 path entirely.** Specifically:

1. **Delete `BUSINESS_TYPE_CONFIGS`** from `complete-registration.ts` — the static
   lookup table mapping `RESTAURANT | GROCERY | RETAIL` to hard-coded `SystemConfig`
   values is no longer needed.

2. **Delete `V1RegistrationSchema`** — the input schema variant that required
   `businessType` without `surveyAnswers` is removed. `surveyAnswers` is now required.

3. **Delete the `ONBOARDING_V2_SHADOW` shadow-run branch** — all the comparison
   logic, disagreement logging, and `isShadowMode` conditional is removed.

4. **Retain `businessType` as an optional input field** (deprecated) to avoid
   breaking any legacy clients still sending it during the rollout window. The field
   is accepted but ignored for config derivation.

5. **Deprecate the `businessType` column on the `Business` model** — add a
   deprecation comment. The column is not dropped yet; it is kept for query
   compatibility. It will be dropped in a later migration once all consumers are
   confirmed to use `onboardingProfile` / `currentProfile` instead.

6. **Remove the `ONBOARDING_V2_SHADOW` environment variable** from `.env.example`
   and any deployment configuration.

---

## Consequences

### Positive

- `complete-registration.ts` is significantly simpler — one path, one schema, no
  conditional branching on shadow mode.
- All new registrations write `onboardingSurveyAnswers`, `onboardingProfile`, and
  `currentProfile` — the intelligence layer has full data from day one.
- The `BusinessCapabilityState` rows are written at registration with analytics
  timestamps (`enabledAt`, `recommendedAt`), enabling Phase 6 recommendation analytics
  from the first registration.
- Eliminates a class of bugs where the shadow-mode flag was accidentally left `false`
  and a new registration used the wrong config path.

### Negative / Risks

- **Legacy clients:** Any client that sends `businessType` without `surveyAnswers`
  will now get a validation error. This is acceptable — the survey UI shipped in
  Phase 1 and all known clients send `surveyAnswers`.
- **businessType column:** Queries that still `WHERE businessType = 'RESTAURANT'`
  will continue to work (column not dropped), but the values stored at registration
  are now always the legacy default (`RETAIL` unless the client sends a value) rather
  than the actual business type. Those queries should migrate to use `currentProfile`.
- **No rollback to v1:** The v1 path is gone. If a critical regression is found in
  the v2 path, the fix is to correct the v2 engine, not to re-introduce v1.

---

## Migration path for `businessType` column

1. *(Done)* Add deprecation comment to schema column.
2. Audit all queries that read `businessType` from `Business` — replace with
   `currentProfile` or `onboardingProfile` where semantically equivalent.
3. Once no queries reference `businessType`, file a migration to make the column
   nullable, then a subsequent migration to drop it.
4. This is deferred to Phase 7+ when real production data confirms query coverage.

---

## Alternatives considered

**Keep the v1 path permanently as a "simple mode."**  
Rejected. Maintaining two registration paths doubles the surface area for bugs and
test coverage. The adaptive survey's 6-question path for solo businesses is as fast
as the v1 dropdown.

**Make `surveyAnswers` optional and synthesize answers from `businessType`.**  
Rejected. It would recreate the same v1 logic under a different name and undermine
the motivation for the v2 engine (which is to derive config from actual business
facts, not from a three-value enum).

---

*See also: ADR-001 (shadow-running strategy), Phase 6 implementation notes in
`IMPLEMENTATION_ROADMAP.md`.*
