// test/api/order-upsert-paid-shell.test.ts
// [GAP-3] Checkout Order UPSERT — paid-shell enrichment scenarios.
//
// PR1 scope (tasks 1.1.1, 2.1, 2.4):
//   - 1.1.1: RED test for `upsertOrderByOrderId` signature + transaction seam.
//   - 2.1: RED S-COU-1 paid-state preservation + A-13 stock-once/no-email.
//   - 2.4: RED S-COU-7 paymentInfo merge allowlist preserves server keys.
//   - 2.10 (PR2, not in this file): S-COU-10 idempotent repeat PUT.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import {
    setupStrapi,
    cleanupStrapi,
    getStrapi,
    createTestUser,
    createTestProduct,
    createTestOrder,
    resetDatabase,
    authenticateUser,
    getAuthHeaders,
} from '../helpers/strapi-test-helpers'

describe('[GAP-3] PUT /orders/by-order-id/:orderId — paid-shell enrichment', () => {
    let strapi: any
    let testUser: any
    let auth: { jwt: string; user: any }

    beforeAll(async () => {
        strapi = await setupStrapi()
        testUser = await createTestUser({
            username: 'upsertuser',
            email: 'upsert@example.com',
            password: 'Test1234!',
        })
    }, 60000)

    afterAll(async () => {
        await cleanupStrapi()
    })

    beforeEach(async () => {
        await resetDatabase()
        testUser = await createTestUser({
            username: 'upsertuser',
            email: 'upsert@example.com',
            password: 'Test1234!',
        })
        auth = await authenticateUser('upsert@example.com', 'Test1234!')
        // No email dispatches on enrich — kill the gate explicitly.
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
        vi.clearAllMocks()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ============================================================
    // Task 1.1.1 — Service signature + transaction seam
    // ============================================================
    it('1.1.1 registers api::order.upsert with upsertOrderByOrderId(orderId, payload, authUserId, traceId) inside strapi.db.transaction', async () => {
        const upsertService = strapi.service('api::order.upsert')
        expect(upsertService, 'api::order.upsert service should be registered').toBeDefined()
        expect(typeof upsertService.upsertOrderByOrderId).toBe('function')

        // Spy the transaction envelope — proves the seam exists and is used.
        const transactionSpy = vi.spyOn(strapi.db, 'transaction')

        // Minimal payload — service is not yet implemented; this call should
        // either reach a not-implemented placeholder (current RED state) or
        // return a real result once GREEN. The spy assertion is the
        // contract: any successful or failed call must go through
        // strapi.db.transaction.
        const orderId = `ORD-SEAM-${Date.now()}`
        const payload: any = {
            userId: testUser.id,
            paymentIntentId: `pi-seam-${Date.now()}`,
            items: [],
            subtotal: 0,
            shipping: 0,
            paymentInfo: {},
        }

        // Invoke the seam. We don't assert on the return value here; this
        // test only proves (a) the service is registered with the expected
        // shape and (b) every call enters strapi.db.transaction.
        let callError: unknown = null
        try {
            await upsertService.upsertOrderByOrderId(orderId, payload, testUser.id, 'trace-seam')
        } catch (err) {
            callError = err
        }

        expect(transactionSpy).toHaveBeenCalled()
        expect(transactionSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
        // The call SHOULD have produced some result or error — the spy is
        // the binding constraint, not the return value (this is RED).
        // eslint-disable-next-line no-unused-expressions
        callError // placeholder; consumed below when GREEN lands
    })

    // ============================================================
    // Task 2.1 — S-COU-1 paid-state preservation + A-13 stock-once/no-email
    // ============================================================
    it('2.1 [S-COU-1] enriches paid shell — items land, orderStatus/source/paymentError byte-identical, stock decremented once, zero email dispatches', async () => {
        const strapi = getStrapi()

        // 1. Create a product with stock so the CAS decrement has something to bite.
        const product = await createTestProduct({
            name: 'Watch Model A',
            price: 199.99,
            stock: 10,
        })
        const initialStock = product.stock

        // 2. Create a paid shell in the shape the webhook would have created
        //    (D+ shell, GAP-1 archived). items: [] is the key — the stock
        //    gate in lifecycles.ts:297-378 only fires when items are present.
        const paidShell = await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `ORD-COU1-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 199.99,
                orderStatus: 'paid',
                paymentIntentId: `pi_cou1_${Date.now()}`,
                stockDeducted: false,
                paymentInfo: {
                    source: 'webhook_reconciliation',
                    paymentError: { code: 'card_declined', failure_message: 'Historical error' },
                },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // 3. Spy fetch so we can assert no email webhook fires on enrichment.
        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
        vi.stubGlobal('fetch', mockFetch)

        // 4. Drive the enrichment PUT.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${paidShell.orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: paidShell.paymentIntentId,
                items: [{ id: product.id, quantity: 2 }],
                subtotal: 199.99,
                shipping: 10,
                paymentInfo: { method: 'card', brand: 'visa', last4: '4242' },
            })
            .expect(200)

        expect(response.body.data).toBeDefined()
        expect(response.body.data.id).toBe(paidShell.documentId)

        // 5. Reload the order via Document Service to check byte-identical
        //    preservation of server-owned fields.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: paidShell.documentId,
        })

        // items landed
        expect(Array.isArray(after.items)).toBe(true)
        expect(after.items).toHaveLength(1)
        expect(after.items[0]).toMatchObject({ id: product.id, quantity: 2 })

        // orderStatus preserved byte-identical
        expect(after.orderStatus).toBe('paid')

        // paymentInfo.source preserved byte-identical
        expect(after.paymentInfo?.source).toBe('webhook_reconciliation')

        // paymentInfo.paymentError preserved byte-identical (S-COU-1 / D2)
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'card_declined',
            failure_message: 'Historical error',
        })

        // 6. Stock decrement: exactly one CAS decrement by item.quantity (A-13).
        //    `stockDeducted` flips to true and product stock falls by 2.
        expect(after.stockDeducted).toBe(true)
        const productAfter: any = await strapi.entityService.findOne(
            'api::product.product',
            product.id,
            { fields: ['stock'] },
        )
        expect(productAfter.stock).toBe(initialStock - 2)

        // 7. Zero email webhook dispatches on enrichment (status preserved → no
        //    email/history). afterUpdate's `previousStatus === newStatus`
        //    early-return is the gate.
        // Settle async lifecycles.
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(mockFetch).not.toHaveBeenCalled()
    })

    // ============================================================
    // Task 2.4 — S-COU-7 merge allowlist preserves server keys
    // ============================================================
    it('2.4 [S-COU-7] client paymentInfo allowlist merges over server keys without clobbering source/paymentError', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: 'Watch Model B', price: 50, stock: 5 })

        const serverPaymentInfo = {
            source: 'webhook_reconciliation',
            paymentError: { code: 'card_declined', failure_message: 'Historical' },
        }

        const shell = await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `ORD-COU7-${Date.now()}`,
                items: [{ id: product.id, quantity: 1 }],
                subtotal: 50,
                shipping: 0,
                total: 50,
                orderStatus: 'paid',
                paymentIntentId: `pi_cou7_${Date.now()}`,
                stockDeducted: true, // pretend already-decremented to isolate merge assertion
                paymentInfo: serverPaymentInfo,
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // Client tries to send a malicious paymentInfo that includes the
        // server-only `source` key plus a brand-new `secret` key. The merge
        // contract must drop everything except {method, brand, last4}.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${shell.orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: shell.paymentIntentId,
                items: [{ id: product.id, quantity: 1 }],
                subtotal: 50,
                shipping: 0,
                paymentInfo: {
                    method: 'card',
                    brand: 'visa',
                    last4: '4242',
                    source: 'forged_by_client', // MUST be dropped
                    secret: 'sensitive', // MUST be dropped (unknown key)
                },
            })
            .expect(200)

        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: shell.documentId,
        })

        // paymentInfo must equal { source, paymentError, method, brand, last4 }
        // — server keys preserved, client allowlist merged in, forged + unknown dropped.
        expect(after.paymentInfo).toEqual({
            source: 'webhook_reconciliation',
            paymentError: { code: 'card_declined', failure_message: 'Historical' },
            method: 'card',
            brand: 'visa',
            last4: '4242',
        })

        // status and server keys are NOT replaced wholesale.
        expect(after.paymentInfo?.source).toBe('webhook_reconciliation')
        expect(after.paymentInfo?.secret).toBeUndefined()
        expect(response.body.data.id).toBe(shell.documentId)
    })
})
