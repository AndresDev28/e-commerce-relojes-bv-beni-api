// test/api/order-upsert-payment-failed.test.ts
// [GAP-3] PR1 — Task 2.2 RED test for S-COU-2: payment_failed shell
// enrichment preserves status + redacted paymentError without restarting
// payment.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import {
    setupStrapi, cleanupStrapi, getStrapi,
    createTestUser, createTestProduct,
    resetDatabase, authenticateUser,
} from '../helpers/strapi-test-helpers'

describe('[GAP-3] PUT /orders/by-order-id/:orderId — payment_failed shell', () => {
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
            username: 'pffail',
            email: 'pffail@example.com',
            password: 'Test1234!',
        })
        auth = await authenticateUser('pffail@example.com', 'Test1234!')
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // Task 2.2 — S-COU-2
    it('2.2 [S-COU-2] enriches payment_failed shell — items land, orderStatus + paymentError preserved byte-identical, no payment restart', async () => {
        const strapi = getStrapi()
        const product = await createTestProduct({ name: 'PF Watch', stock: 5 })

        // 1. Create a payment_failed shell (webhook reconciliation shape).
        //    paymentInfo.paymentError is the REDACTED shape (R-PFS-5) — only
        //    `{ code, failure_message }`, no decline_code, no PAN.
        const pfShell = await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `ORD-PF-${Date.now()}`,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 50.00,
                orderStatus: 'payment_failed',
                paymentIntentId: `pi_pf_${Date.now()}`,
                stockDeducted: false,
                paymentInfo: {
                    source: 'webhook_reconciliation',
                    paymentError: { code: 'card_declined', failure_message: 'Your card was declined.' },
                },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
        vi.stubGlobal('fetch', mockFetch)

        // 2. Enrich via PUT.
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${pfShell.orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId: pfShell.paymentIntentId,
                items: [{ id: product.id, quantity: 1 }],
                subtotal: 50.00,
                shipping: 0,
                paymentInfo: { method: 'card', brand: 'visa', last4: '0000' },
            })
            .expect(200)

        expect(response.body.data.id).toBe(pfShell.documentId)

        // 3. Reload via Document Service.
        const after: any = await strapi.documents('api::order.order').findOne({
            documentId: pfShell.documentId,
        })

        // items landed
        expect(Array.isArray(after.items)).toBe(true)
        expect(after.items).toHaveLength(1)
        expect(after.items[0]).toMatchObject({ id: product.id, quantity: 1 })

        // orderStatus preserved byte-identical (D3)
        expect(after.orderStatus).toBe('payment_failed')

        // paymentInfo.paymentError preserved byte-identical (D3) — the
        // redacted shape is exactly what the webhook wrote; client
        // paymentInfo merge does not touch it.
        expect(after.paymentInfo?.paymentError).toEqual({
            code: 'card_declined',
            failure_message: 'Your card was declined.',
        })

        // paymentInfo.source preserved (D7 merge over server keys).
        expect(after.paymentInfo?.source).toBe('webhook_reconciliation')

        // Payment NOT restarted — total is preserved (webhook-set, not
        // recomputed), no Stripe interaction observed in logs.
        expect(after.total).toBe(50.00)

        // 4. Settle async lifecycles and assert no email dispatches.
        await new Promise((resolve) => setTimeout(resolve, 100))
        const emailCalls = mockFetch.mock.calls.filter((call: any[]) => {
            const url = call[0]
            return typeof url === 'string' && url.includes('/api/send-order-email')
        })
        expect(emailCalls).toHaveLength(0)
    })
})
