/**
 * shared-handlers.ts
 *
 * Shared webhook handler infrastructure for multi-provider support.
 * Provides common webhook processing logic, idempotency, and routing.
 *
 * Design principles:
 * - Provider-agnostic webhook processing
 * - Idempotency using WebhookEvent model
 * - Common error handling and logging
 * - Event routing to appropriate business logic
 */

import { prisma } from '@platform/lib/prisma-client'
import type { PaymentProvider } from 'prisma/generated/prisma/enums'
import type { WebhookEvent } from '@/lib/billing/billing-provider'
import { WebhookOutcome, type WebhookProcessingResult } from '@/lib/billing/types'

/**
 * Webhook processor configuration
 */
export type WebhookProcessorConfig = {
  providerId: string
  skipIdempotencyCheck?: boolean
  maxRetries?: number
}

/**
 * Generic webhook event handler function signature
 */
export type WebhookEventHandler<_T = unknown> = (event: WebhookEvent, context: { providerId: string }) => Promise<WebhookProcessingResult>

/**
 * Webhook event router - maps event types to handlers
 */
export class WebhookEventRouter {
  private handlers = new Map<string, WebhookEventHandler>()

  /**
   * Register a handler for a specific event type
   */
  register(eventType: string, handler: WebhookEventHandler) {
    this.handlers.set(eventType, handler)
  }

  /**
   * Get handler for an event type
   */
  getHandler(eventType: string): WebhookEventHandler | null {
    return this.handlers.get(eventType) || null
  }

  /**
   * Get all registered event types
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

/**
 * Webhook idempotency manager using WebhookEvent model
 */
export class WebhookIdempotencyManager {
  /**
   * Check if webhook event was already processed
   */
  async isProcessed(providerId: string, eventId: string): Promise<boolean> {
    const existing = await prisma.webhookEvent.findUnique({
      where: {
        provider_externalId: {
          provider: providerId as PaymentProvider,
          externalId: eventId,
        },
      },
      select: { id: true },
    })

    return !!existing
  }

  /**
   * Mark webhook event as processed
   */
  async markProcessed(providerId: string, eventId: string, eventType: string, rawPayload: unknown, outcome: WebhookOutcome, message?: string): Promise<void> {
    try {
      // Map WebhookOutcome values to DB status strings
      const status = outcome === WebhookOutcome.PROCESSED ? 'PROCESSED' : outcome === WebhookOutcome.SKIPPED ? 'SKIPPED' : 'ERROR'

      await prisma.webhookEvent.upsert({
        where: {
          provider_externalId: {
            provider: providerId as PaymentProvider,
            externalId: eventId,
          },
        },
        create: {
          provider: providerId as PaymentProvider,
          externalId: eventId,
          eventType,
          rawPayload: rawPayload as import('prisma/generated/prisma/client').Prisma.InputJsonValue,
          status,
          ...(message !== undefined && { errorMessage: message }),
          processedAt: new Date(),
        },
        update: {
          status,
          ...(message !== undefined && { errorMessage: message }),
          processedAt: new Date(),
        },
      })
    } catch (error) {
      console.error('[WebhookIdempotency] Failed to mark event as processed:', error)
      // Don't throw - idempotency failure shouldn't break webhook processing
    }
  }
}

/**
 * Main webhook processor - handles common concerns for all providers
 */
export class WebhookProcessor {
  private router = new WebhookEventRouter()
  private idempotency = new WebhookIdempotencyManager()
  private config: WebhookProcessorConfig

  constructor(config: WebhookProcessorConfig) {
    this.config = config
  }

  /**
   * Register event handlers
   */
  registerHandler(eventType: string, handler: WebhookEventHandler) {
    this.router.register(eventType, handler)
  }

  /**
   * Process a webhook event with full error handling and idempotency
   */
  async processEvent(event: WebhookEvent): Promise<WebhookProcessingResult> {
    const { providerId } = this.config

    try {
      // Check idempotency first
      if (!this.config.skipIdempotencyCheck) {
        const alreadyProcessed = await this.idempotency.isProcessed(providerId, event.id)
        if (alreadyProcessed) {
          const result: WebhookProcessingResult = {
            eventId: event.id,
            eventType: event.type,
            outcome: WebhookOutcome.SKIPPED,
            message: 'Event already processed (idempotency check)',
          }
          return result
        }
      }

      // Find handler for event type
      const handler = this.router.getHandler(event.type)
      if (!handler) {
        const result: WebhookProcessingResult = {
          eventId: event.id,
          eventType: event.type,
          outcome: WebhookOutcome.SKIPPED,
          message: `No handler registered for event type: ${event.type}`,
        }

        // Mark unhandled events as processed to prevent retries
        await this.idempotency.markProcessed(providerId, event.id, event.type, event, result.outcome, result.message)

        return result
      }

      // Execute handler
      const result = await handler(event, { providerId })

      // Mark as processed (success or error)
      await this.idempotency.markProcessed(providerId, event.id, event.type, event, result.outcome, result.message)

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[WebhookProcessor] Error processing event ${event.id} (${event.type}):`, error)

      const result: WebhookProcessingResult = {
        eventId: event.id,
        eventType: event.type,
        outcome: WebhookOutcome.ERROR,
        message,
      }

      // Mark error events as processed to prevent infinite retries
      // Provider will retry based on HTTP status code
      await this.idempotency.markProcessed(providerId, event.id, event.type, event, result.outcome, result.message)

      return result
    }
  }

  /**
   * Get processing statistics
   */
  async getStats(
    providerId: string,
    hours: number = 24,
  ): Promise<{
    total: number
    processed: number
    skipped: number
    errors: number
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000)

    const stats = await prisma.webhookEvent.groupBy({
      by: ['status'],
      where: {
        provider: providerId as PaymentProvider,
        createdAt: { gte: since },
      },
      _count: {
        id: true,
      },
    })

    return {
      total: stats.reduce((sum, stat) => sum + stat._count.id, 0),
      processed: stats.find(s => s.status === 'PROCESSED')?._count.id ?? 0,
      skipped: stats.find(s => s.status === 'SKIPPED')?._count.id ?? 0,
      errors: stats.find(s => s.status === 'ERROR')?._count.id ?? 0,
    }
  }
}

/**
 * Create a webhook processor for a specific provider
 */
export function createWebhookProcessor(config: WebhookProcessorConfig): WebhookProcessor {
  return new WebhookProcessor(config)
}

/**
 * Standard HTTP response helper for webhook endpoints
 */
export function createWebhookResponse(result: WebhookProcessingResult): Response {
  const status = result.outcome === WebhookOutcome.ERROR ? 500 : 200

  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Standard error response helper for webhook endpoints
 */
export function createWebhookErrorResponse(error: string, status: number = 400): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
