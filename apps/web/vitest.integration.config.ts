/**
 * vitest.integration.config.ts
 *
 * Separate Vitest config for integration tests.
 *
 * Differences from vitest.config.ts (unit):
 *   - environment: 'node'  — no jsdom; tests run in a real Node context so
 *     Prisma's pg adapter can open real TCP connections.
 *   - include: '__tests__/integration/**' — completely separate glob so
 *     `pnpm test` (unit) and `pnpm test:integration` never mix.
 *   - globalSetup: provisions a test-only Postgres database before the suite
 *     and tears it down (or just disconnects) afterwards.
 *   - No coverage thresholds — integration tests are about correctness, not
 *     line counts.
 *   - poolOptions.forks.singleFork: true — all integration tests run in a
 *     single process so they share the same DB connection pool and don't
 *     fight over the schema.
 *
 * Run with:
 *   pnpm test:integration
 *
 * Requires a running Postgres instance. By default it targets a sibling
 * database called `start-pos-test` on the same host as the dev DB.
 * Override by setting TEST_DATABASE_URL in your .env.local.
 */

import path from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.test.json'] })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      prisma: path.resolve(__dirname, '../../packages/platform/prisma'),
      '#tests': path.resolve(__dirname, './__tests__'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Run all integration test workers in a single fork so they share the
    // same connection pool and avoid exhausting Postgres max_connections.
    // Vitest 4: singleFork is a top-level option (poolOptions was removed).
    singleFork: true,
    setupFiles: ['__tests__/integration/helpers/setup.ts'],
    globalSetup: ['__tests__/integration/helpers/global-setup.ts'],
    include: ['__tests__/integration/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Give DB-backed tests a generous timeout (default 5 s is too tight for
    // schema push + seed on CI).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential within each file so one test's DB state doesn't leak into
    // the next before the rollback has committed.
    sequence: {
      concurrent: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      // Write to a separate directory so unit and integration reports can
      // be merged by pnpm coverage:all without overwriting each other.
      reportsDirectory: 'coverage-integration',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'node_modules/**',
        'src/components/ui/**',
        'src/routeTree.gen.ts',
        'src/main.tsx',
        '**/*.d.ts',
        '**/*.test.*',
        'vite-plugin.ts',
        'src/test-setup.ts',
      ],
    },
  },
})
