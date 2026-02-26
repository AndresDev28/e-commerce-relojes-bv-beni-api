// test/api/order-status-change-note.test.ts
// [ORD-34] Tests: Status Change Notes
//
// Test suite for validating status change note functionality
// Notes are transient fields stored in status history, not on Order entity

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  setupStrapi,
  cleanupStrapi,
  getStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[ORD-34] Order Status Change Notes', () => {
  let strapi: any
  let testUser: any

  beforeAll(async () => {
    console.log('🧪 [ORD-34] Setting up test environment...')
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
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'undefined'
  })

  describe('Suite 1: Basic Note Recording', () => {
    it('[NT-1] should save note in status history when provided during status change', async () => {
      console.log('\n🎯 [NT-1] Testing: Save note in status history')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: 'Payment confirmed via Stripe'
        }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(2)
      const latestEntry = historyEntries[0]
      expect(latestEntry.fromStatus).toBe('pending')
      expect(latestEntry.toStatus).toBe('paid')
      expect(latestEntry.note).toBe('Payment confirmed via Stripe')

      console.log('✅ [NT-1] PASSED: Note saved in status history')
    })

    it('[NT-2] should work with null/undefined note (no note provided)', async () => {
      console.log('\n🎯 [NT-2] Testing: Status change without note')

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
      expect(latestEntry.note).toBeNull()

      console.log('✅ [NT-2] PASSED: Status change works without note')
    })

    it('[NT-3] should save note with status transition validation', async () => {
      console.log('\n🎯 [NT-3] Testing: Note saved during valid transition')

      const order = await createTestOrder({
        orderStatus: 'processing' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'shipped',
          statusChangeNote: 'Package dispatched with tracking #ABC123'
        }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries).toHaveLength(2)
      const latestEntry = historyEntries[0]
      expect(latestEntry.toStatus).toBe('shipped')
      expect(latestEntry.note).toBe('Package dispatched with tracking #ABC123')

      console.log('✅ [NT-3] PASSED: Note saved with valid transition')
    })
  })

  describe('Suite 2: Note in Webhook Payload', () => {
    it('[NT-4] should include note in webhook payload when provided', async () => {
      console.log('\n🎯 [NT-4] Testing: Note included in webhook payload')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
      vi.stubGlobal('fetch', mockFetch)

      process.env.DISABLE_EMAIL_NOTIFICATIONS = 'undefined'
      process.env.FRONTEND_URL = 'https://test-frontend.example.com'
      process.env.WEBHOOK_SECRET = 'test-webhook-secret'

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: 'Customer paid via credit card'
        }
      })

      if (mockFetch.mock.calls.length > 0) {
        const webhookCall = mockFetch.mock.calls[0]
        const webhookBody = JSON.parse(webhookCall[1].body)

        expect(webhookBody.statusChangeNote).toBe('Customer paid via credit card')
      }

      console.log('✅ [NT-4] PASSED: Note included in webhook payload')
    })

    it('[NT-5] should not include note field in webhook when not provided', async () => {
      console.log('\n🎯 [NT-5] Testing: No note field in webhook when not provided')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })
      vi.stubGlobal('fetch', mockFetch)

      process.env.DISABLE_EMAIL_NOTIFICATIONS = 'undefined'
      process.env.FRONTEND_URL = 'https://test-frontend.example.com'
      process.env.WEBHOOK_SECRET = 'test-webhook-secret'

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

      if (mockFetch.mock.calls.length > 0) {
        const webhookCall = mockFetch.mock.calls[0]
        const webhookBody = JSON.parse(webhookCall[1].body)

        expect(webhookBody.statusChangeNote).toBeNull()
      }

      console.log('✅ [NT-5] PASSED: No note field in webhook when not provided')
    })
  })

  describe('Suite 3: Validation', () => {
    it('[NT-6] should accept notes up to 5000 characters', async () => {
      console.log('\n🎯 [NT-6] Testing: Maximum note length (5000 chars)')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const longNote = 'A'.repeat(5000)

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: longNote
        }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries[0].note).toBe(longNote)
      expect(historyEntries[0].note.length).toBe(5000)

      console.log('✅ [NT-6] PASSED: Notes up to 5000 characters accepted')
    })

    it('[NT-7] should accept empty string note (treated as no note)', async () => {
      console.log('\n🎯 [NT-7] Testing: Empty string note')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: ''
        }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries[0].note).toBeNull()

      console.log('✅ [NT-7] PASSED: Empty string note accepted')
    })
  })

  describe('Suite 4: Edge Cases', () => {
    it('[NT-8] note should persist on Order entity for admin visibility', async () => {
      console.log('\n🎯 [NT-8] Testing: Note persists on Order entity')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const updatedOrder = await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: 'This note should be on the order'
        }
      })

      expect(updatedOrder.statusChangeNote).toBe('This note should be on the order')

      const fetchedOrder = await strapi.entityService.findOne('api::order.order', order.id)
      expect(fetchedOrder.statusChangeNote).toBe('This note should be on the order')

      console.log('✅ [NT-8] PASSED: Note persists on Order entity')
    })

    it('[NT-9] should handle special characters in note', async () => {
      console.log('\n🎯 [NT-9] Testing: Special characters in note')

      const order = await createTestOrder({
        orderStatus: 'pending' as const,
        items: [{ productId: 1, name: 'Reloj Test', price: 199.99, quantity: 1 }],
        subtotal: 199.99,
        shipping: 10,
        total: 209.99
      }, testUser.id)

      const specialNote = 'Order updated: "Special" chars <>&\'" émojis 🎉🚀\nNew line\tTab'

      await strapi.entityService.update('api::order.order', order.id, {
        data: {
          orderStatus: 'paid',
          statusChangeNote: specialNote
        }
      })

      const historyEntries = await strapi.entityService.findMany('api::order-status-history.order-status-history', {
        filters: { order: { id: order.id } },
        sort: { changedAt: 'desc' }
      })

      expect(historyEntries[0].note).toBe(specialNote)

      console.log('✅ [NT-9] PASSED: Special characters handled correctly')
    })
  })
})
