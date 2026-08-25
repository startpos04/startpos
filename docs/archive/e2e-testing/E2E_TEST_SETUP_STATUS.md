# E2E Test Setup - Current Status

## ✅ Completed Fixes

### 1. Login Page Test IDs (CRITICAL - needed for auth)
- Added `data-testid="email-input"` to email field
- Added `data-testid="password-input"` to password field  
- Added `data-testid="login-button"` to submit button
- Updated `TextInput` component to accept and pass through `data-testid` prop

**Files modified:**
- `src/routes/(public)/login.tsx`
- `src/components/custom/form/text-input.tsx`

### 2. Global Setup Optimizations
- Reduced wait time from 2000ms to 500ms for React hydration
- Updated selectors to use new test IDs
- Added better logging for debugging
- Changed `waitUntil` from `'networkidle'` to `'domcontentloaded'` for faster loading

**Files modified:**
- `__tests__/e2e/global-setup.ts`

### 3. Playwright Configuration
- Changed to test against **production build** (`pnpm start`) instead of dev server
- Set `reuseExistingServer: true` to reuse already-running server
- Added reasonable timeouts (30s per test, 10s per action)
- Added `screenshot: 'only-on-failure'` to capture failures
- Removed unused 'chromium' project (auth happens in global-setup)

**Files modified:**
- `playwright.config.ts`

## ⚠️ Remaining Issues

### Tests are failing because components lack `data-testid` attributes

The test suites expect `data-testid` attributes throughout the app, but only login has them now.

**Example from `v1-certification-first-sale.spec.ts`:**
```typescript
// These selectors won't work yet:
addProductButton: '[data-testid="add-product-button"]'
productNameInput: '[data-testid="product-name-input"]'
checkoutButton: '[data-testid="checkout-button"]'
// ... and 50+ more
```

**Next steps to fix tests:**

1. **Billing/Success Page** (`billing-success-addons.spec.ts`)
   - Add test IDs to billing success page components
   - Add test IDs to add-on cards and purchase buttons

2. **POS Interface** (`v1-certification-first-sale.spec.ts`)
   - Add test IDs to product grid/cards
   - Add test IDs to cart components
   - Add test IDs to checkout modal

3. **Product Management**
   - Add test IDs to product forms
   - Add test IDs to category selects

4. **Inventory**
   - Add test IDs to stock adjustments
   - Add test IDs to stock displays

## 🧪 How to Test Now

### ⚠️ IMPORTANT: Production Server Required

**You MUST start the production server first:**

```powershell
# Terminal 1: Start production server (takes 1-2 min first time)
pnpm start
# Wait for: "Local:   http://localhost:3000/"

# Terminal 2: Run E2E tests
pnpm test:e2e:ui
```

**You'll see this error if server isn't running:**
```
❌ [E2E Setup] PRODUCTION SERVER NOT RUNNING!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  The E2E tests require the production build to be running.
  
  Please start the server FIRST in another terminal:
  
    pnpm start
  ...
```

### Why Two Terminals?

E2E tests run against the **production build** (same as your deployed app), not the dev server. This catches production-only issues.

## 📝 Current Test Status

- ✅ **Global setup**: Should work (auth state generation)
- ❌ **billing-success-addons.spec.ts**: Will fail - needs billing page test IDs
- ❌ **v1-certification-first-sale.spec.ts**: Will fail - needs POS/product test IDs
- ❌ **Other tests**: Will fail - need component test IDs

## 🎯 Next Action Items

**Priority 1: Verify auth works**
1. Run `pnpm start` to start server
2. Run just the global setup to verify auth state generation works
3. Check `__tests__/e2e/fixtures/.auth/` for generated JSON files

**Priority 2: Add test IDs systematically**
Start with the simplest test (`billing-success-addons.spec.ts`) and add test IDs one by one to:
- src/routes/(private)/billing/success/index.tsx
- src/components/billing/addon-cards.tsx (or wherever add-on UI lives)

**Priority 3: Run incremental tests**
After adding test IDs to billing page, run:
```powershell
pnpm test:e2e billing-success-addons.spec.ts --project=admin
```

## 💡 Tips

- Use `--headed` to see browser: `pnpm test:e2e:headed`
- Use `--debug` to pause: `pnpm test:e2e --debug`  
- Screenshots on failure go to `test-results/`
- Auth state files in `__tests__/e2e/fixtures/.auth/`
