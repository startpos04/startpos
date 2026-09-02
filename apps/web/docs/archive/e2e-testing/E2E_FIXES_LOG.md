# E2E Test Fixes Log

## Issue #1: Terms of Service Modal Blocking Tests

**Problem:**
- Tests were failing because TOS modal appeared after login
- Modal blocks all navigation until accepted
- No way for tests to proceed

**Solution:**
Added automatic TOS acceptance to global setup:

### Files Modified:

#### 1. `src/components/custom/legal/terms-update-modal.tsx`
Added test IDs:
- `data-testid="terms-update-modal"` on DialogContent
- `data-testid="terms-acceptance-checkbox"` on Checkbox
- `data-testid="accept-terms-button"` on Button

#### 2. `__tests__/e2e/global-setup.ts`
Added TOS handling after login:
```typescript
// Check for Terms of Service modal and accept if present
const tosModal = page.locator('[data-testid="terms-acceptance-checkbox"]')
const tosModalVisible = await tosModal.isVisible({ timeout: 2000 }).catch(() => false)

if (tosModalVisible) {
  console.info(`  📜 Terms of Service modal detected - accepting...`)
  await tosModal.click()
  await page.locator('[data-testid="accept-terms-button"]').click()
  await page.waitForTimeout(1000)
  console.info(`  ✅ Terms accepted`)
}
```

**Result:**
- ✅ Global setup now automatically accepts TOS if it appears
- ✅ Auth state files include accepted TOS version
- ✅ Subsequent tests don't see the modal (already accepted in session)

**When to Update:**
If TOS modal UI changes, update the test IDs in:
- `terms-update-modal.tsx` (component)
- `global-setup.ts` (test selectors)

---

## Test Status After Fix

### ✅ Working:
- Login authentication
- Terms of Service acceptance
- Auth state generation

### ⚠️ Still Need Test IDs:
Tests will fail on components that lack `data-testid` attributes:
- Branches page
- Employees page  
- Billing dashboard
- Add-on purchase dialogs
- Limit enforcement messages

---

## Next Steps

When a test fails with "locator not found":
1. Find the component file
2. Add `data-testid="descriptive-name"` to the element
3. Re-run the test

Example:
```tsx
// Before
<Button onClick={handleClick}>Create Branch</Button>

// After  
<Button onClick={handleClick} data-testid="create-branch-button">
  Create Branch
</Button>
```
