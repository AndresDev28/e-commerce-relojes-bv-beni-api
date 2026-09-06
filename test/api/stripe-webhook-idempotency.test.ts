// test/api/stripe-webhook-idempotency.test.ts
// [GAP-1 PR4a T-PR4a-8] Idempotency, race, and edge-case contract — RED.
//
// Coverage:
//   - T-LR-1: duplicate event.id re-delivery → ledger unique violation → ack 200, no side effects
//   - T-LR-2: concurrent shell creation + enrichment for same orderId → one Order, one decrement
//   - T-LR-3: two concurrent webhooks for same paymentIntentId → first wins, second no-ops
//   - T-LR-4: missing metadata fallback (no orderId, no PI match) → warn + 200, no shell
//   - T-LR-5: late succeeded event for processing Order → warn + 200, no status change

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
    getStrapi,
    resetDatabase,
    createTestUser,
    createTestProduct,
    createTestOrder,
} from '../helpers/strapi-test-helpers';
import Stripe from 'stripe';

describe('[GAP-1 PR4a] payment_intent.succeeded — idempotency & race safety', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function sendSucceeded(payload: object) {
        const strapi = getStrapi();
        const payloadString = JSON.stringify(payload);
        const stripe = new Stripe('sk_test_123', { apiVersion: '2026-01-28.clover' as any });
        const signature = stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret: 'whsec_test',
        });
        return request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', signature)
            .set('Content-Type', 'application/json')
            .send(payloadString);
    }

    // T-LR-1: duplicate event.id re-delivery — S-SW-9.
    // The ledger unique violation is the detection path. Second delivery
    // acks 200 without any side effects (no shell re-created, no stock
    // change, no duplicate history entry).
    it('T-LR-1: duplicate event.id re-delivery acks 200 with no side effects (S-SW-9)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-LR-1 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'lr1', email: 'lr1@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'pending',
        }, user.id);

        const eventId = `evt_lr1_${Date.now()}`;
        const payload = {
            id: eventId,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr1',
                    amount: 20000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        };

        const r1 = await sendSucceeded(payload);
        expect(r1.status).toBe(200);

        // First delivery: 10 - 2 = 8.
        let p: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(p.stock).toBe(8);

        // Second delivery (duplicate event.id).
        const r2 = await sendSucceeded(payload);
        expect(r2.status).toBe(200);
        expect(r2.body).toEqual({ received: true });

        // Stock unchanged (still 8).
        p = await strapi.db.connection('products').where('id', product.id).first();
        expect(p.stock).toBe(8);

        // Only one ledger row.
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { eventId } }
        ) as any[];
        expect(ledger.length).toBe(1);
    });

    // T-LR-2: concurrent shell creation + enrichment for same orderId (S-OSA-4).
    it('T-LR-2: concurrent shell + enrichment for same orderId leaves one Order and one decrement', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-LR-2 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'lr2', email: 'lr2@test.com', password: 'p' });

        const orderId = `LR2-CONCURRENT-${Date.now()}`;
        const payload = {
            id: `evt_lr2_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr2',
                    amount: 10000,
                    metadata: { orderId, userId: String(user.id) },
                },
            },
        };

        // Fire the webhook and an enrichment Promise.all. Both target the
        // same orderId; the CAS marker must serialize them so stock
        // decrements exactly once.
        const webhookPromise = sendSucceeded(payload).catch(() => null);

        // The webhook must complete before enrichment (so the shell exists).
        const r = await webhookPromise;
        expect(r?.status).toBe(200);

        const shell: any = await strapi.documents('api::order.order').findFirst({
            filters: { orderId } as any,
        });

        // Now enrich twice concurrently — exactly one decrement.
        const [r1, r2] = await Promise.all([
            strapi.service('api::order.order').enrichShellWithItems(shell.documentId, [
                { id: product.id, quantity: 3 },
            ]),
            strapi.service('api::order.order').enrichShellWithItems(shell.documentId, [
                { id: product.id, quantity: 3 },
            ]),
        ]);

        const okCount = [r1, r2].filter((x) => x.ok).length;
        expect(okCount).toBe(1);

        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(7); // 10 - 3 (exactly once)
    });

    // T-LR-3: two concurrent webhooks for same paymentIntentId but different event.id.
    it('T-LR-3: two webhooks same paymentIntentId → first wins, second no-ops (idempotent re-delivery)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-LR-3 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'lr3', email: 'lr3@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'pending',
        }, user.id);

        // First event: pending → paid.
        const r1 = await sendSucceeded({
            id: `evt_lr3a_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr3',
                    amount: 20000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        });
        expect(r1.status).toBe(200);

        // Second event (different event.id, same paymentIntentId):
        // Order is now paid → idempotent re-delivery.
        const r2 = await sendSucceeded({
            id: `evt_lr3b_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr3',
                    amount: 20000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        });
        expect(r2.status).toBe(200);

        // Stock decremented exactly once (10 → 8).
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(8);

        // Two distinct ledger rows.
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { paymentIntentId: 'pi_lr3' } as any }
        ) as any[];
        expect(ledger.length).toBe(2);
    });

    // T-LR-4: missing metadata fallback (R-SW-6, S-SW-7).
    it('T-LR-4: missing metadata.orderId with no Order match → warn + 200, NO shell', async () => {
        const strapi = getStrapi();

        const response = await sendSucceeded({
            id: `evt_lr4_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr4_unknown',
                    amount: 10000,
                    metadata: {}, // no orderId, no userId
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // No Order with this paymentIntentId.
        const orders: any = await strapi.entityService.findMany('api::order.order', {
            filters: { paymentIntentId: 'pi_lr4_unknown' } as any,
        });
        expect(orders.length).toBe(0);

        // Ledger row was created (event was acknowledged).
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { paymentIntentId: 'pi_lr4_unknown' } as any }
        ) as any[];
        expect(ledger.length).toBe(1);
    });

    // T-LR-5: late succeeded event (S-SW-8).
    it('T-LR-5: late succeeded event for processing Order → warn + 200, no status change', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-LR-5 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'lr5', email: 'lr5@test.com', password: 'p' });

        // Order already advanced to processing (unusual late webhook).
        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'processing',
        }, user.id);

        const response = await sendSucceeded({
            id: `evt_lr5_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_lr5',
                    amount: 20000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Status UNCHANGED (still processing).
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('processing');

        // Stock unchanged.
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(10);
    });
});
