/**
 * errors.ts — Inventory-specific error types
 * 
 * Custom error classes for inventory operations, providing structured
 * error information for better error handling and user messaging.
 */

/**
 * InsufficientStockError
 * 
 * Thrown when attempting to deduct more inventory than available in strict mode.
 * Includes detailed information about the stock shortage for proper error handling.
 * 
 * Usage:
 * ```typescript
 * throw new InsufficientStockError(
 *   'Cannot sell 10 units with only 5 available',
 *   {
 *     variantId: 'abc123',
 *     available: 5,
 *     requested: 10,
 *     productName: 'Coffee Beans'
 *   }
 * )
 * ```
 */
export class InsufficientStockError extends Error {
  readonly name = 'InsufficientStockError'
  
  constructor(
    message: string,
    public readonly details: {
      /** The product variant ID that lacks stock */
      variantId: string
      /** Current available quantity */
      available: number
      /** Quantity that was requested */
      requested: number
      /** Human-readable product name (optional) */
      productName?: string
      /** Batch ID if applicable (optional) */
      batchId?: string
    }
  ) {
    super(message)
    
    // Maintains proper stack trace for where error was thrown (only in V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InsufficientStockError)
    }
  }
  
  /**
   * Returns a user-friendly error message
   */
  toUserMessage(): string {
    const product = this.details.productName || 'this item'
    const shortfall = this.details.requested - this.details.available
    
    if (this.details.available === 0) {
      return `${product} is out of stock`
    }
    
    return `Insufficient stock for ${product}. You need ${this.details.requested} but only ${this.details.available} available (${shortfall} short)`
  }
  
  /**
   * Type guard to check if an error is an InsufficientStockError
   */
  static isInsufficientStockError(error: unknown): error is InsufficientStockError {
    return error instanceof InsufficientStockError
  }
}
