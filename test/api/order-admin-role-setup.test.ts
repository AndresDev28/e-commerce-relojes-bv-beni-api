// test/api/order-admin-role-setup.test.ts
// [ORD-30] Fase 1: Test para verificar la creación del rol de administrador
// Este test valida que las funciones helper del rol administrator funcionen correctamente

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import {
  getStrapi,
  setupStrapi,
  cleanupStrapi,
  setupAdministratorRole,
  createTestUserWithRole,
  isAdministratorUser,
  assignOrderPermissionsToAdmin,
  resetDatabase
} from '../helpers/strapi-test-helpers'

describe('[ORD-30] Administrator Role Setup Tests', () => {
  beforeAll(async () => {
    await setupStrapi()
  })

  afterAll(async () => {
    await cleanupStrapi()
  })

  beforeEach(async () => {
    await resetDatabase()
    await setupAdministratorRole()
  })

  describe('setupAdministratorRole()', () => {
    it('should create administrator role with correct properties', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      expect(adminRole).toBeDefined()
      expect(adminRole.name).toBe('Administrator')
      expect(adminRole.type).toBe('administrator')
      expect(adminRole.description).toBe('Full administrative access to all resources')
    })

    it('should be idempotent (not create duplicate roles)', async () => {
      const strapi = getStrapi()

      await setupAdministratorRole()

      const roles = await strapi.query('plugin::users-permissions.role').findMany({
        where: { type: 'administrator' }
      })

      expect(roles.length).toBe(1)
    })
  })

  describe('assignOrderPermissionsToAdmin()', () => {
    it('should assign all Order API permissions to administrator role', async () => {
      const strapi = getStrapi()

      await assignOrderPermissionsToAdmin()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      expect(adminRole).toBeDefined()

      const permissions = await strapi.query('plugin::users-permissions.permission').findMany({
        where: { role: adminRole.id },
        populate: ['role']
      })

      const expectedActions = [
        'api::order.order.find',
        'api::order.order.findOne',
        'api::order.order.create',
        'api::order.order.update',
        'api::order.order.delete',
        'api::order.order.search',
      ]

      const permissionActions = permissions.map((p: any) => p.action)

      for (const action of expectedActions) {
        const permission = permissions.find((p: any) => p.action === action)
        expect(permission).toBeDefined()
        expect(permission.role.id).toBe(adminRole.id)
      }
    })
  })

  describe('createTestUserWithRole()', () => {
    it('should create user with administrator role', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'adminuser',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      expect(adminUser).toBeDefined()
      expect(adminUser.username).toBe('adminuser')
      expect(adminUser.email).toBe('admin@test.com')
      expect(adminUser.role.id).toBe(adminRole.id)
    })

    it('should create user with authenticated role when specified', async () => {
      const strapi = getStrapi()

      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      })

      const regularUser = await createTestUserWithRole({
        username: 'regularuser',
        email: 'regular@test.com',
        password: 'password123'
      }, authenticatedRole.id)

      expect(regularUser).toBeDefined()
      expect(regularUser.username).toBe('regularuser')
      expect(regularUser.role.id).toBe(authenticatedRole.id)
    })
  })

  describe('isAdministratorUser()', () => {
    it('should return true for administrator user', async () => {
      const strapi = getStrapi()

      const adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      })

      const adminUser = await createTestUserWithRole({
        username: 'admin',
        email: 'admin@test.com',
        password: 'password123'
      }, adminRole.id)

      const isAdmin = await isAdministratorUser(adminUser.id)

      expect(isAdmin).toBe(true)
    })

    it('should return false for authenticated user', async () => {
      const strapi = getStrapi()

      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      })

      const regularUser = await createTestUserWithRole({
        username: 'regular',
        email: 'regular@test.com',
        password: 'password123'
      }, authenticatedRole.id)

      const isAdmin = await isAdministratorUser(regularUser.id)

      expect(isAdmin).toBe(false)
    })

    it('should return false for non-existent user', async () => {
      const isAdmin = await isAdministratorUser(99999)

      expect(isAdmin).toBe(false)
    })
  })
})