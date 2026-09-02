# Compliance Schema Architecture

**Date:** 2026-08-25 (Revision 4 - v2.0 COMPLETE)  
**Phase:** Phases 1-11 Complete - Multi-Country Deployment Ready  
**Status:** ✅ PRODUCTION READY - Full adapter implementation complete  
**Version:** 2.0 (Multi-country: Philippines, Singapore, USA)

---

## 🎉 V2.0 COMPLETION SUMMARY

**Completed:** August 25, 2026  
**Scope:** Multi-country adapter implementation (Philippines, Singapore, USA)

### What Was Delivered (Phases 1-11)

✅ **Phases 1-8: Philippines Implementation** (v1.0)
- Schema infrastructure with 17 base files
- Philippines compliance tables operational
- Transaction and refund flows capturing all BIR requirements
- Legacy ComplianceRegistry removed
- Production-ready Philippines deployment

✅ **Phase 9: Deployment Branches** (Deferred to deployment time)
- Branch strategy documented
- Can be created when needed for deployment isolation

✅ **Phase 10: Documentation**
- COMPLIANCE_SCHEMA_ARCHITECTURE.md (this document)
- COMPLIANCE_ADAPTER_GUIDE.md (detailed implementation guide)
- COMPLIANCE_QUICK_REFERENCE.md (developer cheat sheet)

✅ **Phase 11: Compliance Adapter Pattern** (v2.0)
- ComplianceAdapter interface implemented
- PhilippinesComplianceAdapter, SingaporeComplianceAdapter, UsaComplianceAdapter created
- Adapter factory with DEPLOYMENT_COUNTRY env var selection
- Auth layer uses adapter.extractComplianceData()
- Transaction layer uses adapter.populateTransactionSnapshot()
- Refund layer uses adapter.copyRefundSnapshot()
- Receipt layer uses country-agnostic helpers
- Compliance validation enforced before transactions
- **Full country-agnostic codebase achieved**

### Current State

**Database:** Country-specific compliance tables
- ✅ `philippines_compliance` and `philippines_branch_compliance` tables
- ✅ `singapore_compliance` and `singapore_branch_compliance` tables (ready)
- ✅ `usa_compliance` and `usa_branch_compliance` tables (ready)
- ✅ Transaction has country-specific snapshot fields (PH: 14 fields, SG: 8 fields, US: 10 fields)

**Application:** Country-Agnostic POS System
- ✅ Single codebase works across all deployments
- ✅ Adapter pattern handles country-specific logic
- ✅ Set `DEPLOYMENT_COUNTRY=PH|SG|US` to switch deployments
- ✅ No code changes required between deployments
- ✅ Compliance validation prevents transactions without required data

**Architecture:** Production-Ready Multi-Country
- ✅ Adapter interface with 5 methods (extract, includes, populate, copy, validate)
- ✅ Factory pattern for runtime adapter selection
- ✅ Receipt helpers for client-side country-agnostic display
- ✅ Validation enforced in transaction/refund flows

### Implementation Reference

For detailed adapter usage and code examples, see:
📖 **[COMPLIANCE_ADAPTER_GUIDE.md](./COMPLIANCE_ADAPTER_GUIDE.md)** - Full implementation guide

### Next Steps (Future)

**Multi-Country Business Support:**
- Allow single business to operate in multiple countries
- Per-branch country configuration
- Cross-border transaction handling

**Compliance Configuration UI:**
- Settings page for tax IDs, permits, registration numbers
- Country-specific form fields based on deployment
- Validation feedback integrated with UI

---

## Revision History

**Revision 1 (2026-08-24):** Invalid - Duplicate model declarations  
**Revision 2 (2026-08-24):** Valid - Marker-based field injection + standalone compliance tables  
**Revision 3 (2026-08-24):** v1.0 Complete - Philippines deployment implementation finished  
**Revision 4 (2026-08-25):** v2.0 Complete - Multi-country adapter pattern fully implemented

**What was wrong in Revision 1:**
- Proposed duplicate `model Transaction` / `model Branch` / `model Business` declarations
- String concatenation without field merging
- Would fail with "Duplicate model definition" error

**What's fixed in Revision 2:**
- Country files contain **field lists only** (no `model` wrappers)
- Base models have `// COUNTRY_FIELDS_HERE` injection markers
- Generator injects fields at markers before closing brace
- Validated with `prisma validate` for all countries

**What's implemented in Revision 3 (v1.0):**
- All 8 phases completed for Philippines deployment
- Legacy ComplianceRegistry removed
- Database and code fully updated to use new compliance structure
- Ready for production deployment in Philippines

---

## Executive Summary

**Architecture:** Build-time schema composition with marker-based field injection

**Pattern:**
- Base models contain injection markers (`// COUNTRY_FIELDS_HERE`)
- Country files provide raw field declarations (no model wrappers)
- Generator script injects fields at markers + appends country-specific tables

**Implementation Status (v2.0):**
- ✅ Philippines, Singapore, USA compliance fully implemented
- ✅ Database has all three country compliance tables
- ✅ Adapter pattern provides country-agnostic code layer
- ✅ Single codebase deployment to any country via env var
- ✅ Legacy compliance system removed

**Goal Achieved:** Country-agnostic codebase with zero hardcoded country logic ✅

---

## Architecture Pattern: Marker-Based Field Injection

### How It Works

**1. Base models** contain injection markers:

```prisma
// base/transaction.prisma
model Transaction {
  id String @id
  snapshotBusinessName String
  snapshotCashierName  String
  
  // COUNTRY_FIELDS_HERE
  
  createdAt DateTime @default(now())
}
```

**2. Country files** provide **raw field lists** (no model wrappers):

```prisma
// countries/philippines.prisma

// === INJECT_INTO: Transaction ===
snapshotBusinessTIN     String  // BIR TIN
snapshotBranchSN        String  // BIR Serial Number  
snapshotBranchCode      String  // Branch code
snapshotIsVATRegistered Boolean // VAT status

// === INJECT_INTO: Business ===
philippinesCompliance PhilippinesCompliance?

// === INJECT_INTO: Branch ===
philippinesBranchCompliance PhilippinesBranchCompliance?

// === STANDALONE MODELS ===

model PhilippinesCompliance {
  id String @id
  birTin String
  // ...
}

model PhilippinesBranchCompliance {
  id String @id
  branchSerialNumber String
  // ...
}
```

**3. Generator** injects fields at markers:

```typescript
// Pseudo-code
for each baseFile:
  content = read(baseFile)
  if (content.includes('// COUNTRY_FIELDS_HERE')):
    modelName = extractModelName(content)
    countryFields = extractFieldsFor(modelName, countryFile)
    content = content.replace(
      '// COUNTRY_FIELDS_HERE',
      countryFields
    )
  append(content)

append(countryStandaloneModels)
```

**4. Generated schema** (PH example):

```prisma
// Generated schema.prisma
model Transaction {
  id String @id
  snapshotBusinessName String
  snapshotCashierName  String
  
  // COUNTRY_FIELDS: PHILIPPINES
  snapshotBusinessTIN     String
  snapshotBranchSN        String
  snapshotBranchCode      String
  snapshotIsVATRegistered Boolean
  
  createdAt DateTime @default(now())
}

model PhilippinesCompliance { ... }
model PhilippinesBranchCompliance { ... }
```

### Why This Works

✅ No duplicate model declarations  
✅ Prisma sees single, valid models  
✅ PH database has only PH fields  
✅ SG database has only SG fields  
✅ Simple text replacement (no AST parsing)

---

## Current Implementation Audit

### 1. ComplianceRegistry (Currently Used, PH-centric)

```prisma
model ComplianceRegistry {
  id    String        @id
  key   ComplianceKey // BIR_TIN, BIR_PTU_NUMBER, BIR_PTU_ISSUED_AT
  value String
  businessId String?
  branchId   String?
}
```

**Used in:**
- `auth-server.ts:95-149` - Fetches and transforms to `user.complianceRegistry`
- `create-pos-transaction.ts:485-514` - Accesses `user.complianceRegistry.BIR_TIN`

**Decision:** Deprecate and migrate to `PhilippinesCompliance` / `PhilippinesBranchCompliance`

### 2. Country Tables (Defined But Unused)

```prisma
model PhilippinesCompliance { ... }
model SingaporeCompliance { ... }
model UsaCompliance { ... }
```

**Status:** Schema-only, no code usage

### 3. Transaction Snapshot Fields (Mixed)

```prisma
model Transaction {
  // ✅ Universal
  snapshotBusinessName String?
  snapshotCashierName  String?
  
  // ❌ PH-specific (polluting universal model)
  snapshotBusinessTIN     String?
  snapshotBranchSN        String?
  snapshotIsVATRegistered String?
}
```

### Files Requiring Changes (8)

| File | Issue | Fix |
|------|-------|-----|
| `prisma/schema.prisma` | PH fields mixed in | Split to base + country |
| `lib/queries/create-pos-transaction.ts` | Hardcoded `user.complianceRegistry.BIR_TIN` | Use country compliance tables |
| `lib/better-auth/auth-server.ts` | Fetches ComplianceRegistry | Use country compliance tables |
| `lib/queries/create-pos-refund.ts` | Copies PH snapshots | Update field access |
| `__tests__/helpers/mock-user.ts` | Hardcoded PH | Country-specific mocks |
| `__tests__/integration/*.test.ts` | PH setup | Country-specific setup |
| `__tests__/unit/*.test.ts` | PH tests | Country-specific tests |
| `prisma/seeders/configs.ts` | Seeds ComplianceRegistry | Seed country tables |

---

## Directory Structure

```
web/prisma/
├── schema.prisma                # ❌ GENERATED (git-ignored)
├── .gitignore                   # Add: /schema.prisma
├── base/
│   ├── _generator.prisma       # generator + datasource config
│   ├── _enums.prisma           # All enum types
│   ├── core.prisma             # User, Business, Branch
│   ├── transaction.prisma      # Transaction with marker
│   ├── order.prisma            # Order, OrderItem
│   ├── product.prisma          # Product, ProductVariant
│   ├── inventory.prisma        # Inventory, InventoryMovement
│   ├── config.prisma           # Configuration system
│   ├── auth.prisma             # Session, Account
│   └── billing.prisma          # BusinessSubscription
├── countries/
│   ├── philippines.prisma      # PH field injections + standalone models
│   ├── singapore.prisma        # SG field injections + standalone models
│   └── usa.prisma              # US field injections + standalone models
├── migrations/                  # ⚠️ See Migration Isolation Strategy below
└── models/
    ├── base/                    # Base models (all countries)
    ├── countries/               # Country-specific fields
    ├── generate-schema.ts       # Schema composer with field injection
    └── ensure-database.sh       # Docker DB init script
```

**Note on migrations/:** Prisma does not natively support separate migration directories per country. See "Migration Isolation Strategy" section below for the chosen approach.

---

## Schema Files

### Base: `base/_generator.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Base: `base/transaction.prisma`

```prisma
enum TransactionType {
  SALE
  REFUND
}

enum PriceConfiguration {
  INCLUSIVE
  EXCLUSIVE
}

model Transaction {
  id                 String             @id @default(cuid())
  invoiceNo          String             @unique
  type               TransactionType    @default(SALE)
  priceConfiguration PriceConfiguration @default(INCLUSIVE)

  // Financial data
  totalAmount        Int
  totalCost          Int
  snapshotBufferRate Int
  taxAmount          Int
  discount           Int @default(0)

  // ✅ UNIVERSAL SNAPSHOTS (all countries)
  snapshotBusinessName    String
  snapshotBranchName      String
  snapshotBranchAddress   String
  snapshotCashierName     String
  snapshotCurrency        String
  snapshotCustomerName    String?
  snapshotCustomerAddress String?
  
  // COUNTRY_FIELDS_HERE
  
  // Relations
  orderId String @unique
  order   Order  @relation(fields: [orderId], references: [id])
  
  cashierId String
  cashier   User @relation("CashierRelation", fields: [cashierId], references: [id])
  
  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  
  branchId String
  branch   Branch @relation(fields: [branchId], references: [id])
  
  payments  Payment[]
  taxLines  TransactionTaxLine[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([businessId, branchId, createdAt])
  @@map("transactions")
}

model TransactionTaxLine {
  id            String      @id @default(cuid())
  type          TaxLineType
  category      TaxCategory
  rate          Float
  taxableAmount Int
  taxAmount     Int

  transactionId String
  transaction   Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@map("transaction_tax_lines")
}
```

### Base: `base/core.prisma`

```prisma
model Business {
  id           String       @id @default(cuid())
  name         String
  slug         String       @unique
  logo         String?
  businessType BusinessType
  countryCode  String       @default("PH")

  // COUNTRY_FIELDS_HERE

  members      Membership[]
  branches     Branch[]
  products     Product[]
  transactions Transaction[]
  
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@map("businesses")
}

model Branch {
  id      String  @id @default(cuid())
  name    String
  address String?
  country String  @default("PH")

  serialNumber String
  minInvoiceNo Int
  maxInvoiceNo Int
  branchCode   String @default("00001")

  // COUNTRY_FIELDS_HERE

  members      Membership[]
  transactions Transaction[]
  
  businessId String
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@map("branches")
}
```

### Country: `countries/philippines.prisma`

```prisma
// ============================================================================
// PHILIPPINES COMPLIANCE
// Bureau of Internal Revenue (BIR) Requirements
// ============================================================================

// === INJECT_INTO: Transaction ===
snapshotBusinessTIN     String  // BIR TIN "000-000-000-000"
snapshotBranchSN        String  // BIR Branch Serial Number
snapshotBranchCode      String  // Branch code suffix "00001"
snapshotIsVATRegistered Boolean // VAT registration status
snapshotPTUNumber       String? // Permit to Use
snapshotRDOCode         String? // Revenue District Office

// Customer B2B
snapshotCustomerTIN     String? // Customer TIN for B2B

// Senior Citizen / PWD (RA 9994, RA 10754)
snapshotScPwdId         String? // SC/PWD ID
snapshotScPwdName       String? // SC/PWD name
snapshotScPwdDiscount   Int?    // Discount amount (cents)

// Official Receipt buyer info
snapshotBuyerName          String?
snapshotBuyerTIN           String?
snapshotBuyerAddress       String?
snapshotBuyerBusinessStyle String?

// === INJECT_INTO: Business ===
// Relation to compliance table (added below as standalone model)
philippinesCompliance   PhilippinesCompliance?

// === INJECT_INTO: Branch ===
// Relation to branch compliance table
philippinesBranchCompliance PhilippinesBranchCompliance?

// === STANDALONE MODELS ===

model PhilippinesCompliance {
  id             String    @id @default(cuid())
  
  // BIR requirements
  birTin         String    // Tax Identification Number
  birPtuNumber   String?   // Permit to Use
  birPtuIssuedAt DateTime? // PTU issue date
  birRdoCode     String?   // Revenue District Office
  
  // Business registration
  secRegistration String?  // SEC registration
  mayorPermit     String?  // Mayor's permit
  dtiRegistration String?  // DTI registration
  vatRegistrationDate DateTime?
  
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  businessId String   @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("philippines_compliance")
}

model PhilippinesBranchCompliance {
  id String @id @default(cuid())
  
  // BIR branch requirements
  branchSerialNumber String  // BIR-issued serial number
  branchCode         String  // Branch suffix "00001"
  ptuNumber          String? // Branch-specific PTU
  rdoCode            String? // RDO for this branch
  mayorPermit        String? // Branch permit
  
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  branchId String @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("philippines_branch_compliance")
}
```

### Country: `countries/singapore.prisma`

```prisma
// ============================================================================
// SINGAPORE COMPLIANCE
// Inland Revenue Authority of Singapore (IRAS) Requirements
// ============================================================================

// === INJECT_INTO: Transaction ===
snapshotGSTNumber String  // GST Registration Number
snapshotUEN       String  // Unique Entity Number
snapshotGSTRate   Float   // GST rate at time of sale

// Customer B2B
snapshotCustomerGSTNumber String?
snapshotCustomerUEN       String?

// === INJECT_INTO: Business ===
singaporeCompliance SingaporeCompliance?

// === INJECT_INTO: Branch ===
singaporeBranchCompliance SingaporeBranchCompliance?

// === STANDALONE MODELS ===

model SingaporeCompliance {
  id String @id @default(cuid())
  
  // IRAS requirements
  gstRegistrationNumber String  // GST number
  uen                   String  // UEN
  acraNumber            String? // ACRA registration
  gstRegistrationDate   DateTime?
  
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  businessId String   @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("singapore_compliance")
}

model SingaporeBranchCompliance {
  id String @id @default(cuid())
  
  branchGSTNumber String?
  branchUEN       String?
  
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  branchId String @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("singapore_branch_compliance")
}
```

### Country: `countries/usa.prisma`

```prisma
// ============================================================================
// USA COMPLIANCE
// Internal Revenue Service (IRS) Requirements
// ============================================================================

// === INJECT_INTO: Transaction ===
snapshotEIN            String  // Employer Identification Number
snapshotStateCode      String  // State code "CA", "NY", etc.
snapshotStateTaxId     String? // State tax ID
snapshotSalesTaxPermit String? // Sales tax permit
snapshotSalesTaxRate   Float   // Combined state + local tax rate

// Customer B2B
snapshotCustomerEIN       String?
snapshotCustomerStateTaxId String?

// Tax exemption
snapshotIsTaxExempt       Boolean @default(false)
snapshotTaxExemptCertNo   String?

// === INJECT_INTO: Business ===
usaCompliance UsaCompliance?

// === INJECT_INTO: Branch ===
usaBranchCompliance UsaBranchCompliance?

// === STANDALONE MODELS ===

model UsaCompliance {
  id String @id @default(cuid())
  
  // IRS requirements
  ein            String  // EIN
  stateCode      String  // State code
  stateTaxId     String? // State tax ID
  salesTaxPermit String? // Sales tax permit
  businessLicense String?
  incorporationState String?
  
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  businessId String   @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("usa_compliance")
}

model UsaBranchCompliance {
  id String @id @default(cuid())
  
  branchStateCode      String
  branchStateTaxId     String?
  branchSalesTaxPermit String?
  countyCode           String?
  cityCode             String?
  
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)
  branchId String @unique
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("usa_branch_compliance")
}
```

---

## Schema Generator Script

```typescript
// prisma/models/generate-schema.ts

import fs from 'fs';
import path from 'path';

const COUNTRY = process.env.DEPLOYMENT_COUNTRY || 'PH';
const VALID_COUNTRIES = ['PH', 'SG', 'US'];

if (!VALID_COUNTRIES.includes(COUNTRY)) {
  console.error(`❌ Invalid DEPLOYMENT_COUNTRY: ${COUNTRY}`);
  process.exit(1);
}

const PRISMA_DIR = path.join(__dirname, '..');

const BASE_FILES = [
  'base/_generator.prisma',
  'base/_enums.prisma',
  'base/core.prisma',
  'base/auth.prisma',
  'base/transaction.prisma',
  'base/order.prisma',
  'base/product.prisma',
  'base/inventory.prisma',
  'base/config.prisma',
  'base/billing.prisma',
];

const COUNTRY_FILES: Record<string, string> = {
  PH: 'countries/philippines.prisma',
  SG: 'countries/singapore.prisma',
  US: 'countries/usa.prisma',
};

console.log(`\n🌍 Generating Prisma schema for: ${COUNTRY}\n`);

try {
  // Read country file and parse injection sections
  const countryFile = COUNTRY_FILES[COUNTRY];
  const countryPath = path.join(PRISMA_DIR, countryFile);
  if (!fs.existsSync(countryPath)) {
    throw new Error(`Country file not found: ${countryFile}`);
  }
  
  const countryContent = fs.readFileSync(countryPath, 'utf8');
  
  // Parse injection sections
  const injections: Record<string, string[]> = {};
  const standaloneModels: string[] = [];
  
  let currentModel: string | null = null;
  let inStandaloneSection = false;
  
  for (const line of countryContent.split('\n')) {
    if (line.includes('=== INJECT_INTO:')) {
      const match = line.match(/INJECT_INTO:\s+(\w+)/);
      if (match) {
        currentModel = match[1];
        injections[currentModel] = [];
        inStandaloneSection = false;
      }
    } else if (line.includes('=== STANDALONE MODELS ===')) {
      currentModel = null;
      inStandaloneSection = true;
    } else if (currentModel && !line.startsWith('//') && line.trim()) {
      injections[currentModel].push(line);
    } else if (inStandaloneSection && line.trim()) {
      standaloneModels.push(line);
    }
  }
  
  console.log(`✓ Parsed ${Object.keys(injections).length} injection targets from ${countryFile}`);
  
  // Process base files with injection
  const processedSchemas: string[] = [];
  
  for (const file of BASE_FILES) {
    const filePath = path.join(PRISMA_DIR, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Base file not found: ${file}`);
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Detect which model this file contains and inject fields
    for (const [modelName, fields] of Object.entries(injections)) {
      const modelRegex = new RegExp(`model ${modelName}\\s*{[^}]*// COUNTRY_FIELDS_HERE[^}]*}`, 's');
      const match = content.match(modelRegex);
      
      if (match) {
        const injectedFields = fields.map(f => `  ${f}`).join('\n');
        const replacement = match[0].replace(
          '// COUNTRY_FIELDS_HERE',
          `// COUNTRY_FIELDS: ${COUNTRY}\n${injectedFields}`
        );
        content = content.replace(match[0], replacement);
        console.log(`✓ Injected ${fields.length} fields into ${modelName} (${file})`);
      }
    }
    
    processedSchemas.push(content);
  }
  
  // Combine everything
  const combinedSchema = [
    '// ============================================================================',
    '// GENERATED PRISMA SCHEMA - DO NOT EDIT',
    `// Country: ${COUNTRY}`,
    `// Generated: ${new Date().toISOString()}`,
    '// Source: base/* + countries/' + path.basename(countryFile),
    '// ============================================================================',
    '',
    ...processedSchemas,
    '',
    '// ============================================================================',
    `// COUNTRY-SPECIFIC STANDALONE MODELS: ${COUNTRY}`,
    '// ============================================================================',
    '',
    ...standaloneModels,
  ].join('\n');
  
  // Write generated schema
  const outputPath = path.join(PRISMA_DIR, 'schema.prisma');
  fs.writeFileSync(outputPath, combinedSchema);
  
  console.log(`\n✅ Successfully generated schema.prisma for ${COUNTRY}`);
  console.log(`📄 Output: ${outputPath}\n`);
  
} catch (error) {
  console.error('\n❌ Schema generation failed:');
  console.error(error);
  process.exit(1);
}
```

---

## Migration Isolation Strategy

### The Problem

Prisma's `migrate dev` and `migrate deploy` commands write to a single hardcoded `prisma/migrations/` directory. Running migrations for PH and later for SG would create a shared migration history containing:

- `20260824_add_ph_snapshots/` with PH-specific SQL
- `20260825_add_sg_snapshots/` with SG-specific SQL

When the PH deployment tries to apply migrations, it would fail on SG-specific migrations (tables don't exist), and vice versa.

**Prisma does not support configurable migration directories natively.**

---

### Chosen Solution: Separate Deployment Pipelines

**Decision:** Each country deployment is a separate CI/CD pipeline pointing at a separate codebase copy (branch, repo, or deployment environment).

**Implementation:**

```
Monorepo Structure:
├── main branch (shared codebase)
├── deploy/philippines branch
│   └── prisma/migrations/  (PH-only migrations)
├── deploy/singapore branch
│   └── prisma/migrations/  (SG-only migrations)
└── deploy/usa branch
    └── prisma/migrations/  (US-only migrations)
```

**Deployment Flow:**

1. **Development** happens on `main` branch
   - Developers work with `DEPLOYMENT_COUNTRY=PH` locally (or whatever country they're testing)
   - Shared code (base/ and countries/) lives in main

2. **When deploying to PH:**
   ```bash
   # CI/CD for Philippines
   git checkout deploy/philippines
   git merge main  # Pull latest shared code
   export DEPLOYMENT_COUNTRY=PH
   npm run prisma:generate:ph
   npm run prisma:migrate:deploy  # Uses prisma/migrations/ in this branch
   npm run build
   deploy to PH servers
   ```

3. **When deploying to SG:**
   ```bash
   # CI/CD for Singapore
   git checkout deploy/singapore
   git merge main
   export DEPLOYMENT_COUNTRY=SG
   npm run prisma:generate:sg
   npm run prisma:migrate:deploy  # Uses prisma/migrations/ in this branch
   npm run build
   deploy to SG servers
   ```

4. **Creating new migrations:**
   ```bash
   # Developer working on PH-specific feature
   git checkout deploy/philippines
   export DEPLOYMENT_COUNTRY=PH
   npm run prisma:generate:ph
   npx prisma migrate dev --name add_bir_ptu_field
   # Migration written to deploy/philippines branch's prisma/migrations/
   git add prisma/migrations/
   git commit -m "Add BIR PTU field migration"
   git push origin deploy/philippines
   ```

---

### Alternative Considered: Custom Migration Path Resolver

**Why rejected:**
- Would require forking Prisma CLI or building a wrapper script
- Maintenance burden (Prisma updates would break it)
- No official support from Prisma team
- Separate pipelines are simpler and more explicit

---

### Updated npm Scripts

```json
{
  "scripts": {
    "prisma:generate:ph": "cross-env DEPLOYMENT_COUNTRY=PH tsx prisma/models/generate-schema.ts && prisma generate",
    "prisma:generate:sg": "cross-env DEPLOYMENT_COUNTRY=SG tsx prisma/models/generate-schema.ts && prisma generate",
    "prisma:generate:us": "cross-env DEPLOYMENT_COUNTRY=US tsx prisma/models/generate-schema.ts && prisma generate",
    
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:migrate:reset": "prisma migrate reset",
    
    "prisma:studio:ph": "npm run prisma:generate:ph && prisma studio",
    "prisma:studio:sg": "npm run prisma:generate:sg && prisma studio",
    "prisma:studio:us": "npm run prisma:generate:us && prisma studio"
  }
}
```

**Note:** No country-specific migrate scripts needed. The deployment branch determines which migrations exist.

---

### CI/CD Configuration Example (GitHub Actions)

```yaml
# .github/workflows/deploy-philippines.yml
name: Deploy Philippines

on:
  push:
    branches: [deploy/philippines]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      DEPLOYMENT_COUNTRY: PH
      DATABASE_URL: ${{ secrets.PH_DATABASE_URL }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Generate PH schema
        run: npm run prisma:generate:ph
      
      - name: Run migrations
        run: npx prisma migrate deploy
      
      - name: Build application
        run: npm run build
      
      - name: Deploy to PH servers
        run: npm run deploy:ph
```

```yaml
# .github/workflows/deploy-singapore.yml
name: Deploy Singapore

on:
  push:
    branches: [deploy/singapore]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      DEPLOYMENT_COUNTRY: SG
      DATABASE_URL: ${{ secrets.SG_DATABASE_URL }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Generate SG schema
        run: npm run prisma:generate:sg
      
      - name: Run migrations
        run: npx prisma migrate deploy
      
      - name: Build application
        run: npm run build
      
      - name: Deploy to SG servers
        run: npm run deploy:sg
```

---

### Developer Workflow

**Scenario: Developer needs to add a new PH-specific field**

1. Checkout PH deployment branch:
   ```bash
   git checkout deploy/philippines
   git pull origin main  # Get latest shared code
   ```

2. Generate PH schema:
   ```bash
   export DEPLOYMENT_COUNTRY=PH
   npm run prisma:generate:ph
   ```

3. Edit country file:
   ```prisma
   // countries/philippines.prisma
   // === INJECT_INTO: Transaction ===
   snapshotNewField String  // New BIR requirement
   ```

4. Create migration:
   ```bash
   npx prisma migrate dev --name add_new_bir_field
   ```

5. Commit to deployment branch:
   ```bash
   git add countries/philippines.prisma prisma/migrations/
   git commit -m "Add new BIR field"
   git push origin deploy/philippines
   ```

6. Merge change back to main (if it's a schema change):
   ```bash
   git checkout main
   git merge deploy/philippines countries/philippines.prisma
   # Don't merge prisma/migrations/ to main
   git push origin main
   ```

---

### Benefits of This Approach

✅ **Simple:** Uses Prisma as designed, no custom tooling  
✅ **Explicit:** Migration history is clearly separated per country  
✅ **Safe:** Impossible to apply wrong country's migrations  
✅ **Git-native:** Leverages existing branch isolation  
✅ **CI/CD-friendly:** Each pipeline is independent  
✅ **Maintainable:** No custom Prisma CLI wrappers to maintain

### Drawbacks

⚠️ **Multiple branches:** Requires managing deploy/* branches  
⚠️ **Merge overhead:** Schema changes need to propagate from deploy/* → main  
⚠️ **Branch divergence:** Need discipline to keep deploy/* in sync with main

---

## Testing Strategy

### 1. Schema Generation Tests

```typescript
// prisma/scripts/generate-schema.test.ts

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Schema Generation', () => {
  const PRISMA_DIR = path.join(__dirname, '..');
  
  afterEach(() => {
    const schemaPath = path.join(PRISMA_DIR, 'schema.prisma');
    if (fs.existsSync(schemaPath)) {
      fs.unlinkSync(schemaPath);
    }
  });

  test('PH schema contains ONLY PH compliance fields', () => {
    execSync('npm run prisma:generate:ph', { stdio: 'inherit' });
    
    const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
    
    // ✅ Should contain PH fields
    expect(schema).toContain('snapshotBusinessTIN');
    expect(schema).toContain('snapshotBranchSN');
    expect(schema).toContain('PhilippinesCompliance');
    expect(schema).toContain('PhilippinesBranchCompliance');
    
    // ❌ Should NOT contain SG/US fields
    expect(schema).not.toContain('snapshotGSTNumber');
    expect(schema).not.toContain('snapshotUEN');
    expect(schema).not.toContain('snapshotEIN');
    expect(schema).not.toContain('SingaporeCompliance');
    expect(schema).not.toContain('UsaCompliance');
  });

  test('SG schema contains ONLY SG compliance fields', () => {
    execSync('npm run prisma:generate:sg', { stdio: 'inherit' });
    
    const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
    
    // ✅ Should contain SG fields
    expect(schema).toContain('snapshotGSTNumber');
    expect(schema).toContain('snapshotUEN');
    expect(schema).toContain('SingaporeCompliance');
    
    // ❌ Should NOT contain PH/US fields
    expect(schema).not.toContain('snapshotBusinessTIN');
    expect(schema).not.toContain('snapshotEIN');
    expect(schema).not.toContain('PhilippinesCompliance');
    expect(schema).not.toContain('UsaCompliance');
  });

  test('US schema contains ONLY US compliance fields', () => {
    execSync('npm run prisma:generate:us', { stdio: 'inherit' });
    
    const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
    
    // ✅ Should contain US fields
    expect(schema).toContain('snapshotEIN');
    expect(schema).toContain('snapshotStateCode');
    expect(schema).toContain('UsaCompliance');
    
    // ❌ Should NOT contain PH/SG fields
    expect(schema).not.toContain('snapshotBusinessTIN');
    expect(schema).not.toContain('snapshotGSTNumber');
    expect(schema).not.toContain('PhilippinesCompliance');
    expect(schema).not.toContain('SingaporeCompliance');
  });
  
  test('generated schema is valid Prisma', () => {
    execSync('npm run prisma:generate:ph', { stdio: 'inherit' });
    
    // This will throw if schema is invalid
    expect(() => {
      execSync('npx prisma validate', { stdio: 'pipe' });
    }).not.toThrow();
  });
});
```

### 2. Database Table Isolation Tests

```typescript
// __tests__/integration/schema-isolation.test.ts

test('PH database contains ONLY PH compliance tables', async () => {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%compliance%'
  `;
  
  const tableNames = tables.map(t => t.table_name);
  
  // ✅ Should exist
  expect(tableNames).toContain('philippines_compliance');
  expect(tableNames).toContain('philippines_branch_compliance');
  
  // ❌ Should NOT exist
  expect(tableNames).not.toContain('singapore_compliance');
  expect(tableNames).not.toContain('usa_compliance');
});
```

---

## Code Adaptation Strategy: Compliance Adapter Pattern

### The Challenge

With a **single codebase** serving **multiple country deployments**, the application code needs to:

1. Fetch compliance data from the correct country-specific table (PhilippinesCompliance, SingaporeCompliance, or UsaCompliance)
2. Transform country-specific fields to a standard format for business logic
3. Build country-specific transaction snapshots with the right field names

**Problem:** Each country has different:
- Database table names (`philippinesCompliance` vs `singaporeCompliance`)
- Field names (`birTin` vs `gstRegistrationNumber` vs `ein`)
- Snapshot field structures (PH has 14 fields, SG has 5, US has 9)

**Solution:** Adapter pattern with country-specific implementations

---

### Adapter Architecture

```typescript
// src/lib/compliance/types.ts

/**
 * Standard compliance data format used across the application.
 * All country adapters transform their specific data to this format.
 */
export interface StandardCompliance {
  // Primary tax identifier (BIR TIN, GST Number, EIN)
  taxId: string
  
  // Business registration/permit number
  permitNumber?: string
  
  // Registration/permit issue date
  registeredDate?: Date | string
  
  // Tax district/office code
  districtCode?: string
  
  // Additional country-specific data (flexible)
  metadata?: Record<string, any>
}

/**
 * Interface that all country adapters must implement.
 * Provides country-agnostic methods for compliance operations.
 */
export interface ComplianceAdapter {
  /** Country code this adapter handles */
  readonly country: 'PH' | 'SG' | 'US'
  
  /** Fetch business compliance data from country-specific table */
  fetchBusinessCompliance(businessId: string): Promise<any>
  
  /** Fetch branch compliance data from country-specific table */
  fetchBranchCompliance(branchId: string): Promise<any>
  
  /** Transform country-specific data to standard format */
  toStandardFormat(businessData: any, branchData: any): StandardCompliance
  
  /** Build transaction snapshot fields (country-specific field names) */
  buildTransactionSnapshots(business: any, branch: any, user: any): Record<string, any>
  
  /** Build refund snapshot fields (inherit from original + invert discounts) */
  buildRefundSnapshots(originalSnapshot: any): Record<string, any>
}
```

---

### Example: Philippines Adapter

```typescript
// src/lib/compliance/adapters/philippines-adapter.ts

import { prisma } from '@/lib/prisma-client'
import type { ComplianceAdapter, StandardCompliance } from '../types'

export class PhilippinesComplianceAdapter implements ComplianceAdapter {
  readonly country = 'PH' as const
  
  async fetchBusinessCompliance(businessId: string) {
    return prisma.philippinesCompliance.findUnique({
      where: { businessId }
    })
  }
  
  async fetchBranchCompliance(branchId: string) {
    return prisma.philippinesBranchCompliance.findUnique({
      where: { branchId }
    })
  }
  
  toStandardFormat(phBusiness: any, phBranch: any): StandardCompliance {
    return {
      taxId: phBusiness?.birTin ?? '',
      permitNumber: phBusiness?.birPtuNumber ?? '',
      registeredDate: phBusiness?.birPtuIssuedAt ?? undefined,
      districtCode: phBusiness?.birRdoCode ?? undefined,
      metadata: {
        branchSerialNumber: phBranch?.branchSerialNumber,
        branchCode: phBranch?.branchCode,
        branchPtuNumber: phBranch?.ptuNumber,
        branchRdoCode: phBranch?.rdoCode,
      }
    }
  }
  
  buildTransactionSnapshots(business: any, branch: any, user: any) {
    const phCompliance = business.philippinesCompliance
    const phBranchCompliance = branch.philippinesBranchCompliance
    
    return {
      // PH-specific BIR fields
      snapshotBusinessTIN: phCompliance?.birTin ?? null,
      snapshotBranchSN: branch.serialNumber ?? null,
      snapshotBranchCode: branch.branchCode ?? null,
      snapshotIsVATRegistered: user.configs.IS_VAT_REGISTERED ?? false,
      snapshotPTUNumber: phCompliance?.birPtuNumber ?? null,
      snapshotRDOCode: phCompliance?.birRdoCode ?? null,
      // Note: Customer/buyer fields populated separately from transaction input
    }
  }
  
  buildRefundSnapshots(originalSnapshot: any) {
    return {
      snapshotBusinessTIN: originalSnapshot.snapshotBusinessTIN,
      snapshotBranchSN: originalSnapshot.snapshotBranchSN,
      snapshotBranchCode: originalSnapshot.snapshotBranchCode,
      snapshotIsVATRegistered: originalSnapshot.snapshotIsVATRegistered,
      snapshotPTUNumber: originalSnapshot.snapshotPTUNumber,
      snapshotRDOCode: originalSnapshot.snapshotRDOCode,
      snapshotCustomerTIN: originalSnapshot.snapshotCustomerTIN,
      snapshotScPwdId: originalSnapshot.snapshotScPwdId,
      snapshotScPwdName: originalSnapshot.snapshotScPwdName,
      snapshotScPwdDiscount: originalSnapshot.snapshotScPwdDiscount 
        ? -originalSnapshot.snapshotScPwdDiscount 
        : null,
      snapshotBuyerName: originalSnapshot.snapshotBuyerName,
      snapshotBuyerTIN: originalSnapshot.snapshotBuyerTIN,
      snapshotBuyerAddress: originalSnapshot.snapshotBuyerAddress,
      snapshotBuyerBusinessStyle: originalSnapshot.snapshotBuyerBusinessStyle,
    }
  }
}
```

---

### Example: Singapore Adapter

```typescript
// src/lib/compliance/adapters/singapore-adapter.ts

import { prisma } from '@/lib/prisma-client'
import type { ComplianceAdapter, StandardCompliance } from '../types'

export class SingaporeComplianceAdapter implements ComplianceAdapter {
  readonly country = 'SG' as const
  
  async fetchBusinessCompliance(businessId: string) {
    return prisma.singaporeCompliance.findUnique({
      where: { businessId }
    })
  }
  
  async fetchBranchCompliance(branchId: string) {
    return prisma.singaporeBranchCompliance.findUnique({
      where: { branchId }
    })
  }
  
  toStandardFormat(sgBusiness: any, sgBranch: any): StandardCompliance {
    return {
      taxId: sgBusiness?.gstRegistrationNumber ?? '',
      permitNumber: sgBusiness?.uen ?? '',
      registeredDate: sgBusiness?.gstRegistrationDate ?? undefined,
      districtCode: undefined, // Singapore has no district codes
      metadata: {
        acraNumber: sgBusiness?.acraNumber,
        branchGSTNumber: sgBranch?.branchGSTNumber,
        branchUEN: sgBranch?.branchUEN,
      }
    }
  }
  
  buildTransactionSnapshots(business: any, branch: any, user: any) {
    const sgCompliance = business.singaporeCompliance
    const sgBranchCompliance = branch.singaporeBranchCompliance
    
    return {
      // SG-specific IRAS fields
      snapshotGSTNumber: sgCompliance?.gstRegistrationNumber ?? null,
      snapshotUEN: sgCompliance?.uen ?? null,
      snapshotGSTRate: user.configs.VAT_RATE ?? 0.09, // Singapore GST rate
      // Customer B2B fields populated separately
    }
  }
  
  buildRefundSnapshots(originalSnapshot: any) {
    return {
      snapshotGSTNumber: originalSnapshot.snapshotGSTNumber,
      snapshotUEN: originalSnapshot.snapshotUEN,
      snapshotGSTRate: originalSnapshot.snapshotGSTRate,
      snapshotCustomerGSTNumber: originalSnapshot.snapshotCustomerGSTNumber,
      snapshotCustomerUEN: originalSnapshot.snapshotCustomerUEN,
    }
  }
}
```

---

### Adapter Factory

```typescript
// src/lib/compliance/adapter-factory.ts

import { PhilippinesComplianceAdapter } from './adapters/philippines-adapter'
import { SingaporeComplianceAdapter } from './adapters/singapore-adapter'
import { UsaComplianceAdapter } from './adapters/usa-adapter'
import type { ComplianceAdapter } from './types'

const DEPLOYMENT_COUNTRY = process.env.DEPLOYMENT_COUNTRY || 'PH'

/**
 * Factory function that returns the correct compliance adapter
 * based on DEPLOYMENT_COUNTRY environment variable.
 */
export function getComplianceAdapter(): ComplianceAdapter {
  switch (DEPLOYMENT_COUNTRY) {
    case 'PH':
      return new PhilippinesComplianceAdapter()
    case 'SG':
      return new SingaporeComplianceAdapter()
    case 'US':
      return new UsaComplianceAdapter()
    default:
      throw new Error(`Unknown DEPLOYMENT_COUNTRY: ${DEPLOYMENT_COUNTRY}. Must be PH, SG, or US.`)
  }
}

/**
 * Singleton instance - created once at app startup.
 * All code should import and use this instance.
 */
export const complianceAdapter = getComplianceAdapter()
```

---

### Usage in Application Code

**1. Auth Server (Fetching Compliance)**

```typescript
// src/lib/better-auth/auth-server.ts

import { complianceAdapter } from '@/lib/compliance/adapter-factory'

export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    // ... existing user/business/branch fetch code ...
    
    // ✅ BEFORE (PH-specific):
    // const phCompliance = businessData.philippinesCompliance
    // const phBranchCompliance = branchData.philippinesBranchCompliance
    
    // ✅ AFTER (Country-agnostic):
    const businessCompliance = await complianceAdapter.fetchBusinessCompliance(businessId)
    const branchCompliance = await complianceAdapter.fetchBranchCompliance(branchId)
    
    // Transform to standard format
    const compliance = complianceAdapter.toStandardFormat(businessCompliance, branchCompliance)
    
    return {
      ...user,
      business,
      branch,
      compliance, // Standard format works for all countries
      // ... rest of user object
    }
  })
```

**2. Transaction Creation (Building Snapshots)**

```typescript
// src/lib/queries/create-pos-transaction.ts

import { complianceAdapter } from '@/lib/compliance/adapter-factory'

export const createPosTransaction = async (data: CreateSaleInput, posOrders: posProduct[]) => {
  const { user } = authStore.state
  
  // ✅ BEFORE (PH-specific):
  // snapshotBusinessTIN: user.compliance.BIR_TIN || null,
  // snapshotPTUNumber: user.compliance.BIR_PTU_NUMBER || null,
  // ... 14 PH-specific fields
  
  // ✅ AFTER (Country-agnostic):
  const complianceSnapshots = complianceAdapter.buildTransactionSnapshots(
    user.business,
    user.branch,
    user
  )
  
  const transaction = {
    // ... universal fields ...
    
    // Country-specific snapshots (adapter knows which fields to populate)
    ...complianceSnapshots,
    
    // Customer/buyer fields (from transaction input)
    snapshotCustomerTIN: data.customer.buyerTaxId || null,
    snapshotBuyerName: data.customer.buyerName || null,
    // ... rest of customer fields
    
    // ... rest of transaction
  }
  
  transactionCollection.insert(transaction)
}
```

**3. Refund Creation (Copying Snapshots)**

```typescript
// src/lib/queries/create-pos-refund.ts

import { complianceAdapter } from '@/lib/compliance/adapter-factory'

export const createPosRefund = async (snapshot: TransactionSnapshot) => {
  // ✅ BEFORE (PH-specific):
  // snapshotBusinessTIN: snapshot.snapshotBusinessTIN,
  // snapshotPTUNumber: snapshot.snapshotPTUNumber,
  // snapshotScPwdDiscount: snapshot.snapshotScPwdDiscount ? -snapshot.snapshotScPwdDiscount : null,
  // ... 14 PH-specific fields
  
  // ✅ AFTER (Country-agnostic):
  const refundSnapshots = complianceAdapter.buildRefundSnapshots(snapshot)
  
  transactionCollection.insert({
    // ... universal fields ...
    
    // Country-specific snapshots (adapter handles field copying + inversion)
    ...refundSnapshots,
    
    // ... rest of refund transaction
  })
}
```

---

### Benefits of Adapter Pattern

✅ **Single Codebase**: Same TypeScript code runs in PH, SG, and US deployments  
✅ **Type Safety**: Each adapter only knows about its country's Prisma types  
✅ **Testability**: Easy to mock adapters in unit tests  
✅ **Extensibility**: Adding a new country = implement one new adapter class  
✅ **Separation of Concerns**: Compliance logic isolated from business logic  
✅ **No Runtime Conditionals**: Factory decides once at app startup  
✅ **Standard Interface**: Business logic uses `StandardCompliance` type everywhere

### When Adapter is Loaded

```
App Startup (Node.js process starts)
  ↓
Read DEPLOYMENT_COUNTRY from env
  ↓
getComplianceAdapter() creates singleton
  ↓
All code imports and uses complianceAdapter
  ↓
Correct country-specific implementation is used automatically
```

---

## Implementation Plan

> **Note:** Since we're in development phase with **no live data**, we can make breaking changes freely. No data migration or backfill scripts needed - just drop old tables and create new ones.

---

### Phase 1: Schema Infrastructure ✅ COMPLETE

**Goal:** Set up schema generation infrastructure

**Status:** ✅ **COMPLETED 2026-08-24**

**Completed Steps:**

1. **Create directory structure** (5 min)
   ```bash
   cd web/prisma
   mkdir -p base countries scripts
   ```

2. **Add schema.prisma to .gitignore** (1 min)
   ```
   # web/.gitignore
   /prisma/schema.prisma
   ```

3. **Split current schema into base files** (2-3 hours)
   
   Extract these files from current `schema.prisma`:
   
   - `base/_generator.prisma` - generator + datasource config
   - `base/_enums.prisma` - All enum types
   - `base/core.prisma` - User, Business, Branch (add `// COUNTRY_FIELDS_HERE` markers)
   - `base/transaction.prisma` - Transaction (add marker, remove PH-specific fields)
   - `base/order.prisma` - Order, OrderItem, OrderItemAddon
   - `base/product.prisma` - Product, ProductVariant, Category
   - `base/inventory.prisma` - Inventory, InventoryMovement
   - `base/config.prisma` - Configuration, ConfigurationDefinition
   - `base/auth.prisma` - Session, Account, Verification
   - `base/billing.prisma` - BusinessSubscription, BillingInvoice
   - `base/permission.prisma` - Permission, UserPermission
   
   **Remove from Transaction:**
   ```prisma
   // DELETE these PH-specific fields
   snapshotBusinessTIN     String?
   snapshotBranchSN        String?
   snapshotBranchCode      String?
   snapshotIsVATRegistered String?
   snapshotCustomerTaxId   String?
   complianceData          Json?
   ```
   
   **Add marker:**
   ```prisma
   model Transaction {
     // ... universal fields
     
     // COUNTRY_FIELDS_HERE
     
     createdAt DateTime @default(now())
   }
   ```

4. **Create country schema files** (1 hour)
   
   Copy from doc:
   - `countries/philippines.prisma`
   - `countries/singapore.prisma`
   - `countries/usa.prisma`

5. **Implement schema generator** (2-3 hours)
   
   Create `scripts/generate-schema.ts` - copy from doc

6. **Add npm scripts** (2 min)
   
   Copy scripts from doc into `package.json`

7. **Test schema generation** (30 min)
   ```bash
   npm run prisma:generate:ph
   npx prisma validate  # Should pass
   
   npm run prisma:generate:sg
   npx prisma validate  # Should pass
   
   npm run prisma:generate:us
   npx prisma validate  # Should pass
   ```

**Deliverable:** ✅ Schema generation works, validates successfully (106.74 KB generated schema)

**Artifacts Created:**
- 17 base schema files in `prisma/base/`
- 3 country schema files in `prisma/countries/`
- Schema generator script with interactive prompts
- `.env.config` and `.env.config.example` for CI automation
- Updated `.gitignore` to exclude generated `schema.prisma`
- Single npm command: `pnpm prisma:generate` with country selection

---

### Phase 2: Database Reset with New Schema (CURRENT)

**Goal:** Drop old schema, apply new PH schema

**Steps:**

1. **Generate PH schema** (1 min)
   ```bash
   export DEPLOYMENT_COUNTRY=PH
   npm run prisma:generate:ph
   ```

2. **Reset database (no data loss risk)** (2 min)
   ```bash
   npx prisma migrate reset --force
   # This drops everything and starts fresh
   ```

3. **Create initial migration** (5 min)
   ```bash
   npx prisma migrate dev --name initial_ph_schema
   ```
   
   This creates:
   - All universal tables
   - `philippines_compliance` table
   - `philippines_branch_compliance` table
   - Transaction with PH-specific fields

4. **Verify schema** (5 min)
   ```bash
   npm run prisma:studio:ph
   # Check tables exist
   ```

**Deliverable:** Clean database with new PH schema

---

### Phase 3: Update Auth Layer (Week 1 - Day 3-4)

**Goal:** Update auth-server.ts to use new compliance tables

**Steps:**

1. **Update Business/Branch includes** (15 min)
   ```typescript
   // lib/better-auth/auth-server.ts
   
   // OLD
   include: { complianceRegistry: true }
   
   // NEW
   include: { philippinesCompliance: true }
   ```
   
   ```typescript
   // OLD (Branch)
   include: { complianceRegistry: true }
   
   // NEW (Branch)
   include: { philippinesBranchCompliance: true }
   ```

2. **Update compliance data transformation** (30 min)
   ```typescript
   // OLD
   const { complianceRegistry: businessCompliance, ...business } = businessData
   const mappedBusinessCompliance = transformKvPairs<ComplianceKey, ...>(businessCompliance)
   const mergedComplianceRegistry = _.merge({}, mappedBusinessCompliance, mappedBranchCompliance)
   
   // NEW
   const phCompliance = businessData.philippinesCompliance
   const phBranchCompliance = branchData.philippinesBranchCompliance
   
   const compliance = {
     birTin: phCompliance?.birTin || null,
     birPtuNumber: phCompliance?.birPtuNumber || null,
     birPtuIssuedAt: phCompliance?.birPtuIssuedAt || null,
     birRdoCode: phCompliance?.birRdoCode || null,
     branchSerialNumber: phBranchCompliance?.branchSerialNumber || null,
     branchCode: phBranchCompliance?.branchCode || null,
   }
   ```

3. **Update user context return** (10 min)
   ```typescript
   // Add to returned user object
   return {
     // ... existing fields
     compliance,  // New field
   }
   ```

**Deliverable:** Auth layer provides `user.compliance` object

---

### Phase 4: Update Transaction Creation (Week 1 - Day 4-5)

**Goal:** Update create-pos-transaction.ts to use new compliance structure

**Steps:**

1. **Update snapshot field access** (30 min)
   ```typescript
   // lib/queries/create-pos-transaction.ts
   
   // OLD
   snapshotBusinessTIN: user.complianceRegistry.BIR_TIN || null,
   snapshotBranchSN: user.branch.serialNumber || null,
   snapshotBranchCode: user.branch.branchCode || null,
   snapshotIsVATRegistered: user.configs.IS_VAT_REGISTERED ? 'true' : 'false',
   
   // NEW
   snapshotBusinessTIN: user.compliance.birTin || null,
   snapshotBranchSN: user.compliance.branchSerialNumber || null,
   snapshotBranchCode: user.compliance.branchCode || null,
   snapshotIsVATRegistered: user.configs.IS_VAT_REGISTERED,
   snapshotPTUNumber: user.compliance.birPtuNumber || null,
   snapshotRDOCode: user.compliance.birRdoCode || null,
   ```

2. **Update complianceData JSON (optional - or remove)** (15 min)
   
   Option A: Remove `complianceData` field entirely (cleaner)
   Option B: Keep for non-compliance metadata
   
   If keeping:
   ```typescript
   complianceData: {
     // Remove: ptuNumber, ptuIssuedAt (now in snapshot columns)
     // Keep: vatableSales, vatAmount (reporting convenience)
     vatableSales: vatSummary.vatableSales,
     vatAmount: vatSummary.vatAmount,
     vatExemptSales: vatSummary.vatExemptSales,
     zeroRatedSales: vatSummary.zeroRatedSales,
     scPwdName: data.compliance.scPwdName || null,
     scPwdIdNumber: data.compliance.scPwdIdNumber || null,
     scPwdDiscount: totalScPwdDiscount,
   }
   ```

**Deliverable:** Transaction creation uses new compliance fields

---

### Phase 5: Update Refund Creation (Week 1 - Day 5)

**Goal:** Ensure refunds copy new snapshot fields

**Steps:**

1. **Verify snapshot copying** (15 min)
   ```typescript
   // lib/queries/create-pos-refund.ts
   
   // These should already work (just verify they exist):
   snapshotBusinessTIN: snapshot.snapshotBusinessTIN,
   snapshotBranchSN: snapshot.snapshotBranchSN,
   snapshotBranchCode: snapshot.snapshotBranchCode,
   snapshotIsVATRegistered: snapshot.snapshotIsVATRegistered,
   snapshotPTUNumber: snapshot.snapshotPTUNumber,
   snapshotRDOCode: snapshot.snapshotRDOCode,
   ```

**Deliverable:** Refunds copy all compliance snapshots

---

### Phase 6: Update Tests & Mocks (Week 2 - Day 1-2)

**Goal:** Fix all broken tests

**Steps:**

1. **Update mock-user.ts** (30 min)
   ```typescript
   // __tests__/helpers/mock-user.ts
   
   // OLD
   complianceRegistry: {
     BIR_TIN: '123-456-789-000',
     BIR_PTU_NUMBER: 'PTU-2024-001',
     BIR_PTU_ISSUED_AT: '2024-01-01',
   }
   
   // NEW
   compliance: {
     birTin: '123-456-789-000',
     birPtuNumber: 'PTU-2024-001',
     birPtuIssuedAt: new Date('2024-01-01'),
     birRdoCode: 'RDO-001',
     branchSerialNumber: '123456789',
     branchCode: '00001',
   }
   ```

2. **Update test database setup** (1 hour)
   
   Create test helper:
   ```typescript
   // __tests__/helpers/setup-compliance.ts
   export async function setupPhilippinesCompliance(
     businessId: string,
     branchId: string
   ) {
     await prisma.philippinesCompliance.create({
       data: {
         businessId,
         birTin: '123-456-789-000',
         birPtuNumber: 'PTU-2024-001',
         birPtuIssuedAt: new Date('2024-01-01'),
         birRdoCode: 'RDO-001',
       }
     });
     
     await prisma.philippinesBranchCompliance.create({
       data: {
         branchId,
         branchSerialNumber: '123456789',
         branchCode: '00001',
       }
     });
   }
   ```

3. **Update integration tests** (1 hour)
   ```typescript
   // Use new helper in tests
   beforeEach(async () => {
     const business = await createTestBusiness();
     const branch = await createTestBranch(business.id);
     await setupPhilippinesCompliance(business.id, branch.id);
   });
   ```

4. **Update unit test assertions** (30 min)
   
   Update any tests checking compliance field names

5. **Run full test suite** (15 min)
   ```bash
   npm run test
   ```

**Deliverable:** All tests passing

---

### Phase 7: Update Seeders (Week 2 - Day 2-3)

**Goal:** Update seed scripts to populate new tables

**Steps:**

1. **Update configs.ts seeder** (1 hour)
   ```typescript
   // prisma/seeders/configs.ts
   
   // REMOVE old ComplianceRegistry seeding
   
   // ADD new compliance seeding
   console.info('⚖️ Creating Philippines compliance records...')
   await prisma.philippinesCompliance.upsert({
     where: { businessId: business.id },
     create: {
       businessId: business.id,
       birTin: '123-456-789-000',
       birPtuNumber: 'PTU-2024-001',
       birPtuIssuedAt: new Date('2024-01-01'),
       birRdoCode: 'RDO-007',
       secRegistration: 'SEC-2024-001',
       mayorPermit: 'MP-2024-001',
     },
     update: {},
   });
   
   for (const branch of branches) {
     await prisma.philippinesBranchCompliance.upsert({
       where: { branchId: branch.id },
       create: {
         branchId: branch.id,
         branchSerialNumber: `12345678${branch.branchCode}`,
         branchCode: branch.branchCode,
       },
       update: {},
     });
   }
   ```

2. **Test seed script** (15 min)
   ```bash
   npx prisma migrate reset --force
   npx tsx prisma/seeders/seed.ts
   ```

3. **Verify seeded data** (10 min)
   ```bash
   npm run prisma:studio:ph
   # Verify philippines_compliance has records
   # Verify philippines_branch_compliance has records
   ```

**Deliverable:** Fresh seed populates new compliance tables

---

### Phase 8: Remove ComplianceRegistry (Week 2 - Day 3)

**Goal:** Clean up old table and code

**Steps:**

1. **Remove ComplianceRegistry model from schema** (5 min)
   
   Delete from `base/core.prisma`:
   - `model ComplianceRegistry`
   - `ComplianceKey` enum from `base/_enums.prisma`

2. **Regenerate schema** (1 min)
   ```bash
   npm run prisma:generate:ph
   ```

3. **Create migration** (2 min)
   ```bash
   npx prisma migrate dev --name remove_compliance_registry
   ```
   
   Prisma auto-generates DROP TABLE

4. **Verify no code references** (5 min)
   ```bash
   git grep -i "ComplianceRegistry" web/src
   # Should return 0 results (except in this doc)
   ```

**Deliverable:** ComplianceRegistry removed

---

### Phase 9: Deployment Branch Setup (Week 2 - Day 4)

**Goal:** Set up deployment branches for future multi-country

**Steps:**

1. **Commit all changes to main** (10 min)
   ```bash
   git add .
   git commit -m "Implement country-specific compliance architecture"
   git push origin main
   ```

2. **Create deploy/philippines branch** (5 min)
   ```bash
   git checkout -b deploy/philippines
   git push -u origin deploy/philippines
   ```

3. **Create placeholder branches for future** (5 min)
   ```bash
   git checkout main
   git checkout -b deploy/singapore
   git push -u origin deploy/singapore
   
   git checkout main
   git checkout -b deploy/usa
   git push -u origin deploy/usa
   ```

4. **Document branch strategy** (30 min)
   
   Update README.md:
   ```markdown
   ## Deployment Branches
   
   - `main` - Development branch
   - `deploy/philippines` - PH production deployments
   - `deploy/singapore` - SG production deployments (future)
   - `deploy/usa` - US production deployments (future)
   
   Each deploy/* branch maintains its own migration history.
   ```

**Deliverable:** Deployment branches exist

---

### Phase 10: Documentation & Validation (Week 2 - Day 5)

**Goal:** Document and validate everything works

**Steps:**

1. **Create developer guide** (1 hour)
   
   Create `docs/COMPLIANCE_DEVELOPER_GUIDE.md`:
   - How to generate schema for local dev
   - How to add new country-specific fields
   - How to create migrations
   - How to switch between countries locally

2. **Full application smoke test** (1 hour)
   - Reset database
   - Run seeders
   - Start dev server
   - Login
   - Create transaction
   - Create refund
   - Verify receipt has BIR compliance data
   - Check offline mode works

3. **Performance validation** (30 min)
   - Time schema generation: `time npm run prisma:generate:ph`
   - Should be < 5 seconds
   - Prisma client generation: `time npx prisma generate`
   - Should be < 30 seconds

4. **Write schema generation tests** (1 hour)
   
   Copy test code from doc into `prisma/scripts/generate-schema.test.ts`

5. **Final checklist review** (30 min)
   - [ ] Schema generates for all 3 countries
   - [ ] PH database has only PH tables
   - [ ] Transactions create successfully
   - [ ] Refunds create successfully
   - [ ] All tests passing
   - [ ] Seeders work
   - [ ] ComplianceRegistry removed
   - [ ] Documentation complete

**Deliverable:** Complete, working, documented system

---

## Simplified Timeline

| Phase | Duration | Key Activities |
|-------|----------|----------------|
| 1. Schema Infrastructure | 1-2 days | Split schema, implement generator |
| 2. Database Reset | 1 hour | Drop old, create new |
| 3. Auth Layer | 1 day | Update auth-server.ts |
| 4. Transaction Creation | 1 day | Update create-pos-transaction.ts |
| 5. Refund Creation | 2 hours | Verify snapshot copying |
| 6. Tests & Mocks | 1-2 days | Fix all tests |
| 7. Seeders | 1 day | Update seed scripts |
| 8. Remove Old Code | 2 hours | Drop ComplianceRegistry |
| 9. Deployment Branches | 1 day | Set up branches, CI/CD |
| 10. Documentation | 1 day | Docs, tests, validation |

**Total: ~2 weeks (1 developer full-time)**

---

## Key Simplifications (No Live Data)

✅ **No backfill scripts** - Just drop and recreate tables  
✅ **No data migration** - Fresh migrations only  
✅ **No rollback plan** - Can always reset dev DB  
✅ **Aggressive refactoring** - Break anything, no consequences  
✅ **Fast iterations** - Test by dropping DB and re-seeding  

---

**Goal:** Set up schema generation infrastructure without touching database

**Steps:**

1. **Create directory structure** (15 min)
   ```bash
   cd web/prisma
   mkdir -p base countries scripts
   ```

2. **Add schema.prisma to .gitignore** (2 min)
   ```
   # web/.gitignore
   /prisma/schema.prisma
   ```

3. **Create base schema files** (2-3 hours)
   - Extract `_generator.prisma` (generator + datasource from current schema)
   - Extract `_enums.prisma` (all enum types)
   - Extract `core.prisma` (User, Business, Branch - add `// COUNTRY_FIELDS_HERE` markers)
   - Extract `transaction.prisma` (Transaction with marker)
   - Extract `order.prisma` (Order, OrderItem, OrderItemAddon)
   - Extract `product.prisma` (Product, ProductVariant, Category)
   - Extract `inventory.prisma` (Inventory, InventoryMovement)
   - Extract `config.prisma` (Configuration, ConfigurationDefinition)
   - Extract `auth.prisma` (Session, Account, Verification)
   - Extract `billing.prisma` (BusinessSubscription, BillingInvoice)
   - Extract `permission.prisma` (Permission, UserPermission)

4. **Create country schema files** (1-2 hours)
   - Create `countries/philippines.prisma` (field injections + PH models)
   - Create `countries/singapore.prisma` (field injections + SG models)
   - Create `countries/usa.prisma` (field injections + US models)

5. **Implement schema generator** (2-3 hours)
   - Create `scripts/generate-schema.ts` with field injection logic
   - Parse `=== INJECT_INTO: Model ===` sections
   - Inject fields at `// COUNTRY_FIELDS_HERE` markers
   - Append standalone models

6. **Add npm scripts** (5 min)
   ```json
   {
     "scripts": {
       "prisma:generate:ph": "cross-env DEPLOYMENT_COUNTRY=PH tsx prisma/scripts/generate-schema.ts && prisma generate",
       "prisma:generate:sg": "cross-env DEPLOYMENT_COUNTRY=SG tsx prisma/scripts/generate-schema.ts && prisma generate",
       "prisma:generate:us": "cross-env DEPLOYMENT_COUNTRY=US tsx prisma/scripts/generate-schema.ts && prisma generate",
       "prisma:studio:ph": "npm run prisma:generate:ph && prisma studio",
       "prisma:studio:sg": "npm run prisma:generate:sg && prisma studio",
       "prisma:studio:us": "npm run prisma:generate:us && prisma studio"
     }
   }
   ```

7. **Test schema generation** (30 min)
   ```bash
   npm run prisma:generate:ph
   npx prisma validate
   
   npm run prisma:generate:sg
   npx prisma validate
   
   npm run prisma:generate:us
   npx prisma validate
   ```

8. **Write schema generation tests** (1 hour)
   - Test PH schema contains only PH fields
   - Test SG schema contains only SG fields
   - Test US schema contains only US fields
   - Test `prisma validate` passes for all

**Deliverable:** Schema generation works for all 3 countries, validated by Prisma

**Validation:**
```bash
# All these should succeed
npm run prisma:generate:ph && npx prisma validate
npm run prisma:generate:sg && npx prisma validate
npm run prisma:generate:us && npx prisma validate
```

---

### Phase 2: Deployment Branch Setup (Week 1-2)

**Goal:** Set up separate deployment branches for migration isolation

**Steps:**

1. **Create deployment branches** (10 min)
   ```bash
   git checkout -b deploy/philippines
   git push -u origin deploy/philippines
   
   git checkout main
   git checkout -b deploy/singapore
   git push -u origin deploy/singapore
   
   git checkout main
   git checkout -b deploy/usa
   git push -u origin deploy/usa
   ```

2. **Configure branch protection rules** (15 min)
   - Protect `main`, `deploy/*` branches
   - Require CI checks before merge
   - Require pull request reviews

3. **Set up CI/CD pipelines** (2-3 hours)
   - Create `.github/workflows/deploy-philippines.yml`
   - Create `.github/workflows/deploy-singapore.yml`
   - Create `.github/workflows/deploy-usa.yml`
   - Configure environment secrets (DATABASE_URL per country)

4. **Document deployment workflow** (30 min)
   - Update README with branch strategy
   - Document how to create country-specific migrations
   - Document merge strategy (deploy/* → main for shared code)

**Deliverable:** Deployment branches exist, CI/CD configured

**Validation:**
- Push to each deploy/* branch triggers correct CI pipeline
- Each pipeline generates correct country schema

---

### Phase 3: Database Migration (Week 2)

**Goal:** Migrate existing PH database to new structure

**Steps:**

1. **Checkout PH deployment branch** (1 min)
   ```bash
   git checkout deploy/philippines
   ```

2. **Generate PH schema** (1 min)
   ```bash
   export DEPLOYMENT_COUNTRY=PH
   npm run prisma:generate:ph
   ```

3. **Create PhilippinesBranchCompliance table** (30 min)
   ```bash
   npx prisma migrate dev --name add_philippines_branch_compliance
   ```
   
   Verify migration SQL creates:
   - `philippines_branch_compliance` table
   - Relation to `branches` table

4. **Backfill PhilippinesBranchCompliance** (1 hour)
   Write data migration script:
   ```typescript
   // prisma/migrations/backfill-branch-compliance.ts
   import { prisma } from '@/lib/prisma-client'
   
   async function main() {
     const branches = await prisma.branch.findMany();
     
     for (const branch of branches) {
       await prisma.philippinesBranchCompliance.create({
         data: {
           branchId: branch.id,
           branchSerialNumber: branch.serialNumber,
           branchCode: branch.branchCode,
         }
       });
     }
   }
   ```

5. **Backfill PhilippinesCompliance from ComplianceRegistry** (1 hour)
   ```typescript
   // prisma/migrations/backfill-business-compliance.ts
   import { prisma } from '@/lib/prisma-client'
   
   async function main() {
     const businesses = await prisma.business.findMany({
       include: { complianceRegistry: true }
     });
     
     for (const business of businesses) {
       const tin = business.complianceRegistry.find(r => r.key === 'BIR_TIN')?.value;
       const ptu = business.complianceRegistry.find(r => r.key === 'BIR_PTU_NUMBER')?.value;
       const ptuDate = business.complianceRegistry.find(r => r.key === 'BIR_PTU_ISSUED_AT')?.value;
       
       if (tin) {
         await prisma.philippinesCompliance.create({
           data: {
             businessId: business.id,
             birTin: tin,
             birPtuNumber: ptu || null,
             birPtuIssuedAt: ptuDate ? new Date(ptuDate) : null,
           }
         });
       }
     }
   }
   ```

6. **Test migration on dev database** (30 min)
   ```bash
   npx prisma migrate reset  # Reset to clean state
   npx prisma migrate deploy  # Apply all migrations
   tsx prisma/migrations/backfill-branch-compliance.ts
   tsx prisma/migrations/backfill-business-compliance.ts
   ```

7. **Verify data integrity** (30 min)
   ```sql
   -- Check all branches have compliance records
   SELECT COUNT(*) FROM branches 
   WHERE id NOT IN (SELECT branch_id FROM philippines_branch_compliance);
   -- Should be 0
   
   -- Check all businesses have compliance records
   SELECT COUNT(*) FROM businesses 
   WHERE id NOT IN (SELECT business_id FROM philippines_compliance);
   -- Should be 0
   ```

**Deliverable:** PH database has new compliance tables, data backfilled

**Validation:**
- All existing branches have `philippines_branch_compliance` records
- All existing businesses have `philippines_compliance` records
- No data loss

---

### Phase 4: Code Updates - Auth Layer (Week 2-3)

**Goal:** Update auth-server.ts to use new compliance tables

**Steps:**

1. **Update auth-server.ts includes** (15 min)
   ```typescript
   // OLD
   include: { complianceRegistry: true }
   
   // NEW
   include: { 
     philippinesCompliance: true,
     philippinesBranchCompliance: {
       where: { branchId: userBranchId }
     }
   }
   ```

2. **Update compliance data transformation** (30 min)
   ```typescript
   // OLD
   const mappedBusinessCompliance = transformKvPairs(businessCompliance)
   
   // NEW
   const phCompliance = businessData.philippinesCompliance
   const phBranchCompliance = branchData.philippinesBranchCompliance
   
   const complianceData = {
     birTin: phCompliance?.birTin,
     birPtuNumber: phCompliance?.birPtuNumber,
     birPtuIssuedAt: phCompliance?.birPtuIssuedAt,
     branchSerialNumber: phBranchCompliance?.branchSerialNumber,
     branchCode: phBranchCompliance?.branchCode,
   }
   ```

3. **Update user context type** (15 min)
   ```typescript
   // lib/better-auth/types.ts
   export type UserContext = {
     // ...
     compliance: {
       birTin?: string;
       birPtuNumber?: string;
       birPtuIssuedAt?: Date;
       branchSerialNumber?: string;
       branchCode?: string;
     }
   }
   ```

4. **Test auth flow** (30 min)
   - Login as test user
   - Verify `user.compliance` object populated
   - Verify no errors in console

**Deliverable:** Auth layer uses new compliance tables

**Validation:**
- User can log in successfully
- `user.compliance` contains correct BIR data
- No references to `complianceRegistry` in auth-server.ts

---

### Phase 5: Code Updates - Transaction Creation (Week 3)

**Goal:** Update create-pos-transaction.ts to use new compliance structure

**Steps:**

1. **Update snapshot field population** (1 hour)
   ```typescript
   // OLD
   snapshotBusinessTIN: user.complianceRegistry.BIR_TIN || null,
   snapshotBranchSN: user.branch.serialNumber || null,
   snapshotBranchCode: user.branch.branchCode || null,
   
   // NEW
   snapshotBusinessTIN: user.compliance.birTin || null,
   snapshotBranchSN: user.compliance.branchSerialNumber || null,
   snapshotBranchCode: user.compliance.branchCode || null,
   ```

2. **Update complianceData JSON** (30 min)
   ```typescript
   // OLD
   complianceData: {
     ptuNumber: user.complianceRegistry.BIR_PTU_NUMBER,
     ptuIssuedAt: user.complianceRegistry.BIR_PTU_ISSUED_AT,
     // ...
   }
   
   // NEW
   complianceData: {
     ptuNumber: user.compliance.birPtuNumber,
     ptuIssuedAt: user.compliance.birPtuIssuedAt,
     // ...
   }
   ```

3. **Test transaction creation** (1 hour)
   - Create test transaction
   - Verify snapshot fields populated correctly
   - Verify complianceData JSON correct
   - Check database record

**Deliverable:** Transaction creation uses new compliance structure

**Validation:**
- Create POS transaction succeeds
- Transaction has correct `snapshotBusinessTIN`, `snapshotBranchSN`
- `complianceData` JSON has correct PTU data

---

### Phase 6: Code Updates - Refund Creation (Week 3)

**Goal:** Update create-pos-refund.ts to copy snapshots correctly

**Steps:**

1. **Verify snapshot copying** (30 min)
   ```typescript
   // Should already work, just verify
   snapshotBusinessTIN: snapshot.snapshotBusinessTIN,
   snapshotBranchSN: snapshot.snapshotBranchSN,
   snapshotBranchCode: snapshot.snapshotBranchCode,
   ```

2. **Test refund creation** (30 min)
   - Create original transaction
   - Create refund for it
   - Verify refund has same snapshot values

**Deliverable:** Refunds copy compliance snapshots correctly

**Validation:**
- Refund transaction has identical snapshot fields as original

---

### Phase 7: Test Updates (Week 3-4)

**Goal:** Update all tests to use new compliance structure

**Steps:**

1. **Update mock-user.ts** (30 min)
   ```typescript
   // OLD
   complianceRegistry: {
     BIR_TIN: '123-456-789-000',
     BIR_PTU_NUMBER: 'PTU-2024-001',
   }
   
   // NEW
   compliance: {
     birTin: '123-456-789-000',
     birPtuNumber: 'PTU-2024-001',
     branchSerialNumber: '123456789',
     branchCode: '00001',
   }
   ```

2. **Update integration tests** (1-2 hours)
   - Update `create-pos-refund.integration.test.ts`
   - Update test data setup to create compliance records
   ```typescript
   await prisma.philippinesCompliance.create({
     data: {
       businessId: testBusiness.id,
       birTin: '123-456-789-000',
       birPtuNumber: 'PTU-2024-001',
     }
   });
   ```

3. **Update unit tests** (1 hour)
   - Update `create-pos-transaction.test.ts`
   - Update assertions to check new field names

4. **Run full test suite** (30 min)
   ```bash
   npm run test
   ```

**Deliverable:** All tests passing with new compliance structure

**Validation:**
- `npm run test` exits with 0
- No failing tests
- No skipped tests

---

### Phase 8: Seeder Updates (Week 4)

**Goal:** Update seeders to populate new compliance tables

**Steps:**

1. **Update configs.ts seeder** (1 hour)
   ```typescript
   // OLD
   await prisma.complianceRegistry.upsert({
     where: { key_businessId: { key: 'BIR_TIN', businessId } },
     create: { key: 'BIR_TIN', value: '123-456-789-000', businessId },
     update: { value: '123-456-789-000' },
   });
   
   // NEW
   await prisma.philippinesCompliance.upsert({
     where: { businessId },
     create: {
       businessId,
       birTin: '123-456-789-000',
       birPtuNumber: 'PTU-2024-001',
       birPtuIssuedAt: new Date('2024-01-01'),
     },
     update: {
       birTin: '123-456-789-000',
     },
   });
   
   await prisma.philippinesBranchCompliance.upsert({
     where: { branchId },
     create: {
       branchId,
       branchSerialNumber: '123456789',
       branchCode: '00001',
     },
     update: {
       branchSerialNumber: '123456789',
     },
   });
   ```

2. **Test seed script** (15 min)
   ```bash
   npx prisma migrate reset  # Wipes DB
   npx tsx prisma/seeders/seed.ts
   ```

3. **Verify seeded data** (15 min)
   ```bash
   npm run prisma:studio:ph
   # Check philippines_compliance table has records
   # Check philippines_branch_compliance table has records
   ```

**Deliverable:** Seeders populate new compliance tables

**Validation:**
- Fresh database seed creates compliance records
- Can log in with seeded user
- Can create transactions with seeded data

---

### Phase 9: Deprecate ComplianceRegistry (Week 4)

**Goal:** Remove ComplianceRegistry table and code

**Steps:**

1. **Verify no remaining usage** (30 min)
   ```bash
   # Search for ComplianceRegistry usage
   git grep -i "complianceRegistry" web/src
   git grep -i "ComplianceRegistry" web/src
   git grep -i "compliance_registries" web/src
   ```
   Should return 0 results

2. **Create migration to drop table** (15 min)
   ```bash
   npx prisma migrate dev --name drop_compliance_registry
   ```
   
   Migration SQL:
   ```sql
   DROP TABLE compliance_registries;
   ```

3. **Remove from schema** (5 min)
   Remove `ComplianceRegistry` model from `base/core.prisma`
   Remove `ComplianceKey` enum from `base/_enums.prisma`

4. **Regenerate schema** (2 min)
   ```bash
   npm run prisma:generate:ph
   ```

5. **Test application** (30 min)
   - Full smoke test
   - Create transactions
   - Create refunds
   - Verify receipts print correctly

**Deliverable:** ComplianceRegistry table removed

**Validation:**
- No references to ComplianceRegistry in codebase
- Table does not exist in database
- Application works normally

---

### Phase 10: Documentation & Handoff (Week 4)

**Goal:** Document new architecture for team

**Steps:**

1. **Update README** (30 min)
   - Document deployment branch strategy
   - Document how to generate schema for local dev
   - Document how to create migrations

2. **Create runbook** (1 hour)
   - How to add new country-specific field
   - How to create country-specific migration
   - How to merge changes back to main

3. **Team training** (1 hour)
   - Walk through new architecture
   - Demonstrate schema generation
   - Show deployment branch workflow

4. **Final validation** (1 hour)
   - Full regression test
   - Performance test (schema generation time)
   - Confirm backup strategy

**Deliverable:** Team trained, documentation complete

**Validation:**
- Team members can generate schema independently
- Team members can create country-specific migrations
- All acceptance criteria met

---

### Phase 11: Implement Compliance Adapter Pattern (NEW)

**Goal:** Refactor PH-specific code to use country-agnostic adapters

**Steps:**

1. **Create adapter types and interfaces** (30 min)
   ```typescript
   // src/lib/compliance/types.ts
   export interface StandardCompliance { ... }
   export interface ComplianceAdapter { ... }
   ```

2. **Implement Philippines adapter** (2 hours)
   ```typescript
   // src/lib/compliance/adapters/philippines-adapter.ts
   export class PhilippinesComplianceAdapter implements ComplianceAdapter { ... }
   ```

3. **Implement Singapore adapter** (2 hours)
   ```typescript
   // src/lib/compliance/adapters/singapore-adapter.ts
   export class SingaporeComplianceAdapter implements ComplianceAdapter { ... }
   ```

4. **Implement USA adapter** (2 hours)
   ```typescript
   // src/lib/compliance/adapters/usa-adapter.ts
   export class UsaComplianceAdapter implements ComplianceAdapter { ... }
   ```

5. **Create adapter factory** (30 min)
   ```typescript
   // src/lib/compliance/adapter-factory.ts
   export function getComplianceAdapter(): ComplianceAdapter { ... }
   export const complianceAdapter = getComplianceAdapter()
   ```

6. **Refactor auth-server.ts** (1 hour)
   - Replace PH-specific compliance fetching with adapter
   - Use `complianceAdapter.toStandardFormat()`
   - Return standardized compliance object

7. **Refactor create-pos-transaction.ts** (1 hour)
   - Replace PH-specific snapshot building with adapter
   - Use `complianceAdapter.buildTransactionSnapshots()`
   - Remove hardcoded PH field names

8. **Refactor create-pos-refund.ts** (30 min)
   - Replace PH-specific snapshot copying with adapter
   - Use `complianceAdapter.buildRefundSnapshots()`

9. **Update test mocks** (1 hour)
   - Create adapter mocks for each country
   - Update test fixtures to use adapters
   - Ensure tests pass for PH deployment

10. **Test with SG schema** (2 hours)
    ```bash
    # Generate SG schema
    DEPLOYMENT_COUNTRY=SG pnpm prisma:generate
    
    # Run app with SG adapter
    DEPLOYMENT_COUNTRY=SG npm run dev
    
    # Verify SG compliance data loads
    # Verify transactions have SG snapshot fields
    ```

11. **Test with US schema** (2 hours)
    ```bash
    # Generate US schema
    DEPLOYMENT_COUNTRY=US pnpm prisma:generate
    
    # Run app with US adapter
    DEPLOYMENT_COUNTRY=US npm run dev
    
    # Verify US compliance data loads
    # Verify transactions have US snapshot fields
    ```

**Deliverable:** Single codebase that adapts to any DEPLOYMENT_COUNTRY

**Validation:**
```bash
# PH deployment
DEPLOYMENT_COUNTRY=PH pnpm prisma:generate && npm run dev
# ✅ Uses PhilippinesComplianceAdapter
# ✅ Fetches from philippines_compliance table
# ✅ Transaction has snapshotBusinessTIN, snapshotPTUNumber

# SG deployment
DEPLOYMENT_COUNTRY=SG pnpm prisma:generate && npm run dev
# ✅ Uses SingaporeComplianceAdapter
# ✅ Fetches from singapore_compliance table
# ✅ Transaction has snapshotGSTNumber, snapshotUEN

# US deployment
DEPLOYMENT_COUNTRY=US pnpm prisma:generate && npm run dev
# ✅ Uses UsaComplianceAdapter
# ✅ Fetches from usa_compliance table
# ✅ Transaction has snapshotEIN, snapshotStateCode
```

**Success Criteria:**
- ✅ Zero PH-specific field names in business logic (only in adapter)
- ✅ All three countries work without code changes
- ✅ Tests pass for all countries
- ✅ Type safety maintained (no `any` types)

---

## Timeline Summary

| Phase | Duration | Depends On | Deliverable |
|-------|----------|------------|-------------|
| 1. Schema Infrastructure | 1 week | - | Schema generation working |
| 2. Deployment Branches | 3 days | Phase 1 | CI/CD pipelines configured |
| 3. Database Migration | 2 days | Phase 2 | PH database migrated |
| 4. Auth Layer | 2 days | Phase 3 | Auth uses new tables |
| 5. Transaction Creation | 2 days | Phase 4 | Transactions use new structure |
| 6. Refund Creation | 1 day | Phase 5 | Refunds copy snapshots |
| 7. Test Updates | 3 days | Phase 6 | All tests passing |
| 8. Seeder Updates | 1 day | Phase 7 | Seeders populate new tables |
| 9. Deprecate ComplianceRegistry | 1 day | Phase 8 | Old table removed |
| 10. Documentation | 2 days | Phase 9 | Team trained |
| **11. Adapter Pattern** | **3 days** | **Phase 10** | **Country-agnostic code** |

**Total: ~4.5 weeks (1 developer full-time)**

---

## Risk Mitigation

**Risk:** Schema generation breaks during implementation  
**Mitigation:** Validate after each base file extraction, commit working states

**Risk:** Data loss during migration  
**Mitigation:** Test migration on copy of prod database first, have rollback plan

**Risk:** Deployment branch strategy too complex  
**Mitigation:** Start with PH only, add SG/US later once workflow proven

**Risk:** Team unfamiliar with new workflow  
**Mitigation:** Pair programming sessions, detailed runbook, recorded demos

**Risk:** Adapter pattern adds too much complexity  
**Mitigation:** Keep adapter interface simple (4 methods), provide clear examples, thorough testing

**Risk:** Type safety lost with adapter pattern  
**Mitigation:** Use generic types, strict TypeScript config, comprehensive type tests

---

---

## Acceptance Criteria

- [ ] Each deployment generates only its country's schema
- [ ] PH database contains zero SG/US compliance tables
- [ ] SG database contains zero PH/US compliance tables
- [ ] US database contains zero PH/SG compliance tables
- [ ] No duplicate model declarations in any country file
- [ ] `prisma validate` passes for all generated schemas
- [ ] Schema generation tests verify field presence/absence
- [ ] Database table isolation verified
- [ ] Offline-first architecture preserved
- [ ] No production data destroyed

---

## Open Questions

1. ~~**Migration directory isolation:**~~ **RESOLVED** - Using separate deployment branches (deploy/philippines, deploy/singapore, deploy/usa) with independent migration histories
2. **ComplianceRegistry deprecation:** Remove immediately or keep for PH backward compatibility?
3. **Country implementation scope:** All 3 countries now or PH only?
4. **Offline compliance access:** Do compliance tables need collections?

---

**End of Document**
