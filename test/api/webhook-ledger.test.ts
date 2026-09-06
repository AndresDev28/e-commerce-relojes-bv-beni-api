/**
 * [GAP-1 PR1+2] webhook_events ledger — schema, uniqueness, retention contract.
 *
 * These tests describe the SHAPE of the ledger and the cron retention
 * sweep. They are written BEFORE the GREEN implementation so that the
 * schema, unique constraint, enum, and the cron rule are all locked by
 * failing-then-passing assertions.
 *
 * Coverage:
 *   - L-1  unique `eventId` (DB-level violation on duplicate insert)
 *   - L-2  `outcome` enum accepts only `processed | unmatched`
 *   - L-3  `paymentIntentId` is optional (null allowed)
 *   - L-4  `processedAt` is required (insert without it fails)
 *   - L-5  retention sweep selects rows older than 90 days
 *   - L-6  retention sweep deletes only rows older than 90 days
 *
 * Spec refs:
 *   - R-SW-3 (idempotency ledger, unique eventId)
 *   - R-SW-9 (transactional ledger; unique-violation path)
 *   - D-DESIGN-3 (ledger shape)
 *   - D-DESIGN-8 step 1 (retention policy)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    getStrapi,
    resetDatabase,
    setupStrapi,
    cleanupStrapi,
} from '../helpers/strapi-test-helpers';
import { createTestWebhookEvent } from '../helpers/webhook-event-factory';

describe('[GAP-1 PR1+2] webhook_events ledger contract', () => {
    beforeEach(async () => {
        await resetDatabase();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('[L-1] rejects a second ledger row with the same eventId (unique constraint)', async () => {
        const strapi = getStrapi();
        const sharedEventId = `evt_duplicate_${Date.now()}`;

        const first = await createTestWebhookEvent(strapi, { eventId: sharedEventId });
        expect(first).toBeDefined();

        // The unique constraint lives at the DB layer (Strapi 5 sets it via
        // `"unique": true` on `eventId`); the second insert must throw.
        await expect(
            createTestWebhookEvent(strapi, {
                eventId: sharedEventId,
                eventType: 'payment_intent.payment_failed',
            })
        ).rejects.toThrow();

        // The ledger must still hold exactly one row for that eventId.
        const rows = await strapi.entityService.findMany('api::webhook-event.webhook-event', {
            filters: { eventId: sharedEventId },
        });
        expect(Array.isArray(rows) ? rows.length : rows ? 1 : 0).toBe(1);
    });

    it('[L-2] rejects an outcome value outside the allowed enum (processed | unmatched)', async () => {
        const strapi = getStrapi();

        // `failed` is intentionally NOT a valid outcome (D-DESIGN-3) — a
        // thrown handler must rollback the ledger row instead of persisting
        // it under a unique eventId, otherwise R-SW-9 re-processing breaks.
        await expect(
            createTestWebhookEvent(strapi, { outcome: 'failed' as any })
        ).rejects.toThrow();

        // Sanity check: `processed` and `unmatched` round-trip cleanly.
        const processed = await createTestWebhookEvent(strapi, {
            eventId: `evt_proc_${Date.now()}_a`,
            outcome: 'processed',
        });
        expect((processed as any).outcome).toBe('processed');

        const unmatched = await createTestWebhookEvent(strapi, {
            eventId: `evt_unm_${Date.now()}_a`,
            outcome: 'unmatched',
        });
        expect((unmatched as any).outcome).toBe('unmatched');
    });

    it('[L-3] allows paymentIntentId to be null (no required constraint)', async () => {
        const strapi = getStrapi();

        // Charge-style events (e.g. charge.refunded) have no PaymentIntent
        // correlation; the column must accept null.
        const row = await createTestWebhookEvent(strapi, {
            eventId: `evt_null_pi_${Date.now()}`,
            paymentIntentId: null,
            eventType: 'charge.refunded',
        });

        expect(row).toBeDefined();
        const fetched = (await strapi.entityService.findOne(
            'api::webhook-event.webhook-event',
            (row as any).id
        )) as any;
        expect(fetched).toBeDefined();
        // SQLite returns null for absent columns; Strapi coerces to undefined
        // in some shapes. Either is acceptable for the optional contract.
        expect(fetched.paymentIntentId == null).toBe(true);
    });

    it('[L-4] rejects an insert without processedAt (required datetime)', async () => {
        const strapi = getStrapi();

        // The retention sweep selects by processedAt, so a missing value
        // would silently keep the row forever. The schema MUST require it.
        await expect(
            strapi.entityService.create('api::webhook-event.webhook-event', {
                data: {
                    eventId: `evt_no_ts_${Date.now()}`,
                    eventType: 'payment_intent.succeeded',
                    outcome: 'processed',
                } as any,
            })
        ).rejects.toThrow();
    });

    it('[L-5] retention sweep selects rows older than 90 days', async () => {
        const strapi = getStrapi();

        const now = Date.now();
        const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

        // Pin Date.now() so the test is deterministic.
        const fixedNow = now;
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

        // Stale (95 days old) — must be selected
        await createTestWebhookEvent(strapi, {
            eventId: `evt_stale_${now}_a`,
            processedAt: new Date(fixedNow - (95 * 24 * 60 * 60 * 1000)),
        });
        // Stale boundary (90 days + 1 ms) — must be selected
        await createTestWebhookEvent(strapi, {
            eventId: `evt_stale_${now}_b`,
            processedAt: new Date(fixedNow - NINETY_DAYS_MS - 1),
        });
        // Fresh (1 day old) — must NOT be selected
        await createTestWebhookEvent(strapi, {
            eventId: `evt_fresh_${now}_a`,
            processedAt: new Date(fixedNow - 24 * 60 * 60 * 1000),
        });
        // Exactly 90 days — must NOT be selected (the cutoff is `<`, not `<=`)
        await createTestWebhookEvent(strapi, {
            eventId: `evt_edge_${now}_a`,
            processedAt: new Date(fixedNow - NINETY_DAYS_MS),
        });

        // Drive the cron task directly (no waiting for the scheduler).
        // We import it lazily so the test stays a pure integration test
        // and we can pin Date.now() before invocation.
        const cron = (await import('../../config/cron-tasks')).default as any;
        await cron.webhookLedgerRetention.task({ strapi });

        const remaining = (await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            {}
        )) as any[];

        const ids = remaining.map((r) => r.eventId);
        // The two stale rows must be gone.
        expect(ids).not.toContain(`evt_stale_${now}_a`);
        expect(ids).not.toContain(`evt_stale_${now}_b`);
        // The fresh row and the exactly-90-day row must remain.
        expect(ids).toContain(`evt_fresh_${now}_a`);
        expect(ids).toContain(`evt_edge_${now}_a`);
    });
});

// Suite-level Strapi lifecycle (no Strapi = no ledger content type).
// Setup is shared globally in test/setup.ts; this file relies on it.
void setupStrapi;
void cleanupStrapi;
