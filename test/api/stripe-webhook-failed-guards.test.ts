// test/api/stripe-webhook-failed-guards.test.ts
// [GAP-1 PR4b T-PR4b-4] Transition guards + refund-terminal protection — RED.
//
// Coverage:
//   - T-TG-1: payment_failed → pending retry (S-PFS-2; no stock restoration,
//              no stock decrement — failure never claimed stock)
//   - T-TG-2: payment_failed → cancelled give-up (S-PFS-3; no stock restoration)
//   - T-TG-3: charge.refunded on payment_failed Order does NOT 5xx-loop
//              (the legacy branch must warn + ack 200, NOT transition to
//              refunded which would conflict with R-PFS-2)
//   - T-TG-4: direct attempt payment_failed → paid is rejected by
//              beforeUpdate (R-PFS-2 / S-PFS-4)
//   - T-TG-5: redaction contract (S-PFS-5) — strict whitelist on
//              `{ code, failure_message }` only; no `decline_code`, no
//              `payment_method_details`, no PAN, no last4
//
// The matrix in `src/core/domain/order/order.types.ts` already enforces
// the allow-list (T-PR4b-3 GREEN) — these tests exercise the live
// controller and webhook flows against that matrix and the legacy refund
// branch.

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

describe('[GAP-1 PR4b] payment_failed recovery + refund-terminal guards', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // T-TG-1: payment_failed → pending retry
    // [GAP-1 PR4b S-PFS-2] After a retry, the Order goes back to `pending`
    // and the next successful `payment_intent.succeeded` triggers the
    // normal stock-decrement path. Stock was never decremented at the
    // failure (R-PFS-7), so the retry → succeeded flow must decrement
    // exactly once — no phantom restore, no double-decrement.
    // =========================================================================
    it('T-TG-1: payment_failed → pending retry does not restore stock (none was decremented)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-TG-1 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'tg1', email: 'tg1@test.com', password: 'p' });

        // Order was pending → payment_failed (no stock decrement).
        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'payment_failed',
        }, user.id);

        // Manual retry transition: payment_failed → pending.
        const updated = await strapi.entityService.update('api::order.order', order.id, {
            data: { orderStatus: 'pending' } as any,
        });
        expect(updated.orderStatus).toBe('pending');

        // Stock unchanged — failure path never decremented (R-PFS-7).
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(10);
    });

    // =========================================================================
    // T-TG-2: payment_failed → cancelled give-up
    // [GAP-1 PR4b S-PFS-3] User abandons after a failure. Order moves to
    // `cancelled`. No stock restoration because none was decremented at
    // the failure time (R-PFS-7).
    // =========================================================================
    it('T-TG-2: payment_failed → cancelled does not restore stock (none was decremented)', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-TG-2 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'tg2', email: 'tg2@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 3 }],
            subtotal: 300, shipping: 0, total: 300,
            orderStatus: 'payment_failed',
        }, user.id);

        const updated = await strapi.entityService.update('api::order.order', order.id, {
            data: { orderStatus: 'cancelled' } as any,
        });
        expect(updated.orderStatus).toBe('cancelled');

        // Stock unchanged — payment_failed never decremented.
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(10);
    });

    // =========================================================================
    // T-TG-3: charge.refunded on a payment_failed Order must NOT 5xx-loop
    // [GAP-1 PR4b D-DESIGN-5 / R-PFS-2] The legacy `charge.refunded`
    // branch unconditionally transitions the Order to `refunded` (which
    // is NOT in the `payment_failed → *` allow-list — forbidden by R-PFS-2).
    // PR4b adds a terminal guard: warn + ack 200, do NOT change status.
    // This prevents a 5xx retry storm against the new transition matrix.
    // =========================================================================
    it('T-TG-3: charge.refunded on payment_failed Order → ack 200 without status change', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-TG-3 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'tg3', email: 'tg3@test.com', password: 'p' });

        // Order in payment_failed with a paymentIntentId (the refund
        // branch looks up by paymentIntentId).
        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'payment_failed',
        }, user.id);

        await strapi.entityService.update('api::order.order', order.id, {
            data: { paymentIntentId: 'pi_tg3_refunded_failed' },
        });

        // Build + sign a charge.refunded payload for that PI.
        const payloadString = JSON.stringify({
            id: `evt_tg3_${Date.now()}`,
            type: 'charge.refunded',
            data: {
                object: {
                    id: 'ch_tg3',
                    payment_intent: 'pi_tg3_refunded_failed',
                },
            },
        });
        const stripe = new Stripe('sk_test_123', { apiVersion: '2026-01-28.clover' as any });
        const signature = stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret: 'whsec_test',
        });

        const response = await request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', signature)
            .set('Content-Type', 'application/json')
            .send(payloadString);

        // MUST ack 200 (no 5xx retry storm) and MUST NOT transition.
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });

        // Status UNCHANGED (still payment_failed — the forbidden transition
        // `payment_failed → refunded` was blocked by the new terminal guard).
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');

        // Stock unchanged — no decrement happened, no phantom restore.
        const productAfter: any = await strapi.db.connection('products').where('id', product.id).first();
        expect(productAfter.stock).toBe(10);
    });

    // =========================================================================
    // T-TG-4: direct attempt payment_failed → paid is rejected by beforeUpdate
    // [GAP-1 PR4b R-PFS-2 / S-PFS-4] Confirm the matrix rejects the
    // forbidden edge. The entityService.update throws because the
    // `beforeUpdate` lifecycle calls `validateOrderTransition` which
    // raises `ApplicationError`.
    // =========================================================================
    it('T-TG-4: payment_failed → paid direct attempt is rejected by beforeUpdate', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ name: `T-TG-4 ${Date.now()}`, stock: 10 });
        const user = await createTestUser({ username: 'tg4', email: 'tg4@test.com', password: 'p' });

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 1 }],
            subtotal: 100, shipping: 0, total: 100,
            orderStatus: 'payment_failed',
        }, user.id);

        await expect(
            strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'paid' } as any,
            })
        ).rejects.toThrow('Invalid status transition from "payment_failed" to "paid"');

        // Order still in payment_failed.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: order.documentId,
        });
        expect(after.orderStatus).toBe('payment_failed');
    });

    // =========================================================================
    // T-TG-5: redaction contract (S-PFS-5)
    // [GAP-1 PR4b R-PFS-5] The redactor MUST return ONLY
    // `{ code, failure_message }`. Any other Stripe `last_payment_error`
    // field (decline_code, payment_method_details, etc.) MUST NOT appear
    // in the stored audit object.
    // =========================================================================
    it('T-TG-5: redactPaymentError returns ONLY { code, failure_message } — no decline_code, no payment_method_details', async () => {
        const strapi = getStrapi() as any;
        const service = strapi.service('api::order.stripe-webhook') as any;

        const raw = {
            code: 'card_declined',
            message: 'Your card was declined.',
            decline_code: 'do_not_honor',
            payment_method_details: {
                card: { last4: '1234', brand: 'visa' },
            },
            // Other Stripe-shaped sensitive fields.
            doc_url: 'https://stripe.com/docs/declines#do-not-honor',
            payment_method: 'pm_12345',
            network: 'visa',
            billing_address: {
                line1: '123 Main St',
                city: 'Springfield',
            },
            // [REF-08] Extra non-spec fields.
            something_random: 'leak-me',
        };

        const redacted = service.redactPaymentError(raw);

        // MUST be exactly these two keys — nothing else.
        expect(Object.keys(redacted).sort()).toEqual(['code', 'failure_message']);
        expect(redacted.code).toBe('card_declined');
        expect(redacted.failure_message).toBe('Your card was declined.');

        // Belt + suspenders: explicit non-presence assertions.
        expect(redacted.decline_code).toBeUndefined();
        expect(redacted.payment_method_details).toBeUndefined();
        expect(redacted.payment_method).toBeUndefined();
        expect(redacted.network).toBeUndefined();
        expect(redacted.billing_address).toBeUndefined();
        expect(redacted.something_random).toBeUndefined();
        expect(redacted.doc_url).toBeUndefined();
    });
});
