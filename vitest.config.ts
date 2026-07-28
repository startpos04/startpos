/// <reference types="vitest" />

import path from 'node:path'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // Use the test tsconfig so test-specific types (vitest/globals, @testing-library/jest-dom)
    // are available without polluting the main tsconfig.
    tsconfigPaths({ projects: ['./tsconfig.test.json'] }),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      prisma: path.resolve(__dirname, './prisma'),
      '#tests': path.resolve(__dirname, './__tests__'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
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
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
})
