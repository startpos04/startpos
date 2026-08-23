# Permission Reference Guide for Developers

**Version**: 1.0  
**Last Updated**: 2026-08-23  
**Audience**: Developers building features in the POS system

---

## Table of Contents

1. [Introduction](#introduction)
2. [Permission Naming Convention](#permission-naming-convention)
3. [Permission Scopes](#permission-scopes)
4. [Permission Actions](#permission-actions)
5. [Complete Permission List](#complete-permission-list)
6. [Usage Patterns](#usage-patterns)
7. [Best Practices](#best-practices)
8. [Common Pitfalls](#common-pitfalls)

---

## Introduction

The POS system uses a **granular permission-based authorization system** instead of coarse role-based checks. This means:

- ❌ **DON'T**: `if (user.role === 'ADMIN') { ... }`
- ✅ **DO**: `if (hasPermission(Permissions.BUSINESS_MANAGE_BILLING)) { ... }`

### Why Permissions Over Roles?

| Aspect | Role-Based | Permission-Based |
|--------|-----------|------------------|
| **Granularity** | Coarse (ADMIN gets everything) | Fine (Grant specific permissions) |
| **Flexibility** | Limited (Only predefined roles) | High (Custom permission sets) |
| **Security** | Over-privileged users | Principle of least privilege |
| **Maintenance** | Hard to add new features | Easy to extend |

---

## Permission Naming Convention

All permissions follow the format: **`SCOPE:ACTION:RESOURCE`**

```
business:view:billing
  │      │     │
  │      │     └─ Resource being accessed
  │      └─────── Action being performed
  └────────────── Scope of the permission
```

### Examples

- `business:view:billing` - View billing information at business level
- `branch:create:employee` - Create employees at branch level
- `user:manage:account` - Manage own user account

---

## Permission Scopes

### 1. BUSINESS Scope

**Description**: Business-wide resources that span across all branches.

**Use Cases**:
- Billing and subscription management
- Business profile configuration
- Branch creation and management
- Cross-branch suppliers and customers
- Business-wide analytics

**Example Permissions**:
- `BUSINESS_VIEW_BILLING`
- `BUSINESS_MANAGE_BRANCHES`
- `BUSINESS_VIEW_SUPPLIERS`

**Who Typically Has These**: ADMIN, OWNER

---

### 2. BRANCH Scope

**Description**: Branch-specific resources and operations.

**Use Cases**:
- Employee management within a branch
- Product catalog for a specific branch
- Branch-specific reports
- POS operations (orders, transactions)
- Inventory management

**Example Permissions**:
- `BRANCH_VIEW_EMPLOYEES`
- `BRANCH_CREATE_ORDER`
- `BRANCH_VIEW_SALES_REPORTS`

**Who Typically Has These**: ADMIN, SUPERVISOR, CASHIER (limited subset)

---

### 3. USER Scope

**Description**: Personal account management (user's own data only).

**Use Cases**:
- View own profile
- Change own password
- Manage own preferences
- View login history

**Example Permissions**:
- `USER_VIEW_ACCOUNT`
- `USER_CHANGE_PASSWORD`
- `USER_MANAGE_PREFERENCES`

**Who Typically Has These**: All users

---

## Permission Actions

### View Permissions (`view`)

**Description**: Read-only access to resources.

**Characteristics**:
- Cannot create, edit, or delete
- Suitable for reporting and monitoring
- Lowest privilege level

**Examples**:
- `BUSINESS_VIEW_BILLING` - See billing invoices and subscription
- `BRANCH_VIEW_EMPLOYEES` - See employee list
- `BRANCH_VIEW_SALES_REPORTS` - View sales reports

**Use Case**: SUPERVISOR role often has many `view` permissions.

---

### Manage Permissions (`manage`)

**Description**: Full CRUD access (Create, Read, Update, Delete).

**Characteristics**:
- Includes all operations on a resource
- Highest privilege level for that resource
- Implies all granular permissions (create, edit, delete, view)

**Examples**:
- `BUSINESS_MANAGE_BILLING` - Create, update, cancel subscriptions
- `BRANCH_MANAGE_EMPLOYEES` - Full employee lifecycle management
- `BUSINESS_MANAGE_BRANCHES` - Create, update, delete branches

**Use Case**: ADMIN role typically has many `manage` permissions.

---

### Create Permissions (`create`)

**Description**: Create new records only.

**Characteristics**:
- Cannot edit or delete existing records
- Often paired with `view` permission
- More restrictive than `manage`

**Examples**:
- `BRANCH_CREATE_EMPLOYEE` - Add new employees
- `BRANCH_CREATE_ORDER` - Create new orders
- `BUSINESS_CREATE_SUPPLIER` - Add new suppliers

---

### Edit Permissions (`edit`)

**Description**: Update existing records only.

**Characteristics**:
- Cannot create new or delete existing
- Often paired with `view` permission
- More restrictive than `manage`

**Examples**:
- `BRANCH_EDIT_EMPLOYEE` - Update employee details
- `BRANCH_EDIT_PRODUCT` - Modify product information

---

### Delete Permissions (`delete`)

**Description**: Delete or archive records.

**Characteristics**:
- Most sensitive permission (data loss risk)
- Often restricted to ADMIN only
- Usually paired with `view` permission

**Examples**:
- `BRANCH_DELETE_EMPLOYEE` - Remove employees
- `BUSINESS_DELETE_BRANCH` - Delete branches

---

### Export Permissions (`export`)

**Description**: Export data to external formats (CSV, PDF, etc.).

**Characteristics**:
- Data extraction capability
- Potential compliance implications
- Usually paired with `view` permission

**Examples**:
- `BUSINESS_EXPORT_DATA` - Export business-wide data
- `BRANCH_EXPORT_REPORTS` - Export branch reports

---

## Complete Permission List

### Business Scope (28 permissions)

#### Billing & Subscription
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_BILLING` | View invoices, subscription status, credit ledger |
| `BUSINESS_MANAGE_BILLING` | Manage subscriptions, purchase credits/addons, cancel |
| `BUSINESS_MANAGE_SUBSCRIPTION` | Full subscription lifecycle management |

#### Branch Management
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_BRANCHES` | View branch list and configuration |
| `BUSINESS_MANAGE_BRANCHES` | Full branch lifecycle management |
| `BUSINESS_CREATE_BRANCH` | Create new branches |
| `BUSINESS_DELETE_BRANCH` | Delete branches |

#### Business Capabilities
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_CAPABILITIES` | View capability states and recommendations |
| `BUSINESS_MANAGE_CAPABILITIES` | Enable/disable capabilities |

#### Business Profile
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_PROFILE` | View business profile and characteristics |
| `BUSINESS_MANAGE_PROFILE` | Update business profile |

#### Suppliers (Cross-Branch)
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_SUPPLIERS` | View supplier list |
| `BUSINESS_MANAGE_SUPPLIERS` | Full supplier management |
| `BUSINESS_CREATE_SUPPLIER` | Add new suppliers |
| `BUSINESS_DELETE_SUPPLIER` | Remove suppliers |

#### Customers (Cross-Branch)
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_CUSTOMERS` | View customer list |
| `BUSINESS_MANAGE_CUSTOMERS` | Full customer management |
| `BUSINESS_CREATE_CUSTOMER` | Add new customers |
| `BUSINESS_DELETE_CUSTOMER` | Remove customers |

#### User Management (Business-Wide)
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_USERS` | View all users across branches |
| `BUSINESS_MANAGE_USERS` | Manage user accounts |
| `BUSINESS_INVITE_USER` | Send user invitations |
| `BUSINESS_DELETE_USER` | Delete user accounts |

#### Business Analytics
| Permission | Description |
|-----------|-------------|
| `BUSINESS_VIEW_ANALYTICS` | View business-wide analytics |
| `BUSINESS_EXPORT_DATA` | Export business data |

---

### Branch Scope (45 permissions)

#### Employees
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_EMPLOYEES` | View employee list for branch |
| `BRANCH_MANAGE_EMPLOYEES` | Full employee management |
| `BRANCH_CREATE_EMPLOYEE` | Add new employees |
| `BRANCH_EDIT_EMPLOYEE` | Update employee details |
| `BRANCH_DELETE_EMPLOYEE` | Remove employees |

#### Products
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_PRODUCTS` | View product catalog |
| `BRANCH_MANAGE_PRODUCTS` | Full product management |
| `BRANCH_CREATE_PRODUCT` | Add new products |
| `BRANCH_EDIT_PRODUCT` | Update product details |
| `BRANCH_DELETE_PRODUCT` | Remove products |

#### Inventory
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_INVENTORY` | View inventory levels |
| `BRANCH_MANAGE_INVENTORY` | Full inventory management |
| `BRANCH_ADJUST_INVENTORY` | Manual inventory adjustments |

#### Orders & POS
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_ORDERS` | View order history |
| `BRANCH_CREATE_ORDER` | Create new orders (POS) |
| `BRANCH_EDIT_ORDER` | Edit active orders |
| `BRANCH_CANCEL_ORDER` | Cancel orders |
| `BRANCH_REFUND_ORDER` | Process refunds |

#### Transactions
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_TRANSACTIONS` | View transaction history |
| `BRANCH_CREATE_TRANSACTION` | Create new transactions |

#### Reports
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_SALES_REPORTS` | View sales reports |
| `BRANCH_VIEW_INVENTORY_REPORTS` | View inventory reports |
| `BRANCH_VIEW_EMPLOYEE_REPORTS` | View employee reports |
| `BRANCH_EXPORT_REPORTS` | Export reports to CSV/PDF |

#### Settings
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_SETTINGS` | View branch settings |
| `BRANCH_MANAGE_SETTINGS` | Update branch settings |
| `BRANCH_MANAGE_ENTITLEMENTS` | Manage feature entitlements |

#### Tasks
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_TASKS` | View task list |
| `BRANCH_CREATE_TASK` | Create new tasks |
| `BRANCH_MANAGE_TASKS` | Full task management |

#### Purchases
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_PURCHASES` | View purchase orders |
| `BRANCH_CREATE_PURCHASE` | Create purchase orders |
| `BRANCH_MANAGE_PURCHASES` | Full purchase order management |

#### Production (Batch Preparation)
| Permission | Description |
|-----------|-------------|
| `BRANCH_VIEW_PRODUCTION` | View production batches |
| `BRANCH_CREATE_PRODUCTION` | Create production batches |
| `BRANCH_MANAGE_PRODUCTION` | Full production management |

---

### User Scope (5 permissions)

| Permission | Description |
|-----------|-------------|
| `USER_VIEW_ACCOUNT` | View own profile |
| `USER_MANAGE_ACCOUNT` | Update own profile |
| `USER_CHANGE_PASSWORD` | Change own password |
| `USER_MANAGE_PREFERENCES` | Update preferences |
| `USER_MANAGE_PERMISSIONS` | View/manage own permissions (for admins) |

---

## Usage Patterns

### Pattern 1: Client-Side Route Guards

**File**: `src/routes/(private)/(dashboard)/(admin)/route.tsx`

```typescript
import { Permissions } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(private)/(dashboard)/(admin)')({
  beforeLoad: async () => {
    const { authorization } = authStore.state
    
    const adminPermissions = [
      Permissions.BRANCH_VIEW_EMPLOYEES,
      Permissions.BRANCH_MANAGE_EMPLOYEES,
      Permissions.BRANCH_VIEW_PRODUCTS,
      Permissions.BRANCH_MANAGE_PRODUCTS,
    ]
    
    const hasAdminPermission = authorization?.permissions.some(p => 
      adminPermissions.includes(p as typeof Permissions[keyof typeof Permissions])
    )
    
    if (!hasAdminPermission) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
```

**When to Use**: Protect entire route sections from unauthorized access.

---

### Pattern 2: Client-Side UI Components

**File**: `src/components/custom/dashboard/my-component.tsx`

```typescript
import { usePermission } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'

export function MyComponent() {
  const canManageBilling = usePermission(Permissions.BUSINESS_MANAGE_BILLING)
  const canViewReports = usePermission(Permissions.BRANCH_VIEW_SALES_REPORTS)
  
  return (
    <div>
      {canViewReports && (
        <Button onClick={viewReports}>View Reports</Button>
      )}
      
      {canManageBilling && (
        <Button onClick={manageBilling}>Manage Billing</Button>
      )}
    </div>
  )
}
```

**When to Use**: Show/hide UI elements based on permissions.

---

### Pattern 3: Multiple Permissions (ANY)

```typescript
import { usePermissions } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'

export function MyComponent() {
  const perms = usePermissions([
    Permissions.BUSINESS_VIEW_BILLING,
    Permissions.BUSINESS_MANAGE_BILLING,
  ])
  
  // User needs ANY of the permissions
  const canAccessBilling = perms[Permissions.BUSINESS_VIEW_BILLING] || 
                           perms[Permissions.BUSINESS_MANAGE_BILLING]
  
  return canAccessBilling ? <BillingDashboard /> : <AccessDenied />
}
```

**When to Use**: When multiple permissions grant access to the same feature.

---

### Pattern 4: Server Functions (Single Permission)

**File**: `src/lib/server-fn/my-function.ts`

```typescript
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const myServerFunction = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(Permissions.BUSINESS_MANAGE_BILLING)
  ])
  .handler(async ({ data, context }) => {
    // This code only runs if user has the permission
    // Permission check is SERVER-SIDE and cannot be bypassed
    return { success: true }
  })
```

**When to Use**: Protect server functions from unauthorized API calls (CRITICAL for security).

---

### Pattern 5: Server Functions (Multiple Permissions - ALL Required)

```typescript
import { requireAllPermissions } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const advancedAction = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requireAllPermissions([
      Permissions.BUSINESS_MANAGE_BILLING,
      Permissions.BUSINESS_VIEW_REPORTS
    ])
  ])
  .handler(async ({ data, context }) => {
    // User must have BOTH permissions
    return { success: true }
  })
```

**When to Use**: When an action requires multiple permissions simultaneously.

---

### Pattern 6: Server Functions (Multiple Permissions - ANY Sufficient)

```typescript
import { requireAnyPermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const viewBillingData = createServerFn({ method: 'GET' })
  .middleware([
    authMiddleware,
    requireAnyPermission([
      Permissions.BUSINESS_VIEW_BILLING,
      Permissions.BUSINESS_MANAGE_BILLING
    ])
  ])
  .handler(async ({ data, context }) => {
    // User needs ANY ONE of the permissions
    return { data: billingInfo }
  })
```

**When to Use**: When either a view or manage permission grants access.

---

### Pattern 7: Manual Permission Check Inside Handler

```typescript
import { checkPermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const conditionalAction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    // Manual check when middleware isn't appropriate
    const canDelete = await checkPermission(
      context.user.id,
      context.user.role,
      Permissions.BRANCH_DELETE_PRODUCT
    )
    
    if (!canDelete) {
      return { success: false, error: 'Permission denied' }
    }
    
    // Proceed with deletion
    return { success: true }
  })
```

**When to Use**: Conditional permission checks based on runtime logic.

---

## Best Practices

### 1. Always Use Server-Side Enforcement ✅

```typescript
// ❌ BAD: Client-side only (can be bypassed)
function deleteProduct() {
  if (!hasPermission(Permissions.BRANCH_DELETE_PRODUCT)) {
    showError('No permission')
    return
  }
  await api.deleteProduct(id) // ← Unprotected API call!
}

// ✅ GOOD: Client-side + Server-side
function deleteProduct() {
  // Client check for UX (show/hide button)
  if (!hasPermission(Permissions.BRANCH_DELETE_PRODUCT)) {
    showError('No permission')
    return
  }
  // Server function enforces permission
  await deleteProductServerFn({ productId: id })
}

// Server function:
export const deleteProductServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(Permissions.BRANCH_DELETE_PRODUCT)])
  .handler(async ({ data }) => { ... })
```

---

### 2. Use Appropriate Permission Granularity ✅

```typescript
// ❌ BAD: Too coarse
if (hasPermission(Permissions.BRANCH_MANAGE_PRODUCTS)) {
  // Shows delete button even if user only has VIEW permission
}

// ✅ GOOD: Granular checks
const canView = hasPermission(Permissions.BRANCH_VIEW_PRODUCTS)
const canEdit = hasPermission(Permissions.BRANCH_EDIT_PRODUCT)
const canDelete = hasPermission(Permissions.BRANCH_DELETE_PRODUCT)

return (
  <>
    {canView && <ViewButton />}
    {canEdit && <EditButton />}
    {canDelete && <DeleteButton />}
  </>
)
```

---

### 3. Check Permissions Early ✅

```typescript
// ❌ BAD: Check after expensive operations
async function processOrder() {
  const orderData = await fetchLargeDataset()
  const processed = await expensiveCalculation(orderData)
  
  if (!hasPermission(Permissions.BRANCH_CREATE_ORDER)) {
    return // Wasted computation!
  }
  
  await saveOrder(processed)
}

// ✅ GOOD: Check first
async function processOrder() {
  if (!hasPermission(Permissions.BRANCH_CREATE_ORDER)) {
    showError('No permission')
    return
  }
  
  const orderData = await fetchLargeDataset()
  const processed = await expensiveCalculation(orderData)
  await saveOrder(processed)
}
```

---

### 4. Use Meaningful Permission Names ✅

```typescript
// ❌ BAD: Vague permission usage
if (hasPermission(Permissions.BRANCH_MANAGE_SETTINGS)) {
  deleteEmployee() // Settings permission for employee deletion?
}

// ✅ GOOD: Use correct permission
if (hasPermission(Permissions.BRANCH_DELETE_EMPLOYEE)) {
  deleteEmployee()
}
```

---

### 5. Document Permission Requirements ✅

```typescript
/**
 * Delete a product from the catalog
 * 
 * @requires Permissions.BRANCH_DELETE_PRODUCT
 * @param productId - ID of product to delete
 * @returns Success status
 */
export async function deleteProduct(productId: string) {
  // Implementation
}
```

---

## Common Pitfalls

### ❌ Pitfall 1: Using Roles Instead of Permissions

```typescript
// ❌ WRONG
if (user.role === 'ADMIN') {
  showManagementPanel()
}

// ✅ CORRECT
if (hasPermission(Permissions.BUSINESS_MANAGE_BILLING)) {
  showManagementPanel()
}
```

**Why**: Roles are implementation details. Permissions are capabilities. Use permissions for all authorization checks.

---

### ❌ Pitfall 2: Client-Side Only Checks

```typescript
// ❌ WRONG (Security vulnerability!)
if (!hasPermission(Permissions.BRANCH_DELETE_PRODUCT)) return
await fetch('/api/delete-product', { ... })

// ✅ CORRECT
await deleteProductServerFn({ id }) // Server function has requirePermission middleware
```

**Why**: Client-side checks can be bypassed. Always enforce permissions server-side.

---

### ❌ Pitfall 3: Checking Wrong Scope

```typescript
// ❌ WRONG
if (hasPermission(Permissions.BUSINESS_VIEW_BILLING)) {
  showBranchReport() // Business permission for branch resource!
}

// ✅ CORRECT
if (hasPermission(Permissions.BRANCH_VIEW_SALES_REPORTS)) {
  showBranchReport()
}
```

**Why**: Permissions are scoped. Business permissions don't grant access to branch resources.

---

### ❌ Pitfall 4: Over-Privileging with `manage`

```typescript
// ❌ WRONG
requirePermission(Permissions.BRANCH_MANAGE_PRODUCTS) // User just needs to view!

// ✅ CORRECT
requirePermission(Permissions.BRANCH_VIEW_PRODUCTS) // Principle of least privilege
```

**Why**: Use the most restrictive permission that allows the action. Don't require `manage` for read-only operations.

---

### ❌ Pitfall 5: Hardcoding Permission Strings

```typescript
// ❌ WRONG
if (hasPermission('branch:view:products')) { ... } // Typo-prone, no autocomplete

// ✅ CORRECT
if (hasPermission(Permissions.BRANCH_VIEW_PRODUCTS)) { ... } // Type-safe, autocomplete
```

**Why**: Using the `Permissions` object provides type safety and prevents typos.

---

## Quick Reference

### Import Statements

```typescript
// Permission constants
import { Permissions } from '@/lib/authorization/permission-keys'

// Client-side hooks
import { usePermission, usePermissions } from '@/hooks/use-permission'

// Server-side middleware
import { requirePermission, requireAllPermissions, requireAnyPermission } from '@/lib/better-auth/permission-middleware'

// Manual checks
import { checkPermission } from '@/lib/better-auth/permission-middleware'
```

### Common Patterns Cheat Sheet

| Use Case | Pattern | Example |
|----------|---------|---------|
| Route guard | `beforeLoad` check | See Pattern 1 |
| Hide UI element | `usePermission` hook | See Pattern 2 |
| Server function (one perm) | `requirePermission` middleware | See Pattern 4 |
| Server function (all perms) | `requireAllPermissions` | See Pattern 5 |
| Server function (any perm) | `requireAnyPermission` | See Pattern 6 |
| Runtime check | `checkPermission` function | See Pattern 7 |

---

## Additional Resources

- **Permission Keys**: `src/lib/authorization/permission-keys.ts`
- **Role Defaults**: `src/lib/authorization/role-permissions.ts`
- **Permission Middleware**: `src/lib/better-auth/permission-middleware.ts`
- **Authorization Engine**: `src/lib/authorization/authorization-engine.ts`
- **Migration Audit**: `docs/AUTHORIZATION_MIGRATION_AUDIT.md`

---

**Document Version**: 1.0  
**Last Updated**: 2026-08-23  
**Questions?** Contact the platform team or check internal documentation.
