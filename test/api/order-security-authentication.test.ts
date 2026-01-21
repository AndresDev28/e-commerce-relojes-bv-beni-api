// test/api/order-security-authentication.test.ts
// Tests críticos de seguridad: Authentication (JWT Required)

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
  getStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('Order API Security - Authentication (JWT Required)', () => {
  beforeEach(async () => {
    // Limpiar base de datos antes de cada test
    await resetDatabase()
  })

  describe('GET /api/orders - Authentication Required', () => {
    it('should return 403 when accessing without JWT token', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .expect(403)

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
      expect(response.body.error.name).toBe('ForbiddenError')
    })

    it('should return 401 when accessing with invalid JWT token', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401)

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(401)
      expect(response.body.error.name).toBe('UnauthorizedError')
    })

    it('should return 403 when accessing with malformed Authorization header', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', 'InvalidFormat token123')
        .expect(403)

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
    })
  })

  describe('GET /api/orders/:id - Authentication Required', () => {
    it('should return 403 when accessing order without JWT token', async () => {
      const strapi = getStrapi()

      // Crear usuario y orden de prueba
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      const order = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, user.id)

      // Intentar acceder sin JWT
      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${order.documentId}`)
        .expect(403)

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
      expect(response.body.error.name).toBe('ForbiddenError')
    })

    it('should return 401 when accessing order with invalid JWT token', async () => {
      const strapi = getStrapi()

      // Crear usuario y orden de prueba
      const user = await createTestUser({
        username: 'testuser',
        email: 'test@test.com',
        password: 'password123'
      })

      const order = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, user.id)

      // Intentar acceder con JWT inválido
      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${order.documentId}`)
        .set('Authorization', 'Bearer invalid-token-67890')
        .expect(401)

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(401)
      expect(response.body.error.name).toBe('UnauthorizedError')
    })
  })

  describe('POST /api/orders - Authentication Required', () => {
    it('should return 403 when creating order without JWT token', async () => {
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

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
      expect(response.body.error.name).toBe('ForbiddenError')
    })

    it('should return 401 when creating order with invalid JWT token', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .post('/api/orders')
        .set('Authorization', 'Bearer invalid-token-99999')
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

      // Verificar estructura de error
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(401)
      expect(response.body.error.name).toBe('UnauthorizedError')
    })
  })

  describe('Authorization Header Formats', () => {
    it('should return 403 when Authorization header is missing Bearer prefix', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', 'some-token-without-bearer')
        .expect(403)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
    })

    it('should return 403 when Authorization header is empty', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', '')
        .expect(403)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
    })

    it('should return 403 when Authorization header has only Bearer without token', async () => {
      const strapi = getStrapi()

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', 'Bearer ')
        .expect(403)

      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(403)
    })
  })
})