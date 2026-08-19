# Problems / Issues Tracking

> **Note:** This file should be renamed to `problems.md` (typo)

---

## V1.1 Issues (Tracked in Planning Docs)

**📋 See:** `.kiro/v1-master-plan/V1.1_ENHANCEMENT_PLAN.md` for full details

| # | Issue | Priority | Status | Spec File |
|---|-------|----------|--------|-----------|
| 001 | Renewal pricing updates | 🔴 HIGH | ✅ Ready | `V1.1_ISSUE_001_RENEWAL_PRICING.md` |
| 002 | Transaction snapshots | � HIGH | ✅ AI-READY | See below ⬇️ |
| 003 | GCash payment | 🔴 HIGH | ⏳ Needs spec | TBD |
| 004 | Recipe/production | 🟡 MED | ⏳ Needs spec | TBD |
| 005 | Registration safety | 🟢 LOW | Simple fix | N/A |

**Quick Summary:**
- **Issue #001:** Subscription renewal doesn't update snapshot prices → Need auto-update with audit trail
- **Issue #002:** Edit product name → old transactions show new name → Need snapshots (AI-optimized plan ready)
- **Issue #003:** Stripe blocks PH users → Need GCash manual payment system
- **Issue #004:** Raw chicken → fried chicken transformation not supported → Need recipe system
- **Issue #005:** Registration happens even if survey fails → Wrap in transaction

---

### 🤖 Issue #002: Transaction Snapshots — AI-OPTIMIZED EXECUTION PLANS

**Status:** ✅ Ready for AI execution — Each phase is self-contained

**📋 START HERE FOR AI EXECUTION:**
- **🤖 Master Index**: `.kiro/SNAPSHOT-EXECUTION-INDEX.md` — Overview, progress tracking, troubleshooting
- **Phase 1 Execution**: `.kiro/PHASE-1-EXECUTION.md` — Product/variant/category (4h)
- **Phase 2 Execution**: `.kiro/PHASE-2-EXECUTION.md` — Unit & tax (2h)
- **Phase 3 Execution**: `.kiro/PHASE-3-EXECUTION.md` — Business/branch (3h)

**Supporting Documentation:**
- Visual Roadmap: `.kiro/snapshot-roadmap.md`
- Quick Reference: `.kiro/snapshot-fields-summary.md`
- Complete Audit: `.kiro/transaction-snapshot-audit.md`

**AI Agent Features:**
- ✅ Complete context embedded in each phase file
- ✅ No external dependencies between phases
- ✅ Exact code snippets with line numbers
- ✅ grep commands to find code
- ✅ Validation after each step
- ✅ Coverage monitoring built-in
- ✅ Can pause/resume between phases

**Phased Approach:**
1. **Phase 1** (4h): OrderItem core — Product names, variants, categories
2. **Phase 2** (2h): Unit & tax — Unit details, tax compliance
3. **Phase 3** (3h): Business/branch — Receipt reprints, BIR audit

**Total:** 27 fields | 9 hours | 3 independent phases

**Next:** AI agent executes starting with `SNAPSHOT-EXECUTION-INDEX.md`

---

## V1.0 Unresolved Issues

### 1. Build Error — OPFS Worker 404

**Status:** Investigating  
**Environment:** Production build

```
GET http://localhost:3000/assets/opfs-worker-uyjx5Rus-C7ET1XBj.js
Status: 404
Referrer Policy: strict-origin-when-cross-origin
```

**Likely Cause:** Vite worker plugin config or service worker path  
**Next Step:** Check `vite.config.ts` and `public/sw.js`

---

### 2. E2E Test UI Not Working

**Status:** Needs reproduction steps  
**Environment:** Playwright UI mode

Playwright UI mode not launching or tests not visible.

**Next Step:** Run `npm run test:e2e:ui` and capture error output

---

### 3. Registration Flow — Transaction Safety

**Problem:** User account created even if business survey API fails

**Current Flow:**
1. Create user account ✅
2. Submit survey → API fails ❌
3. Result: User exists but no business data

**Proposed Fix:**
```typescript
await dbTransaction(async (db) => {
  const user = await createUser(...)
  const business = await createBusiness(surveyData)
  await linkUserToBusiness(user.id, business.id)
  // All or nothing
})
```

**Priority:** 🟢 LOW (minor data integrity issue)  
**Effort:** 0.5 days

---

## Historical Context

### Transaction Snapshot Analysis

**⚠️ Note:** There appear to be TWO separate snapshot efforts:

1. **OrderItem Snapshots** (Phased plan in `PHASED-SNAPSHOT-PLAN.md`)
   - 27 fields across 3 phases
   - Focuses on POS receipts, sales reports
   - Has detailed diagrams and implementation guide

2. **Transaction Model Snapshots** (V1.1 Issue #002)
   - 5 fields (product name, SKU, unit, category)
   - Focuses on general transactions
   - Simpler scope, faster implementation

**TODO:** Reconcile these two efforts — may be different transaction types (OrderItem vs Transaction model)

---

## Notes

- All V1.1 issues have AI-agent-optimized specs with:
  - Self-contained context
  - Step-by-step atomic tasks
  - Copy-paste code examples
  - Clear success criteria
  
- Issues #001 and #002 are ready for immediate execution
- Issues #003 and #004 need domain modeling before specs can be written
