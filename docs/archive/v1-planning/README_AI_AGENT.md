# AI Agent Execution Guide for V1.1

> **Purpose:** Help AI agents execute V1.1 issues efficiently without losing context

---

## 📁 File Structure

```
.kiro/v1-master-plan/
├── README_AI_AGENT.md              ← You are here
├── V1.1_ENHANCEMENT_PLAN.md        ← Index of all issues
├── V1.1_ISSUE_001_RENEWAL_PRICING.md     ← Ready ✅
├── V1.1_ISSUE_002_TRANSACTION_SNAPSHOTS.md ← Ready ✅
├── V1.1_ISSUE_003_*.md             ← Not yet created
└── V1.1_ISSUE_004_*.md             ← Not yet created
```

---

## 🤖 How to Use These Specs

### Step 1: Choose an Issue

Look at `V1.1_ENHANCEMENT_PLAN.md` and pick the highest priority issue with ✅ Ready status.

**Currently ready:**
- ✅ Issue #001: Renewal Pricing (HIGH priority, 2-3 days)
- ✅ Issue #002: Transaction Snapshots (MEDIUM priority, 1-2 days)

---

### Step 2: Read the Spec

Open the issue spec file (e.g., `V1.1_ISSUE_001_RENEWAL_PRICING.md`).

**Each spec contains:**
- ✅ Complete context (no need to read other files)
- ✅ Current state vs. required state
- ✅ Key files to understand
- ✅ Step-by-step tasks
- ✅ Copy-paste code examples
- ✅ Validation checklist
- ✅ Success criteria

---

### Step 3: Execute Tasks

Follow the tasks **in order**. Each task includes:

```markdown
### Task N: [Task Name]

**File:** path/to/file.ts

**Action:** What to do

**Code Example:**
```typescript
// Copy-paste ready code
```

**Validation:** How to check it worked
```

**Important Rules:**
- ⚠️ Do NOT run schema migrations automatically (wait for human review)
- ⚠️ Do NOT refactor existing code (only add new code)
- ⚠️ Use dynamic imports in webhooks (avoid circular deps)
- ⚠️ Log errors, don't throw from webhooks

---

### Step 4: Validate

After each task, check:
- TypeScript compiles
- Imports resolve
- Code matches existing patterns
- Tests pass (if tests exist)

---

### Step 5: Report

When complete, report:

```markdown
## Completion Report: Issue #00X

**Status:** ✅ Complete / ⚠️ Partial / ❌ Blocked

**Files Created:**
- path/to/new-file-1.ts (120 lines)
- path/to/new-file-2.ts (80 lines)

**Files Modified:**
- path/to/existing-file.ts (added 15 lines at line 460)
- prisma/schema.prisma (added 1 model, 1 relation)

**Validation Results:**
- [x] TypeScript compiles
- [x] Imports resolve
- [x] Code follows patterns
- [ ] Tests pass (waiting on human to write full tests)

**Items for Human Review:**
1. Schema migration needs approval before running
2. ADR-011 document added, needs architectural review
3. Placeholder tests added, need full implementation

**Deviations from Spec:**
None / [List any changes you made]

**Estimated Execution Time:** 35 minutes
```

---

## 🎯 Context Management Tips

### Why These Specs Are AI-Friendly

1. **Self-Contained:** Each spec has ALL context needed. No cross-referencing.
2. **Atomic Tasks:** Small, focused steps that fit in context window.
3. **Code Examples:** Copy-paste ready, minimal modification needed.
4. **Clear Boundaries:** Explicit "do not" rules prevent scope creep.
5. **Validation Steps:** Know when you're done.

### If You Lose Context

If you need to pause and resume:

1. **Bookmark your position:**
   ```
   Current: Issue #001, Task 3 of 5
   Last file modified: src/routes/api/billing/webhook/index.ts
   Next step: Add unit tests
   ```

2. **When resuming:**
   - Re-read the spec file (it's short)
   - Check git status to see what's been modified
   - Continue from bookmarked task

### If You Get Stuck

**Before asking human:**
1. Re-read the "Context for AI Agent" section in the spec
2. Check if there's a code example for this task
3. Look at similar existing files for patterns
4. Search codebase for similar implementations

**Ask human if:**
- Spec is ambiguous or contradictory
- Required file doesn't exist and no similar pattern found
- Validation fails and you can't determine why
- You need to deviate from spec significantly

---

## 📊 Estimated Effort

| Issue | Tasks | New Files | Modified Files | Lines of Code | Time |
|-------|-------|-----------|----------------|---------------|------|
| #001 | 5 | 2 | 3 | ~200 | 30-45 min |
| #002 | 5 | 2 | 3+ | ~180 | 30-40 min |

**Total for both:** ~1.5 hours AI execution time (excluding human review)

---

## ✅ Success Indicators

You've successfully completed an issue when:

1. All tasks in the checklist are done
2. TypeScript compiles without errors
3. All imports resolve
4. No business logic was changed (only additions)
5. Code follows existing patterns in the codebase
6. Validation checklist items pass
7. Completion report is written

---

## 🚫 Common Pitfalls to Avoid

### ❌ Don't Do This:
- Run `npx prisma migrate dev` automatically
- Refactor working code "to make it better"
- Add features not in the spec
- Change existing function signatures
- Use `throw` in webhook handlers

### ✅ Do This Instead:
- Mark schema changes for human review
- Only add new code, keep existing code intact
- Implement exactly what's in the spec
- Add new functions, don't modify existing ones
- Use `console.error` and return success in webhooks

---

## 🎓 Learning from Existing Patterns

Before writing code, look at these reference files:

**For pricing logic:**
- `src/lib/billing/pricing/pricing-engine.ts`
- `src/lib/jobs/composable-renewal-preview.ts`

**For webhook patterns:**
- `src/routes/api/billing/webhook/index.ts`

**For server functions:**
- `src/lib/server-fn/create-pricing-quote.ts`
- `src/lib/server-fn/convert-quote-to-subscription.ts`

**For tests:**
- `__tests__/unit/lib/billing/pricing-engine.test.ts`

**Match these patterns:**
- Import style
- Error handling approach
- DTO vs. model usage
- Comment style

---

## 📝 Example Execution Flow

```
1. Open V1.1_ENHANCEMENT_PLAN.md
   → See Issue #001 is ready

2. Open V1.1_ISSUE_001_RENEWAL_PRICING.md
   → Read "Context for AI Agent" section
   → Understand problem and solution

3. Execute Task 1: Add price history table
   → Open prisma/schema.prisma
   → Add model after BusinessSubscriptionFeature
   → Run npx prisma format
   → ✅ Syntax valid

4. Execute Task 2: Create renewal function
   → Create src/lib/server-fn/apply-renewal-price-updates.ts
   → Copy code example from spec
   → Adjust imports if needed
   → ✅ TypeScript compiles

5. Execute Task 3: Integrate webhook
   → Open src/routes/api/billing/webhook/index.ts
   → Find line 497 (after transaction closes)
   → Add code example from spec
   → ✅ TypeScript compiles

6. Execute Task 4: Add unit tests
   → Create __tests__/unit/lib/server-fn/apply-renewal-price-updates.test.ts
   → Copy code example from spec
   → Note: Full tests deferred to human review
   → ✅ File created

7. Execute Task 5: Create ADR
   → Open .kiro/OPERATIONAL/ARCHITECTURAL_DECISION_RECORDS.md
   → Append ADR-011 from spec
   → ✅ Done

8. Run validation checklist
   → TypeScript compiles: ✅
   → Imports resolve: ✅
   → Webhook integration clean: ✅
   → Tests exist: ✅ (placeholders)
   → Schema formatted: ✅

9. Write completion report
   → List 2 files created, 3 modified
   → Note items for review
   → Estimate: 35 minutes

10. ✅ Done - Issue #001 Complete
```

---

## 🏁 Ready to Start?

**Recommended starting point:**
```
Open: V1.1_ISSUE_001_RENEWAL_PRICING.md
Priority: HIGH
Effort: 2-3 days (30-45 min AI time)
Dependencies: None
```

Good luck! 🚀
