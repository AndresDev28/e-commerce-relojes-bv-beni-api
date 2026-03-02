/**
 * Stripe Webhook Service
 * [ARCH-02] Extracted from order controller
 */

import { factories } from '@strapi/strapi';
import Stripe from 'stripe';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [REF-10] Handles Stripe's charge.refunded webhooks
     */
    async handleStripeWebhook(signature: string, unparsedBody: any) {
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!endpointSecret) {
            const msg = '[REF-10] STRIPE_WEBHOOK_SECRET is not configured';
            strapi.log.error(msg);
            throw new Error(msg);
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
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

        if (event.type === 'charge.refunded') {
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
        } else {
            strapi.log.debug(`[REF-10] Unhandled webhook event type: ${event.type}`);
        }

        return { received: true };
    }
}));
