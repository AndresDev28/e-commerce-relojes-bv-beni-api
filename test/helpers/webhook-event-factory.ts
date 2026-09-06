/**
 * createTestWebhookEvent
 *
 * [GAP-1 PR1+2] Test factory for the private `webhook_events` ledger
 * content type. Used by the ledger, race, and reconciliation tests in
 * PR1+2 and PR4a. The ledger rows are written exclusively from the
 * webhook handler (PR4a) — tests use this factory to bypass the
 * dispatch path and assert schema/constraint contracts directly.
 *
 * Defaults are tuned for the strictest assertions; tests can override
 * any field to exercise invalid-input paths.
 */
import type { Core } from '@strapi/strapi';

export interface TestWebhookEventOverrides {
    eventId?: string;
    eventType?: string;
    paymentIntentId?: string | null;
    orderId?: string | null;
    processedAt?: string | Date;
    outcome?: 'processed' | 'unmatched';
    errorMessage?: string | null;
}

export async function createTestWebhookEvent(
    strapi: Core.Strapi,
    overrides: TestWebhookEventOverrides = {}
) {
    const baseEvent = {
        eventId: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        eventType: 'payment_intent.succeeded',
        paymentIntentId: `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        orderId: null as string | null,
        processedAt: new Date(),
        outcome: 'processed' as 'processed' | 'unmatched',
        errorMessage: null as string | null,
        ...overrides,
    };

    return await strapi.entityService.create('api::webhook-event.webhook-event', {
        data: {
            eventId: baseEvent.eventId,
            eventType: baseEvent.eventType,
            paymentIntentId: baseEvent.paymentIntentId ?? undefined,
            orderId: baseEvent.orderId ?? undefined,
            processedAt:
                baseEvent.processedAt instanceof Date
                    ? baseEvent.processedAt.toISOString()
                    : baseEvent.processedAt,
            outcome: baseEvent.outcome,
            errorMessage: baseEvent.errorMessage ?? undefined,
        },
    });
}
