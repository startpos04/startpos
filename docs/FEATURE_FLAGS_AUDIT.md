# Feature Flags Architecture Audit & Recommendations

**Date:** 2026-08-21  
**Status:** ✅ APPROVED DESIGN  
**Purpose:** Final architecture document - Ready for implementation

---

## 🎯 APPROVED ARCHITECTURE (Updated)

### Decision Made:
- **DROP:** SystemConfig table for feature flags
- **KEEP:** Capabilities (Business-level) + Entitlements (Branch-level)
- **No migration needed:** Fresh start, no real data yet

### Two-Layer System:

```
┌────────────────────────────────────────────────┐
│  CAPABILITY (Business Level)                   │
│  Controls: Entire module enable/disable        │
│  Controlled by: Subscription plan              │
└────────────────┬───────────────────────────────┘
                 │
                 │ CASCADE DISABLE
                 │
                 ▼
┌────────────────────────────────────────────────┐
│  ENTITLEMENT (Branch Level)                    │
│  Controls: Per-branch settings & toggles       │
│  Controlled by: Branch admin                   │
└────────────────────────────────────────────────┘
```

**Rule:** If Capability is DISABLED → All branch entitlements are disabled (cascade)

---

## 📊 NEW ARCHITECTURE

### 1. TWO-LAYER SYSTEM

#### Layer 1: **Capability** (Business Level)
- **Location:** `business_capability_states` table
- **Scope:** Business-wide
- **Purpose:** Subscription/plan-based module access
- **States:** ENABLED, DISABLED (simplified from 6 states)
- **Controlled by:** Subscription plan
- **Examples:** `ORDER_QUEUE`, `CASH_RECONCILIATION`, `INVENTORY_TRACKING`

**What it controls:**
- Entire module/feature availability
- Subscription tier requirements
- API access for the feature

#### Layer 2: **Entitlement** (Branch Level)
- **Location:** `branch_entitlements` table (NEW)
- **Scope:** Per-branch
- **Purpose:** Branch-specific settings and toggles
- **Controlled by:** Branch admin (if capability is enabled)
- **Examples:** Print receipt settings, order queue limits, cash drawer config

**What it controls:**
- Per-branch enable/disable
- Feature-specific settings (max orders, auto-print, etc.)
- Branch customization

#### Removed: **SystemConfig** (Feature Flags)
- ❌ No more `ENABLE_ORDER`, `ENABLE_PRINT_RECEIPT`, etc.
- ❌ No more confusion between capability and config
- ✅ Clean separation: Capability = What, Entitlement = How

---

## ✅ HOW IT WORKS

### Clear Hierarchy & Rules

```
┌─────────────────────────────────────────────────────┐
│  CAPABILITY (Business Level)                        │
│  • Entire module enable/disable                     │
│  • Defines AVAILABLE entitlement settings           │
│  • Subscription-controlled                          │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ CASCADE CONTROL
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  ENTITLEMENT (Branch Level)                         │
│  • Per-branch enable/disable                        │
│  • Picks which entitlement settings to use          │
│  • Branch admin controlled                          │
└─────────────────────────────────────────────────────┘
```

**Concrete Example: ORDER_QUEUE Capability**

```typescript
// STEP 1: Define capability (platform level)
Capability {
  key: "ORDER_QUEUE",
  name: "Order Queue",
  description: "Create kitchen orders before payment",
  
  // Available entitlement settings this capability supports
  availableSettings: {
    maxActiveOrders: { type: "number", default: 100 },
    requireApproval: { type: "boolean", default: false },
    autoArchiveDays: { type: "number", default: 7 },
    allowMergeOrders: { type: "boolean", default: true },
    notificationSound: { type: "boolean", default: true }
  }
}

// STEP 2: Business enables capability
BusinessCapability {
  businessId: "biz-001",
  capabilityKey: "ORDER_QUEUE",
  state: "ENABLED" // ✅ Subscription includes this
}

// STEP 3: Branches choose their settings
BranchEntitlement {
  branchId: "branch-downtown",
  capabilityKey: "ORDER_QUEUE",
  isEnabled: true,
  
  // This branch wants these specific settings:
  settings: {
    maxActiveOrders: 50,        // Lower limit for small kitchen
    requireApproval: true,       // They want supervisor approval
    autoArchiveDays: 7,          // Default
    allowMergeOrders: false,     // Strict order separation
    notificationSound: true      // Default
  }
}

BranchEntitlement {
  branchId: "branch-mall",
  capabilityKey: "ORDER_QUEUE",
  isEnabled: true,
  
  // Different branch, different needs:
  settings: {
    maxActiveOrders: 200,        // High volume location
    requireApproval: false,      // Fast-paced, no approval needed
    autoArchiveDays: 3,          // Quick turnover
    allowMergeOrders: true,      // Allow merging for efficiency
    notificationSound: false     // Too noisy in mall
  }
}

BranchEntitlement {
  branchId: "branch-catering",
  capabilityKey: "ORDER_QUEUE",
  isEnabled: false,              // ❌ This branch doesn't use order queue
  settings: null                 // No settings needed
}
```

### Cascade Rules

```
Business Capability = ENABLED
    ├─ Branch Downtown: isEnabled=true, settings={...} → ✅ Works with custom settings
    ├─ Branch Mall: isEnabled=true, settings={...} → ✅ Works with different settings
    └─ Branch Catering: isEnabled=false → ❌ Disabled by branch choice

Business Capability = DISABLED
    ├─ Branch Downtown: isEnabled=true → ❌ CASCADE DISABLED (capability off)
    ├─ Branch Mall: isEnabled=true → ❌ CASCADE DISABLED (capability off)
    └─ Branch Catering: isEnabled=false → ❌ Already disabled
```

**Key Rules:**
1. **Capability defines WHAT settings are available** (not their values)
2. **Entitlement defines WHICH settings values to use** per branch
3. Capability MUST be ENABLED for any branch entitlement to work
4. Each branch can customize settings independently
5. If capability is DISABLED → all branch entitlements are ignored (cascade)

---

## 🗂️ NEW SCHEMA DESIGN

### Updated Schema

```prisma
// Platform-level: Capability definitions (what settings are available)
model Capability {
  key             String  @id // "ORDER_QUEUE", "CASH_RECONCILIATION"
  name            String  // "Order Queue", "Cash Drawer Reconciliation"
  description     String
  category        String  // "SALES", "INVENTORY", "REPORTING"
  
  // Subscription requirements
  requiresPlan    String? // null = all plans, "PRO", "ENTERPRISE"
  isOperational   Boolean @default(true) // Blocks on subscription lapse
  
  // Branch-level control
  allowBranchSettings Boolean @default(true) // Can branches customize this?
  
  // IMPORTANT: availableSettings defines SCHEMA, not values
  // This tells branches WHAT they can configure
  availableSettings Json? 
  // Example:
  // {
  //   "maxActiveOrders": { "type": "number", "default": 100, "min": 1, "max": 500 },
  //   "requireApproval": { "type": "boolean", "default": false },
  //   "autoArchiveDays": { "type": "number", "default": 7, "min": 1, "max": 90 }
  // }
  
  // Dependencies
  requiredCapabilities String[] @default([]) // Must have these capabilities first
  
  // Metadata
  sortOrder       Int     @default(0)
  isDeprecated    Boolean @default(false)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@map("capabilities")
}

// Business-level: Which capabilities are enabled (simple on/off)
model BusinessCapabilityState {
  id           String   @id @default(cuid())
  businessId   String
  business     Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  capabilityKey String  // Links to Capability.key
  
  // Simplified states: just ENABLED or DISABLED
  state        String   // "ENABLED" | "DISABLED"
  
  // When was it enabled/disabled
  enabledAt    DateTime?
  disabledAt   DateTime?
  
  // Who made the change
  changedBy    String?
  
  // Audit trail
  stateHistory Json?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([businessId, capabilityKey])
  @@index([businessId, state])
  @@map("business_capability_states")
}

// Branch-level: Which settings values to use
model BranchEntitlement {
  id            String   @id @default(cuid())
  branchId      String
  branch        Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  capabilityKey String   // Links to Capability.key
  
  // Branch-level enable/disable
  isEnabled     Boolean  @default(true)
  
  // Branch picks their setting VALUES (not schema)
  // Schema comes from Capability.availableSettings
  settings      Json?
  // Example (picks values for ORDER_QUEUE):
  // {
  //   "maxActiveOrders": 50,      // Branch chose 50
  //   "requireApproval": true,    // Branch chose true
  //   "autoArchiveDays": 7        // Branch kept default
  // }
  
  // Metadata
  enabledBy     String?
  enabledAt     DateTime?
  disabledAt    DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([branchId, capabilityKey])
  @@index([branchId])
  @@map("branch_entitlements")
}

// SIMPLIFIED: SystemConfig (keep only for localization & business settings)
// Remove all ENABLE_* keys - those move to Capabilities/Entitlements
enum ConfigKey {
  // Localization
  LOCALE,
  CURRENCY,
  
  // Business settings
  VAT_RATE,
  IS_VAT_REGISTERED,
  PRICE_CONFIGURATION,
  
  // Branch settings (non-feature)
  LOW_STOCK_THRESHOLD,
  BUFFER_RATE,
  AUTO_APPROVE_LOW_STOCK_REFILL,
  
  // Platform/billing (keep as-is)
  TRIAL_DURATION_DAYS,
  GRACE_PERIOD_DAYS,
  // ... other billing configs
}
```

---

## 🗂️ CAPABILITY CATALOG

### Core Sales Features

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `COMPLETE_CHECKOUT` | POS Checkout | All | No | - |
| `RECORD_PAYMENT` | Payment Methods | All | Yes | `{ "allowCash": true, "allowCard": true, "allowEwallet": true }` |
| `ORDER_QUEUE` | Order Queue | All | Yes | `{ "maxActiveOrders": 100, "requireApproval": false, "autoArchiveDays": 7 }` |
| `ORDER_TABS` | Table Management | All | Yes | `{ "tablePrefix": "T", "maxTables": 50, "allowMerge": true }` |
| `PRINT_RECEIPT` | Receipt Printing | All | Yes | `{ "autoPrint": false, "copies": 1, "showKitchenCopy": false }` |
| `ISSUE_REFUND` | Issue Refunds | All | Yes | `{ "requireApproval": true, "maxAmount": null, "allowPartial": true }` |

### Inventory & Operations

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `MANAGE_INVENTORY` | Inventory Tracking | All | Yes | `{ "lowStockAlert": 10, "autoReorder": false }` |
| `CREATE_PURCHASE` | Purchase Orders | All | Yes | `{ "requireApproval": true, "approvalThreshold": 10000 }` |
| `STOCK_TRANSFERS` | Stock Transfers | Pro+ | Yes | `{ "requireApproval": true }` |
| `BATCH_PREPARATION` | Batch Preparation | Pro+ | Yes | `{ "shelfLifeTracking": true, "wasteTracking": true }` |
| `CREATE_TASK` | Operational Tasks | All | Yes | `{ "autoApproveRefill": true, "requirePhotos": false }` |

### Financial & Cash Management

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `START_VENDOR_SESSION` | Cash Reconciliation | All | Yes | `{ "requireEndOfShift": true, "maxDiscrepancy": 100 }` |
| `EXPENSE_TRACKING` | Expense Tracking | Pro+ | No | - |
| `PETTY_CASH` | Petty Cash | Pro+ | Yes | `{ "maxAmount": 5000, "requireReceipt": true }` |

### Reporting & Analytics

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `VIEW_SALES_REPORTS` | Sales Reports | All | No | - |
| `VIEW_TRANSACTION_HISTORY` | Transaction History | All | No | - |
| `VIEW_INVENTORY_REPORTS` | Inventory Reports | All | No | - |
| `VIEW_ANALYTICS` | Analytics Dashboard | Enterprise | No | - |
| `CUSTOM_REPORTS` | Custom Reports | Enterprise | No | - |

### Customer & Loyalty

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `MANAGE_CUSTOMERS` | Customer Database | All | No | - |
| `LOYALTY_POINTS` | Loyalty Program | Pro+ | Yes | `{ "pointsPerPeso": 1, "redemptionRate": 1, "expiryDays": 365 }` |
| `CUSTOMER_CREDIT` | Customer Credit | Pro+ | Yes | `{ "maxCreditAmount": 10000, "requireApproval": true }` |

### Hardware & Integrations

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `BARCODE_SCANNING` | Barcode Scanner | All | No | - |
| `BLUETOOTH_PRINTER` | Bluetooth Printer | All | Yes | `{ "autoPairOnStartup": false }` |
| `CASH_DRAWER` | Cash Drawer | All | No | - |
| `KITCHEN_DISPLAY` | Kitchen Display | Pro+ | Yes | `{ "autoRefreshSeconds": 30, "soundAlert": true }` |
| `ACCESS_API` | API Access | Enterprise | No | - |

### Platform & Settings

| Capability Key | Name | Requires Plan | Branch Settings | Default Branch Settings |
|----------------|------|---------------|-----------------|------------------------|
| `MANAGE_PRODUCTS` | Product Catalog | All | No | - |
| `MANAGE_EMPLOYEES` | Employee Management | All | No | - |
| `MANAGE_SUPPLIERS` | Supplier Management | All | No | - |
| `MANAGE_SETTINGS` | Business Settings | All | No | - |
| `MANAGE_BRANCHES` | Multi-Branch | Pro+ | No | - |
| `MANAGE_BILLING` | Billing & Subscription | All | No | - |
| `AUDIT_LOGS` | Audit Trail | Enterprise | No | - |

---

## � IMPLEMENTATION PLAN

### Phase 1: Clean Up Schema (Week 1)

**1.1 Drop SystemConfig ENABLE_* keys**
```sql
-- Remove feature flag configs (keep localization & settings)
DELETE FROM system_config 
WHERE key IN (
  'ENABLE_ORDER',
  'ENABLE_ORDER_TAB',
  'ENABLE_PRINT_RECEIPT',
  'ENABLE_CASH_RECONCILIATION',
  'ENABLE_TASK'
);
```

**1.2 Create BranchEntitlement table**
```bash
npx prisma migrate dev --name add_branch_entitlements
```

**1.3 Simplify BusinessCapabilityState**
- Remove unused fields (confidence, recommendationReason, etc.)
- Keep only: state, enabledAt, disabledAt, changedBy, stateHistory

### Phase 2: Create Capability Definitions (Week 1-2)

**2.1 Seed capabilities table**
```typescript
// seed-capabilities.ts
const CAPABILITIES = [
  {
    key: 'ORDER_QUEUE',
    name: 'Order Queue',
    description: 'Create kitchen orders before payment',
    category: 'SALES',
    requiresPlan: null, // Available to all
    allowBranchSettings: true,
    defaultBranchSettings: {
      maxActiveOrders: 100,
      requireApproval: false,
      autoArchiveDays: 7
    },
    settingsSchema: { /* JSON Schema */ }
  },
  // ... more capabilities
]
```

**2.2 Update existing BusinessCapabilityState records**
```typescript
// Rename old capability IDs to new keys
const CAPABILITY_MIGRATIONS = {
  'CREATE_ORDER': 'ORDER_QUEUE',
  'PRINT_RECEIPT': 'PRINT_RECEIPT',
  'START_VENDOR_SESSION': 'START_VENDOR_SESSION',
  // ... complete mapping
}
```

### Phase 3: Update Application Code (Week 2-3)

**3.1 Create unified hooks**
```typescript
// hooks/use-capability.ts
export function useCapability(key: string) {
  const business = useBusinessContext()
  const branch = useBranchContext()
  
  // Check business capability
  const capability = getBusinessCapability(business.id, key)
  if (!capability || capability.state !== 'ENABLED') {
    return { enabled: false, settings: null, reason: 'capability_disabled' }
  }
  
  // Check branch entitlement
  const entitlement = getBranchEntitlement(branch.id, key)
  if (!entitlement || !entitlement.isEnabled) {
    return { enabled: false, settings: null, reason: 'branch_disabled' }
  }
  
  return { 
    enabled: true, 
    settings: entitlement.settings,
    reason: null
  }
}
```

**3.2 Replace all old checks**
```typescript
// OLD ❌
if (hasCapability('CREATE_ORDER') && systemConfigs.ENABLE_ORDER) {
  // ...
}

// NEW ✅
const { enabled, settings } = useCapability('ORDER_QUEUE')
if (enabled) {
  const maxOrders = settings.maxActiveOrders
  // ...
}
```

**3.3 Update all components**
- POS page: Remove `systemConfigs.ENABLE_ORDER` checks
- Header: Remove `systemConfigs.ENABLE_*` checks
- Settings pages: Update to use new entitlement system

### Phase 4: Admin UI (Week 3-4)

**4.1 Business Settings Page**
- Show all capabilities with their state
- Allow enable/disable based on subscription
- Show which capabilities require upgrade

**4.2 Branch Settings Page**
- Show enabled capabilities for the business
- Allow branch admin to enable/disable per branch
- Show/edit branch-specific settings
- Gray out if business capability is disabled

### Phase 5: Testing & Documentation (Week 4)

**5.1 Unit tests**
- Test capability cascade (disabled capability → disabled entitlements)
- Test branch settings override
- Test settings validation

**5.2 Integration tests**
- Test subscription changes
- Test branch enable/disable
- Test settings updates

**5.3 Documentation**
- Update developer docs
- Create admin user guide
- Document all capability keys and their settings

---

## 🎨 ADMIN UI DESIGN

### Two Separate Pages Required

#### Page 1: Business Capabilities (Admin Only)
**Route:** `/admin/capabilities`  
**Access:** Business owner / Super admin only  
**Purpose:** Enable/disable entire modules based on subscription

```
┌─────────────────────────────────────────────────────┐
│  Business Capabilities                    [Business]│
├─────────────────────────────────────────────────────┤
│                                                      │
│  Sales & POS                                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ ✅ Order Queue                    [ENABLED]  │  │
│  │    Create kitchen orders before payment      │  │
│  │    Plan: All plans                           │  │
│  │    📊 Used by 3 branches                     │  │
│  │                            [Disable]          │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ ✅ Cash Reconciliation           [ENABLED]  │  │
│  │    End-of-shift cash drawer reconciliation   │  │
│  │    Plan: All plans                           │  │
│  │    📊 Used by 2 branches                     │  │
│  │                            [Disable]          │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  Inventory & Operations                              │
│  ┌──────────────────────────────────────────────┐  │
│  │ ❌ Stock Transfers              [DISABLED]   │  │
│  │    Transfer inventory between branches       │  │
│  │    Plan: Pro+ required      [⬆️ Upgrade]    │  │
│  │                            [Enable]           │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Shows all capabilities grouped by category
- Indicates subscription requirements
- Shows how many branches are using each capability
- Simple Enable/Disable toggle
- Upgrade prompts for locked capabilities

---

#### Page 2: Branch Entitlements (Branch Admin)
**Route:** `/admin/branches/[branchId]/entitlements`  
**Access:** Branch manager / Admin  
**Purpose:** Configure branch-specific settings for enabled capabilities

```
┌─────────────────────────────────────────────────────┐
│  Branch Settings: Downtown Branch        [Branch]   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ✅ ENABLED FEATURES (3)                             │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Order Queue                    ✓ Enabled     │  │
│  │ ┌──────────────────────────────────────────┐ │  │
│  │ │ Settings                                 │ │  │
│  │ │                                          │ │  │
│  │ │ Max Active Orders:  [50        ] orders │ │  │
│  │ │ Require Approval:   ☑ Yes              │ │  │
│  │ │ Auto Archive:       [7         ] days   │ │  │
│  │ │ Allow Merge Orders: ☐ No               │ │  │
│  │ │ Notification Sound: ☑ Yes              │ │  │
│  │ │                                          │ │  │
│  │ │              [Reset to Defaults] [Save] │ │  │
│  │ └──────────────────────────────────────────┘ │  │
│  │                            [Disable Feature] │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Cash Reconciliation            ✓ Enabled     │  │
│  │ ┌──────────────────────────────────────────┐ │  │
│  │ │ Settings                                 │ │  │
│  │ │                                          │ │  │
│  │ │ Require End of Shift: ☑ Yes            │ │  │
│  │ │ Max Discrepancy:      [100     ] PHP   │ │  │
│  │ │ Require Manager PIN:  ☐ No             │ │  │
│  │ │                                          │ │  │
│  │ │              [Reset to Defaults] [Save] │ │  │
│  │ └──────────────────────────────────────────┘ │  │
│  │                            [Disable Feature] │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │ Receipt Printing               ✓ Enabled     │  │
│  │ ┌──────────────────────────────────────────┐ │  │
│  │ │ Settings                                 │ │  │
│  │ │                                          │ │  │
│  │ │ Auto Print:         ☐ No               │ │  │
│  │ │ Number of Copies:   [1         ]       │ │  │
│  │ │ Kitchen Copy:       ☐ No               │ │  │
│  │ │                                          │ │  │
│  │ │              [Reset to Defaults] [Save] │ │  │
│  │ └──────────────────────────────────────────┘ │  │
│  │                            [Disable Feature] │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ❌ DISABLED FEATURES (0)                            │
│  (none)                                              │
│                                                      │
│  🔒 UNAVAILABLE (Business capability disabled) (1)   │
│  • Stock Transfers                                   │
│    (Contact admin to enable for your business)      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Shows only capabilities enabled at business level
- Each capability has expandable settings panel
- Settings are validated against capability schema
- Reset to defaults option
- Shows unavailable capabilities (disabled at business level)
- Simple toggle to enable/disable per branch

---

### UI Flow Example

**Scenario: Branch wants to use Stock Transfers**

1. **Branch Admin** goes to `/admin/branches/downtown/entitlements`
2. Sees "Stock Transfers" in "🔒 UNAVAILABLE" section
3. Clicks on it, sees message: "This feature requires Pro plan. Contact your business administrator."
4. **Business Admin** gets notification or branch admin sends request
5. **Business Admin** goes to `/admin/capabilities`
6. Sees "Stock Transfers" is locked (requires Pro plan upgrade)
7. Either:
   - Upgrades subscription → Stock Transfers becomes available
   - OR denies request
8. Once enabled at business level:
9. **Branch Admin** refreshes, sees "Stock Transfers" now in "Available Features" section
10. Clicks "Enable" → Can now configure branch-specific settings

---

## 🎨 DEVELOPER EXPERIENCE

### Before (Confusing):

```typescript
// Check 2 places + unclear relationship
if (hasCapability('CREATE_ORDER') && systemConfigs.ENABLE_ORDER) {
  // Show order button
}

// Multiple imports
import { Capabilities } from '@/lib/entitlement/capability-keys'
import { ConfigKey } from 'prisma/generated/prisma/enums'
```

### After (Clean):

```typescript
// Single check with clear cascade rule
const { enabled, settings } = useCapability('ORDER_QUEUE')

if (enabled) {
  // Feature is enabled at business AND branch level
  const maxOrders = settings.maxActiveOrders
  const needsApproval = settings.requireApproval
  // Use settings...
}

// Single import
import { useCapability } from '@/hooks/use-capability'
```

### Component Example

```typescript
// POS Header Component
function PosHeader() {
  const { enabled: ordersEnabled, settings: orderSettings } = 
    useCapability('ORDER_QUEUE')
  const { enabled: receiptsEnabled, settings: receiptSettings } = 
    useCapability('PRINT_RECEIPT')
  
  return (
    <header>
      {ordersEnabled && (
        <ActiveOrdersButton 
          maxOrders={orderSettings.maxActiveOrders}
          requireApproval={orderSettings.requireApproval}
        />
      )}
      {receiptsEnabled && (
        <PrintButton 
          autoPrint={receiptSettings.autoPrint}
          copies={receiptSettings.copies} 
        />
      )}
    </header>
  )
}
```

### Settings Validation Example

```typescript
// When branch saves entitlement settings
function validateBranchSettings(capabilityKey: string, settings: any) {
  // Get capability definition
  const capability = await getCapability(capabilityKey)
  
  // Validate against availableSettings schema
  const schema = capability.availableSettings
  
  for (const [key, value] of Object.entries(settings)) {
    const fieldSchema = schema[key]
    
    if (!fieldSchema) {
      throw new Error(`Unknown setting: ${key}`)
    }
    
    // Type validation
    if (typeof value !== fieldSchema.type) {
      throw new Error(`${key} must be ${fieldSchema.type}`)
    }
    
    // Range validation
    if (fieldSchema.min && value < fieldSchema.min) {
      throw new Error(`${key} must be at least ${fieldSchema.min}`)
    }
    
    if (fieldSchema.max && value > fieldSchema.max) {
      throw new Error(`${key} must be at most ${fieldSchema.max}`)
    }
  }
  
  return true
}
```

### Admin Page Example

```typescript
// Branch Entitlements Settings Page
function BranchEntitlementsPage() {
  const { branchId } = useParams()
  const businessCapabilities = useBusinessCapabilities() // Enabled at business level
  const branchEntitlements = useBranchEntitlements(branchId)
  
  return (
    <div className="space-y-6">
      <h1>Branch Settings</h1>
      
      {/* Enabled features with settings */}
      <section>
        <h2>✅ Enabled Features</h2>
        {branchEntitlements
          .filter(e => e.isEnabled)
          .map(entitlement => {
            const capability = businessCapabilities.find(
              c => c.key === entitlement.capabilityKey
            )
            
            return (
              <EntitlementCard
                key={entitlement.id}
                capability={capability}
                entitlement={entitlement}
                onSaveSettings={(settings) => 
                  updateBranchSettings(entitlement.id, settings)
                }
                onDisable={() => 
                  disableBranchEntitlement(entitlement.id)
                }
              />
            )
          })}
      </section>
      
      {/* Available but not enabled */}
      <section>
        <h2>Available Features</h2>
        {businessCapabilities
          .filter(cap => !branchEntitlements.some(
            e => e.capabilityKey === cap.key && e.isEnabled
          ))
          .map(capability => (
            <AvailableFeatureCard
              key={capability.key}
              capability={capability}
              onEnable={() => 
                enableBranchEntitlement(branchId, capability.key)
              }
            />
          ))}
      </section>
    </div>
  )
}
```

---

## 📐 CASCADE RULES

### Two-Layer Hierarchy:

```
Subscription Plan → Business Capability → Branch Entitlement
(Most restrictive wins)
```

### Cascade Behavior:

```typescript
// Scenario 1: Normal operation
Subscription: Has ORDER_QUEUE ✅
Business Capability: ENABLED ✅
Branch Entitlement: ENABLED ✅
Result: ✅ Feature works

// Scenario 2: Branch opts out
Subscription: Has ORDER_QUEUE ✅
Business Capability: ENABLED ✅
Branch Entitlement: DISABLED ❌
Result: ❌ Feature disabled for this branch only

// Scenario 3: Business capability disabled (CASCADE)
Subscription: Has ORDER_QUEUE ✅
Business Capability: DISABLED ❌
Branch Entitlement: ENABLED ✅ (ignored!)
Result: ❌ Feature disabled for ALL branches

// Scenario 4: Subscription lapsed
Subscription: Expired ❌
Business Capability: ENABLED ✅ (ignored!)
Branch Entitlement: ENABLED ✅ (ignored!)
Result: ❌ Feature disabled (subscription takes precedence)
```

### Settings Override:

```typescript
// Branch can override business defaults
Business Capability: ORDER_QUEUE = ENABLED
  Default Settings: { maxActiveOrders: 100 }

Branch A Entitlement:
  isEnabled: true
  settings: { maxActiveOrders: 50 } // Override
  
Branch B Entitlement:
  isEnabled: true
  settings: null // Use business defaults (100)
```

---

## 🧪 TESTING STRATEGY

### Feature Flag Tests

```typescript
describe('Feature Flags', () => {
  it('respects subscription requirements', () => {
    const business = createBusiness({ plan: 'BASIC' })
    const flag = getFeatureFlag('analytics_dashboard', business.id)
    expect(flag.isEnabled).toBe(false)
    expect(flag.reason).toBe('Requires PRO plan')
  })
  
  it('allows branch-level overrides', () => {
    enableFeatureFlag('order_queue', { businessId })
    disableFeatureFlag('order_queue', { branchId })
    
    expect(isEnabled('order_queue', { businessId })).toBe(true)
    expect(isEnabled('order_queue', { branchId })).toBe(false)
  })
  
  it('includes sub-feature settings', () => {
    const { settings } = getFeatureFlag('order_queue')
    expect(settings.maxActiveOrders).toBe(100)
  })
})
```

---

## 📊 METRICS TO TRACK

### Feature Adoption

```sql
-- Which features are actually being used?
SELECT 
  flagKey,
  COUNT(DISTINCT businessId) as businesses_using,
  AVG(CASE WHEN isEnabled THEN 1 ELSE 0 END) as adoption_rate
FROM FeatureFlag
GROUP BY flagKey
ORDER BY adoption_rate DESC
```

### Plan Correlation

```sql
-- Do pro features drive upgrades?
SELECT 
  subscription.planName,
  COUNT(DISTINCT ff.businessId) as using_pro_features
FROM FeatureFlag ff
JOIN FeatureFlagDefinition def ON ff.flagKey = def.key
JOIN BusinessSubscription subscription ON ff.businessId = subscription.businessId
WHERE def.requiresPlan IN ('PRO', 'ENTERPRISE')
  AND ff.isEnabled = true
GROUP BY subscription.planName
```

---

## ✅ DECISIONS MADE

- [x] **Branch-level overrides?** YES - Core requirement
- [x] **User-level overrides?** NO - Use roles instead
- [x] **Settings format?** JSON - Flexible and sufficient for MVP
- [x] **Migration strategy?** Clean slate - No real data yet
- [x] **Keep SystemConfig?** YES - But only for localization & non-feature settings

---

## 🎯 IMMEDIATE NEXT STEPS

### Week 1: Schema Changes
1. Create migration to add `BranchEntitlement` table
2. Create `Capability` definitions table
3. Simplify `BusinessCapabilityState` (remove unused fields)
4. Clean up `ConfigKey` enum (remove ENABLE_* keys)
5. Seed all capability definitions

### Week 2: Code Changes
1. Create `useCapability()` hook
2. Update all components to use new system
3. Remove all `systemConfigs.ENABLE_*` checks
4. Add cascade logic to entitlement queries

### Week 3: Admin UI
1. Business settings page - enable/disable capabilities
2. Branch settings page - configure entitlements
3. Settings editor for JSON configs

### Week 4: Testing & Polish
1. Unit tests for cascade behavior
2. Integration tests for subscription changes
3. Documentation
4. Seeder updates

---

## 📝 OPEN QUESTIONS

### Resolved:
- ✅ Branch settings format: JSON
- ✅ User-level control: Not needed
- ✅ Migration strategy: Fresh start

### Still To Decide:
- 🤔 **Settings validation**: Runtime vs compile-time?
- 🤔 **Settings UI**: Generic JSON editor or custom forms per capability?
- 🤔 **Audit trail**: Track who changed what when?
- 🤔 **Capability dependencies**: Should ORDER_TABS require ORDER_QUEUE?
- 🤔 **Default branch behavior**: Create entitlements on capability enable or lazily?

---

## 🎯 SUCCESS CRITERIA

### Must Have:
- ✅ Single source of truth for features
- ✅ Clear capability → entitlement cascade
- ✅ Branch-specific settings support
- ✅ Subscription enforcement
- ✅ Clean developer experience

### Nice To Have:
- Settings schema validation
- Capability dependency graph
- Real-time updates via WebSocket
- Feature usage analytics
- A/B testing support

---

**STATUS:** ✅ Ready for implementation - No blockers

**START DATE:** TBD  
**ESTIMATED COMPLETION:** 4 weeks  
**RISK LEVEL:** 🟢 Low (no real data to migrate)
