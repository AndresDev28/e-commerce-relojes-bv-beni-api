// test/api/shipment-lifecycle.test.ts
// [SHIP-04] Tests: modelo Shipment, transiciones de estado y lifecycle hooks
//
// Integration test suite for Shipment model, SHIP-02 auto-creation,
// SHIP-03 reverse synchronization, and edge cases.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
    setupStrapi,
    cleanupStrapi,
    getStrapi,
    createTestUser,
    createTestOrder,
    createTestShipment,
    resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[SHIP-04] Shipment Model & Lifecycle Hooks', () => {
    let strapi: any
    let testUser: any

    beforeAll(async () => {
        console.log('🧪 [SHIP-04] Setting up test environment...')
        strapi = await setupStrapi()
        testUser = await createTestUser({
            username: 'shiptest-user',
            email: 'shiptest@example.com',
            password: 'Test1234!'
        })
        console.log(`✅ Test user created: ${testUser.email} (ID: ${testUser.id})`)
    }, 60000)

    afterAll(async () => {
        console.log('🧹 [SHIP-04] Cleaning up test environment...')
        await cleanupStrapi()
    })

    beforeEach(async () => {
        await resetDatabase()
        testUser = await createTestUser({
            username: 'shiptest-user',
            email: 'shiptest@example.com',
            password: 'Test1234!'
        })
        vi.clearAllMocks()
        process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    // ════════════════════════════════════════════════════════════
    // 1. SHIPMENT MODEL — Fields, defaults and relations
    // ════════════════════════════════════════════════════════════
    describe('Shipment Model', () => {
        it('[SM-1] should create a Shipment with required fields', async () => {
            console.log('\n🎯 [SM-1] Create Shipment with required fields')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
                subtotal: 199.99,
                shipping: 10,
                total: 209.99
            }, testUser.id)

            const shipment = await createTestShipment({
                tracking_number: 'TRK-SM1-TEST',
                carrier: 'SEUR',
                status: 'shipped',
            }, order.id)

            expect(shipment).toBeDefined()
            expect(shipment.tracking_number).toBe('TRK-SM1-TEST')
            expect(shipment.carrier).toBe('SEUR')
            expect(shipment.status).toBe('shipped')
            console.log('✅ [SM-1] PASSED')
        })

        it('[SM-2] should create a Shipment with all fields populated', async () => {
            console.log('\n🎯 [SM-2] Create Shipment with all fields')

            const order = await createTestOrder({
                orderStatus: 'shipped' as const,
                items: [{ productId: 1, name: 'Reloj Premium', price: 599.99, quantity: 1 }],
                subtotal: 599.99,
                shipping: 0,
                total: 599.99
            }, testUser.id)

            const shipment = await createTestShipment({
                tracking_number: 'SEUR-987654',
                carrier: 'SEUR',
                status: 'shipped',
                estimated_delivery_date: '2026-03-15',
            }, order.id)

            expect(shipment.tracking_number).toBe('SEUR-987654')
            expect(shipment.carrier).toBe('SEUR')
            expect(shipment.status).toBe('shipped')
            expect(shipment.estimated_delivery_date).toBeDefined()
            console.log('✅ [SM-2] PASSED')
        })

        it('[SM-3] should link Shipment to Order via oneToOne relation', async () => {
            console.log('\n🎯 [SM-3] Verify oneToOne Order ↔ Shipment relation')

            const order = await createTestOrder({
                orderStatus: 'shipped' as const,
                items: [{ productId: 1, name: 'Reloj Test', price: 99.99, quantity: 1 }],
                subtotal: 99.99,
                shipping: 10,
                total: 109.99
            }, testUser.id)

            const shipment = await createTestShipment({
                tracking_number: 'REL-TEST-001',
                carrier: 'Correos',
                status: 'shipped',
            }, order.id)

            // Verify the relation from Shipment side
            expect(shipment.order).toBeDefined()
            expect(shipment.order.id).toBe(order.id)
            console.log('✅ [SM-3] PASSED')
        })
    })

    // ════════════════════════════════════════════════════════════
    // 2. [SHIP-02] Auto-creation: Order processing → shipped
    // ════════════════════════════════════════════════════════════
    describe('[SHIP-02] Auto-creation on Order → shipped', () => {
        it('[AC-1] should auto-create Shipment when Order transitions to shipped', async () => {
            console.log('\n🎯 [AC-1] Order processing → shipped auto-creates Shipment')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Auto', price: 299.99, quantity: 1 }],
                subtotal: 299.99,
                shipping: 10,
                total: 309.99
            }, testUser.id)

            // Transition to shipped (triggers afterUpdate lifecycle hook)
            await strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'shipped' }
            })

            // Allow time for async lifecycle hook to complete
            await new Promise(resolve => setTimeout(resolve, 500))

            // Query for the auto-created shipment
            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
                populate: ['order'],
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBeGreaterThanOrEqual(1)

            const autoShipment = shipmentList[0]
            expect(autoShipment.status).toBe('shipped')
            expect(autoShipment.tracking_number).toBeDefined()
            expect(autoShipment.carrier).toBeDefined()
            console.log(`✅ [AC-1] PASSED — auto Shipment created with tracking: ${autoShipment.tracking_number}`)
        })

        it('[AC-2] should use default tracking TRK-{orderId} and carrier Otro when no note', async () => {
            console.log('\n🎯 [AC-2] Default tracking and carrier when no statusChangeNote')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Default', price: 149.99, quantity: 1 }],
                subtotal: 149.99,
                shipping: 10,
                total: 159.99
            }, testUser.id)

            await strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'shipped' }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBeGreaterThanOrEqual(1)

            const autoShipment = shipmentList[0]
            // Default tracking format: TRK-{orderId}
            expect(autoShipment.tracking_number).toMatch(/^TRK-/)
            expect(autoShipment.carrier).toBe('Otro')
            console.log(`✅ [AC-2] PASSED — defaults: tracking=${autoShipment.tracking_number}, carrier=${autoShipment.carrier}`)
        })

        it('[AC-3] should extract carrier SEUR and tracking from statusChangeNote', async () => {
            console.log('\n🎯 [AC-3] Extract carrier/tracking from note "SEUR ABC123456"')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj SEUR', price: 399.99, quantity: 1 }],
                subtotal: 399.99,
                shipping: 0,
                total: 399.99
            }, testUser.id)

            // Update with a statusChangeNote containing carrier and tracking
            // Note: The regex [A-Z0-9]{6,20} matches alphanumeric strings 6-20 chars.
            // We place the tracking number clearly to avoid matching other words.
            await strapi.entityService.update('api::order.order', order.id, {
                data: {
                    orderStatus: 'shipped',
                    statusChangeNote: 'SEUR ABC123456'
                }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBeGreaterThanOrEqual(1)

            const autoShipment = shipmentList[0]
            expect(autoShipment.carrier).toBe('SEUR')
            expect(autoShipment.tracking_number).toBe('ABC123456')
            console.log(`✅ [AC-3] PASSED — carrier=${autoShipment.carrier}, tracking=${autoShipment.tracking_number}`)
        })

        it('[AC-4] should extract carrier Correos from statusChangeNote', async () => {
            console.log('\n🎯 [AC-4] Extract carrier Correos from note')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Correos', price: 79.99, quantity: 1 }],
                subtotal: 79.99,
                shipping: 5,
                total: 84.99
            }, testUser.id)

            await strapi.entityService.update('api::order.order', order.id, {
                data: {
                    orderStatus: 'shipped',
                    statusChangeNote: 'Correos PQ5XX1234567890'
                }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBeGreaterThanOrEqual(1)

            const autoShipment = shipmentList[0]
            expect(autoShipment.carrier).toBe('Correos')
            console.log(`✅ [AC-4] PASSED — carrier=${autoShipment.carrier}`)
        })
    })

    // ════════════════════════════════════════════════════════════
    // 3. [SHIP-02] Guard anti-duplicados
    // ════════════════════════════════════════════════════════════
    describe('[SHIP-02] Duplicate Shipment Guard', () => {
        it('[DG-1] should NOT create a second Shipment when re-updating a shipped order', async () => {
            console.log('\n🎯 [DG-1] Re-update shipped order → no duplicate Shipment')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Dup', price: 199.99, quantity: 1 }],
                subtotal: 199.99,
                shipping: 10,
                total: 209.99
            }, testUser.id)

            // First transition → shipped (creates Shipment)
            await strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'shipped' }
            })
            await new Promise(resolve => setTimeout(resolve, 500))

            // Re-update the same order (e.g. change shipping cost) without changing status
            await strapi.entityService.update('api::order.order', order.id, {
                data: { shipping: 0 }
            })
            await new Promise(resolve => setTimeout(resolve, 500))

            // Count shipments linked to this order
            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBe(1)
            console.log('✅ [DG-1] PASSED — only 1 Shipment exists after re-update')
        })
    })

    // ════════════════════════════════════════════════════════════
    // 4. [SHIP-03] Reverse sync: Shipment status → Order status
    // ════════════════════════════════════════════════════════════
    describe('[SHIP-03] Reverse Sync: Shipment → Order', () => {
        it('[RS-1] Shipment delivered → Order becomes delivered', async () => {
            console.log('\n🎯 [RS-1] Shipment delivered → Order delivered')

            const order = await createTestOrder({
                orderStatus: 'shipped' as const,
                items: [{ productId: 1, name: 'Reloj Delivered', price: 499.99, quantity: 1 }],
                subtotal: 499.99,
                shipping: 0,
                total: 499.99
            }, testUser.id)

            const shipment = await createTestShipment({
                tracking_number: 'RS1-DELIVERED-TEST',
                carrier: 'GLS',
                status: 'shipped',
            }, order.id)

            // Update Shipment to delivered (triggers Shipment afterUpdate lifecycle)
            await strapi.entityService.update('api::shipment.shipment' as any, shipment.id, {
                data: { status: 'delivered' }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            // Verify Order was updated to delivered
            const updatedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
                fields: ['orderStatus']
            })

            expect(updatedOrder.orderStatus).toBe('delivered')
            console.log('✅ [RS-1] PASSED — Order now delivered')
        })

        it('[RS-2] Shipment staying as shipped should NOT change Order status', async () => {
            console.log('\n🎯 [RS-2] Shipment remains shipped → Order stays shipped')

            const order = await createTestOrder({
                orderStatus: 'shipped' as const,
                items: [{ productId: 1, name: 'Reloj NoChange', price: 149.99, quantity: 1 }],
                subtotal: 149.99,
                shipping: 10,
                total: 159.99
            }, testUser.id)

            const shipment = await createTestShipment({
                tracking_number: 'RS2-NOCHANGE-TEST',
                carrier: 'MRW',
                status: 'shipped',
            }, order.id)

            // Update Shipment without changing status (e.g. update carrier)
            await strapi.entityService.update('api::shipment.shipment' as any, shipment.id, {
                data: { carrier: 'GLS' }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            // Verify Order remains shipped
            const updatedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
                fields: ['orderStatus']
            })

            expect(updatedOrder.orderStatus).toBe('shipped')
            console.log('✅ [RS-2] PASSED — Order remains shipped')
        })
    })

    // ════════════════════════════════════════════════════════════
    // 5. Negative Tests
    // ════════════════════════════════════════════════════════════
    describe('Negative Tests', () => {
        it('[NT-1] should NOT create Shipment when order transitions to cancelled', async () => {
            console.log('\n🎯 [NT-1] Order → cancelled should NOT create Shipment')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Cancel', price: 99.99, quantity: 1 }],
                subtotal: 99.99,
                shipping: 10,
                total: 109.99
            }, testUser.id)

            await strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'cancelled' }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBe(0)
            console.log('✅ [NT-1] PASSED — no Shipment created for cancelled order')
        })

        it('[NT-2] should NOT create Shipment when order transitions to refunded', async () => {
            console.log('\n🎯 [NT-2] Order → refunded should NOT create Shipment')

            const order = await createTestOrder({
                orderStatus: 'processing' as const,
                items: [{ productId: 1, name: 'Reloj Refund', price: 199.99, quantity: 1 }],
                subtotal: 199.99,
                shipping: 10,
                total: 209.99
            }, testUser.id)

            await strapi.entityService.update('api::order.order', order.id, {
                data: { orderStatus: 'refunded' }
            })

            await new Promise(resolve => setTimeout(resolve, 500))

            const shipments = await strapi.entityService.findMany('api::shipment.shipment' as any, {
                filters: { order: { id: order.id } },
            })

            const shipmentList = Array.isArray(shipments) ? shipments : shipments ? [shipments] : []
            expect(shipmentList.length).toBe(0)
            console.log('✅ [NT-2] PASSED — no Shipment created for refunded order')
        })
    })
})
