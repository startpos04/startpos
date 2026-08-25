# Authorization Redesign Plan

**Date:** 2026-08-22  
**Status:** 📋 Planning  
**Purpose:** Replace rigid role-based authorization with flexible permission-based system (mirroring capability pattern)

---

## 🎯 GOAL

Transform authorization from rigid roles to flexible permissions, allowing:
- **OWNER** can delegate business management to specific users
- **ADMIN** can be granted access to only certain business features
- **SUPERVISOR** can be granted employee management in addition to their default permissions
- **CASHIER** can be granted access to specific admin features (e.g., view reports)
- **Any user** can have custom permission combinations

---

## 🔴 CURRENT PROBLEMS

### Hard-coded Role Checks Everywhere
```typescript
// Current - rigid and inflexible
if (user.role === Role.ADMIN) {
  // show business section
}

// Current - can't grant partial access
const allowedRoles = [Role.ADMIN, Role.SUPERVISOR]
if (!allowedRoles.includes(user.role)) {
  throw redirect({ to: '/dashboard' })
}
```

### Issues:
1. **No granularity**: Can't say "this cashier can view sales reports but not manage products"
2. **Role hierarchy implicit**: ADMIN > SUPERVISOR > CASHIER is assumed but not enforced
3. **Capabilities only for features**: Can't gate routes or actions with capabilities
4. **No delegation**: Owner can't delegate specific business tasks to non-admins
5. **Hard to extend**: Adding new roles or permissions requires code changes everywhere

---

## 🎨 NEW DESIGN: PERMISSION-BASED AUTHORIZATION

### Core Concept

```
┌────────────────────────────────────────────────────────────┐
│                         USER                                │
│                                                             │
│  ┌──────────────┐         ┌─────────────────┐             │
│  │     Role     │         │   Permissions   │             │
│  │   (Label)    │────────▶│   (Actions)     │             │
│  │              │         │                 │             │
│  │  - OWNER     │         │  - business:    │             │
│  │  - ADMIN     │         │    manage:      │             │
│  │  - SUPERVISOR│         │    billing      │             │
│  │  - CASHIER   │         │  - branch:      │             │
│  │              │         │    view:        │             │
│  └──────────────┘         │    reports      │             │
│        ↓                  │  - branch:      │             │
│   Preset collection       │    manage:      │             │
│   of permissions          │    employees    │             │
│                           └─────────────────┘             │
│                                                             │
│  Role = Default permission set (can be customized per user)│
└────────────────────────────────────────────────────────────┘

SEPARATE CONCERNS:
┌──────────────┐                  ┌──────────────┐
│ Capabilities │                  │ Permissions  │
│ (Features)   │                  │ (Actions)    │
├──────────────┤                  ├──────────────┤
│ What the     │                  │ What the     │
│ BUSINESS     │                  │ USER         │
│ has access   │                  │ can do       │
│ to based on  │                  │ within their │
│ subscription │                  │ role/grants  │
└──────────────┘                  └──────────────┘
     ↓                                   ↓
"COMPLETE_CHECKOUT"              "business:manage:billing"
"MANAGE_INVENTORY"               "branch:view:employees"
"BATCH_PREPARATION"              "branch:manage:products"
```

---

## 📋 PERMISSION TAXONOMY

### Naming Convention
```
SCOPE:ACTION:RESOURCE

Scopes:
- business: Business-level resources (billing, branches, capabilities)
- branch: Branch-level resources (employees, products, reports)
- user: User's own account

Actions:
- view: Read-only access
- manage: Full CRUD access
- create: Create new records
- edit: Update existing records
- delete: Delete records
- export: Export data
```

### Permission Registry

```typescript
// lib/authorization/permission-keys.ts

export const Permissions = {
  // ===================================================================
  // BUSINESS SCOPE - Business-wide resources (multi-branch level)
  // ===================================================================
  
  // Billing & Subscription
  BUSINESS_VIEW_BILLING: 'business:view:billing',
  BUSINESS_MANAGE_BILLING: 'business:manage:billing',
  BUSINESS_MANAGE_SUBSCRIPTION: 'business:manage:subscription',
  
  // Branch Management
  BUSINESS_VIEW_BRANCHES: 'business:view:branches',
  BUSINESS_MANAGE_BRANCHES: 'business:manage:branches',
  BUSINESS_CREATE_BRANCH: 'business:create:branch',
  BUSINESS_DELETE_BRANCH: 'business:delete:branch',
  
  // Business Capabilities
  BUSINESS_VIEW_CAPABILITIES: 'business:view:capabilities',
  BUSINESS_MANAGE_CAPABILITIES: 'business:manage:capabilities',
  
  // Business Profile
  BUSINESS_VIEW_PROFILE: 'business:view:profile',
  BUSINESS_MANAGE_PROFILE: 'business:manage:profile',
  
  // Suppliers (Shared across branches)
  BUSINESS_VIEW_SUPPLIERS: 'business:view:suppliers',
  BUSINESS_MANAGE_SUPPLIERS: 'business:manage:suppliers',
  BUSINESS_CREATE_SUPPLIER: 'business:create:supplier',
  BUSINESS_DELETE_SUPPLIER: 'business:delete:supplier',
  
  // Customers (Shared across branches)
  BUSINESS_VIEW_CUSTOMERS: 'business:view:customers',
  BUSINESS_MANAGE_CUSTOMERS: 'business:manage:customers',
  BUSINESS_CREATE_CUSTOMER: 'business:create:customer',
  BUSINESS_DELETE_CUSTOMER: 'business:delete:customer',
  
  // User Management (Business-wide)
  BUSINESS_VIEW_USERS: 'business:view:users',
  BUSINESS_MANAGE_USERS: 'business:manage:users',
  BUSINESS_INVITE_USER: 'business:invite:user',
  BUSINESS_DELETE_USER: 'business:delete:user',
  
  // Business Analytics
  BUSINESS_VIEW_ANALYTICS: 'business:view:analytics',
  BUSINESS_EXPORT_DATA: 'business:export:data',
  
  // ===================================================================
  // BRANCH SCOPE - Branch-specific resources
  // ===================================================================
  
  // Employees
  BRANCH_VIEW_EMPLOYEES: 'branch:view:employees',
  BRANCH_MANAGE_EMPLOYEES: 'branch:manage:employees',
  BRANCH_CREATE_EMPLOYEE: 'branch:create:employee',
  BRANCH_EDIT_EMPLOYEE: 'branch:edit:employee',
  BRANCH_DELETE_EMPLOYEE: 'branch:delete:employee',
  
  // Products
  BRANCH_VIEW_PRODUCTS: 'branch:view:products',
  BRANCH_MANAGE_PRODUCTS: 'branch:manage:products',
  BRANCH_CREATE_PRODUCT: 'branch:create:product',
  BRANCH_EDIT_PRODUCT: 'branch:edit:product',
  BRANCH_DELETE_PRODUCT: 'branch:delete:product',
  
  // Inventory
  BRANCH_VIEW_INVENTORY: 'branch:view:inventory',
  BRANCH_MANAGE_INVENTORY: 'branch:manage:inventory',
  BRANCH_ADJUST_INVENTORY: 'branch:adjust:inventory',
  
  // Orders & POS
  BRANCH_VIEW_ORDERS: 'branch:view:orders',
  BRANCH_CREATE_ORDER: 'branch:create:order',
  BRANCH_EDIT_ORDER: 'branch:edit:order',
  BRANCH_CANCEL_ORDER: 'branch:cancel:order',
  BRANCH_REFUND_ORDER: 'branch:refund:order',
  
  // Transactions
  BRANCH_VIEW_TRANSACTIONS: 'branch:view:transactions',
  BRANCH_CREATE_TRANSACTION: 'branch:create:transaction',
  
  // Reports
  BRANCH_VIEW_SALES_REPORTS: 'branch:view:sales-reports',
  BRANCH_VIEW_INVENTORY_REPORTS: 'branch:view:inventory-reports',
  BRANCH_VIEW_EMPLOYEE_REPORTS: 'branch:view:employee-reports',
  BRANCH_EXPORT_REPORTS: 'branch:export:reports',
  
  // Settings
  BRANCH_VIEW_SETTINGS: 'branch:view:settings',
  BRANCH_MANAGE_SETTINGS: 'branch:manage:settings',
  BRANCH_MANAGE_ENTITLEMENTS: 'branch:manage:entitlements',
  
  // Tasks
  BRANCH_VIEW_TASKS: 'branch:view:tasks',
  BRANCH_CREATE_TASK: 'branch:create:task',
  BRANCH_MANAGE_TASKS: 'branch:manage:tasks',
  
  // Purchases
  BRANCH_VIEW_PURCHASES: 'branch:view:purchases',
  BRANCH_CREATE_PURCHASE: 'branch:create:purchase',
  BRANCH_MANAGE_PURCHASES: 'branch:manage:purchases',
  
  // ===================================================================
  // USER SCOPE - Personal account management
  // ===================================================================
  
  USER_VIEW_ACCOUNT: 'user:view:account',
  USER_MANAGE_ACCOUNT: 'user:manage:account',
  USER_CHANGE_PASSWORD: 'user:change:password',
  USER_MANAGE_PREFERENCES: 'user:manage:preferences',
} as const

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions]

// Helper to extract scope from permission
export function getPermissionScope(permission: PermissionKey): 'business' | 'branch' | 'user' {
  return permission.split(':')[0] as 'business' | 'branch' | 'user'
}

// Helper to extract action from permission
export function getPermissionAction(permission: PermissionKey): string {
  return permission.split(':')[1]
}

// Helper to extract resource from permission
export function getPermissionResource(permission: PermissionKey): string {
  return permission.split(':')[2]
}
```

---

## 👥 ROLE DEFINITIONS (Permission Presets)

```typescript
// lib/authorization/role-permissions.ts

import { Permissions, type PermissionKey } from './permission-keys'

/**
 * Role definitions as preset collections of permissions.
 * These are DEFAULT permissions - individual users can have permissions added or removed.
 */
export const RolePermissions: Record<string, PermissionKey[]> = {
  // ===================================================================
  // OWNER - Business owner, full access to everything
  // ===================================================================
  OWNER: [
    // All business permissions
    Permissions.BUSINESS_VIEW_BILLING,
    Permissions.BUSINESS_MANAGE_BILLING,
    Permissions.BUSINESS_MANAGE_SUBSCRIPTION,
    Permissions.BUSINESS_VIEW_BRANCHES,
    Permissions.BUSINESS_MANAGE_BRANCHES,
    Permissions.BUSINESS_CREATE_BRANCH,
    Permissions.BUSINESS_DELETE_BRANCH,
    Permissions.BUSINESS_VIEW_CAPABILITIES,
    Permissions.BUSINESS_MANAGE_CAPABILITIES,
    Permissions.BUSINESS_VIEW_PROFILE,
    Permissions.BUSINESS_MANAGE_PROFILE,
    Permissions.BUSINESS_VIEW_SUPPLIERS,
    Permissions.BUSINESS_MANAGE_SUPPLIERS,
    Permissions.BUSINESS_CREATE_SUPPLIER,
    Permissions.BUSINESS_DELETE_SUPPLIER,
    Permissions.BUSINESS_VIEW_CUSTOMERS,
    Permissions.BUSINESS_MANAGE_CUSTOMERS,
    Permissions.BUSINESS_CREATE_CUSTOMER,
    Permissions.BUSINESS_DELETE_CUSTOMER,
    Permissions.BUSINESS_VIEW_USERS,
    Permissions.BUSINESS_MANAGE_USERS,
    Permissions.BUSINESS_INVITE_USER,
    Permissions.BUSINESS_DELETE_USER,
    Permissions.BUSINESS_VIEW_ANALYTICS,
    Permissions.BUSINESS_EXPORT_DATA,
    
    // All branch permissions
    Permissions.BRANCH_VIEW_EMPLOYEES,
    Permissions.BRANCH_MANAGE_EMPLOYEES,
    Permissions.BRANCH_CREATE_EMPLOYEE,
    Permissions.BRANCH_EDIT_EMPLOYEE,
    Permissions.BRANCH_DELETE_EMPLOYEE,
    Permissions.BRANCH_VIEW_PRODUCTS,
    Permissions.BRANCH_MANAGE_PRODUCTS,
    Permissions.BRANCH_CREATE_PRODUCT,
    Permissions.BRANCH_EDIT_PRODUCT,
    Permissions.BRANCH_DELETE_PRODUCT,
    Permissions.BRANCH_VIEW_INVENTORY,
    Permissions.BRANCH_MANAGE_INVENTORY,
    Permissions.BRANCH_ADJUST_INVENTORY,
    Permissions.BRANCH_VIEW_ORDERS,
    Permissions.BRANCH_CREATE_ORDER,
    Permissions.BRANCH_EDIT_ORDER,
    Permissions.BRANCH_CANCEL_ORDER,
    Permissions.BRANCH_REFUND_ORDER,
    Permissions.BRANCH_VIEW_TRANSACTIONS,
    Permissions.BRANCH_CREATE_TRANSACTION,
    Permissions.BRANCH_VIEW_SALES_REPORTS,
    Permissions.BRANCH_VIEW_INVENTORY_REPORTS,
    Permissions.BRANCH_VIEW_EMPLOYEE_REPORTS,
    Permissions.BRANCH_EXPORT_REPORTS,
    Permissions.BRANCH_VIEW_SETTINGS,
    Permissions.BRANCH_MANAGE_SETTINGS,
    Permissions.BRANCH_MANAGE_ENTITLEMENTS,
    Permissions.BRANCH_VIEW_TASKS,
    Permissions.BRANCH_CREATE_TASK,
    Permissions.BRANCH_MANAGE_TASKS,
    Permissions.BRANCH_VIEW_PURCHASES,
    Permissions.BRANCH_CREATE_PURCHASE,
    Permissions.BRANCH_MANAGE_PURCHASES,
    
    // User permissions
    Permissions.USER_VIEW_ACCOUNT,
    Permissions.USER_MANAGE_ACCOUNT,
    Permissions.USER_CHANGE_PASSWORD,
    Permissions.USER_MANAGE_PREFERENCES,
  ],
  
  // ===================================================================
  // ADMIN - Branch administrator with some business access
  // ===================================================================
  ADMIN: [
    // Limited business permissions (view only by default)
    Permissions.BUSINESS_VIEW_SUPPLIERS,
    Permissions.BUSINESS_MANAGE_SUPPLIERS,
    Permissions.BUSINESS_VIEW_CUSTOMERS,
    Permissions.BUSINESS_MANAGE_CUSTOMERS,
    
    // Full branch permissions
    Permissions.BRANCH_VIEW_EMPLOYEES,
    Permissions.BRANCH_MANAGE_EMPLOYEES,
    Permissions.BRANCH_CREATE_EMPLOYEE,
    Permissions.BRANCH_EDIT_EMPLOYEE,
    Permissions.BRANCH_DELETE_EMPLOYEE,
    Permissions.BRANCH_VIEW_PRODUCTS,
    Permissions.BRANCH_MANAGE_PRODUCTS,
    Permissions.BRANCH_CREATE_PRODUCT,
    Permissions.BRANCH_EDIT_PRODUCT,
    Permissions.BRANCH_DELETE_PRODUCT,
    Permissions.BRANCH_VIEW_INVENTORY,
    Permissions.BRANCH_MANAGE_INVENTORY,
    Permissions.BRANCH_ADJUST_INVENTORY,
    Permissions.BRANCH_VIEW_ORDERS,
    Permissions.BRANCH_CREATE_ORDER,
    Permissions.BRANCH_EDIT_ORDER,
    Permissions.BRANCH_CANCEL_ORDER,
    Permissions.BRANCH_REFUND_ORDER,
    Permissions.BRANCH_VIEW_TRANSACTIONS,
    Permissions.BRANCH_CREATE_TRANSACTION,
    Permissions.BRANCH_VIEW_SALES_REPORTS,
    Permissions.BRANCH_VIEW_INVENTORY_REPORTS,
    Permissions.BRANCH_VIEW_EMPLOYEE_REPORTS,
    Permissions.BRANCH_EXPORT_REPORTS,
    Permissions.BRANCH_VIEW_SETTINGS,
    Permissions.BRANCH_MANAGE_SETTINGS,
    Permissions.BRANCH_MANAGE_ENTITLEMENTS,
    Permissions.BRANCH_VIEW_TASKS,
    Permissions.BRANCH_CREATE_TASK,
    Permissions.BRANCH_MANAGE_TASKS,
    Permissions.BRANCH_VIEW_PURCHASES,
    Permissions.BRANCH_CREATE_PURCHASE,
    Permissions.BRANCH_MANAGE_PURCHASES,
    
    // User permissions
    Permissions.USER_VIEW_ACCOUNT,
    Permissions.USER_MANAGE_ACCOUNT,
    Permissions.USER_CHANGE_PASSWORD,
    Permissions.USER_MANAGE_PREFERENCES,
  ],
  
  // ===================================================================
  // SUPERVISOR - Middle management, reports and some admin tasks
  // ===================================================================
  SUPERVISOR: [
    // Limited business permissions
    Permissions.BUSINESS_VIEW_SUPPLIERS,
    Permissions.BUSINESS_MANAGE_SUPPLIERS,
    Permissions.BUSINESS_VIEW_CUSTOMERS,
    Permissions.BUSINESS_MANAGE_CUSTOMERS,
    
    // Limited branch permissions (no user management by default)
    Permissions.BRANCH_VIEW_EMPLOYEES,
    Permissions.BRANCH_VIEW_PRODUCTS,
    Permissions.BRANCH_MANAGE_PRODUCTS,
    Permissions.BRANCH_CREATE_PRODUCT,
    Permissions.BRANCH_EDIT_PRODUCT,
    Permissions.BRANCH_VIEW_INVENTORY,
    Permissions.BRANCH_MANAGE_INVENTORY,
    Permissions.BRANCH_ADJUST_INVENTORY,
    Permissions.BRANCH_VIEW_ORDERS,
    Permissions.BRANCH_CREATE_ORDER,
    Permissions.BRANCH_EDIT_ORDER,
    Permissions.BRANCH_VIEW_TRANSACTIONS,
    Permissions.BRANCH_CREATE_TRANSACTION,
    Permissions.BRANCH_VIEW_SALES_REPORTS,
    Permissions.BRANCH_VIEW_INVENTORY_REPORTS,
    Permissions.BRANCH_VIEW_EMPLOYEE_REPORTS,
    Permissions.BRANCH_EXPORT_REPORTS,
    Permissions.BRANCH_VIEW_SETTINGS,
    Permissions.BRANCH_VIEW_TASKS,
    Permissions.BRANCH_CREATE_TASK,
    Permissions.BRANCH_MANAGE_TASKS,
    Permissions.BRANCH_VIEW_PURCHASES,
    Permissions.BRANCH_CREATE_PURCHASE,
    Permissions.BRANCH_MANAGE_PURCHASES,
    
    // User permissions
    Permissions.USER_VIEW_ACCOUNT,
    Permissions.USER_MANAGE_ACCOUNT,
    Permissions.USER_CHANGE_PASSWORD,
    Permissions.USER_MANAGE_PREFERENCES,
  ],
  
  // ===================================================================
  // CASHIER - Front-line staff, POS and basic operations
  // ===================================================================
  CASHIER: [
    // Very limited branch permissions (POS focused)
    Permissions.BRANCH_VIEW_PRODUCTS,
    Permissions.BRANCH_VIEW_ORDERS,
    Permissions.BRANCH_CREATE_ORDER,
    Permissions.BRANCH_VIEW_TRANSACTIONS,
    Permissions.BRANCH_CREATE_TRANSACTION,
    Permissions.BRANCH_VIEW_TASKS,
    
    // User permissions
    Permissions.USER_VIEW_ACCOUNT,
    Permissions.USER_MANAGE_ACCOUNT,
    Permissions.USER_CHANGE_PASSWORD,
    Permissions.USER_MANAGE_PREFERENCES,
  ],
}

/**
 * Get default permissions for a role.
 * Returns empty array if role not found.
 */
export function getDefaultPermissionsForRole(role: string): PermissionKey[] {
  return RolePermissions[role] ?? []
}

/**
 * Check if a role includes a specific permission by default.
 */
export function roleHasPermission(role: string, permission: PermissionKey): boolean {
  return RolePermissions[role]?.includes(permission) ?? false
}
```

---

## 🗄️ DATABASE SCHEMA CHANGES

### New Tables

```prisma
// prisma/schema.prisma

// Add OWNER to Role enum
enum Role {
  OWNER        // Business owner - full access by default
  ADMIN        // Branch admin - can be delegated business permissions
  SUPERVISOR   // Branch supervisor - limited by default
  CASHIER      // Front-line staff - minimal permissions
}

// New: Permission definitions (mirrors Feature table pattern)
model Permission {
  id          String   @id @default(cuid())
  key         String   @unique  // e.g., "business:manage:billing"
  name        String               // e.g., "Manage Business Billing"
  description String?              // Human-readable description
  scope       PermissionScope      // business | branch | user
  resource    String               // e.g., "billing", "employees", "products"
  action      PermissionAction     // view | manage | create | edit | delete | export
  category    String?              // Grouping for UI (e.g., "Business Management", "Branch Operations")
  isSystem    Boolean  @default(true)  // System permissions can't be deleted
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  userPermissions UserPermission[]
  roleDefaults    RoleDefaultPermission[]

  @@index([scope, resource, action])
  @@index([category])
}

enum PermissionScope {
  BUSINESS  // Business-level resources
  BRANCH    // Branch-level resources
  USER      // User's own account
}

enum PermissionAction {
  VIEW      // Read-only access
  MANAGE    // Full CRUD access
  CREATE    // Create new records
  EDIT      // Update existing records
  DELETE    // Delete records
  EXPORT    // Export data
}

// New: User permissions (actual grants to users)
model UserPermission {
  id           String   @id @default(cuid())
  userId       String
  permissionId String
  granted      Boolean  @default(true)  // true = granted, false = explicitly revoked
  grantedBy    String?                 // User ID who granted this permission
  grantedAt    DateTime @default(now())
  expiresAt    DateTime?               // Optional expiration for temporary grants
  note         String?                 // Reason for grant/revoke

  // Relations
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  grantor    User?      @relation("PermissionGrantor", fields: [grantedBy], references: [id])

  @@unique([userId, permissionId])
  @@index([userId, granted])
  @@index([permissionId])
}

// New: Role default permissions (what permissions each role gets by default)
model RoleDefaultPermission {
  id           String   @id @default(cuid())
  role         Role
  permissionId String
  createdAt    DateTime @default(now())

  // Relations
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([role, permissionId])
  @@index([role])
}

// Update User model to add permission relations
model User {
  // ... existing fields ...
  
  // New relations
  userPermissions      UserPermission[]
  permissionsGranted   UserPermission[] @relation("PermissionGrantor")
}
```

---

## 🏗️ AUTHORIZATION ENGINE

### Core Engine (mirrors EntitlementEngine pattern)

```typescript
// lib/authorization/authorization-engine.ts

import { db } from '@/lib/db'
import { Permissions, type PermissionKey } from './permission-keys'
import { getDefaultPermissionsForRole } from './role-permissions'

export interface AuthorizationContext {
  userId: string
  role: string
  branchId?: string
  businessId?: string
}

export interface PermissionSummary {
  permissions: PermissionKey[]
  role: string
  customGrants: PermissionKey[]   // Permissions added beyond role defaults
  customRevokes: PermissionKey[]  // Permissions removed from role defaults
}

/**
 * AuthorizationEngine - Permission checking system
 * Mirrors the EntitlementEngine pattern for capabilities
 */
export class AuthorizationEngine {
  /**
   * Build a complete permission summary for a user.
   * This is called once at session load and cached in authStore.
   */
  static async buildSummary(ctx: AuthorizationContext): Promise<PermissionSummary> {
    // 1. Get role default permissions
    const roleDefaults = getDefaultPermissionsForRole(ctx.role)
    
    // 2. Get user-specific permission grants/revokes from database
    const userPermissions = await db.userPermission.findMany({
      where: {
        userId: ctx.userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        permission: true,
      },
    })
    
    // 3. Separate grants and revokes
    const grants = userPermissions
      .filter(up => up.granted)
      .map(up => up.permission.key as PermissionKey)
    
    const revokes = userPermissions
      .filter(up => !up.granted)
      .map(up => up.permission.key as PermissionKey)
    
    // 4. Calculate final permission set
    const finalPermissions = new Set<PermissionKey>([
      ...roleDefaults,
      ...grants,
    ])
    
    // Remove explicitly revoked permissions
    revokes.forEach(permission => finalPermissions.delete(permission))
    
    // 5. Calculate custom grants and revokes for UI display
    const customGrants = grants.filter(p => !roleDefaults.includes(p))
    const customRevokes = revokes.filter(p => roleDefaults.includes(p))
    
    return {
      permissions: Array.from(finalPermissions),
      role: ctx.role,
      customGrants,
      customRevokes,
    }
  }
  
  /**
   * Check if a user has a specific permission.
   * Used in server-side middleware and server functions.
   */
  static async check(
    permission: PermissionKey,
    ctx: AuthorizationContext
  ): Promise<{ granted: boolean; reason?: string }> {
    const summary = await this.buildSummary(ctx)
    
    const granted = summary.permissions.includes(permission)
    
    return {
      granted,
      reason: granted ? undefined : `Permission ${permission} not granted to user`,
    }
  }
  
  /**
   * Check multiple permissions at once.
   * Returns true only if ALL permissions are granted.
   */
  static async checkAll(
    permissions: PermissionKey[],
    ctx: AuthorizationContext
  ): Promise<{ granted: boolean; missing?: PermissionKey[] }> {
    const summary = await this.buildSummary(ctx)
    
    const missing = permissions.filter(p => !summary.permissions.includes(p))
    
    return {
      granted: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    }
  }
  
  /**
   * Check if user has ANY of the given permissions.
   * Returns true if at least ONE permission is granted.
   */
  static async checkAny(
    permissions: PermissionKey[],
    ctx: AuthorizationContext
  ): Promise<{ granted: boolean; matched?: PermissionKey[] }> {
    const summary = await this.buildSummary(ctx)
    
    const matched = permissions.filter(p => summary.permissions.includes(p))
    
    return {
      granted: matched.length > 0,
      matched: matched.length > 0 ? matched : undefined,
    }
  }
  
  /**
   * Grant a permission to a user.
   * Can be used to add permissions beyond role defaults.
   */
  static async grant(
    userId: string,
    permissionKey: PermissionKey,
    grantedBy: string,
    note?: string,
    expiresAt?: Date
  ): Promise<void> {
    const permission = await db.permission.findUnique({
      where: { key: permissionKey },
    })
    
    if (!permission) {
      throw new Error(`Permission ${permissionKey} not found`)
    }
    
    await db.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: true,
        grantedBy,
        note,
        expiresAt,
      },
      update: {
        granted: true,
        grantedBy,
        grantedAt: new Date(),
        note,
        expiresAt,
      },
    })
  }
  
  /**
   * Revoke a permission from a user.
   * Creates an explicit revoke record that overrides role defaults.
   */
  static async revoke(
    userId: string,
    permissionKey: PermissionKey,
    revokedBy: string,
    note?: string
  ): Promise<void> {
    const permission = await db.permission.findUnique({
      where: { key: permissionKey },
    })
    
    if (!permission) {
      throw new Error(`Permission ${permissionKey} not found`)
    }
    
    await db.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId,
          permissionId: permission.id,
        },
      },
      create: {
        userId,
        permissionId: permission.id,
        granted: false,
        grantedBy: revokedBy,
        note,
      },
      update: {
        granted: false,
        grantedBy: revokedBy,
        grantedAt: new Date(),
        note,
      },
    })
  }
  
  /**
   * Remove a permission override (grant or revoke).
   * Returns user to role default for this permission.
   */
  static async resetToDefault(userId: string, permissionKey: PermissionKey): Promise<void> {
    const permission = await db.permission.findUnique({
      where: { key: permissionKey },
    })
    
    if (!permission) return
    
    await db.userPermission.deleteMany({
      where: {
        userId,
        permissionId: permission.id,
      },
    })
  }
}
```

---

## 🎣 CLIENT-SIDE HOOKS

```typescript
// hooks/use-permission.ts

import { useStore } from '@tanstack/react-store'
import type { PermissionKey } from '@/lib/authorization/permission-keys'
import { authStore } from '@/store/auth-store'

/**
 * Check if the current user has a specific permission.
 * Mirrors useCapability pattern.
 */
export function usePermission(permission: PermissionKey): boolean {
  return useStore(
    authStore,
    state => state.user?.authorization?.permissions?.includes(permission) ?? false
  )
}

/**
 * Check multiple permissions at once.
 * Returns a record of boolean values for each permission.
 */
export function usePermissions<T extends PermissionKey>(
  permissions: T[]
): Record<T, boolean> {
  const granted = useStore(
    authStore,
    state => state.user?.authorization?.permissions ?? []
  )
  
  return Object.fromEntries(
    permissions.map(perm => [perm, granted.includes(perm)])
  ) as Record<T, boolean>
}

/**
 * Check if user has ALL of the given permissions.
 */
export function useHasAllPermissions(permissions: PermissionKey[]): boolean {
  const granted = useStore(
    authStore,
    state => state.user?.authorization?.permissions ?? []
  )
  
  return permissions.every(perm => granted.includes(perm))
}

/**
 * Check if user has ANY of the given permissions.
 */
export function useHasAnyPermission(permissions: PermissionKey[]): boolean {
  const granted = useStore(
    authStore,
    state => state.user?.authorization?.permissions ?? []
  )
  
  return permissions.some(perm => granted.includes(perm))
}

/**
 * Get the user's current role.
 */
export function useUserRole(): string | undefined {
  return useStore(authStore, state => state.user?.role)
}

/**
 * Get custom permission grants (beyond role defaults).
 */
export function useCustomPermissions(): {
  grants: PermissionKey[]
  revokes: PermissionKey[]
} {
  return useStore(authStore, state => ({
    grants: state.user?.authorization?.customGrants ?? [],
    revokes: state.user?.authorization?.customRevokes ?? [],
  }))
}
```

---

## 🛡️ REACT COMPONENTS

```typescript
// components/require-permission.tsx

import type { ReactNode } from 'react'
import { usePermission, useHasAllPermissions, useHasAnyPermission } from '@/hooks/use-permission'
import type { PermissionKey } from '@/lib/authorization/permission-keys'

interface RequirePermissionProps {
  permission?: PermissionKey
  allOf?: PermissionKey[]
  anyOf?: PermissionKey[]
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Conditionally render children based on user permissions.
 * Mirrors RequireCapability pattern.
 * 
 * @example
 * <RequirePermission permission={Permissions.BUSINESS_MANAGE_BILLING}>
 *   <BillingSettings />
 * </RequirePermission>
 * 
 * @example
 * <RequirePermission allOf={[Permissions.BRANCH_VIEW_EMPLOYEES, Permissions.BRANCH_MANAGE_EMPLOYEES]}>
 *   <EmployeeManager />
 * </RequirePermission>
 */
export function RequirePermission({
  permission,
  allOf,
  anyOf,
  fallback = null,
  children,
}: RequirePermissionProps) {
  const hasSingle = usePermission(permission!)
  const hasAll = useHasAllPermissions(allOf ?? [])
  const hasAny = useHasAnyPermission(anyOf ?? [])
  
  let granted = false
  
  if (permission) granted = hasSingle
  else if (allOf) granted = hasAll
  else if (anyOf) granted = hasAny
  
  if (!granted) return <>{fallback}</>
  
  return <>{children}</>
}
```

---

## 🚀 IMPLEMENTATION PHASES

### Phase 0: Foundation (Week 1)

**Goal:** Set up permission system infrastructure without breaking existing code

**Tasks:**
1. Add OWNER to Role enum in schema
2. Create Permission, UserPermission, RoleDefaultPermission models
3. Create permission-keys.ts with all permission definitions
4. Create role-permissions.ts with role presets
5. Create authorization-engine.ts
6. Create database seed for permissions
7. Write tests for authorization engine

**Deliverables:**
- ✅ Database schema updated
- ✅ Permission registry complete
- ✅ Authorization engine functional
- ✅ Tests passing

---

### Phase 1: Client Integration (Week 1-2)

**Goal:** Make permissions available in the frontend

**Tasks:**
1. Update authStore to include authorization summary
2. Update auth-engine.ts to call AuthorizationEngine.buildSummary
3. Create usePermission hooks
4. Create RequirePermission component
5. Update existing RequireCapability to support permissions
6. Write tests for hooks and components

**Deliverables:**
- ✅ Permissions available in authStore
- ✅ Hooks working
- ✅ Components ready for use

---

### Phase 2: Route Guards Migration (Week 2)

**Goal:** Replace role checks in route guards with permission checks

**Tasks:**
1. Update /business route guards to check permissions
2. Update /settings route guards to check permissions
3. Update branch routes to check permissions
4. Keep backward compatibility (check both role and permission)
5. Test all route access patterns

**Example:**
```typescript
// Before
beforeLoad: async () => {
  const { user } = authStore.state
  if (user.role !== Role.ADMIN) {
    throw redirect({ to: '/dashboard' })
  }
}

// After
beforeLoad: async () => {
  const { user } = authStore.state
  const canAccess = user.authorization?.permissions?.includes(
    Permissions.BUSINESS_VIEW_BILLING
  )
  if (!canAccess) {
    throw redirect({ to: '/dashboard' })
  }
}
```

**Deliverables:**
- ✅ All route guards using permissions
- ✅ Backward compatibility maintained
- ✅ Access control verified

---

### Phase 3: UI Component Migration (Week 2-3)

**Goal:** Replace role checks in UI components with permission checks

**Tasks:**
1. Update AppSidebar to use permissions
2. Update ContextSwitcher to use permissions
3. Replace all `user.role === Role.ADMIN` checks with permission checks
4. Update button/action visibility based on permissions
5. Test UI with different permission combinations

**Example:**
```typescript
// Before
{isAdmin && (
  <Button onClick={handleDelete}>Delete</Button>
)}

// After
<RequirePermission permission={Permissions.BRANCH_DELETE_EMPLOYEE}>
  <Button onClick={handleDelete}>Delete</Button>
</RequirePermission>
```

**Deliverables:**
- ✅ All UI using permission checks
- ✅ Role checks removed
- ✅ UI tested with various roles

---

### Phase 4: Server-Side Middleware (Week 3)

**Goal:** Enforce permissions on the backend

**Tasks:**
1. Create permission middleware for server functions
2. Update all mutative server functions to check permissions
3. Add permission checks to API routes
4. Create audit log for permission grants/revokes
5. Test server-side enforcement

**Example:**
```typescript
// Server function with permission check
export const deleteEmployee = createServerFn({ method: 'POST' })
  .middleware([authMiddleware, permissionMiddleware(Permissions.BRANCH_DELETE_EMPLOYEE)])
  .handler(async ({ data, context }) => {
    // Permission already checked by middleware
    await db.user.delete({ where: { id: data.employeeId } })
    return { success: true }
  })
```

**Deliverables:**
- ✅ All server functions protected
- ✅ Permission middleware working
- ✅ Audit logging implemented

---

### Phase 5: Permission Management UI (Week 3-4)

**Goal:** Allow owners/admins to grant/revoke permissions

**Tasks:**
1. Create permission management page at /business/users/:userId/permissions
2. Show role defaults vs custom grants/revokes
3. Add UI to grant extra permissions
4. Add UI to revoke default permissions
5. Add permission search and filtering
6. Add permission expiration support
7. Show audit trail of permission changes

**UI Mockup:**
```
┌─────────────────────────────────────────────────────┐
│  User: John Doe (SUPERVISOR)                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Role Default Permissions (10)                      │
│  ✓ branch:view:employees                           │
│  ✓ branch:view:products                            │
│  ✓ branch:manage:products                          │
│  ...                                                │
│                                                      │
│  Custom Grants (+2)                                 │
│  ✓ branch:manage:employees  [Granted by Owner]     │
│  ✓ business:view:billing    [Granted by Owner]     │
│                                                      │
│  Custom Revokes (-1)                                │
│  ✗ branch:manage:products   [Revoked by Admin]     │
│                                                      │
│  [Grant Permission] [Revoke Permission]             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Deliverables:**
- ✅ Permission management UI
- ✅ Grant/revoke working
- ✅ Audit trail visible

---

### Phase 6: Documentation & Testing (Week 4)

**Goal:** Document the new system and ensure quality

**Tasks:**
1. Write migration guide for developers
2. Document permission naming conventions
3. Create permission reference docs
4. Write integration tests
5. Test with all role combinations
6. Create permission troubleshooting guide

**Deliverables:**
- ✅ Complete documentation
- ✅ All tests passing
- ✅ System ready for production

---

## 📊 USAGE EXAMPLES

### Example 1: Owner Delegates Billing to Admin

```typescript
// Owner grants billing management to an admin
await AuthorizationEngine.grant(
  adminUserId,
  Permissions.BUSINESS_MANAGE_BILLING,
  ownerUserId,
  'Admin needs to handle subscription renewals'
)

// Admin can now access /business/billing
// Route guard checks permission, not role
```

### Example 2: Cashier Gets Report Access

```typescript
// Supervisor grants report viewing to a cashier
await AuthorizationEngine.grant(
  cashierUserId,
  Permissions.BRANCH_VIEW_SALES_REPORTS,
  supervisorUserId,
  'Trusted cashier, needs to check daily totals'
)

// Cashier can now view reports (normally admin/supervisor only)
```

### Example 3: Supervisor Loses Product Management

```typescript
// Admin revokes product management from supervisor
await AuthorizationEngine.revoke(
  supervisorUserId,
  Permissions.BRANCH_MANAGE_PRODUCTS,
  adminUserId,
  'Training period - read-only access for now'
)

// Supervisor can still view products but not edit them
```

### Example 4: Temporary Permission

```typescript
// Grant temporary access that expires in 7 days
await AuthorizationEngine.grant(
  userId,
  Permissions.BUSINESS_VIEW_ANALYTICS,
  ownerUserId,
  'Temporary access for quarterly review',
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
)

// Permission automatically expires after 7 days
```

---

## ✅ SUCCESS CRITERIA

### Must Have:
- ✅ Permission system mirrors capability pattern
- ✅ Role becomes a label with default permissions
- ✅ Individual permissions can be granted/revoked per user
- ✅ All route guards use permission checks
- ✅ All UI components use permission checks
- ✅ Server-side enforcement working
- ✅ OWNER role can delegate business permissions
- ✅ Backward compatible during migration

### Nice To Have:
- Permission groups for easier management
- Permission templates (e.g., "Branch Manager Template")
- Bulk permission operations
- Permission analytics (who has what)
- Permission request workflow (user requests, admin approves)

---

## 🔄 MIGRATION STRATEGY

### Backward Compatibility

During migration, support both old and new patterns:

```typescript
// Route guard supports both
beforeLoad: async () => {
  const { user } = authStore.state
  
  // Check permission first (new way)
  const hasPermission = user.authorization?.permissions?.includes(
    Permissions.BUSINESS_MANAGE_BILLING
  )
  
  // Fall back to role check (old way)
  const hasRole = user.role === Role.ADMIN || user.role === Role.OWNER
  
  if (!hasPermission && !hasRole) {
    throw redirect({ to: '/dashboard' })
  }
}
```

### Migration Steps

1. **Add permission system** (Phase 0-1) - doesn't break anything
2. **Migrate routes gradually** (Phase 2) - keep role checks as fallback
3. **Migrate UI gradually** (Phase 3) - keep role checks as fallback
4. **Add server enforcement** (Phase 4) - enforce permissions
5. **Remove role fallbacks** (Phase 6) - after everything is tested

---

## 🤔 OPEN QUESTIONS

1. **Permission Inheritance**: Should branch permissions inherit from business? (e.g., business:manage:employees also grants branch:manage:employees)
2. **Multi-branch Permissions**: Should users have different permissions per branch, or global across all branches?
3. **Permission Expiration Notifications**: Should we notify users when temporary permissions are about to expire?
4. **Permission Request Workflow**: Should we build a UI for users to request permissions from admins?
5. **Permission Audit Retention**: How long should we keep permission change audit logs?

---

**STATUS:** 📋 Ready for review and feedback

**ESTIMATE:** 4 weeks for full implementation  
**RISK LEVEL:** 🟡 Medium (significant refactoring, but clear migration path)

**NEXT STEPS:**
1. Review and approve this plan
2. Decide on open questions
3. Start Phase 0: Database schema and foundation
4. Begin migration phases incrementally
