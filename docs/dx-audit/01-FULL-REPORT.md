# Development Experience Audit Report

**Date:** August 23, 2026
**Project:** start-pos
**Focus Areas:** TypeScript Strictness, Biome Compliance, Lefthook Integration, JSON Type Safety

---

## Executive Summary

The project has a **strong foundation** with strict TypeScript configuration and modern tooling, but there are **critical issues** that need immediate attention:

- ✅ **TypeScript Config:** Excellent strict mode settings with `exactOptionalPropertyTypes` enabled
- ⚠️ **Type Safety Violations:** 30+ TypeScript errors blocking type-checking
- ⚠️ **Biome Linting:** 52+ lint violations (14 errors, 33 warnings, 5 infos)
- ❌ **Lefthook:** Completely disabled - no pre-commit or pre-push guards active
- ⚠️ **JSON Type Safety:** Untyped JSON.parse/stringify usage throughout codebase

**Risk Level:** 🔴 **HIGH** - The disabled hooks mean code is being committed without validation

---

## 1. TypeScript Compliance Analysis

### Current Configuration Strengths

Your `tsconfig.json` is **exceptionally strict**:

```json
{
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "noUncheckedSideEffectImports": true,
  "allowUnusedLabels": false,
  "allowUnreachableCode": false,
  "noUncheckedIndexedAccess": true,          // ✅ Excellent
  "noPropertyAccessFromIndexSignature": true, // ✅ Excellent
  "exactOptionalPropertyTypes": true          // ✅ Rare and excellent
}
```

### Critical Type Errors (30+ violations)

#### 1. **Router Navigation Type Errors** (Most common - 10+ instances)
```typescript
// ❌ Current (Missing required 'search' property)
<Link to="/dashboard">Dashboard</Link>

// ✅ Should be
<Link to="/dashboard" search={{}}>Dashboard</Link>
```

**Files Affected:**
- `src/components/custom/dashboard/app-breadcrumb.tsx`
- `src/components/custom/dashboard/app-sidebar.tsx`
- `src/components/custom/dashboard/notification-btn.tsx`
- `src/components/feature-library.tsx`
- `src/components/first-run-guide.tsx`
- `src/components/guidance-banner.tsx`
- `src/components/subscription-banner.tsx`

#### 2. **exactOptionalPropertyTypes Violations** (5+ instances)
```typescript
// ❌ Current
type Props = {
  inline?: boolean
}
const inline: boolean | undefined = props.inline
// Issue: undefined ≠ boolean when exactOptionalPropertyTypes is enabled

// ✅ Solution 1: Remove undefined from type
const inline: boolean = props.inline ?? false

// ✅ Solution 2: Change prop type to allow undefined explicitly
type Props = {
  inline?: boolean | undefined
}
```

**Files Affected:**
- `src/components/require-access.tsx` (lines 120, 122, 126)
- `src/components/require-permission.tsx` (lines 135, 137)

#### 3. **Unused Variables/Imports** (8+ instances)
```typescript
// ❌ File: src/components/custom/dashboard/app-sidebar.tsx:11
import { LifeBuoyIcon } from 'lucide-react' // Never used

// ❌ File: src/hooks/use-branch-switch.ts:8
const switchBranch = async (branchId: string) => {
  // branchId is never used in body
}
```

#### 4. **Index Signature Access Violations**
```typescript
// ❌ File: src/hooks/use-barcode-scanner.ts:80
const value = formRef.current.barcodeInput

// ✅ Should be
const value = formRef.current['barcodeInput']
```

#### 5. **Missing Type Properties**
```typescript
// ❌ File: src/components/custom/dashboard/app-sidebar.tsx:228
permissions.BATCH_PREPARATION // Property doesn't exist on permissions type
```

### Type Safety Escape Hatches (Problematic)

#### `any` Usage (20+ instances)
```typescript
// 🔴 src/lib/prisma-client/transaction-api.ts:1
/** biome-ignore-all lint/suspicious/noExplicitAny: allowing any type for flexibility */

// 🔴 src/lib/better-auth/permission-middleware.ts (6 instances)
role: user.role as any

// 🔴 src/lib/production/production-engine.ts (3 instances)
variant.components?.filter((c: any) => !c.isAddon)
```

**Recommendation:** Create proper types for these scenarios instead of using `any`.

---

## 2. Biome Linting Analysis

### Current Configuration

Your Biome config is **good** with some opinionated choices:

```json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "useExhaustiveDependencies": "warn",
        "useHookAtTopLevel": "error"
      },
      "style": {
        "useImportType": "error",
        "noNonNullAssertion": "off"  // ⚠️ Potentially dangerous
      }
    }
  }
}
```

### Lint Violations Breakdown

| Category | Count | Severity |
|----------|-------|----------|
| **Unused Imports/Variables** | 15+ | 🟡 Medium |
| **Template Literals** | 4 | 🟢 Low |
| **Explicit `any`** | 14+ | 🔴 High |
| **Accessibility (a11y)** | 5+ | 🟡 Medium |
| **Exhaustive Dependencies** | 1+ | 🟠 Medium-High |
| **Array Index Keys** | 1+ | 🟠 Medium |

### Critical Linting Issues

#### 1. **Explicit `any` Usage (14 errors)**
**Impact:** Defeats TypeScript's type safety
**Priority:** 🔴 HIGH

Files with most violations:
- `src/lib/better-auth/permission-middleware.ts` (6 instances)
- `src/lib/production/production-engine.ts` (3 instances)
- `src/routes/(private)/(dashboard)/business/permissions/-permission-assignment-dialog.tsx` (3 instances)

#### 2. **Missing Exhaustive Dependencies**
**Impact:** Stale closures and bugs
**Priority:** 🟠 MEDIUM-HIGH

```typescript
// 🔴 src/routes/(private)/(dashboard)/business/branches/index.tsx:505
const columns = useMemo(
  () => [...columns including handleDelete...],
  [data, user.branch.id] // Missing: handleDelete
)
```

#### 3. **Accessibility Issues**
**Impact:** WCAG compliance failures
**Priority:** 🟡 MEDIUM

- Labels without associated controls (1 instance)
- Static elements with click handlers but no keyboard support (2 instances)
- Missing button types (1 instance)

---

## 3. Lefthook Analysis

### Current Status: ⚠️ **COMPLETELY DISABLED**

**Critical Finding:** All Lefthook hooks are commented out!

```yaml
# pre-commit:  ← COMMENTED OUT
# commit-msg:  ← COMMENTED OUT
# post-merge:  ← COMMENTED OUT
# pre-push:    ← COMMENTED OUT
```

### Consequences

1. **No pre-commit validation** - Broken code can be committed
2. **No type checking before push** - CI will catch errors too late
3. **No commit message linting** - Inconsistent commit history
4. **No test gate** - Failing tests can be pushed

### Recommended Hooks Configuration

The commented-out configuration is **excellent** and should be **re-enabled**:

```yaml
pre-commit:
  commands:
    biome-check:
      glob: "*.{js,ts,jsx,tsx,json}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true  # ✅ Auto-fix and stage
    branch-guard:
      run: pnpm tsx scripts/branch-guard.ts

commit-msg:
  commands:
    "lint-commit":
      run: pnpm tsx scripts/lint-commit.ts "{1}"

pre-push:
  commands:
    type-check:
      run: pnpm exec tsc --noEmit  # ✅ Catch type errors before push
    unit-tests:
      run: pnpm test
```

---

## 4. JSON Type Safety Analysis

### Current State: ⚠️ **UNTYPED**

Found **15+ instances** of `JSON.parse()` and `JSON.stringify()` without type validation.

### Critical Vulnerabilities

#### 1. **API Responses (High Risk)**
```typescript
// 🔴 src/routes/api/billing/webhook/index.ts
return new Response(JSON.stringify({ error: 'Missing header' }), {
  status: 400,
  headers: { 'Content-Type': 'application/json' }
})
// Issue: Response shape not validated
```

#### 2. **Local Storage (Medium Risk)**
```typescript
// 🔴 src/store/auth-store.ts:76
localStorage.setItem('my-app-storage', JSON.stringify({ user: { id: state.user.id } }))
// Issue: No schema validation on read
```

#### 3. **Notification Metadata (Medium Risk)**
```typescript
// 🔴 src/lib/notification/notification-engine.ts:209
metadata: metadata ? JSON.stringify(metadata) : '{}'
// Issue: Metadata type not enforced
```

#### 4. **Threshold Deserialization (Medium Risk)**
```typescript
// 🔴 src/lib/notification/usage-threshold-policy.ts:139
const parsed = JSON.parse(json)
if (!Array.isArray(parsed)) return new Set()
// Issue: No runtime type validation
```

### Recommended Solution: Zod Schemas

You already have Zod (v4.3.6) installed! Create typed parsers:

```typescript
import { z } from 'zod'

// Define schemas
const ApiErrorSchema = z.object({
  error: z.string(),
  stack: z.string().optional()
})

const AuthStorageSchema = z.object({
  user: z.object({
    id: z.string()
  })
})

// Type-safe parsing
function parseApiError(json: string) {
  return ApiErrorSchema.parse(JSON.parse(json))
}

// Type-safe stringify
function stringifyApiError(error: z.infer<typeof ApiErrorSchema>) {
  return JSON.stringify(ApiErrorSchema.parse(error))
}
```

---

## 5. Recommendations & Action Plan

### 🔴 **CRITICAL (Fix Immediately)**

#### 1. Re-enable Lefthook
**Why:** Currently, no validation happens before commits/pushes
**Action:**
```bash
# Uncomment all hooks in lefthook.yml
# Test the setup
pnpm lefthook install
pnpm lefthook run pre-commit
```

#### 2. Fix Router Navigation Types (10+ files)
**Why:** Blocking type checking, high volume of errors
**Action:** Add empty `search={{}}` prop to all `<Link>` components

#### 3. Address `any` Types (14+ instances)
**Why:** Defeats TypeScript's purpose
**Action:** Create proper types, especially for:
- Permission/role system
- Component filters
- API handlers

### 🟠 **HIGH PRIORITY (Fix This Sprint)**

#### 4. Fix `exactOptionalPropertyTypes` Violations
**Why:** Breaking strict TypeScript mode
**Action:** Either remove `undefined` from types or adjust prop types

#### 5. Add JSON Schema Validation
**Why:** Runtime type safety for external data
**Action:** Create Zod schemas for all JSON.parse/stringify operations

#### 6. Clean Up Unused Imports/Variables
**Why:** Code cleanliness, easier maintenance
**Action:** Run `pnpm biome check --write .`

### 🟡 **MEDIUM PRIORITY (Fix Next Sprint)**

#### 7. Fix React Hook Dependencies
**Why:** Prevents stale closure bugs
**Action:** Add missing dependencies to useMemo/useCallback

#### 8. Add Accessibility Fixes
**Why:** WCAG compliance, better UX
**Action:**
- Add `htmlFor` to labels
- Add keyboard handlers to clickable divs
- Add explicit button types

#### 9. Fix Template Literal Warnings
**Why:** Code consistency
**Action:** Let Biome auto-fix these

### 🟢 **LOW PRIORITY (Ongoing)**

#### 10. Strengthen Biome Rules
**Action:** Consider enabling:
```json
{
  "linter": {
    "rules": {
      "style": {
        "noNonNullAssertion": "warn"  // Currently "off"
      },
      "suspicious": {
        "noExplicitAny": "error"  // Enforce across all files
      }
    }
  }
}
```

---

## 6. Enhanced TypeScript Configuration

### Recommended Additions

Add these to make TypeScript **even stricter**:

```json
{
  "compilerOptions": {
    // Already have these ✅
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    
    // ADD THESE 👇
    "noImplicitOverride": true,           // Enforce override keyword
    "noImplicitReturns": true,            // All code paths return
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,              // Helps with build performance
    "allowSyntheticDefaultImports": true
  }
}
```

---

## 7. Type Derivation Strategy (NOT Implementation)

### Philosophy: Derive, Reuse, Extend — Only Create When Necessary

**Priority Order:**
1. **Derive from Prisma** - Use generated Prisma types as source of truth
2. **Reuse existing types** - Check `src/lib/types.ts` and domain-specific `types.ts` files
3. **Extend with TypeScript utilities** - Use `Pick`, `Omit`, `Partial`, etc.
4. **Create new types** - Only when derivation/reuse isn't possible

### Current Type Foundation

**Prisma-Generated Types (Primary Source):**
```typescript
import type { User, Business, Product } from 'prisma/generated/prisma/client'
import type { Role, PaymentMethod } from 'prisma/generated/prisma/enums'
import type { Prisma } from 'prisma/generated/prisma/client'
```

**Existing Central Types (`src/lib/types.ts`):**
- `ConfigKeyTypes` - Derived from Prisma ConfigKey enum + Zod validation
- `ComplianceKeyTypes` - Derived from Prisma ComplianceKey enum
- `TaskMetadata` - Custom interface (no Prisma equivalent)
- `TransactionComplianceData` - Custom interface
- Utility types: `Prettify<T>`, `DeepPrettify<T>`

**Domain-Specific Type Files:**
- `src/lib/billing/types.ts` - Billing/subscription types
- `src/lib/audit/types.ts` - Audit log types
- `src/lib/costing/types.ts` - Cost calculation types
- `src/lib/entitlement/entitlement-types.ts` - Permission types
- `src/lib/onboarding/types.ts` - Onboarding flow types
- And more...

### Type Derivation Patterns

#### Pattern 1: Direct Prisma Type Usage
```typescript
// ✅ Use Prisma types directly when working with DB entities
import type { Product, ProductVariant } from 'prisma/generated/prisma/client'

function processProduct(product: Product) {
  // Product has all DB fields, fully typed
}
```

#### Pattern 2: Derive Subsets with Pick/Omit
```typescript
// ✅ When you need only certain fields
import type { User } from 'prisma/generated/prisma/client'

type UserSummary = Pick<User, 'id' | 'email' | 'name'>
type PublicUser = Omit<User, 'password' | 'createdAt' | 'updatedAt'>
```

#### Pattern 3: Extend Prisma Types
```typescript
// ✅ When you need additional computed/client-side fields
import type { Product } from 'prisma/generated/prisma/client'

type ProductWithStock = Product & {
  currentStock: number
  isLowStock: boolean
}
```

#### Pattern 4: Prisma Input Types (For API Payloads)
```typescript
// ✅ Use Prisma's generated input types for creates/updates
import type { Prisma } from 'prisma/generated/prisma/client'

type CreateProductInput = Prisma.ProductCreateInput
type UpdateProductInput = Prisma.ProductUpdateInput
```

#### Pattern 5: Zod + Prisma (Runtime Validation)
```typescript
// ✅ When you need runtime validation of Prisma-derived structures
import type { ConfigKey } from 'prisma/generated/prisma/enums'
import { z } from 'zod'

// Define the schema shape based on Prisma enums
const ConfigSchema = z.object({
  LOW_STOCK_THRESHOLD: z.number(),
  VAT_RATE: z.number(),
  // ... mirrors Prisma ConfigKey enum
})

// Type derived from schema, matches Prisma structure
type Config = z.infer<typeof ConfigSchema>
```

#### Pattern 6: Metadata Fields (JSON Columns)
```typescript
// ✅ For JSON columns in Prisma, create typed interfaces
import type { OperationalTask } from 'prisma/generated/prisma/client'

// Prisma schema has: metadata Json?
// Create typed interface for the JSON structure
interface TaskMetadata {
  link?: string
  vendorSessionId?: string
  currentTotal?: number
  // ...
}

type TypedTask = Omit<OperationalTask, 'metadata'> & {
  metadata: TaskMetadata | null
}
```

### JSON Type Safety Strategy

**Current Issue:** Untyped `JSON.parse()` and `JSON.stringify()` usage

**Solution:** Use json-utils.ts with Zod schemas derived from Prisma types

```typescript
// src/lib/json-utils.ts (already created)
import type { z } from 'zod'

export function typedJsonParse<T>(json: string, schema: z.ZodSchema<T>): T
export function safeJsonParse<T>(json: string, schema: z.ZodSchema<T>): Result<T>
// ... etc
```

**Usage Pattern:**
```typescript
// 1. Define schema based on Prisma type
import type { Notification } from 'prisma/generated/prisma/client'
import { z } from 'zod'

// Notification.metadata is Json? in Prisma
const NotificationMetadataSchema = z.object({
  priceChangeCount: z.number().optional(),
  renewalDate: z.string().optional(),
})

type NotificationMetadata = z.infer<typeof NotificationMetadataSchema>

// 2. Use typed parser
const metadata = safeJsonParse(notification.metadata, NotificationMetadataSchema)
if (metadata.success) {
  // metadata.data is fully typed as NotificationMetadata
}
```

### Anti-Patterns to Avoid

❌ **Don't duplicate Prisma types:**
```typescript
// ❌ BAD - Creates duplicate definition
interface Product {
  id: string
  name: string
  price: number
}

// ✅ GOOD - Import from Prisma
import type { Product } from 'prisma/generated/prisma/client'
```

❌ **Don't create parallel type hierarchies:**
```typescript
// ❌ BAD - Separate type system
interface ApiUser {
  id: string
  email: string
}

// ✅ GOOD - Derive from Prisma
import type { User } from 'prisma/generated/prisma/client'
type ApiUser = Pick<User, 'id' | 'email'>
```

❌ **Don't use `any` when Prisma types exist:**
```typescript
// ❌ BAD
function getProduct(id: string): any

// ✅ GOOD
import type { Product } from 'prisma/generated/prisma/client'
function getProduct(id: string): Product | null
```

### Type Organization Principles

**1. Co-locate domain-specific types:**
```
src/lib/
  billing/
    types.ts              ← Billing-specific types
    subscription-engine.ts
  production/
    types.ts              ← Production-specific types
    production-engine.ts
  types.ts                ← Shared/global types only
```

**2. Import hierarchy:**
```
Prisma Types (foundation)
    ↓
Domain Types (extends/derives from Prisma)
    ↓
Component Props (consumes domain types)
```

**3. Type file responsibilities:**
- `prisma/generated/*` - Source of truth (generated)
- `src/lib/types.ts` - Shared utilities and cross-domain types
- `src/lib/*/types.ts` - Domain-specific extensions
- Component files - Local types only (prefer imports)

### Practical Example: Notification System

**Current State (src/lib/notification/notification-engine.ts:209):**
```typescript
// ❌ Untyped JSON
metadata: metadata ? JSON.stringify(metadata) : '{}'
```

**Improved Approach (Type Derivation):**
```typescript
// Step 1: Prisma schema has
model Notification {
  metadata Json?  // ← JSON column
}

// Step 2: Define metadata structure based on usage patterns
// src/lib/notification/notification-types.ts
import { z } from 'zod'

export const NotificationMetadataSchema = z.object({
  priceChangeCount: z.number().optional(),
  renewalDate: z.string().optional(),
  threshold: z.number().optional(),
  currentUsage: z.number().optional(),
  // ... based on actual notification types
}).passthrough() // Allow additional fields

export type NotificationMetadata = z.infer<typeof NotificationMetadataSchema>

// Step 3: Create typed helper
import type { Notification } from 'prisma/generated/prisma/client'
import { safeJsonParse, typedJsonStringify } from '@/lib/json-utils'

export type TypedNotification = Omit<Notification, 'metadata'> & {
  metadata: NotificationMetadata | null
}

export function parseNotificationMetadata(json: string | null): NotificationMetadata | null {
  if (!json) return null
  const result = safeJsonParse(json, NotificationMetadataSchema)
  return result.success ? result.data : null
}

// Step 4: Use in code
const metadataJson = typedJsonStringify(metadata, NotificationMetadataSchema)
// metadataJson is validated against schema before stringifying
```

### Migration Path for Existing `any` Types

**Example: src/lib/better-auth/permission-middleware.ts:110**
```typescript
// ❌ Current
role: user.role as any

// Step 1: Check Prisma schema
// User.role is Role enum in Prisma

// Step 2: Import proper type
import type { Role } from 'prisma/generated/prisma/enums'
import type { User } from 'prisma/generated/prisma/client'

// Step 3: Type AuthorizationEngine.buildSummary properly
interface BuildSummaryParams {
  userId: string
  role: Role  // ← Use Prisma enum, not any
}

// ✅ Fixed
role: user.role // No cast needed if types align
```

### Type Coverage Measurement

Add to package.json:
```json
{
  "scripts": {
    "type-coverage": "npx type-coverage --detail --at-least 95",
    "type-coverage:report": "npx type-coverage --detail --output-format json"
  }
}
```

This will show you:
- Overall type coverage percentage
- List of untyped expressions
- Files with most `any` usage

**Target: >95% type coverage**

---

## 8. Biome vs ESLint

### Current: Biome Only
**Status:** ✅ Good choice for this project

**Pros:**
- Faster than ESLint
- Built-in formatter (replaces Prettier)
- Simpler configuration
- Growing ecosystem

**Cons:**
- Fewer plugins available
- Some ESLint plugins have no Biome equivalent

### Recommendation: **Keep Biome**

Your Biome setup is solid. However, consider:

1. **Add stricter rules:**
   ```json
   {
     "linter": {
       "rules": {
         "suspicious": {
           "noExplicitAny": "error"  // Currently allows any
         },
         "style": {
           "noNonNullAssertion": "warn"  // Currently off
         }
       }
     }
   }
   ```

2. **Consider ESLint only if you need:**
   - React-specific plugins (e.g., eslint-plugin-react-hooks advanced rules)
   - Third-party library-specific linting
   - Custom organizational ESLint configs

---

## 9. Git Hooks Strategy

### Recommended Lefthook Configuration

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    biome-check:
      glob: "*.{js,ts,jsx,tsx,json}"
      run: pnpm biome check --write --no-errors-on-unmatched {staged_files}
      stage_fixed: true
    
    type-check-staged:
      # Only type-check if TypeScript files changed
      glob: "*.{ts,tsx}"
      run: pnpm exec tsc --noEmit

commit-msg:
  commands:
    commitlint:
      run: pnpm exec commitlint --edit {1}

pre-push:
  commands:
    type-check:
      run: pnpm exec tsc --noEmit
    
    unit-tests:
      run: pnpm test
    
    lint:
      run: pnpm biome lint .

post-checkout:
  commands:
    deps-check:
      files: git diff --name-only HEAD@{1} HEAD
      glob: "pnpm-lock.yaml"
      run: |
        echo "📦 Dependencies changed. Run: pnpm install"
```

### Alternative: Husky + lint-staged

If Lefthook doesn't meet your needs:

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "pnpm biome check --write",
      "pnpm exec tsc --noEmit"
    ],
    "*.{json,md}": [
      "pnpm biome format --write"
    ]
  }
}
```

---

## 10. Measurement & Success Criteria

### KPIs to Track

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| TypeScript Errors | 30+ | 0 | 1 week |
| Biome Errors | 14 | 0 | 1 week |
| Biome Warnings | 33 | <5 | 2 weeks |
| `any` Usage | 20+ | <5 | 2 weeks |
| Lefthook Enabled | ❌ | ✅ | Immediate |
| JSON Type Safety | 0% | 100% | 3 weeks |
| Test Coverage | ? | >80% | Ongoing |

### Validation Commands

```bash
# Run these to validate fixes
pnpm exec tsc --noEmit            # Should pass with 0 errors
pnpm biome check .                # Should pass with <5 warnings
pnpm test                         # Should pass all tests
pnpm lefthook run pre-commit      # Should run successfully
```

---

## 11. Implementation Timeline

### Week 1: Critical Fixes
- [ ] Day 1: Re-enable Lefthook hooks
- [ ] Day 2-3: Fix router navigation type errors (10+ files)
- [ ] Day 4-5: Fix `exactOptionalPropertyTypes` violations

### Week 2: High Priority (Type Derivation Focus)
- [ ] Day 1: Audit all custom type definitions - identify what can be derived from Prisma
- [ ] Day 2: Migrate `any` types to proper Prisma-derived types
- [ ] Day 3-4: Add Zod schemas for JSON columns (metadata fields)
- [ ] Day 5: Apply json-utils.ts to untyped JSON.parse/stringify

### Week 3: Medium Priority
- [ ] Fix React hook dependencies
- [ ] Address accessibility issues
- [ ] Strengthen Biome configuration

### Week 4: Polish & Documentation
- [ ] Update development documentation
- [ ] Create type safety guidelines
- [ ] Set up continuous monitoring

---

## 12. Tools & Resources

### Development Tools
```bash
# Install recommended VS Code extensions
code --install-extension biomejs.biome
code --install-extension dbaeumer.vscode-eslint
code --install-extension bradlc.vscode-tailwindcss
code --install-extension usernamehw.errorlens  # Inline error display
```

### Useful Scripts to Add

```json
{
  "scripts": {
    "validate": "pnpm exec tsc --noEmit && pnpm biome check .",
    "validate:fix": "pnpm biome check --write . && pnpm exec tsc --noEmit",
    "pre-commit": "pnpm lefthook run pre-commit",
    "type-coverage": "npx type-coverage --detail"
  }
}
```

---

## Conclusion

Your project has **excellent foundations** with strict TypeScript and modern tooling, but needs **immediate attention** in three areas:

1. 🔴 **Re-enable Lefthook** - Critical risk of committing broken code
2. 🔴 **Fix TypeScript errors** - Blocking type checking
3. 🟠 **Add JSON type safety** - Prevent runtime errors

The good news: Most issues are fixable with batch operations and automation. The strict TypeScript config is a major strength - once errors are fixed, it will prevent regressions effectively.

**Estimated effort:** 3-4 weeks of focused work to reach production-grade DX.

---

## Appendix: Quick Wins

These can be fixed **right now** with automated tools:

```bash
# Auto-fix Biome issues
pnpm biome check --write .

# Remove unused imports
pnpm biome check --write --only=correctness/noUnusedImports .

# Format all files
pnpm format

# See what Lefthook would do (dry run)
pnpm lefthook run pre-commit
```
