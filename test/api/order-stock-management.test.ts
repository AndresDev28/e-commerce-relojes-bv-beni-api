// test/api/order-stock-management.test.ts
// [REF-09] Implementación de Devolución de Stock (Stock Refund)
// [GAP-1 PR3 T-PR3-5] Stock authority moved to the webhook. These tests now
// verify the post-PR3 behavior: stock is decremented by the WEBHOOK (PR4a)
// and the Order creation flow leaves stock untouched. Pre-PR3 expectations
// have been rewritten to match the new contract — see comments.

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
    getStrapi,
    createTestUser,
    authenticateUser,
    resetDatabase,
    createTestProduct
} from '../helpers/strapi-test-helpers'

describe('Order Stock Management ([REF-09])', () => {
    beforeEach(async () => {
        // Clean database before each test
        await resetDatabase()
    })

    // [GAP-1 PR3 T-PR3-5] POST /api/orders no longer decrements stock — the
    // webhook (PR4a) is the sole authority. Stock stays at the initial 10
    // until the `payment_intent.succeeded` handler decrements it.
    it('should NOT decrement stock at order creation ([GAP-1 PR3])', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({
            name: 'Reloj Premium de Prueba',
            price: 500,
            stock: 10
        })

        await createTestUser({
            username: 'buyer',
            email: 'buyer@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('buyer@test.com', 'password123')

        await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `ORDER-${Date.now()}`,
                    items: [
                        { id: product.id, quantity: 3, name: 'Reloj Premium', price: 500 }
                    ],
                    subtotal: 1500,
                    shipping: 0,
                    total: 1500,
                    orderStatus: 'paid'
                }
            })
            .expect(201)

        // Stock is unchanged because the webhook (PR4a) is the only
        // authority. Read via direct knex because entityService/documents
        // may return cached values after a raw write.
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10) // unchanged — webhook authority
    })

    // [GAP-1 PR3 T-PR3-5] Restoration only fires when stockDeducted was true.
    // Since the order was created with stockDeducted=false (no webhook
    // authorization), cancellation does NOT restore any stock.
    it('should NOT restore stock on cancel when stockDeducted=false ([GAP-1 PR3])', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ stock: 5 })

        await createTestUser({
            username: 'user_restore',
            email: 'restore@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('restore@test.com', 'password123')

        const orderResponse = await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `RESTORE-${Date.now()}`,
                    items: [{ id: product.id, quantity: 2 }],
                    subtotal: 200,
                    shipping: 0,
                    total: 200,
                    orderStatus: 'paid'
                }
            })
            .expect(201)

        const orderInternalId = orderResponse.body.data.id

        // Stock stays at 5 because the order hasn't been webhook-decremented.
        let p: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(5)

        // Cancel via entityService.update (triggers afterUpdate).
        await strapi.entityService.update('api::order.order', orderInternalId, {
            data: { orderStatus: 'cancelled' }
        })

        // Stock remains 5 — no phantom restoration because stockDeducted=false.
        p = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(5)
    })

    // [GAP-1 PR3 T-PR3-5] Order creation with multiple items leaves all
    // product stocks untouched.
    it('should NOT decrement multiple items at order creation ([GAP-1 PR3])', async () => {
        const strapi = getStrapi()

        const category = await strapi.entityService.create('api::category.category', {
            data: { name: 'Multiple Items Test', slug: `multi-${Date.now()}`, publishedAt: new Date().toISOString() }
        })

        const productA = await createTestProduct({ name: `Watch A ${Date.now()}`, stock: 10, categoryId: category.id })
        const productB = await createTestProduct({ name: `Watch B ${Date.now()}`, stock: 5, categoryId: category.id })

        await createTestUser({
            username: 'multi',
            email: 'multi@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('multi@test.com', 'password123')

        await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .set('Content-Type', 'application/json')
            .send({
                data: {
                    orderId: `MULTI-${Date.now()}`,
                    items: [
                        { id: productA.id, quantity: 2 },
                        { id: productB.id, quantity: 3 }
                    ],
                    subtotal: 1000,
                    shipping: 0,
                    total: 1000,
                    orderStatus: 'paid'
                }
            })
            .expect(201)

        // Both stocks unchanged — webhook authority.
        const a: any = await strapi.db.connection('products').where('id', productA.id).first()
        const b: any = await strapi.db.connection('products').where('id', productB.id).first()
        expect(a.stock).toBe(10)
        expect(b.stock).toBe(5)
    })

    // [GAP-1 PR3 T-PR3-5] Order with stockDeducted=false → cancel → no
    // restore → a second no-op update on the same status → still no
    // restore. The previousStatus === newStatus guard AND the marker
    // gate both keep the second transition from re-restoring.
    it('should NOT restore stock on repeated no-op updates ([GAP-1 PR3])', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ stock: 10 })
        await createTestUser({ username: 'double', email: 'double@test.com', password: 'p' })
        const auth = await authenticateUser('double@test.com', 'p')

        const res = await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `DBL-${Date.now()}`,
                    items: [{ id: product.id, quantity: 5 }],
                    subtotal: 500, shipping: 0, total: 500, orderStatus: 'paid'
                }
            })

        const orderId = res.body.data.id

        // Initial: stock untouched (webhook hasn't fired yet).
        let p: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(10)

        // 1. Cancel (stockDeducted=false → no restore).
        await strapi.entityService.update('api::order.order', orderId, {
            data: { orderStatus: 'cancelled' }
        })
        p = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(10)

        // 2. Touch with a metadata-only update (same status) — even if a
        //    previousStatus !== newStatus guard were missing, the marker
        //    gate is what keeps stock at 10.
        await strapi.entityService.update('api::order.order', orderId, {
            data: { statusChangeNote: 'just a touch' }
        })
        p = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(10)
    })

    // [GAP-1 PR3 T-PR3-5] paid → processing doesn't touch stock (still 10
    // because no decrement ever fired).
    it('should leave stock untouched on paid → processing ([GAP-1 PR3])', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ stock: 10 })
        await createTestUser({ username: 'trans', email: 'trans@test.com', password: 'p' })
        const auth = await authenticateUser('trans@test.com', 'p')

        const res = await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `TRANS-${Date.now()}`,
                    items: [{ id: product.id, quantity: 4 }],
                    subtotal: 99, shipping: 0, total: 99, orderStatus: 'paid'
                }
            })

        const orderId = res.body.data.id
        let p: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(10)

        await strapi.entityService.update('api::order.order', orderId, {
            data: { orderStatus: 'processing' }
        })

        p = await strapi.db.connection('products').where('id', product.id).first()
        expect(p.stock).toBe(10)
    })

    // [GAP-1 PR3 T-PR3-5] R-OSA-3: beforeCreate stock validation stays
    // as a pre-payment UX guard regardless of webhook authority.
    it('should reject order creation if stock is insufficient ([AND-99])', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({
            name: 'Reloj Escaso',
            price: 1000,
            stock: 2
        })

        await createTestUser({
            username: 'greedy_buyer',
            email: 'greedy@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('greedy@test.com', 'password123')

        const response = await request(strapi.server.httpServer)
            .post('/api/orders')
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                data: {
                    orderId: `GREEDY-${Date.now()}`,
                    items: [
                        { id: product.id, quantity: 3 }
                    ],
                    subtotal: 3000,
                    shipping: 0,
                    total: 3000,
                    orderStatus: 'paid'
                }
            })
            .expect(400)

        expect(response.body.error.message).toContain('Insufficient stock')

        const finalProduct: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(finalProduct.stock).toBe(2)
    })
})

// =============================================================================
// [GAP-1 PR3 T-PR3-2/T-PR3-3] Atomic `updateProductStock` contract tests.
// Helper turns RED in T-PR3-2 against the read-then-write implementation,
// GREEN in T-PR3-3 when the SQL is rewritten as a single guarded
// `UPDATE products SET stock = stock ± ? WHERE id = ? [AND stock >= ?]`
// that joins the ambient ALS transaction via `.transacting(trx)`.
// =============================================================================
describe('Order Stock Management [GAP-1 PR3] — Atomic updateProductStock', () => {
    beforeEach(async () => {
        await resetDatabase()
    })

    // T-H-1: a single decrement returns true and reduces stock by exactly qty.
    it('T-H-1: single atomic decrement returns true and reduces stock by exactly qty', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: `T-H-1 ${Date.now()}`, stock: 10 })

        const result = await strapi.service('api::order.order').updateProductStock(product.id, -3)

        expect(result).toBe(true)
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(7) // 10 - 3
    })

    // T-H-2: concurrent decrements serialize correctly via the WHERE guard.
    it('T-H-2: parallel decrements never oversell and never produce lost updates', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: `T-H-2 ${Date.now()}`, stock: 100 })

        const decrements = Array.from({ length: 10 }, () => () =>
            strapi.service('api::order.order').updateProductStock(product.id, -3)
        )
        const results = await Promise.all(decrements.map((fn) => fn()))

        const successCount = results.filter((r) => r === true).length
        expect(successCount).toBe(10)
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(70) // 100 - 10*3
    })

    // T-H-3: insufficient stock guard.
    it('T-H-3: insufficient stock guard returns false and leaves stock unchanged', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: `T-H-3 ${Date.now()}`, stock: 5 })

        const result = await strapi.service('api::order.order').updateProductStock(product.id, -100)

        expect(result).toBe(false)
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(5) // unchanged
    })

    // T-H-4: positive quantity restores stock unconditionally.
    it('T-H-4: positive quantity restores stock and is concurrency-safe', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: `T-H-4 ${Date.now()}`, stock: 0 })

        const restores = Array.from({ length: 5 }, () => () =>
            strapi.service('api::order.order').updateProductStock(product.id, +2)
        )
        const results = await Promise.all(restores.map((fn) => fn()))

        expect(results.every((r) => r === true)).toBe(true)
        const after: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(after.stock).toBe(10) // 0 + 5*2
    })

    // T-H-5: round-trip — decrement then restore returns the original stock.
    it('T-H-5: decrement then restore returns stock to its original value', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: `T-H-5 ${Date.now()}`, stock: 8 })

        const dec = await strapi.service('api::order.order').updateProductStock(product.id, -4)
        expect(dec).toBe(true)
        const mid: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(mid.stock).toBe(4)

        const inc = await strapi.service('api::order.order').updateProductStock(product.id, +4)
        expect(inc).toBe(true)
        const final: any = await strapi.db.connection('products').where('id', product.id).first()
        expect(final.stock).toBe(8) // round-trip back to original
    })
})

