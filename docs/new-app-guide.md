# Adding a New App to the Monorepo

This guide walks through creating a new app (e.g. `apps/admin`) that shares the platform foundation with `apps/web`.

---

## What the Platform Provides

Everything in `packages/platform/` is available to any app via the `@platform/*` alias:

| Import | What you get |
|---|---|
| `@platform/lib/better-auth/auth.ts` | `betterAuth()` config — DB, session, OAuth, OTP, rate limiting |
| `@platform/lib/better-auth/auth-client.ts` | Browser/SSR auth client |
| `@platform/lib/better-auth/auth-middleware.ts` | TanStack Start middleware that injects `businessId`/`branchId` into context |
| `@platform/lib/better-auth/auth-store.ts` | Reactive auth state store (`authStore`, `setUser`, `refreshUser`, `resetAuth`) |
| `@platform/lib/better-auth/auth-engine.ts` | `loginOnline`, `loginOffline`, `logout`, `authorizeFeature` |
| `@platform/lib/better-auth/auth-server.ts` | `getSessionUser` (thin session read), `verifyAuth` (password re-check) |
| `@platform/lib/better-auth/entitlement-middleware.ts` | `requireCapability()` server fn middleware |
| `@platform/lib/better-auth/permission-middleware.ts` | `requirePermission()` server fn middleware |
| `@platform/lib/prisma-client/` | `prisma` (global), `getTenantPrisma` (multi-tenant), `executeOperation`, `DBPayload` |
| `@platform/lib/prisma-client/api-registry.ts` | `registerDataAPIs()` for db sync collections |
| `@platform/components/` | shadcn/ui components + custom components |
| `@platform/hooks/` | `useCapability`, `usePermission`, `useIsOnline`, etc. |
| `@platform/db/` | TanStack DB local-first sync collections (SQLite OPFS) |

---

## Step 1 — Scaffold the App

Create `apps/<name>/` with a `package.json`:

```json
{
  "name": "@startpos/<name>",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port 3001 --host 0.0.0.0",
    "build": "vite build",
    "type-check": "tsc --noEmit",
    "lint": "biome lint .",
    "check": "biome check --write ."
  },
  "dependencies": {
    "@startpos/platform": "workspace:*",
    "@tanstack/react-start": "^1.132.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "typescript": "^5.7.2",
    "vite": "^7.1.7"
  }
}
```

Add `apps/<name>/.env.example` with the vars your app needs (shared vars like `POSTGRES_*` come from `web/.env` via the generator).

Add `apps/<name>` to `scripts/generate-env.ts`:
```ts
const APPS: string[] = [
  'apps/web',
  'apps/<name>',   // ← add this
]
```

Then run:
```sh
pnpm env:generate
```

---

## Step 2 — Configure TypeScript

`apps/<name>/tsconfig.json`:

```json
{
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"],
  "compilerOptions": {
    "target": "ES2022",
    "jsx": "react-jsx",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"],
      "@platform/*": ["../../packages/platform/*"]
    }
  }
}
```

---

## Step 3 — Configure Vite

`apps/<name>/vite.config.ts`:

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@platform\/(.*)/,
        replacement: resolve(__dirname, '../../packages/platform') + '/$1',
      },
    ],
  },
  plugins: [
    viteTsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
  ],
})
```

---

## Step 4 — Wire the Auth Foundation

Every app needs to call `setupAuth()` once at startup. Create `src/lib/better-auth/auth-setup.ts`:

```ts
import { registerAuthUserProvider } from '@platform/lib/better-auth/auth-store'
import { registerDataAPIs } from '@platform/lib/prisma-client/api-registry'
import { getAuthUser } from '@/lib/better-auth/auth-server'
import { crudAPI } from '@/lib/prisma-client/crud-api'
import { transactionAPI } from '@/lib/prisma-client/transaction-api'

export function setupAuth(): void {
  registerAuthUserProvider(getAuthUser)
  registerDataAPIs({ crudAPI, transactionAPI })
}
```

Call it in your root route or entry point:
```ts
import { setupAuth } from '@/lib/better-auth/auth-setup'
setupAuth()
```

---

## Step 5 — Define Your Auth Context

Each app defines its own `getAuthUser` in `src/lib/better-auth/auth-server.ts`. This is where apps diverge:

- `apps/web` — full POS context: entitlements, compliance, billing, BOS fields, configs
- A simpler app — just calls `getSessionUser()` and returns it directly, or adds only what it needs

Minimal example (no subscription/compliance layer):

```ts
import { getSessionUser } from '@platform/lib/better-auth/auth-server'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { createServerFn } from '@tanstack/react-start'

export const getAuthUser = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async () => {
    return await getSessionUser()
  })

export type ServerUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>
```

---

## Step 6 — Define Your Data APIs

Each app defines its own `crudAPI` and `transactionAPI` in `src/lib/prisma-client/`. Apps that don't use multi-tenancy use `prisma` directly instead of `getTenantPrisma`:

```ts
// src/lib/prisma-client/crud-api.ts (non-tenant example)
import { prisma } from '@platform/lib/prisma-client'
import { executeOperation, type DBPayload } from '@platform/lib/prisma-client/crud-api'
import { authMiddleware } from '@platform/lib/better-auth/auth-middleware'
import { createServerFn } from '@tanstack/react-start'
import { err, ok, ResultAsync } from 'neverthrow'

const crudServerFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .inputValidator((d: DBPayload) => d)
  .handler(async ({ data }) => {
    const result = await ResultAsync.fromPromise(
      executeOperation(prisma, data),
      (e: any) => e.message || 'Database operation failed',
    )
    return result.isOk() ? { value: result.value } : { error: result.error }
  })

export const crudAPI = new Proxy({} as any, {
  get(_, table: string) {
    return async (action: string, args: any) => {
      const response = await crudServerFn({ data: { table, action, args } })
      if ('error' in response) return err(response.error)
      return ok(response.value)
    }
  },
})
```

---

## Step 7 — Add the API Route

For better-auth to work, add `src/routes/api/auth/$.ts`:

```ts
import { auth } from '@platform/lib/better-auth/auth'
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/auth/$')({
  GET:  ({ request }) => auth.handler(request),
  POST: ({ request }) => auth.handler(request),
})
```

---

## Step 8 — Add to pnpm-workspace.yaml

`pnpm-workspace.yaml` already includes `apps/*` so no change needed. Just run:

```sh
pnpm install
```

---

## Summary Checklist

```
apps/<name>/
  package.json                          ✓ @startpos/<name>, depends on @startpos/platform
  tsconfig.json                         ✓ @platform/* path alias
  vite.config.ts                        ✓ @platform/* resolve alias
  .env.example                          ✓ app-specific vars
  src/
    lib/
      better-auth/
        auth-server.ts                  ✓ getAuthUser (extend getSessionUser)
        auth-setup.ts                   ✓ setupAuth() — registers providers
      prisma-client/
        crud-api.ts                     ✓ crudAPI (tenant or non-tenant)
        transaction-api.ts              ✓ transactionAPI
    routes/
      api/auth/$.ts                     ✓ better-auth handler
      __root.tsx                        ✓ calls setupAuth()
```

The key insight: **the platform provides the wiring, each app defines its own context.** `getSessionUser()` is the shared foundation — apps layer on exactly what they need on top of it.
