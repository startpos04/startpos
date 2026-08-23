# Server Function Permission Audit

**Date**: 2026-08-23  
**Phase**: Phase 5 (4c) - Server Function Migration  
**Purpose**: Comprehensive audit of all server functions and their permission protection status

---

## Summary

Total Server Functions: 44
- ✅ Already Protected: 6
- 🔴 Needs Protection: 22
- ⚪ No Protection Needed: 16 (public, auth, or internal-only functions)

---

## Already Protected Functions ✅

| Function | File | Permission | Status |
|----------|------|------------|--------|
| createBranch | create-branch.ts | BUSINESS_CREATE_BRANCH | ✅ Complete |
| updateBranch | update-branch.ts | BUSINESS_MANAGE_BRANCHES | ✅ Complete |
| fetchBranchConfig | update-branch-config.ts | BUSINESS_VIEW_BRANCHES | ✅ Complete |
| updateBranchConfig | update-branch-config.ts | BUSINESS_MANAGE_BRANCHES | ✅ Complete |
| fetchBusinessProfile | fetch-business-profile.ts | BUSINESS_VIEW_PROFILE | ✅ Complete |
| fetchCapabilityStates | fetch-capability-states.ts | BUSINESS_VIEW_CAPABILITIES | ✅ Complete |

---

## Functions Requiring Protection 🔴

### Business-Level Functions (9)

| Function | File | Required Permission | Priority |
|----------|------|-------------------|----------|
| createBillingPortalSession | create-billing-portal-session.ts | BUSINESS_VIEW_BILLING | HIGH |
| fetchInvoices | fetch-invoices.ts | BUSINESS_VIEW_BILLING | HIGH |
| fetchCreditLedger | fetch-credit-ledger.ts | BUSINESS_VIEW_BILLING | HIGH |
| grantCredits | grant-credits.ts | BUSINESS_MANAGE_BILLING | HIGH |
| purchaseCreditPackage | purchase-credit-package.ts | BUSINESS_MANAGE_BILLING | HIGH |
| purchaseTxAddon | purchase-tx-addon.ts | BUSINESS_MANAGE_BILLING | HIGH |
| purchaseAddonSubscription | purchase-addon-subscription.ts | BUSINESS_MANAGE_BILLING | HIGH |
| cancelSubscription | cancel-subscription.ts | BUSINESS_MANAGE_BILLING | HIGH |
| reactivateSubscription | reactivate-subscription.ts | BUSINESS_MANAGE_BILLING | HIGH |

### Branch-Level Functions (8)

| Function | File | Required Permission | Priority |
|----------|------|-------------------|----------|
| createEmployee | create-employee.ts | BRANCH_MANAGE_EMPLOYEES | HIGH |
| fetchBranchUsers | fetch-branch-users.ts | BRANCH_VIEW_EMPLOYEES | MEDIUM |
| downloadInventoryCsv | download-inventory.ts | BRANCH_VIEW_INVENTORY_REPORTS | MEDIUM |
| capabilityActions | capability-actions.ts | BUSINESS_MANAGE_CAPABILITIES | MEDIUM |
| updateOfflineTerminal | update-offline-terminal.ts | BRANCH_MANAGE_SETTINGS | MEDIUM |
| purchaseWorkflow | purchase-workflow.ts | BRANCH_CREATE_PURCHASE | HIGH |
| receiptWorkflow | receipt-workflow.ts | BRANCH_CREATE_PURCHASE | HIGH |
| fetchDashboardHints | fetch-dashboard-hints.ts | BRANCH_VIEW_DASHBOARD | LOW |

### Supervisor/Reporting Functions (5)

| Function | File | Required Permission | Priority |
|----------|------|-------------------|----------|
| downloadTransactionsCSV | download-tranasctions.ts | BRANCH_VIEW_TRANSACTIONS | MEDIUM |
| fetchOrderHistory | fetch-order-history.ts | BRANCH_VIEW_ORDERS | MEDIUM |
| fetchTransactionHistory | fetch-transaction-history.ts | BRANCH_VIEW_TRANSACTIONS | MEDIUM |
| fetchLoginHistory | fetch-login-history.ts | USER_VIEW_LOGIN_HISTORY | LOW |
| fetchEligibleHint | fetch-eligible-hint.ts | BRANCH_VIEW_DASHBOARD | LOW |

---

## Functions Not Requiring Protection ⚪

### Public/Auth Functions (No auth required)
- checkEmailAvailable.ts
- sendRegistrationOtp.ts
- forgotPasswordOtp.ts
- completeRegistration.ts
- acceptTerms.ts
- requestAccountDeletion.ts

### Session Management (Auth only, no specific permissions)
- refreshSession.ts
- revokeSession.ts
- writeAudit.ts

### Payment/Quote Workflow (Entitlement-based, not permission-based)
- createSubscription.ts
- createPricingQuote.ts
- acceptPricingQuote.ts
- convertQuoteToSubscription.ts
- changeSubscription.ts

### Task Authorization (Uses validate-task-transition)
- validateTaskTransition.ts (Already has workflow-specific auth)

### Read-Only Public Features
- fetchPlans.ts (Public pricing page)
- fetchFeatureFlags.ts (Public feature flags)

---

## Permission Mapping Reference

### Business-Level Permissions
- `BUSINESS_VIEW_BILLING` - View billing portal, invoices, credit ledger
- `BUSINESS_MANAGE_BILLING` - Purchase credits/addons, cancel/reactivate subscription
- `BUSINESS_VIEW_PROFILE` - View business profile
- `BUSINESS_MANAGE_PROFILE` - Update business profile
- `BUSINESS_VIEW_BRANCHES` - View branch list and config
- `BUSINESS_MANAGE_BRANCHES` - Create/update branches
- `BUSINESS_CREATE_BRANCH` - Create new branch
- `BUSINESS_VIEW_CAPABILITIES` - View capability states
- `BUSINESS_MANAGE_CAPABILITIES` - Enable/disable capabilities

### Branch-Level Permissions
- `BRANCH_VIEW_EMPLOYEES` - View employee list
- `BRANCH_MANAGE_EMPLOYEES` - Create/edit/delete employees
- `BRANCH_VIEW_PRODUCTS` - View products
- `BRANCH_MANAGE_PRODUCTS` - Create/edit/delete products
- `BRANCH_VIEW_PURCHASES` - View purchase orders
- `BRANCH_CREATE_PURCHASE` - Create purchase orders
- `BRANCH_VIEW_INVENTORY_REPORTS` - View inventory reports, download CSV
- `BRANCH_VIEW_TRANSACTIONS` - View transaction history, download CSV
- `BRANCH_VIEW_ORDERS` - View order history
- `BRANCH_VIEW_DASHBOARD` - View dashboard hints
- `BRANCH_MANAGE_SETTINGS` - Update branch settings (offline terminal)

### User-Level Permissions
- `USER_VIEW_LOGIN_HISTORY` - View login history

---

## Implementation Notes

### Pattern to Follow

```typescript
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const myServerFunction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.SCOPE_ACTION_RESOURCE)])
  .handler(async ({ data, context }) => {
    // Function implementation
  })
```

### Multiple Permissions

For functions that need ANY of multiple permissions:
```typescript
import { requireAnyPermission } from '@/lib/better-auth/permission-middleware'

.middleware([
  authMiddleware, 
  requireAnyPermission([
    Permissions.BUSINESS_VIEW_BILLING,
    Permissions.BUSINESS_MANAGE_BILLING
  ])
])
```

For functions that need ALL of multiple permissions:
```typescript
import { requireAllPermissions } from '@/lib/better-auth/permission-middleware'

.middleware([
  authMiddleware,
  requireAllPermissions([
    Permissions.BUSINESS_VIEW_BILLING,
    Permissions.BUSINESS_MANAGE_BILLING
  ])
])
```

---

## Migration Priority

### Phase 1: Critical Business Functions (HIGH Priority)
Protect billing, employee management, purchase workflows - these have direct business impact

### Phase 2: Reporting & Exports (MEDIUM Priority)
Protect data export and history viewing functions - these expose sensitive data

### Phase 3: UI Enhancement Functions (LOW Priority)
Protect dashboard hints and feature flags - these are less sensitive

---

## Testing Checklist

After adding permission middleware, verify:
- [ ] ADMIN users can access all functions
- [ ] SUPERVISOR users can access reporting functions
- [ ] CASHIER users cannot access admin/supervisor functions
- [ ] Custom permission grants work correctly
- [ ] Custom permission revokes work correctly
- [ ] 403 errors are properly displayed to users
- [ ] No regressions in existing functionality

---

## Next Steps

1. Implement protection for HIGH priority functions (billing, employees, purchases)
2. Implement protection for MEDIUM priority functions (reporting, exports)
3. Implement protection for LOW priority functions (hints, dashboard features)
4. Update AUTHORIZATION_MIGRATION_AUDIT.md to mark Phase 4c complete
5. Proceed to Phase 4d (Cleanup & Documentation)
