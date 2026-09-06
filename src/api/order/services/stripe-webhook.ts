/**
 * Stripe Webhook Service
 * [ARCH-02] Extracted from order controller
 * [GAP-1 PR4a] Restructured into a thin dispatcher that delegates to
 * per-event-type handlers. The legacy `charge.refunded` branch is
 * preserved byte-identically (Decision 11 — stays on Entity Service);
 * `payment_intent.succeeded` and `payment_intent.payment_failed` are
 * wired with transactional ledger-first reconciliation in T-PR4a-3
 * through T-PR4a-9.
 */

import { factories } from '@strapi/strapi';
import Stripe from 'stripe';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [REF-10] Top-level Stripe webhook entry point. Verifies the signature,
     * then dispatches to the per-event-type handler. Each handler runs
     * inside one `strapi.db.transaction` (D-DESIGN-1) so the ledger row,
     * the Order write, and the stock decrement all commit/rollback together.
     */
    async handleStripeWebhook(signature: string, unparsedBody: any) {
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!endpointSecret) {
            const msg = '[REF-10] STRIPE_WEBHOOK_SECRET is not configured';
            strapi.log.error(msg);
            throw new Error(msg);
        }

        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            const msg = '[REF-10] STRIPE_SECRET_KEY is not configured';
            strapi.log.error(msg);
            throw new Error(msg);
        }

        const stripe = new Stripe(secretKey, {
            apiVersion: '2026-01-28.clover' as any,
        });

        let event: Stripe.Event;

        try {
            if (!unparsedBody) {
                throw new Error('Missing raw body');
            }

            event = stripe.webhooks.constructEvent(unparsedBody, signature, endpointSecret);
        } catch (err: any) {
            strapi.log.error(`[REF-10] Webhook signature verification failed: ${err.message}`);
            throw new Error(`Webhook signature verification failed.`);
        }

        strapi.log.info(`[REF-10] Stripe webhook received: ${event.type}`);

        return this.dispatch(event);
    },

    /**
     * [GAP-1 PR4a] Dispatch verified events by `event.type`. Unknown events
     * are acknowledged with `{ received: true }` and no side effects
     * (R-SW-2). Each handled branch runs inside the appropriate per-event
     * transaction; the dispatcher itself does not own the transaction.
     */
    async dispatch(event: Stripe.Event) {
        switch (event.type) {
            case 'charge.refunded':
                return this.handleChargeRefunded(event);
            case 'payment_intent.succeeded':
                return this.handlePaymentIntentSucceeded(event);
            case 'payment_intent.payment_failed':
                return this.handlePaymentIntentPaymentFailed(event);
            default:
                strapi.log.debug(`[REF-10] Unhandled webhook event type: ${event.type}`);
                return { received: true };
        }
    },

    /**
     * [REF-10] Legacy `charge.refunded` branch — preserved byte-identical
     * per D-DESIGN-11 / Decision 11. Stays on Entity Service.
     */
    async handleChargeRefunded(event: Stripe.Event) {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

        if (!paymentIntentId) {
            strapi.log.warn('[REF-10] charge.refunded received without a payment_intent ID');
            return { received: true };
        }

        try {
            const orders = await strapi.entityService.findMany('api::order.order', {
                filters: { paymentIntentId: paymentIntentId },
            }) as any[];

            if (!orders || orders.length === 0) {
                strapi.log.warn(`[REF-10] Webhook: No order found for paymentIntent ${paymentIntentId}`);
                return { received: true };
            }

            const order = orders[0];

            if (order.orderStatus === 'refunded') {
                strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} is already refunded. Ignoring.`);
                return { received: true };
            }

            await strapi.entityService.update('api::order.order', order.id, {
                data: {
                    orderStatus: 'refunded',
                    statusChangeNote: 'Automated refund confirmation via Stripe webhook',
                },
            });

            strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} successfully marked as refunded.`);
        } catch (error) {
            strapi.log.error(`[REF-10] Webhook: Error processing charge.refunded for payment intent ${paymentIntentId}:`, error);
            throw new Error('Error processing webhook event');
        }

        return { received: true };
    },

    /**
     * [GAP-1 PR4a T-PR4a-1] Stub for the `payment_intent.succeeded`
     * reconciliation handler. Implemented in T-PR4a-5 (pending→paid
     * transition + stock decrement) and T-PR4a-7 (D+ shell creation).
     */
    async handlePaymentIntentSucceeded(event: Stripe.Event) {
        strapi.log.warn(`[GAP-1 PR4a] handlePaymentIntentSucceeded not yet implemented (event.id=${event.id})`);
        throw new Error('not implemented: handlePaymentIntentSucceeded');
    },

    /**
     * [GAP-1 PR4a T-PR4a-1] Stub for the `payment_intent.payment_failed`
     * handler. Implemented in PR4b; the dispatcher must call this stub
     * and the stub must throw so the failure surfaces as a 500 (Stripe
     * will retry until the real handler ships).
     */
    async handlePaymentIntentPaymentFailed(event: Stripe.Event) {
        strapi.log.warn(`[GAP-1 PR4a] handlePaymentIntentPaymentFailed not yet implemented (event.id=${event.id})`);
        throw new Error('not implemented: handlePaymentIntentPaymentFailed');
    },
}));
