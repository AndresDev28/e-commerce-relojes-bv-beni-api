// test/api/order-status-transition-validation.test.ts
// [ORD-32] Tests: Validación de transiciones de estado
//
// Test suite para validar la lógica de transiciones de estado de pedidos

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  setupStrapi,
  cleanupStrapi,
  getStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[ORD-32] Order Status Transition Validation', () => {
  let strapi: any
  let testUser: any

  beforeAll(async () => {
    console.log('🧪 [ORD-32] Setting up test environment...')
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
    vi.clearAllMocks()
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('Valid Transitions - Normal Flow', () => {
    it('[VT-1] should allow transition from pending to paid', async () => {
      console.log('\n🎯 [VT-1] Testing: pending → paid')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      expect(order.orderStatus).toBe('pending')

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      expect(updatedOrder.orderStatus).toBe('paid')
      console.log('✅ [VT-1] PASSED: pending → paid allowed')
    })

    it('[VT-2] should allow transition from paid to processing', async () => {
      console.log('\n🎯 [VT-2] Testing: paid → processing')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      expect(order.orderStatus).toBe('paid')

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      expect(updatedOrder.orderStatus).toBe('processing')
      console.log('✅ [VT-2] PASSED: paid → processing allowed')
    })

    it('[VT-3] should allow transition from processing to shipped', async () => {
      console.log('\n🎯 [VT-3] Testing: processing → shipped')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      expect(order.orderStatus).toBe('processing')

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'shipped' }
      })

      expect(updatedOrder.orderStatus).toBe('shipped')
      console.log('✅ [VT-3] PASSED: processing → shipped allowed')
    })

    it('[VT-4] should allow transition from shipped to delivered', async () => {
      console.log('\n🎯 [VT-4] Testing: shipped → delivered')

      const order = await createTestOrder({
        orderStatus: 'shipped' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      expect(order.orderStatus).toBe('shipped')

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'delivered' }
      })

      expect(updatedOrder.orderStatus).toBe('delivered')
      console.log('✅ [VT-4] PASSED: shipped → delivered allowed')
    })
  })

  describe('Valid Transitions - Cancellation and Refund', () => {
    it('[VT-5] should allow transition from pending to cancelled', async () => {
      console.log('\n🎯 [VT-5] Testing: pending → cancelled')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancelled' }
      })

      expect(updatedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [VT-5] PASSED: pending → cancelled allowed')
    })

    it('[VT-6] should allow transition from paid to cancelled', async () => {
      console.log('\n🎯 [VT-6] Testing: paid → cancelled')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancelled' }
      })

      expect(updatedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [VT-6] PASSED: paid → cancelled allowed')
    })

    it('[VT-7] should allow transition from processing to cancelled', async () => {
      console.log('\n🎯 [VT-7] Testing: processing → cancelled')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancelled' }
      })

      expect(updatedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [VT-7] PASSED: processing → cancelled allowed')
    })

    it('[VT-8] should allow transition from shipped to cancelled', async () => {
      console.log('\n🎯 [VT-8] Testing: shipped → cancelled')

      const order = await createTestOrder({
        orderStatus: 'shipped' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancelled' }
      })

      expect(updatedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [VT-8] PASSED: shipped → cancelled allowed')
    })

    it('[VT-9] should allow transition from pending to refunded', async () => {
      console.log('\n🎯 [VT-9] Testing: pending → refunded')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'refunded' }
      })

      expect(updatedOrder.orderStatus).toBe('refunded')
      console.log('✅ [VT-9] PASSED: pending → refunded allowed')
    })

    it('[VT-10] should allow transition from paid to refunded', async () => {
      console.log('\n🎯 [VT-10] Testing: paid → refunded')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'refunded' }
      })

      expect(updatedOrder.orderStatus).toBe('refunded')
      console.log('✅ [VT-10] PASSED: paid → refunded allowed')
    })

    it('[VT-11] should allow transition from processing to refunded', async () => {
      console.log('\n🎯 [VT-11] Testing: processing → refunded')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'refunded' }
      })

      expect(updatedOrder.orderStatus).toBe('refunded')
      console.log('✅ [VT-11] PASSED: processing → refunded allowed')
    })

    it('[VT-12] should allow transition from shipped to refunded', async () => {
      console.log('\n🎯 [VT-12] Testing: shipped → refunded')

      const order = await createTestOrder({
        orderStatus: 'shipped' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'refunded' }
      })

      expect(updatedOrder.orderStatus).toBe('refunded')
      console.log('✅ [VT-12] PASSED: shipped → refunded allowed')
    })
  })

  describe('Valid Transitions - Cancellation Requests', () => {
    it('[VT-13] should allow transition from pending to cancellation_requested', async () => {
      console.log('\n🎯 [VT-13] Testing: pending → cancellation_requested')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancellation_requested' }
      })

      expect(updatedOrder.orderStatus).toBe('cancellation_requested')
      console.log('✅ [VT-13] PASSED')
    })

    it('[VT-14] should allow transition from paid to cancellation_requested', async () => {
      console.log('\n🎯 [VT-14] Testing: paid → cancellation_requested')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'cancellation_requested' }
      })

      expect(updatedOrder.orderStatus).toBe('cancellation_requested')
      console.log('✅ [VT-14] PASSED')
    })

    it('[VT-15] should allow transition from cancellation_requested to refunded', async () => {
      console.log('\n🎯 [VT-15] Testing: cancellation_requested → refunded')

      const order = await createTestOrder({
        orderStatus: 'cancellation_requested' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'refunded' }
      })

      expect(updatedOrder.orderStatus).toBe('refunded')
      console.log('✅ [VT-15] PASSED')
    })

    it('[VT-16] should allow transition from cancellation_requested to processing (reject cancellation)', async () => {
      console.log('\n🎯 [VT-16] Testing: cancellation_requested → processing')

      const order = await createTestOrder({
        orderStatus: 'cancellation_requested' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      expect(updatedOrder.orderStatus).toBe('processing')
      console.log('✅ [VT-16] PASSED')
    })
  })

  describe('Invalid Transitions - Backward Transitions', () => {
    it('[IT-1] should reject transition from delivered to shipped (backward)', async () => {
      console.log('\n🎯 [IT-1] Testing: delivered → shipped (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'delivered' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      // delivered only allows transition to processing, so shipped is rejected
      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'shipped' }
        })
      ).rejects.toThrow('Invalid status transition from "delivered" to "shipped"')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('delivered')
      console.log('✅ [IT-1] PASSED: delivered → shipped rejected')
    })

    it('[IT-2] should reject transition from processing to pending (backward)', async () => {
      console.log('\n🎯 [IT-2] Testing: processing → pending (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'pending' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('processing')
      console.log('✅ [IT-2] PASSED: processing → pending rejected')
    })

    it('[IT-3] should reject transition from paid to pending (backward)', async () => {
      console.log('\n🎯 [IT-3] Testing: paid → pending (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'pending' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('paid')
      console.log('✅ [IT-3] PASSED: paid → pending rejected')
    })
  })

  describe('Invalid Transitions - Skipping States', () => {
    it('[IT-4] should reject transition from pending to shipped (skip states)', async () => {
      console.log('\n🎯 [IT-4] Testing: pending → shipped (INVALID - skip)')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'shipped' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('pending')
      console.log('✅ [IT-4] PASSED: pending → shipped rejected')
    })

    it('[IT-5] should reject transition from paid to shipped (skip processing)', async () => {
      console.log('\n🎯 [IT-5] Testing: paid → shipped (INVALID - skip)')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'shipped' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('paid')
      console.log('✅ [IT-5] PASSED: paid → shipped rejected')
    })

    it('[IT-6] should reject transition from processing to delivered (skip shipped)', async () => {
      console.log('\n🎯 [IT-6] Testing: processing → delivered (INVALID - skip)')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'delivered' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('processing')
      console.log('✅ [IT-6] PASSED: processing → delivered rejected')
    })
  })

  describe('Invalid Transitions - From Terminal States', () => {
    it('[IT-7] should reject any transition from cancelled', async () => {
      console.log('\n🎯 [IT-7] Testing: cancelled → processing (INVALID - terminal)')

      const order = await createTestOrder({
        orderStatus: 'cancelled' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'processing' }
        })
      ).rejects.toThrow('Cannot change status from "cancelled" to "processing". State "cancelled" is terminal.')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [IT-7] PASSED: cancelled → processing rejected')
    })

    it('[IT-8] should reject any transition from refunded', async () => {
      console.log('\n🎯 [IT-8] Testing: refunded → paid (INVALID - terminal)')

      const order = await createTestOrder({
        orderStatus: 'refunded' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'paid' }
        })
      ).rejects.toThrow('Cannot change status from "refunded" to "paid". State "refunded" is terminal.')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('refunded')
      console.log('✅ [IT-8] PASSED: refunded → paid rejected')
    })

    it('[IT-9] should allow transition from delivered to processing (revert for failed shipment)', async () => {
      console.log('\n🎯 [IT-9] Testing: delivered → processing (ALLOWED - SHIP-03 revert)')

      const order = await createTestOrder({
        orderStatus: 'delivered' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      // delivered → processing is ALLOWED per VALID_TRANSITIONS (SHIP-03: revert if shipment fails)
      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'processing' }
      })

      expect(updatedOrder.orderStatus).toBe('processing')

      console.log('✅ [IT-9] PASSED: delivered → processing allowed (shipment revert)')
    })

    it('[IT-9b] should reject transition from delivered to pending (backward)', async () => {
      console.log('\n🎯 [IT-9b] Testing: delivered → pending (INVALID - backward)')

      const order = await createTestOrder({
        orderStatus: 'delivered' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      // delivered only allows transition to processing
      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'pending' }
        })
      ).rejects.toThrow('Invalid status transition from "delivered" to "pending"')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('delivered')
      console.log('✅ [IT-9b] PASSED: delivered → pending rejected')
    })
  })

  describe('Invalid Transitions - Invalid Cancellation/Refund Transitions', () => {
    it('[IT-10] should reject transition from cancelled to paid', async () => {
      console.log('\n🎯 [IT-10] Testing: cancelled → paid (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'cancelled' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'paid' }
        })
      ).rejects.toThrow('Cannot change status from "cancelled" to "paid". State "cancelled" is terminal.')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('cancelled')
      console.log('✅ [IT-10] PASSED: cancelled → paid rejected')
    })

    it('[IT-11] should reject transition from refunded to cancelled', async () => {
      console.log('\n🎯 [IT-11] Testing: refunded → cancelled (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'refunded' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'cancelled' }
        })
      ).rejects.toThrow('Cannot change status from "refunded" to "cancelled". State "refunded" is terminal.')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('refunded')
      console.log('✅ [IT-11] PASSED: refunded → cancelled rejected')
    })

    it('[IT-12] should reject transition from shipped to cancellation_requested', async () => {
      console.log('\n🎯 [IT-12] Testing: shipped → cancellation_requested (INVALID)')

      const order = await createTestOrder({
        orderStatus: 'shipped' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await expect(
        strapi.entityService.update('api::order.order', order.id, {
          data: { orderStatus: 'cancellation_requested' }
        })
      ).rejects.toThrow('Invalid status transition')

      const unchangedOrder = await strapi.entityService.findOne('api::order.order', order.id, {
        fields: ['orderStatus']
      })

      expect(unchangedOrder.orderStatus).toBe('shipped')
      console.log('✅ [IT-12] PASSED')
    })
  })

  describe('Edge Cases', () => {
    it('[EC-1] should allow updating order without changing status', async () => {
      console.log('\n🎯 [EC-1] Testing: Update order without status change')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          total: 219.99,
          shipping: 20
        }
      })

      expect(updatedOrder.orderStatus).toBe('pending')
      expect(parseFloat(updatedOrder.total)).toBe(219.99)
      console.log('✅ [EC-1] PASSED: Update without status change allowed')
    })

    it('[EC-2] should allow setting status to same value (no-op)', async () => {
      console.log('\n🎯 [EC-2] Testing: Set status to same value')

      const order = await createTestOrder({
        orderStatus: 'paid' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: { orderStatus: 'paid' }
      })

      expect(updatedOrder.orderStatus).toBe('paid')
      console.log('✅ [EC-2] PASSED: Same status allowed')
    })
  })
})
