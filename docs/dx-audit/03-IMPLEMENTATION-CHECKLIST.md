# Quick Start Checklist - Fix DX Issues

**Goal:** Get from 🔴 to 🟢 in 3-4 weeks

---

## Week 1: Critical Fixes (DO THIS FIRST)

### Day 1: Enable Git Hooks ⏱️ 30 min

- [ ] Open `lefthook.yml`
- [ ] Uncomment all hook sections (pre-commit, commit-msg, pre-push, post-checkout)
- [ ] Test locally:
  ```bash
  pnpm lefthook install
  pnpm lefthook run pre-commit
  ```
- [ ] Commit the change:
  ```bash
  git add lefthook.yml
  git commit -m "chore: re-enable lefthook git hooks"
  ```

**Success criteria:** Hooks run automatically on git operations

---

### Days 2-3: Fix Router Navigation Types ⏱️ 4-6 hours

Search for all `<Link` components missing `search` prop:

- [ ] `src/components/custom/dashboard/app-breadcrumb.tsx`
- [ ] `src/components/custom/dashboard/app-sidebar.tsx` (3 instances)
- [ ] `src/components/custom/dashboard/notification-btn.tsx` (2 instances)
- [ ] `src/components/feature-library.tsx` (2 instances)
- [ ] `src/components/first-run-guide.tsx` (2 instances)
- [ ] `src/components/guidance-banner.tsx`
- [ ] `src/components/pages/feature-disabled-page.tsx`
- [ ] `src/components/subscription-banner.tsx`

**Pattern to fix:**
```typescript
// ❌ Before
<Link to="/dashboard">Dashboard</Link>

// ✅ After
<Link to="/dashboard" search={{}}>Dashboard</Link>
```

**Verify:**
```bash
pnpm ts  # Should have fewer errors
```

---

### Days 4-5: Fix exactOptionalPropertyTypes ⏱️ 2-4 hours

#### File 1: `src/components/require-access.tsx`

Find lines 120, 122, 126 and fix:

```typescript
// ❌ Before
const inline: boolean | undefined = props.inline

// ✅ After - Option A: Remove undefined
const inline: boolean = props.inline ?? false

// ✅ After - Option B: Change prop type
type Props = {
  inline?: boolean | undefined  // Explicitly allow undefined
}
```

#### File 2: `src/components/require-permission.tsx`

Find lines 135, 137 and apply same fix.

**Verify:**
```bash
pnpm ts  # Should pass with 0 errors
```

---

## Week 2: Type Derivation Migration

### Day 1: Audit Current Types ⏱️ 4 hours

- [ ] List all files with `interface` or `type` definitions
  ```bash
  grep -r "^interface \|^type \|^export interface\|^export type" src/ --include="*.ts" --include="*.tsx" > types-audit.txt
  ```
- [ ] For each type, check:
  - [ ] Does it exist in Prisma? → Delete and import from Prisma
  - [ ] Can it be derived? → Use Pick/Omit/Extend
  - [ ] Is it in wrong file? → Move to domain types
  - [ ] Is it truly novel? → Keep it

### Days 2-3: Replace `any` Types ⏱️ 6-8 hours

Priority files (most `any` usage):

- [ ] `src/lib/better-auth/permission-middleware.ts` (6 instances)
  ```typescript
  // ❌ role: user.role as any
  // ✅ Import Role enum from Prisma
  import type { Role } from 'prisma/generated/prisma/enums'
  ```

- [ ] `src/lib/production/production-engine.ts` (3 instances)
  ```typescript
  // ❌ components?.filter((c: any) => ...)
  // ✅ Define proper component type based on Prisma
  ```

- [ ] `src/lib/queries/permission-management.ts` (2 instances)
- [ ] `src/routes/(private)/(dashboard)/business/permissions/` (3 instances)

**Pattern:**
1. Find what the `any` represents
2. Check if it exists in Prisma schema
3. Import proper type or derive it
4. Remove `as any` cast

**Verify after each file:**
```bash
pnpm ts
pnpm lint
```

### Days 4-5: Add JSON Type Safety ⏱️ 6-8 hours

Files with untyped JSON operations:

- [ ] `src/lib/notification/notification-engine.ts`
  - Create `NotificationMetadataSchema` in `src/lib/notification/notification-types.ts`
  - Use `typedJsonStringify` from `@/lib/json-utils`

- [ ] `src/lib/notification/usage-threshold-policy.ts`
  - Use `safeJsonParse` instead of raw `JSON.parse`

- [ ] `src/store/auth-store.ts`
  - Create `AuthStorageSchema`
  - Use `setLocalStorage` helper

- [ ] `src/routes/api/billing/webhook/index.ts`
  - Create typed response helpers

**Pattern:**
```typescript
// 1. Define schema
const MetadataSchema = z.object({
  field: z.string()
})

// 2. Use typed helpers
import { typedJsonStringify, safeJsonParse } from '@/lib/json-utils'

const json = typedJsonStringify(data, MetadataSchema)
const result = safeJsonParse(json, MetadataSchema)
```

---

## Week 3: Code Quality

### Days 1-2: Clean Up Unused Code ⏱️ 4 hours

- [ ] Run auto-fix:
  ```bash
  pnpm biome check --write .
  ```
- [ ] Manually review changes
- [ ] Test affected areas
- [ ] Commit:
  ```bash
  git add .
  git commit -m "chore: remove unused imports and variables"
  ```

### Day 3: Fix Accessibility Issues ⏱️ 3 hours

- [ ] `src/routes/(private)/(dashboard)/(admin)/preparation/history.tsx`
  - Add `htmlFor` to labels
  - Add keyboard handlers to clickable divs
  - Add button types

- [ ] Other a11y violations from Biome report

### Days 4-5: Fix React Hook Dependencies ⏱️ 2-3 hours

- [ ] `src/routes/(private)/(dashboard)/business/branches/index.tsx:505`
  - Add missing `handleDelete` to useMemo dependencies

- [ ] Review all `useExhaustiveDependencies` warnings
- [ ] Add missing dependencies or add comment explaining why not needed

---

## Week 4: Polish & Monitoring

### Day 1: Documentation ⏱️ 2-3 hours

- [ ] Update README with:
  - Type derivation principles
  - Link to TYPE-DERIVATION-GUIDE.md
  - Development workflow with Lefthook

- [ ] Create CONTRIBUTING.md:
  - Type safety requirements
  - Pre-commit checklist
  - How to handle JSON data

### Day 2: Strengthen Biome Config ⏱️ 1-2 hours

- [ ] Update `biome.json`:
  ```json
  {
    "linter": {
      "rules": {
        "suspicious": {
          "noExplicitAny": "error"  // Enforce no any
        },
        "style": {
          "noNonNullAssertion": "warn"  // Warn on ! operator
        }
      }
    }
  }
  ```

- [ ] Run and fix new violations:
  ```bash
  pnpm lint
  ```

### Day 3: Add Type Coverage Monitoring ⏱️ 1 hour

- [ ] Install type-coverage:
  ```bash
  pnpm add -D type-coverage
  ```

- [ ] Add scripts to `package.json`:
  ```json
  {
    "scripts": {
      "type-coverage": "type-coverage --detail --at-least 95",
      "type-coverage:report": "type-coverage --detail --output-format json"
    }
  }
  ```

- [ ] Run initial report:
  ```bash
  pnpm type-coverage
  ```

### Days 4-5: CI/CD Integration ⏱️ 2-3 hours

- [ ] Add type-check to CI pipeline
- [ ] Add Biome check to CI pipeline
- [ ] Add type-coverage report to CI
- [ ] Set up coverage badges

---

## Verification Commands

Run these after each day's work:

```bash
# TypeScript errors
pnpm ts

# Biome issues
pnpm lint

# Run tests
pnpm test

# Type coverage
pnpm type-coverage

# Full validation
pnpm validate  # (add this script if missing)
```

---

## Success Criteria

### Week 1 Complete ✅
- [ ] Lefthook runs on all git operations
- [ ] `pnpm ts` passes with 0 errors
- [ ] All `<Link>` components have `search` prop
- [ ] No `exactOptionalPropertyTypes` violations

### Week 2 Complete ✅
- [ ] <5 instances of `any` in codebase
- [ ] All JSON operations use typed helpers
- [ ] Type coverage >90%
- [ ] All Prisma-duplicated types removed

### Week 3 Complete ✅
- [ ] Biome errors: 0
- [ ] Biome warnings: <5
- [ ] All a11y issues fixed
- [ ] No React hook dependency warnings

### Week 4 Complete ✅
- [ ] Documentation updated
- [ ] Type coverage >95%
- [ ] CI pipeline includes all checks
- [ ] Team onboarded to new patterns

---

## Rollback Plan

If something breaks:

```bash
# Revert last commit
git revert HEAD

# Revert specific file
git checkout HEAD~1 -- path/to/file

# Disable hooks temporarily (emergency only)
LEFTHOOK=0 git commit -m "emergency fix"
```

---

## Daily Standup Template

**Yesterday:**
- [ ] What did I fix?
- [ ] What errors did I encounter?

**Today:**
- [ ] What am I fixing today?
- [ ] Which checklist items?

**Blockers:**
- [ ] Any unresolved type errors?
- [ ] Any questions about patterns?

---

## Quick Reference

**Read first:**
- AUDIT-SUMMARY.md (this is your overview)
- TYPE-DERIVATION-GUIDE.md sections 1-3

**When stuck:**
- TYPE-DERIVATION-GUIDE.md (full examples)
- DEVELOPMENT-AUDIT-REPORT.md (detailed analysis)

**Tools:**
```bash
pnpm ts              # TypeScript check
pnpm lint            # Biome lint
pnpm format          # Biome format
pnpm check           # Biome check + fix
pnpm type-coverage   # Type coverage
```

---

## Contact / Questions

If you need clarification on:
- **Type patterns** → See TYPE-DERIVATION-GUIDE.md
- **Specific errors** → See DEVELOPMENT-AUDIT-REPORT.md
- **Prisma types** → Check `prisma/generated/prisma/`
- **Existing patterns** → Search codebase for similar code

---

**Let's get started! Begin with Week 1, Day 1. 🚀**
