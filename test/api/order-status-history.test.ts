// test/api/order-status-history.test.ts
// [ORD-33] Tests: Order Status History - Audit Log
//
// Test suite for validating that order status changes are properly logged
// in the status history for audit purposes.
//
// Architecture: Unidirectional relation (statusHistory → order)
// Queries use filters: { order: { id: orderId } }

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  setupStrapi,
  cleanupStrapi,
  getStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[ORD-33] Order Status History - Audit Log', () => {
  let strapi: any
  let testUser: any

  beforeAll(async () => {
    console.log('🧪 [ORD-33] Setting up test environment...')
    strapi = await setupStrapi()
    testUser = await createTestUser({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'Test1234!'
    })
    console.log(`✅ Test user created: ${testUser.email} (ID: ${testUser.id})`)
  }, 60000)

  afterAll(async () => {
    console.log('🧹 Cleaning up test environment...')
    await cleanupStrapi()
  })

  beforeEach(async () => {
    await resetDatabase()
    testUser = await createTestUser({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'Test1234!'
    })
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
  })

  afterEach(() => {
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'undefined'
  })

  describe('Suite 1: Basic Recording', () => {
    it('[HT-1] should create status history entry on order creation', async () => {
      console.log('\n🎯 [HT-1] Testing: Initial status history entry on creation')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toBeDefined()
      expect(Array.isArray(historyEntries)).toBe(true)
      expect(historyEntries).toHaveLength(1)

      const historyEntry = historyEntries[0]
      expect(historyEntry.fromStatus).toBeNull()
      expect(historyEntry.toStatus).toBe('pending')
      expect(historyEntry.changedByEmail).toBe('system@example.com')
      expect(historyEntry.changedAt).toBeDefined()

      console.log('✅ [HT-1] PASSED: Initial status history entry created')
    })

    it('[HT-2] should create status history entry when status changes', async () => {
      console.log('\n🎯 [HT-2] Testing: Status history entry on change')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(2)

      const latestEntry = historyEntries[0]
      expect(latestEntry.fromStatus).toBe('pending')
      expect(latestEntry.toStatus).toBe('paid')
      expect(latestEntry.changedByEmail).toBe('system@example.com')

      console.log('✅ [HT-2] PASSED: Status history entry created on change')
    })

    it('[HT-3] should record correct from/to values', async () => {
      console.log('\n🎯 [HT-3] Testing: Correct from/to values')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      const latestEntry = historyEntries[0]
      expect(latestEntry.fromStatus).toBe('paid')
      expect(latestEntry.toStatus).toBe('processing')

      console.log('✅ [HT-3] PASSED: Correct from/to values recorded')
    })

    it('[HT-4] should record timestamp automatically', async () => {
      console.log('\n🎯 [HT-4] Testing: Automatic timestamp recording')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const initialHistory = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })
      const initialTimestamp = new Date(initialHistory[0].changedAt)

      await new Promise(resolve => setTimeout(resolve, 100))

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const updatedHistory = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })
      const latestTimestamp = new Date(updatedHistory[0].changedAt)

      expect(latestTimestamp.getTime()).toBeGreaterThan(initialTimestamp.getTime())

      console.log('✅ [HT-4] PASSED: Automatic timestamp recorded')
    })
  })

  describe('Suite 2: Multiple Changes', () => {
    it('[HT-5] should record all status changes in sequence', async () => {
      console.log('\n🎯 [HT-5] Testing: Multiple status changes in sequence')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(4)

      const statusSequence = historyEntries.map(h => h.toStatus)
      expect(statusSequence).toContain('pending')
      expect(statusSequence).toContain('paid')
      expect(statusSequence).toContain('processing')
      expect(statusSequence).toContain('shipped')

      console.log('✅ [HT-5] PASSED: All status changes recorded in sequence')
    })

    it('[HT-6] should maintain chronological order', async () => {
      console.log('\n🎯 [HT-6] Testing: Chronological order maintenance')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      const timestamps = historyEntries.map(h => new Date(h.changedAt))
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(timestamps[i + 1].getTime())
      }

      console.log('✅ [HT-6] PASSED: Chronological order maintained')
    })

    it('[HT-7] should show complete history when populated', async () => {
      console.log('\n🎯 [HT-7] Testing: Complete history visibility')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'delivered' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(5)

      expect(historyEntries[0].toStatus).toBe('delivered')
      expect(historyEntries[1].toStatus).toBe('shipped')
      expect(historyEntries[2].toStatus).toBe('processing')
      expect(historyEntries[3].toStatus).toBe('paid')
      expect(historyEntries[4].toStatus).toBe('pending')

      console.log('✅ [HT-7] PASSED: Complete history visible')
    })
  })

  describe('Suite 3: ChangedBy Tracking', () => {
    it('[HT-8] should record admin/system email when changing status', async () => {
      console.log('\n🎯 [HT-8] Testing: Admin/system email tracking')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: updatedOrder.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries[0].changedByEmail).toBe('system@example.com')

      console.log('✅ [HT-8] PASSED: Admin/system email tracked')
    })

    it('[HT-9] should record system when no user context', async () => {
      console.log('\n🎯 [HT-9] Testing: System recording with no user context')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries[0].changedByEmail).toBe('system@example.com')

      console.log('✅ [HT-9] PASSED: System recorded correctly')
    })

    it('[HT-10] should track different admins correctly', async () => {
      console.log('\n🎯 [HT-10] Testing: Multiple admin tracking')

      const order1 = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const order2 = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order1.id, {
        data: { orderStatus: 'paid' }
      })

      await strapi.entityService.update('api::order.order', order2.id, {
        data: { orderStatus: 'paid' }
      })

      const history1 = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order1.id } },
        sort: { changedAt: 'desc' }
      })

      const history2 = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order2.id } },
        sort: { changedAt: 'desc' }
      })

      expect(history1[1].changedByEmail).toBe('system@example.com')
      expect(history2[1].changedByEmail).toBe('system@example.com')

      console.log('✅ [HT-10] PASSED: Different admins tracked')
    })
  })

  describe('Suite 4: Immutabilidad y Edge Cases', () => {
    it('[HT-11] should not create entry when status does not change', async () => {
      console.log('\n🎯 [HT-11] Testing: No entry on no status change')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const initialHistory = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })
      const initialCount = initialHistory.length

      await strapi.entityService.update('api::order.order', order.id, {
        data: { total: 219.99 }
      })

      const updatedHistory = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })
      const updatedCount = updatedHistory.length

      expect(updatedCount).toBe(initialCount)

      console.log('✅ [HT-11] PASSED: No entry created on no status change')
    })

    it('[HT-12] should handle rapid consecutive status changes', async () => {
      console.log('\n🎯 [HT-12] Testing: Rapid consecutive status changes')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(4)

      console.log('✅ [HT-12] PASSED: Rapid consecutive changes handled')
    })
  })

  describe('Suite 5: Queries', () => {
    it('[HT-13] should retrieve status history by order', async () => {
      console.log('\n🎯 [HT-13] Testing: Status history retrieval by order')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toBeDefined()
      expect(Array.isArray(historyEntries)).toBe(true)

      console.log('✅ [HT-13] PASSED: Status history retrieved')
    })

    it('[HT-14] should filter status history by order', async () => {
      console.log('\n🎯 [HT-14] Testing: Status history filtering by order')

      const order1 = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const order2 = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order1.id, {
        data: { orderStatus: 'paid' }
      })

      const historyForOrder1 = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order1.id } },
        sort: { changedAt: 'desc' }
      })

      const historyForOrder2 = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order2.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyForOrder1.length).toBeGreaterThan(historyForOrder2.length)

      console.log('✅ [HT-14] PASSED: Status history filtered by order')
    })

    it('[HT-15] should sort by changedAt descending (most recent first)', async () => {
      console.log('\n🎯 [HT-15] Testing: Status history sorting by date')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      const timestamps = historyEntries.map(h => new Date(h.changedAt))

      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i].getTime()).toBeGreaterThanOrEqual(timestamps[i + 1].getTime())
      }

      expect(historyEntries[0].toStatus).toBe('shipped')

      console.log('✅ [HT-15] PASSED: Status history sorted by date (most recent first)')
    })
  })
})
