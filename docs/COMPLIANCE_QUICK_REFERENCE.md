# Compliance Schema - Quick Reference Guide

**Version:** 1.0 (Philippines)  
**Last Updated:** 2026-08-24

---

## Quick Commands

```bash
# Generate schema for Philippines (interactive)
pnpm prisma:generate

# Generate schema for Philippines (CI mode)
DEPLOYMENT_COUNTRY=PH SCHEMA_AUTO_CONFIRM=yes pnpm exec tsx prisma/scripts/generate-schema.ts

# Validate generated schema
pnpm exec prisma validate

# Reset database with new schema
pnpm reset

# Open Prisma Studio
pnpm exec prisma studio
```

---

## File Structure

```
web/prisma/
├── schema.prisma          # ❌ GENERATED - Don't edit!
├── base/                  # ✅ Base models (all countries)
│   ├── _generator.prisma
│   ├── _enums.prisma
│   ├── core.prisma        # Business, Branch
│   ├── transaction.prisma # Transaction
│   └── ...                # 17 total files
├── countries/             # ✅ Country-specific fields
│   ├── philippines.prisma # PH compliance
│   ├── singapore.prisma   # SG compliance (unused)
│   └── usa.prisma         # US compliance (unused)
└── scripts/
    └── generate-schema.ts # Schema generator
```

---

## Adding New Philippines Fields

### 1. Edit Country File

```prisma
// prisma/countries/philippines.prisma

// === INJECT_INTO: Transaction ===
snapshotNewField String  // Description

// === INJECT_INTO: Business ===
newBusinessField String?  // Description

// === INJECT_INTO: Branch ===
newBranchField String?  // Description
```

### 2. Regenerate Schema

```bash
DEPLOYMENT_COUNTRY=PH pnpm prisma:generate
```

### 3. Validate

```bash
pnpm exec prisma validate
```

### 4. Create Migration (if needed)

```bash
pnpm exec prisma migrate dev --name add_new_field
```

---

## Philippines Compliance Tables

### Business Level: `philippines_compliance`

```prisma
model PhilippinesCompliance {
  id                  String    @id
  birTin              String    // BIR TIN
  birPtuNumber        String?   // Permit to Use
  birPtuIssuedAt      DateTime? // PTU issue date
  birRdoCode          String?   // RDO code
  secRegistration     String?   // SEC
  mayorPermit         String?   // Mayor's permit
  dtiRegistration     String?   // DTI
  vatRegistrationDate DateTime?
  
  business   Business @relation
  businessId String   @unique
}
```

### Branch Level: `philippines_branch_compliance`

```prisma
model PhilippinesBranchCompliance {
  id                 String  @id
  branchSerialNumber String  // BIR serial number
  branchCode         String  // Branch code
  ptuNumber          String? // Branch PTU
  rdoCode            String? // Branch RDO
  mayorPermit        String? // Branch permit
  
  branch   Branch @relation
  branchId String @unique
}
```

---

## Transaction Snapshot Fields (Philippines)

### Universal Fields (All Countries)
- `snapshotBusinessName` - Business name at time of sale
- `snapshotBranchName` - Branch name
- `snapshotBranchAddress` - Branch address
- `snapshotBranchSN` - Branch serial number
- `snapshotCashierName` - Cashier name
- `snapshotCurrency` - Currency code

### Philippines-Specific Fields
- `snapshotBusinessTIN` - BIR TIN
- `snapshotBranchCode` - Branch code
- `snapshotIsVATRegistered` - VAT status (Boolean)
- `snapshotPTUNumber` - Permit to Use
- `snapshotRDOCode` - RDO code

### Customer/Buyer Fields
- `snapshotCustomerTIN` - Customer TIN (B2B)
- `snapshotBuyerName` - Buyer name (OR)
- `snapshotBuyerTIN` - Buyer TIN (OR)
- `snapshotBuyerAddress` - Buyer address (OR)
- `snapshotBuyerBusinessStyle` - Business style (OR)

### SC/PWD Fields (Senior Citizen / PWD Discount)
- `snapshotScPwdId` - SC/PWD ID number
- `snapshotScPwdName` - SC/PWD name
- `snapshotScPwdDiscount` - Discount amount (cents, Int)

---

## Accessing Compliance Data in Code

### In Auth Layer

```typescript
// src/lib/better-auth/auth-server.ts

const user = await db.user.findUnique({
  include: {
    business: {
      include: {
        philippinesCompliance: true, // ✅ Include PH compliance
      },
    },
    branch: {
      include: {
        philippinesBranchCompliance: true, // ✅ Include PH branch compliance
      },
    },
  },
});

// Transform to user.compliance object
const compliance = {
  BIR_TIN: user.business?.philippinesCompliance?.birTin,
  BIR_PTU_NUMBER: user.business?.philippinesCompliance?.birPtuNumber,
  BIR_RDO_CODE: user.business?.philippinesCompliance?.birRdoCode,
  // Branch-level
  BRANCH_PTU_NUMBER: user.branch?.philippinesBranchCompliance?.ptuNumber,
  BRANCH_RDO_CODE: user.branch?.philippinesBranchCompliance?.rdoCode,
};
```

### In Transaction Creation

```typescript
// src/lib/queries/create-pos-transaction.ts

const transaction = await db.transaction.create({
  data: {
    // ... other fields
    
    // Philippines compliance snapshots
    snapshotBusinessTIN: user.compliance?.BIR_TIN || '',
    snapshotBranchCode: branch.branchCode,
    snapshotIsVATRegistered: business.isVATRegistered,
    snapshotPTUNumber: user.compliance?.BIR_PTU_NUMBER,
    snapshotRDOCode: user.compliance?.BIR_RDO_CODE,
    
    // Customer/Buyer
    snapshotBuyerName: data.customer?.buyerName,
    snapshotBuyerTIN: data.customer?.buyerTaxId,
    snapshotBuyerAddress: data.customer?.buyerAddress,
    snapshotBuyerBusinessStyle: data.customer?.buyerBusinessStyle,
    
    // SC/PWD
    snapshotScPwdId: data.compliance?.scPwdIdNumber,
    snapshotScPwdName: data.compliance?.scPwdName,
    snapshotScPwdDiscount: totalScPwdDiscount,
  },
});
```

### In Refund Creation

```typescript
// src/lib/queries/create-pos-refund.ts

const refundTransaction = await db.transaction.create({
  data: {
    // ... other fields
    
    // Copy ALL snapshots from original transaction
    snapshotBusinessTIN: originalTransaction.snapshotBusinessTIN,
    snapshotBranchCode: originalTransaction.snapshotBranchCode,
    snapshotIsVATRegistered: originalTransaction.snapshotIsVATRegistered,
    snapshotPTUNumber: originalTransaction.snapshotPTUNumber,
    snapshotRDOCode: originalTransaction.snapshotRDOCode,
    snapshotBuyerName: originalTransaction.snapshotBuyerName,
    snapshotBuyerTIN: originalTransaction.snapshotBuyerTIN,
    snapshotBuyerAddress: originalTransaction.snapshotBuyerAddress,
    snapshotBuyerBusinessStyle: originalTransaction.snapshotBuyerBusinessStyle,
    snapshotScPwdId: originalTransaction.snapshotScPwdId,
    snapshotScPwdName: originalTransaction.snapshotScPwdName,
    snapshotScPwdDiscount: originalTransaction.snapshotScPwdDiscount 
      ? -originalTransaction.snapshotScPwdDiscount  // Invert!
      : null,
  },
});
```

---

## Seeding Compliance Data

```typescript
// prisma/seeders/configs.ts

// Business-level compliance
await db.philippinesCompliance.upsert({
  where: { businessId: business.id },
  create: {
    businessId: business.id,
    birTin: getConfigValue('BIR_TIN'),
    birPtuNumber: getConfigValue('BIR_PTU_NUMBER'),
    birPtuIssuedAt: parseDate(getConfigValue('BIR_PTU_ISSUED_AT')),
    birRdoCode: getConfigValue('BIR_RDO_CODE'),
  },
  update: {},
});

// Branch-level compliance
await db.philippinesBranchCompliance.upsert({
  where: { branchId: branch.id },
  create: {
    branchId: branch.id,
    branchSerialNumber: branch.serialNumber,
    branchCode: branch.branchCode,
    ptuNumber: getConfigValue('BRANCH_PTU_NUMBER'),
    rdoCode: getConfigValue('BRANCH_RDO_CODE'),
  },
  update: {},
});
```

---

## Common Issues

### Issue: "ComplianceRegistry not found"

**Cause:** Trying to use legacy compliance system  
**Fix:** Use `philippinesCompliance` and `philippinesBranchCompliance` instead

```typescript
// ❌ OLD (Don't use)
user.complianceRegistry

// ✅ NEW (Use this)
user.compliance  // Transformed from philippinesCompliance
```

### Issue: "Schema validation failed"

**Cause:** Forgot to regenerate schema after editing country files  
**Fix:**

```bash
DEPLOYMENT_COUNTRY=PH pnpm prisma:generate
pnpm exec prisma validate
```

### Issue: "Migration failed - table not found"

**Cause:** Database out of sync with schema  
**Fix:**

```bash
pnpm reset  # Resets DB with current schema
```

---

## Testing

### Unit Tests

```typescript
// Mock user with Philippines compliance
const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  compliance: {
    BIR_TIN: '000-000-000-000',
    BIR_PTU_NUMBER: 'PTU-12345',
    BIR_RDO_CODE: 'RDO-001',
  },
  // ... other fields
};
```

### Integration Tests

```typescript
// Seed Philippines compliance data
await db.philippinesCompliance.create({
  data: {
    businessId: business.id,
    birTin: '000-000-000-000',
    birPtuNumber: 'PTU-12345',
    birRdoCode: 'RDO-001',
  },
});
```

---

## Environment Variables

### For Development (.env.config)

```bash
# Schema generation
DEPLOYMENT_COUNTRY=PH
SCHEMA_AUTO_CONFIRM=yes

# Database reset
RESET_AUTO_CONFIRM=yes

# Seeding
SEED_AUTO_CONFIRM=yes
```

### For CI/CD

```yaml
env:
  DEPLOYMENT_COUNTRY: PH
  SCHEMA_AUTO_CONFIRM: yes
  DATABASE_URL: ${{ secrets.PH_DATABASE_URL }}
```

---

## Migration Checklist

When adding a new Philippines compliance field:

- [ ] Add field to `prisma/countries/philippines.prisma`
- [ ] Regenerate schema: `DEPLOYMENT_COUNTRY=PH pnpm prisma:generate`
- [ ] Validate: `pnpm exec prisma validate`
- [ ] Update code to populate the field
- [ ] Update refund code to copy the field
- [ ] Update test mocks
- [ ] Update seeder if needed
- [ ] Create migration: `pnpm exec prisma migrate dev --name <name>`
- [ ] Test locally: `pnpm reset && pnpm seed`
- [ ] Commit changes

---

## Need Help?

- **Full Documentation:** `docs/COMPLIANCE_SCHEMA_ARCHITECTURE.md`
- **Schema Generator:** `prisma/scripts/generate-schema.ts`
- **Country Files:** `prisma/countries/philippines.prisma`
- **Base Models:** `prisma/base/transaction.prisma`, `prisma/base/core.prisma`

---

## Version History

- **v1.0 (2026-08-24):** Philippines implementation complete
- **v1.1 (Planned):** Multi-country deployment branches + adapters
