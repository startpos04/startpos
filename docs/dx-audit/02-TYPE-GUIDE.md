# Type Derivation Guide

**Philosophy:** Derive from Prisma → Reuse → Extend → Only then Create

---

## Quick Reference

### Where Types Come From

1. **Prisma Generated (Source of Truth)**
   - `prisma/generated/prisma/client` - Models, types
   - `prisma/generated/prisma/enums` - Enums
   - `prisma/generated/prisma/browser` - Browser-safe subset

2. **Central Type Library**
   - `src/lib/types.ts` - Shared utilities
   - `src/lib/*/types.ts` - Domain-specific

3. **Last Resort**
   - Create new type in appropriate domain file

---

## Import Patterns

### ✅ Correct Imports

```typescript
// Models and their types
import type { User, Product, Order } from 'prisma/generated/prisma/client'

// Enums
import { Role, PaymentMethod, OrderStatus } from 'prisma/generated/prisma/enums'

// Prisma namespace for input/output types
import type { Prisma } from 'prisma/generated/prisma/client'

// Existing central types
import type { ConfigKeyTypes, TaskMetadata } from '@/lib/types'

// Domain-specific types
import type { SubscriptionPlan } from '@/lib/billing/types'
```

### ❌ Anti-Patterns

```typescript
// DON'T: Duplicate Prisma types
interface User {
  id: string
  email: string
}

// DON'T: Use any when Prisma type exists
function getUser(id: string): any

// DON'T: Create parallel enums
enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER'
}
```

---

## Common Scenarios

### Scenario 1: Working with DB Entities

```typescript
// ✅ Use Prisma types directly
import type { Product } from 'prisma/generated/prisma/client'

function calculateDiscount(product: Product): number {
  return product.price * 0.1
}
```

### Scenario 2: Need Subset of Fields

```typescript
// ✅ Use Pick
import type { User } from 'prisma/generated/prisma/client'

type UserProfile = Pick<User, 'id' | 'email' | 'name' | 'avatar'>

// ✅ Use Omit for sensitive data
type PublicUser = Omit<User, 'password' | 'resetToken'>
```

### Scenario 3: Add Computed Fields

```typescript
// ✅ Extend with intersection
import type { Product, Inventory } from 'prisma/generated/prisma/client'

type ProductWithStock = Product & {
  totalStock: number
  isLowStock: boolean
  lastRestockDate: Date | null
}

function enrichProduct(
  product: Product,
  inventory: Inventory[]
): ProductWithStock {
  return {
    ...product,
    totalStock: inventory.reduce((sum, inv) => sum + inv.quantity, 0),
    isLowStock: inventory.length > 0 && inventory[0]!.quantity < 10,
    lastRestockDate: inventory[0]?.updatedAt ?? null,
  }
}
```

### Scenario 4: API Payloads (Create/Update)

```typescript
// ✅ Use Prisma's generated input types
import type { Prisma } from 'prisma/generated/prisma/client'

type CreateProductDTO = Prisma.ProductCreateInput
type UpdateProductDTO = Prisma.ProductUpdateInput

// For partial updates
type PartialProductDTO = Partial<Prisma.ProductUpdateInput>
```

### Scenario 5: Form Data (Subset + Validation)

```typescript
// ✅ Derive shape from Prisma, add validation with Zod
import type { Product } from 'prisma/generated/prisma/client'
import { z } from 'zod'

// Define schema based on Prisma fields
const ProductFormSchema = z.object({
  name: z.string().min(1, 'Name required'),
  price: z.number().min(0, 'Price must be positive'),
  description: z.string().optional(),
  categoryId: z.string().cuid(),
})

type ProductFormData = z.infer<typeof ProductFormSchema>

// Convert to Prisma input
function toCreateInput(data: ProductFormData): Prisma.ProductCreateInput {
  return {
    name: data.name,
    price: data.price,
    description: data.description,
    category: { connect: { id: data.categoryId } },
  }
}
```

### Scenario 6: JSON Columns (metadata fields)

```typescript
// Prisma schema has:
// model Notification {
//   metadata Json?
// }

// ✅ Step 1: Define structure with Zod
import { z } from 'zod'

const NotificationMetadataSchema = z.object({
  link: z.string().optional(),
  count: z.number().optional(),
  timestamp: z.string().optional(),
}).passthrough() // Allow extra fields for flexibility

type NotificationMetadata = z.infer<typeof NotificationMetadataSchema>

// ✅ Step 2: Create typed version
import type { Notification } from 'prisma/generated/prisma/client'

type TypedNotification = Omit<Notification, 'metadata'> & {
  metadata: NotificationMetadata | null
}

// ✅ Step 3: Create parser helper
import { safeJsonParse } from '@/lib/json-utils'

export function parseNotification(raw: Notification): TypedNotification {
  const metadataResult = raw.metadata
    ? safeJsonParse(String(raw.metadata), NotificationMetadataSchema)
    : { success: false as const }

  return {
    ...raw,
    metadata: metadataResult.success ? metadataResult.data : null,
  }
}
```

### Scenario 7: Enum Handling

```typescript
// ✅ Import and use Prisma enums directly
import { OrderStatus, PaymentMethod } from 'prisma/generated/prisma/enums'

function processOrder(status: OrderStatus) {
  switch (status) {
    case OrderStatus.PENDING:
      // TypeScript knows all cases
      break
    case OrderStatus.COMPLETED:
      break
    case OrderStatus.CANCELLED:
      break
  }
}

// ✅ For runtime validation
import { z } from 'zod'

const PaymentMethodSchema = z.nativeEnum(PaymentMethod)

// Type derived from Prisma enum
type ValidatedPayment = z.infer<typeof PaymentMethodSchema>
```

### Scenario 8: Relations and Includes

```typescript
// ✅ Use Prisma's validator for include types
import type { Prisma } from 'prisma/generated/prisma/client'

// Define what you're including
const orderWithItems = Prisma.validator<Prisma.OrderDefaultArgs>()({
  include: {
    items: {
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    },
    customer: true,
  },
})

// Get the type
type OrderWithItems = Prisma.OrderGetPayload<typeof orderWithItems>

// Now OrderWithItems has fully typed nested relations
function processOrder(order: OrderWithItems) {
  order.items.forEach(item => {
    console.log(item.variant.product.name) // Fully typed!
  })
}
```

---

## JSON Safety Patterns

### Pattern 1: Storing Typed Data

```typescript
import { typedJsonStringify } from '@/lib/json-utils'
import { NotificationMetadataSchema } from '@/lib/notification/notification-types'

const metadata = {
  link: '/dashboard',
  count: 5,
  timestamp: new Date().toISOString(),
}

// ✅ Validated before stringifying
const json = typedJsonStringify(metadata, NotificationMetadataSchema)

// Store in DB
await prisma.notification.create({
  data: {
    title: 'New alerts',
    metadata: json, // Type-safe!
  },
})
```

### Pattern 2: Reading Typed Data

```typescript
import { safeJsonParse } from '@/lib/json-utils'
import { NotificationMetadataSchema } from '@/lib/notification/notification-types'

const notification = await prisma.notification.findFirst()

if (notification?.metadata) {
  const result = safeJsonParse(
    String(notification.metadata),
    NotificationMetadataSchema
  )

  if (result.success) {
    console.log(result.data.link) // Typed as string | undefined
  } else {
    console.error('Invalid metadata:', result.error)
  }
}
```

### Pattern 3: localStorage with Types

```typescript
import { parseLocalStorage, setLocalStorage } from '@/lib/json-utils'
import { z } from 'zod'

const UserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']),
  sidebarCollapsed: z.boolean(),
})

type UserPreferences = z.infer<typeof UserPreferencesSchema>

// ✅ Type-safe read with fallback
const prefs = parseLocalStorage(
  'user-preferences',
  UserPreferencesSchema,
  { theme: 'light', sidebarCollapsed: false } // fallback
)

// ✅ Type-safe write with validation
setLocalStorage('user-preferences', prefs, UserPreferencesSchema)
```

---

## Migration Checklist

When you encounter `any` or untyped code:

### 1. Check if Prisma type exists
```bash
# Search in generated types
grep -r "interface ProductVariant" prisma/generated/
```

If found → Use Prisma type directly

### 2. Check existing type libraries
```typescript
// Check these files in order:
// 1. prisma/generated/prisma/*
// 2. src/lib/types.ts
// 3. src/lib/[domain]/types.ts (billing, audit, etc.)
```

If found → Import and reuse

### 3. Can you derive it?
```typescript
// Use TypeScript utilities:
Pick<T, K>        // Select specific fields
Omit<T, K>        // Remove specific fields
Partial<T>        // Make all optional
Required<T>       // Make all required
Record<K, T>      // Object with keys K, values T
ReturnType<F>     // Get function return type
Parameters<F>     // Get function parameters
Awaited<T>        // Unwrap Promise<T>
```

### 4. Last resort: Create new type
```typescript
// Add to appropriate domain file (NOT global types.ts unless truly shared)
// Document why it can't be derived
/**
 * Custom type for X because Y doesn't exist in Prisma
 * Used in: [list of files]
 */
export interface MyCustomType {
  // ...
}
```

---

## Type Organization Examples

### Good Organization

```
src/lib/
  types.ts                    ← Shared utilities only (Prettify, etc.)
  
  billing/
    types.ts                  ← Billing domain types
    subscription-engine.ts    ← Imports from ./types.ts
  
  production/
    types.ts                  ← Production domain types
    production-engine.ts      ← Imports from ./types.ts
  
  notification/
    notification-types.ts     ← Notification domain types
    notification-engine.ts    ← Imports from ./notification-types.ts
```

### Bad Organization

```
src/lib/
  types.ts                    ← 3000 lines, everything dumped here ❌
  
  billing/
    billing-types.ts          ← Duplicates Product from Prisma ❌
    subscription-types.ts     ← Also defines Product ❌
    invoice-types.ts          ← Product again ❌
```

---

## Quick Wins

### Win 1: Replace `any` with Prisma types

```typescript
// ❌ Before
function getProducts(): any[]

// ✅ After
import type { Product } from 'prisma/generated/prisma/client'
function getProducts(): Product[]
```

### Win 2: Use TypeScript utilities instead of new interfaces

```typescript
// ❌ Before
interface UserDTO {
  id: string
  email: string
  name: string
}

// ✅ After
import type { User } from 'prisma/generated/prisma/client'
type UserDTO = Pick<User, 'id' | 'email' | 'name'>
```

### Win 3: Type JSON.parse with existing types

```typescript
// ❌ Before
const data = JSON.parse(jsonString)

// ✅ After
import { safeJsonParse } from '@/lib/json-utils'
import { TaskMetadataSchema } from '@/lib/types'

const result = safeJsonParse(jsonString, TaskMetadataSchema)
if (result.success) {
  const data = result.data // Fully typed!
}
```

---

## Tools

### Measure Type Coverage

```bash
# Install
pnpm add -D type-coverage

# Run
pnpm exec type-coverage --detail

# Target: >95%
```

### Find Untyped Expressions

```bash
# Show all any usage
pnpm exec type-coverage --detail | grep "any"

# Show files with lowest coverage
pnpm exec type-coverage --detail --at-least 95
```

### Validate Approach

Before creating a new type, ask:

1. ✅ Does this exist in Prisma? → Use it
2. ✅ Can I derive it from Prisma? → Use Pick/Omit/Extend
3. ✅ Does it exist in domain types? → Import it
4. ✅ Is it truly novel? → Only then create it

---

## Summary

**The Golden Rule:** Start from Prisma, work your way out.

```
Prisma Types (generated)
    ↓ (derive with Pick/Omit/Extend)
Domain Types (src/lib/*/types.ts)
    ↓ (compose)
Component Props
    ↓ (use)
Runtime Code
```

Never work backwards (creating types that duplicate what Prisma already provides).
