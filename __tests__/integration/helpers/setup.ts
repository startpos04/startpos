/**
 * setup.ts  (integration per-file setup)
 *
 * Runs once per test FILE (not per test case) because Vitest's setupFiles
 * hook runs in the worker before the first test in the file executes.
 *
 * Responsibilities:
 *   - Registers a global afterAll that disconnects the test DB client so
 *     the worker process can exit cleanly.
 *
 * Per-test isolation is handled by withRollback() in individual test cases.
 */

import { afterAll } from 'vitest'
import { disconnectTestDb } from './test-db'

afterAll(async () => {
  await disconnectTestDb()
})
