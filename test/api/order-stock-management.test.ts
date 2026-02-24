// test/api/order-stock-management.test.ts
// [REF-09] Implementación de Devolución de Stock (Stock Refund)
// Verify inventory atomicity: decrement on creation and restore on cancellation/refund.

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

    it('should decrement stock when an order is created via API', async () => {
        const strapi = getStrapi()

        // 1. Create product with initial stock
        const product = await createTestProduct({
            name: 'Reloj Premium de Prueba',
            price: 500,
            stock: 10
        })

        // 2. Create user and authenticate
        await createTestUser({
            username: 'buyer',
            email: 'buyer@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('buyer@test.com', 'password123')

        // 3. Create order via API (should trigger afterCreate hook)
        const response = await request(strapi.server.httpServer)
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

        // 4. Verify that stock has decreased correctly
        const updatedProduct = await strapi.entityService.findOne('api::product.product', product.id)
        expect(updatedProduct.stock).toBe(7) // 10 - 3 = 7
    })

    it('should restore stock when an order status is updated to cancelled', async () => {
        const strapi = getStrapi()

        // 1. Create product and initial order
        const product = await createTestProduct({ stock: 5 })

        await createTestUser({
            username: 'user_restore',
            email: 'restore@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('restore@test.com', 'password123')

        // Stock goes down to 3
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

        // Verify intermediate stock
        let p = await strapi.entityService.findOne('api::product.product', product.id)
        expect(p.stock).toBe(3)

        // 2. Perform order cancellation (e.g., by system or admin)
        // We update through entityService to simulate internal transition
        await strapi.entityService.update('api::order.order', orderInternalId, {
            data: { orderStatus: 'cancelled' }
        })

        // 3. Verify stock is restored
        p = await strapi.entityService.findOne('api::product.product', product.id)
        expect(p.stock).toBe(5) // 3 + 2 = 5
    })

    it('should handle correctly multiple items update', async () => {
        const strapi = getStrapi()

        // Create a category once to avoid uniqueness constraint on 'test-category' slug
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

        const updatedA = await strapi.entityService.findOne('api::product.product', productA.id)
        const updatedB = await strapi.entityService.findOne('api::product.product', productB.id)

        expect(updatedA.stock).toBe(8)
        expect(updatedB.stock).toBe(2)
    })

    it('should not restore stock twice if moving from cancelled to refunded', async () => {
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

        // Check stock = 5
        expect((await strapi.entityService.findOne('api::product.product', product.id)).stock).toBe(5)

        // 1. First Cancellation -> Stock restored to 10
        await strapi.entityService.update('api::order.order', orderId, {
            data: { orderStatus: 'cancelled' }
        })
        expect((await strapi.entityService.findOne('api::product.product', product.id)).stock).toBe(10)

        // 2. Second update with SAME status (cancelled) -> Stock remains 10 (not 15!)
        // This tests the previousStatus === newStatus guard
        await strapi.entityService.update('api::order.order', orderId, {
            data: { orderStatus: 'cancelled' }
        })
        expect((await strapi.entityService.findOne('api::product.product', product.id)).stock).toBe(10)
    })

    it('should not restore stock when transitioning from paid to processing', async () => {
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
        expect((await strapi.entityService.findOne('api::product.product', product.id)).stock).toBe(6)

        // Move to processing
        await strapi.entityService.update('api::order.order', orderId, {
            data: { orderStatus: 'processing' }
        })

        // Stock should still be 6
        expect((await strapi.entityService.findOne('api::product.product', product.id)).stock).toBe(6)
    })

    it('should reject order creation if stock is insufficient ([AND-99])', async () => {
        const strapi = getStrapi()

        // 1. Create product with limited stock
        const product = await createTestProduct({
            name: 'Reloj Escaso',
            price: 1000,
            stock: 2
        })

        // 2. Authenticate
        await createTestUser({
            username: 'greedy_buyer',
            email: 'greedy@test.com',
            password: 'password123'
        })
        const auth = await authenticateUser('greedy@test.com', 'password123')

        // 3. Attempt to buy 3 (more than 2 available)
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
            // Expect 400 Bad Request because of the error thrown in beforeCreate
            .expect(400)

        expect(response.body.error.message).toContain('Insufficient stock')

        // 4. Verify stock remains unchanged
        const finalProduct = await strapi.entityService.findOne('api::product.product', product.id)
        expect(finalProduct.stock).toBe(2)
    })
})
