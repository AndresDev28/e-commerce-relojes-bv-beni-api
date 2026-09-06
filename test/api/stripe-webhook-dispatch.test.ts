// test/api/stripe-webhook-dispatch.test.ts
// [GAP-1 PR4a T-PR4a-2] Dispatcher contract tests — RED.
//
// Spec coverage:
//   - R-SW-2 Event-Type Dispatch
//   - S-SW-3 Re-Delivery On Paid (covered in T-PR4a-4)
//   - S-SW-10 Refund Regression (charge.refunded preserved)
//
// Each test sends a valid Stripe-signed event through POST /api/orders/stripe-webhook
// and asserts the dispatcher routes correctly:
//   - T-D-1: payment_intent.succeeded → handlePaymentIntentSucceeded (stub throws)
//   - T-D-2: payment_intent.payment_failed → handlePaymentIntentPaymentFailed (stub throws)
//   - T-D-3: charge.refunded → handleChargeRefunded (existing behavior preserved)
//   - T-D-4: unhandled event type → { received: true }, no throw
//   - T-D-5: dispatcher does not throw on unhandled event types

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { getStrapi, resetDatabase } from '../helpers/strapi-test-helpers';
import Stripe from 'stripe';

describe('[GAP-1 PR4a] Stripe Webhook Dispatcher', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Helper to send a signed Stripe event through the controller.
    async function postWebhook(payloadString: string, secret = 'whsec_test') {
        const strapi = getStrapi();
        const stripe = new Stripe('sk_test_123', { apiVersion: '2026-01-28.clover' as any });
        const signature = stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret,
        });
        return request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', signature)
            .set('Content-Type', 'application/json')
            .send(payloadString);
    }

    // T-D-1: succeeded events must be routed to handlePaymentIntentSucceeded
    // and return 200 with `{ received: true }`. The stub currently throws
    // 'not implemented' → controller maps to 500 → RED. GREEN: returns 200.
    it('T-D-1: payment_intent.succeeded routes to handlePaymentIntentSucceeded and returns 200', async () => {
        const payload = JSON.stringify({
            id: 'evt_dispatch_succeeded',
            type: 'payment_intent.succeeded',
            data: {
                object: {
                    id: 'pi_dispatch_1',
                    metadata: { orderId: 'ord_dispatch_1', userId: '1' },
                },
            },
        });

        const response = await postWebhook(payload);
        // GREEN behavior: handler returns 200 with `{ received: true }`.
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
    });

    // T-D-2: payment_intent.payment_failed must be routed to its handler
    // and return 200. Stub throws → 500 → RED. GREEN: returns 200.
    it('T-D-2: payment_intent.payment_failed routes to handlePaymentIntentPaymentFailed and returns 200', async () => {
        const payload = JSON.stringify({
            id: 'evt_dispatch_failed',
            type: 'payment_intent.payment_failed',
            data: {
                object: {
                    id: 'pi_dispatch_2',
                    metadata: { orderId: 'ord_dispatch_2', userId: '1' },
                },
            },
        });

        const response = await postWebhook(payload);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
    });

    // T-D-3: charge.refunded continues to call handleChargeRefunded (existing path).
    // No matching order → handled gracefully, returns 200.
    it('T-D-3: charge.refunded dispatches to handleChargeRefunded (no order → 200)', async () => {
        const payload = JSON.stringify({
            id: 'evt_dispatch_refund',
            type: 'charge.refunded',
            data: {
                object: {
                    id: 'ch_dispatch_refund',
                    payment_intent: 'pi_no_such_order',
                },
            },
        });

        const response = await postWebhook(payload);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
    });

    // T-D-4: unhandled event types return 200 with no side effects.
    it('T-D-4: unhandled event type (customer.created) returns 200 with no side effects', async () => {
        const payload = JSON.stringify({
            id: 'evt_unhandled',
            type: 'customer.created',
            data: { object: { id: 'cus_unhandled' } },
        });

        const response = await postWebhook(payload);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
    });

    // T-D-5: dispatcher must NOT throw for unhandled event types (R-SW-2 ack).
    it('T-D-5: dispatcher does not throw for any unhandled event type', async () => {
        const types = ['customer.updated', 'invoice.paid', 'payout.created'];
        for (const type of types) {
            const payload = JSON.stringify({
                id: `evt_${type.replace('.', '_')}_${Date.now()}`,
                type,
                data: { object: {} },
            });
            const response = await postWebhook(payload);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ received: true });
        }
    });
});
