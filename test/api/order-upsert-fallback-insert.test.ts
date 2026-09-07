// test/api/order-upsert-fallback-insert.test.ts
// [GAP-3] PR1 — Task 2.3 RED test for S-COU-4: missing Order creates a
// `pending` row with server-computed total = subtotal + shipping.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import {
    setupStrapi, cleanupStrapi, getStrapi,
    createTestUser, createTestProduct,
    resetDatabase, authenticateUser,
} from '../helpers/strapi-test-helpers'

describe('[GAP-3] PUT /orders/by-order-id/:orderId — fallback INSERT (S-COU-4)', () => {
    let strapi: any
    let testUser: any
    let auth: { jwt: string; user: any }

    beforeAll(async () => {
        strapi = await setupStrapi()
    }, 60000)
    afterAll(async () => { await cleanupStrapi() })

    beforeEach(async () => {
        await resetDatabase()
        testUser = await createTestUser({
            username: 'fbuser',
            email: 'fbuser@example.com',
            password: 'Test1234!',
        })
        auth = await authenticateUser('fbuser@example.com', 'Test1234!')
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // Task 2.3 — S-COU-4
    it('2.3 [S-COU-4] missing Order → INSERT pending with server-computed total', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: 'FB Watch', stock: 7 })

        // 1. Ensure no Order exists for this orderId.
        const orderId = `ORD-FB-${Date.now()}`
        const existing = await strapi.db.query('api::order.order').findOne({
            where: { orderId },
        })
        expect(existing == null).toBe(true)

        // 2. PUT with a fresh orderId.
        const subtotal = 75.00
        const shipping = 12.50
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: `pi_fb_${Date.now()}`,
                items: [{ id: product.id, quantity: 1 }],
                subtotal,
                shipping,
                paymentInfo: { method: 'card', brand: 'mastercard', last4: '5555' },
            })
            .expect(200)

        // 3. The response contains a `data.id` (documentId) and the
        //    attributes include the created order.
        expect(response.body.data).toBeDefined()
        expect(response.body.data.id).toBeDefined()

        // 4. Reload via Document Service and verify the new row.
        const created: any = await strapi.documents('api::order.order').findOne({
            documentId: response.body.data.id,
            populate: ['user'] as any,
        })

        // orderStatus is `pending` (D5 — INSERT always pending; webhook
        // stays authoritative for paid/failed transitions).
        expect(created.orderStatus).toBe('pending')

        // total is SERVER-COMPUTED from subtotal + shipping (A-4), not
        // trusted from the client. The client payload does not include
        // a `total` field; the server sets it.
        expect(created.total).toBeCloseTo(subtotal + shipping, 2)

        // The user on the inserted row is the authenticated user
        // (A-10 — INSERT always connects auth user, never raw payload).
        expect(created.user?.id).toBe(testUser.id)

        // paymentInfo allowlist is honored (A-5) — only the 3 client
        // keys are persisted (no source / paymentError because there
        // was no existing row to merge over).
        expect(created.paymentInfo).toEqual({
            method: 'card',
            brand: 'mastercard',
            last4: '5555',
        })
    })
})
