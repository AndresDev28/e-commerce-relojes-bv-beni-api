// test/api/order-admin-access.test.ts
// [ORD-30] Tests: Admin puede ver todos los pedidos
//
// Tests de integración para validar que los administradores pueden acceder
// a TODOS los pedidos de TODOS los usuarios sin restricciones.

import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import {
  getStrapi,
  setupAdministratorRole,
  createTestUser,
  createTestUserWithRole,
  createTestOrder,
  authenticateUser,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[ORD-30] Administrator Access to All Orders', () => {
  beforeEach(async () => {
    await resetDatabase()
    await setupAdministratorRole()
  })

  describe('GET /api/orders (find) - Administrator sees ALL orders', () => {
    it('should return ALL orders from ALL users when administrator calls find()', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const userA = await createTestUserWithRole({
        username: 'userA',
        email: 'userA@test.com',
        password: 'password123'
      }, authenticatedRole.id)

      const userB = await createTestUserWithRole({
        username: 'userB',
        email: 'userB@test.com',
        password: 'password123'
      }, authenticatedRole.id)

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

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(response.body.data).toHaveLength(4)

      const orderIds = response.body.data.map((order: any) => order.id)
      expect(orderIds).toContain(orderA1.documentId)
      expect(orderIds).toContain(orderA2.documentId)
      expect(orderIds).toContain(orderB1.documentId)
      expect(orderIds).toContain(orderB2.documentId)
    })

    it('should include orders from different users with correct user information', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const userA = await createTestUser({
        username: 'userA',
        email: 'userA@test.com',
        password: 'password123'
      })

      const order = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, userA.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(response.body.data).toHaveLength(1)
      expect(response.body.data[0].id).toBe(order.documentId)
      expect(response.body.data[0].attributes.user).toBeDefined()
    })

    it('should return orders sorted by createdAt desc (newest first) for administrator', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const user = await createTestUser({
        username: 'user',
        email: 'user@test.com',
        password: 'password123'
      })

      const order1 = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, user.id)

      await new Promise(resolve => setTimeout(resolve, 10))

      const order2 = await createTestOrder({
        subtotal: 200,
        shipping: 10,
        total: 210,
        orderStatus: 'processing'
      }, user.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(response.body.data).toHaveLength(2)
      expect(response.body.data[0].id).toBe(order2.documentId)
      expect(response.body.data[1].id).toBe(order1.documentId)
    })
  })

  describe('GET /api/orders/:id (findOne) - Administrator can access ANY order', () => {
    it('should allow administrator to access order from any user', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const regularUser = await createTestUser({
        username: 'user',
        email: 'user@test.com',
        password: 'password123'
      })

      const order = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, regularUser.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${order.documentId}`)
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(response.body.data.id).toBe(order.documentId)
      expect(response.body.data.attributes.total).toBe(110)
    })

    it('should return complete order details including user information for administrator', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const regularUser = await createTestUser({
        username: 'user',
        email: 'user@test.com',
        password: 'password123'
      })

      const order = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'paid'
      }, regularUser.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${order.documentId}`)
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(response.body.data.attributes).toBeDefined()
      expect(response.body.data.attributes.user).toBeDefined()
      expect(response.body.data.attributes.user.id).toBe(regularUser.id)
      expect(response.body.data.attributes.orderStatus).toBe('paid')
    })

    it('should allow administrator to access multiple orders from different users', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

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

      const orderA = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, userA.id)

      const orderB = await createTestOrder({
        subtotal: 200,
        shipping: 10,
        total: 210,
        orderStatus: 'shipped'
      }, userB.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')

      const responseA = await request(strapi.server.httpServer)
        .get(`/api/orders/${orderA.documentId}`)
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      const responseB = await request(strapi.server.httpServer)
        .get(`/api/orders/${orderB.documentId}`)
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(responseA.body.data.id).toBe(orderA.documentId)
      expect(responseB.body.data.id).toBe(orderB.documentId)
    })
  })

  describe('Security - Regular users cannot access administrator orders', () => {
    it('should prevent regular user from accessing administrator orders via findOne', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const regularUser = await createTestUser({
        username: 'user',
        email: 'user@test.com',
        password: 'password123'
      })

      const adminOrder = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, adminUser.id)

      const authRegular = await authenticateUser('user@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get(`/api/orders/${adminOrder.documentId}`)
        .set('Authorization', `Bearer ${authRegular.jwt}`)
        .expect(404)

      expect(response.body.data).toBeNull()
      expect(response.body.error).toBeDefined()
      expect(response.body.error.status).toBe(404)
    })

    it('should prevent regular user from seeing administrator orders in find list', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const regularUser = await createTestUser({
        username: 'user',
        email: 'user@test.com',
        password: 'password123'
      })

      const adminOrder1 = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, adminUser.id)

      const adminOrder2 = await createTestOrder({
        subtotal: 200,
        shipping: 10,
        total: 210,
        orderStatus: 'processing'
      }, adminUser.id)

      const userOrder = await createTestOrder({
        subtotal: 300,
        shipping: 10,
        total: 310,
        orderStatus: 'shipped'
      }, regularUser.id)

      const authRegular = await authenticateUser('user@test.com', 'password123')

      const response = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authRegular.jwt}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(response.body.data).toHaveLength(1)

      const orderIds = response.body.data.map((order: any) => order.id)
      expect(orderIds).toContain(userOrder.documentId)
      expect(orderIds).not.toContain(adminOrder1.documentId)
      expect(orderIds).not.toContain(adminOrder2.documentId)
    })

    it('should only bypass filtering for administrator role (not authenticated)', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const authenticatedUser = await createTestUserWithRole({
        username: 'authUser',
        email: 'authuser@test.com',
        password: 'password123'
      }, authenticatedRole.id)

      const otherUser = await createTestUserWithRole({
        username: 'otherUser',
        email: 'otheruser@test.com',
        password: 'password123'
      }, authenticatedRole.id)

      const otherUserOrder = await createTestOrder({
        subtotal: 100,
        shipping: 10,
        total: 110,
        orderStatus: 'pending'
      }, otherUser.id)

      const authAdmin = await authenticateUser('admin@test.com', 'password123')
      const authAuthUser = await authenticateUser('authuser@test.com', 'password123')

      const adminResponse = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authAdmin.jwt}`)
        .expect(200)

      expect(adminResponse.body.data).toHaveLength(1)
      expect(adminResponse.body.data[0].id).toBe(otherUserOrder.documentId)

      const authUserResponse = await request(strapi.server.httpServer)
        .get('/api/orders')
        .set('Authorization', `Bearer ${authAuthUser.jwt}`)
        .expect(200)

      expect(authUserResponse.body.data).toHaveLength(0)
    })
  })
})
