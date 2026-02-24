// test/api/stripe-webhook.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import {
    getStrapi,
    createTestUser,
    resetDatabase,
    createTestProduct,
    createTestOrder
} from '../helpers/strapi-test-helpers';

import Stripe from 'stripe';

describe('Stripe Webhook Integration Tests [REF-10]', () => {
    beforeEach(async () => {
        await resetDatabase();
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should successfully update order status and restore stock on charge.refunded event', async () => {
        const strapi = getStrapi();

        // 1. Arrange: Create product, user, and order
        const product = await createTestProduct({ name: `Stripe Watch ${Date.now()}`, price: 100, stock: 10 });
        const user = await createTestUser({ username: 'stripeuser', email: 'stripe@test.com', password: 'password123' });

        const initialOrder = await createTestOrder({
            items: [{ id: product.id, name: product.name, price: 100, quantity: 2 }],
            subtotal: 200,
            shipping: 10,
            total: 210,
            orderStatus: 'paid',
        }, user.id);

        await strapi.entityService.update('api::order.order', initialOrder.id, {
            data: { paymentIntentId: 'pi_test_123' }
        });

        // 2. Generate valid Stripe signature
        const stripe = new Stripe('sk_test_123', { apiVersion: '2026-01-28.clover' as any });
        const payloadString = JSON.stringify({
            id: 'evt_test',
            type: 'charge.refunded',
            data: {
                object: {
                    id: 'ch_test',
                    payment_intent: 'pi_test_123'
                }
            }
        });

        const validSignature = stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret: 'whsec_test',
        });

        // 3. Act: Send POST to webhook endpoint
        const response = await request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', validSignature)
            .set('Content-Type', 'application/json')
            .send(payloadString)
            .expect(200);

        expect(response.body).toEqual({ received: true });

        // 4. Assert: Order status should be refunded and stock restored
        const updatedOrder = await strapi.entityService.findOne('api::order.order', initialOrder.id);
        expect(updatedOrder.orderStatus).toBe('refunded');

        const updatedProduct = await strapi.entityService.findOne('api::product.product', product.id);
        expect(updatedProduct).toBeDefined();
        if (updatedProduct) {
            expect(updatedProduct.stock).toBe(10); // 10 original - 2 from creation + 2 from refund
        }
    });

    it('should return 400 if signature verification fails', async () => {
        const strapi = getStrapi();

        const response = await request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', 't=123,v1=invalid_signature')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ id: 'evt_invalid' }))
            .expect(400);

        expect(response.text).toContain('Webhook signature verification failed');
    });

    it('should ignore idempotency if order is already refunded', async () => {
        const strapi = getStrapi();

        const product = await createTestProduct({ stock: 10 });
        const user = await createTestUser({ username: 'stripeuser3', email: 'stripe3@test.com', password: 'password123' });

        // Create as 'paid' to let lifecycle hooks correctly initialize stock (10 -> 8)
        const initialOrder = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            orderStatus: 'paid',
        }, user.id);

        // Transition to 'refunded' manually to let stock go back to 10
        await strapi.entityService.update('api::order.order', initialOrder.id, {
            data: { paymentIntentId: 'pi_already_refunded', orderStatus: 'refunded' }
        });

        const stripe = new Stripe('sk_test_123', { apiVersion: '2026-01-28.clover' as any });
        const payloadString = JSON.stringify({
            id: 'evt_test_2',
            type: 'charge.refunded',
            data: {
                object: {
                    id: 'ch_test2',
                    payment_intent: 'pi_already_refunded'
                }
            }
        });

        const validSignature = stripe.webhooks.generateTestHeaderString({
            payload: payloadString,
            secret: 'whsec_test',
        });

        // Trigger webhook again on the already refunded order
        const response = await request(strapi.server.httpServer)
            .post('/api/orders/stripe-webhook')
            .set('stripe-signature', validSignature)
            .set('Content-Type', 'application/json')
            .send(payloadString)
            .expect(200);

        expect(response.body).toEqual({ received: true });

        // Stock should remain unchanged (10) as the hook is not triggered again
        const currentProduct = await strapi.entityService.findOne('api::product.product', product.id);
        expect(currentProduct.stock).toBe(10);
    });
});
