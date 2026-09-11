// test/api/order-upsert-permission.test.ts
// [F1] Backend permission bootstrap drift — api::order.order.upsertByOrderId.
//
// Covers R-COU-11/12 and S-COU-11..15 from
// openspec/changes/F1-backend-permissions/specs/checkout-order-upsert/spec.md.
//
// A-7: assertions query the users-permissions_permission table directly —
// the try/catch at src/index.ts:171-173 swallows bootstrap errors into logs
// and setupStrapi() silences strapi.log.warn/info, so log assertions are
// unreliable. The re-boot test (S-COU-12) re-invokes the app's exported
// bootstrap() against the loaded instance instead of restarting Strapi.
//
// RED intent: on a clean boot (helper grant removed per S-COU-15) the grant
// must come from the production bootstrap in src/index.ts. Until F1 lands,
// the row is absent and the owner PUT is rejected 403 by the Users &
// Permissions middleware.
//
// Strapi 5.23.5 schema note: `plugin::users-permissions.permission` has only
// `action` + `role` attributes — the legacy `enabled` column was removed.
// Row EXISTENCE is the effective grant (the U&P strategy builds the ability
// from every row of the role). R-COU-11's "enabled: true" is therefore
// asserted as "row exists and is effective" (single row + owner PUT 200).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'fs'
import path from 'path'
import strapiApp from '../../src/index'
import {
    setupStrapi, cleanupStrapi, getStrapi,
    createTestUser, createTestProduct, resetDatabase, authenticateUser,
} from '../helpers/strapi-test-helpers'

const UPSERT_ACTION = 'api::order.order.upsertByOrderId'

// All permission rows for the action, with their role populated (A-7).
async function rowsForAction(strapi: any): Promise<any[]> {
    return strapi.query('plugin::users-permissions.permission').findMany({
        where: { action: UPSERT_ACTION },
        populate: ['role'],
    })
}

describe('[F1] Bootstrap permission invariant — upsertByOrderId (R-COU-11/12, S-COU-11..15)', () => {
    let strapi: any
    let testUser: any
    let auth: { jwt: string; user: any }

    beforeAll(async () => {
        strapi = await setupStrapi()
    }, 60000)

    afterAll(async () => {
        await cleanupStrapi()
    })

    beforeEach(async () => {
        await resetDatabase()
        testUser = await createTestUser({
            username: 'f1owner',
            email: 'f1owner@example.com',
            password: 'Test1234!',
        })
        auth = await authenticateUser('f1owner@example.com', 'Test1234!')
        // Enrichment PUT must not dispatch email webhooks.
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
    })

    // ============================================================
    // S-COU-11 (DB invariant) — clean bootstrap grants authenticated
    // ============================================================
    it('S-COU-11a clean bootstrap leaves exactly one enabled upsertByOrderId row for authenticated', async () => {
        const rows = await rowsForAction(strapi)
        const authRows = rows.filter((r) => r.role?.type === 'authenticated')
        // v5.23.5: row existence IS the effective grant (no enabled column).
        // Effectiveness is proven end-to-end by S-COU-11b (owner PUT → 200).
        expect(authRows).toHaveLength(1)
        expect(authRows[0].action).toBe(UPSERT_ACTION)
    })

    // ============================================================
    // R-COU-12 — grant restricted to `authenticated` only (no
    // public/anonymous/administrator widening on a clean install)
    // ============================================================
    it('R-COU-12 the action is granted to no role other than authenticated', async () => {
        const rows = await rowsForAction(strapi)
        const roleTypes = rows.map((r) => r.role?.type).sort()
        // Non-empty first: proves the grant exists AND is scoped (no
        // vacuous pass over an empty list).
        expect(roleTypes).toEqual(['authenticated'])
    })

    // ============================================================
    // S-COU-12 — idempotent re-boot keeps exactly one enabled row.
    // A-7: re-invoke the exported bootstrap() instead of a full restart.
    // ============================================================
    it('S-COU-12 re-invoking bootstrap does not duplicate the row', async () => {
        await strapiApp.bootstrap({ strapi })

        const rows = await rowsForAction(strapi)
        const authRows = rows.filter((r) => r.role?.type === 'authenticated')
        // Exactly one row overall (no duplicate) and it remains the
        // effective authenticated grant (row existence = enabled in v5).
        expect(rows).toHaveLength(1)
        expect(authRows).toHaveLength(1)
    })

    // ============================================================
    // S-COU-11b — owner PUT is NOT middleware-403: it reaches the
    // controller/service and the R-COU-2/5 owner-success path applies.
    // ============================================================
    it('S-COU-11b authenticated owner PUT reaches the service (200, not middleware 403)', async () => {
        const product = await createTestProduct({ name: 'F1 Permission Watch', price: 25, stock: 5 })
        const paymentIntentId = `pi_f1_${Date.now()}`
        const order = await strapi.entityService.create('api::order.order', {
            data: {
                orderId: `ORD-F1-${Date.now()}`,
                items: [{ id: product.id, quantity: 1 }],
                subtotal: 25,
                shipping: 0,
                total: 25,
                orderStatus: 'paid',
                paymentIntentId,
                stockDeducted: true, // isolate the permission path from stock CAS
                paymentInfo: { source: 'webhook_reconciliation' },
                user: { connect: [testUser.id] } as any,
                publishedAt: new Date().toISOString(),
            },
        })

        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/${order.orderId}`)
            .set('Authorization', `Bearer ${auth.jwt}`)
            .send({
                userId: testUser.id,
                paymentIntentId,
                items: [{ id: product.id, quantity: 1 }],
                subtotal: 25,
                shipping: 0,
                paymentInfo: { method: 'card', brand: 'visa', last4: '4242' },
            })
            .expect(200)

        expect(response.body.data.id).toBe(order.documentId)
    })

    // ============================================================
    // S-COU-13 — anonymous PUT rejected 403 by the U&P middleware
    // before the controller (message 'Forbidden', not the service's
    // ownership wording).
    // ============================================================
    it('S-COU-13 anonymous PUT → 403 structured error from the permissions middleware', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-F1-ANON-${Date.now()}`)
            .send({
                userId: testUser.id,
                paymentIntentId: 'pi_anon',
                items: [],
                subtotal: 0,
                shipping: 0,
            })
            .expect(403)

        expect(response.body.data).toBeNull()
        expect(response.body.error.status).toBe(403)
        expect(response.body.error.name).toBe('ForbiddenError')
        // Middleware-level rejection: generic 'Forbidden', never the
        // service-level ownership message.
        expect(response.body.error.message).toMatch(/forbidden/i)
    })

    // ============================================================
    // S-COU-14 — malformed JWT rejected 401 before the permission check
    // ============================================================
    it('S-COU-14 invalid JWT → 401 UnauthorizedError from the auth middleware', async () => {
        const response = await request(strapi.server.httpServer)
            .put(`/api/orders/by-order-id/ORD-F1-401-${Date.now()}`)
            .set('Authorization', 'Bearer invalid-token-12345')
            .send({
                userId: testUser.id,
                paymentIntentId: 'pi_bad_jwt',
                items: [],
                subtotal: 0,
                shipping: 0,
            })
            .expect(401)

        expect(response.body.error.status).toBe(401)
        expect(response.body.error.name).toBe('UnauthorizedError')
    })

    // ============================================================
    // S-COU-15 — setupTestPermissions no longer grants the action
    // artificially; production bootstrap in src/index.ts is the sole
    // grant path. Source inspection of the helper function body —
    // with companion assertions proving the extraction is non-vacuous.
    // ============================================================
    it('S-COU-15 setupTestPermissions does not grant upsertByOrderId', async () => {
        const helperPath = path.join(process.cwd(), 'test', 'helpers', 'strapi-test-helpers.ts')
        const source = readFileSync(helperPath, 'utf8')
        const fnMatch = source.match(/async function setupTestPermissions[\s\S]*?\n}\n/)
        expect(fnMatch, 'setupTestPermissions should exist in the helper source').not.toBeNull()

        const fnBody = fnMatch![0]
        // Non-vacuity guards: the inspected block still grants the other
        // actions (the helper was cleaned, not gutted).
        expect(fnBody).toContain('api::order.order.find')
        expect(fnBody).toContain('api::order.order.requestCancellation')
        // The invariant: the artificial UPSERT grant is gone.
        expect(fnBody).not.toContain(UPSERT_ACTION)
    })
})
