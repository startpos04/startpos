/**
 * production/index.ts
 *
 * Central export point for the production module engines.
 */

export { ProductionEngine } from './production-engine'
export type {
  MaterialRequirement,
  CreateProductionOrderParams,
  StartProductionParams,
  CompleteProductionParams,
  CancelProductionParams,
  CalculateMaterialRequirementsParams,
} from './production-engine'

export { FinishedGoodsEngine, ConcurrencyError } from './finished-goods-engine'
export type {
  ConsumeFinishedGoodsParams,
  ConsumptionResult,
  ExpiringBatch,
} from './finished-goods-engine'

export { WasteEngine } from './waste-engine'
export type {
  RecordWasteParams,
  WasteSummary,
  DateRange,
} from './waste-engine'
