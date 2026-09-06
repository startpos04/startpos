# Start POS

A modern, offline-first, multi-tenant Point of Sale (POS) system built with **TanStack Start**, **React**, **Prisma**, and **PostgreSQL**. The application is designed to support multiple business types such as **Retail**, **Restaurant**, and **Grocery**, while remaining highly configurable and scalable.

## Features

### 🏢 Multi-Tenant Architecture

- Multiple Businesses
- Multiple Branches per Business
- Membership-based user access
- Business and Branch scoped data

### 👥 User Management

- Better Auth authentication
- Role-based access control
- Business memberships
- Session management

Supported roles:

- Administrator
- Supervisor
- Cashier
- Service Provider

---

## Products

Supports different resource types:

- Physical Goods
- Services
- Raw Materials
- Bundles

Product features include:

- Categories
- Variants
- SKU support
- Images
- Multiple Units
- Cost Price
- Selling Price
- Product Components (BOM)
- Product Add-ons
- Service Duration
- Deposit Tracking
- Expiration Tracking

---

## Inventory

Inventory system includes:

- Multiple locations
- Batch tracking
- Expiration dates
- Inventory movements
- Stock adjustments
- Internal transfers
- External transfers
- Waste management
- Purchase receiving

---

## Purchasing

- Suppliers
- Purchase Orders
- Purchase Items
- Inventory Receiving
- Cost Tracking

---

## Sales

Supports:

- Sales
- Refunds
- Adjustments

Features:

- Multiple payment methods
- Customer management
- Discounts
- Tax computation
- Receipt generation
- Invoice numbering
- Transaction history

---

## Restaurant Support

Restaurant-specific functionality includes:

- Orders
- Kitchen workflow
- Order status
- Add-ons
- Dine-in
- Take-out
- Delivery
- Customer reference (Table numbers, buzzers, etc.)

---

## Financial

- Cash reconciliation
- Vendor sessions
- Payment tracking
- Revenue tracking
- Cost tracking
- Profit calculations

---

## Task Management

Operational task workflow:

```
Draft
    ↓
Pending
    ↓
Approved
    ↓
In Progress
    ↓
Fulfilled
    ↓
Reviewed
```

Supports:

- Shelf Refills
- Purchase Requests
- Branch Transfers
- Stock Counting
- Waste Disposal
- Cash Reconciliation
- General Tasks

---

## Notifications

Built-in notification system for:

- Low stock
- New orders
- Task assignments
- System alerts
- Compliance reminders

---

## Configuration System

Hierarchical configuration:

```
Business
    ↓
Branch
    ↓
User
```

Supports:

- VAT Rate
- Currency
- Locale
- Price Configuration
- Printing
- Order Tabs
- Inventory Thresholds
- Cash Reconciliation
- Tasks

---

## Compliance

Designed to support multiple countries.

Current abstractions include:

- VAT
- GST
- Sales Tax
- Invoice Types
- Compliance Registry
- Tax Categories

---

## Offline First

Built using TanStack DB for local-first capabilities.

Features:

- Local database
- Optimistic updates
- Background synchronization
- Offline operation
- Fast UI updates

---

# Tech Stack

## Frontend

- React 19
- TanStack Start
- TanStack Router
- TanStack Query
- TanStack Form
- TanStack DB
- Tailwind CSS v4
- Base UI
- Lucide Icons
- React PDF

## Backend

- Prisma ORM
- PostgreSQL
- Better Auth

## Tooling

- Vite
- Vitest
- Biome
- TypeScript
- Serwist (PWA)
- TSX

---

# Project Structure

This is a monorepo containing multiple applications:

## Apps

### `apps/web` — Main POS Application
The primary point-of-sale application with full inventory, sales, and management features.

```bash
pnpm dev:web
```

### `apps/website` — Marketing Website
Public-facing marketing website built with Astro.

```bash
pnpm dev:website
```

### `apps/admin` — Admin Dashboard
Platform administration interface for system-level management.

```bash
pnpm dev:admin
```

### `apps/calling-card` — Business Cards
Print-ready business calling cards for marketing and distribution.

```bash
pnpm dev:calling-card
```

Visit http://localhost:3005 to preview the cards, or see `apps/calling-card/PRINTING.md` for printing instructions.

## Core Structure

```
.
├── apps/
│   ├── web/           # Main POS app
│   ├── website/       # Marketing site
│   ├── admin/         # Admin dashboard
│   └── calling-card/  # Business cards
├── packages/
│   └── platform/      # Shared Prisma models
├── prisma/
├── scripts/
└── package.json
```

---

# Installation

## Requirements

- Node.js 22+
- pnpm
- PostgreSQL

Install dependencies.

```bash
pnpm install
```

Create your environment file.

```bash
cp .env.example .env
```

Configure your database connection.

```
DATABASE_URL="postgresql://..."
```

Generate Prisma Client.

```bash
pnpm generate
```

Run database migrations.

```bash
pnpm prisma migrate dev
```

Seed the database.

```bash
pnpm seed
```

Start development.

```bash
pnpm dev
```

---

# Development Workflow

## Type Safety Principles

This project follows strict type derivation principles to maintain consistency and reduce duplication:

1. **Derive from Prisma First**: Use Prisma-generated types as the single source of truth
2. **Avoid Type Duplication**: Don't create interfaces that mirror Prisma models
3. **Use Type Utilities**: Leverage Pick, Omit, Extend to create derived types
4. **Type JSON Operations**: Use Zod schemas for all JSON.parse/stringify operations

For detailed guidance, see [Type Derivation Guide](./docs/dx-audit/02-TYPE-GUIDE.md).

## Git Hooks (Lefthook)

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for automated quality checks:

- **pre-commit**: Runs type checking, linting, and tests on staged files
- **commit-msg**: Validates commit message format
- **pre-push**: Runs full validation before pushing to remote

Hooks run automatically. To bypass in emergencies (not recommended):
```bash
LEFTHOOK=0 git commit -m "emergency fix"
```

## Pre-Commit Checklist

Before committing code, ensure:

- [ ] TypeScript compiles without errors (`pnpm ts`)
- [ ] Biome lint passes (`pnpm lint`)
- [ ] Tests pass (`pnpm test`)
- [ ] No `any` types added (use proper Prisma types)
- [ ] JSON operations use typed helpers from `@/lib/json-utils`
- [ ] New types are derived from Prisma, not duplicated

**Quick validation:** Run `pnpm validate` to check all of the above at once.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

## Continuous Integration

This project uses GitHub Actions for automated quality checks:

- **CI Pipeline** (`.github/workflows/ci.yml`):
  - TypeScript type checking
  - Biome lint checking
  - Type coverage monitoring (95% threshold)
  - Unit and integration tests with coverage
  
- **E2E Tests** (`.github/workflows/playwright.yml`):
  - Playwright browser tests
  - Visual regression testing

All checks must pass before merging pull requests. Type coverage reports are automatically commented on PRs.

---

# Available Scripts

| Command | Description |
|----------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Generate Prisma Client and build application |
| `pnpm preview` | Preview production build |
| `pnpm start` | Build and preview production |
| `pnpm test` | Run tests |
| `pnpm coverage` | Run tests with coverage |
| `pnpm lint` | Run Biome lint |
| `pnpm format` | Format project |
| `pnpm check` | Lint and format |
| `pnpm generate` | Generate Prisma Client and sync metadata |
| `pnpm seed` | Seed database |
| `pnpm reset` | Reset database |
| `pnpm ts` | TypeScript type checking |
| `pnpm type-coverage` | Check type coverage (95% threshold) |
| `pnpm validate` | Run all quality checks (ts + check + type-coverage + test) |

---

# Database

The project uses Prisma with PostgreSQL.

Main modules include:

- Authentication
- Businesses
- Branches
- Memberships
- Products
- Categories
- Units
- Product Variants
- Product Components
- Inventory
- Inventory Movements
- Suppliers
- Purchases
- Customers
- Orders
- Transactions
- Payments
- Notifications
- Vendor Sessions
- Operational Tasks
- Sequence Counters
- System Configuration

---

# Design Goals

- Offline-first
- Local-first user experience
- Multi-tenant
- Scalable
- Business agnostic
- Highly configurable
- Mobile friendly
- Progressive Web App
- Type-safe
- Modular architecture

---

# Future Plans

- Cloud synchronization
- Real-time collaboration
- Barcode scanner support
- Receipt designer
- Kitchen Display System
- Customer loyalty
- Promotions engine
- Multi-currency support
- Analytics dashboard
- AI-powered inventory forecasting
- Plugin system

---

# License

This project is private and proprietary.

All rights reserved.
