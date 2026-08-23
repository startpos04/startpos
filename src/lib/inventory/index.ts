/**
 * inventory/index.ts — Barrel export for inventory modules
 * 
 * Centralizes exports for inventory-related functionality:
 * - Error classes for structured error handling
 * - Policy layer for mode-based validation
 * - Utility to get inventory mode from business
 * - (Future) Inventory engine for mutations
 */

export { InsufficientStockError } from './errors'
export { InventoryPolicy, type InventoryMode } from './inventory-policy'
export { getInventoryMode } from './get-inventory-mode'
