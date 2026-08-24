# Contributing to Start POS

Thank you for contributing to Start POS! This guide will help you maintain code quality and consistency.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Type Safety Requirements](#type-safety-requirements)
- [Pre-Commit Checklist](#pre-commit-checklist)
- [Git Workflow](#git-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Common Patterns](#common-patterns)

---

## Getting Started

1. **Fork and Clone**
   ```bash
   git clone <your-fork-url>
   cd start-pos/web
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Configure DATABASE_URL and other variables
   ```

4. **Run Database Setup**
   ```bash
   pnpm generate
   pnpm prisma migrate dev
   pnpm seed
   ```

5. **Start Development**
   ```bash
   pnpm dev
   ```

---

## Type Safety Requirements

This project maintains strict type safety standards. All contributions must follow these principles:

### 1. Derive Types from Prisma

**❌ Don't:** Create duplicate interfaces
```typescript
// Bad: Duplicates Prisma model
interface Product {
  id: string
  name: string
  price: number
}
```

**✅ Do:** Import and extend Prisma types
```typescript
// Good: Derives from Prisma
import type { Product } from 'prisma/generated/prisma/browser'

// If you need a subset:
type ProductSummary = Pick<Product, 'id' | 'name' | 'price'>

// If you need additional fields:
type ProductWithStock = Product & {
  stockLevel: number
}
```

### 2. Never Use `any`

**❌ Don't:** Use `any` type
```typescript
// Bad
function processData(data: any) {
  return data.map((item: any) => item.value)
}
```

**✅ Do:** Use proper types
```typescript
// Good
import type { ProductVariant } from 'prisma/generated/prisma/browser'

function processData(data: ProductVariant[]) {
  return data.map(item => item.price)
}
```

### 3. Type JSON Operations

**❌ Don't:** Use raw JSON methods
```typescript
// Bad
const metadata = JSON.parse(jsonString)
const json = JSON.stringify(data)
```

**✅ Do:** Use typed helpers with Zod schemas
```typescript
// Good
import { z } from 'zod'
import { safeJsonParse, typedJsonStringify } from '@/lib/json-utils'

const MetadataSchema = z.object({
  userId: z.string(),
  timestamp: z.number()
})

const metadata = safeJsonParse(jsonString, MetadataSchema)
const json = typedJsonStringify(data, MetadataSchema)
```

### 4. Import from Correct Locations

```typescript
// Prisma types
import type { Product, ProductVariant } from 'prisma/generated/prisma/browser'
import { Role, ProductionStatus } from 'prisma/generated/prisma/enums'

// Domain types (when truly novel)
import type { CartItem } from '@/lib/cart/types'

// Never create duplicate Prisma types in your files!
```

For more details, see [Type Derivation Guide](./docs/dx-audit/02-TYPE-GUIDE.md).

---

## Pre-Commit Checklist

Before committing, ensure all of these pass:

### Automated Checks (via Lefthook)

These run automatically on `git commit`:

- [ ] **TypeScript compiles** - No type errors
- [ ] **Biome lint passes** - No lint errors
- [ ] **Tests pass** - Affected tests run successfully
- [ ] **Commit message format** - Follows conventional commits

### Manual Checks

- [ ] **No `any` types** - All types are explicit
- [ ] **JSON operations typed** - Using Zod schemas
- [ ] **Types derived from Prisma** - No duplicate interfaces
- [ ] **Accessibility** - Interactive elements have proper ARIA attributes
- [ ] **Error handling** - Errors are caught and handled appropriately
- [ ] **Documentation** - Complex logic has comments

### Run Before Committing

```bash
# Type check
pnpm ts

# Lint and format
pnpm check

# Run tests
pnpm test

# Full validation
pnpm ts && pnpm check && pnpm test
```

---

## Git Workflow

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `chore/` - Maintenance tasks

Examples:
```bash
feature/add-barcode-scanner
fix/inventory-calculation-bug
refactor/simplify-auth-middleware
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance
- `perf`: Performance improvement
- `style`: Code style (formatting, not CSS)

**Examples:**
```
feat(inventory): add batch expiration tracking
fix(pos): correct tax calculation for discounted items
refactor(auth): simplify permission middleware
docs(readme): update type derivation guide
test(cart): add edge case tests for quantity limits
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes and Commit**
   ```bash
   git add .
   git commit -m "feat: your changes"
   ```

3. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

4. **Open Pull Request**
   - Describe what changed and why
   - Reference related issues
   - Include screenshots for UI changes
   - Ensure all CI checks pass

---

## Code Style

### Formatting

We use [Biome](https://biomejs.dev/) for consistent formatting:

```bash
# Format all files
pnpm format

# Check formatting without changes
pnpm lint
```

### TypeScript

- Use `const` for immutable values, `let` for mutable
- Avoid `var`
- Prefer arrow functions for callbacks
- Use template literals over string concatenation
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### React

- Prefer function components over class components
- Use hooks for state and effects
- Memoize expensive computations with `useMemo`
- Memoize callbacks with `useCallback`
- Always include dependency arrays in hooks

**Example:**
```typescript
const MyComponent = () => {
  const [count, setCount] = useState(0)
  
  const expensiveValue = useMemo(() => {
    return computeExpensiveValue(count)
  }, [count])
  
  const handleClick = useCallback(() => {
    setCount(prev => prev + 1)
  }, [])
  
  return <button onClick={handleClick}>{expensiveValue}</button>
}
```

### File Organization

```
src/
├── components/       # Reusable UI components
├── routes/          # TanStack Router pages
├── lib/             # Business logic, utilities
├── hooks/           # Custom React hooks
├── db/              # Database collections
└── store/           # Global state stores
```

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm coverage

# Watch mode
pnpm test --watch
```

### Writing Tests

- Place tests next to source files: `feature.test.ts`
- Test business logic, not implementation details
- Use descriptive test names
- Follow Arrange-Act-Assert pattern

**Example:**
```typescript
import { describe, it, expect } from 'vitest'
import { calculateDiscount } from './discount'

describe('calculateDiscount', () => {
  it('should apply 10% discount for regular customers', () => {
    // Arrange
    const price = 100
    const customerType = 'regular'
    
    // Act
    const result = calculateDiscount(price, customerType)
    
    // Assert
    expect(result).toBe(90)
  })
  
  it('should apply 20% discount for premium customers', () => {
    const price = 100
    const customerType = 'premium'
    
    const result = calculateDiscount(price, customerType)
    
    expect(result).toBe(80)
  })
})
```

---

## Common Patterns

### 1. JSON Data Handling

Always use typed helpers:

```typescript
// Define schema
const NotificationMetadataSchema = z.object({
  type: z.enum(['LOW_STOCK', 'CREDIT_LOW']),
  productId: z.string().optional(),
  threshold: z.number().optional()
})

type NotificationMetadata = z.infer<typeof NotificationMetadataSchema>

// Serialize
const metadata: NotificationMetadata = { type: 'LOW_STOCK', productId: '123' }
const json = typedJsonStringify(metadata, NotificationMetadataSchema)

// Deserialize
const parsed = safeJsonParse(json, NotificationMetadataSchema)
if (parsed.success) {
  const data = parsed.data // Fully typed!
}
```

### 2. Collection Queries

```typescript
import { productCollection } from '@/db/collections'

// Get by ID
const product = productCollection.get(id)

// Filter
const activeProducts = [...productCollection.values()]
  .filter(p => !p.deletedAt)

// Update
productCollection.update(id, draft => {
  draft.name = 'New Name'
})
```

### 3. Server Functions

```typescript
import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/better-auth/auth-middleware'
import { getTenantPrisma } from '@/lib/prisma-client'

export const myServerFn = createServerFn()
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const prisma = getTenantPrisma(context)
    
    // Your logic here
    const result = await prisma.product.findMany()
    
    return result
  })
```

### 4. Permission Checks

```typescript
import { RequirePermission } from '@/components/require-permission'
import { Permissions } from '@/lib/authorization/permission-keys'

export default function MyPage() {
  return (
    <RequirePermission permission={Permissions.PRODUCT_CREATE}>
      <YourContent />
    </RequirePermission>
  )
}
```

---

## Getting Help

- **Type errors?** Check [Type Derivation Guide](./docs/dx-audit/02-TYPE-GUIDE.md)
- **Lint errors?** Run `pnpm lint` for details
- **Prisma types?** See `prisma/generated/prisma/`
- **Patterns unclear?** Search the codebase for similar examples

---

## Code Review Guidelines

When reviewing pull requests:

- [ ] Types are derived from Prisma, not duplicated
- [ ] No `any` types added
- [ ] JSON operations use Zod schemas
- [ ] Tests cover new functionality
- [ ] Accessibility requirements met
- [ ] Error handling is appropriate
- [ ] Code follows existing patterns
- [ ] Documentation is updated

---

Thank you for contributing! 🚀
