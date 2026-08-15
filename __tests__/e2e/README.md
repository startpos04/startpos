# E2E Tests for Billing Success Page and Add-on Flows

This directory contains comprehensive end-to-end tests for the billing success page and add-on purchase functionality.

## Test Files

### `billing-success-addons.spec.ts`
Complete user journey tests for billing success page and add-on purchases:
- ✅ Plan activation confirmation display
- ✅ Add-on upsell presentation (Branch, Employee, TX packages)
- ✅ Add-on purchase flow to Stripe checkout
- ✅ Responsive design and cross-browser compatibility
- ✅ Error handling and edge cases
- ✅ Plan-specific add-on visibility (Basic shows Employee add-on)

### `addon-limit-enforcement.spec.ts`
Tests for branch and employee limit enforcement:
- ✅ Branch creation limits based on plan entitlements
- ✅ Employee creation limits with proper error messages
- ✅ Usage indicators showing current vs limit
- ✅ Upgrade guidance when limits are reached
- ✅ Add-on purchase dialogs for increasing capacity
- ✅ Plan-specific limit validation

## Test Coverage

### Billing Success Page
- Plan activation confirmation messaging
- Add-on cards with correct pricing and descriptions
- Quantity selectors for per-unit add-ons (Branch, Employee)
- Stripe checkout integration
- Navigation to billing dashboard

### Add-on Purchase Flows
- Branch add-on: ₱199/branch/mo with quantity selection
- Employee add-on: ₱49/seat/mo (Basic plan only)
- TX add-ons: ₱99-₱799/mo with package selection
- Real Stripe checkout redirection (without completing payment)

### Limit Enforcement
- Branch limits: Trial/Basic (1), Premium (3), Enterprise (5), Perpetual (unlimited)
- Employee limits: Trial/Basic (1), Premium+ (unlimited)
- Error messages with upgrade guidance
- UI state management based on current usage

### Plan Integration
- Basic plan shows employee add-on
- Premium+ plans show unlimited employee messaging
- Correct branch limits per plan tier
- Add-on availability based on plan type

## Running Tests

```bash
# Run all billing/add-on E2E tests
pnpm playwright test billing-success-addons addon-limit-enforcement

# Run specific test file
pnpm playwright test billing-success-addons.spec.ts

# Run with UI for debugging
pnpm playwright test --ui

# Run in headed mode to see browser
pnpm playwright test --headed
```

## Test Data Requirements

The E2E tests rely on the test data in `prisma/seeders/csv/e2e/`:

### Required Test Accounts
- `e2e.admin@test.com` - Admin user with subscription management permissions
- `e2e.supervisor@test.com` - Supervisor user for permission testing
- `e2e.cashier@test.com` - Cashier user for access control testing

### Required Test Data
- Businesses with different plan types (Trial, Basic, Premium, Enterprise)
- Existing branches and employees at various usage levels
- Plan entitlements configured correctly in `plan-entitlements.csv`
- System configs for add-on pricing

## Environment Variables

Required for Stripe integration testing:
```bash
STRIPE_ADDON_BRANCH_PRICE_ID=price_test_branch_addon
STRIPE_ADDON_EMPLOYEE_PRICE_ID=price_test_employee_addon
STRIPE_ADDON_TX_RECURRING_500_PRICE_ID=price_test_tx_500
STRIPE_ADDON_TX_RECURRING_1000_PRICE_ID=price_test_tx_1000
STRIPE_ADDON_TX_RECURRING_5000_PRICE_ID=price_test_tx_5000
```

## Key Test Scenarios

### Happy Path Flows
1. User completes plan activation → sees billing success page
2. User selects branch add-on → quantity picker works → redirects to Stripe
3. Basic plan user sees employee add-on → purchase flow works
4. User navigates from success page to billing dashboard

### Limit Enforcement Flows
1. User at branch limit → creation blocked → helpful error message
2. User at employee limit → creation blocked → upgrade guidance
3. User purchases add-on → limit increased → creation enabled

### Error Handling
1. Missing plan parameters → graceful fallback
2. Network errors during purchase → error messages
3. Unauthorized access → proper redirects
4. Invalid add-on configurations → helpful errors

## Browser Coverage

Tests run across multiple browsers and viewport sizes:
- Desktop Chrome (primary)
- Mobile viewport (375×667)
- Tablet viewport (768×1024)
- Keyboard navigation testing
- JavaScript disabled testing (progressive enhancement)

## Maintenance Notes

### Updating Test Data
When modifying plan limits or add-on pricing:
1. Update `BILLING_CONFIG` constants in test files
2. Update CSV seed data to match new limits
3. Update expected error messages and UI text

### Adding New Add-ons
For new add-on types:
1. Add to `BILLING_CONFIG.addons` with pricing
2. Create test scenarios for the new add-on type
3. Test plan-specific availability rules
4. Add limit enforcement tests if applicable

### Debugging Failed Tests
Common issues and solutions:
1. **Stripe redirects not working**: Check environment variables
2. **Limit tests failing**: Verify test data has correct usage levels  
3. **UI elements not found**: Check for selector changes after UI updates
4. **Auth failures**: Regenerate auth state files with global-setup