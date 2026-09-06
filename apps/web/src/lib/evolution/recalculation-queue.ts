/**
 * recalculation-queue.ts — DB-backed recalculation queue types and interface (R1 fix)
 *
 * Principal Architect Review fix R1:
 *   The RecalculationScheduler must use a DB-backed queue — NOT an in-memory Map.
 *
 *   In-memory problem:
 *     - Jobs are silently lost on server restart
 *     - Multi-instance deployments have no coordination
 *     - Crashes between event emission and processing drop updates permanently
 *
 *   DB-backed solution:
 *     - One row per businessId with UNIQUE constraint (natural deduplication)
 *     - Scheduler upserts a row; job runner queries WHERE processedAt IS NULL
 *     - On server restart, nothing is lost — rows remain until processed
 *     - Multi-instance: row-level locking (SELECT FOR UPDATE SKIP LOCKED) handles coordination
 *
 * Schema (added to Prisma in the Phase 1 migration):
 *   model CharacteristicsRecalculationQueue {
 *     id          String    @id @default(cuid())
 *     businessId  String    @unique  ← deduplication
 *     priority    Int       @default(0)  ← higher = processed first
 *     scheduledAt DateTime  @default(now())
 *     processedAt DateTime? ← null = pending
 *     attempts    Int       @default(0)
 *     lastError   String?
 *     createdAt   DateTime  @default(now())
 *     updatedAt   DateTime  @updatedAt
 *   }
 *
 * Phase 1 note:
 *   The actual Prisma writes happen in the Phase 2 CharacteristicsEngine job.
 *   This file defines the types and the interface so Phase 2 has a stable contract
 *   to implement against. The DB table is added in the Phase 1 migration.
 */

// ---------------------------------------------------------------------------
// Queue entry type (mirrors the Prisma model)
// ---------------------------------------------------------------------------

export type RecalculationQueueEntry = {
  id: string
  businessId: string
  priority: RecalculationPriority
  scheduledAt: Date
  processedAt: Date | null
  attempts: number
  lastError: string | null
}

// ---------------------------------------------------------------------------
// Priority levels
// ---------------------------------------------------------------------------

/**
 * Priority values for the recalculation queue.
 * Higher numbers are processed first.
 */
export const RecalculationPriority = {
  /** Background decay sweep — lowest priority */
  BACKGROUND: 0,

  /** Deferred event batching (supplier added, product created, etc.) */
  DEFERRED: 10,

  /** Immediate recalculation (branch created, config changed, subscription upgraded) */
  IMMEDIATE: 100,
} as const

export type RecalculationPriority = (typeof RecalculationPriority)[keyof typeof RecalculationPriority]

// ---------------------------------------------------------------------------
// Queue interface — implemented in Phase 2 using getTenantPrisma
// ---------------------------------------------------------------------------

/**
 * Interface for the DB-backed recalculation queue.
 *
 * The concrete implementation is added in Phase 2 when the
 * CharacteristicsRecalculationQueue table exists and the job runner is built.
 *
 * Phase 1 provides a no-op implementation so the event bus can reference
 * this interface without the DB table existing yet.
 */
export interface RecalculationQueuePort {
  /**
   * Schedule a recalculation for the given business.
   * If a pending entry already exists for the businessId, upserts with the
   * higher priority value (ensures high-priority requests are not downgraded).
   */
  schedule(businessId: string, priority: RecalculationPriority): Promise<void>

  /**
   * Fetch the next batch of pending entries to process.
   * Uses SELECT FOR UPDATE SKIP LOCKED to support multiple job runner instances.
   */
  claimBatch(maxBatchSize: number): Promise<RecalculationQueueEntry[]>

  /**
   * Mark an entry as successfully processed.
   */
  markProcessed(id: string): Promise<void>

  /**
   * Mark an entry as failed with an error message.
   * The entry stays in the queue for retry (attempts incremented).
   */
  markFailed(id: string, error: string): Promise<void>
}

// ---------------------------------------------------------------------------
// No-op implementation (kept for tests and fallback)
// ---------------------------------------------------------------------------

/**
 * No-op queue implementation — used in tests and as a safe fallback.
 */
export const NoOpRecalculationQueue: RecalculationQueuePort = {
  async schedule(_businessId: string, _priority: RecalculationPriority): Promise<void> {},
  async claimBatch(_maxBatchSize: number): Promise<RecalculationQueueEntry[]> {
    return []
  },
  async markProcessed(_id: string): Promise<void> {},
  async markFailed(_id: string, _error: string): Promise<void> {},
}

// ---------------------------------------------------------------------------
// Real Prisma implementation (Phase 2)
// ---------------------------------------------------------------------------

/**
 * DB-backed queue implementation using rootPrisma.
 *
 * - schedule() upserts a single row per businessId (deduplication via UNIQUE constraint).
 *   If a pending entry already exists, the priority is updated to the MAX of the two values
 *   so a high-priority request is never downgraded by a later low-priority schedule.
 *
 * - claimBatch() returns the next N pending entries ordered by priority DESC, scheduledAt ASC.
 *   Uses a raw UPDATE … RETURNING to atomically claim rows and prevent double-processing
 *   across multiple job runner instances.
 *
 * - markProcessed() sets processedAt = now().
 * - markFailed() increments attempts and stores the error message.
 *   The row stays with processedAt = null so it is retried on the next run.
 *   After 3 failed attempts the row is left in place — an operator must clear it manually.
 */
export class PrismaRecalculationQueue implements RecalculationQueuePort {
  private readonly prisma: PrismaClientLike

  constructor(prisma: PrismaClientLike) {
    this.prisma = prisma
  }

  async schedule(businessId: string, priority: RecalculationPriority): Promise<void> {
    // Upsert: if a pending row exists, keep the higher priority value.
    // If the existing row is already processed (processedAt IS NOT NULL) insert a fresh one.
    await this.prisma.$executeRaw`
      INSERT INTO characteristics_recalculation_queue
        (id, business_id, priority, scheduled_at, processed_at, attempts, last_error, created_at, updated_at)
      VALUES
        (gen_random_uuid()::text, ${businessId}, ${priority}, now(), NULL, 0, NULL, now(), now())
      ON CONFLICT (business_id)
      DO UPDATE SET
        priority     = GREATEST(characteristics_recalculation_queue.priority, EXCLUDED.priority),
        scheduled_at = CASE
                         WHEN characteristics_recalculation_queue.processed_at IS NOT NULL
                         THEN now()
                         ELSE characteristics_recalculation_queue.scheduled_at
                       END,
        processed_at = CASE
                         WHEN characteristics_recalculation_queue.processed_at IS NOT NULL
                         THEN NULL
                         ELSE characteristics_recalculation_queue.processed_at
                       END,
        updated_at   = now()
    `
  }

  async claimBatch(maxBatchSize: number): Promise<RecalculationQueueEntry[]> {
    // Atomically claim up to maxBatchSize pending rows by setting processedAt = now().
    // ORDER BY priority DESC, scheduled_at ASC ensures highest-priority / oldest-first processing.
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string
        business_id: string
        priority: number
        scheduled_at: Date
        processed_at: Date | null
        attempts: number
        last_error: string | null
      }>
    >`
      UPDATE characteristics_recalculation_queue
      SET processed_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id
        FROM characteristics_recalculation_queue
        WHERE processed_at IS NULL
        ORDER BY priority DESC, scheduled_at ASC
        LIMIT ${maxBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, business_id, priority, scheduled_at, processed_at, attempts, last_error
    `

    return rows.map(r => ({
      id: r.id,
      businessId: r.business_id,
      priority: r.priority as RecalculationPriority,
      scheduledAt: r.scheduled_at,
      processedAt: r.processed_at,
      attempts: r.attempts,
      lastError: r.last_error,
    }))
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE characteristics_recalculation_queue
      SET processed_at = now(), updated_at = now()
      WHERE id = ${id}
    `
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE characteristics_recalculation_queue
      SET attempts   = attempts + 1,
          last_error = ${error},
          processed_at = NULL,
          updated_at = now()
      WHERE id = ${id}
    `
  }
}

/** Minimal interface so the queue does not import the full PrismaClient type */
interface PrismaClientLike {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

// ---------------------------------------------------------------------------
// Singleton — swap in tests with NoOpRecalculationQueue
// ---------------------------------------------------------------------------

import { prisma as rootPrisma } from '@platform/lib/prisma-client'

/**
 * The global recalculation queue singleton.
 * Server functions and job runners import this directly.
 * Tests replace it via dependency injection or module mocking.
 */
export const recalculationQueue: RecalculationQueuePort = new PrismaRecalculationQueue(rootPrisma as unknown as PrismaClientLike)
