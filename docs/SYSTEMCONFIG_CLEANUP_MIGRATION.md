# SystemConfig Cleanup Migration Plan

**Date**: 2026-08-24  
**Status**: 🚧 In Progress  
**Purpose**: Remove redundant ENABLE_* keys from SystemConfig and consolidate with BusinessCapabilityState

---

## Executive Summary

SystemConfig currently contains feature toggle keys (`ENABLE_TASK`, `ENABLE_ORDER`, etc.) that duplicate the functionality of the `BusinessCapabilityState` system. This migration removes that redundancy and consolidates all capability management under the unified capability/entitlement system.

### Problem

**Dual Control Mechanism** - Currently, capabilities are controlled by TWO systems:

1. **BusinessCapabilityState** (proper domain model)
   - State: ENABLED, HIDDEN, PAUSED, CONFIGURED, RECOMMENDED, DEPRECATED
   - Per-business capability lifecycle management
   - Integrates with EntitlementEngine

2. **SystemConfig ENABLE_* keys** (redundant)
   - Boolean flags: true/false
   - Business and branch-scoped
   - Filters capabilities in auth-server.ts

**Example of Redundancy**:
```typescript
// SystemConfig filtering (REDUNDANT)
if (!parsedSystemConfigs.ENABLE_TASK) {
  planFeatures = planFeatures.filter(f => f !== 'CREATE_TASK')
}

// BusinessCapabilityState filtering (PROPER)
const capState = capabilityStates.find(c => c.capabilityId === 'CREATE_TASK')
if (!capState || capState.state !== 'ENABLED') {
  // capability not active
}
```

### Solution

1. **Remove** all `ENABLE_*` keys from SystemConfig
2. **Migrate** existing SystemConfig ENABLE_* data to BusinessCapabilityState
3. **Update** code to use capability state checks only
4. **Keep** non-capability SystemConfig keys (VAT_RATE, LOCALE, etc.)

---

## Affected SystemConfig Keys

### 🗑️ TO BE REMOVED (Redundant with Capabilities)

| SystemConfig Key | Maps to Capability | Scope |
|------------------|-------------------|-------|
| `ENABLE_TASK` | `CREATE_TASK` | Business + Branch |
| `ENABLE_CASH_RECONCILIATION` | `START_VENDOR_SESSION` | Business + Branch |
| `ENABLE_ORDER` | `CREATE_ORDER`, `EDIT_ACTIVE_ORDER`, `VIEW_ORDER_HISTORY` | Business + Branch |
| `ENABLE_ORDER_TAB` | `CREATE_ORDER`, `EDIT_ACTIVE_ORDER` | Business + Branch |
| `ENABLE_PRINT_RECEIPT` | `PRINT_RECEIPT` | Business + Branch |

### ✅ TO BE KEPT (Operational Configuration)

These are NOT capability toggles - they're operational settings:

**Tax & Pricing**:
- `VAT_RATE`, `IS_VAT_REGISTERED`, `PRICE_CONFIGURATION`, `BUFFER_RATE`

**Localization**:
- `LOCALE`, `CURRENCY`

**Inventory**:
- `LOW_STOCK_THRESHOLD`, `AUTO_APPROVE_LOW_STOCK_REFILL`

**Billing Policy**:
- `TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS`, `LONG_TERM_INACTIVE_DAYS`
- `CREDIT_LOW_BALANCE_THRESHOLD`, `OVERAGE_BILLING_ENABLED`

**Pricing Configuration**:
- `ADDON_*_PRICE`, `ADDON_*_PRICE_ID`, `COMPOSABLE_*`

**UX Configuration**:
- `HINT_FREQUENCY_DAYS`, `HINT_DISPLAY_SECONDS`

---

## Impact Analysis

### Files to Modify

1. **Schema**:
   - `prisma/schema.prisma` - Remove keys from ConfigKey enum

2. **Auth System**:
   - `src/lib/better-auth/auth-server.ts` - Remove SystemConfig-based filtering

3. **Configuration**:
   - `src/lib/onboarding/configuration-engine.ts` - Remove ENABLE_* generation
   - `src/lib/types.ts` - Update ConfigKeyTypes

4. **Server Functions**:
   - `src/lib/server-fn/update-branch-config.ts` - Use capability state API

5. **Tests**:
   - `__tests__/integration/registration/complete-registration.integration.test.ts`
   - `__tests__/unit/lib/onboarding/configuration-engine.test.ts`
   - Any component tests checking `systemConfigs.ENABLE_*`

6. **UI Components**:
   - Search for `systemConfigs.ENABLE_` usage
   - Replace with `useCapability()` checks

---

## Migration Strategy

### Phase 1: Code Changes (No Breaking Changes)

**Step 1**: Remove from schema
- Remove ENABLE_* from ConfigKey enum
- Generate Prisma client
- This won't break existing DB data

**Step 2**: Update auth-server.ts
- Remove lines 486-522 (survey gate filtering)
- Remove lines 544-577 (branch toggle gate)
- Keep only the capability lifecycle gate (507-543) which already handles this

**Step 3**: Update configuration-engine.ts
- Remove ENABLE_* from SAFE_DEFAULTS
- Remove ENABLE_* generation logic
- Capability states will be created by registration flow instead

**Step 4**: Update types.ts
- Remove ENABLE_* from ConfigKeyTypes interface
- TypeScript will now enforce that code can't reference these keys

**Step 5**: Update server functions
- Replace `update-branch-config.ts` logic
- Instead of updating SystemConfig, update BusinessCapabilityState via capability control API

**Step 6**: Update UI components
- Replace `systemConfigs.ENABLE_TASK` → `useCapability('CREATE_TASK')`
- Replace `systemConfigs.ENABLE_ORDER` → `useCapability('CREATE_ORDER')`
- Already in the codebase, just ensure no stragglers

**Step 7**: Update tests
- Remove assertions on ENABLE_* SystemConfig keys
- Add assertions on BusinessCapabilityState instead

### Phase 2: Data Migration

**Script**: `prisma/migrations/cleanup-enable-systemconfigs.ts`

```typescript
// Pseudo-code
for each business:
  read SystemConfig where key IN ('ENABLE_TASK', 'ENABLE_CASH_RECONCILIATION', ...)
  
  if ENABLE_TASK = 'true':
    upsert BusinessCapabilityState { capabilityId: 'CREATE_TASK', state: 'ENABLED' }
  else:
    upsert BusinessCapabilityState { capabilityId: 'CREATE_TASK', state: 'HIDDEN' }
  
  // Similar for other ENABLE_* keys
  
  delete SystemConfig rows for ENABLE_* keys
```

**Mapping Rules**:
- `ENABLE_* = true` → state = `ENABLED`
- `ENABLE_* = false` → state = `HIDDEN`
- Missing key → state = `HIDDEN` (safe default)

### Phase 3: Cleanup

**Step 1**: Delete old SystemConfig rows
- Migration script handles this

**Step 2**: Verify no code references ENABLE_*
- TypeScript compiler will catch this
- Run grep search as safety check

**Step 3**: Update documentation
- Update any docs that mention ENABLE_* configuration

---

## Rollback Plan

### If Issues Arise After Deployment

**Option 1**: Database rollback
```sql
-- Restore SystemConfig rows from BusinessCapabilityState
INSERT INTO system_config (key, value, scope, businessId, ...)
SELECT 
  'ENABLE_TASK',
  CASE WHEN state = 'ENABLED' THEN 'true' ELSE 'false' END,
  'BUSINESS',
  businessId,
  ...
FROM business_capability_states
WHERE capabilityId = 'CREATE_TASK';
```

**Option 2**: Code rollback
- Revert the PR
- Re-deploy previous version
- BusinessCapabilityState data is preserved

**No Data Loss**: BusinessCapabilityState rows are never deleted, only SystemConfig rows are removed.

---

## Capability Mapping Reference

### ENABLE_TASK → CREATE_TASK

**Current (SystemConfig)**:
```typescript
if (systemConfigs.ENABLE_TASK === false) {
  // hide tasks module
}
```

**After (Capability)**:
```typescript
if (!useCapability('CREATE_TASK')) {
  // hide tasks module
}
```

**State Mapping**:
- SystemConfig `ENABLE_TASK = true` → `BusinessCapabilityState { state: 'ENABLED' }`
- SystemConfig `ENABLE_TASK = false` → `BusinessCapabilityState { state: 'HIDDEN' }`

### ENABLE_CASH_RECONCILIATION → START_VENDOR_SESSION

**Current (SystemConfig)**:
```typescript
if (systemConfigs.ENABLE_CASH_RECONCILIATION === false) {
  // hide vendor session features
}
```

**After (Capability)**:
```typescript
if (!useCapability('START_VENDOR_SESSION')) {
  // hide vendor session features
}
```

### ENABLE_ORDER → Multiple Capabilities

**Current (SystemConfig)**:
```typescript
if (systemConfigs.ENABLE_ORDER === false) {
  branchDisabled.add('CREATE_ORDER')
  branchDisabled.add('EDIT_ACTIVE_ORDER')
  branchDisabled.add('VIEW_ORDER_HISTORY')
}
```

**After (Capability)**:
```typescript
// Each capability checked individually
if (!useCapability('CREATE_ORDER')) { }
if (!useCapability('EDIT_ACTIVE_ORDER')) { }
if (!useCapability('VIEW_ORDER_HISTORY')) { }
```

**Note**: One SystemConfig key maps to multiple capabilities. The migration script must handle this 1-to-many relationship.

### ENABLE_ORDER_TAB → Subset of Order Capabilities

**Current (SystemConfig)**:
```typescript
if (systemConfigs.ENABLE_ORDER_TAB === false) {
  branchDisabled.add('CREATE_ORDER')
  branchDisabled.add('EDIT_ACTIVE_ORDER')
}
```

**After (Capability)**:
```typescript
// Same as above - checked via capability state
```

**Migration Logic**:
- If `ENABLE_ORDER = false` → disable all 3 order capabilities
- If `ENABLE_ORDER = true` but `ENABLE_ORDER_TAB = false` → keep capabilities enabled, but set `ENABLE_ORDER_TAB` config (wait, this is confusing...)

**TODO**: Clarify if `ENABLE_ORDER_TAB` is a UX config (show/hide tab UI) or a capability toggle. If it's just UI, it might need to stay as a SystemConfig key!

### ENABLE_PRINT_RECEIPT → PRINT_RECEIPT

**Current (SystemConfig)**:
```typescript
if (systemConfigs.ENABLE_PRINT_RECEIPT === false) {
  branchDisabled.add('PRINT_RECEIPT')
}
```

**After (Capability)**:
```typescript
if (!useCapability('PRINT_RECEIPT')) {
  // don't auto-print receipts
}
```

---

## Branch-Level vs Business-Level

### Current Behavior

SystemConfig supports **branch-level overrides**:
- Business sets `ENABLE_TASK = true`
- Branch A sets `ENABLE_TASK = false` (override)
- Branch B inherits business default (true)

### New Behavior

**Option 1**: Branch-level capability states (NEW TABLE NEEDED)
```prisma
model BranchCapabilityState {
  id           String @id
  branchId     String
  capabilityId String
  state        String // ENABLED, HIDDEN, PAUSED
  ...
}
```

**Option 2**: Use `branchDisabledFeatures` in EntitlementEngine (CURRENT)
- Keep branch-level toggles as part of the entitlement context
- Branch can disable features that business has enabled
- Passed as a parameter to EntitlementEngine

**Recommendation**: Use Option 2 (current `branchDisabledFeatures` mechanism)
- Already implemented in auth-server.ts
- No new tables needed
- Fits the existing entitlement architecture

**But wait...** if we remove SystemConfig, how do branches disable capabilities?

**Answer**: We need a new API endpoint:
```typescript
// New server function
updateBranchCapabilityState(branchId, capabilityId, state: 'ENABLED' | 'HIDDEN')
```

This is actually a **Settings** concern, not a SystemConfig concern!

---

## Settings Management Approach

### Current Flow (SystemConfig)

1. Admin goes to Settings → Branch → Toggle Features
2. UI calls `update-branch-config.ts`
3. Server updates SystemConfig table
4. Next auth request reads SystemConfig
5. Auth filters capabilities based on SystemConfig

### New Flow (Capability State)

1. Admin goes to Settings → Capabilities → [Capability Name]
2. UI calls `update-branch-capability-state.ts` (NEW)
3. Server updates `branchDisabledFeatures` in a new config store (WHERE?)
4. Next auth request reads branch-disabled capabilities
5. Auth filters capabilities based on state

**Problem**: Where do we store branch-level capability overrides?

**Options**:

A. **BranchCapabilityState table** (cleanest)
   ```prisma
   model BranchCapabilityState {
     branchId String
     capabilityId String
     state String // Only ENABLED or HIDDEN (subset of business states)
   }
   ```

B. **JSON field on Branch** (simpler)
   ```prisma
   model Branch {
     disabledCapabilities String[] // Array of capability IDs
   }
   ```

C. **SystemConfig with different keys** (hacky)
   ```
   BRANCH_DISABLE_CREATE_TASK = "true"
   ```

**Recommendation**: Option B (JSON field on Branch)
- Simple to implement
- No new table needed
- Easy to query in auth-server.ts
- Fits the existing architecture (similar to `Business.deferredCapabilities`)

---

## Implementation Checklist

### Pre-Migration

- [ ] Review this plan with team
- [ ] Decide on branch-level capability override approach
- [ ] Clarify if `ENABLE_ORDER_TAB` is capability or UX config
- [ ] Create branch backup before migration

### Code Changes

- [ ] Add `Branch.disabledCapabilities` field to schema
- [ ] Update ConfigKey enum (remove ENABLE_*)
- [ ] Update auth-server.ts (remove SystemConfig filtering)
- [ ] Update configuration-engine.ts (remove ENABLE_* generation)
- [ ] Update types.ts (remove from ConfigKeyTypes)
- [ ] Create new server function: `update-branch-capability-state.ts`
- [ ] Update Settings UI to use new capability API
- [ ] Update tests
- [ ] Run type check

### Data Migration

- [ ] Write migration script
- [ ] Test on development data
- [ ] Test on staging data
- [ ] Dry-run on production backup
- [ ] Execute on production

### Validation

- [ ] Verify all capabilities work as before
- [ ] Test branch-level overrides
- [ ] Test survey-based capability activation
- [ ] Run full test suite
- [ ] Manual QA on staging

### Documentation

- [ ] Update capability documentation
- [ ] Update settings documentation
- [ ] Document new branch capability API
- [ ] Update developer onboarding guide

---

## Success Criteria

- [ ] Zero `ENABLE_*` keys in ConfigKey enum
- [ ] Zero SystemConfig rows with ENABLE_* keys
- [ ] All capability checks use BusinessCapabilityState only
- [ ] Branch-level overrides still work
- [ ] All tests passing
- [ ] TypeScript compilation successful
- [ ] No runtime errors in production

---

## Timeline Estimate

**Day 1-2**: Code changes and testing (8-12 hours)
- Schema changes
- Auth server update
- Server function update
- Test updates

**Day 3**: Data migration script (4-6 hours)
- Write migration
- Test on dev/staging
- Prepare rollback script

**Day 4**: Deployment and validation (4-6 hours)
- Deploy to staging
- QA testing
- Deploy to production
- Monitor for issues

**Total**: 3-4 days

---

## Open Questions

1. **ENABLE_ORDER_TAB**: Is this a capability toggle or a UX configuration?
   - If capability → migrate to BusinessCapabilityState
   - If UX config → keep in SystemConfig
   - Need to investigate usage in codebase

2. **Branch-level overrides**: Do we need BranchCapabilityState table or is Branch.disabledCapabilities sufficient?
   - Recommendation: Start with Branch.disabledCapabilities
   - Can add table later if needed

3. **Survey integration**: Does onboarding survey need to write to BusinessCapabilityState directly?
   - Current: Survey writes to SystemConfig
   - New: Survey should write to BusinessCapabilityState
   - Need to update completeRegistration flow

---

## Next Steps

1. ✅ Create this migration plan
2. 🔜 Get team approval on approach
3. 🔜 Resolve open questions
4. 🔜 Start implementation (Task #2)

---

**Status**: Plan complete, awaiting implementation kickoff
