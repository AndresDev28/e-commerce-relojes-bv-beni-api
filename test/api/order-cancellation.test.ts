import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  setupStrapi,
  cleanupStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'
import request from 'supertest'

describe('[REF-03] Order Cancellation Endpoint', () => {
  let strapi: any
  let testUser: any
  let otherUser: any
  let token: string
  let otherToken: string

  beforeAll(async () => {
    console.log('🧪 [REF-03] Setting up test environment...')
    strapi = await setupStrapi()
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
    token = strapi.plugins['users-permissions'].services.jwt.issue({ id: testUser.id })

    otherUser = await createTestUser({
      username: 'otheruser',
      email: 'otheruser@example.com',
      password: 'Test1234!'
    })
    otherToken = strapi.plugins['users-permissions'].services.jwt.issue({ id: otherUser.id })

    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'true'
  })

  afterEach(() => {
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'undefined'
  })

  it('should successfully request cancellation for a pending order', async () => {
    const order = await createTestOrder({
      orderStatus: 'pending',
      items: [{ productId: 1, name: 'Reloj', price: 100, quantity: 1 }],
      subtotal: 100,
      shipping: 10,
      total: 110
    }, testUser.id)

    const response = await request(strapi.server.httpServer)
      .post(`/api/orders/${order.documentId}/request-cancellation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Found a better price' })

    expect(response.status).toBe(200)
    expect(response.body.data.attributes.orderStatus).toBe('cancellation_requested')
    expect(response.body.data.attributes.cancellationReason).toBe('Found a better price')
    expect(response.body.data.attributes.cancellationDate).toBeDefined()
  })

  it('should reject cancellation without a reason', async () => {
    const order = await createTestOrder({
      orderStatus: 'pending',
      items: [{ productId: 1, name: 'Reloj', price: 100, quantity: 1 }],
      subtotal: 100,
      shipping: 10,
      total: 110
    }, testUser.id)

    const response = await request(strapi.server.httpServer)
      .post(`/api/orders/${order.documentId}/request-cancellation`)
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(response.status).toBe(400)
  })

  it('should reject cancellation for an order belonging to another user', async () => {
    const order = await createTestOrder({
      orderStatus: 'pending',
      items: [{ productId: 1, name: 'Reloj', price: 100, quantity: 1 }],
      subtotal: 100,
      shipping: 10,
      total: 110
    }, testUser.id)

    const response = await request(strapi.server.httpServer)
      .post(`/api/orders/${order.documentId}/request-cancellation`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ reason: 'Not my order' })

    expect(response.status).toBe(403)
  })

  it('should reject cancellation for a shipped order', async () => {
    const order = await createTestOrder({
      orderStatus: 'shipped',
      items: [{ productId: 1, name: 'Reloj', price: 100, quantity: 1 }],
      subtotal: 100,
      shipping: 10,
      total: 110
    }, testUser.id)

    const response = await request(strapi.server.httpServer)
      .post(`/api/orders/${order.documentId}/request-cancellation`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Too late' })

    expect(response.status).toBe(400)
  })
})
