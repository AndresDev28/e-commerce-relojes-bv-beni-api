// test/api/order-email-webhook.test.ts
// [ORD-24] Tests: Emails se envían al cambiar estado
//
// Test suite para validar que el lifecycle hook de Order
// dispara webhooks correctamente cuando orderStatus cambia

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import {
  setupStrapi,
  cleanupStrapi,
  getStrapi,
  createTestUser,
  createTestOrder,
  resetDatabase
} from '../helpers/strapi-test-helpers'

/**
 * CONCEPTOS CLAVE DE ESTE TEST:
 *
 * 1. Integration Test: Testea el flujo completo desde update hasta webhook
 * 2. Mocking: Reemplazamos fetch() para no llamar al frontend real
 * 3. Lifecycle Hook: Validamos que afterUpdate se ejecuta correctamente
 * 4. State Management: Validamos que beforeUpdate guarda el estado anterior
 */

describe('[ORD-24] Order Email Webhook - Lifecycle Integration', () => {
  let strapi: any
  let testUser: any

  // ========================================
  // SETUP: Ejecuta UNA VEZ antes de todos los tests
  // ========================================
  beforeAll(async () => {
    console.log('🧪 [BT-1] Setting up test environment...')

    // 1. Inicializar Strapi con BD en memoria
    strapi = await setupStrapi()

    // 2. Crear usuario de prueba (necesario para orders)
    testUser = await createTestUser({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'Test1234!'
    })

    console.log(`✅ Test user created: ${testUser.email} (ID: ${testUser.id})`)
  }, 60000) // Timeout de 60s porque Strapi tarda en inicializar

  // ========================================
  // CLEANUP: Ejecuta UNA VEZ después de todos los tests
  // ========================================
  afterAll(async () => {
    console.log('🧹 Cleaning up test environment...')
    await cleanupStrapi()
  })

  // ========================================
  // BEFORE EACH: Ejecuta ANTES de cada test individual
  // ========================================
  beforeEach(async () => {
    // Limpiar la base de datos entre tests (previene interferencia)
    await resetDatabase()

    // Recrear el usuario después del reset
    testUser = await createTestUser({
      username: 'testuser',
      email: 'testuser@example.com',
      password: 'Test1234!'
    })

    // Limpiar mocks de Vitest (importante!)
    vi.clearAllMocks()

    // Setup de variables de entorno necesarias para el lifecycle hook
    process.env.FRONTEND_URL = 'http://localhost:3000'
    process.env.WEBHOOK_SECRET = 'test-webhook-secret-123'
    process.env.DISABLE_EMAIL_NOTIFICATIONS = 'false' // Permitir emails en este test
  })

  // ========================================
  // AFTER EACH: Ejecuta DESPUÉS de cada test individual
  // ========================================
  afterEach(() => {
    // Restaurar todos los mocks globales
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // ========================================
  // BT-1: HAPPY PATH TEST
  // El test más importante de toda la suite
  // ========================================
  it('[BT-1] should trigger webhook when orderStatus changes from paid to shipped', async () => {
    console.log('\n🎯 [BT-1] Starting happy path test...')

    // ==========================================
    // ARRANGE: Preparar el escenario de prueba
    // ==========================================

    /**
     * Mock de fetch global
     *
     * ¿Por qué vi.fn()?
     * - vi.fn() crea una "spy function" que registra cómo fue llamada
     * - Podemos verificar: ¿cuántas veces? ¿con qué argumentos?
     *
     * ¿Por qué mockResolvedValue()?
     * - fetch() retorna una Promise
     * - mockResolvedValue simula una respuesta exitosa
     * - El lifecycle hook espera response.ok y response.json()
     */
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Email sent' })
    })

    /**
     * vi.stubGlobal() reemplaza fetch GLOBALMENTE
     *
     * ¿Por qué no vi.mock('node:fetch')?
     * - En Node.js 18+, fetch es global (no es un módulo)
     * - stubGlobal es la forma correcta de mockear globals
     *
     * IMPORTANTE: Siempre limpiar con vi.unstubAllGlobals() en afterEach
     */
    vi.stubGlobal('fetch', mockFetch)

    console.log('✅ Mock fetch configured')

    /**
     * Crear orden inicial con estado 'paid'
     *
     * ¿Por qué empezar en 'paid'?
     * - En producción, las órdenes pasan de pending → paid (después de Stripe)
     * - Luego el admin cambia paid → shipped
     * - Este es el flujo real que queremos testear
     */
    const initialOrder = await createTestOrder(
      {
        items: [
          {
            productId: 1,
            name: 'Reloj Test',
            price: 199.99,
            quantity: 1
          }
        ],
        subtotal: 199.99,
        shipping: 10.00,
        total: 209.99,
        orderStatus: 'paid' // Estado inicial
      },
      testUser.id
    )

    console.log(`✅ Order created: ${initialOrder.orderId} (Status: ${initialOrder.orderStatus})`)

    // Verificar que el order se creó correctamente
    expect(initialOrder).toBeDefined()
    expect(initialOrder.orderStatus).toBe('paid')
    // Note: No verificamos .user aquí porque createTestOrder ya lo valida internamente
    // El lifecycle hook hará su propio populate cuando envíe el webhook

    // ==========================================
    // ACT: Ejecutar la acción que queremos testear
    // ==========================================

    /**
     * Actualizar el estado de la orden
     *
     * Este update dispara:
     * 1. beforeUpdate hook → guarda previousOrderStatus
     * 2. Strapi actualiza la BD
     * 3. afterUpdate hook → detecta cambio y llama webhook
     *
     * entityService.update es la forma correcta de actualizar en Strapi v5
     */
    console.log('🔄 Updating order status to "shipped"...')

    const updatedOrder = await strapi.entityService.update(
      'api::order.order',
      initialOrder.id,
      {
        data: {
          orderStatus: 'shipped'
        }
      }
    )

    console.log(`✅ Order updated: ${updatedOrder.orderId} (New Status: ${updatedOrder.orderStatus})`)

    /**
     * IMPORTANTE: Pequeño delay para que el lifecycle hook termine
     *
     * ¿Por qué?
     * - afterUpdate es async pero Strapi no espera a que termine
     * - El lifecycle hook puede ejecutarse "en background"
     * - 100ms es suficiente para que fetch se llame
     *
     * En producción esto no es problema porque no esperamos la respuesta
     */
    await new Promise(resolve => setTimeout(resolve, 100))

    // ==========================================
    // ASSERT: Verificar que todo funcionó como esperábamos
    // ==========================================

    console.log('🔍 Verifying webhook was called...')

    /**
     * Assertion 1: Verificar que fetch fue llamado UNA vez
     *
     * ¿Por qué toHaveBeenCalledTimes(1)?
     * - Si es 0: el lifecycle hook no se disparó (BUG!)
     * - Si es 2+: se está llamando múltiples veces (BUG!)
     * - Debe ser exactamente 1
     */
    expect(mockFetch).toHaveBeenCalledTimes(1)
    console.log('✅ Fetch called exactly once')

    /**
     * Assertion 2: Verificar la URL del webhook
     *
     * mock.calls[0] = primera llamada
     * mock.calls[0][0] = primer argumento (la URL)
     */
    const callUrl = mockFetch.mock.calls[0][0]
    expect(callUrl).toBe('http://localhost:3000/api/send-order-email')
    console.log(`✅ Webhook URL correct: ${callUrl}`)

    /**
     * Assertion 3: Verificar las opciones del fetch (método, headers, body)
     *
     * mock.calls[0][1] = segundo argumento (options)
     */
    const callOptions = mockFetch.mock.calls[0][1]

    // Verificar método HTTP
    expect(callOptions.method).toBe('POST')

    // Verificar headers
    expect(callOptions.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Webhook-Secret': 'test-webhook-secret-123'
    })
    console.log('✅ Headers correct')

    /**
     * Assertion 4: Verificar el payload enviado
     *
     * El body viene como string JSON, necesitamos parsearlo
     */
    const sentPayload = JSON.parse(callOptions.body)

    // Verificar campos críticos del payload
    expect(sentPayload).toMatchObject({
      orderId: initialOrder.orderId,
      customerEmail: testUser.email,
      customerName: testUser.username,
      orderStatus: 'shipped', // El NUEVO estado
      orderData: expect.objectContaining({
        items: expect.any(Array),
        subtotal: expect.any(Number),
        shipping: expect.any(Number),
        total: expect.any(Number)
      })
    })

    console.log('✅ Payload structure correct')
    console.log('📧 Payload:', JSON.stringify(sentPayload, null, 2))

    /**
     * Assertion 5: Verificar valores específicos del orderData
     */
    expect(sentPayload.orderData.subtotal).toBe(199.99)
    expect(sentPayload.orderData.shipping).toBe(10.00)
    expect(sentPayload.orderData.total).toBe(209.99)
    expect(sentPayload.orderData.items).toHaveLength(1)
    expect(sentPayload.orderData.items[0].name).toBe('Reloj Test')

    console.log('✅ [BT-1] Happy path test PASSED! 🎉\n')
  })

  // ========================================
  // TEST PLACEHOLDER: Próximos tests
  // ========================================

  /**
   * Los siguientes tests (BT-2, BT-3, etc.) seguirán el mismo patrón AAA:
   * - BT-2: Test con DISABLE_EMAIL_NOTIFICATIONS=true
   * - BT-3: Test de estructura de payload
   * - BT-4: Test de todos los estados con it.each
   * - BT-5: Test de no-change no dispara webhook
   *
   * Los agregaremos en la siguiente iteración
   */

  // ========================================
  // BT-2: DISABLE NOTIFICATIONS TEST
  // Validar que el flag de entorno detiene el proceso
  // ========================================
  it('[BT-2] should NOT trigger webhook when DISABLE_EMAIL_NOTIFICATION is true', async () => {
    console.log('\n🚫 [BT-2] Starting disable notifications test...')

    // ==========================================
    // ARRANGE: Preparar el escenario de prueba
    // ==========================================

    // 1. Forzar la desactivación mediante variable de entorno
    process.env.DISABLE_EMAIL_NOTIFICATIONS= 'true'

    // 2. Mock de fetch (igual que BT-1)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Email sent' })
    })
    vi.stubGlobal('fetch', mockFetch)

    // 3. Crear orden inicial en 'paid'
    const initialOrder = await createTestOrder(
      {
        items: [{ productId: 1, name: 'Reloj Test', price: 100, quantity: 1 }],
        subtotal: 100,
        shipping: 5,
        total: 105,
        orderStatus: 'paid'
      },
      testUser.id
    )

    console.log(`✅ Initial order created (Status: ${initialOrder.orderStatus})`)

    // ==========================================
    // ACT: Ejecutar el cambio que normalmente dispararía el webhook
    // ==========================================

    console.log('🔄 Updating order status to "shipped" with notifications disabled...')

    const updatedOrder = await strapi.entityService.update(
      'api::order.order',
      initialOrder.id,
      {
        data: {
          orderStatus: 'shipped'
        }
      }
    )

    // Esperar un poco igual que en BT-1 por si acaso intentara dispararse
    await new Promise(resolve => setTimeout(resolve, 100))

    // ==========================================
    // ASSERT: Verificar que NO se llamó al fetch
    // ==========================================

    console.log('🔍 Verifying webhook was NOT called...')

    /**
     * Assertion: Verificar que fetch NO fue llamado
     * Si toHaveBeenCalledTimes es > 0, significa que el condicional
     * en el lifecycle hook de Strapi está fallando.
     */
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledTimes(0)

    console.log('✅ [BT-2] Disable notifications test PASSED! 🛡️\n')
  })

  // ========================================
  // BT-3: NO-CHANGE TEST
  // Validar que si el estado no cambia, no se dispara el webhook
  // ========================================

  it('[BT-3] should NOT trigger webhook when order id updated but orderStatus remains the same', async () => {
    console.log('\n😴 [BT-3] Starting no-change test...')

    // ARRANGE

    // 1. Mock de fetch (Aseguramos que no se use)
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    // 2. Crear orden inicial de test
    const initialOrder = await createTestOrder(
      {
        items: [{ productId: 1, name: 'Reloj Test', price: 100, quantity: 1 }],
        subtotal: 100,
        shipping: 5,
        total: 105,
        orderStatus: 'paid'
      },
      testUser.id
    )
    console.log(`✅ Order created: ${initialOrder.orderId}. Status: ${initialOrder.orderStatus}`)

    // ACT: Actualizar la orden pero sin cambiar el status
    // Ejemplo: El shipping es gratuito porque el precio es mayor que 50
  
    console.log('🔄 Updating order field "shipping and total" (keeping status "paid")...')
  
    await strapi.entityService.update(
      'api::order.order',
      initialOrder.id,
      {
        data: {
          //orderStatus: 'paid', // No cambia 
          shipping: 0, // Envío gratuito
          total: 100
        }
      }
    )

    // Delay para procesos async
    await new Promise(resolve => setTimeout(resolve, 100))

    // ASSERT: Verificar que webhook fue ignorado

    console.log('🔍 Verifying webhook was NOT called...')

    /**
     * Assertion:
     * El lifecycle hook debe comparar 'previousStatus' vs 'currentStatus'.
     * Como ambos son 'paid', no debería llamar a fetch.
     */
    expect(mockFetch).not.toHaveBeenCalled()

    console.log('✅ [BT-3] No-change test PASSED! (No spam sent) 🤫\n')
  })

  // ========================================
  // BT-4: ALL STATES TEST
  // Validar que el webhook se dispara para cada cambio de estado válido
  // ========================================

  const statusTransitions = [
    { from: 'pending', to: 'paid' },
    { from: 'paid', to: 'processing' },
    { from: 'processing', to: 'shipped' },
    { from: 'shipped', to: 'delivered' },
    { from: 'paid', to: 'cancelled' },
    { from: 'pending', to: 'cancelled' },
    { from: 'paid', to: 'refunded' }
  ] as const // TS reconozca los Literals y no simples strings

  it.each(statusTransitions)(
    '[BT-4] should trigger webhook when status changes from $from to $to',
    async ({from, to}) => {
      console.log(`\n🔄 [BT-4] Testing transition: ${from} -> ${to}`)

      // 1. Mock de fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({success: true})
      })
      vi.stubGlobal('fetch', mockFetch)

      // 2. Crear orden con el estado inicial ("from")
      const initialOrder = await createTestOrder(
        {
          items: [{ productId: 99, name: 'Multi-status Product', price: 50, quantity: 1 }],
          subtotal: 50,
          shipping: 0,
          total: 50,
          orderStatus: from
        },
        testUser.id
      )

      // 3. Act: Cambiar al estado objetivo ("to")
      await strapi.entityService.update(
        'api::order.order',
        initialOrder.id,
        {
          data: { orderStatus: to }
        }
      )

      // Espera para el hook async
      await new Promise(resolve => setTimeout(resolve, 100))

      // 4. Assert
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const sentPayload = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(sentPayload.orderStatus).toBe(to)
      
      console.log(`✅ Webhook verified for status: ${to}`)
    }
  )

  // ========================================
  // BT-5: ERROR HANDLING TEST
  // Validar que un fallo en el webhook no rompe el flujo de Strapi
  // ========================================
  it('[BT-5] should log an error but NOT crash the update if webhook returns 500', async () => {
      console.log('\n🔥 [BT-5] Starting error handling test...')

      // ARRANGE: Simular un servidor de destino caído

      // Mock de fetch devolviendo un error de servidor
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })
      vi.stubGlobal('fetch', mockFetch)

      // Espiamos console.error para verificar que el desarrollador sea notificado
      const strapiLogSpy = vi.spyOn(strapi.log, 'error').mockImplementation(() => {})

      const initialOrder = await createTestOrder(
        {
          items: [{ productId: 1, name: 'Resilient product', price: 10, quantity: 1 }],
          subtotal: 10,
          shipping: 0,
          total: 10,
          orderStatus: 'paid'
        },
        testUser.id
      )

      // ACT: Intentar actualizar el estado

      console.log('🔄 Attempting update while webhook is failing...')

      // Ejecutamos la actualización
      const updatePromise = strapi.entityService.update(
        'api::order.order',
        initialOrder.id,
        {
          data: { orderStatus: 'shipped' }
        }
      )

      // ASSERT: La orden debe guardarse a pesar del error

      // 1. Verificamos que la promesa se resuelve exitosamente (No hubo throw/crash)
      await expect(updatePromise).resolves.toBeDefined()

      const updatedOrder = await updatePromise
      expect(updatedOrder.orderStatus).toBe('shipped')
      console.log('✅ Order status was updated in DB successfully')

      // 2. Verificamos que se intentó llamar al fetch (aunque falló)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // 3. Verificamos que se logueó el error para que el admin sepa qué pasó
      expect(strapiLogSpy).toHaveBeenCalled()
      console.log('✅ Error was logged to console correctly')

      console.log('✅ [BT-5] Resilience test PASSED! 🛡️\n')
    }
  )
})
