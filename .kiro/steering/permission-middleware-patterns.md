---
inclusion: auto
---

# Permission Middleware Patterns - Server-Side Authorization

**CRITICAL**: Always use permission middleware on server functions that mutate data or access sensitive information. UI-level permission checks (RequirePermission, usePermission) are NOT sufficient - they can be bypassed.

---

## Core Principle

Permission checks must happen on the server:
- ✅ **Server-side enforcement** - Cannot be bypassed by client manipulation
- ✅ **Fresh data** - Permissions are rebuilt from DB on every request
- ✅ **Audit trail** - All permission denials are logged
- ✅ **Explicit intent** - Code clearly documents what permissions are required

---

## Decision Tree: Which Middleware to Use?

### Business-Level Feature Enablement

**Question**: Is this about whether the *business* has enabled a feature?
- Examples: Is inventory tracking enabled? Is the order queue available?
- **Use `requireCapability` from entitlement-middleware**

```ts
import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
import { Capabilities } from '@/lib/entitlement/capability-keys'

export const createTask = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requireCapability(Capabilities.CREATE_TASK)])
  .handler(async ({ data }) => { ... })
```

---

### User-Level Authorization

**Question**: Is this about whether the *user* has permission to perform an action?
- Examples: Can this cashier manage billing? Can this supervisor delete branches?
- **Use `requirePermission` / `requireAllPermissions` / `requireAnyPermission`**

```ts
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const updateBilling = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)])
  .handler(async ({ data }) => { ... })
```

---

### Dual Gating (Feature + Permission)

**Question**: Must both the feature be enabled AND the user have permission?
- Examples: Order queue must be enabled AND user must have order permission
- **Use BOTH middlewares - capability first, then permission**

```ts
import { requireCapability } from '@/lib/better-auth/entitlement-middleware'
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const createOrder = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requireCapability(Capabilities.CREATE_ORDER),      // Business-level: is feature enabled?
    requirePermission(PermissionKeys.BRANCH.CREATE_ORDER),  // User-level: does user have permission?
  ])
  .handler(async ({ data }) => { ... })
```

---

## Pattern 1: Single Permission Check

Use when ONE permission is required.

```ts
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const deleteBranch = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(PermissionKeys.BRANCH.DELETE_BRANCH),
  ])
  .handler(async ({ data, context }) => {
    // If we reach here, the user has the permission
    // context.authorization is available if needed
    // context.permissionGranted contains the checked permission
    
    const { branchId } = data
    // ... perform deletion
  })
```

---

## Pattern 2: Multiple Permissions (ALL Required)

Use when the user must have ALL listed permissions.

```ts
import { requireAllPermissions } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const advancedBillingAction = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requireAllPermissions([
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_REPORTS,
    ]),
  ])
  .handler(async ({ data, context }) => {
    // User has BOTH permissions
    // context.permissionsGranted contains the array of checked permissions
    
    // ... perform advanced billing operation
  })
```

---

## Pattern 3: Multiple Permissions (ANY Sufficient)

Use when the user needs AT LEAST ONE of the listed permissions.

```ts
import { requireAnyPermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const viewBillingData = createServerFn({ method: 'GET' })
  .middleware([
    authMiddleware,
    requireAnyPermission([
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.BUSINESS.VIEW_BILLING,
    ]),
  ])
  .handler(async ({ data, context }) => {
    // User has at least one permission
    // context.permissionsChecked contains the array of checked permissions
    
    // ... return billing data
  })
```

---

## Pattern 4: Conditional Permission Check (Inside Handler)

Use when permission check depends on runtime data or business logic.

```ts
import { checkPermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const updateProduct = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { productId, isDeleting } = data
    
    // Different permissions based on action
    const requiredPermission = isDeleting
      ? PermissionKeys.BRANCH.DELETE_PRODUCT
      : PermissionKeys.BRANCH.EDIT_PRODUCT
    
    const hasPermission = await checkPermission(
      context.user.id,
      context.user.role,
      requiredPermission
    )
    
    if (!hasPermission) {
      throw new Error(`You don't have permission to ${isDeleting ? 'delete' : 'edit'} products`)
    }
    
    // ... proceed with update/deletion
  })
```

---

## Pattern 5: Dynamic Permission Check (Resource-Based)

Use when permission depends on the resource being accessed.

```ts
import { checkPermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'
import { crudAPI } from '@/lib/prisma-client/crud-api'

export const deleteOrder = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    const { orderId } = data
    
    // Fetch the order to check ownership
    const orderResult = await crudAPI.order('findUnique', {
      where: { id: orderId },
      select: { userId: true, status: true },
    })
    
    if (orderResult.isErr()) {
      throw new Error('Order not found')
    }
    
    const order = orderResult.value
    const isOwnOrder = order.userId === context.user.id
    
    // Own orders can be deleted by anyone, others need explicit permission
    if (!isOwnOrder) {
      const hasPermission = await checkPermission(
        context.user.id,
        context.user.role,
        PermissionKeys.BRANCH.DELETE_ORDER
      )
      
      if (!hasPermission) {
        throw new Error("You can only delete your own orders")
      }
    }
    
    // ... proceed with deletion
  })
```

---

## Pattern 6: Batch Permission Check

Use when you need to check multiple permissions and handle each result individually.

```ts
import { checkAllPermissions, checkAnyPermission } from '@/lib/better-auth/permission-middleware'
import { PermissionKeys } from '@/lib/authorization/permission-keys'

export const getUserCapabilities = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.user.id
    const role = context.user.role
    
    // Check multiple permission sets
    const canManageBilling = await checkPermission(userId, role, PermissionKeys.BUSINESS.MANAGE_BILLING)
    const canManageUsers = await checkPermission(userId, role, PermissionKeys.USER.CREATE_USER)
    const canViewReports = await checkPermission(userId, role, PermissionKeys.BUSINESS.VIEW_REPORTS)
    
    const hasAllAdminPerms = await checkAllPermissions(userId, role, [
      PermissionKeys.BUSINESS.MANAGE_BILLING,
      PermissionKeys.USER.CREATE_USER,
      PermissionKeys.BUSINESS.VIEW_REPORTS,
    ])
    
    return {
      canManageBilling,
      canManageUsers,
      canViewReports,
      hasAllAdminPerms,
    }
  })
```

---

## Common Mistakes and Fixes

### ❌ WRONG - Only UI-Level Check

```ts
// Client component
function DeleteButton() {
  const canDelete = usePermission(PermissionKeys.BRANCH.DELETE_PRODUCT)
  
  if (!canDelete) return null
  
  return <button onClick={handleDelete}>Delete</button>
}

// Server function - NO PERMISSION CHECK
export const deleteProduct = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data }) => {
    // ❌ Anyone can call this via API if they bypass the UI
    await dbTransaction(() => { ... })
  })
```

### ✅ CORRECT - Server-Side Enforcement

```ts
// Client component - UI gate (convenience only)
function DeleteButton() {
  const canDelete = usePermission(PermissionKeys.BRANCH.DELETE_PRODUCT)
  
  if (!canDelete) return null
  
  return <button onClick={handleDelete}>Delete</button>
}

// Server function - ENFORCED
export const deleteProduct = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(PermissionKeys.BRANCH.DELETE_PRODUCT),  // ✅ Server-side check
  ])
  .handler(async ({ data }) => {
    // Only reachable if permission is granted
    await dbTransaction(() => { ... })
  })
```

---

### ❌ WRONG - Using Client Session Data

```ts
export const updateUser = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async ({ data, context }) => {
    // ❌ Client session could be stale or manipulated
    if (!context.user.permissions?.includes('user:edit:user')) {
      throw new Error('Permission denied')
    }
  })
```

### ✅ CORRECT - Rebuild from DB

```ts
export const updateUser = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(PermissionKeys.USER.EDIT_USER),  // ✅ Rebuilds from DB
  ])
  .handler(async ({ data, context }) => {
    // Permission already verified by middleware
  })
```

---

### ❌ WRONG - Middleware After Handler Logic

```ts
export const sensitiveAction = createServerFn({ method: 'POST' })
  .handler(async ({ data }) => {
    // ❌ Logic runs BEFORE permission check
    const result = await performSensitiveOperation()
    return result
  })
  .middleware([authMiddleware, requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)])
```

### ✅ CORRECT - Middleware Before Handler

```ts
export const sensitiveAction = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, requirePermission(PermissionKeys.BUSINESS.MANAGE_BILLING)])
  .handler(async ({ data }) => {
    // ✅ Only runs if permission is granted
    const result = await performSensitiveOperation()
    return result
  })
```

---

## Capability vs Permission Cheat Sheet

| Scenario | Use Capability | Use Permission | Use Both |
|----------|---------------|----------------|----------|
| Check if inventory tracking is enabled | ✅ | | |
| Check if user can create products | | ✅ | |
| Check if orders are enabled AND user can create them | | | ✅ |
| Check if user can access billing settings | | ✅ | |
| Check if cash reconciliation is enabled AND user can start session | | | ✅ |
| Check if multi-branch is in plan | ✅ | | |
| Check if user can delete branches | | ✅ | |
| Check if user can export data | | ✅ | |

**Rule of Thumb**:
- **Capability** = "Does the business have this feature?"
- **Permission** = "Can this user do this action?"
- **Both** = "Is the feature enabled AND does the user have access?"

---

## Error Handling

All permission middleware functions throw `PermissionDeniedError` when access is denied:

```ts
try {
  await updateBilling({ ... })
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.error('Permission denied:', error.code, error.message)
    console.error('Missing permissions:', error.missingPermissions)
    // Handle permission denial
  }
  throw error
}
```

Error codes:
- `UNAUTHENTICATED` - User is not logged in
- `AUTHORIZATION_CHECK_FAILED` - Failed to rebuild authorization summary from DB
- `PERMISSION_DENIED` - User does not have required permission(s)

---

## Testing Server Functions with Permissions

When writing tests for permission-protected server functions:

```ts
import { describe, it, expect, vi } from 'vitest'
import { AuthorizationEngine } from '@/lib/authorization/authorization-engine'

describe('deleteProduct server function', () => {
  it('throws PermissionDeniedError when user lacks permission', async () => {
    // Mock AuthorizationEngine.buildSummary to return no permissions
    vi.spyOn(AuthorizationEngine, 'buildSummary').mockResolvedValue(
      ok({
        permissions: [],
        role: 'CASHIER',
        customGrants: [],
        customRevokes: [],
      })
    )
    
    await expect(deleteProduct({ productId: '123' })).rejects.toThrow('PERMISSION_DENIED')
  })
  
  it('allows deletion when user has permission', async () => {
    // Mock AuthorizationEngine.buildSummary to return required permission
    vi.spyOn(AuthorizationEngine, 'buildSummary').mockResolvedValue(
      ok({
        permissions: [PermissionKeys.BRANCH.DELETE_PRODUCT],
        role: 'ADMIN',
        customGrants: [],
        customRevokes: [],
      })
    )
    
    const result = await deleteProduct({ productId: '123' })
    expect(result.success).toBe(true)
  })
})
```

---

## Summary Checklist

Before committing a server function:

- [ ] Does this function mutate data? → Add permission middleware
- [ ] Does this function access sensitive information? → Add permission middleware
- [ ] Is this a public endpoint (login, register, health)? → No middleware needed
- [ ] Is this about feature enablement? → Use `requireCapability`
- [ ] Is this about user authorization? → Use `requirePermission`
- [ ] Does it need both? → Use both middlewares (capability first)
- [ ] Is the permission check conditional? → Use `checkPermission` in handler
- [ ] Are there tests for permission denial cases? → Add them

---

## Reference

- Permission keys: `web/src/lib/authorization/permission-keys.ts`
- Permission middleware: `web/src/lib/better-auth/permission-middleware.ts`
- Capability middleware: `web/src/lib/better-auth/entitlement-middleware.ts`
- Client-side hooks: `web/src/hooks/use-permission.ts`
- Client-side components: `web/src/components/require-permission.tsx`

