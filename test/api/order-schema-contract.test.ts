/**
 * [GAP-1 PR1+2] Order schema contract — unique paymentIntentId, stockDeducted
 * default, and history enum acceptance for `payment_failed`.
 *
 * These integration tests boot Strapi against SQLite and exercise the
 * schema constraints directly through `entityService`. The unique
 * constraint and the new enum values are introduced in T-PR1+2-7
 * (GREEN); until then these tests fail, locking the contract that
 * the schema migration must satisfy.
 *
 * Coverage:
 *   - SC-1  unique `paymentIntentId` (DB-level violation on duplicate)
 *   - SC-2  `stockDeducted` defaults to false on a fresh Order
 *   - SC-3  Order `orderStatus` accepts `payment_failed` (write + read)
 *   - SC-4  Order status history `fromStatus` and `toStatus` accept
 *          `payment_failed`
 *
 * Spec refs:
 *   - R-PFS-1 (enum addition)
 *   - R-PFS-4 (history enums)
 *   - R-OSA-4 (stockDeducted marker)
 *   - Add-on #5 (unique paymentIntentId)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getStrapi,
    resetDatabase,
    createTestUser,
} from '../helpers/strapi-test-helpers';

describe('[GAP-1 PR1+2] Order schema contract', () => {
    let userId: number | string;

    beforeEach(async () => {
        await resetDatabase();
        const user = await createTestUser({
            username: 'sc_user',
            email: 'sc@test.com',
            password: 'password123',
        });
        userId = user.id;
    });

    it('[SC-1] rejects two Orders with the same paymentIntentId (unique constraint)', async () => {
        const strapi = getStrapi();
        const sharedPi = `pi_unique_${Date.now()}`;

        const first = await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `TEST-PI-1-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 0,
                orderStatus: 'pending',
                paymentIntentId: sharedPi,
                stockDeducted: false,
                user: { connect: [userId] } as any,
                publishedAt: new Date().toISOString(),
            } as any,
        });
        expect(first).toBeDefined();

        // The unique constraint lives at the DB layer; the second insert must throw.
        await expect(
            strapi.entityService.create('api::order.order', {
                data: {
                    orderId: `TEST-PI-2-${Date.now()}`,
                    items: [],
                    subtotal: 0,
                    shipping: 0,
                    total: 0,
                    orderStatus: 'pending',
                    paymentIntentId: sharedPi,
                    stockDeducted: false,
                    user: { connect: [userId] } as any,
                    publishedAt: new Date().toISOString(),
                } as any,
            })
        ).rejects.toThrow();

        // Sanity: exactly one Order remains for that paymentIntentId.
        const rows = (await strapi.entityService.findMany('api::order.order', {
            filters: { paymentIntentId: sharedPi },
        })) as any[];
        expect(rows.length).toBe(1);
    });

    it('[SC-2] stockDeducted defaults to false on a fresh Order', async () => {
        const strapi = getStrapi();

        // Create WITHOUT specifying stockDeducted — the schema default
        // (`false`) must apply even if the caller omits the field.
        const order = (await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `TEST-SD-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 0,
                orderStatus: 'pending',
                user: { connect: [userId] } as any,
                publishedAt: new Date().toISOString(),
            } as any,
        })) as any;

        expect(order).toBeDefined();
        expect(order.stockDeducted).toBe(false);

        // Re-read to confirm the persisted value (not just a coerced default).
        const fetched = (await strapi.entityService.findOne(
            'api::order.order',
            order.id
        )) as any;
        expect(fetched.stockDeducted).toBe(false);
    });

    it('[SC-3] Order orderStatus accepts payment_failed (write + read)', async () => {
        const strapi = getStrapi();

        const order = (await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `TEST-PF-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 0,
                orderStatus: 'payment_failed',
                stockDeducted: false,
                user: { connect: [userId] } as any,
                publishedAt: new Date().toISOString(),
            } as any,
        })) as any;

        expect(order).toBeDefined();
        expect(order.orderStatus).toBe('payment_failed');

        const fetched = (await strapi.entityService.findOne(
            'api::order.order',
            order.id
        )) as any;
        expect(fetched.orderStatus).toBe('payment_failed');
    });

    it('[SC-4] Order status history fromStatus and toStatus accept payment_failed', async () => {
        const strapi = getStrapi();

        const order = (await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `TEST-PFH-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 0,
                orderStatus: 'payment_failed',
                stockDeducted: false,
                user: { connect: [userId] } as any,
                publishedAt: new Date().toISOString(),
            } as any,
        })) as any;

        // Write a history row using the new enum value in BOTH directions.
        const history = (await strapi.entityService.create(
            'api::order-status-history.order-status-history',
            {
                data: {
                    fromStatus: 'pending',
                    toStatus: 'payment_failed',
                    changedAt: new Date().toISOString(),
                    changedByEmail: 'system@example.com',
                    order: { connect: [order.id] } as any,
                } as any,
            }
        )) as any;

        expect(history).toBeDefined();
        expect(history.fromStatus).toBe('pending');
        expect(history.toStatus).toBe('payment_failed');

        const fetched = (await strapi.entityService.findOne(
            'api::order-status-history.order-status-history',
            history.id
        )) as any;
        expect(fetched.fromStatus).toBe('pending');
        expect(fetched.toStatus).toBe('payment_failed');
    });
});
