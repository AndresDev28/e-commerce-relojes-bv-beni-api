// test/api/order-upsert-fallback-insert.test.ts
// [GAP-3] Checkout Order UPSERT — fallback INSERT + terminal 409 + malformed.
//
// PR1 (Task 2.3): S-COU-4 missing Order → INSERT pending.
// PR2 (Tasks 3.1, 3.4): S-COU-3 terminal 409 zero-mutation.
//                  S-COU-8 malformed payload → 400 + X-Trace-Id.

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

    // ============================================================
    // Task 3.1 — S-COU-3 terminal 409 / zero mutation
    // ============================================================
    it('3.1 [S-COU-3] cancelled shell returns 409 with zero mutation + X-Trace-Id', async () => {
        const strapi = getStrapi()

        // 1. Seed a cancelled Order. The PUT must NOT touch items, subtotal,
        //    shipping, total, paymentInfo, or orderStatus.
        const orderId = `ORD-CXL-${Date.now()}`
        const paymentIntentId = `pi_cxl_${Date.now()}`
        const cancelledOrder = await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [{ id: 999, quantity: 1 }],
                subtotal: 100.00,
                shipping: 10.00,
                total: 110.00,
                orderStatus: 'cancelled',
                paymentIntentId,
                stockDeducted: true,
                paymentInfo: {
                    source: 'webhook_reconciliation',
                    paymentError: { code: 'card_declined', failure_message: 'historical' },
                },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // 2. PUT tries to mutate everything.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId,
                items: [{ id: 1, quantity: 99 }], // attempt to mutate
                subtotal: 999.99,
                shipping: 99,
                paymentInfo: { method: 'card', brand: 'visa', last4: '0000' },
            })
            .expect(409)

        // 3. Standard Strapi error envelope + X-Trace-Id.
        expect(response.body.data).toBeNull()
        expect(response.body.error.status).toBe(409)
        expect(response.body.error.name).toBe('ConflictError')
        expect(response.body.error.message).toMatch(/cancelled|terminal/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(typeof response.body.error.details.traceId).toBe('string')
        expect(response.headers['x-trace-id']).toBeDefined()

        // 4. Zero mutation: every field is byte-identical to the seed.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: cancelledOrder.documentId,
        })
        expect(after.orderStatus).toBe('cancelled')
        expect(after.items).toEqual([{ id: 999, quantity: 1 }])
        expect(after.subtotal).toBe(100.00)
        expect(after.shipping).toBe(10.00)
        expect(after.total).toBe(110.00)
        expect(after.paymentInfo).toEqual({
            source: 'webhook_reconciliation',
            paymentError: { code: 'card_declined', failure_message: 'historical' },
        })
        // paymentInfo did NOT receive the client's method/brand/last4 (no merge on terminal reject).
        expect(after.paymentInfo.method).toBeUndefined()
    })

    // ============================================================
    // Task 3.4 — S-COU-8 malformed payload → 400 + X-Trace-Id
    // ============================================================
    it('3.4a [S-COU-8] missing paymentIntentId returns 400 + structured error + X-Trace-Id', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-MISSING-PI-${Date.now()}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .set('X-Trace-Id', 'test-trace-cou8a')
            .send({
                userId: testUser.id,
                // paymentIntentId intentionally omitted
                items: [{ id: 1, quantity: 1 }],
                subtotal: 10,
                shipping: 0,
            })
            .expect(400)

        expect(response.body.data).toBeNull()
        expect(response.body.error.status).toBe(400)
        expect(response.body.error.name).toBe('BadRequestError')
        expect(response.body.error.message).toMatch(/paymentIntentId|required/i)
        expect(response.body.error.details?.traceId).toBe('test-trace-cou8a')
        // Response header echoes the inbound trace id.
        expect(response.headers['x-trace-id']).toBe('test-trace-cou8a')

        // No Order was created.
        const all = await strapi.entityService.findMany('api::order.order', {})
        expect(all).toHaveLength(0)
    })

    it('3.4b [S-COU-8] missing userId returns 400 + structured error + X-Trace-Id', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-MISSING-UID-${Date.now()}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                // userId intentionally omitted
                paymentIntentId: `pi_no_uid_${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
            })
            .expect(400)

        expect(response.body.error.status).toBe(400)
        expect(response.body.error.name).toBe('BadRequestError')
        expect(response.body.error.message).toMatch(/userId|required/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()
    })

    it('3.4c [S-COU-8] non-array items returns 400 + structured error + X-Trace-Id', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-BAD-ITEMS-${Date.now()}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: `pi_bad_items_${Date.now()}`,
                items: 'not-an-array',
                subtotal: 0,
                shipping: 0,
            })
            .expect(400)

        expect(response.body.error.status).toBe(400)
        expect(response.body.error.name).toBe('BadRequestError')
        expect(response.body.error.message).toMatch(/items|must be an array/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()
    })

    it('3.4d [S-COU-8] non-numeric subtotal returns 400 + structured error + X-Trace-Id', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-BAD-SUB-${Date.now()}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: `pi_bad_sub_${Date.now()}`,
                items: [],
                subtotal: 'free', // not a number
                shipping: 0,
            })
            .expect(400)

        expect(response.body.error.status).toBe(400)
        expect(response.body.error.message).toMatch(/subtotal|must be a number/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()
    })
})
