// test/api/order-stock-lifecycle.test.ts
// [GAP-1 PR3 T-PR3-4] Stock-authority lifecycle contract — RED tests.
// These tests specify that:
//   1. Order creation (POST /api/orders OR programmatic entityService.create)
//      does NOT decrement product stock — the `afterCreate` decrement
//      block has been removed and the webhook is now the single authority.
//   2. `beforeCreate` stock validation still rejects orders that request
//      more stock than is available (pre-payment UX guard, R-OSA-3).
//   3. `stockDeducted` is the only authority for stock changes — Order
//      creation sets it to `false`, and only the webhook (via the
//      `decrementStockOnce` helper in T-PR3-7) flips it to `true`.
//
// These turn GREEN in T-PR3-5 when `afterCreate` no longer decrements and
// the lifecycle restoration gate is moved to `stockDeducted === true`.
// The tests use `strapi.db.connection` for direct reads because
// `entityService.findOne` and `documents.findOne` return cached values
// after a raw knex write.

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
    getStrapi,
    createTestUser,
    authenticateUser,
    resetDatabase,
    createTestProduct,
    createTestOrder
} from '../helpers/strapi-test-helpers'

describe('Order Stock Authority [GAP-1 PR3] — lifecycle marker contract', () => {
    beforeEach(async () => {
        await resetDatabase()
    })

    // T-L-1: HTTP create (afterCreate runs) leaves stock unchanged.
    it('T-L-1: HTTP order creation does NOT decrement stock (afterCreate removed)', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-1 ${Date.now()}`, stock: 10 })
        await createTestUser({ username: 'l1', email: 'l1@test.com', password: 'p' })
        const auth = await authenticateUser('l1@test.com', 'p')

        await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `TL1-${Date.now()}`,
                    items: [{ id: product.id, quantity: 3, name: 'X', price: 100 }],
                    subtotal: 300, shipping: 0, total: 300,
                    orderStatus: 'paid',
                },
            })
            .expect(201)

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10) // unchanged — stock authority moved to webhook
    })

    // T-L-2: programmatic create with orderStatus 'paid' does NOT decrement.
    it('T-L-2: programmatic order create with orderStatus=paid does NOT decrement stock', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-2 ${Date.now()}`, stock: 8 })
        const user = await createTestUser({ username: 'l2', email: 'l2@test.com', password: 'p' })

        await createTestOrder({
            items: [{ id: product.id, quantity: 4 }],
            subtotal: 400, shipping: 0, total: 400,
            orderStatus: 'paid',
        }, user.id)

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(8) // unchanged
    })

    // T-L-3: stockDeducted defaults to false on new Orders.
    it('T-L-3: new Order has stockDeducted=false (no webhook claim yet)', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-3 ${Date.now()}`, stock: 5 })
        const user = await createTestUser({ username: 'l3', email: 'l3@test.com', password: 'p' })

        const order = await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'paid',
        }, user.id)

        expect(order.stockDeducted).toBe(false)
    })

    // T-L-4: cancellation of an Order whose stock was never decremented
    // does NOT restore phantom stock (R-PFS-3 cancel-after-failure path).
    it('T-L-4: cancel of Order with stockDeducted=false does NOT restore phantom stock', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-4 ${Date.now()}`, stock: 7 })
        const user = await createTestUser({ username: 'l4', email: 'l4@test.com', password: 'p' })

        await createTestOrder({
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 200, shipping: 0, total: 200,
            orderStatus: 'paid',
        }, user.id)

        // Cancel via entityService.update (triggers afterUpdate)
        const orders = await strapi.entityService.findMany('api::order.order', {
            filters: { orderStatus: 'paid' },
        }) as any[]
        await strapi.entityService.update('api::order.order', orders[0].id, {
            data: { orderStatus: 'cancelled' },
        })

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(7) // unchanged — nothing was decremented, nothing to restore
    })

    // T-L-5: beforeCreate stock validation still rejects insufficient stock
    // (R-OSA-3 — pre-payment UX guard, regardless of webhook authority).
    it('T-L-5: beforeCreate still rejects orders exceeding available stock (R-OSA-3)', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-5 ${Date.now()}`, stock: 2 })
        await createTestUser({ username: 'l5', email: 'l5@test.com', password: 'p' })
        const auth = await authenticateUser('l5@test.com', 'p')

        const response = await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `TL5-${Date.now()}`,
                    items: [{ id: product.id, quantity: 10 }],
                    subtotal: 1000, shipping: 0, total: 1000,
                    orderStatus: 'pending',
                },
            })
            .expect(400)

        expect(response.body.error.message).toContain('Insufficient stock')

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(2) // unchanged
    })

    // T-L-6: pending order creation with sufficient stock succeeds and does NOT decrement.
    it('T-L-6: pending order with sufficient stock succeeds without decrementing', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-L-6 ${Date.now()}`, stock: 10 })
        await createTestUser({ username: 'l6', email: 'l6@test.com', password: 'p' })
        const auth = await authenticateUser('l6@test.com', 'p')

        await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `TL6-${Date.now()}`,
                    items: [{ id: product.id, quantity: 3 }],
                    subtotal: 300, shipping: 0, total: 300,
                    orderStatus: 'pending',
                },
            })
            .expect(201)

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10) // unchanged
    })

    // =============================================================================
    // [GAP-1 PR3 T-PR3-6] Enrichment + depleted-stock recovery — RED tests.
    // These specify the webhook-first (D+) shell flow where a shell Order
    // is created with empty items by `payment_intent.succeeded`, then later
    // enriched with items by a UPSERT from the frontend. The enrichment is
    // what triggers the stock decrement — and only when stock is available.
    // =============================================================================

    // T-E-1: shell Order created with empty items leaves stock untouched.
    it('T-E-1: shell Order (items empty, stockDeducted=false) does not decrement', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-E-1 ${Date.now()}`, stock: 10 })
        const user = await createTestUser({ username: 'e1', email: 'e1@test.com', password: 'p' })

        // Shell: paid, empty items, stockDeducted=false (the webhook would
        // create this in PR4a; for PR3 we create it directly via
        // createTestOrder with empty items).
        const shell = await createTestOrder({
            items: [],
            subtotal: 0,
            shipping: 0,
            total: 100,
            orderStatus: 'paid',
        }, user.id)

        expect(shell.stockDeducted).toBe(false)
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10)
    })

    // T-E-2: shell enriched with items + stockDeducted=true → stock decrements once.
    it('T-E-2: enrichment with items AND stockDeducted=true decrements stock exactly once', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-E-2 ${Date.now()}`, stock: 10 })
        const user = await createTestUser({ username: 'e2', email: 'e2@test.com', password: 'p' })

        const shell = await createTestOrder({
            items: [],
            subtotal: 0,
            shipping: 0,
            total: 100,
            orderStatus: 'paid',
        }, user.id)

        // Enrichment: UPDATE with items + stockDeducted=true. In PR3 this
        // is what the webhook (or a test-only helper) triggers. For now
        // we set the marker directly so we can assert the helper wires
        // correctly in T-PR3-7.
        await strapi.entityService.update('api::order.order', shell.id, {
            data: {
                items: [{ id: product.id, quantity: 4 }],
                stockDeducted: true,
            },
        })

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(6) // 10 - 4 (decrement fired)
    })

    // T-E-3: enrichment with items but stockDeducted=false → stock MUST NOT decrement.
    it('T-E-3: enrichment with items but stockDeducted=false does NOT decrement', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: `T-E-3 ${Date.now()}`, stock: 10 })
        const user = await createTestUser({ username: 'e3', email: 'e3@test.com', password: 'p' })

        await createTestOrder({
            items: [],
            subtotal: 0,
            shipping: 0,
            total: 100,
            orderStatus: 'paid',
        }, user.id)

        const orders = await strapi.entityService.findMany('api::order.order', { filters: { orderStatus: 'paid' } }) as any[]
        // Enrich with items but keep stockDeducted=false (a misconfig / bug).
        await strapi.entityService.update('api::order.order', orders[0].id, {
            data: {
                items: [{ id: product.id, quantity: 4 }],
                // stockDeducted NOT flipped → marker is authoritative.
            },
        })

        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10) // unchanged — marker gate kept the decrement out
    })
})
