import type { Transaction } from '@tanstack/db'

export class LocalDBTransaction {
  // biome-ignore lint/suspicious/noExplicitAny: internal stack needs to hold diverse transaction types
  private txStack: Transaction<any>[] = []

  /**
   * Executes a collection insert and tracks it for potential rollback.
   * Ensures local persistence before moving to the next step.
   */
  async step<T extends object>(txInput: Transaction<T> | Promise<Transaction<T>>): Promise<Transaction<T>> {
    try {
      const tx = await txInput
      this.txStack.push(tx)
      // await tx.isPersisted.promise

      return tx
    } catch (error) {
      await this.rollback()
      throw error
    }
  }

  /**
   * Reverts all successful steps in reverse order (LIFO).
   */
  async rollback() {
    // Create a copy and reverse to avoid mutating while iterating
    const snapshots = [...this.txStack].reverse()
    this.txStack = [] // Clear stack immediately to prevent double-rollback loops

    for (const tx of snapshots) {
      try {
        // Only attempt rollback if the transaction isn't already 'committed' or 'failed'
        // TanStack DB transactions are one-time use.
        await tx.rollback()
        // biome-ignore lint/suspicious/noExplicitAny: We want to catch all errors during rollback to ensure we attempt to revert every step.
      } catch (e: any) {
        // We silence the "already completed" error because it means
        // the DB has already purged the transaction or finalized it.
        if (e.message?.includes('already completed')) {
          continue
        }
        console.error('Serious rollback failure:', e)
      }
    }
  }
}
