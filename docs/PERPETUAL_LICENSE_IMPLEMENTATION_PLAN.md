# Perpetual License Implementation Plan

**Status**: ❌ **NOT IMPLEMENTED** - Planning Phase  
**Last Updated**: August 28, 2026  
**Target**: Self-hosted enterprise deployments (future product offering)

---

## Executive Summary

This document outlines the strategy for implementing perpetual licenses for self-hosted client deployments of START-POS. The approach focuses on:

1. **Code Protection**: Distributing compiled/obfuscated code (not source)
2. **Database Security**: Stripping billing tables and protecting sensitive schema
3. **Feature Stripping**: Removing SaaS-specific features (Stripe, subscriptions, invoicing)
4. **License Validation**: Embedded license baked into the Docker image at build time — works fully offline; optional phone-home for tracking/migration logging only
5. **Docker Distribution**: Containerized deployment with encrypted migrations

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Database Strategy](#2-database-strategy)
- [3. Code Distribution Strategy](#3-code-distribution-strategy)
- [4. Feature Removal](#4-feature-removal)
- [5. License System](#5-license-system)
- [6. Build Pipeline](#6-build-pipeline)
- [7. Deployment Model](#7-deployment-model)
- [8. Security Measures](#8-security-measures)
- [9. Implementation Phases](#9-implementation-phases)
- [10. Pricing Models](#10-pricing-models)

---

## 1. Architecture Overview

### Current State (SaaS)

```
┌─────────────────────────────────────────┐
│         START-POS SaaS                  │
├─────────────────────────────────────────┤
│ • TanStack Start (React SSR)            │
│ • Stripe Integration                    │
│ • Subscription Engine                   │
│ • Multi-tenant (Business → Branch)      │
│ • PostgreSQL + Prisma                   │
│ • Better Auth (offline-capable)         │
└─────────────────────────────────────────┘
```

### Target State (Self-Hosted)

```
┌─────────────────────────────────────────┐
│     START-POS Enterprise (Client)       │
├─────────────────────────────────────────┤
│ • Compiled/Obfuscated Code              │
│ • License Validation Engine             │
│ • NO Billing/Subscription Features      │
│ • Stripped Database Schema              │
│ • Docker Container Distribution         │
│ • Encrypted Migrations                  │
└─────────────────────────────────────────┘
         ↓ Validates License ↓
┌─────────────────────────────────────────┐
│    License Server (Your Infrastructure) │
├─────────────────────────────────────────┤
│ • License Key Generation                │
│ • Online Validation API                 │
│ • Hardware Fingerprint Verification     │
│ • Update Notifications                  │
│ • Revocation Management                 │
└─────────────────────────────────────────┘
```

---

## 2. Database Strategy

### 2.1 Tables to EXCLUDE from Commercial Builds

These tables will **NOT exist** in client databases:

#### Billing & Subscriptions
- `business_subscriptions`
- `subscription_status_history`
- `subscription_plans`
- `plan_entitlements`

#### Invoicing
- `billing_invoices`
- `billing_invoice_items`

#### Payment Processing
- `payments`

#### Credits & Add-ons (SaaS-only)
- `credit_ledger`
- `business_subscription_addons`
- `business_subscription_features`

#### Usage Tracking (Billing-only)
- `usage_counters`

#### Overrides (SaaS-only)
- `entitlement_overrides`

**Total Tables Removed**: ~10 tables

### 2.2 Tables to KEEP (Core POS)

✅ **Keep all operational tables:**
- Business entities: `businesses`, `branches`, `users`
- Products: `products`, `categories`, `variants`
- Inventory: `inventory_items`, `stock_movements`
- Transactions: `transactions`, `orders`, `order_items`
- Customers: `customers`
- Operations: `goods_receipts`, `productions`
- Configuration: `configuration_definitions`, `configuration_values`

### 2.3 License Management (NO Database Table)

**License is embedded in the Docker image at build time - NOT stored in client's database.**

**Why no License table?**
- Clients deploy their own database
- They could view/edit a License table
- Defeats the purpose of license protection
- License data should never be in a database they control

**Instead: License Embedded in Build**

Each client receives a **unique Docker image** with their license baked in:

```dockerfile
# Build-time license injection
ARG LICENSE_KEY
ARG LICENSE_EXPIRES_AT
ARG SUPPORT_EXPIRES_AT

# Baked into environment variables in the image
ENV LICENSE_KEY=${LICENSE_KEY}
ENV LICENSE_EXPIRES_AT=${LICENSE_EXPIRES_AT}
ENV SUPPORT_EXPIRES_AT=${SUPPORT_EXPIRES_AT}
```

**License Validation:**
```typescript
// src/lib/licensing/license-embedded.ts
export class EmbeddedLicense {
  private licenseKey: string;
  private expiresAt: Date | null;
  private supportExpiresAt: Date | null;
  
  constructor() {
    // Read from environment (baked into Docker image)
    this.licenseKey = process.env.LICENSE_KEY!;
    this.expiresAt = process.env.LICENSE_EXPIRES_AT 
      ? new Date(process.env.LICENSE_EXPIRES_AT) 
      : null; // null = perpetual
    this.supportExpiresAt = process.env.SUPPORT_EXPIRES_AT
      ? new Date(process.env.SUPPORT_EXPIRES_AT)
      : null;
  }
  
  isValid(): boolean {
    // Perpetual licenses never expire
    if (!this.expiresAt) return true;
    return this.expiresAt > new Date();
  }
}
```

**Benefits:**
- ✅ No database table needed
- ✅ Can't be easily modified by client
- ✅ Each client gets unique Docker image
- ✅ Simple renewal: send new Docker image
- ✅ Works offline immediately

**License Renewal Flow:**
1. Support expires → Client requests renewal
2. You build new Docker image with updated `SUPPORT_EXPIRES_AT`
3. Push to registry with new tag
4. Client pulls and restarts: `docker-compose pull && docker-compose up -d`

### 2.4 Schema Protection Strategy

#### A. Build-Time Stripping
- Script that reads `prisma/base/*.prisma` files
- Excludes entire `billing.prisma` file
- Removes `Payment` model from `operations.prisma`
- No license model added (license lives in Docker env vars only — see 2.3)
- Generates `prisma/commercial/schema.prisma`

#### B. Migration Encryption
- Strip billing DDL from migrations
- Encrypt SQL using AES-256
- Distribute as `migrations.encrypted.json`
- Decrypt at runtime only (in-memory)
- Never write decrypted migrations to disk

#### C. Database Access Control
- Application uses full-privilege database user (owns all tables)
- No direct database access provided to clients by default
- Schema remains protected from inspection

### 2.5 Client Database Access Model

#### Default Mode: App-Managed Only (v1.0)

**Standard Deployment:**
- Docker compose includes: **app + PostgreSQL database**
- Application manages database via Prisma (full control)
- Clients interact via application UI/API only
- Database exposed on port 5432 but no client tools provided
- No schema documentation needed
- Zero risk of data corruption from manual edits

**Best for:** 90% of self-hosted deployments

---

#### Future: Optional Adminer Integration (v2.0+)

**When clients request direct database viewing:**

Include Adminer (lightweight DB web UI) in docker-compose with **read-only access**:

```yaml
# Future: Uncomment in docker-compose.yml
adminer:
  image: adminer:latest
  ports:
    - "8080:8080"
  environment:
    ADMINER_DEFAULT_SERVER: db
  depends_on:
    - db
```

**Read-Only Database User (for Adminer):**
```sql
-- Create read-only user for safe DB viewing
CREATE ROLE readonly_viewer WITH LOGIN PASSWORD 'viewer_password';

-- Grant SELECT on safe tables only
GRANT SELECT ON products, categories, variants TO readonly_viewer;
GRANT SELECT ON transactions, orders, order_items TO readonly_viewer;
GRANT SELECT ON customers TO readonly_viewer;
GRANT SELECT ON inventory_items, stock_movements TO readonly_viewer;

-- Revoke on sensitive/internal tables
REVOKE ALL ON users FROM readonly_viewer;  -- User passwords
REVOKE ALL ON sessions FROM readonly_viewer;  -- Session tokens

-- Prevent schema changes
REVOKE CREATE ON SCHEMA public FROM readonly_viewer;
```

**Adminer Features Available:**
- ✅ View table data (read-only tables)
- ✅ Run SELECT queries
- ✅ Export data (CSV, SQL)
- ✅ Search across tables
- ❌ No INSERT/UPDATE/DELETE (read-only user)
- ❌ No schema modifications
- ❌ No sensitive tables visible

**Decision:** Not included in v1.0 - add if customers request it (minimal effort to enable)

---

#### Alternative: Managed Service Mode

**When client wants you to maintain their deployment:**

| Mode | Who Manages | Database Access | Pricing |
|------|-------------|----------------|---------|
| **Self-Managed** | Client IT team | None (app only) | Perpetual license only |
| **Self-Managed + Adminer** | Client IT team | Read-only viewer | Perpetual license only |
| **Managed Service** | You (as contractor) | Full admin access | License + monthly DevOps fee |

**Managed Service Implementation:**
- You receive SSH + full database credentials
- Deploy updates, run migrations, monitor uptime
- Client retains infrastructure and data ownership
- Separate DevOps Services Agreement with SLA

---

## 3. Code Distribution Strategy

### 3.1 What Clients Receive

**✅ Distributed:**
- Docker image (pre-built)
- Compiled JavaScript bundles (minified + obfuscated)
- Generated Prisma Client (no schema)
- Encrypted migrations
- docker-compose.yml configuration
- Deployment documentation

**❌ NOT Distributed:**
- Source code (.ts, .tsx files)
- Prisma schema files
- Raw migration SQL
- Billing/Stripe integration code
- Build tools or development dependencies
- Environment secrets

### 3.2 Code Obfuscation

**Tools:**
- `terser` - Minification with aggressive compression
- `javascript-obfuscator` - Code transformation
- `rollup-plugin-obfuscator` - Build-time obfuscation

**Techniques Applied:**
- Variable/function name mangling
- Control flow flattening
- Dead code injection
- String encryption (base64)
- Remove source maps
- Remove console.log statements
- Remove debugger statements

### 3.3 Vite Configuration (Commercial)

```typescript
// vite.config.commercial.ts
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: { toplevel: true },
    },
    sourcemap: false, // NO source maps
    rollupOptions: {
      output: {
        manualChunks: undefined, // Prevent structure leakage
      },
      plugins: [
        obfuscator({
          compact: true,
          controlFlowFlattening: true,
          deadCodeInjection: true,
          stringArray: true,
          stringArrayEncoding: ['base64'],
        }),
      ],
    },
  },
});
```

---

## 4. Feature Removal

### 4.1 Files to EXCLUDE from Commercial Builds

#### Billing Module
- `src/lib/billing/` (entire directory)
  - `subscription-engine.ts`
  - `subscription-policy.ts`
  - `billing-provider.ts`
  - `adapters/stripe-adapter.ts`
  - `pricing/` (all pricing strategies)

#### Server Functions
- `src/lib/server-fn/create-billing-portal-session.ts`
- `src/lib/server-fn/purchase-credit-package.ts`
- `src/lib/server-fn/purchase-tx-addon.ts`
- `src/lib/server-fn/purchase-addon-subscription.ts`

#### Routes
- `src/routes/(private)/billing.tsx`
- `src/routes/(private)/billing/` (entire directory)
- `src/routes/(private)/subscription/` (entire directory)

#### Components
- `src/components/subscription-banner.tsx`
- `src/components/billing-related components`

#### Background Jobs
- `src/lib/jobs/billing-invoice-generation.ts`

#### Tests
- `__tests__/**/billing/**`
- `__tests__/**/subscription/**`
- `__tests__/e2e/billing-*.spec.ts`

### 4.2 Vite Plugin: Strip Billing Features

```typescript
// vite-plugin-strip-billing.ts
export function stripBillingFeatures(): Plugin {
  const excludePatterns = [
    /src\/lib\/billing\//,
    /src\/lib\/server-fn\/purchase-/,
    /src\/lib\/server-fn\/create-billing-portal/,
    /src\/routes\/.*billing/,
    /src\/components\/.*subscription/,
    /stripe-adapter/,
  ];
  
  return {
    name: 'strip-billing-features',
    resolveId(id) {
      if (process.env.DEPLOYMENT_MODE !== 'SELF_HOSTED') {
        return null; // Normal SaaS build
      }
      
      for (const pattern of excludePatterns) {
        if (pattern.test(id)) {
          return { id, external: true }; // Mark as external (won't bundle)
        }
      }
      
      return null;
    },
  };
}
```

### 4.3 Environment-Based Feature Flags

```typescript
// src/lib/deployment/features.ts
export const FEATURES = {
  BILLING: process.env.DEPLOYMENT_MODE === 'SAAS',
  STRIPE: process.env.DEPLOYMENT_MODE === 'SAAS',
  SUBSCRIPTIONS: process.env.DEPLOYMENT_MODE === 'SAAS',
  CREDITS: process.env.DEPLOYMENT_MODE === 'SAAS',
  LICENSE: process.env.DEPLOYMENT_MODE === 'SELF_HOSTED',
};

// Usage in code:
if (FEATURES.BILLING) {
  // Only included in SaaS builds
  import('./billing-module');
}
```

---

## 5. License System

### 5.1 License Key Format

```
Format: SPOS-[CLIENT-ID]-[TYPE]-[HASH]-[SIGNATURE]

Example: SPOS-ABC12345-PERP-4F9A-D3E8B2C7A1F6

Components:
- SPOS: Product identifier
- ABC12345: Client identifier (8 chars, base62)
- PERP: License type (PERP=Perpetual, SUPP=Perpetual+Support)
- 4F9A: Random salt (4 bytes hex)
- D3E8B2C7A1F6: Signature checksum (first 12 chars of RSA signature)
```

**Note:** No feature tier encoding - all perpetual licenses are fully unlimited.

### 5.2 License Generation (Your Admin Tool)

```typescript
interface LicenseParams {
  clientId: string;
  companyName: string;
  contactEmail: string;
  licenseType: 'PERPETUAL' | 'PERPETUAL_WITH_SUPPORT';
  deploymentMode: 'SELF_MANAGED' | 'MANAGED_SERVICE';
  supportExpiresAt?: Date; // Only for PERPETUAL_WITH_SUPPORT
}

async function generateLicense(params: LicenseParams): Promise<string> {
  const licenseData = {
    clientId: params.clientId,
    companyName: params.companyName,
    licenseType: params.licenseType,
    deploymentMode: params.deploymentMode,
    issuedAt: new Date().toISOString(),
    expiresAt: null, // Always null for perpetual
    supportExpiresAt: params.supportExpiresAt?.toISOString() || null,
  };
  
  // Sign with your private RSA key
  const signature = crypto
    .createSign('SHA256')
    .update(JSON.stringify(licenseData))
    .sign(privateKey, 'base64');
  
  // Encode as license key
  const licenseKey = encodeLicenseKey({
    ...licenseData,
    signature,
  });
  
  // Store in your license database (separate from client)
  await yourLicenseDB.license.create({
    data: { 
      licenseKey, 
      ...licenseData,
      status: 'INACTIVE', // Becomes ACTIVE on first validation
    },
  });
  
  return licenseKey;
}
```

**Key Changes:**
- Removed: `features`, `maxUsers`, `maxBranches` (all licenses are unlimited)
- Added: `deploymentMode` to track managed service vs. self-managed
- `expiresAt` always null (perpetual never expires)
- Only `supportExpiresAt` matters for annual support contracts

### 5.3 License Validation (Server Binding on Deployment)

```typescript
// src/lib/licensing/license-embedded.ts
export class EmbeddedLicense {
  private licenseKey: string;
  private expiresAt: Date | null;
  private supportExpiresAt: Date | null;
  private registeredServerInfo: string; // Server hash from contract
  
  constructor() {
    // Read from environment (baked into Docker image at build time)
    this.licenseKey = process.env.LICENSE_KEY!;
    this.expiresAt = process.env.LICENSE_EXPIRES_AT 
      ? new Date(process.env.LICENSE_EXPIRES_AT) 
      : null; // null = perpetual
    this.supportExpiresAt = process.env.SUPPORT_EXPIRES_AT
      ? new Date(process.env.SUPPORT_EXPIRES_AT)
      : null;
    this.registeredServerInfo = process.env.REGISTERED_SERVER_HASH!;
      
    if (!this.licenseKey || !this.registeredServerInfo) {
      throw new Error('Invalid build - license key or server info missing');
    }
  }
  
  // Validate on FIRST deployment only (one-time server binding check)
  async validateDeployment(): Promise<void> {
    const currentServerInfo = await this.getServerFingerprint();
    
    // Call license server to validate deployment
    try {
      const response = await fetch(`${LICENSE_SERVER_URL}/api/validate-deployment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.licenseKey,
          registeredServerHash: this.registeredServerInfo,
          actualServerInfo: currentServerInfo,
          deploymentTimestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10000), // 10 sec timeout
      });
      
      if (!response.ok) {
        throw new Error('License server validation failed');
      }
      
      const result = await response.json();
      
      if (!result.valid) {
        throw new Error(
          `License validation failed: ${result.reason}\n` +
          `This build is registered for a different server.\n` +
          `Contact vendor to update server registration.`
        );
      }
      
      // Save deployment validation flag
      await this.markDeploymentValidated();
      
    } catch (error) {
      throw new Error(
        `Unable to validate license on deployment.\n` +
        `Please ensure internet connection and contact support.\n` +
        `Error: ${error.message}`
      );
    }
  }
  
  // After first deployment, just check expiration (offline)
  isValid(): boolean {
    // Check if deployment was validated
    if (!this.isDeploymentValidated()) {
      throw new Error('License not validated - please restart application');
    }
    
    // Perpetual licenses never expire
    if (!this.expiresAt) return true;
    
    // Check expiration
    return this.expiresAt > new Date();
  }
  
  // Generate server fingerprint (hostname, network, etc.)
  private async getServerFingerprint(): Promise<string> {
    const os = await import('os');
    const { execSync } = await import('child_process');
    
    const components = [
      os.hostname(),
      os.platform(),
      os.arch(),
      // Get primary network interface MAC
      Object.values(os.networkInterfaces())[0]?.[0]?.mac || '',
    ];
    
    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }
  
  // Check if support contract is active
  hasSupportContract(): boolean {
    if (!this.supportExpiresAt) return false;
    return this.supportExpiresAt > new Date();
  }
  
  private async markDeploymentValidated(): Promise<void> {
    // Save flag to persistent storage (not DB - local file)
    await fs.writeFile('.license-validated', JSON.stringify({
      validatedAt: new Date().toISOString(),
      serverFingerprint: await this.getServerFingerprint(),
    }));
  }
  
  private isDeploymentValidated(): boolean {
    try {
      const data = fs.readFileSync('.license-validated', 'utf8');
      return !!JSON.parse(data).validatedAt;
    } catch {
      return false;
    }
  }
}

// Startup validation
const license = new EmbeddedLicense();

// First deployment: validate with server
if (!license.isDeploymentValidated()) {
  await license.validateDeployment();
}

// Subsequent startups: offline check only
if (!license.isValid()) {
  throw new Error(
    'License expired. Please contact your vendor for an updated version.'
  );
}
```

**How It Works:**
1. **First Deployment:** App calls your license server to validate server matches contract
2. **Subsequent Restarts:** Offline validation only (no internet needed)
3. **Server Change:** Validation fails → client must contact you to update registration
4. **Prevents Redistribution:** Each build only works on registered server

### 5.4 License Server API (Deployment Validation)

```typescript
// Your hosted license validation endpoint
// POST https://license.yourcompany.com/api/validate-deployment

interface DeploymentValidationRequest {
  licenseKey: string;
  registeredServerHash: string;  // From build
  actualServerInfo: string;       // Current server
  deploymentTimestamp: string;
}

interface DeploymentValidationResponse {
  valid: boolean;
  reason?: string;
}

async function validateDeployment(req: DeploymentValidationRequest): Promise<DeploymentValidationResponse> {
  // Look up license in your database
  const license = await licenseDB.findByKey(req.licenseKey);
  
  if (!license) {
    return { valid: false, reason: 'License not found' };
  }
  
  if (license.status === 'REVOKED') {
    return { valid: false, reason: 'License has been revoked' };
  }
  
  // Verify server fingerprint matches registered server
  const actualServerHash = crypto
    .createHash('sha256')
    .update(req.actualServerInfo)
    .digest('hex');
  
  if (actualServerHash !== req.registeredServerHash) {
    // Server mismatch - possible redistribution attempt
    await licenseDB.logEvent({
      licenseId: license.id,
      event: 'DEPLOYMENT_SERVER_MISMATCH',
      expectedHash: req.registeredServerHash,
      actualHash: actualServerHash,
      timestamp: req.deploymentTimestamp,
    });
    
    // Alert your team
    await sendAlertToTeam({
      type: 'UNAUTHORIZED_DEPLOYMENT',
      licenseKey: req.licenseKey,
      companyName: license.companyName,
      message: 'Build deployed on unauthorized server',
    });
    
    return { 
      valid: false, 
      reason: 'Server mismatch. This build is registered for a different server. Contact vendor to update server registration.'
    };
  }
  
  // First deployment on correct server
  if (!license.deployedAt) {
    await licenseDB.update(license.id, {
      deployedAt: new Date(),
      deployedServerHash: actualServerHash,
      status: 'ACTIVE',
    });
  }
  
  // Log successful deployment validation
  await licenseDB.logEvent({
    licenseId: license.id,
    event: 'DEPLOYMENT_VALIDATED',
    serverHash: actualServerHash,
    timestamp: req.deploymentTimestamp,
  });
  
  return { valid: true };
}
```

**How Server Binding Works:**

1. **Contract Phase:** Client provides server details (hostname, IP, specs)
2. **Build Phase:** You generate server hash and embed in build
3. **Deployment Phase:** App validates actual server matches registered hash
4. **Enforcement:** If mismatch → deployment fails, you get alerted

**Server Change Process:**
```
Client: "We need to migrate to new server"
You: Generate new build with new server hash
Client: Deploy new build on new server
```

### 5.5 License Middleware

```typescript
// src/middleware/license-check.ts
// Embedded license is validated once at startup (see 5.3), not per-request.
// This middleware just reads the already-validated result from app context.
export async function licenseCheckMiddleware(event) {
  if (process.env.DEPLOYMENT_MODE !== 'SELF_HOSTED') {
    return; // Skip for SaaS deployments
  }

  // license was validated at process startup by EmbeddedLicense (5.3).
  // If it were invalid, the process would have already thrown and failed
  // to start — so by the time middleware runs, it's always valid.
  event.context.license = getEmbeddedLicenseInfo();

  // Optional: fire-and-forget phone-home for tracking/migration logging.
  // Never blocks the request or affects app.isValid().
  reportUsageAsync().catch(() => {});
}
```


---

## 6. Build Pipeline

### 6.1 Build Scripts

```json
{
  "scripts": {
    "schema:saas": "tsx prisma/scripts/generate-schema.ts",
    "schema:commercial": "tsx scripts/build-commercial-schema.ts",
    
    "build": "pnpm schema:saas && vite build",
    "build:commercial": "pnpm schema:commercial && cross-env DEPLOYMENT_MODE=SELF_HOSTED vite build --mode commercial",
    
    "docker:commercial": "docker build -f Dockerfile.commercial -t start-pos-enterprise:latest .",
    
    "encrypt:migrations": "tsx scripts/encrypt-migrations.ts",
    
    "package:commercial": "tsx scripts/package-commercial.ts",
    
    "release:commercial": "pnpm build:commercial && pnpm docker:commercial && pnpm docker:push"
  }
}
```

### 6.2 Schema Builder Script

```typescript
// scripts/build-commercial-schema.ts

async function buildCommercialSchema() {
  const baseDir = 'prisma/base';
  const files = await fs.readdir(baseDir);
  
  let commercialSchema = '';
  
  // Add generator and datasource
  commercialSchema += await fs.readFile(`${baseDir}/_generator.prisma`, 'utf-8');
  commercialSchema += '\n\n';
  
  for (const file of files) {
    if (file === '_generator.prisma') continue;
    
    const content = await fs.readFile(`${baseDir}/${file}`, 'utf-8');
    
    // EXCLUDE billing.prisma entirely
    if (file === 'billing.prisma') {
      console.log('❌ Excluded: billing.prisma');
      continue;
    }
    
    // For operations.prisma, remove Payment model
    if (file === 'operations.prisma') {
      const filtered = removeModel(content, 'Payment');
      commercialSchema += filtered + '\n\n';
      console.log('✅ Included: operations.prisma (Payment removed)');
      continue;
    }
    
    // Include everything else
    commercialSchema += content + '\n\n';
    console.log(`✅ Included: ${file}`);
  }
  
  // NOTE: No License model is added here. Per 2.3, license data lives only
  // in the Docker image's environment variables — never in the client's
  // database, so there is nothing to inject into the commercial schema.
  
  // Cleanup orphaned references
  commercialSchema = cleanupOrphanedReferences(commercialSchema);
  
  // Write commercial schema
  await fs.writeFile('prisma/commercial/schema.prisma', commercialSchema);
  
  // Generate Prisma Client
  execSync('prisma generate --schema=prisma/commercial/schema.prisma');
  
  console.log('✅ Commercial schema generated');
}
```

### 6.3 Migration Encryption Script

```typescript
// scripts/encrypt-migrations.ts

async function encryptMigrations() {
  const migrationsDir = 'prisma/migrations';
  const migrations = await fs.readdir(migrationsDir);
  
  const encryptedMigrations: Record<string, string> = {};
  
  for (const migration of migrations) {
    const sqlPath = path.join(migrationsDir, migration, 'migration.sql');
    
    if (!await fs.pathExists(sqlPath)) continue;
    
    let sql = await fs.readFile(sqlPath, 'utf-8');
    
    // Strip billing DDL
    sql = removeBillingDDL(sql);
    
    // Encrypt
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(sql, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    encryptedMigrations[migration] = encrypted;
  }
  
  await fs.writeJSON(
    'prisma/commercial/migrations.encrypted.json',
    encryptedMigrations
  );
  
  console.log('✅ Migrations encrypted');
}

function removeBillingDDL(sql: string): string {
  const billingTables = [
    'business_subscriptions',
    'subscription_plans',
    'billing_invoices',
    'credit_ledger',
    // ... etc
  ];
  
  let cleaned = sql;
  
  for (const table of billingTables) {
    // Remove CREATE TABLE
    cleaned = cleaned.replace(
      new RegExp(`CREATE TABLE.*"${table}".*?;`, 'gs'),
      ''
    );
    
    // Remove ALTER TABLE
    cleaned = cleaned.replace(
      new RegExp(`ALTER TABLE.*"${table}".*?;`, 'gs'),
      ''
    );
    
    // Remove foreign keys
    cleaned = cleaned.replace(
      new RegExp(`ALTER TABLE.*REFERENCES.*"${table}".*?;`, 'gs'),
      ''
    );
  }
  
  return cleaned;
}
```

---

## 7. Deployment Model

### 7.1 Docker Distribution (Per-Client Build)

```dockerfile
# Dockerfile.commercial
# Each client gets unique build with embedded license

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build commercial version
RUN pnpm run build:commercial

# === Production Image ===
FROM node:20-alpine

WORKDIR /app

# Build args for license (passed at build time)
ARG LICENSE_KEY
ARG LICENSE_EXPIRES_AT
ARG SUPPORT_EXPIRES_AT
ARG CLIENT_ID
ARG REGISTERED_SERVER_HASH

# Bake license into environment variables
ENV LICENSE_KEY=${LICENSE_KEY}
ENV LICENSE_EXPIRES_AT=${LICENSE_EXPIRES_AT}
ENV SUPPORT_EXPIRES_AT=${SUPPORT_EXPIRES_AT}
ENV CLIENT_ID=${CLIENT_ID}
ENV REGISTERED_SERVER_HASH=${REGISTERED_SERVER_HASH}
ENV NODE_ENV=production
ENV DEPLOYMENT_MODE=SELF_HOSTED

# Copy ONLY built artifacts (no source code)
COPY --from=builder /app/.output ./
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma/commercial/migrations.encrypted.json ./migrations.encrypted.json

# Startup script
COPY docker/entrypoint-commercial.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server/index.mjs"]
```

**Build Script for Each Client:**
```bash
#!/bin/bash
# scripts/build-client-image.sh

CLIENT_ID=$1
LICENSE_KEY=$2
SERVER_INFO=$3          # Server details from contract (hostname, IP, etc.)
LICENSE_EXPIRES_AT=$4   # empty = perpetual
SUPPORT_EXPIRES_AT=$5   # empty = no support

# Generate server hash from provided server info
SERVER_HASH=$(echo -n "${SERVER_INFO}" | sha256sum | awk '{print $1}')

echo "Building for client: ${CLIENT_ID}"
echo "Server hash: ${SERVER_HASH}"

# Build with embedded license + server binding
docker build \
  --build-arg LICENSE_KEY="${LICENSE_KEY}" \
  --build-arg LICENSE_EXPIRES_AT="${LICENSE_EXPIRES_AT}" \
  --build-arg SUPPORT_EXPIRES_AT="${SUPPORT_EXPIRES_AT}" \
  --build-arg CLIENT_ID="${CLIENT_ID}" \
  --build-arg REGISTERED_SERVER_HASH="${SERVER_HASH}" \
  -f Dockerfile.commercial \
  -t registry.yourcompany.com/start-pos:${CLIENT_ID}-v1.0.0 \
  .

# Push to registry
docker push registry.yourcompany.com/start-pos:${CLIENT_ID}-v1.0.0

# Save build metadata
cat > builds/${CLIENT_ID}-v1.0.0.json <<EOF
{
  "clientId": "${CLIENT_ID}",
  "licenseKey": "${LICENSE_KEY}",
  "serverHash": "${SERVER_HASH}",
  "serverInfo": "${SERVER_INFO}",
  "builtAt": "$(date -Iseconds)",
  "image": "registry.yourcompany.com/start-pos:${CLIENT_ID}-v1.0.0"
}
EOF

echo "✅ Image built for ${CLIENT_ID}"
echo "📦 Image: registry.yourcompany.com/start-pos:${CLIENT_ID}-v1.0.0"
echo "🔐 Server hash: ${SERVER_HASH}"
```

**Usage:**
```bash
# Build for Acme Corp (perpetual license)
./scripts/build-client-image.sh \
  "acme-corp" \
  "SPOS-ABC12345-PERP-4F9A-D3E8B2C7A1F6" \
  "hostname:acme-pos-01|ip:192.168.1.100" \
  "" \
  "2027-08-25"

# Update build (bugfix) - SAME license, SAME server hash
./scripts/build-client-image.sh \
  "acme-corp" \
  "SPOS-ABC12345-PERP-4F9A-D3E8B2C7A1F6" \
  "hostname:acme-pos-01|ip:192.168.1.100" \
  "" \
  "2027-08-25"
# Client runs: docker-compose pull && docker-compose up -d
```

**Server Migration (New Build Required):**
```bash
# Client changed servers - rebuild with NEW server hash
./scripts/build-client-image.sh \
  "acme-corp" \
  "SPOS-ABC12345-PERP-4F9A-D3E8B2C7A1F6" \
  "hostname:acme-pos-02|ip:192.168.1.200" \  # NEW server info
  "" \
  "2027-08-25"
```

### 7.2 Docker Compose (Client-Facing)

```yaml
# docker-compose.yml (what clients receive)
# All-in-one package: App + Database + Adminer (optional)
version: '3.8'

services:
  app:
    # Each client gets a unique image with license embedded
    image: registry.yourcompany.com/start-pos-enterprise:acme-corp-v1.0.0
    ports:
      - "3000:3000"
    environment:
      # License is EMBEDDED in image (not in .env)
      # LICENSE_KEY, LICENSE_EXPIRES_AT, SUPPORT_EXPIRES_AT are baked in
      
      # Required - Database
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: startpos
      
      # Required - App
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      CANONICAL_URL: ${CANONICAL_URL}
      
      # Optional - Email
      ENABLE_EMAIL_VERIFICATION: false
      EMAIL_FROM: ${EMAIL_FROM:-noreply@yourdomain.com}
      
    depends_on:
      - db
    restart: unless-stopped
    
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: startpos
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"  # Exposed for Adminer access
    restart: unless-stopped
  
  # Optional: Adminer for database viewing (FUTURE FEATURE)
  # Uncomment to enable - provides web-based DB access
  # adminer:
  #   image: adminer:latest
  #   ports:
  #     - "8080:8080"
  #   environment:
  #     ADMINER_DEFAULT_SERVER: db
  #     # Adminer connects with read-only user (see docs)
  #   depends_on:
  #     - db
  #   restart: unless-stopped

volumes:
  postgres_data:
```

**Notes:**
- **License is baked into app image** (not in docker-compose or .env)
- **Database included** in docker-compose for all-in-one deployment
- **Adminer commented out** by default (future feature for advanced users)
- Each client gets **unique image tag** (e.g., `acme-corp-v1.0.0`)

### 7.3 Client Configuration (.env)

```bash
# .env (minimal configuration exposed to clients)
# NOTE: License is NOT in .env - it's embedded in the Docker image

# Database
POSTGRES_USER=startpos
POSTGRES_PASSWORD=change-this-password
POSTGRES_DB=startpos

# Application
CANONICAL_URL=https://pos.yourcompany.com
BETTER_AUTH_SECRET=generate-with-openssl-rand-hex-32

# Optional
EMAIL_FROM=noreply@yourcompany.com
ENABLE_EMAIL_VERIFICATION=false
```

**Important:** No `LICENSE_KEY` in .env - it's baked into their Docker image at build time.

### 7.4 Deployment Documentation (Client-Facing)

```markdown
# START-POS Enterprise - Deployment Guide

## Prerequisites
- Docker & Docker Compose installed
- Linux server (Ubuntu 22.04+ recommended)
- 2 GB RAM minimum
- 20 GB disk space

## Quick Start

1. **Pull Docker Image**
   ```bash
   docker login registry.yourcompany.com
   docker pull registry.yourcompany.com/start-pos-enterprise:v1.0.0
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env and set LICENSE_KEY (provided separately)
   nano .env
   ```

3. **Generate Secrets**
   ```bash
   openssl rand -hex 32  # Use output for BETTER_AUTH_SECRET
   ```

4. **Start Services**
   ```bash
   docker-compose up -d
   ```

5. **Access Application**
   Navigate to: http://localhost:3000

## License & Deployment Validation

Your license is **embedded in the Docker image** and bound to your server.

**First Deployment:**
- Application validates with license server (requires internet)
- Verifies deployment is on authorized server
- One-time validation - subsequent restarts work offline

**Subsequent Restarts:**
- Works completely offline
- No internet connection required

**If License/Support Expires:**
- Application will show notification
- Contact us for updated Docker image
- Same license, updated expiration dates

**Server Change/Migration:**
- Contact us BEFORE migrating to new server
- We'll provide new build registered for new server
- Old build will stop working (server mismatch)

**Updates & Bug Fixes:**
You have two options:

**Manual Updates:**
- Contact us when you need updates
- We provide new Docker image (same license, new code)
- Run: `docker-compose pull && docker-compose up -d`

**Automatic Updates (Optional):**
- Set up webhook automation
- New versions pulled automatically
- Updates applied on restart
- Contact us for webhook setup instructions

## Support

- Email: enterprise-support@yourcompany.com
- Documentation: https://docs.yourcompany.com/self-hosted
- License Issues: https://license.yourcompany.com/support
```

---

## 8. Security Measures

### 8.1 Code Protection Layers

| Layer | Technique | Protection Level |
|-------|-----------|------------------|
| 1. Obfuscation | Variable/function name mangling | Medium |
| 2. Control Flow | Flattening, dead code injection | Medium |
| 3. String Encryption | Base64 encoding of strings | Low-Medium |
| 4. Minification | Remove whitespace, comments | Low |
| 5. No Source Maps | Prevent reverse mapping | High |
| 6. Docker Distribution | No source code included | High |

**Combined**: Medium-High protection against casual reverse engineering

### 8.2 Database Protection

| Protection | Implementation |
|------------|----------------|
| Schema Stripping | Billing tables never created |
| Encrypted Migrations | AES-256 encryption |
| Limited Privileges | Read-only on most tables |
| No Schema Tools | pgAdmin/Adminer not included |
| Audit Logging | Track all schema queries |

### 8.3 License Protection

| Measure | Purpose |
|---------|---------|
| RSA-2048 Signature | Prevent key forgery |
| Hardware Binding | Limit to single deployment |
| Online Validation | Detect revoked licenses |
| Offline Grace (30d) | Allow temporary disconnection |
| Rate Limiting | Prevent brute force attacks |

### 8.4 Anti-Tampering

```typescript
// Integrity check on startup
const CRITICAL_FILES = [
  'server/index.mjs',
  'node_modules/@prisma/client/index.js',
];

export async function verifyIntegrity() {
  const expectedChecksums = JSON.parse(process.env.FILE_CHECKSUMS || '{}');
  
  for (const file of CRITICAL_FILES) {
    const content = fs.readFileSync(file);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    
    if (checksum !== expectedChecksums[file]) {
      throw new Error(`Integrity check failed: ${file} may be tampered`);
    }
  }
}
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Set up commercial build infrastructure

- [ ] Create `prisma/commercial/` directory structure
- [ ] Write schema stripping script (`build-commercial-schema.ts`)
- [ ] Design License table schema
- [ ] Write migration encryption script (`encrypt-migrations.ts`)
- [ ] Test schema generation pipeline
- [ ] Verify all billing tables excluded

**Deliverables**:
- Commercial Prisma schema generation working
- Encrypted migrations output
- License table defined

---

### Phase 2: Code Stripping (Week 2-3)
**Goal**: Remove billing features from commercial builds

- [ ] Create Vite plugin (`vite-plugin-strip-billing.ts`)
- [ ] Configure obfuscation pipeline
- [ ] Add commercial build script to package.json
- [ ] Remove Stripe imports/integrations
- [ ] Strip billing UI components
- [ ] Update router config (remove /billing routes)
- [ ] Test commercial build output

**Deliverables**:
- Working commercial build command
- Verification that billing code is absent
- Obfuscated JavaScript bundles

---

### Phase 3: License System (Week 3-4)
**Goal**: Implement license generation and validation

**Your Infrastructure**:
- [ ] Create license server (Node.js API)
- [ ] Build license generation admin UI
- [ ] Implement validation endpoint
- [ ] Add hardware fingerprint verification
- [ ] Create revocation mechanism
- [ ] Set up license database (separate)

**Client-Side**:
- [ ] Create `EmbeddedLicense` class
- [ ] Implement online validation
- [ ] Implement offline validation (30-day grace)
- [ ] Add license middleware
- [ ] Create license activation UI
- [ ] Build license status page

**Deliverables**:
- License server API deployed
- Admin panel for generating licenses
- Client validation working (online + offline)

---

### Phase 4: Entitlement Rewrite (Week 4-5)
**Goal**: Replace subscription engine with license engine

- [ ] Create `CommercialEntitlementEngine`
- [ ] Update `auth-server.ts` to use license context
- [ ] Replace subscription checks with license checks
- [ ] Update capability evaluation logic
- [ ] Remove usage counter dependencies
- [ ] Remove credit ledger dependencies
- [ ] Test feature gating with licenses

**Deliverables**:
- Entitlement system working with licenses
- All features properly gated
- No subscription code dependencies

---

### Phase 5: Docker Distribution (Week 5-6)
**Goal**: Package for deployment

- [ ] Create commercial Dockerfile
- [ ] Create entrypoint script with license check
- [ ] Set up private Docker registry
- [ ] Create docker-compose.yml for clients
- [ ] Write deployment documentation
- [ ] Create .env.example for clients
- [ ] Build deployment guide PDF

**Deliverables**:
- Docker image builds successfully
- Registry push/pull working
- Complete client deployment package

---

### Phase 6: Testing & Hardening (Week 6-7)
**Goal**: Verify security and functionality

- [ ] Test fully offline deployment (30-day grace)
- [ ] Verify billing tables don't exist in schema
- [ ] Attempt to access billing routes (should 404)
- [ ] Test license validation edge cases
- [ ] Test hardware migration scenarios
- [ ] Verify obfuscation effectiveness
- [ ] Load testing
- [ ] Security audit
- [ ] Documentation review

**Deliverables**:
- Test results document
- Security audit report
- Deployment checklist

---

### Phase 7: Launch (Week 7-8)
**Goal**: First client deployment

- [ ] Generate first production license
- [ ] Deploy license server to production
- [ ] Package commercial build
- [ ] Push to Docker registry
- [ ] Provide deployment package to first client
- [ ] Assist with deployment
- [ ] Monitor license validation logs
- [ ] Gather feedback
- [ ] Create support runbook

**Deliverables**:
- First client successfully deployed
- Support processes established
- Feedback incorporated

---

## 10. Pricing Models

### **SELECTED: Contract-Based Perpetual (Fully Unlimited)**

**Structure**:
- **One-time perpetual license fee**: Negotiated per contract
- **All features included**: No tiers, no limits
- **Unlimited users, branches, transactions**
- **All updates included forever**
- **Base email support included**

**Pricing Philosophy**:
Perpetual license pricing is **variable and negotiated** based on:
- Client size (number of locations, expected transaction volume)
- Industry/use case (retail, F&B, wholesale, etc.)
- Geographic region
- Competitive landscape
- Strategic value of the deal
- Whether managed services are included

**Typical Price Ranges** (for internal reference only):
- Small business (1-3 locations): $8,000 - $15,000
- Medium business (4-10 locations): $15,000 - $30,000
- Large enterprise (10+ locations): $30,000 - $100,000+
- Strategic/anchor clients: Custom pricing

**Each deal includes a formal contract** outlining:
- Perpetual license fee (one-time)
- Optional annual support fee (if applicable)
- Optional managed service fee (if applicable)
- Update/upgrade rights
- Hardware migration policy
- Support level and SLA
- Payment terms

**Optional Add-Ons (Also Negotiable)**:
- **Annual Support Contract**: Starting at $3,000/year
  - Priority support (4-hour response)
  - Phone/video support
  - Security patches guaranteed
  - Version upgrade assistance
  - Price typically 20-30% of license fee
  
- **Managed Service**: $500-2,000/month
  - DevOps maintenance (your team manages their deployment)
  - 99.5% uptime SLA
  - Monitoring & alerting
  - Backup management
  - Security patching
  - Priced based on complexity and commitment level

**Comparison to SaaS** (Example: $15k license):
- SaaS Top Tier: ~$400/month = $4,800/year
- Perpetual ROI: Pays for itself in 3.1 years
- Client saves $4,800/year after year 3
- Higher upfront investment, but no recurring fees

**Value Proposition**:
- "One-time investment, perpetual ownership"
- "Pricing tailored to your business size"
- "No monthly bills, no surprises"
- "Your data, your infrastructure, your control"
- "No artificial limits - grow as much as you need"

**Best For**: 
- Mid-to-large businesses wanting long-term ownership
- Companies with compliance requirements (data sovereignty)
- Businesses in regions with poor internet connectivity
- Clients who want predictable costs
- Strategic partnerships

---

### Why Single-Tier Unlimited Works

**Simplicity**:
- No confusing tier comparisons
- Easy sales process
- Clear value proposition

**Lower Support Burden**:
- No "upgrade to Pro for this feature" conversations
- No limit enforcement to troubleshoot
- No tier migration headaches

**Competitive Advantage**:
- Most competitors still tier self-hosted
- "Truly unlimited" is a strong differentiator

**Future Revenue**:
- Annual support renewals provide recurring revenue
- Managed service option for ongoing engagement
- Major version upgrades (v2.0, v3.0) can be paid upgrades

---

### Revenue Projections

**Conservative Scenario: 8-10 Deals/Year**

| Item | Annual Revenue (Range) |
|------|------------------------|
| Perpetual Licenses (avg $20k/deal) | $160,000 - $200,000 |
| Support Contracts (60% take rate) | $14,000 - $18,000 |
| Managed Services (30% take rate) | $18,000 - $36,000 |
| **Total Year 1** | **$192,000 - $254,000** |

**Year 2+ (Recurring Growth)**:
| Item | Annual Revenue (Range) |
|------|------------------------|
| New Licenses (8-10 deals) | $160,000 - $200,000 |
| Support Renewals (cumulative base) | $28,000 - $45,000 |
| Managed Services (cumulative base) | $36,000 - $72,000 |
| **Total Year 2** | **$224,000 - $317,000** |

**Notes**:
- Actual revenue varies based on deal size negotiation
- Large enterprise deals ($50k+) significantly boost annual revenue
- Recurring support + managed service creates predictable income stream
- By Year 3: Recurring revenue offsets perpetual development costs

---

## 11. Client Comparison Matrix

### What Clients Can and Cannot See

| Item | Self-Managed Client | Managed Service Client | SaaS Customer |
|------|---------------------|------------------------|---------------|
| **Source Code** | ❌ No (obfuscated) | ❌ No (obfuscated) | ❌ No |
| **Database Schema** | ❌ Hidden (via app only) | ✅ Full (you have access) | ❌ No access |
| **Database Direct Access** | ❌ None (by default) | ✅ Full (you manage it) | ❌ None |
| **Billing/Subscription Tables** | ❌ Don't exist | ❌ Don't exist | ✅ Exist (hidden from users) |
| **Stripe Integration** | ❌ Not included | ❌ Not included | ✅ Included |
| **Prisma Schema Files** | ❌ Not included | ❌ Not included | ❌ Not accessible |
| **Migrations** | ⚠️ Encrypted | ⚠️ Encrypted (you run them) | ✅ Auto-applied |
| **Infrastructure** | ✅ Client owns | ✅ Client owns (you maintain) | ❌ You own |
| **Updates** | ⚠️ Manual pull | ✅ You deploy | ✅ Automatic |
| **Feature Limits** | ✅ Unlimited | ✅ Unlimited | ⚠️ Plan-based |
| **Support** | Email only | Priority | Standard |
| **Cost Model** | One-time (negotiated) + optional support | One-time (negotiated) + monthly DevOps | Monthly subscription |

---

## 12. Maintenance & Support Strategy

### Update Distribution

**Versioning**: Semantic versioning (v1.2.3)
- Major: Breaking changes (require re-activation)
- Minor: New features (optional update)
- Patch: Bug fixes (recommended update)

**Delivery**:
1. Build new commercial Docker image
2. Push to registry with version tag
3. Notify clients via license server API
4. Clients pull and restart: `docker-compose pull && docker-compose up -d`

**Notification Mechanism**:
```typescript
// Client checks for updates daily
async function checkForUpdates() {
  const response = await fetch(`${LICENSE_SERVER_URL}/api/check-updates`, {
    method: 'POST',
    body: JSON.stringify({
      licenseKey: process.env.LICENSE_KEY,
      currentVersion: APP_VERSION,
    }),
  });
  
  const { updateAvailable, latestVersion, updateRequired } = await response.json();
  
  if (updateRequired) {
    // Critical security update
    showAdminAlert('Critical update required - application will stop in 7 days');
  } else if (updateAvailable) {
    showAdminNotification(`Update available: v${latestVersion}`);
  }
}
```

### Support Tiers

**Email Support** (All Tiers):
- Response time: 48 hours
- Business hours only
- Non-critical issues

**Priority Support** (With Annual Support):
- Response time: 4 hours
- 24/7 availability
- Phone support
- Screen sharing sessions

**On-Site Support** (Enterprise Add-On):
- Deployment assistance
- Training
- Custom integrations
- Dedicated account manager

---

## 13. Risk Mitigation

### Risk: Reverse Engineering

**Mitigation**:
- Multi-layer obfuscation
- No source maps
- Critical logic in separate modules
- Legal agreements (EULA)
- Monitoring for piracy

**Acceptable**: Obfuscation deters casual attempts, not nation-state actors

---

### Risk: License Sharing / Unauthorized Distribution

**Mitigation**:
- Server binding on first deployment (validates actual server matches contract)
- Each build only works on registered server
- Deployment validation logged on your license server
- Strict EULA terms prohibiting redistribution
- Audit rights in contract

**Detection**:
```typescript
// License server detects unauthorized deployments
async function detectUnauthorizedDeployments(licenseId: string) {
  const events = await licenseDB.getEvents(licenseId, 'DEPLOYMENT_SERVER_MISMATCH');
  
  if (events.length > 0) {
    // Build deployed on wrong server - possible redistribution
    await alertTeam({
      type: 'UNAUTHORIZED_DEPLOYMENT_ATTEMPT',
      licenseKey: events[0].licenseKey,
      attempts: events.length,
      companyName: license.companyName,
      note: 'Client attempted to deploy build on unauthorized server',
    });
  }
}
```

**Response Options**:
1. **Alert detected:** Email client: "We noticed deployment on unauthorized server..."
2. **Manual review:** Determine if legitimate server change or abuse
3. **Legitimate change:** Generate new build with updated server binding
4. **Confirmed abuse:** Revoke registry credentials + legal action

**Server Change Process (Legitimate)**:
```
Client: "We're migrating to new server at 192.168.2.100"
You: "OK, we'll build new version for new server"
You: Build with new server hash → client deploys
Old build: Stops working (wrong server)
New build: Works on new server
```

**Philosophy**: Server binding prevents redistribution while allowing legitimate server migrations through controlled rebuild process.

---

### Risk: Database Schema Exposure

**Mitigation**:
- Encrypted migrations (never decrypted to disk)
- No Prisma schema files included
- Application-managed database (clients don't need direct access)
- No admin tools (pgAdmin) included in Docker image

**Reality**: 
- Determined users with database access can inspect schema
- But billing/payment logic doesn't exist in commercial builds
- License table exists but is just one simple table
- If they reverse-engineer schema, they only see POS tables (products, transactions, etc.)

**Acceptable Risk**: Schema exposure of core POS tables is low-impact since billing logic is completely removed

---

### Risk: Update Distribution Compromise

**Mitigation**:
- Docker image signatures
- Checksum verification on startup
- Secure registry (credentials required)
- HTTPS-only downloads
- Integrity checks before execution

---

### Risk: Support Burden

**Mitigation**:
- Comprehensive documentation
- Self-service license portal
- Standard deployment package (Docker)
- Automated diagnostics script
- Community forum (enterprise clients only)

**Pricing**: Support cost built into annual support fee

---

## 14. Success Metrics

### Technical Metrics
- [ ] Commercial build completes without errors
- [ ] Zero billing tables in commercial schema
- [ ] License validation < 500ms (online)
- [ ] License validation < 10ms (offline)
- [ ] Docker image size < 500MB
- [ ] Startup time < 10 seconds
- [ ] Zero billing code in obfuscated bundles

### Business Metrics
- [ ] First client deployed successfully
- [ ] < 5% support tickets related to licensing
- [ ] < 1% license validation failures
- [ ] 90%+ clients renew support (if applicable)
- [ ] < 24 hour deployment time (for clients)

### Security Metrics
- [ ] Zero license sharing incidents
- [ ] Zero schema exposure incidents
- [ ] Zero unauthorized access attempts
- [ ] 100% license validation uptime

---

## 15. Next Steps

### Immediate Actions (Next Sprint)
1. ✅ **Product decisions finalized** (see resolved decisions in Section 15.1)
2. **Review this plan** with technical team
3. **Set up project structure**: `prisma/commercial/`, `scripts/`
4. **Create Phase 1 tasks** in project management tool
5. **Assign ownership** for each phase
6. **Draft EULA** (no trial, no refunds after activation, no source escrow)

---

### 15.1 Finalized Product Decisions

These decisions are **locked** and drive the implementation:

#### Licensing Model
✅ **Contract-based perpetual**: Negotiated pricing, fully unlimited
- Price varies per deal (typically $8k-$100k+)
- No feature tiers (Starter/Pro/Enterprise)
- No user/branch limits
- No transaction caps
- All features unlocked
- Formal contract for each client

#### Trial Policy
✅ **No self-hosted trials** — clients must:
1. Try SaaS version first (14-30 day free trial)
2. If satisfied, buy perpetual license ($15,000)
3. Receive Docker image after payment confirmed

**Rationale**:
- Self-hosted trial = complex (unique Docker images per trial)
- Risk of trial abuse (spin up, export data, cancel)
- SaaS trial proves product value
- $15k purchase requires commitment

**Sales Process**:
```
Prospect → SaaS Trial (free) → Decides to self-host → 
Sales Discussion (scope, size, needs) → Contract Negotiation → 
Contract Signed + Payment → License Generated → 
Receives Docker image + license key
```

---

#### Hardware Migration Policy
✅ **Unlimited migrations allowed** (logged, not blocked)

**Implementation**:
- Each server change triggers fingerprint update
- All migrations logged with timestamp + old/new fingerprint
- Alert your team after 10 migrations (review for abuse)
- Never auto-block legitimate migrations

**Scenarios Supported**:
- Cloud auto-scaling (new instances)
- Disaster recovery testing
- Infrastructure upgrades
- Data center migrations
- Dev/staging/production environments

**Abuse Detection**:
- Monitor validation patterns (1000+ req/day from different IPs)
- Flag simultaneous activations from different continents
- Manual review before revoking license
- Contact client before any enforcement action

**Philosophy**: Trust clients, verify when suspicious, enforce only after confirmation

---

#### Source Code Escrow
✅ **Never provide source code, even in escrow**

**Rationale**:
- Source code is your core IP
- Obfuscated distribution is the product
- No exceptions, even for $1M+ contracts

**Client Concerns (Objections Handling)**:

**"What if your company shuts down?"**
- Response: "License server has 30-day offline grace period. If we shut down, we'll publish a license override patch that removes online validation checks, allowing your application to run indefinitely without our servers."
- Emergency exit plan: Release a "standalone mode" patch that:
  - Disables license validation
  - Allows perpetual operation
  - Published if company dissolves

**"What if we need critical bug fixes and you're gone?"**
- Response: "Perpetual licenses include all updates forever. If we cease operations, the last version you received continues working. You can maintain/patch the Docker container yourself or hire another firm to support it."

**"Our legal team requires source escrow for vendor risk management"**
- Response: "We don't provide source code in any form. Our product is the compiled application. If source escrow is a hard requirement, our self-hosted option may not be the right fit. Consider our SaaS offering or other vendors."

**Alternative Offering (If Needed)**:
- **Managed Service Contract** ($500-2k/month): We maintain their deployment, reducing their vendor risk
- **SaaS with SLA**: 99.9% uptime, data export tools, vendor lock-in concerns addressed

---

#### What Gets Documented in Contracts

**Perpetual License Agreement Must Include**:

1. **No Trial Period**
   - License purchase is final after activation
   - No refunds after Docker image is downloaded
   - Recommend SaaS trial before purchase

2. **Unlimited Use Rights**
   - Unlimited users, branches, transactions
   - All features included
   - No artificial caps or limitations

3. **Hardware Migrations**
   - Unlimited server changes allowed
   - Each migration must validate with license server
   - Excessive migrations may trigger audit (manual review only)
   - Abuse confirmed = license revocation + legal action

4. **No Source Code**
   - Product is delivered as compiled Docker image
   - No source code provided in any circumstance
   - No escrow arrangements offered

5. **Support Terms**
   - Base license: Email support only
   - Optional: Annual support contract ($3k/year) for priority support + updates
   - Support expiration does not disable software

6. **Update Rights**
   - All updates included forever (even without support contract)
   - Major version upgrades (v2.0, v3.0) may be paid upgrades
   - Security patches always free

7. **Managed Service Option**
   - Optional: Monthly DevOps maintenance ($500-2k/month, negotiated)
   - You maintain their deployment on their infrastructure
   - Client retains data and infrastructure ownership
   - Either party can terminate with 30-day notice
   
8. **Pricing**
   - Perpetual license fee is negotiated per contract
   - Based on client size, use case, and strategic value
   - Support and managed service fees also negotiable
   - No public pricing - all deals are custom

### Pre-Development Checklist
- [ ] Legal review of EULA
- [ ] Infrastructure planning for license server
- [ ] Domain/subdomain for license server
- [ ] Private Docker registry setup
- [ ] RSA key pair generation
- [ ] Encryption keys generated
- [ ] License database provisioned

### Questions to Resolve
1. ✅ **Pricing model**: Contract-based, negotiated per deal (no fixed public pricing)
2. ✅ **Support tiers**: Optional, negotiated per contract (starting ~$3k/year)
3. ✅ **Managed service**: Optional, negotiated per contract ($500-2k/month)
4. ✅ **Database access**: None by default; full access only for managed service clients
5. ✅ **Trial licenses for self-hosted**: No — SaaS trial only, then contract + purchase
6. ✅ **Hardware migration policy**: Unlimited migrations (logged/flagged for review, not blocked)
7. ✅ **License server downtime**: 30-day offline grace period (sufficient for most scenarios)
8. ✅ **Source code escrow**: No — never hand over source, even in escrow
9. ⏳ Multi-region deployment for license server? (Start with single region, add if >100 clients)

---

## Appendix A: File Structure

```
web/
├── prisma/
│   ├── base/                    # SaaS schema (full)
│   │   ├── _generator.prisma
│   │   ├── billing.prisma       # ❌ Excluded from commercial
│   │   ├── operations.prisma
│   │   └── ...
│   ├── commercial/              # 🆕 Commercial build output
│   │   ├── schema.prisma        # Generated (billing stripped, no license model)
│   │   └── migrations.encrypted.json
│   └── migrations/              # Raw migrations (SaaS)
├── scripts/
│   ├── build-commercial-schema.ts    # 🆕 Schema stripper
│   ├── encrypt-migrations.ts         # 🆕 Migration encryptor
│   └── package-commercial.ts         # 🆕 Full packaging
├── src/
│   ├── lib/
│   │   ├── billing/             # ❌ Excluded from commercial
│   │   ├── licensing/           # 🆕 License validation (commercial)
│   │   │   ├── license-client.ts
│   │   │   └── license-types.ts
│   │   ├── entitlement/
│   │   │   ├── entitlement-engine.ts          # SaaS version
│   │   │   └── entitlement-engine-commercial.ts # 🆕 Commercial version
│   │   └── deployment/          # 🆕 Deployment utils
│   │       ├── schema-setup.ts
│   │       └── run-migrations.ts
│   ├── routes/
│   │   └── (private)/
│   │       ├── billing.tsx       # ❌ Excluded from commercial
│   │       └── license/          # 🆕 License UI (commercial)
│   │           └── status.tsx
│   └── middleware/
│       └── license-check.ts      # 🆕 License validation middleware
├── docker/
│   ├── Dockerfile                # SaaS build
│   ├── Dockerfile.commercial     # 🆕 Commercial build
│   └── entrypoint-commercial.sh  # 🆕 Commercial startup
├── vite-plugin-strip-billing.ts  # 🆕 Build-time stripping
├── vite.config.ts                # SaaS config
└── vite.config.commercial.ts     # 🆕 Commercial config (obfuscation)
```

---

## Appendix B: Environment Variables

### SaaS Build (.env)
```bash
DEPLOYMENT_MODE=SAAS
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
# ... all billing vars
```

### Commercial Build (.env - Client-Facing)
```bash
DEPLOYMENT_MODE=SELF_HOSTED
LICENSE_KEY=SPOS-ABC12345-PERP-4F9A-D3E8B2C7A1F6
LICENSE_SERVER_URL=https://license.yourcompany.com  # Hardcoded in image
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=startpos
POSTGRES_PASSWORD=xxx
POSTGRES_DB=startpos
CANONICAL_URL=https://pos.client.com
BETTER_AUTH_SECRET=xxx
# NO Stripe variables
# NO billing variables
```

---

## Appendix C: License Server Infrastructure

### Tech Stack
- **API**: Node.js + Express or Fastify
- **Database**: PostgreSQL (separate from client DBs)
- **Hosting**: Your cloud (AWS, Azure, Vercel, Railway)
- **Domain**: `license.yourcompany.com`

### Database Schema (Your License Server)
```prisma
model CommercialLicense {
  id                  String   @id @default(cuid())
  licenseKey          String   @unique
  
  clientId            String
  companyName         String
  contactEmail        String
  
  licenseType         String   // PERPETUAL, PERPETUAL_WITH_SUPPORT
  deploymentMode      String   // SELF_MANAGED, MANAGED_SERVICE
  
  // Server binding
  registeredServerInfo  String   // Server details from contract
  registeredServerHash  String   // SHA-256 hash of server info
  deployedAt            DateTime? // When first deployed
  deployedServerHash    String?  // Actual server hash on deployment
  
  // No feature/limit fields - all licenses are unlimited
  
  issuedAt            DateTime
  expiresAt           DateTime? // Always null for perpetual
  supportExpiresAt    DateTime? // Only for PERPETUAL_WITH_SUPPORT
  
  status              String   // INACTIVE, ACTIVE, REVOKED
  revokedAt           DateTime?
  revokedReason       String?
  
  events              LicenseEvent[]
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model LicenseEvent {
  id                  String   @id @default(cuid())
  licenseId           String
  license             CommercialLicense @relation(fields: [licenseId], references: [id])
  
  eventType           String   // ISSUED, DEPLOYMENT_VALIDATED, DEPLOYMENT_SERVER_MISMATCH, REVOKED, SUPPORT_RENEWED, SERVER_CHANGED
  
  serverHash          String?  // Server hash involved in event
  expectedHash        String?  // For mismatch events
  actualHash          String?  // For mismatch events
  
  note                String?
  triggeredBy         String?  // admin userId or "system"
  
  createdAt           DateTime @default(now())
  
  @@index([licenseId, createdAt])
  @@index([licenseId, eventType])
}

model LicenseValidation {
  id                  String   @id @default(cuid())
  licenseId           String
  license             CommercialLicense @relation(fields: [licenseId], references: [id])
  
  timestamp           DateTime @default(now())
  ipAddress           String?
  userAgent           String?
  version             String
  
  hardwareFingerprint String
  
  isValid             Boolean
  errorMessage        String?
  
  @@index([licenseId, timestamp])
}
```

---

## Document Version

**Version**: 1.5  
**Date**: 2026-08-25  
**Author**: Development Team  
**Status**: ✅ **APPROVED - Ready for Implementation**

**Change Log**:
- v1.0 (2026-08-25): Initial draft with tiered licensing
- v1.1 (2026-08-25): Major updates (single-tier unlimited, managed service mode)
- v1.2 (2026-08-25): Final product decisions locked (trials, migrations, escrow)
- v1.3 (2026-08-25): Pricing model finalized (contract-based, negotiated)
- v1.4 (2026-08-25): License architecture finalized (embedded in Docker build, no DB table)
- v1.5 (2026-08-25): **Consistency fixes — leftover sections updated to match v1.4's embedded license architecture:**
  - ✅ Fixed 5.5 middleware — no longer does a blocking online check with redirect-on-failure; license is validated once at startup (5.3), request middleware just reads the result
  - ✅ Removed `license.prisma` generation from schema builder (2.4A, 6.2) and file structure (Appendix A) — no license table is added to the client DB, per 2.3
  - ✅ Fixed Appendix B example `LICENSE_KEY` to use the current key format (`PERP`, no feature tier) instead of the old tiered format
  - ✅ Updated checklist to build `EmbeddedLicense`, not the old `LicenseClient`
  - ✅ Updated executive summary to describe the embedded/offline-first model instead of the old online-first one

**Next Review**: After Phase 1 completion (schema stripping + build script)

---

**END OF DOCUMENT**