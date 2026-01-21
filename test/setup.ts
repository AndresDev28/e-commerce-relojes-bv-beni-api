import type { Core } from '@strapi/strapi'
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { setupStrapi, cleanupStrapi, resetDatabase } from './helpers/strapi-test-helpers'

// ======== GLOBAL SETUP ========
beforeAll(async () => {
  console.log('🚀 Setting up Strapi test environment...')
  await setupStrapi()
  console.log('✅ Strapi test environment ready')
}, 60000) // 60 second timeout for Strapi initialization
// ======== GLOBAL CLEANUP ========
afterAll(async () => {
  console.log('🧹 Cleaning up Strapi test environment...')
  await cleanupStrapi()
  console.log('✅ Strapi test environment cleaned up')
}, 30000) // 30 second timeout for cleanup

// ======== PER-TEST CLEANUP ========
beforeEach(async () => {
  // Preparar estado limpio para cada test
  // Opcional: dependiendo del rendimiento necesario
})
afterEach(async () => {
  // Limpiar después de cada test
  await resetDatabase()
})

// ======== GLOBAL UTILITIES ========
// Hacer Strapi accesible globalmente para todos los tests
declare global {
  var strapi: Core.Strapi
}