# V1 Certification Test Plan - Systematic Fixing

## Test Execution Order (By Priority)

Run each test individually to identify and fix issues one by one:

### 1. Foundation Tests (Must Pass First)
```powershell
# Test 1: Registration & Onboarding
pnpm test:e2e v1-certification-registration-onboarding.spec.ts --project=admin

# Test 2: Employee Authorization  
pnpm test:e2e v1-certification-employee-authorization.spec.ts --project=admin

# Test 3: Tenant & Branch Security
pnpm test:e2e v1-certification-tenant-branch-security.spec.ts --project=admin
```

### 2. Core Business Tests
```powershell
# Test 4: First Sale (POS)
pnpm test:e2e v1-certification-first-sale.spec.ts --project=admin

# Test 5: Inventory Management
pnpm test:e2e v1-certification-inventory-management.spec.ts --project=admin

# Test 6: Purchasing & GRN
pnpm test:e2e v1-certification-purchasing-grn.spec.ts --project=admin
```

### 3. Transaction Tests
```powershell
# Test 7: Comprehensive Refund
pnpm test:e2e v1-certification-comprehensive-refund.spec.ts --project=admin

# Test 8: Payment Failure Recovery
pnpm test:e2e v1-certification-payment-failure-recovery.spec.ts --project=admin
```

### 4. Offline & Advanced Tests
```powershell
# Test 9: Offline POS
pnpm test:e2e v1-certification-offline-pos.spec.ts --project=admin

# Test 10: Offline POS Verification
pnpm test:e2e v1-certification-offline-pos-verification.spec.ts --project=admin
```

### 5. Subscription & Compliance Tests
```powershell
# Test 11: Subscription Lifecycle
pnpm test:e2e v1-certification-subscription-lifecycle.spec.ts --project=admin

# Test 12: Entitlement Enforcement
pnpm test:e2e v1-certification-entitlement-enforcement.spec.ts --project=admin
```

### 6. Meta Test
```powershell
# Test 13: Test Runner (validates all others)
pnpm test:e2e v1-certification-test-runner.spec.ts --project=admin
```

## Fixing Process

For each failing test:

1. **Run the test**
2. **Check error message** - look for:
   - Selector errors (syntax issues)
   - Element not found (missing test IDs)
   - Assertion failures (UI text doesn't match)
3. **Fix the issue**:
   - Selector error → Fix test code
   - Element not found → Add test ID to component
   - Assertion failure → Update test expectation or fix UI
4. **Re-run** until it passes
5. **Move to next test**

## Common Issues to Watch For

### Selector Syntax Errors
- ❌ `page.locator('text=/regex/, [role="button"]')` 
- ✅ `page.locator('text=/regex/') or page.locator('[role="button"]')`

### Missing Test IDs
- Check screenshot in test-results folder
- Add data-testid to the component
- Re-run test

### Wrong Expectations
- Check actual UI text in screenshot
- Update test to match actual implementation

## Progress Tracking

- [ ] v1-certification-registration-onboarding
- [ ] v1-certification-employee-authorization
- [ ] v1-certification-tenant-branch-security
- [ ] v1-certification-first-sale
- [ ] v1-certification-inventory-management
- [ ] v1-certification-purchasing-grn
- [ ] v1-certification-comprehensive-refund
- [ ] v1-certification-payment-failure-recovery
- [ ] v1-certification-offline-pos
- [ ] v1-certification-offline-pos-verification
- [ ] v1-certification-subscription-lifecycle
- [ ] v1-certification-entitlement-enforcement
- [ ] v1-certification-test-runner
