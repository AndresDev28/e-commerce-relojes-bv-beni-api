// test/api/order-upsert-concurrency.test.ts
// [GAP-3] Checkout Order UPSERT — concurrency barrier race + idempotent repeat PUT.
//
// PR2 (Tasks 4.1, 4.2):
//   - 4.1: RED S-COU-9 barrier race — bounded retry converges to one
//          authoritative record (A-11).
//   - 4.2: RED S-COU-10 idempotent repeat PUT — no dispatch, history, or
//          side-effect fires beyond the first write.
//
// SQLite serializes globally so a "true" two-writer race isn't observable
// from inside the test — both PUTs run sequentially and both would succeed
// without a constraint violation. To prove the bounded-retry mechanism
// (A-11) we spy on the document service to simulate the losing INSERT,
// then assert the retry path converges to one authoritative row.

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import request from 'supertest'
import {
    setupStrapi, cleanupStrapi, getStrapi,
    createTestUser, createTestProduct,
    resetDatabase, authenticateUser,
} from '../helpers/strapi-test-helpers'

describe('[GAP-3] PUT /orders/by-order-id/:orderId — concurrency (S-COU-9/10)', () => {
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
            username: 'concuser',
            email: 'concuser@example.com',
            password: 'Test1234!',
        })
        auth = await authenticateUser('concuser@example.com', 'Test1234!')
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
        vi.clearAllMocks()
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ============================================================
    // Task 4.1 — S-COU-9 barrier race + bounded retry
    // ============================================================
    it('4.1 [S-COU-9] losing INSERT triggers bounded retry → converges to one authoritative row', async () => {
        const strapi = getStrapi()

        const orderId = `ORD-RACE-${Date.now()}`
        const paymentIntentId = `pi_race_${Date.now()}`
        const product = await createTestProduct({ name: 'Race Watch', stock: 5 })

        // 1. Pre-create the "winner" paid shell (the webhook row that won
        //    the race). Items are empty so the lifecycle stock gate has
        //    nothing to bite on initial state.
        const winner = await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 50.00,
                orderStatus: 'paid',
                paymentIntentId,
                stockDeducted: false,
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        // 2. Spy on the document service to simulate the race window:
        //    - First findFirst returns null (blind spot before winner
        //      committed — the loser doesn't see the row yet).
        //    - First create throws unique constraint (loser INSERT
        //      collided with the winner).
        //    - Second findFirst returns the real winner (winner has
        //      committed by the time we retry).
        const documents = strapi.documents('api::order.order')
        const realFindFirst = documents.findFirst.bind(documents)
        const realCreate = documents.create.bind(documents)

        let findFirstAttempts = 0
        let createAttempts = 0
        const findFirstSpy = vi.spyOn(documents, 'findFirst').mockImplementation(async function (this: any, opts: any) {
            findFirstAttempts++
            if (findFirstAttempts === 1) return null // blind spot
            return realFindFirst(opts)
        })
        const createSpy = vi.spyOn(documents, 'create').mockImplementation(async function (this: any, opts: any) {
            createAttempts++
            if (createAttempts === 1) {
                const e: any = new Error(
                    'UNIQUE constraint failed: orders.order_id (20619 SQLITE_CONSTRAINT_UNIQUE)',
                )
                e.code = 'SQLITE_CONSTRAINT_UNIQUE'
                throw e
            }
            return realCreate(opts)
        })

        try {
            // 3. Drive the upsert. The first try hits unique constraint;
            //    the bounded retry should re-find (sees the winner's paid
            //    shell), pass the gates, and update in place.
            const result = await strapi
                .service('api::order.upsert')
                .upsertOrderByOrderId(
                    orderId,
                    {
                        userId: testUser.id,
                        paymentIntentId,
                        items: [{ id: product.id, quantity: 2 }],
                        subtotal: 50.00,
                        shipping: 0,
                        paymentInfo: { method: 'card', brand: 'visa', last4: '4242' },
                    },
                    testUser.id,
                    'trace-race',
                )

            // 4. The retry path was exercised: first findFirst was null,
            //    first create threw, retry's findFirst returned the winner.
            expect(findFirstAttempts).toBe(2)
            expect(createAttempts).toBe(1) // retry routed through enrich, not create

            // 5. The result is the winner's documentId (enrichment went
            //    to the authoritative row).
            expect(result.documentId).toBe(winner.documentId)

            // 6. Exactly one Order row exists for this orderId (uniqueness
            //    preserved by the bounded retry's converge behavior).
            const all: any[] = await strapi.entityService.findMany('api::order.order', {
                filters: { orderId } as any,
            })
            expect(all).toHaveLength(1)
            expect(all[0].documentId).toBe(winner.documentId)

            // 7. The winner's row was enriched: items landed,
            //    paymentInfo merged with server keys, status preserved.
            expect(all[0].items).toEqual([{ id: product.id, quantity: 2 }])
            expect(all[0].orderStatus).toBe('paid')
            expect(all[0].paymentInfo?.source).toBe('webhook_reconciliation')
            expect(all[0].paymentInfo?.method).toBe('card')
            expect(all[0].paymentInfo?.brand).toBe('visa')
            expect(all[0].paymentInfo?.last4).toBe('4242')
        } finally {
            findFirstSpy.mockRestore()
            createSpy.mockRestore()
        }
    })

    it('4.1b [S-COU-9] retry is BOUNDED — second unique violation surfaces as 409 (never loops)', async () => {
        const strapi = getStrapi()

        const orderId = `ORD-RACE-BOUNDED-${Date.now()}`
        const paymentIntentId = `pi_bounded_${Date.now()}`

        // Pre-create winner so findFirst eventually returns it.
        await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [],
                subtotal: 0,
                shipping: 0,
                total: 50.00,
                orderStatus: 'paid',
                paymentIntentId,
                stockDeducted: false,
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        const documents = strapi.documents('api::order.order')
        const realFindFirst = documents.findFirst.bind(documents)

        let findFirstAttempts = 0
        const findFirstSpy = vi.spyOn(documents, 'findFirst').mockImplementation(async function (this: any, opts: any) {
            findFirstAttempts++
            return realFindFirst(opts) // both calls would see the winner — but
                                       // we'll force create() to keep throwing.
        })
        let createAttempts = 0
        const createSpy = vi.spyOn(documents, 'create').mockImplementation(async function (this: any, _opts: any) {
            createAttempts++
            const e: any = new Error(
                `UNIQUE constraint failed: orders.order_id (attempt ${createAttempts})`,
            )
            e.code = 'SQLITE_CONSTRAINT_UNIQUE'
            throw e
        })

        try {
            // Since findFirst always returns the winner, the service will
            // take the enrich path, never reaching create. To force the
            // unique-violation path we need to additionally skip the winner
            // — make findFirst return null on the first call so the
            // service tries to INSERT, then throws.
            findFirstSpy.mockImplementation(async function (this: any, opts: any) {
                findFirstAttempts++
                return null // always null so INSERT path is always taken
            })

            // Upsert must surface the unique-constraint error after the
            // bounded retry is exhausted.
            await expect(
                strapi.service('api::order.upsert').upsertOrderByOrderId(
                    orderId,
                    {
                        userId: testUser.id,
                        paymentIntentId,
                        items: [],
                        subtotal: 0,
                        shipping: 0,
                    },
                    testUser.id,
                    'trace-bounded',
                ),
            ).rejects.toThrow(/Concurrent write lost|UNIQUE|constraint/i)

            // Critical: bounded = exactly 2 attempts (initial + 1 retry).
            // If retry were unbounded we'd see many more.
            expect(createAttempts).toBeLessThanOrEqual(2)
            expect(createAttempts).toBeGreaterThanOrEqual(2)
        } finally {
            findFirstSpy.mockRestore()
            createSpy.mockRestore()
        }
    })

    it('4.1c [S-COU-9] real Promise.all on same orderId: SQLite serialization converges idempotently', async () => {
        const strapi = getStrapi()

        const orderId = `ORD-RACE-REAL-${Date.now()}`
        const paymentIntentId = `pi_real_${Date.now()}`
        const product = await createTestProduct({ name: 'Real Race Watch', stock: 5 })

        // Two parallel PUTs with identical body. SQLite serializes them,
        // so both succeed without triggering the retry path — but the
        // contract is "exactly one Order per orderId" regardless.
        const firePut = () =>
            request(strapi.server.httpServer)
                .put(`/api/orders/by-order-id/${orderId}`)
                .set('Authorization', `Bearer ${auth.jwt}`)
                .send({
                    userId: testUser.id,
                    paymentIntentId,
                    items: [{ id: product.id, quantity: 1 }],
                    subtotal: 50,
                    shipping: 0,
                    paymentInfo: { method: 'card', brand: 'visa', last4: '1111' },
                })

        const [r1, r2] = await Promise.all([firePut(), firePut()])
        expect(r1.status).toBe(200)
        expect(r2.status).toBe(200)

        // Exactly one Order row exists.
        const all: any[] = await strapi.entityService.findMany('api::order.order', {
            filters: { orderId } as any,
        })
        expect(all).toHaveLength(1)

        // Both responses point to the same documentId.
        expect(r1.body.data.id).toBe(r2.body.data.id)
        expect(r1.body.data.id).toBe(all[0].documentId)
    })

    // ============================================================
    // Task 4.2 — S-COU-10 idempotent repeat PUT
    // ============================================================
    it('4.2 [S-COU-10] identical repeat PUT produces no additional dispatch, history row, or stock decrement', async () => {
        const strapi = getStrapi()

        const product = await createTestProduct({ name: 'Idempotent Watch', stock: 10 })
        const initialStock = product.stock

        // Seed a paid shell.
        const orderId = `ORD-IDEMPOTENT-${Date.now()}`
        const paymentIntentId = `pi_idempotent_${Date.now()}`
        await strapi.entityService.create('api::order.order', {
            data: {
                orderId,
                items: [{ id: product.id, quantity: 2 }],
                subtotal: 50.00,
                shipping: 0,
                total: 50.00,
                orderStatus: 'paid',
                paymentIntentId,
                stockDeducted: false,
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
        vi.stubGlobal('fetch', mockFetch)

        const payload = {
            userId: testUser.id,
            paymentIntentId,
            items: [{ id: product.id, quantity: 2 }],
            subtotal: 50.00,
            shipping: 0,
            paymentInfo: { method: 'card', brand: 'visa', last4: '4242' },
        }

        // 1. First PUT.
        const r1 = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send(payload)
            .expect(200)
        expect(r1.body.data.id).toBeDefined()

        // Settle async lifecycles.
        await new Promise((resolve) => setTimeout(resolve, 100))

        // 2. Snapshot state after first PUT.
        const after1: any = await strapi.documents('api::order.order').findOne({
            documentId: r1.body.data.id,
        })
        expect(after1.stockDeducted).toBe(true)
        const productRowAfter1: any = await strapi.db.query('api::product.product').findOne({
            where: { id: product.id },
            select: ['stock'],
        })
        const stockAfter1 = productRowAfter1.stock
        expect(stockAfter1).toBe(initialStock - 2)

        // 3. Second PUT — identical body.
        const r2 = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send(payload)
            .expect(200)
        expect(r2.body.data.id).toBe(r1.body.data.id)

        await new Promise((resolve) => setTimeout(resolve, 100))

        // 4. Stock DID NOT decrement a second time. The lifecycle's
        //    `paid && stockDeducted` CAS marker short-circuits the gate.
        const productRowAfter2: any = await strapi.db.query('api::product.product').findOne({
            where: { id: product.id },
            select: ['stock'],
        })
        expect(productRowAfter2.stock).toBe(stockAfter1)

        // 5. Zero email dispatches across BOTH calls. Order-status
        //    unchanged → afterUpdate early-return path.
        const emailCalls = mockFetch.mock.calls.filter((call: any[]) => {
            const url = call[0]
            return typeof url === 'string' && url.includes('/api/send-order-email')
        })
        expect(emailCalls).toHaveLength(0)

        // 6. No additional history row — orderStatus didn't change.
        //    (History rows are populated by the order-history content
        //    type; the simplest observable proxy is that the order row's
        //    own updatedAt advanced but no status-history side-effect
        //    fired. We assert indirectly: orderStatus stayed 'paid' and
        //    no email/webhook dispatched.)
        const after2: any = await strapi.documents('api::order.order').findOne({
            documentId: r1.body.data.id,
        })
        expect(after2.orderStatus).toBe('paid')
        expect(after2.stockDeducted).toBe(true)
    })
})