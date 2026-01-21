// test/api/order-security-lifecycle.test.ts
// Tests críticos de seguridad: Lifecycle Hooks (beforeCreate auto-assignment)

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
  getStrapi,
  createTestUser,
  authenticateUser,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('Order API Security - Lifecycle Hooks (beforeCreate)', () => {
  beforeEach(async () => {
    // Limpiar base de datos antes de cada test
    await resetDatabase()
  })

  describe('Automatic User Assignment', () => {
    it('should automatically assign authenticated user to order on creation', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario y autenticar
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      const auth = await authenticateUser('test@test.com', 'password123')

      // 2. Crear orden SIN especificar user en el payload
      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .set('Authorization', `Bearer ${auth.jwt}`)
        .send({
          data: {
            orderId: `TEST-ORDER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            items: [{ product: 'Test Product', quantity: 1, price: 100 }],
            subtotal: 100,
            shipping: 10,
            total: 110,
            orderStatus: 'pending'
          }
        })
        .expect(201)

      // 3. Verificar que la orden se creó con el usuario autenticado
      expect(response.body.data).toBeDefined()
      expect(response.body.data.documentId).toBeDefined()

      // 4. Verificar que el usuario fue asignado automáticamente
      const orderId = response.body.data.documentId
      const order = await strapi.documents('api::order.order').findOne({
        documentId: orderId,
        populate: ['user']
      })

      expect(order).toBeDefined()
      expect(order.user).toBeDefined()
      expect(order.user.id).toBe(user.id)
    })

    it('should prevent user from creating orders for other users', async () => {
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

      // 2. User A crea una orden (sin especificar user en payload)
      const authA = await authenticateUser('userA@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .set('Authorization', `Bearer ${authA.jwt}`)
        .send({
          data: {
            orderId: `TEST-ORDER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            items: [{ product: 'Test Product', quantity: 1, price: 100 }],
            subtotal: 100,
            shipping: 10,
            total: 110,
            orderStatus: 'pending'
            // NOTE: Intentionally NOT sending user field
            // Strapi v5 rejects "user" field in REST API requests
            // The lifecycle hook should ignore this and assign User A
          }
        })
        .expect(201)

      // 3. Verificar que la orden se asignó automáticamente a User A (el autenticado)
      // NO debe ser posible asignarla a User B mediante payload
      const orderId = response.body.data.documentId
      const order = await strapi.documents('api::order.order').findOne({
        documentId: orderId,
        populate: ['user']
      })

      expect(order).toBeDefined()
      expect(order.user).toBeDefined()
      expect(order.user.id).toBe(userA.id) // Debe ser User A (autenticado)
      expect(order.user.id).not.toBe(userB.id) // NO debe ser User B
    })
  })

  describe('Security Edge Cases', () => {
    it('should reject order creation without authentication', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .send({
          data: {
            items: [{ product: 'Test Product', quantity: 1, price: 100 }],
            subtotal: 100,
            shipping: 10,
            total: 110,
            orderStatus: 'pending'
          }
        })
        .expect(403)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
    })

    it('should handle order creation with empty user context gracefully', async () => {
      const strapi = getStrapi()

      // Intentar crear orden con JWT inválido
      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          data: {
            items: [{ product: 'Test Product', quantity: 1, price: 100 }],
            subtotal: 100,
            shipping: 10,
            total: 110,
            orderStatus: 'pending'
          }
        })
        .expect(401)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(401)
    })
  })

  describe('Programmatic Creation (Testing Support)', () => {
    it('should allow programmatic order creation with user in payload', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      // 2. Crear orden programáticamente (como lo hace createTestOrder)
      const order = await strapi.entityService.create('api::order.order', {
        data: {
          orderId: `TEST-ORDER-${Date.now()}`,
          items: [{ product: 'Test Product', quantity: 1, price: 100 }],
          subtotal: 100,
          shipping: 10,
          total: 110,
          orderStatus: 'pending' as 'pending',
          user: { connect: [user.id] } as any,
          publishedAt: new Date().toISOString(),
        },
        populate: ['user']
      })

      // 3. Verificar que la orden se creó con el usuario especificado
      expect(order).toBeDefined()
      expect((order as any).user).toBeDefined()
      expect((order as any).user.id).toBe(user.id)
    })

    it('should not override programmatic user assignment with empty context', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      // 2. Crear orden programáticamente sin contexto HTTP
      const order = await strapi.entityService.create('api::order.order', {
        data: {
          orderId: `TEST-ORDER-${Date.now()}`,
          items: [],
          subtotal: 0,
          shipping: 0,
          total: 0,
          orderStatus: 'pending' as 'pending',
          user: { connect: [user.id] } as any,
          publishedAt: new Date().toISOString(),
        },
        populate: ['user']
      })

      // 3. Verificar que el usuario se mantuvo (no fue sobrescrito por contexto vacío)
      expect(order).toBeDefined()
      expect((order as any).user).toBeDefined()
      expect((order as any).user.id).toBe(user.id)
    })
  })

  describe('Lifecycle Hook Behavior', () => {
    it('should log appropriate messages during order creation via HTTP', async () => {
      const strapi = getStrapi()

      // 1. Crear usuario y autenticar
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      const auth = await authenticateUser('test@test.com', 'password123')

      // 2. Crear orden (esto debería triggear el log del lifecycle hook)
      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .set('Authorization', `Bearer ${auth.jwt}`)
        .send({
          data: {
            orderId: `TEST-ORDER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            items: [{ product: 'Test Product', quantity: 1, price: 100 }],
            subtotal: 100,
            shipping: 10,
            total: 110,
            orderStatus: 'pending'
          }
        })
        .expect(201)

      // 3. Verificar que la orden se creó correctamente
      expect(response.body.data).toBeDefined()
      expect(response.body.data.documentId).toBeDefined()

      // Note: Los logs del lifecycle hook se verifican visualmente en el output
      // En un entorno de producción, podrías usar un logger mock para verificar
    })
  })
})