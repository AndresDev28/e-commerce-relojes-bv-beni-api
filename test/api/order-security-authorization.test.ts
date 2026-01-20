// test/api/order-security-authorization.test.ts
// Tests críticos de seguridad: Cross-User Access Prevention (Horizontal Privilege Escalation)

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
  getStrapi,
  createTestUser,
  authenticateUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('Order API Security - Authorization (Cross-User Access Prevention)', () => {
  beforeEach(async () => {
    // Limpiar base de datos antes de cada test
    await resetDatabase()
  })

  describe('findOne() - Cross-User Access', () => {
    it('should prevent User A from accessing User B order via GET /api/orders/:id', async () => {
      const strapi = getStrapi()

      // 1. Crear dos usuarios
      const userA = await createTestUser({
        username: 'userA',
        email: 'userA@test.com',
        password: 'password123'
      })

      const userB = await createTestUser({
        username: 'userB',
        email: 'userB@test.com',
        password: 'password123'
      })

      // 2. User B crea una orden
      const orderB = await createTestOrder({
        items: [{ product: 'Product 1', quantity: 1, price: 100 }],
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, userB.documentId)

      // 3. User A intenta acceder a la orden de User B
      const authA = await authenticateUser('userA@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${orderB.documentId}`)
        .set('Authorization', `Bearer ${authA.jwt}`)
        .expect(404) // Debe retornar 404, no 403 (para no revelar existencia)

      // 4. Verificar que no se devuelven datos
      expect(response.body.data).toBeNull()
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(404)
    })

    it('should allow user to access their own orders via GET /api/orders/:id', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      // 2. Usuario crea su propia orden
      const order = await createTestOrder({
        items: [{ product: 'Product 1', quantity: 1, price: 100 }],
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, user.id)

      // 3. Usuario accede a su propia orden
      const auth = await authenticateUser('test@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${order.documentId}`)
        .set('Authorization', `Bearer ${auth.jwt}`)
        .expect(200)

      // 4. Verificar que se devuelven datos correctos
      expect(response.body.data).toBeDefined()
      expect(response.body.data.id).toBe(order.documentId)
      expect(response.body.data.attributes.total).toBe(110)
    })
  })

  describe('find() - Cross-User Isolation', () => {
    it('should return only user own orders when listing GET /api/orders', async () => {
      const strapi = getStrapi()

      // 1. Crear dos usuarios
      const userA = await createTestUser({
        username: 'userA',
        email: 'userA@test.com',
        password: 'password123'
      })

      const userB = await createTestUser({
        username: 'userB',
        email: 'userB@test.com',
        password: 'password123'
      })

      // 2. Cada usuario crea 2 órdenes
      const orderA1 = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, userA.id)

      const orderA2 = await createTestOrder({
        subtotal: 200,
        shipping: 10,
        total: 210,
        orderStatus: 'processing'
      }, userA.id)

      const orderB1 = await createTestOrder({
        subtotal: 300,
        shipping: 10,
        total: 310,
        orderStatus: 'shipped'
      }, userB.id)

      const orderB2 = await createTestOrder({
        subtotal: 400,
        shipping: 10,
        total: 410,
        orderStatus: 'delivered'
      }, userB.id)

      // 3. User A lista sus órdenes
      const authA = await authenticateUser('userA@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authA.jwt}`)
        .expect(200)

      // 4. Verificar que solo se devuelven las órdenes de User A
      expect(response.body.data).toBeDefined()
      expect(response.body.data).toHaveLength(2)

      const orderIds = response.body.data.map((order: any) => order.id)
      expect(orderIds).toContain(orderA1.documentId)
      expect(orderIds).toContain(orderA2.documentId)
      expect(orderIds).not.toContain(orderB1.documentId)
      expect(orderIds).not.toContain(orderB2.documentId)
    })

    it('should return empty array when user has no orders', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario sin órdenes
      const user = await createTestUser({
        username: 'userNoOrders',
        email: 'noorders@test.com',
        password: 'password123'
      })

      // 2. Usuario lista sus órdenes
      const auth = await authenticateUser('noorders@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${auth.jwt}`)
        .expect(200)

      // 3. Verificar que se devuelve array vacío
      expect(response.body.data).toBeDefined()
      expect(response.body.data).toHaveLength(0)
    })
  })

  describe('Information Disclosure Prevention', () => {
    it('should return 404 (not 403) when accessing non-existent order to prevent information disclosure', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      // 2. Usuario intenta acceder a orden que no existe
      const auth = await authenticateUser('test@test.com', 'password123')

      const fakeOrderId = 'nonexistent123'
      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${fakeOrderId}`)
        .set('Authorization', `Bearer ${auth.jwt}`)
        .expect(404)

      // 3. Verificar que el error no revela si la orden existe o no
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(404)
      // El mensaje no debería diferenciar entre "no tienes permiso" vs "no existe"
    })
  })
})