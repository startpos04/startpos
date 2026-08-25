# Permission System Deployment Guide

**Version**: 1.0  
**Last Updated**: 2026-08-23  
**Audience**: Development Team

---

## Overview

This guide covers deploying the permission-based authorization system in your development and production environments.

**System Features:**
- 78 granular permissions across business, branch, and user scopes
- Role-based default permissions (OWNER, ADMIN, SUPERVISOR, CASHIER)
- Permission management UI at `/business/permissions`
- Server-side enforcement with database-backed checks

**Note:** This is for a **greenfield deployment** - no existing user migration required.

---

## Quick Start

```bash
# 1. Run database migrations
pnpm prisma migrate dev

# 2. Seed permissions
pnpm prisma db seed -- --only permissions

# 3. (Optional) If you have test users
pnpm prisma db seed -- --only user-permissions

# 4. Start application
pnpm dev
```

---

## Detailed Setup

### 1. Database Setup

**Run Prisma migrations** to create Permission and UserPermission tables:

```bash
cd web
pnpm prisma migrate dev
```

**Verify tables exist:**
```sql
\dt Permission
\dt UserPermission
```

---

### 2. Seed Permissions

**Populate the Permission table** with all 78 permission definitions:

```bash
pnpm prisma db seed -- --only permissions
```

**Expected output:**
```
🌱 Seeding permissions...
✅ Created 78 permissions
   - Business scope: 24 permissions
   - Branch scope: 48 permissions  
   - User scope: 6 permissions

🎉 Permission seeding completed!
```

**Verify:**
```sql
SELECT COUNT(*) FROM "Permission";
-- Should return 78
```

---

### 3. Initialize User Permissions (Optional)

**If you have test users**, initialize their permissions:

```bash
pnpm prisma db seed -- --only user-permissions
```

**If you have no users yet**, skip this step. New users automatically get permissions based on their role when created.

---

### 4. Start Application

```bash
# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

---

## Verification

### Test Different Roles

**Create test users with different roles:**

```typescript
// OWNER - full access
await db.user.create({
  data: {
    email: 'owner@test.com',
    role: 'OWNER',
    // ... other fields
  }
})

// ADMIN - admin access
await db.user.create({
  data: {
    email: 'admin@test.com',
    role: 'ADMIN',
    // ... other fields
  }
})

// SUPERVISOR - view + reports
await db.user.create({
  data: {
    email: 'supervisor@test.com',
    role: 'SUPERVISOR',
    // ... other fields
  }
})

// CASHIER - POS only
await db.user.create({
  data: {
    email: 'cashier@test.com',
    role: 'CASHIER',
    // ... other fields
  }
})
```

---

### Test Permission Checks

**1. Login as OWNER:**
- Navigate to `/business/permissions` ✅ Should work
- Navigate to `/business/billing` ✅ Should work
- Create test order ✅ Should work

**2. Login as ADMIN:**
- Navigate to `/business/permissions` ✅ Should work
- Navigate to `/employees` ✅ Should work
- Create/edit products ✅ Should work

**3. Login as SUPERVISOR:**
- Navigate to `/business/permissions` ❌ Should be forbidden
- View sales reports ✅ Should work
- Create test order ✅ Should work
- Try to create employee ❌ Should be forbidden

**4. Login as CASHIER:**
- Navigate to `/dashboard` ✅ Should work
- Create test order ✅ Should work
- View sales reports ❌ Should be forbidden
- Navigate to `/employees` ❌ Should be forbidden

---

### Test Permission Management UI

**1. Login as OWNER or ADMIN**

**2. Navigate to `/business/permissions`**

**3. Test granting permission:**
- Select a SUPERVISOR user
- Grant `BRANCH_CREATE_EMPLOYEE` permission
- Verify it appears in "Custom Grants"

**4. Test as that user:**
- Login as the SUPERVISOR
- Navigate to `/employees` ✅ Should now work
- Create an employee ✅ Should now work

**5. Test revoking permission:**
- Login as OWNER/ADMIN again
- Revoke the `BRANCH_CREATE_EMPLOYEE` permission
- Login as SUPERVISOR
- Navigate to `/employees` ❌ Should be forbidden again

---

## Database Verification

```sql
-- Check all permissions exist
SELECT COUNT(*) FROM "Permission";
-- Expected: 78

-- Check permission distribution by scope
SELECT scope, COUNT(*) as count
FROM "Permission"
GROUP BY scope;
-- Expected:
-- BUSINESS: 24
-- BRANCH: 48
-- USER: 6

-- View all permissions
SELECT key, scope, action, resource
FROM "Permission"
ORDER BY scope, resource, action;

-- If you have users, check their permissions
SELECT 
  u.email,
  u.role,
  COUNT(up.id) as custom_permission_count
FROM "User" u
LEFT JOIN "UserPermission" up ON u.id = up."userId"
GROUP BY u.id, u.email, u.role;
```

---

## Troubleshooting

### Permission seeder fails

**Symptom:** Seeder exits with error

**Common causes:**
- Database connection issue
- Permission already seeded (unique constraint)

**Solution:**
```sql
-- Check if already seeded
SELECT COUNT(*) FROM "Permission";

-- If 78, you're good. If partial:
DELETE FROM "Permission";
-- Then re-run seeder
```

---

### User can't access feature

**Symptom:** 403 Forbidden or "Permission Denied"

**Diagnosis:**
1. Check user's role
2. Check if permission exists for that role in `role-permissions.ts`
3. Check if permission was explicitly revoked

**Solution:**
```typescript
// Check user's effective permissions
const summary = await AuthorizationEngine.buildSummary({
  userId: user.id,
  role: user.role,
})

console.log(summary.permissions) // See all permissions
console.log(summary.customRevokes) // See if permission was revoked
```

---

### Permission changes don't take effect

**Symptom:** Grant permission in UI but user still can't access

**Solution:**
- User needs to refresh browser or log out/in
- Authorization is built at login time

```typescript
// Force refresh in code
import { refreshAuthUser } from '@/store/auth-store'
await refreshAuthUser()
```

---

## Production Deployment

### Pre-Deployment

1. **Backup database** (recommended)
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

2. **Test in staging** with same steps above

3. **Verify all tests pass**

---

### Deployment

1. **Run migrations**
```bash
pnpm prisma migrate deploy
```

2. **Seed permissions**
```bash
pnpm prisma db seed -- --only permissions
```

3. **Deploy application code**

4. **Verify health**
```bash
curl https://your-domain.com/api/health
```

---

### Post-Deployment

1. **Test login** with different roles

2. **Check logs** for errors
```bash
# Check for 403 errors
grep "403" logs/app.log

# Check for permission errors
grep "Permission" logs/app.log
```

3. **Monitor for first 24 hours**

---

## Configuration

### Environment Variables

No new environment variables required. Existing `DATABASE_URL` is sufficient.

---

### Permission Customization

**To modify default role permissions:**

Edit `src/lib/authorization/role-permissions.ts`:

```typescript
export const RolePermissions = {
  SUPERVISOR: [
    // Add/remove permissions as needed
    Permissions.BRANCH_VIEW_EMPLOYEES,
    Permissions.BRANCH_CREATE_EMPLOYEE, // Add this
    // ...
  ],
}
```

**After modifying:** No migration needed. Changes apply to new users or when user's role changes.

---

## Architecture

### Permission Flow

```
1. User logs in
2. AuthorizationEngine.buildSummary() runs
   - Gets role default permissions
   - Adds custom grants
   - Removes custom revokes
3. Result stored in authStore.authorization
4. UI checks permissions via usePermission()
5. Server functions check via requirePermission()
```

### Database Schema

**Permission table:**
- 78 rows (one per permission)
- Fields: key, scope, action, resource, description

**UserPermission table:**
- Variable rows (custom grants/revokes only)
- Fields: userId, permissionKey, granted (bool)

---

## Resources

- **Developer Guide**: `docs/PERMISSION_REFERENCE_GUIDE.md`
- **Admin Guide**: `docs/PERMISSION_MANAGEMENT_GUIDE.md`
- **Permission Keys**: `src/lib/authorization/permission-keys.ts`
- **Role Defaults**: `src/lib/authorization/role-permissions.ts`

---

## Support

For issues:
1. Check this guide
2. Review troubleshooting section
3. Check application logs
4. Verify database state with SQL queries above

---

**Last Updated**: 2026-08-23  
**Version**: 1.0
