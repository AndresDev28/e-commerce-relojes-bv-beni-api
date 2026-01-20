// ======== IMPORTACIONES Y TIPOS ========
import type { Core } from "@strapi/strapi"
import { createStrapi } from "@strapi/strapi"

// ======== TYPESCRIPT CONFIG PATCH ========
// Este parche permite a Strapi cargar archivos de configuración TypeScript
try {
  require('ts-node/register/transpile-only');
} catch (err) {
  try {
    require('@strapi/typescript-utils/register');
  } catch (strapiRegisterError) {
    // Fallback for older versions or missing dependencies
  }
}

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Aplicar parches para soporte de TypeScript en archivos de configuración
try {
  const strapiCoreRoot = path.dirname(require.resolve('@strapi/core/package.json'));
  const loadConfigFilePath = path.join(strapiCoreRoot, 'dist', 'utils', 'load-config-file.js');
  const loadConfigFileModule = require(loadConfigFilePath);

  if (!loadConfigFileModule.loadConfigFile.__tsRuntimePatched) {
    const strapiUtils = require('@strapi/utils');
    const originalLoadConfigFile = loadConfigFileModule.loadConfigFile;

    const loadTypeScriptConfig = (file) => {
      const source = fs.readFileSync(file, 'utf8');
      const options = {
        module: ts.ModuleKind.CommonJS,
      };
      const output = ts.transpileModule(source, {
        compilerOptions: options,
        fileName: file,
        reportDiagnostics: false,
      });

      const moduleInstance = new Module(file);
      moduleInstance.filename = file;
      moduleInstance.paths = Module._nodeModulePaths(path.dirname(file));
      moduleInstance._compile(output.outputText, file);
      const exported = moduleInstance.exports;
      const resolved = exported && exported.__esModule ? exported.default : exported;

      if (typeof resolved === 'function') {
        return resolved({ env: strapiUtils.env });
      }
      return resolved;
    };

    const patchedLoadConfigFile = (file) => {
      const extension = path.extname(file).toLowerCase();
      if (extension === '.ts' || extension === '.cts' || extension === '.mts') {
        return loadTypeScriptConfig(file);
      }
      return originalLoadConfigFile(file);
    };

    patchedLoadConfigFile.__tsRuntimePatched = true;
    loadConfigFileModule.loadConfigFile = patchedLoadConfigFile;
    require.cache[loadConfigFilePath].exports = loadConfigFileModule;
  }
} catch (error) {
  console.warn('⚠️ Could not apply TypeScript config patch:', error.message);
}

// ======== CONFIGURACIÓN DE ENTORNO ========
const TEST_ENV_VARS = {
  NODE_ENV: 'test',
  APP_KEYS: 'testKey1,testKey2,testKey3,testKey4',
  JWT_SECRET: 'test-jwt-secret',
  API_TOKEN_SALT: 'test-api-token-salt',
  ADMIN_JWT_SECRET: 'test-admin-jwt-secret',
  TRANSFER_TOKEN_SALT: 'test-transfer-token-salt',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
  DATABASE_CLIENT: 'sqlite',
  DATABASE_FILENAME: ':memory:',
  STRAPI_DISABLE_CRON: 'true',
  DISABLE_EMAIL_NOTIFICATIONS: 'true',
  HOST: '127.0.0.1',
  PORT: '1338', // Puerto diferente para testing
}

// ======== STRAPI INSTANCE MANAGEMENT ========
let strapiInstance: Core.Strapi | null = null

/**
 * [ORD-26] Configure permissions for testing
 * Sets up necessary permissions for the 'authenticated' role
 */
async function setupTestPermissions(strapi: Core.Strapi) {
  try {
    console.log('🔒 Configuring test permissions...')

    // Get the authenticated role
    const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
      where: { type: 'authenticated' }
    })

    if (!authenticatedRole) {
      console.warn('[ORD-26] Authenticated role not found')
      return
    }

    // Define permissions for Order content type
    const orderPermissions = [
      'api::order.order.find',
      'api::order.order.findOne',
      'api::order.order.create',
    ]

    // Check and create permissions
    for (const action of orderPermissions) {
      const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
        where: {
          action,
          role: authenticatedRole.id
        }
      })

      if (existingPermission) {
        // Update to enabled if not already
        if (!existingPermission.enabled) {
          await strapi.query('plugin::users-permissions.permission').update({
            where: { id: existingPermission.id },
            data: { enabled: true }
          })
        }
      } else {
        // Create new permission
        await strapi.query('plugin::users-permissions.permission').create({
          data: {
            action,
            role: authenticatedRole.id,
            enabled: true
          }
        })
      }
    }

    console.log('✅ Test permissions configured successfully')
  } catch (error) {
    console.error('[ORD-26] Error configuring test permissions:', error)
    throw error
  }
}

export async function setupStrapi() {
  // 1. Setear variables de entorno para testing
  Object.entries(TEST_ENV_VARS).forEach(([key, value]) => {
    process.env[key] = value
  })

  // 2. Crear instancia Strapi con configuración específica
  if (!strapiInstance) {
    console.log('🔧 Creating Strapi instance...')

    try {
      // 3. Inicializar base de datos SQLite en memoria
      // Use compiled files from dist/ instead of src/
      const strapi = await createStrapi({
        distDir: './dist'
      })
      console.log('📦 Loading Strapi...')
      await strapi.load()

      console.log('🚀 Starting Strapi server...')
      await strapi.start()

      // 4. Esperar que Strapi esté completamente inicializado
      // 5. Guardar instancia en global scope
      strapiInstance = strapi
      global.strapi = strapi

      // 6. Configurar permisos para testing [ORD-26]
      await setupTestPermissions(strapi)

      // 7. Debug: Verificar que el controller y las rutas están registrados
      try {
        const orderController = strapi.controller('api::order.order')
        console.log('🔍 Order controller loaded:', !!orderController)
        if (orderController) {
          console.log('🔍 Controller methods:', Object.keys(orderController))
        }

        // Verificar rutas registradas
        const routes = strapi.server?.router?.stack || []
        const orderRoutes = routes.filter((r: any) => r.path?.includes('/api/orders'))
        console.log('🔍 Order routes found:', orderRoutes.length)
      } catch (error) {
        console.warn('⚠️ Could not verify controller/routes:', error.message)
      }

      console.log('✅ Strapi initialized successfully')
      console.log(`🌐 Server running on http://${TEST_ENV_VARS.HOST}:${TEST_ENV_VARS.PORT}`)

    } catch (error) {
      console.error('❌ Failed to initialize Strapi:', error)
      throw error
    }
  }

  return strapiInstance
}

export async function cleanupStrapi() {
  // 1. Destruir instancia Strapi si existe
  if (strapiInstance) {
    console.log('🧹 Cleaning up Strapi instance...')

    try {
      // Cerrar servidor HTTP (wrap in Promise for proper async handling)
      if (strapiInstance.server?.httpServer) {
        await new Promise<void>((resolve, reject) => {
          const server = strapiInstance!.server!.httpServer
          if (server.listening) {
            server.close((err) => {
              if (err) reject(err)
              else resolve()
            })
          } else {
            resolve()
          }
        })
      }

      // Destruir conexión a base de datos
      if (strapiInstance.db?.connection) {
        await strapiInstance.db.connection.destroy()
      }

      // Destruir instancia de Strapi
      if (typeof strapiInstance.destroy === 'function') {
        await strapiInstance.destroy()
      }

      // Give time for all resources to be released
      await new Promise(resolve => setTimeout(resolve, 100))

    } catch (error) {
      console.error('⚠️ Error during cleanup:', error)
    } finally {
      strapiInstance = null
      global.strapi = null
    }
  }

  // 2. Limpiar variables de entorno
  Object.keys(TEST_ENV_VARS).forEach(key => {
    delete process.env[key]
  })

  // 3. Resetear global scope
  console.log('✅ Strapi cleanup completed')
}

export function getStrapi(): Core.Strapi {
  if (!strapiInstance) {
    throw new Error('Strapi not initialized. Call setupStrapi() first.')
  }
  return strapiInstance
}

// ======== USER MANAGEMENT ========
export async function createTestUser(userData: {
  username: string
  email: string
  password: string
  role?: 'authenticated'
}) {
  const strapi = getStrapi()

  try {
    // Get default role authenticated if not specified
    const defaultRole = await strapi.query('plugin::users-permissions.role').findOne({
      where: { type: userData.role || 'authenticated' }
    })

    // Create user using user-permissions service
    const user = await strapi.plugin('users-permissions').service('user').add({
      username: userData.username,
      email: userData.email,
      password: userData.password,
      provider: 'local',
      confirmed: true, // Auto-confirm for testing
      blocked: false,
      role: defaultRole?.id || null
    })

    return user
  } catch (error) {
    throw new Error(`Failed to create test user: ${error.message}`)
  }
}

export async function authenticateUser(identifier: string, password: string) {
  const strapi = getStrapi()

  try {
    // Find user by email or username
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: {
        $or: [
          { email: identifier },
          { username: identifier }
        ]
      }
    })

    if (!user) {
      throw new Error(`User not found: ${identifier}`)
    }

    // For testing, we skip password verification
    // In production, you would verify password here

    // Generate JWT token for authenticated user
    const jwt = strapi.plugin('users-permissions').service('jwt').issue({
      id: user.id
    })

    return {
      user: user,
      jwt: jwt
    }
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`)
  }
}
export function getAuthHeaders(jwt: string) {
  return {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json'
  }
}

// ======== TEST DATA FACTORIES ========
export async function createTestCategory(data?: {
  name?: string
  slug?: string
  description?: string
}) {
  const strapi = getStrapi()

  try {
    const category = await strapi.entityService.create('api::category.category', {
      data: {
        name: data?.name || 'Test Category',
        slug: data?.slug || 'test-category',
        description: data?.description || 'A test category',
        publishedAt: new Date().toISOString(),
      }
    })

    return category
  } catch (error) {
    throw new Error(`Failed to create test category: ${error.message}`)
  }
}

export async function createTestProduct(data?: {
  name?: string
  price?: number
  description?: any // BlocksValue type from Strapi
  stock?: number
  categoryId?: number | string
}) {
  const strapi = getStrapi()

  try {
    // 1. Verificar/crear categoría si no se proporciona
    let categoryId: number | string | undefined = data?.categoryId
    if (!categoryId) {
      const category = await createTestCategory()
      categoryId = category.id
    }

    // 2. Crear producto con datos de prueba
    const product = await strapi.entityService.create('api::product.product', {
      data: {
        name: data?.name || 'Test Product',
        price: data?.price || 99.99,
        description: data?.description || [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'A test product description' }]
          }
        ],
        stock: data?.stock || 10,
        category: categoryId,
        slug: `test-product-${Date.now()}`,
        publishedAt: new Date().toISOString(),
      }
    })

    // 3. Retornar producto creado
    return product
  } catch (error) {
    throw new Error(`Failed to create test product: ${error.message}`)
  }
}

export async function createTestOrder(data?: {
  items?: any[]
  subtotal?: number
  shipping?: number
  total?: number
  orderStatus?: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
}, userId?: number | string) {
  const strapi = getStrapi()

  try {
    // 1. Validar que userId existe
    if (!userId) {
      throw new Error('userId is required for creating test order')
    }

    // 2. Crear orden con entityService
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderId: `TEST-ORDER-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        items: data?.items || [],
        subtotal: data?.subtotal || 99.99,
        shipping: data?.shipping || 10.00,
        total: data?.total || 109.99,
        orderStatus: (data?.orderStatus || 'pending') as 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded',
        user: { connect: [userId] } as any, // 3. Conectar usuario (sintaxis Strapi v5)
        publishedAt: new Date().toISOString(),
      },
      populate: ['user'], // 4. Popular relación user para validación
    })

    // 4. Retornar orden creada
    return order
  } catch (error) {
    throw new Error(`Failed to create test order: ${error.message}`)
  }
}

// ======== CLEANUP UTILITIES ========
export async function cleanupUsers() {
  const strapi = getStrapi()

  try {
    // 1. Eliminar todos los usuarios creados en tests
    // (excepto los roles del sistema que no se deben eliminar)
    const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
      filters: {
        $or: [
          { email: { $contains: '@example.com' } },
          { email: { $contains: '@test.com' } },
          { email: { $contains: 'test' } },
        ]
      }
    })

    for (const user of users) {
      await strapi.entityService.delete('plugin::users-permissions.user', user.id)
    }

    console.log(`🗑️ Cleaned up ${users.length} test users`)
  } catch (error) {
    console.error('Error cleaning up users:', error)
  }
}

export async function cleanupContent() {
  const strapi = getStrapi()

  try {
    // 1. Eliminar productos, categorías, órdenes de prueba
    const orders = await strapi.entityService.findMany('api::order.order')
    const products = await strapi.entityService.findMany('api::product.product')
    const categories = await strapi.entityService.findMany('api::category.category')

    // Eliminar en orden correcto (dependencias primero)
    for (const order of orders) {
      await strapi.entityService.delete('api::order.order', order.id)
    }

    for (const product of products) {
      await strapi.entityService.delete('api::product.product', product.id)
    }

    for (const category of categories) {
      await strapi.entityService.delete('api::category.category', category.id)
    }

    console.log(`🗑️ Cleaned up ${orders.length} orders, ${products.length} products, ${categories.length} categories`)
  } catch (error) {
    console.error('Error cleaning up content:', error)
  }
}

export async function resetDatabase() {
  // 1. Ejecutar cleanup completo
  await cleanupContent()
  await cleanupUsers()

  // 2. Recrear estructura básica necesaria
  // Strapi ya crea la estructura básica automáticamente al inicializar
  console.log('🔄 Database reset completed')
}
