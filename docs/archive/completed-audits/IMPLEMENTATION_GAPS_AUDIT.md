# Implementation Gaps Audit

**Date:** 2026-08-25  
**Purpose:** Identify remaining implementation gaps before manual testing  
**Status:** 🔍 AUDIT COMPLETE

---

## Summary

Based on comprehensive codebase analysis, here are the **verified implementation gaps** that need to be completed:

### ✅ VERIFIED COMPLETE:
1. **SETTINGS_REORGANIZATION_PLAN** - Business section exists, context switcher implemented
2. **INVENTORY_MODES_REVISED_PLAN** - Three modes implemented (none, relaxed, strict)
3. **COMPLIANCE_UX_IMPROVEMENT_PLAN** - Fully implemented, awaiting testing

### ⚠️ GAPS IDENTIFIED:
4. **Offline Mode Cashier Lock** - Not implemented
5. **Auth Store Refresh Method** - TODO comment found
6. **Branch Switching Backend** - TODO comment found  
7. **Configuration Validation** - TODO comment found
8. **Help/FAQ Links** - Placeholder URLs
9. **Multi-Country Compliance** - Singapore & USA not implemented

---

## Gap #1: Offline Mode - Single Cashier Restriction

**Document:** `docs/offline-mode-plan.md`  
**Status:** ❌ NOT IMPLEMENTED

### What's Missing:

1. **Schema Changes:**
   ```prisma
   // SequenceCounter model needs:
   offlineCashierId String?
   offlineDeviceId  String?
   isOfflineMode    Boolean @default(false)
   ```

2. **SequenceAudit Model:**
   - Complete audit trail for sequence generation
   - Track which cashier generated which number
   - Device identification
   - Offline flag

3. **Offline Lock Logic:**
   - Lock sequence to first offline cashier
   - Block other cashiers when one goes offline
   - Unlock when online again
   - Conflict detection

### Evidence:
```typescript
// No offlineCashierId or SequenceAudit found in codebase
// Search results show only UI filtering: isOfflineMode: true (not the lock)
```

### Impact:
- **Medium Priority** - System works offline but multiple cashiers can create sequence conflicts
- **Risk:** Duplicate invoice numbers if two devices go offline simultaneously

### Recommendation:
- Implement if multi-device offline usage is expected
- Can defer to v1.1 if single-device per branch is guaranteed

---

## Gap #2: Auth Store Refresh Method

**Location:** `src/routes/(private)/(dashboard)/settings/-compliance/index.tsx:191`  
**Status:** ⚠️ TODO COMMENT

### Code:
```typescript
// Refresh auth store to update user context
// TODO: Add authStore.refresh() method when available
```

### Context:
After saving compliance data and changing registrationStatus to REGISTERED, the UI needs to refresh the user context so:
- App bar indicator updates
- Dashboard card updates
- Receipt footer updates

### Current Workaround:
Page refresh or re-login updates the context.

### Impact:
- **Low Priority** - Workaround exists (manual refresh)
- **UX Issue:** User doesn't see status change immediately

### Solution:
```typescript
// In src/store/auth-store.ts
export const authStore = new Store({
  // ... existing state
  
  async refresh() {
    const response = await getAuthUser()
    if (response.success && response.user) {
      this.setState(state => ({
        ...state,
        user: response.user
      }))
    }
  }
})

// Then in compliance page:
await authStore.refresh()
```

---

## Gap #3: Branch Switching Backend Function

**Location:** `src/hooks/use-branch-switch.ts:10`  
**Status:** ⚠️ TODO COMMENT

### Code:
```typescript
const switchBranch = async (branchId: string) => {
  try {
    // TODO: Create server function to update user's active branch in database
    // This will be implemented in a later phase when we add the backend logic
    // await updateUserActiveBranch({ branchId })
```

### Context:
Context switcher UI exists and shows branches, but clicking a branch doesn't actually switch the active branch in the database.

### Impact:
- **Medium Priority** - Context switcher is visible but non-functional
- **UX Issue:** Users can see branches but can't switch between them

### Solution:
```typescript
// Create src/lib/server-fn/update-active-branch.ts
export async function updateActiveBranch(branchId: string) {
  const { user } = await requireAuthServer()
  
  // Verify user has access to this branch
  const branch = await db.branch.findFirst({
    where: {
      id: branchId,
      businessId: user.businessId,
      users: { some: { id: user.id } }
    }
  })
  
  if (!branch) {
    return { success: false, error: 'Branch not found or no access' }
  }
  
  // Update user's active branch
  await db.user.update({
    where: { id: user.id },
    data: { activeBranchId: branchId }
  })
  
  return { success: true }
}

// Then update use-branch-switch.ts:
await updateActiveBranch(branchId)
await authStore.refresh()
window.location.reload() // Force full context reload
```

---

## Gap #4: Configuration Validation Logic

**Location:** `src/lib/configuration/configuration-engine.ts:136`  
**Status:** ⚠️ TODO COMMENT

### Code:
```typescript
if (definition) {
  // TODO: Add validation logic based on definition.dataType and definition.validation
  // For now, just store the value
}
```

### Context:
ConfigurationDefinition includes validation rules (min, max, regex, enum) but they're not enforced when saving configuration values.

### Impact:
- **Low Priority** - Data is saved without validation
- **Risk:** Invalid configuration values (e.g., negative VAT rate, invalid email format)

### Solution:
```typescript
if (definition) {
  // Validate based on dataType
  if (definition.dataType === 'number') {
    const numValue = Number(value)
    if (isNaN(numValue)) {
      throw new Error(`${definition.key} must be a number`)
    }
    
    const validation = definition.validation as { min?: number; max?: number }
    if (validation?.min !== undefined && numValue < validation.min) {
      throw new Error(`${definition.key} must be at least ${validation.min}`)
    }
    if (validation?.max !== undefined && numValue > validation.max) {
      throw new Error(`${definition.key} must be at most ${validation.max}`)
    }
  }
  
  if (definition.dataType === 'enum') {
    const validation = definition.validation as { values: string[] }
    if (!validation.values.includes(value)) {
      throw new Error(`${definition.key} must be one of: ${validation.values.join(', ')}`)
    }
  }
  
  // Add more validation types as needed
}
```

---

## Gap #5: Help & FAQ Links

**Location:** `src/components/custom/dashboard/context-switcher.tsx:88`  
**Status:** ⚠️ TODO COMMENT

### Code:
```typescript
onClick={() => {
  // TODO: Replace with actual FAQ link when available
  window.open('https://help.yourapp.com', '_blank')
}}
```

### Context:
Context switcher has FAQ button but links to placeholder URL.

### Impact:
- **Low Priority** - Cosmetic issue
- **User Issue:** Help button goes to non-existent URL

### Solution:
```typescript
// Option 1: Link to actual help site
window.open('https://docs.startpos.com/faq', '_blank')

// Option 2: Link to in-app contact page
navigate({ to: '/contact-us' })

// Option 3: Open help modal
setShowHelpModal(true)
```

### Affected Locations:
1. Context switcher FAQ button
2. Compliance settings help links (currently link to bir.gov.ph - these are correct)

---

## Gap #6: Multi-Country Compliance (Singapore & USA)

**Locations:**
- `src/lib/server-fn/fetch-compliance-data.ts:100`
- `src/lib/server-fn/save-compliance-data.ts:146`

### Code:
```typescript
// TODO: Add Singapore and USA compliance data handling when needed
```

### Context:
System is architected for multi-country compliance, but only Philippines is implemented:
- PhilippinesCompliance table ✅
- PhilippinesBranchCompliance table ✅
- SingaporeCompliance table ❌
- USACompliance table ❌

### Impact:
- **v1.1 Feature** - Not needed for Philippines-only v1.0
- **DEPLOYMENT_COUNTRY=SG or US will fail**

### Solution (When Needed):
```prisma
// In prisma/base/compliance/singapore.prisma
model SingaporeCompliance {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id])
  
  gstNumber       String  // GST Registration Number
  uenNumber       String  // Unique Entity Number
  acraNumber      String? // ACRA Registration
  gstEffectiveDate DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("singapore_compliances")
}

// Similar for USA (EIN, State Tax ID, Sales Tax Permit)
```

Then update the adapter:
```typescript
// In src/lib/compliance/adapters/singapore-adapter.ts
export class SingaporeComplianceAdapter extends ComplianceAdapter {
  // Implement SG-specific validation and extraction
}
```

---

## Gap #7: Business Stats Placeholders

**Location:** `src/routes/(private)/(dashboard)/business/index.tsx:55`  
**Status:** ⚠️ TODO COMMENT

### Code:
```typescript
<div className='text-2xl font-bold'>
  {/* TODO: Add actual branch count when multi-branch support is added */}
  1
</div>

<div className='text-2xl font-bold'>
  {/* TODO: Add actual user count */}
  -
</div>
```

### Context:
Business overview dashboard shows hardcoded values instead of actual counts.

### Impact:
- **Low Priority** - Cosmetic issue
- **Business page shows incorrect data**

### Solution:
```typescript
// Add to business overview page:
const branches = useLiveQuery(q => 
  q.from({ b: branchCollection })
   .where({ businessId: user.business.id })
   .select(({ b }) => b)
)

const users = useLiveQuery(q =>
  q.from({ u: userCollection })
   .where({ businessId: user.business.id })
   .select(({ u }) => u)
)

<div className='text-2xl font-bold'>
  {branches.data?.length ?? 0}
</div>

<div className='text-2xl font-bold'>
  {users.data?.length ?? 0}
</div>
```

---

## Gap #8: Waste Recording Unit ID

**Location:** `src/routes/(private)/(dashboard)/(admin)/preparation/-components/record-waste-sidebar.tsx:97`  
**Status:** 🔴 FIXME COMMENT

### Code:
```typescript
unitId: user.business.baseUnitId, // FIXME: should get from variant
```

### Context:
When recording waste, the system uses business base unit instead of the variant's actual unit.

### Impact:
- **Medium Priority** - Data integrity issue
- **Incorrect waste tracking** if variant uses different unit

### Solution:
```typescript
// Get the unit from the selected variant
const variant = variants.find(v => v.id === selectedVariantId)
const unitId = variant?.unitId ?? user.business.baseUnitId

// Then use correct unitId in the movement record
```

---

## Gap #9: biome-ignore and TODO Comments

**Various Locations:**
Multiple files have `biome-ignore` comments with `TODO: explain` or `TODO: fix any`:

### Files Affected:
1. `src/lib/types.ts` - TODO: explain any types
2. `src/routes/(private)/(dashboard)/(admin)/products/index.tsx` - TODO: fix any
3. `src/routes/(private)/(dashboard)/(admin)/ingredients/index.tsx` - TODO: fix any
4. `src/lib/columns/product-columns.tsx` - TODO: fix
5. `src/lib/columns/table-columns.tsx` - TODO: fix
6. Seeders - TODO: explain (all seeders)

### Impact:
- **Low Priority** - Technical debt, not functional bugs
- **TypeScript safety reduced** with `any` types

### Recommendation:
- These can be addressed in a separate "Code Quality" sprint
- Not blocking for v1.0 release
- Should be tackled before v1.1 to improve type safety

---

## Priority Classification

### 🔴 HIGH PRIORITY (Blocking Manual Testing)
- **None** - All critical features for testing are implemented

### 🟡 MEDIUM PRIORITY (Should Complete Before v1.0)
1. **Auth Store Refresh Method** - Improves compliance UX
2. **Branch Switching Backend** - Makes context switcher functional
3. **Waste Recording Unit Fix** - Data integrity issue

### 🟢 LOW PRIORITY (Can Defer to v1.1)
4. Configuration Validation Logic
5. Help & FAQ Links
6. Business Stats Placeholders
7. TypeScript `any` cleanup
8. Offline Mode Cashier Lock (if single-device assumed)

### 🔵 FUTURE (Not for v1.0)
9. **Multi-Country Compliance** (Singapore & USA) - Marked for v1.1

---

## Recommended Action Plan

### For Immediate Implementation (Before Manual Testing):

**Option A: Complete Medium Priority Items (3-4 hours)**
1. Implement `authStore.refresh()` method
2. Create `updateActiveBranch()` server function
3. Fix waste recording unit ID
4. Update help/FAQ links

**Option B: Focus Only on Blockers (None identified)**
- Proceed directly to manual testing
- Address issues as they're discovered during testing

**Option C: Cherry-Pick Critical UX Items (1-2 hours)**
1. Implement `authStore.refresh()` only
2. Fix waste recording unit ID
3. Proceed to testing

---

## Testing Recommendations

When conducting manual testing, pay special attention to:

1. **Compliance Flow** - Status changes should reflect immediately (Gap #2)
2. **Branch Switching** - Document that it's not functional yet (Gap #3)
3. **Waste Recording** - Verify units are correct (Gap #8)
4. **Business Dashboard** - Note hardcoded stats (Gap #7)
5. **Help Links** - Note placeholder URLs (Gap #5)

---

## Conclusion

**Overall Assessment:** ✅ System is **ready for manual testing**

- No critical blockers identified
- Most gaps are UX improvements or future features
- Core functionality is complete and working
- Medium priority items would improve polish but aren't blockers

**Recommendation:** 
- Implement **Option C** (1-2 hours) to address the most visible UX issues
- Proceed with comprehensive manual testing
- Create separate tickets for remaining gaps to address post-v1.0

---

**Next Steps:**
1. Review this audit with stakeholders
2. Decide on Option A, B, or C
3. Implement selected gaps
4. Begin manual testing using COMPLIANCE_UX_TESTING_CHECKLIST.md
5. Document any additional gaps found during testing

---

**Status:** 📋 Ready for Decision - Awaiting implementation approach approval
