// test/api/order-upsert-ownership.test.ts
// [GAP-3] Checkout Order UPSERT — ownership mismatch scenarios.
//
// PR2 (Tasks 3.2, 3.3):
//   - 3.2: RED S-COU-5 userId mismatch → 403.
//   - 3.3: RED S-COU-6 paymentIntentId mismatch → 409.
//
// A-10: ctx.state.user.id is the SOLE identity authority. The
// controller's pre-trx check (payload.userId must equal auth) and the
// service's in-trx check (existing.user must equal auth) are two
// distinct rejection surfaces — both must surface as 403/409 with
// X-Trace-Id and zero mutation.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import {
    setupStrapi, cleanupStrapi, getStrapi,
    createTestUser,
    resetDatabase, authenticateUser,
} from '../helpers/strapi-test-helpers'

describe('[GAP-3] PUT /orders/by-order-id/:orderId — ownership (S-COU-5/6)', () => {
    let strapi: any
    let userA: any
    let userB: any
    let authA: { jwt: string; user: any }
    let authB: { jwt: string; user: any }

    beforeAll(async () => {
        strapi = await setupStrapi()
    }, 60000)
    afterAll(async () => { await cleanupStrapi() })

    beforeEach(async () => {
        await resetDatabase()

        userA = await createTestUser({
            username: 'ownera',
            email: 'ownera@example.com',
            password: 'Test1234!',
        })
        userB = await createTestUser({
            username: 'ownerb',
            email: 'ownerb@example.com',
            password: 'Test1234!',
        })
        authA = await authenticateUser('ownera@example.com', 'Test1234!')
        authB = await authenticateUser('ownerb@example.com', 'Test1234!')
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ============================================================
    // Task 3.2 — S-COU-5 userId mismatch → 403
    // ============================================================
    it('3.2 [S-COU-5] authenticated user B acting on user A order → 403 + userId stays A', async () => {
        const strapi = getStrapi()

        // 1. User A owns an order with paymentIntentId PI-1.
        const orderId = `ORD-OWN5-${Date.now()}`
        const paymentIntentId = `pi_own5_${Date.now()}`
        const ownedByA = await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [],
                subtotal: 50.00,
                shipping: 0,
                total: 50.00,
                orderStatus: 'paid',
                paymentIntentId,
                stockDeducted: false,
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [userA.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // 2. User B authenticates and PUTs with their own userId (matches
        //    auth) but the row is owned by A → service throws
        //    UpsertForbiddenError from inside the trx → 403.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${authB.jwt}`)
            .send({
                userId: userB.id,        // matches auth
                paymentIntentId,          // matches existing
                items: [{ id: 1, quantity: 1 }],
                subtotal: 50,
                shipping: 0,
                paymentInfo: { method: 'card', brand: 'visa', last4: '1111' },
            })
            .expect(403)

        expect(response.body.data).toBeNull()
        expect(response.body.error.status).toBe(403)
        expect(response.body.error.name).toBe('ForbiddenError')
        expect(response.body.error.message).toMatch(/own|auth/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()

        // 3. Zero mutation: row.user stays A; row.userId NOT in update
        //    payload; paymentInfo.source NOT overwritten by client.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: ownedByA.documentId,
            populate: ['user'] as any,
        })
        expect(after.user?.id).toBe(userA.id)
        expect(after.paymentInfo?.source).toBe('webhook_reconciliation')
        // Client keys did NOT land (rejected before merge).
        expect(after.paymentInfo?.method).toBeUndefined()
    })

    // ============================================================
    // Task 3.3 — S-COU-6 paymentIntentId mismatch → 409
    // ============================================================
    it('3.3 [S-COU-6] paymentIntentId mismatch (auth matches user) → 409 + PI stays PI-1', async () => {
        const strapi = getStrapi()

        // 1. User A owns an order with PI-1.
        const orderId = `ORD-OWN6-${Date.now()}`
        const originalPI = `pi_own6_orig_${Date.now()}`
        const ownedByA = await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [],
                subtotal: 75.00,
                shipping: 5,
                total: 80.00,
                orderStatus: 'paid',
                paymentIntentId: originalPI,
                stockDeducted: false,
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [userA.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // 2. User A PUTs with a DIFFERENT paymentIntentId (PI-2). Auth
        //    matches row.user; paymentIntentId does not match row →
        //    UpsertConflictError → 409.
        const differentPI = `pi_own6_attack_${Date.now()}`
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${authA.jwt}`)
            .send({
                userId: userA.id,
                paymentIntentId: differentPI,
                items: [{ id: 1, quantity: 1 }],
                subtotal: 75,
                shipping: 5,
                paymentInfo: { method: 'card', brand: 'visa', last4: '2222' },
            })
            .expect(409)

        expect(response.body.data).toBeNull()
        expect(response.body.error.status).toBe(409)
        expect(response.body.error.name).toBe('ConflictError')
        expect(response.body.error.message).toMatch(/paymentIntentId/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()

        // 3. paymentIntentId is NEVER in the update payload; row stays PI-1.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: ownedByA.documentId,
        })
        expect(after.paymentIntentId).toBe(originalPI)
        // Items did NOT land (rejected before merge).
        expect(after.items).toEqual([])
    })

    // ============================================================
    // Bonus: pre-trx payload.userId != auth → 403 (A-10 first check)
    // ============================================================
    it('3.2b [S-COU-5] payload userId != authenticated user → 403 before any trx (A-10 first check)', async () => {
        const orderId = `ORD-OWN5B-${Date.now()}`
        const paymentIntentId = `pi_own5b_${Date.now()}`
        await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 0,
                orderStatus: 'pending',
                paymentIntentId,
                stockDeducted: false,
                paymentInfo: {},
                user: { connect: [userA.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // User B is authenticated but the payload claims userId=A.
        // The service's pre-trx check (payload.userId === auth) fails
        // BEFORE the trx opens. Same 403 envelope.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${authB.jwt}`)
            .send({
                userId: userA.id,        // payload claims A
                paymentIntentId,
                items: [],
                subtotal: 0,
                shipping: 0,
            })
            .expect(403)

        expect(response.body.error.status).toBe(403)
        expect(response.body.error.name).toBe('ForbiddenError')
        expect(response.body.error.message).toMatch(/userId|authenticated|mismatch/i)
        expect(response.body.error.details?.traceId).toBeDefined()
        expect(response.headers['x-trace-id']).toBeDefined()
    })
})