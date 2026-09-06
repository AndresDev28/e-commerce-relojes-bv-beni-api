// test/api/stripe-webhook-succeeded.test.ts
// [GAP-1 PR4a T-PR4a-4] Succeeded-event reconciliation — RED.
//
// Coverage:
//   - T-PS-1: pending Order + succeeded webhook → paid + stock decrement
//   - T-PS-2: same event → webhook_events ledger row exists (processed)
//   - T-PS-3: same event re-delivered (same event.id) → no double decrement,
//     returns 200, no side effects (S-SW-9 idempotency)
//   - T-PS-4: metadata.orderId absent, paymentIntentId present → lookup by
//     paymentIntentId succeeds; same reconciliation as T-PS-1 (R-SW-6)
//
// These tests rely on the PR3 stock-authority contract:
//   - The webhook transitions pending → paid.
//   - afterUpdate's enrichment gate decrements stock via
//     decrementStockOnce (CAS on stockDeducted) — single source of truth.

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

describe('[GAP-1 PR4a] payment_intent.succeeded — pending Order reconciliation', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Helper: build + sign a payment_intent.succeeded payload.
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

    // T-PS-1: pending Order + succeeded webhook → paid + stock decrement.
    it('T-PS-1: pending Order transitions to paid and stock is decremented once', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-PS-1 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'ps1', email: 'ps1@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 3 }],
            subtotal: 300,
            shipping: 0,
            total: 300,
            orderStatus: 'pending',
        }, user.id);

        const response = await sendSucceeded({
            id: `evt_ps1_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_ps1',
                    amount: 30000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Order transitioned to paid.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('paid');
        // Stock decremented exactly once.
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(7); // 10 - 3

        // stockDeducted marker flipped to true (PR3 enrichment gate claim).
        expect(after.stockDeducted).toBe(true);

        // Status history entry pending → paid.
        const history = await strapi.entityService.findMany(
            'api::order-status-history.order-status-history',
            { filters: { order: order.id } }
        ) as any[];
        expect(history.length).toBeGreaterThanOrEqual(2);
        const transitions = history.map((h) => `${h.fromStatus}->${h.toStatus}`);
        expect(transitions).toContain('null->pending');
        expect(transitions).toContain('pending->paid');
    });

    // T-PS-2: webhook_events ledger row exists with outcome=processed.
    it('T-PS-2: webhook_events ledger row is created with outcome=processed', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-PS-2 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'ps2', email: 'ps2@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'pending',
        }, user.id);

        const eventId = `evt_ps2_${Date.now()}`;
        const response = await sendSucceeded({
            id: eventId,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_ps2',
                    amount: 10000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        });

        expect(response.status).toBe(200);

        const ledgerRows = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { eventId } }
        ) as any[];
        expect(ledgerRows.length).toBe(1);
        expect(ledgerRows[0].eventType).toBe('payment_intent.succeeded');
        expect(ledgerRows[0].outcome).toBe('processed');
    });

    // T-PS-3: re-delivery of same event.id → no double decrement, no side effects.
    it('T-PS-3: re-delivery of same event.id is idempotent (no double decrement)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-PS-3 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'ps3', email: 'ps3@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 4 }],
            subtotal: 400, shipping: 0, total: 400,
            orderStatus: 'pending',
        }, user.id);

        const payload = {
            id: `evt_ps3_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_ps3',
                    amount: 40000,
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                },
            },
        };

        const r1 = await sendSucceeded(payload);
        expect(r1.status).toBe(200);

        // First delivery decrements: 10 - 4 = 6
        let p: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(p.stock).toBe(6);

        // Second delivery (same event.id) → duplicate → ack 200, no side effects.
        const r2 = await sendSucceeded(payload);
        expect(r2.status).toBe(200);
        expect(r2.body).toEqual({ received: true });

        // Stock unchanged: still 6.
        p = await strapi.db.connection('products').where('id', product.id).first();
        expect(p.stock).toBe(6);

        // Only one ledger row exists.
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { eventId: payload.id } }
        ) as any[];
        expect(ledger.length).toBe(1);
    });

    // T-PS-4: missing metadata.orderId, paymentIntentId present → fallback lookup succeeds.
    it('T-PS-4: missing metadata.orderId with paymentIntentId correlation still reconciles', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-PS-4 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'ps4', email: 'ps4@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'pending',
        }, user.id);

        // Stamp the paymentIntentId onto the pending order so the fallback lookup works.
        await strapi.documents('api::order.order').update({
            documentId: order.documentId,
            data: { paymentIntentId: 'pi_ps4_legacy' } as any,
        });

        // Webhook with metadata.orderId absent, paymentIntentId present.
        const response = await sendSucceeded({
            id: `evt_ps4_${Date.now()}`,
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_ps4_legacy',
                    amount: 20000,
                    metadata: { userId: String(user.id) }, // no orderId
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('paid');

        const p: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(p.stock).toBe(8); // 10 - 2
    });
});
