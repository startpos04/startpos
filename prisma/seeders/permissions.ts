/**
 * permissions.ts — Authorization System seed (Phase 0)
 *
 * Seeds all permission definitions and role default permissions.
 * This is platform-global data that must exist in every environment.
 *
 * All upserts are keyed on stable natural keys (permission.key, role + permissionId)
 * so the seed is fully idempotent — safe to re-run at any time.
 *
 * order = 0: runs before all tenant-specific seeders.
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: seeder tx type */
import type { PrismaClient } from 'prisma/generated/prisma/client'
import { getPermissionAction, getPermissionResource, getPermissionScope, Permissions } from '../../src/lib/authorization/permission-keys'
import { RolePermissions } from '../../src/lib/authorization/role-permissions'

export const order = 0

// ---------------------------------------------------------------------------
// Permission metadata for human-readable names and descriptions
// ---------------------------------------------------------------------------

const PermissionMetadata: Record<string, { name: string; description: string; category: string }> = {
  // Business Scope
  'business:view:billing': {
    name: 'View Business Billing',
    description: 'View subscription, invoices, and payment history',
    category: 'Business Management',
  },
  'business:manage:billing': {
    name: 'Manage Business Billing',
    description: 'Update payment methods, view invoices, manage subscription',
    category: 'Business Management',
  },
  'business:manage:subscription': {
    name: 'Manage Subscription',
    description: 'Change subscription plans, add features, cancel subscription',
    category: 'Business Management',
  },
  'business:view:branches': {
    name: 'View Branches',
    description: 'View list of all branches in the business',
    category: 'Business Management',
  },
  'business:manage:branches': {
    name: 'Manage Branches',
    description: 'Create, edit, and configure branches',
    category: 'Business Management',
  },
  'business:create:branch': {
    name: 'Create Branch',
    description: 'Create new branches',
    category: 'Business Management',
  },
  'business:delete:branch': {
    name: 'Delete Branch',
    description: 'Delete existing branches',
    category: 'Business Management',
  },
  'business:view:capabilities': {
    name: 'View Capabilities',
    description: 'View enabled features and capabilities',
    category: 'Business Management',
  },
  'business:manage:capabilities': {
    name: 'Manage Capabilities',
    description: 'Enable or disable business capabilities',
    category: 'Business Management',
  },
  'business:view:profile': {
    name: 'View Business Profile',
    description: 'View business name, logo, and details',
    category: 'Business Management',
  },
  'business:manage:profile': {
    name: 'Manage Business Profile',
    description: 'Update business name, logo, and details',
    category: 'Business Management',
  },
  'business:view:suppliers': {
    name: 'View Suppliers',
    description: 'View supplier list and details',
    category: 'Business Resources',
  },
  'business:manage:suppliers': {
    name: 'Manage Suppliers',
    description: 'Create, edit, and manage suppliers',
    category: 'Business Resources',
  },
  'business:create:supplier': {
    name: 'Create Supplier',
    description: 'Create new suppliers',
    category: 'Business Resources',
  },
  'business:delete:supplier': {
    name: 'Delete Supplier',
    description: 'Delete existing suppliers',
    category: 'Business Resources',
  },
  'business:view:customers': {
    name: 'View Customers',
    description: 'View customer list and details',
    category: 'Business Resources',
  },
  'business:manage:customers': {
    name: 'Manage Customers',
    description: 'Create, edit, and manage customers',
    category: 'Business Resources',
  },
  'business:create:customer': {
    name: 'Create Customer',
    description: 'Create new customers',
    category: 'Business Resources',
  },
  'business:delete:customer': {
    name: 'Delete Customer',
    description: 'Delete existing customers',
    category: 'Business Resources',
  },
  'business:view:users': {
    name: 'View Users',
    description: 'View all users across the business',
    category: 'User Management',
  },
  'business:manage:users': {
    name: 'Manage Users',
    description: 'Edit user roles and permissions',
    category: 'User Management',
  },
  'business:invite:user': {
    name: 'Invite User',
    description: 'Invite new users to the business',
    category: 'User Management',
  },
  'business:delete:user': {
    name: 'Delete User',
    description: 'Remove users from the business',
    category: 'User Management',
  },
  'business:view:analytics': {
    name: 'View Analytics',
    description: 'View business-wide analytics and reports',
    category: 'Analytics',
  },
  'business:export:data': {
    name: 'Export Data',
    description: 'Export business data and reports',
    category: 'Analytics',
  },

  // Branch Scope
  'branch:view:employees': {
    name: 'View Employees',
    description: 'View employee list and details',
    category: 'Branch Management',
  },
  'branch:manage:employees': {
    name: 'Manage Employees',
    description: 'Full employee management including hiring and termination',
    category: 'Branch Management',
  },
  'branch:create:employee': {
    name: 'Create Employee',
    description: 'Add new employees to the branch',
    category: 'Branch Management',
  },
  'branch:edit:employee': {
    name: 'Edit Employee',
    description: 'Update employee details',
    category: 'Branch Management',
  },
  'branch:delete:employee': {
    name: 'Delete Employee',
    description: 'Remove employees from the branch',
    category: 'Branch Management',
  },
  'branch:view:products': {
    name: 'View Products',
    description: 'View product catalog',
    category: 'Branch Operations',
  },
  'branch:manage:products': {
    name: 'Manage Products',
    description: 'Full product management including pricing',
    category: 'Branch Operations',
  },
  'branch:create:product': {
    name: 'Create Product',
    description: 'Add new products to the catalog',
    category: 'Branch Operations',
  },
  'branch:edit:product': {
    name: 'Edit Product',
    description: 'Update product details and pricing',
    category: 'Branch Operations',
  },
  'branch:delete:product': {
    name: 'Delete Product',
    description: 'Remove products from the catalog',
    category: 'Branch Operations',
  },
  'branch:view:inventory': {
    name: 'View Inventory',
    description: 'View inventory levels and stock',
    category: 'Inventory Management',
  },
  'branch:manage:inventory': {
    name: 'Manage Inventory',
    description: 'Full inventory management',
    category: 'Inventory Management',
  },
  'branch:adjust:inventory': {
    name: 'Adjust Inventory',
    description: 'Manually adjust inventory levels',
    category: 'Inventory Management',
  },
  'branch:view:orders': {
    name: 'View Orders',
    description: 'View order history and details',
    category: 'Sales & POS',
  },
  'branch:create:order': {
    name: 'Create Order',
    description: 'Create new customer orders',
    category: 'Sales & POS',
  },
  'branch:edit:order': {
    name: 'Edit Order',
    description: 'Modify existing orders',
    category: 'Sales & POS',
  },
  'branch:cancel:order': {
    name: 'Cancel Order',
    description: 'Cancel customer orders',
    category: 'Sales & POS',
  },
  'branch:refund:order': {
    name: 'Refund Order',
    description: 'Process order refunds',
    category: 'Sales & POS',
  },
  'branch:view:transactions': {
    name: 'View Transactions',
    description: 'View transaction history',
    category: 'Sales & POS',
  },
  'branch:create:transaction': {
    name: 'Create Transaction',
    description: 'Process sales transactions',
    category: 'Sales & POS',
  },
  'branch:view:sales-reports': {
    name: 'View Sales Reports',
    description: 'View sales analytics and reports',
    category: 'Reports',
  },
  'branch:view:inventory-reports': {
    name: 'View Inventory Reports',
    description: 'View inventory analytics and reports',
    category: 'Reports',
  },
  'branch:view:employee-reports': {
    name: 'View Employee Reports',
    description: 'View employee performance reports',
    category: 'Reports',
  },
  'branch:export:reports': {
    name: 'Export Reports',
    description: 'Export branch reports and data',
    category: 'Reports',
  },
  'branch:view:settings': {
    name: 'View Settings',
    description: 'View branch settings and configuration',
    category: 'Branch Management',
  },
  'branch:manage:settings': {
    name: 'Manage Settings',
    description: 'Update branch settings and configuration',
    category: 'Branch Management',
  },
  'branch:manage:entitlements': {
    name: 'Manage Entitlements',
    description: 'Configure branch feature entitlements',
    category: 'Branch Management',
  },
  'branch:view:tasks': {
    name: 'View Tasks',
    description: 'View operational tasks',
    category: 'Branch Operations',
  },
  'branch:create:task': {
    name: 'Create Task',
    description: 'Create new operational tasks',
    category: 'Branch Operations',
  },
  'branch:manage:tasks': {
    name: 'Manage Tasks',
    description: 'Full task management including approval',
    category: 'Branch Operations',
  },
  'branch:view:purchases': {
    name: 'View Purchases',
    description: 'View purchase orders and history',
    category: 'Purchasing',
  },
  'branch:create:purchase': {
    name: 'Create Purchase',
    description: 'Create new purchase orders',
    category: 'Purchasing',
  },
  'branch:manage:purchases': {
    name: 'Manage Purchases',
    description: 'Full purchase order management',
    category: 'Purchasing',
  },
  'branch:view:production': {
    name: 'View Production',
    description: 'View production orders and batch preparation',
    category: 'Production',
  },
  'branch:create:production': {
    name: 'Create Production',
    description: 'Create new production orders',
    category: 'Production',
  },
  'branch:manage:production': {
    name: 'Manage Production',
    description: 'Full production order management',
    category: 'Production',
  },

  // User Scope
  'user:view:account': {
    name: 'View Account',
    description: 'View own account details',
    category: 'Personal Account',
  },
  'user:manage:account': {
    name: 'Manage Account',
    description: 'Update own account details',
    category: 'Personal Account',
  },
  'user:change:password': {
    name: 'Change Password',
    description: 'Change own password',
    category: 'Personal Account',
  },
  'user:manage:preferences': {
    name: 'Manage Preferences',
    description: 'Update personal preferences',
    category: 'Personal Account',
  },
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function PermissionsSeed(prisma: PrismaClient) {
  console.info('🔐 Seeding Permission registry...')

  // ── Step 1: Seed all permissions ─────────────────────────────────────────
  const permissionKeys = Object.values(Permissions)
  let upsertedCount = 0

  for (const key of permissionKeys) {
    const metadata = PermissionMetadata[key] || {
      name: key,
      description: `Permission: ${key}`,
      category: 'Uncategorized',
    }

    await prisma.permission.upsert({
      where: { key },
      update: {
        name: metadata.name,
        description: metadata.description,
        scope: getPermissionScope(key),
        resource: getPermissionResource(key),
        action: getPermissionAction(key),
        category: metadata.category,
        isSystem: true,
      },
      create: {
        key,
        name: metadata.name,
        description: metadata.description,
        scope: getPermissionScope(key),
        resource: getPermissionResource(key),
        action: getPermissionAction(key),
        category: metadata.category,
        isSystem: true,
      },
    })
    upsertedCount++
  }

  console.info(`   ✔  ${upsertedCount} permissions upserted.`)

  // ── Step 2: Seed role default permissions ────────────────────────────────
  console.info('📦 Seeding RoleDefaultPermission records...')

  let rolePermissionCount = 0

  for (const [role, permissionKeys] of Object.entries(RolePermissions)) {
    for (const permissionKey of permissionKeys) {
      const permission = await prisma.permission.findUnique({
        where: { key: permissionKey },
      })

      if (!permission) {
        console.warn(`   ⚠️  Permission "${permissionKey}" not found for role "${role}", skipping.`)
        continue
      }

      await prisma.roleDefaultPermission.upsert({
        where: {
          role_permissionId: {
            role: role as any,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          role: role as any,
          permissionId: permission.id,
        },
      })
      rolePermissionCount++
    }

    console.info(`   ✔  Role "${role}" — ${permissionKeys.length} default permissions upserted.`)
  }

  console.info(`   ✔  Total ${rolePermissionCount} role default permissions upserted.`)
  console.info('✅ Permission seed complete.')
}

export default PermissionsSeed
