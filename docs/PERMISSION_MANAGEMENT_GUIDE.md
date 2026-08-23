# Permission Management Guide for Administrators

**Version**: 1.0  
**Last Updated**: 2026-08-23  
**Audience**: Business Owners, Administrators, HR Managers

---

## Table of Contents

1. [Introduction](#introduction)
2. [Understanding Roles vs Permissions](#understanding-roles-vs-permissions)
3. [Accessing Permission Management](#accessing-permission-management)
4. [Default Role Permissions](#default-role-permissions)
5. [Managing User Permissions](#managing-user-permissions)
6. [Common Use Cases](#common-use-cases)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Introduction

The Permission Management System allows you to control exactly what each user can do in your POS system. Instead of being limited to fixed roles (ADMIN, SUPERVISOR, CASHIER), you can now grant or revoke specific permissions to individual users.

### What You Can Do

- ✅ View all permissions for each user
- ✅ Grant additional permissions beyond role defaults
- ✅ Revoke specific permissions from users
- ✅ Reset users back to role defaults
- ✅ Track who made permission changes

### What This Means For Your Business

**Example**: You want a trusted SUPERVISOR to manage billing but not other admin functions:
- **Old Way**: Promote to ADMIN (gives access to everything 😰)
- **New Way**: Grant `BUSINESS_MANAGE_BILLING` permission only (precise control 🎯)

---

## Understanding Roles vs Permissions

### Roles (Old Way)

**Roles** are job titles that come with a preset package of permissions.

| Role | Description | Fixed Permissions |
|------|-------------|-------------------|
| **OWNER** | Business owner | All permissions (cannot be restricted) |
| **ADMIN** | Full administrator | Almost all permissions |
| **SUPERVISOR** | Manager/Supervisor | View and report permissions |
| **CASHIER** | Point-of-sale operator | Basic POS operations only |

**Limitation**: You can't customize what each role can do without changing everyone with that role.

---

### Permissions (New Way)

**Permissions** are specific capabilities that can be granted individually.

**Examples**:
- `BUSINESS_VIEW_BILLING` - View billing information
- `BRANCH_CREATE_EMPLOYEE` - Add new employees
- `BRANCH_VIEW_SALES_REPORTS` - View sales reports

**Advantage**: You can customize access for each user while keeping their role.

---

### How They Work Together

1. **Every user has a ROLE** (OWNER, ADMIN, SUPERVISOR, CASHIER)
2. **Each ROLE comes with default permissions**
3. **You can GRANT additional permissions** to specific users
4. **You can REVOKE default permissions** from specific users

**Formula**:
```
User's Final Permissions = Role Defaults + Custom Grants - Custom Revokes
```

**Example**:
- User Role: SUPERVISOR (has view permissions by default)
- You GRANT: `BRANCH_CREATE_EMPLOYEE` (now can create employees)
- You REVOKE: `BRANCH_VIEW_TRANSACTIONS` (cannot view transactions anymore)
- Final Result: All supervisor defaults + employee creation - transaction viewing

---

## Accessing Permission Management

### Step 1: Navigate to Permissions Page

1. Click on your business logo in the sidebar
2. Click **"Permissions"** from the business menu
3. You'll see a list of all users in your business

**URL**: `/business/permissions`

**Required Permission**: You must be ADMIN or OWNER to access this page.

---

### Step 2: Understanding the Permission Page

The permissions page shows:

#### User List (Left Side)
- User's name and email
- User's current role (OWNER, ADMIN, SUPERVISOR, CASHIER)
- Visual indicators:
  - 🟢 **Green badge**: User has custom permissions granted
  - 🔴 **Red badge**: User has custom permissions revoked
  - No badge: User has default role permissions only

#### Permission Details (When User Selected)
- **Role Permissions**: Permissions that come with the user's role
- **Custom Grants**: Additional permissions granted to this user
- **Custom Revokes**: Permissions removed from this user

---

## Default Role Permissions

### OWNER Role

**Description**: Business owner with full access to everything.

**Default Permissions**: ✅ All permissions (78 total)

**Cannot Be Restricted**: OWNER permissions cannot be revoked. If you need to restrict access, change the user's role first.

**Use Case**: Primary business owner who needs complete control.

---

### ADMIN Role

**Description**: Full administrator with management capabilities.

**Permission Categories**:
- ✅ All Business Management (billing, branches, profile)
- ✅ All Branch Management (employees, products, inventory)
- ✅ All Reports and Analytics
- ✅ All POS Operations
- ❌ Cannot manage other ADMIN or OWNER users (safety restriction)

**Default Permissions**: 65 permissions

**Typical Use Cases**:
- General manager
- Operations manager
- Senior staff with full system access

---

### SUPERVISOR Role

**Description**: Manager with reporting and monitoring capabilities.

**Permission Categories**:
- ✅ View all business and branch data
- ✅ View all reports and analytics
- ✅ Create orders and transactions (POS)
- ✅ View employees and inventory
- ❌ Cannot create, edit, or delete most resources
- ❌ Cannot manage billing or subscriptions
- ❌ Cannot manage users

**Default Permissions**: 28 permissions (all view + basic POS)

**Typical Use Cases**:
- Shift supervisor
- Department manager
- Store manager (monitoring only)

---

### CASHIER Role

**Description**: Point-of-sale operator with minimal system access.

**Permission Categories**:
- ✅ Create orders and transactions (POS)
- ✅ View products and inventory (for POS)
- ✅ Basic order operations (create, edit active orders)
- ❌ Cannot view reports
- ❌ Cannot view transaction history
- ❌ Cannot manage any resources
- ❌ Cannot access admin functions

**Default Permissions**: 8 permissions (POS operations only)

**Typical Use Cases**:
- Cashier
- Sales associate
- Front desk staff
- Part-time staff

---

## Managing User Permissions

### Viewing User Permissions

1. Go to `/business/permissions`
2. Click on a user in the list
3. View their permissions in three sections:
   - **Role Permissions** (gray badge) - Default for their role
   - **Custom Grants** (green badge) - Additional permissions granted
   - **Custom Revokes** (red badge) - Permissions removed

---

### Granting Additional Permissions

**Scenario**: You want to give a SUPERVISOR the ability to create employees.

**Steps**:
1. Go to `/business/permissions`
2. Select the user
3. Scroll to the permission you want to grant
4. Look for `BRANCH_CREATE_EMPLOYEE` in the available permissions list
5. Click **"Grant Permission"** button
6. Confirm the action

**Result**: The user now has `BRANCH_CREATE_EMPLOYEE` permission in addition to their SUPERVISOR defaults. They can now add new employees.

---

### Revoking Permissions

**Scenario**: You want to prevent a SUPERVISOR from viewing transaction history (they have this by default).

**Steps**:
1. Go to `/business/permissions`
2. Select the user
3. Find `BRANCH_VIEW_TRANSACTIONS` in their role permissions
4. Click **"Revoke Permission"** button
5. Confirm the action

**Result**: The user can no longer view transaction history, even though SUPERVISOR role normally includes this permission.

---

### Resetting to Role Defaults

**Scenario**: You've made many custom changes and want to reset a user back to their role's default permissions.

**Steps**:
1. Go to `/business/permissions`
2. Select the user
3. Click **"Reset to Role Defaults"** button at the top
4. Confirm the action

**Result**: All custom grants and revokes are removed. User has exactly the permissions of their role, nothing more, nothing less.

---

### Changing User Roles

**Important**: Changing a user's role changes their base permissions and may override custom grants/revokes.

**Steps**:
1. Go to `/employees` (admin page)
2. Click on the user you want to modify
3. Change their role in the user details
4. Save changes

**What Happens**:
- User's role permissions change immediately
- Custom grants/revokes are preserved (unless they conflict)
- User's session is refreshed on next action

**Example**:
- User is CASHIER with custom grant of `BRANCH_VIEW_SALES_REPORTS`
- You promote to SUPERVISOR
- Result: User has all SUPERVISOR permissions + the custom grant still applies

---

## Common Use Cases

### Use Case 1: Trusted Cashier with Reporting Access

**Scenario**: You have a senior cashier who helps with end-of-day reports but shouldn't have full supervisor access.

**Solution**:
- Keep them as CASHIER (for their primary job)
- Grant: `BRANCH_VIEW_SALES_REPORTS`
- Grant: `BRANCH_VIEW_TRANSACTIONS`

**Result**: They can still operate the POS as normal but can also pull reports when needed.

---

### Use Case 2: Supervisor Who Manages Billing

**Scenario**: Your operations manager handles subscription and billing issues but doesn't need full admin access.

**Solution**:
- Keep them as SUPERVISOR
- Grant: `BUSINESS_VIEW_BILLING`
- Grant: `BUSINESS_MANAGE_BILLING`

**Result**: They can manage your subscription and view invoices without having full admin control over employees, products, etc.

---

### Use Case 3: Admin Without Delete Permissions

**Scenario**: You want an admin who can manage day-to-day operations but cannot delete important records (safety measure).

**Solution**:
- Assign ADMIN role (gives most permissions)
- Revoke: `BRANCH_DELETE_EMPLOYEE`
- Revoke: `BRANCH_DELETE_PRODUCT`
- Revoke: `BUSINESS_DELETE_BRANCH`

**Result**: They have full management capabilities but cannot permanently delete critical records.

---

### Use Case 4: Read-Only Access for Accountant

**Scenario**: Your accountant needs to view all financial data but shouldn't be able to make any changes.

**Solution**:
- Assign SUPERVISOR role (has many view permissions)
- Grant: `BUSINESS_VIEW_BILLING`
- Grant: `BRANCH_VIEW_INVENTORY_REPORTS`
- Grant: `BRANCH_EXPORT_REPORTS`
- Revoke: `BRANCH_CREATE_ORDER` (accountant doesn't need POS)
- Revoke: `BRANCH_CREATE_TRANSACTION`

**Result**: Full financial visibility without the ability to modify data or make sales.

---

### Use Case 5: Department-Specific Access

**Scenario**: You have an inventory manager who only needs access to product and inventory management.

**Solution**:
- Assign SUPERVISOR role (base permissions)
- Grant: `BRANCH_MANAGE_PRODUCTS`
- Grant: `BRANCH_MANAGE_INVENTORY`
- Grant: `BRANCH_CREATE_PURCHASE`
- Revoke: `BRANCH_VIEW_SALES_REPORTS` (not needed)
- Revoke: `BRANCH_VIEW_TRANSACTIONS` (not needed)

**Result**: Focused permissions for inventory management without access to financial data.

---

### Use Case 6: Multi-Branch Manager

**Scenario**: A manager who oversees multiple branches but shouldn't access business-wide billing.

**Solution**:
- Assign ADMIN role (gives branch management)
- Revoke: `BUSINESS_MANAGE_BILLING`
- Revoke: `BUSINESS_MANAGE_SUBSCRIPTION`
- Keep: All branch management permissions

**Result**: Can manage all branches but cannot change subscription or billing settings.

---

## Best Practices

### 1. Start with Roles, Customize When Needed ✅

**Guideline**: Assign users to the role that best matches their job, then adjust with custom permissions only when necessary.

**Why**: Roles provide a sensible starting point. Custom permissions should be exceptions, not the norm.

**Example**:
- ❌ **Bad**: Give everyone CASHIER role, then grant 20 permissions individually
- ✅ **Good**: Give managers SUPERVISOR role, customize 2-3 permissions if needed

---

### 2. Use the Principle of Least Privilege ✅

**Guideline**: Give users the minimum permissions they need to do their job, no more.

**Why**: Reduces risk of accidental or intentional misuse.

**Example**:
- ❌ **Bad**: Make everyone ADMIN because it's easier
- ✅ **Good**: Most staff are CASHIER, only managers are SUPERVISOR, only you are ADMIN

---

### 3. Document Custom Permission Grants ✅

**Guideline**: Keep notes about why you granted custom permissions to specific users.

**Why**: Helps you remember the reasoning when reviewing permissions later.

**How**: Use the "Note" field when granting permissions (if available in UI), or keep a separate document.

**Example**:
```
User: Jane Doe
Custom Grant: BUSINESS_MANAGE_BILLING
Reason: Handles subscription renewals while manager is on leave
Date: 2026-08-23
Review Date: 2026-09-23
```

---

### 4. Periodically Review Permissions 🔄

**Guideline**: Review user permissions quarterly or when roles change.

**Why**: People's responsibilities change over time. Permissions should be updated to match.

**Checklist**:
- [ ] Are all custom grants still needed?
- [ ] Should any users be promoted/demoted?
- [ ] Are there temporary permissions that should be removed?
- [ ] Do new employees have appropriate access?

---

### 5. Revoke Access Immediately When Employees Leave ⚠️

**Guideline**: When an employee leaves, disable their account or remove permissions immediately.

**Why**: Prevents unauthorized access to your business data.

**Steps**:
1. Go to `/employees`
2. Find the user
3. Either delete the account or change role to lowest privilege
4. If using your auth system, you might have a "deactivate" option

---

### 6. Test Permission Changes Before Finalizing ✅

**Guideline**: After granting/revoking permissions, ask the user to verify they can (or cannot) access the intended features.

**Why**: Ensures the permission change had the desired effect.

**Example**:
- You grant `BRANCH_VIEW_SALES_REPORTS` to a cashier
- Ask them to try accessing the sales reports page
- Verify they can see it successfully

---

### 7. Don't Mix Permissions Across Scopes Unnecessarily ⚠️

**Guideline**: Be cautious when granting BUSINESS-level permissions to users who primarily work at BRANCH-level.

**Why**: BUSINESS permissions affect all branches. If a user only manages one branch, they probably don't need business-wide access.

**Example**:
- ❌ **Bad**: Grant `BUSINESS_MANAGE_BRANCHES` to a single-branch manager
- ✅ **Good**: They only need branch-level permissions for their own branch

---

## Troubleshooting

### Problem: User Can't Access a Feature They Should Be Able To

**Symptoms**:
- User sees "Permission Denied" message
- User doesn't see buttons or menu items
- User gets redirected away from certain pages

**Diagnosis Steps**:
1. Go to `/business/permissions`
2. Select the affected user
3. Check if they have the required permission
4. Look for conflicting revokes

**Common Causes**:
- ❌ User doesn't have the permission (needs to be granted)
- ❌ Permission was explicitly revoked
- ❌ User's role doesn't include the permission by default
- ❌ Feature is disabled at branch level (check `/branch/settings`)

**Solution**:
- Grant the missing permission
- Remove the revoke if it was added by mistake
- Consider promoting the user to a higher role if they need many permissions
- Enable the feature at branch level if it's disabled

---

### Problem: User Can Access Something They Shouldn't

**Symptoms**:
- User sees features they shouldn't have access to
- User can perform actions beyond their role

**Diagnosis Steps**:
1. Go to `/business/permissions`
2. Select the affected user
3. Check for custom grants
4. Review their role's default permissions

**Common Causes**:
- ❌ Custom permission was granted by mistake
- ❌ User's role is too high (they should be demoted)
- ❌ Feature gate is not properly implemented (report to development team)

**Solution**:
- Revoke the custom permission
- Change user's role to a lower privilege level
- If it's a bug, contact support

---

### Problem: Permission Changes Don't Take Effect Immediately

**Symptoms**:
- You granted a permission but user still can't access the feature
- You revoked a permission but user can still access the feature

**Diagnosis Steps**:
1. Verify the permission change was saved (check user's permission list)
2. Ask the user to refresh their browser (Ctrl+R or Cmd+R)
3. Ask the user to log out and log back in

**Common Causes**:
- ❌ User's session has old permission data cached
- ❌ Permission change failed to save (network issue)

**Solution**:
- User should refresh browser or log out/in
- Check if the permission is listed correctly in `/business/permissions`
- Try making the change again if it didn't save

---

### Problem: Can't Grant Permission to OWNER

**Symptoms**:
- OWNER user has all permissions grayed out
- Can't revoke permissions from OWNER

**Explanation**:
- This is **by design** - OWNER role always has all permissions
- This is a safety feature to prevent lockout

**Solution**:
- If you need to restrict an OWNER's access, change their role first
- Only do this if you're certain (you need another OWNER to change it back)
- Consider making them ADMIN instead if restriction is needed

---

### Problem: Custom Grants/Revokes Disappeared After Role Change

**Symptoms**:
- User's role was changed
- Some custom permissions are missing

**Explanation**:
- When a user's role changes, **conflicting** custom permissions may be removed
- Example: If you grant a CASHIER permission that ADMIN has by default, promoting them to ADMIN removes the custom grant (since ADMIN already has it)

**Solution**:
- This is expected behavior
- Review the user's permissions after role changes
- Re-grant any custom permissions that are still needed
- Consider if the custom permissions are even necessary with the new role

---

### Problem: User Sees "Contact Support" for Some Permissions

**Symptoms**:
- Certain permissions show "Contact Support" instead of Grant button
- Some features are restricted

**Explanation**:
- Your subscription plan doesn't include that feature
- The capability is not enabled at business level

**Solution**:
- Upgrade your subscription plan to unlock the feature
- Enable the capability at `/business/capabilities`
- Contact billing to add feature to your plan

---

## Permission Change Log

**Best Practice**: When making significant permission changes, document them.

**Template**:
```
Date: 2026-08-23
Changed By: Admin Name
User Affected: Jane Doe
Change Type: Grant
Permission: BUSINESS_MANAGE_BILLING
Reason: Temporary access during manager leave
Review Date: 2026-09-30
```

---

## Security Reminders

### 🔒 Important Security Practices

1. **Never share OWNER or ADMIN accounts** - Each person should have their own account
2. **Use SUPERVISOR role for managers** - Don't default to ADMIN unless necessary
3. **Review permissions quarterly** - Remove unnecessary access
4. **Revoke access immediately when employees leave** - Don't delay
5. **Grant temporary permissions judiciously** - Document and review regularly
6. **Watch for unusual permission requests** - Ask why the user needs it
7. **Keep your own OWNER account secure** - Use strong password, enable 2FA

---

## Getting Help

### If You Need Assistance

1. **Check this guide first** - Most common scenarios are covered
2. **Review the troubleshooting section** - Common issues have solutions
3. **Try the opposite action** - If revoke doesn't work, try grant then revoke again
4. **Contact platform support** - We're here to help with complex permission issues

---

## Appendix: Permission Quick Reference

### Critical Permissions (High Risk)

**Grant with caution** - These have significant business impact:

- `BUSINESS_MANAGE_BILLING` - Can change subscription, cancel plan
- `BUSINESS_DELETE_BRANCH` - Can delete entire branches
- `BRANCH_DELETE_EMPLOYEE` - Can remove employee records
- `BRANCH_REFUND_ORDER` - Can process refunds (financial impact)
- `USER_MANAGE_PERMISSIONS` - Can change other users' permissions

### Common Grants for Supervisors

**Frequently added** to SUPERVISOR role users:

- `BRANCH_CREATE_EMPLOYEE` - Hiring authority
- `BRANCH_EDIT_PRODUCT` - Manage product catalog
- `BRANCH_CREATE_PURCHASE` - Order inventory
- `BUSINESS_VIEW_BILLING` - View subscription details

### Common Revokes from ADMIN

**Frequently removed** from ADMIN role users:

- `BUSINESS_MANAGE_BILLING` - Prevent subscription changes
- `BUSINESS_DELETE_BRANCH` - Prevent accidental deletion
- `BRANCH_DELETE_EMPLOYEE` - Prevent permanent employee deletion

---

**Guide Version**: 1.0  
**Last Updated**: 2026-08-23  
**Next Review**: 2026-11-23  

For technical documentation, see: `docs/PERMISSION_REFERENCE_GUIDE.md`
