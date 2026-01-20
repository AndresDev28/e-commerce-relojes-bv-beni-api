// test/infrastructure/basic-setup.test.ts
import { describe, it, expect } from 'vitest'
import { getStrapi, createTestUser, authenticateUser } from '../helpers/strapi-test-helpers'

describe('Basic Infrastructure', () => {
  it('should initialize Strapi successfully', () => {
    const strapi = getStrapi()
    expect(strapi).toBeDefined()
    expect(strapi.config).toBeDefined()
  })
  it('should create and authenticate user', async () => {
    const user = await createTestUser({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123'
    })
    
    expect(user).toBeDefined()
    expect(user.email).toBe('test@example.com')
    
    const auth = await authenticateUser('test@example.com', 'password123')
    expect(auth.jwt).toBeDefined()
    expect(auth.user.id).toBe(user.id)
  })
})