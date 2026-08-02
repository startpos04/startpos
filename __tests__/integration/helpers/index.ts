/**
 * Integration test helpers — barrel export.
 *
 * Test files import from this single entry point:
 *
 *   import {
 *     getTestPrisma,
 *     withRollback,
 *     cleanTables,
 *     dbDescribe,
 *     seedTenant,
 *     seedProduct,
 *     seedSupplier,
 *     seedUnit,
 *   } from '#tests/integration/helpers'
 */

export { getTestPrisma, getTestClient, withRollback, cleanTables, disconnectTestDb, dbDescribe } from './test-db'
export { seedTenant, seedProduct, seedUnit, seedSupplier } from './fixtures'
export type { TenantFixture, ProductFixture, UnitFixture, SupplierFixture } from './fixtures'
