// test/api/stripe-webhook-failed.test.ts
// [GAP-1 PR4b T-PR4b-2] `payment_intent.payment_failed` — RED.
//
// Coverage:
//   - T-F-1: pending Order + failed webhook → payment_failed + redacted audit + status history + email
//   - T-F-2: no Order → warn + ack 200
//   - T-F-3: paid Order → warn + ack 200 (no transition)
//   - T-F-4: cancelled Order → ack 200 (terminal)
//   - T-F-5: refunded Order → ack 200 (terminal)
//   - T-F-6: missing metadata.orderId, paymentIntentId match → same as T-F-1
//   - T-F-7: missing metadata.orderId, no paymentIntentId match → warn + ack 200
//
// These tests rely on the PR1+2 transition matrix (pending → payment_failed,
// payment_failed → pending, payment_failed → cancelled, payment_failed is NOT
// terminal) and on the redaction contract (R-PFS-5: only `{ code,
// failure_message }` is persisted; no `decline_code`, no payment_method
// details).

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

describe('[GAP-1 PR4b] payment_intent.payment_failed — handler RED', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        // [GAP-1 PR4b R-PFS-6] Honor DISABLE_EMAIL_NOTIFICATIONS — tests must NOT
        // depend on the email webhook firing. Keep it off.
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function sendFailed(payload: object) {
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

    // T-F-1: pending Order transitions to payment_failed, audit is redacted,
    // status history entry created, email note captured.
    it('T-F-1: pending Order transitions to payment_failed with redacted audit', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-1 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f1', email: 'f1@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'pending',
        }, user.id);

        const eventId = `evt_f1_${Date.now()}`;
        const response = await sendFailed({
            id: eventId,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f1',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: {
                        code: 'card_declined',
                        message: 'Your card was declined.',
                        // [GAP-1 PR4b R-PFS-5] Sensitive fields that MUST be redacted.
                        decline_code: 'do_not_honor',
                        payment_method_details: {
                            card: { last4: '1234', brand: 'visa' },
                        },
                    },
                },
            },
        });

        // Dispatcher + ledger must ack 200 (no Stripe retry storm).
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Order transitioned to payment_failed.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');

        // Audit contains ONLY { code, failure_message } — no decline_code,
        // no payment_method_details, no last4.
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'card_declined',
            failure_message: 'Your card was declined.',
        });

        // Status history has null → pending (from afterCreate) and pending → payment_failed.
        const history = await strapi.entityService.findMany(
            'api::order-status-history.order-status-history',
            { filters: { order: order.id } as any }
        ) as any[];
        const transitions = history.map((h) => `${h.fromStatus}->${h.toStatus}`);
        expect(transitions).toContain('null->pending');
        expect(transitions).toContain('pending->payment_failed');

        // [GAP-1 PR4b R-PFS-6 / D-DESIGN-7] statusChangeNote set to
        // "Payment failed: <failure_message>" so the email/webhook payload
        // can include it.
        expect(after.statusChangeNote).toBe('Payment failed: Your card was declined.');

        // Ledger row exists with the eventId.
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { eventId } }
        ) as any[];
        expect(ledger.length).toBe(1);
        expect(ledger[0].outcome).toBe('processed');

        // Stock unchanged (payment never confirmed → no decrement).
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(10);
    });

    // T-F-2: no Order → warn + ack 200 (R-SW-5 / S-SW-5).
    it('T-F-2: no matching Order → warn + ack 200', async () => {
        const response = await sendFailed({
            id: `evt_f2_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f2_unknown',
                    metadata: { orderId: 'ord_f2_does_not_exist', userId: '999' },
                    last_payment_error: {
                        code: 'card_declined',
                        message: 'Your card was declined.',
                    },
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // No Order created as side effect.
        const orders = await strapi.entityService.findMany('api::order.order', {
            filters: { orderId: 'ord_f2_does_not_exist' } as any,
        });
        expect(orders.length).toBe(0);
    });

    // T-F-3: paid Order → warn + ack 200 (no transition; S-OSA-6 case
    // is owned by the enrichment gate in lifecycles.ts, NOT this webhook).
    it('T-F-3: failed webhook on paid Order → warn + ack 200, no transition', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-3 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f3', email: 'f3@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'paid',
        }, user.id);

        const response = await sendFailed({
            id: `evt_f3_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f3',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Order status UNCHANGED (still paid).
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('paid');
        // No audit overwrite.
        expect(after.paymentInfo?.paymentError).toBeUndefined();
    });

    // T-F-4: cancelled Order is terminal — webhook acks 200, no transition.
    it('T-F-4: failed webhook on cancelled Order → ack 200, no transition', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-4 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f4', email: 'f4@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'cancelled',
        }, user.id);

        const response = await sendFailed({
            id: `evt_f4_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f4',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('cancelled');
        expect(after.paymentInfo?.paymentError).toBeUndefined();
    });

    // T-F-5: refunded Order is terminal — webhook acks 200, no transition.
    it('T-F-5: failed webhook on refunded Order → ack 200, no transition', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-5 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f5', email: 'f5@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'refunded',
        }, user.id);

        const response = await sendFailed({
            id: `evt_f5_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f5',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('refunded');
        expect(after.paymentInfo?.paymentError).toBeUndefined();
    });

    // T-F-6: missing metadata.orderId but paymentIntentId matches → fallback
    // correlation works (R-SW-6).
    it('T-F-6: missing metadata.orderId with paymentIntentId match → fallback correlation works', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-6 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f6', email: 'f6@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'pending',
        }, user.id);

        // Stamp the paymentIntentId on the pending order so fallback lookup works.
        await strapi.documents('api::order.order').update({
            documentId: order.documentId,
            data: { paymentIntentId: 'pi_f6_legacy' } as any,
        });

        const response = await sendFailed({
            id: `evt_f6_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f6_legacy',
                    metadata: { userId: String(user.id) }, // no orderId
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'card_declined',
            failure_message: 'declined',
        });
    });

    // T-F-7: missing metadata.orderId AND no paymentIntentId match → warn + 200.
    it('T-F-7: missing metadata.orderId with no paymentIntentId match → warn + 200', async () => {
        const response = await sendFailed({
            id: `evt_f7_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f7_unknown',
                    metadata: {}, // no orderId
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Ledger row was written (event was acked).
        const ledger = await (getStrapi() as any).entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { paymentIntentId: 'pi_f7_unknown' } as any }
        ) as any[];
        expect(ledger.length).toBe(1);
    });

    // T-F-8: re-delivery of same event.id for a failed payment is idempotent.
    it('T-F-8: re-delivery of same event.id is idempotent (no double transition)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-8 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f8', email: 'f8@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'pending',
        }, user.id);

        const payload = {
            id: `evt_f8_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f8',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        };

        const r1 = await sendFailed(payload);
        expect(r1.status).toBe(200);

        // Second delivery with same event.id → duplicate → ack 200, no side effects.
        const r2 = await sendFailed(payload);
        expect(r2.status).toBe(200);

        // Only one ledger row.
        const ledger = await strapi.entityService.findMany(
            'api::webhook-event.webhook-event',
            { filters: { eventId: payload.id } }
        ) as any[];
        expect(ledger.length).toBe(1);

        // Status history has exactly one `pending → payment_failed` transition.
        const history = await strapi.entityService.findMany(
            'api::order-status-history.order-status-history',
            { filters: { order: order.id } as any }
        ) as any[];
        const failureTransitions = history.filter((h) => h.fromStatus === 'pending' && h.toStatus === 'payment_failed');
        expect(failureTransitions.length).toBe(1);
    });

    // T-F-9: cancellation_requested Order can also transition to payment_failed
    // (same allowed transition list as pending).
    it('T-F-9: cancellation_requested Order transitions to payment_failed', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-9 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f9', email: 'f9@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'cancellation_requested',
        }, user.id);

        const response = await sendFailed({
            id: `evt_f9_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f9',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    last_payment_error: { code: 'card_declined', message: 'declined' },
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'card_declined',
            failure_message: 'declined',
        });
    });

    // T-F-10: missing last_payment_error → audit falls back to safe defaults.
    it('T-F-10: missing last_payment_error → safe defaults `{ unknown, Unknown failure }`', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-F-10 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'f10', email: 'f10@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'pending',
        }, user.id);

        const response = await sendFailed({
            id: `evt_f10_${Date.now()}`,
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_f10',
                    metadata: { orderId: order.orderId, userId: String(user.id) },
                    // No last_payment_error at all.
                },
            },
        });

        expect(response.status).toBe(200);

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'unknown',
            failure_message: 'Unknown failure',
        });
    });
});
