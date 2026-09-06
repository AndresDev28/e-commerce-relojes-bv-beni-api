/**
 * Stripe Webhook Service
 * [ARCH-02] Extracted from order controller
 * [GAP-1 PR4a] Dispatcher with transactional ledger-first processing
 * (D-DESIGN-1). Every handled event runs inside a `strapi.db.transaction`
 * so the `webhook_events` ledger row, the Order write, and any stock
 * decrement all commit/rollback together. Network side effects (email)
 * are deferred via `onCommit` to ensure they fire only after a successful
 * commit. The legacy `charge.refunded` branch is preserved byte-identical
 * (D-DESIGN-11 / Decision 11) and stays outside the transactional path
 * because it predates the ledger contract.
 */

import { factories } from '@strapi/strapi';
import Stripe from 'stripe';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [REF-10] Top-level Stripe webhook entry point. Verifies the signature,
     * then dispatches to the per-event-type handler.
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
     * [GAP-1 PR4a T-PR4a-3] Dispatch verified events by `event.type`.
     * Each handled branch is wrapped in `strapi.db.transaction({ trx,
     * onCommit })` so the ledger row, the Order write, and any stock
     * decrement all commit/rollback together (R-SW-9).
     *
     * The `charge.refunded` branch (Decision 11) keeps its Entity Service
     * code path because it predates the ledger contract and is not
     * migrated in PR4a. Unknown event types are acknowledged with
     * `{ received: true }` and produce no ledger row.
     */
    async dispatch(event: Stripe.Event) {
        if (event.type === 'charge.refunded') {
            // Legacy branch — outside the transactional path. S-SW-10.
            return this.handleChargeRefunded(event);
        }

        // [GAP-1 PR4a T-PR4a-3] Ledger-first transactional envelope.
        // The unique `eventId` violation is the detection path for
        // duplicate deliveries (R-SW-3 / S-SW-9); on violation we
        // commit the existing row and ack without side effects.
        return strapi.db.transaction(async ({ trx, onCommit }) => {
            // 1. Insert the ledger row first. Catch the unique violation.
            try {
                await strapi.documents('api::webhook-event.webhook-event').create({
                    data: {
                        eventId: event.id,
                        eventType: event.type,
                        processedAt: new Date().toISOString(),
                        outcome: 'processed',
                    },
                });
            } catch (ledgerErr: any) {
                const msg = String(ledgerErr?.message || ledgerErr);
                const isUniqueViolation =
                    msg.includes('unique') ||
                    msg.includes('duplicate') ||
                    msg.includes('SQLITE_CONSTRAINT_UNIQUE') ||
                    msg.includes('23505');
                if (isUniqueViolation) {
                    strapi.log.info(`[GAP-1] Duplicate webhook event.id=${event.id} — ack 200`);
                    return { received: true };
                }
                throw ledgerErr;
            }

            // 2. Dispatch to the per-event handler. Each handler is
            //    responsible for its own correlation / Order writes.
            //    Helpers auto-join the ambient transaction via
            //    `transactionContext.transactionCtx.get()`.
            switch (event.type) {
                case 'payment_intent.succeeded':
                    return this.handlePaymentIntentSucceeded(event, { trx, onCommit });
                case 'payment_intent.payment_failed':
                    return this.handlePaymentIntentPaymentFailed(event, { trx, onCommit });
                default:
                    strapi.log.debug(`[REF-10] Unhandled webhook event type: ${event.type}`);
                    return { received: true };
            }
        }) as any;
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
     * [GAP-1 PR4a T-PR4a-3] Stub for the `payment_intent.succeeded`
     * handler. The ledger row was already inserted by the dispatcher;
     * the real reconciliation (pending→paid, stock decrement, shell
     * creation) ships in T-PR4a-5 and T-PR4a-7.
     */
    async handlePaymentIntentSucceeded(
        event: Stripe.Event,
        ctx?: { trx?: any; onCommit?: any }
    ) {
        strapi.log.info(
            `[GAP-1 PR4a] handlePaymentIntentSucceeded stub ack for event.id=${event.id} ` +
            `(real reconciliation lands in T-PR4a-5 / T-PR4a-7)`
        );
        return { received: true };
    },

    /**
     * [GAP-1 PR4a T-PR4a-1] Stub for the `payment_intent.payment_failed`
     * handler. Implemented in PR4b; the dispatcher must call this stub
     * and the stub must throw so the failure surfaces as a 500 (Stripe
     * will retry until the real handler ships).
     */
    async handlePaymentIntentPaymentFailed(
        event: Stripe.Event,
        ctx?: { trx?: any; onCommit?: any }
    ) {
        strapi.log.warn(`[GAP-1 PR4a] handlePaymentIntentPaymentFailed not yet implemented (event.id=${event.id})`);
        throw new Error('not implemented: handlePaymentIntentPaymentFailed');
    },
}));
