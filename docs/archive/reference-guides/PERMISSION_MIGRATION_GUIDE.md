# Permission-Based Authorization Migration Guide

**Last Updated**: 2026-08-23  
**Phase**: Phase 4 - Migration & Adoption ✅ COMPLETE  
**Audience**: Development team

**Status**: All migration phases complete (4a, 4b, 4c, 4d)

---

## Table of Contents

1. [Overview](#overview)
2. [Why We Migrated](#why-we-migrated)
3. [Key Concepts](#key-concepts)
4. [Migration Patterns](#migration-patterns)
5. [Common Use Cases](#common-use-cases)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Examples](#examples)

---

## Overview

We've migrated from a role-based authorization system (OWNER, ADMIN, SUPERVISOR, CASHIER) to a permission-based system that provides fine-grained access control. This allows:

- **Custom permission assignments** per user (grant or revoke specific permissions)
- **Granular access control** (e.g., user can view reports but not export them)
- **Flexible role definitions** (roles now have default permissions that can be overridden)
- **Better security** (principle of least privilege)

**Migration Status**: ✅ Complete
- Route guards migrated
- UI components migrated
- Server functions protected
- Permission management UI available at `/business/permissions`

---

## Why We Migrated

### Before (Role-Based)
```typescript
// ❌ OLD: Coarse-grained, inflexible
if (user.role === Role.ADMIN) {
  // User has ALL admin capabilities, no way to restrict
}
```

**Problems:**
- All-or-nothing access (ADMIN has everything, CASHIER has nothing)
- Can't grant a SUPERVISOR permission to manage billing
- Can't revoke a specific permission from an ADMIN
- Hard to implement custom access levels

### After (Permission-Based)
```typescript
// ✅ NEW: Fine-grained, flexible
if (hasPermission('business:manage:billing')) {
  // User has this specific permission, regardless of role
}
```

**Benefits:**
- Granular control (grant only what's needed)
- Custom assignments (any user can have any permission)
- Role defaults still work (ADMIN gets admin permissions by default)
- OWNER has all permissions automatically

---

## Key Concepts

### 1. Permissions

Permissions follow the pattern: `SCOPE:ACTION:RESOURCE`

**Scopes:**
- `business` - Business-level resources (billing, branches, capabilities)
- `branch` - Branch-level resources (employees, products, reports)
- `user` - User's own account

**Actions:**
- `view` - Read-only access
- `manage` - Full CRUD access
- `create`, `edit`, `delete` - Specific operations
- `export` - Export data

**Examples:**
- `business:view:billing` - Can view billing page
- `branch:manage:employees` - Can create/edit/delete employees
- `user:change:password` - Can change own password

### 2. Authorization Summary

Every authenticated user has an `authorization` object in `authStore`:

```typescript
{
  permissions: ['business:view:billing', 'branch:view:products', ...],
  grants: [...],  // Custom grants for this user
  revokes: [...], // Custom revokes for this user
}
```

This is built server-side by combining:
1. Role default permissions
2. Custom permission grants (+)
3. Custom permission revokes (-)

### 3. OWNER Role

The OWNER role is special:
- Has **all permissions** automatically
- Cannot have permissions revoked
- Cannot be assigned custom permissions (already has everything)

---

## Migration Patterns

### Pattern 1: Route Guards

**OLD (Role-Based):**
```typescript
// ❌ Before
export const Route = createFileRoute('/(admin)')({
  beforeLoad: async () => {
    const { user } = authStore.state
    if (user.role !== Role.ADMIN) {
      throw redirect({ to: '/login' })
    }
  },
})
```

**NEW (Permission-Based):**
```typescript
// ✅ After
export const Route = createFileRoute('/(admin)')({
  beforeLoad: async () => {
    const { authorization } = authStore.state
    
    const adminPermissions = [
      Permissions.BRANCH_VIEW_EMPLOYEES,
      Permissions.BRANCH_VIEW_PRODUCTS,
      // ... other admin permissions
    ]
    
    const hasAdminPermission = authorization?.permissions.some(p => 
      adminPermissions.includes(p)
    )
    
    if (!hasAdminPermission) {
      throw redirect({ to: '/dashboard' })
    }
  },
})
```

**Key Changes:**
- Use `authorization` instead of `user.role`
- Check for ANY relevant permission (not just role)
- Redirect to `/dashboard` (not `/login`) when unauthorized

---

### Pattern 2: UI Component Guards

**OLD (Role-Based):**
```typescript
// ❌ Before
const isAdmin = user.role === Role.ADMIN

return (
  <>
    {isAdmin && (
      <Link to="/business/billing">Billing</Link>
    )}
  </>
)
```

**NEW (Permission-Based):**
```typescript
// ✅ After - Option 1: usePermission hook
import { usePermission } from '@/hooks/use-permission'
import { Permissions } from '@/lib/authorization/permission-keys'

const canViewBilling = usePermission(Permissions.BUSINESS_VIEW_BILLING)

return (
  <>
    {canViewBilling && (
      <Link to="/business/billing">Billing</Link>
    )}
  </>
)

// ✅ After - Option 2: RequirePermission component
import { RequirePermission } from '@/components/require-permission'

return (
  <RequirePermission 
    permission={Permissions.BUSINESS_VIEW_BILLING}
    inline={true}
  >
    <Link to="/business/billing">Billing</Link>
  </RequirePermission>
)
```

**Key Changes:**
- Use `usePermission()` hook or `<RequirePermission>` component
- Import `Permissions` constants (never hardcode permission strings)
- Set `inline={true}` for UI elements (hides element if no permission)
- Set `inline={false}` for full pages (shows access denied message)

---

### Pattern 3: Route Component Protection

**OLD (Role-Based):**
```typescript
// ❌ Before
export const Route = createFileRoute('/business/billing')({
  component: BillingPage,
})
```

**NEW (Permission-Based):**
```typescript
// ✅ After
export const Route = createFileRoute('/business/billing')({
  component: () => (
    <RequirePermission permission={Permissions.BUSINESS_VIEW_BILLING}>
      <BillingPage />
    </RequirePermission>
  ),
})
```

**Key Changes:**
- Wrap component with `<RequirePermission>`
- Shows full-page access denied UI if user lacks permission
- Works alongside route guard (defense in depth)

---

### Pattern 4: Server Function Protection

**OLD (Capability-Based Only):**
```typescript
// ❌ Before - only capability check
export const createBranch = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator(...)
  .handler(...)
```

**NEW (Permission + Capability):**
```typescript
// ✅ After - permission check added
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

export const createBranch = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware, 
    requirePermission(Permissions.BUSINESS_CREATE_BRANCH)
  ])
  .inputValidator(...)
  .handler(...)
```

**Key Changes:**
- Add `requirePermission()` middleware after `authMiddleware`
- Throws 403 error if user lacks permission
- Always protect server functions (don't rely on UI alone)

---

### Pattern 5: Multiple Permission Checks

**Checking Multiple Permissions:**
```typescript
// Check if user has ALL permissions
import { useHasAllPermissions } from '@/hooks/use-permission'

const hasAllPerms = useHasAllPermissions([
  Permissions.BRANCH_VIEW_EMPLOYEES,
  Permissions.BRANCH_MANAGE_EMPLOYEES,
])

// Check if user has ANY permission
import { useHasAnyPermission } from '@/hooks/use-permission'

const hasAnyPerm = useHasAnyPermission([
  Permissions.BUSINESS_VIEW_BILLING,
  Permissions.BUSINESS_MANAGE_BILLING,
])

// Check multiple at once (object return)
import { usePermissions } from '@/hooks/use-permission'

const perms = usePermissions([
  Permissions.BRANCH_VIEW_PRODUCTS,
  Permissions.BRANCH_CREATE_PRODUCT,
])

if (perms.BRANCH_VIEW_PRODUCTS) { ... }
if (perms.BRANCH_CREATE_PRODUCT) { ... }
```

---

## Common Use Cases

### Use Case 1: Adding Permission Check to New Route

```typescript
// 1. Import dependencies
import { RequirePermission } from '@/components/require-permission'
import { Permissions } from '@/lib/authorization/permission-keys'

// 2. Wrap your component
export const Route = createFileRoute('/my-new-route')({
  component: () => (
    <RequirePermission permission={Permissions.BRANCH_VIEW_PRODUCTS}>
      <MyNewPage />
    </RequirePermission>
  ),
})
```

### Use Case 2: Adding Permission Check to Existing Server Function

```typescript
// 1. Import middleware
import { requirePermission } from '@/lib/better-auth/permission-middleware'
import { Permissions } from '@/lib/authorization/permission-keys'

// 2. Add to middleware array
export const myServerFn = createServerFn({ method: 'POST' })
  .middleware([
    authMiddleware,
    requirePermission(Permissions.BRANCH_MANAGE_PRODUCTS), // Add this
  ])
  .inputValidator(...)
  .handler(...)
```

### Use Case 3: Conditionally Showing UI Elements

```typescript
// Simple check
const canEdit = usePermission(Permissions.BRANCH_EDIT_PRODUCT)

return (
  <div>
    <ProductView product={product} />
    {canEdit && (
      <Button onClick={handleEdit}>Edit Product</Button>
    )}
  </div>
)
```

### Use Case 4: Granting Custom Permission to User

Use the Permission Management UI at `/business/permissions`:

1. Navigate to Business → Permissions
2. Find the user in the list
3. Click "Manage Permissions"
4. Search for the permission (e.g., "billing")
5. Click "Grant" to add custom permission
6. Optionally add a reason for audit trail

**Programmatically (rare):**
```typescript
import { grantPermissionToUser } from '@/lib/queries/permission-management'

await grantPermissionToUser({
  data: {
    userId: 'user-id',
    permissionKey: Permissions.BUSINESS_VIEW_BILLING,
    reason: 'Temporary access for billing review',
  },
})
```

---

## Best Practices

### ✅ Do's

1. **Always use permission constants**
   ```typescript
   // ✅ Good
   usePermission(Permissions.BRANCH_VIEW_PRODUCTS)
   
   // ❌ Bad
   usePermission('branch:view:products')
   ```

2. **Always protect server functions**
   - Never rely on UI checks alone
   - Add `requirePermission()` middleware to all server functions

3. **Use the right hook for the job**
   - Single permission: `usePermission()`
   - Multiple (AND logic): `useHasAllPermissions()`
   - Multiple (OR logic): `useHasAnyPermission()`
   - Bulk check: `usePermissions()` (returns object)

4. **Use inline mode appropriately**
   - `inline={true}` - For UI elements (buttons, links, menu items)
   - `inline={false}` - For full pages (shows access denied message)

5. **Check permissions early**
   - Add route guards in `beforeLoad`
   - Add component guards at route level
   - Add server middleware before handler

6. **Provide context in custom grants**
   - Always add a `reason` when granting/revoking permissions
   - Helps with audit trail and understanding why access was changed

### ❌ Don'ts

1. **Don't check roles directly**
   ```typescript
   // ❌ Bad
   if (user.role === Role.ADMIN) { ... }
   
   // ✅ Good
   if (hasPermission(Permissions.BUSINESS_MANAGE_BILLING)) { ... }
   ```

2. **Don't hardcode permission strings**
   ```typescript
   // ❌ Bad
   usePermission('business:view:billing')
   
   // ✅ Good
   usePermission(Permissions.BUSINESS_VIEW_BILLING)
   ```

3. **Don't skip server-side checks**
   ```typescript
   // ❌ Bad - only UI check
   {canDelete && <DeleteButton />}
   
   // ✅ Good - UI check + server check
   {canDelete && <DeleteButton />}
   
   export const deleteItem = createServerFn()
     .middleware([authMiddleware, requirePermission(Permissions.BRANCH_DELETE_PRODUCT)])
   ```

4. **Don't modify OWNER permissions**
   - OWNER has all permissions automatically
   - Attempting to grant/revoke will fail with error

5. **Don't forget to check authorization exists**
   ```typescript
   // ❌ Bad - could crash if authorization is null
   const perms = authorization.permissions
   
   // ✅ Good - safe check
   const perms = authorization?.permissions ?? []
   ```

---

## Troubleshooting

### Problem: User has correct role but can't access feature

**Cause**: Permissions haven't been seeded for existing users.

**Solution**: Run the permission seeder:
```bash
pnpm prisma db seed -- --only permissions
```

This creates default permissions for all existing users based on their roles.

---

### Problem: "Permission denied" error on server function

**Cause**: Missing permission middleware or user lacks required permission.

**Solution**:
1. Check server function has `requirePermission()` middleware
2. Verify user has the required permission at `/business/permissions`
3. Check permission key matches exactly (typos are common)
4. Verify permission exists in database (check `Permission` table)

---

### Problem: UI element hidden even though user should have access

**Cause**: Permission key mismatch or authorization not loaded.

**Solution**:
1. Check permission key in `usePermission()` matches database
2. Verify `authStore.state.authorization` is not null
3. Check browser console for errors
4. Verify permission is in `authorization.permissions` array
5. Try refreshing the page (authorization loads on login/refresh)

---

### Problem: Can't grant permission to user in UI

**Cause**: User is OWNER role (cannot modify OWNER permissions).

**Solution**:
- OWNER has all permissions by default, no need to grant
- If you need to restrict an OWNER, change their role first

---

### Problem: Custom permission not taking effect immediately

**Cause**: Authorization is cached in `authStore`.

**Solution**:
```typescript
// Force refresh authorization after granting/revoking
import { refreshAuthUser } from '@/store/auth-store'
await refreshAuthUser()
```

Or have the user refresh the page.

---

## Examples

### Example 1: Complete Feature Migration

**Feature**: Product Management

**Before (Role-Based):**
```typescript
// Route
export const Route = createFileRoute('/products')({
  beforeLoad: () => {
    if (user.role !== Role.ADMIN) throw redirect({ to: '/dashboard' })
  },
  component: ProductsPage,
})

// Component
function ProductsPage() {
  const isAdmin = user.role === Role.ADMIN
  
  return (
    <div>
      <ProductList />
      {isAdmin && <CreateProductButton />}
    </div>
  )
}

// Server function
export const createProduct = createServerFn()
  .middleware([authMiddleware])
  .handler(...)
```

**After (Permission-Based):**
```typescript
// Route
export const Route = createFileRoute('/products')({
  beforeLoad: () => {
    const { authorization } = authStore.state
    const canView = authorization?.permissions.includes(
      Permissions.BRANCH_VIEW_PRODUCTS
    )
    if (!canView) throw redirect({ to: '/dashboard' })
  },
  component: () => (
    <RequirePermission permission={Permissions.BRANCH_VIEW_PRODUCTS}>
      <ProductsPage />
    </RequirePermission>
  ),
})

// Component
function ProductsPage() {
  const canCreate = usePermission(Permissions.BRANCH_CREATE_PRODUCT)
  
  return (
    <div>
      <ProductList />
      {canCreate && <CreateProductButton />}
    </div>
  )
}

// Server function
export const createProduct = createServerFn()
  .middleware([
    authMiddleware,
    requirePermission(Permissions.BRANCH_CREATE_PRODUCT),
  ])
  .handler(...)
```

---

### Example 2: Custom Permission Assignment Workflow

**Scenario**: Grant temporary billing access to a supervisor for end-of-month reporting.

**Steps**:
1. ADMIN navigates to `/business/permissions`
2. Finds the supervisor in the user list
3. Clicks "Manage Permissions" button
4. Searches for "billing"
5. Selects `business:view:billing`
6. Clicks "Grant Permission"
7. Enters reason: "Temporary access for September 2026 financial close"
8. Supervisor can now access `/business/billing`
9. After month-end, ADMIN removes the permission override (resets to role default)

**Result**: Supervisor has temporary access without changing their role or granting unnecessary permissions.

---

### Example 3: Multi-Permission Feature

**Scenario**: Sales reports page requires BOTH view permission AND export capability.

```typescript
// Route component
export const Route = createFileRoute('/sales-reports')({
  component: () => (
    <RequirePermission permission={Permissions.BRANCH_VIEW_SALES_REPORTS}>
      <SalesReportsPage />
    </RequirePermission>
  ),
})

// Component with granular checks
function SalesReportsPage() {
  const canView = usePermission(Permissions.BRANCH_VIEW_SALES_REPORTS)
  const canExport = usePermission(Permissions.BRANCH_EXPORT_REPORTS)
  
  // Both permissions needed for export button
  const canExportReports = canView && canExport
  
  return (
    <div>
      <ReportFilters />
      <ReportTable />
      
      {canExportReports && (
        <Button onClick={handleExport}>
          Export to Excel
        </Button>
      )}
    </div>
  )
}

// Server function for export
export const exportSalesReport = createServerFn()
  .middleware([
    authMiddleware,
    requireAllPermissions([
      Permissions.BRANCH_VIEW_SALES_REPORTS,
      Permissions.BRANCH_EXPORT_REPORTS,
    ]),
  ])
  .handler(...)
```

---

## Quick Reference

### Hooks
```typescript
import { 
  usePermission,           // Single permission check
  usePermissions,          // Multiple permissions (returns object)
  useHasAllPermissions,    // Check user has ALL permissions
  useHasAnyPermission,     // Check user has ANY permission
  useUserRole,             // Get current user role
  useCustomPermissions,    // Get custom grants/revokes
} from '@/hooks/use-permission'
```

### Components
```typescript
import { RequirePermission } from '@/components/require-permission'
import { RequireAccess } from '@/components/require-access' // Combines capability + permission

<RequirePermission 
  permission={Permissions.BRANCH_VIEW_PRODUCTS}
  inline={true}  // true = hide, false = show access denied
  fallback={<CustomMessage />}  // Optional custom fallback
>
  <ProtectedContent />
</RequirePermission>
```

### Middleware
```typescript
import { 
  requirePermission,        // Single permission
  requireAllPermissions,    // User must have ALL permissions
  requireAnyPermission,     // User must have ANY permission
} from '@/lib/better-auth/permission-middleware'

.middleware([authMiddleware, requirePermission(Permissions.BRANCH_VIEW_PRODUCTS)])
```

### Server Utilities
```typescript
import {
  checkPermission,          // Returns boolean
  checkAllPermissions,      // Returns boolean (AND)
  checkAnyPermissions,      // Returns boolean (OR)
} from '@/lib/better-auth/permission-middleware'

const canView = await checkPermission(userId, Permissions.BRANCH_VIEW_PRODUCTS)
```

---

## Next Steps

1. **Run the permission seeder** for existing users:
   ```bash
   pnpm prisma db seed -- --only permissions
   ```

2. **Test with different roles**:
   - Create test users with ADMIN, SUPERVISOR, CASHIER roles
   - Verify they can access appropriate features
   - Test custom permission grants/revokes

3. **Update any remaining role checks**:
   - Search codebase for `user.role === Role.`
   - Replace with permission checks

4. **Monitor in production**:
   - Check audit logs at `/business/permissions` (Audit Log tab)
   - Watch for permission denial errors
   - Gather feedback from team on access issues

5. **Document team-specific permissions**:
   - Create internal wiki page with your team's permission assignments
   - Document which roles get which permissions by default
   - Share this guide with new team members

---

## Support

For questions or issues:
- Review this guide and the [Authorization Migration Audit](./AUTHORIZATION_MIGRATION_AUDIT.md)
- Check the [Permission Middleware Patterns](../.kiro/steering/permission-middleware-patterns.md) steering file
- Review permission definitions in `web/src/lib/authorization/permission-keys.ts`
- Test in the UI at `/business/permissions`

---

**Migration Complete!** 🎉

All critical routes, components, and server functions have been migrated to the new permission-based authorization system. The system is backward-compatible with roles (roles still exist and have default permissions), but now supports fine-grained, per-user permission customization.
