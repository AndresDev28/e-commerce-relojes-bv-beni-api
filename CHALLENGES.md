# Registro de Desafíos de Despliegue

Este documento registra los obstáculos encontrados durante el proyecto y sus soluciones.

---

## Desafío #1: Desplegando Strapi en Render

**Objetivo:** Desplegar con éxito el backend de Strapi en Render, conectándolo a una base de datos PostgreSQL.

### Obstáculo 1: `Cannot find module 'pg'`

Tras el intento de despliegue inicial, la compilación (build) fue exitosa, pero la aplicación no pudo arrancar. Los logs mostraban el siguiente error:

```
Error: Cannot find module 'pg
```

-   **Análisis:** La aplicación, configurada para usar PostgreSQL, requiere el paquete `pg` de Node.js para actuar como controlador de la base de datos. Aunque podría haber sido instalado localmente, no se guardó como una dependencia del proyecto en `package.json`. Por lo tanto, el comando `npm install` de Render no lo instaló.
-   **Solución:** Añadir `pg` como una dependencia del proyecto.
    ```bash
    npm install pg
    ```
    Este comando actualiza `package.json` y `package-lock.json`, que luego se suben al repositorio.
---

### Obstáculo 2: `self-signed certificate`

Después de solucionar el primer problema, apareció un nuevo error durante la fase de inicio de la aplicación:

```
error: self-signed certificate
```

-   **Analisis:** Las bases de datos de PostgreSQL de Render utilizan certificados SSL autofirmados para conexiones seguras. Por defecto, el controlador `pg` rechaza estas conexiones porque el certificado no es emitido por una Autoridad de Certificación (CA) de confianza. La aplicación necesita ser instruida explícitamente para permitir este tipo de conexión.
-   **Solución:** Modificar el archivo principal de configuración de la base de datos (`config/database.js`) para manejar el entorno de producción de manera diferente. La lógica verifica si `NODE_ENV` está configurado como `production` y, si es así, añade la opción `ssl: { rejectUnauthorized: false }` a la configuración de la conexión.

    ```javascript
    // In /config/database.js
    
    if (env('NODE_ENV') === 'production') {
      const config = parse(env("DATABASE_URL"));
      return {
        connection: {
          client: 'postgres',
          connection: {
            // ... other settings
            ssl: {
              rejectUnauthorized: false,
            },
          },
          debug: false,
        },
      };
    }
    ```
    **Nota:** Esto también requirió asegurarse de que la variable de entorno `NODE_ENV=production` estuviera correctamente configurada en el servicio de Render.

---

### Obstáculo 3: `Missing jwtSecret`

Con la conexión a la base de datos resuelta, surgió un último error de inicio, esta vez relacionado con la seguridad:

```
error: Missing jwtSecret. Please, set configuration variable "jwtSecret" for the users-permissions plugin...
```

-   **Analisis:** Por motivos de seguridad, Strapi requiere una clave secreta única y persistente para firmar los JSON Web Tokens (JWT) en un entorno de producción. Esto no puede dejarse con el valor por defecto de desarrollo.
-   **Solución:**
    1.  **Generar un Valor Secreto:** Crear una cadena aleatoria criptográficamente fuerte.
        ```bash
        node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
        ```
    2.  **Configurar la Variable de Entorno:** Añadir una nueva variable de entorno en Render llamada `JWT_SECRET` con la cadena generada como su valor.
    3.  **Configurar Strapi:** Crear un nuevo archivo `config/plugins.js` para indicar al `plugin users-permissions` dónde encontrar el valor secreto.



        ```javascript
        // In /config/plugins.js
        
        module.exports = ({ env }) => ({
          "users-permissions": {
            config: {
              jwtSecret: env("JWT_SECRET"),
            },
          },
        });
        ```

### Resultado Final

Después de abordar estos tres problemas distintos—una dependencia faltante, una configuración de SSL y un requisito de seguridad—la aplicación se desplegó y se inició exitosamente en Render.

---

## Desafío #2: Migración de Base de Datos a Docker (Desarrollo Local)

**Objetivo:** Implementar Docker como gestor de base de datos PostgreSQL en el entorno de desarrollo local tras la finalización del período de prueba gratuito de Render.

### Contexto

Después del período de prueba de Render, se necesitaba una solución de base de datos para el desarrollo local que:
- Mantuviera la paridad con el entorno de producción (PostgreSQL)
- Fuera fácil de configurar y reproducible
- No dependiera de servicios externos de pago para desarrollo

### Solución Implementada

Se implementó Docker Compose para gestionar un contenedor de PostgreSQL local con las siguientes características:

#### 1. Configuración de Docker Compose

Se creó el archivo `docker-compose.yml` con:
- **Imagen:** PostgreSQL 15 Alpine (versión ligera)
- **Persistencia:** Volumen local para los datos
- **Health Check:** Verificación automática del estado de la base de datos
- **Reinicio:** Configurado para reiniciar automáticamente

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: relojes-bv-beni-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: relojes_bv_beni_db
      POSTGRES_USER: strapi
      POSTGRES_PASSWORD: "EO2D1TetxtvxRAaYOXyABjMELAPO1gjgZ3Em"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

#### 2. Actualización de Configuración de Base de Datos

Se modificó `config/database.ts` para cambiar de SQLite a PostgreSQL en desarrollo:

**Antes:**
```typescript
// Configuración SQLite para desarrollo
connection: {
  client: 'sqlite',
  connection: {
    filename: path.join(__dirname, '../..', env('DATABASE_FILENAME', '.tmp/data.db')),
  },
  useNullAsDefault: true,
}
```

**Después:**
```typescript
// Configuración PostgreSQL para desarrollo con Docker
connection: {
  client: env('DATABASE_CLIENT', 'postgres'),
  connection: {
    host: env('DATABASE_HOST', '127.0.0.1'),
    port: env.int('DATABASE_PORT', 5432),
    database: env('DATABASE_NAME', 'relojes_bv_beni_db'),
    user: env('DATABASE_USERNAME', 'strapi'),
    password: env('DATABASE_PASSWORD'),
    ssl: env.bool('DATABASE_SSL', false),
  },
  debug: false,
}
```

#### 3. Actualización de Configuración del Servidor

Se modificó `config/server.ts` para comportarse diferente en desarrollo vs producción:

```typescript
// Usa URL y proxy solo en producción
url: env("NODE_ENV") === "production"
  ? env("URL", "https://e-commerce-relojes-bv-beni-api.onrender.com")
  : env("URL", ""),
proxy: env("NODE_ENV") === "production",
```

#### 4. Configuración de Upload Condicional

Se actualizó `config/plugins.ts` para usar almacenamiento local en desarrollo y Cloudinary en producción:

```typescript
upload: {
  config: env("CLOUDINARY_NAME")
    ? {
        // Producción: Cloudinary
        provider: "cloudinary",
        providerOptions: { /* ... */ },
      }
    : {
        // Desarrollo: Local
        provider: "local",
        providerOptions: {
          sizeLimit: 10000000, // 10MB
        },
      },
}
```

### Comandos Útiles

```bash
# Iniciar base de datos
docker-compose up -d

# Ver logs
docker-compose logs -f postgres

# Detener base de datos
docker-compose down

# Detener y eliminar volúmenes (¡cuidado, borra datos!)
docker-compose down -v
```

### Beneficios

1. **Paridad de Entornos:** Desarrollo local con PostgreSQL igual que producción
2. **Portabilidad:** Cualquier desarrollador puede levantar el entorno con un solo comando
3. **Aislamiento:** La base de datos está completamente contenida y no interfiere con el sistema
4. **Persistencia:** Los datos se mantienen entre reinicios del contenedor
5. **Costo Cero:** Solución gratuita para desarrollo local

### Resultado Final

El entorno de desarrollo ahora usa PostgreSQL mediante Docker, manteniendo compatibilidad total con producción mientras mantiene la simplicidad en el desarrollo local.

---

## Desafío #3: Sistema de Notificaciones por Email con Lifecycle Hooks (EPIC-15 ORD-22)

**Objetivo:** Implementar un sistema automático de notificaciones por email que se dispare cuando el estado de una orden cambia en Strapi, integrándose con el sistema de emails del frontend (Next.js + Resend).

### Contexto del Proyecto

Este desafío es parte del EPIC-15 (Order Management System) y se construye sobre la infraestructura existente:
- **[ORD-20]** Sistema de emails con Resend configurado en Next.js
- **[ORD-21]** Templates React Email implementados
- **[ORD-22]** Lifecycle hooks en Strapi (este desafío)

### Arquitectura Propuesta

```
Admin actualiza estado de orden en Strapi
    ↓
Lifecycle Hook: afterUpdate detecta cambio
    ↓
Obtiene email del usuario (populate relation)
    ↓
Construye payload completo
    ↓
HTTP POST → Next.js /api/send-order-email
    ↓ (Header: X-Webhook-Secret)
Next.js valida secret → Genera template → Resend
    ↓
📧 Email enviado al cliente
```

### Implementación

#### 1. Configuración de Variables de Entorno

**Archivo:** `.env`

```bash
# Email Webhook Configuration (ORD-22)
FRONTEND_URL=http://localhost:3000
WEBHOOK_SECRET=<secret-generado-con-openssl-rand-base64-32>
```

**Sincronización crítica:** El `WEBHOOK_SECRET` debe ser idéntico en ambos proyectos (Strapi y Next.js) para la autenticación del webhook.

#### 2. Lifecycle Hooks Implementados

**Archivo:** `src/api/order/content-types/order/lifecycles.ts`

Se implementaron 3 hooks:

##### Hook 1: `beforeCreate` (Existente)
Asigna automáticamente el usuario autenticado a nuevas órdenes.

##### Hook 2: `beforeUpdate` (Nuevo - ORD-22)
```typescript
async beforeUpdate(event) {
  const { where } = event.params;

  // Obtener orden actual para comparar después
  const existingOrder = await strapi.entityService.findOne('api::order.order', where.id, {
    fields: ['orderStatus'],
  });

  // Guardar estado anterior para afterUpdate
  event.state = event.state || {};
  event.state.previousOrderStatus = existingOrder?.orderStatus;
}
```

**Propósito:** Guardar el estado anterior del pedido para detectar cambios reales.

##### Hook 3: `afterUpdate` (Nuevo - ORD-22)
```typescript
async afterUpdate(event) {
  const { result } = event;

  try {
    // 1. Validar si notificaciones están habilitadas
    if (process.env.DISABLE_EMAIL_NOTIFICATIONS === 'true') {
      return;
    }

    // 2. Comparar estado anterior vs nuevo
    const previousStatus = event.state?.previousOrderStatus;
    const newStatus = result.orderStatus;

    if (previousStatus === newStatus) {
      // Sin cambio real, skip
      return;
    }

    // 3. Obtener email del usuario (con populate)
    const order = await strapi.entityService.findOne('api::order.order', result.id, {
      populate: ['user'],
    });

    if (!order?.user?.email) {
      strapi.log.error(`No user email found`);
      return;
    }

    // 4. Construir payload
    const payload = {
      orderId: result.orderId,
      customerEmail: order.user.email,
      customerName: order.user.username || 'Cliente',
      orderStatus: newStatus,
      orderData: {
        items: result.items,
        subtotal: parseFloat(result.subtotal),
        shipping: parseFloat(result.shipping),
        total: parseFloat(result.total),
        createdAt: result.createdAt,
      },
    };

    // 5. Llamar webhook de Next.js
    const webhookUrl = `${process.env.FRONTEND_URL}/api/send-order-email`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': process.env.WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    });

    // 6. Manejar respuesta
    if (response.ok) {
      strapi.log.info(`✅ Email sent successfully`);
    } else {
      strapi.log.error(`❌ Email sending failed`);
    }

  } catch (error) {
    // Error handling NO bloqueante
    strapi.log.error(`Exception in afterUpdate hook:`, error.message);
  }
}
```

### Obstáculos Encontrados y Soluciones

#### Obstáculo 1: Variables de Entorno No Cargadas

**Síntoma:**
```
error: [ORD-22] Missing FRONTEND_URL or WEBHOOK_SECRET env vars
```

**Causa:** Las variables estaban documentadas en `.env.example` pero no se agregaron al archivo `.env` real.

**Solución:**
1. Agregar las variables al archivo `.env` de Strapi
2. Reiniciar Strapi para cargar las nuevas variables
3. Verificar sincronización con Next.js

#### Obstáculo 2: Detección Incorrecta de Cambios de Estado

**Síntoma:** Email enviado aunque solo se cambió el campo `shipping`, no el `orderStatus`.

**Causa:** La lógica inicial verificaba si el campo `orderStatus` existía en `params.data`:
```typescript
const wasStatusUpdated = params.data && 'orderStatus' in params.data
```

Cuando se guarda desde Strapi Admin, **todos los campos** se envían en `params.data`, no solo los modificados. Entonces `'orderStatus' in params.data` siempre devolvía `true`.

**Solución:**
1. Implementar hook `beforeUpdate` para guardar el estado anterior
2. En `afterUpdate`, comparar valores: `previousStatus === newStatus`
3. Si son iguales → Skip (no enviar email)

**Código corregido:**
```typescript
const previousStatus = event.state?.previousOrderStatus;
const newStatus = result.orderStatus;

if (previousStatus === newStatus) {
  strapi.log.debug(`orderStatus unchanged, skipping email`);
  return;
}
```

#### Obstáculo 3: TypeScript - Property 'user' Does Not Exist

**Síntoma:**
```
error TS2339: Property 'user' does not exist on type '{ id: ID; ... }'
```

**Causa:** TypeScript no puede inferir que `populate: ['user']` agrega el campo `user` al objeto retornado.

**Solución:** Type assertion con `any` (pragmático para avanzar):
```typescript
const order: any = await strapi.entityService.findOne('api::order.order', result.id, {
  populate: ['user'],
});
```

**Nota:** En producción se crearían interfaces específicas, pero `any` es suficiente para este contexto.

#### Obstáculo 4: Resend - Email Address Mismatch

**Síntoma:**
```
You can only send testing emails to your own email address (andresjpadev@gmail.com)
```

**Causa:** El `DEV_EMAIL` configurado en Next.js tenía un typo (andresjpadev**l**@gmail.com vs andresjpadev@gmail.com).

**Solución:** Corregir el `DEV_EMAIL` en Next.js `.env.local` para que coincida exactamente con el email de la cuenta de Resend.

### Testing Exhaustivo

Se ejecutó una batería completa de tests para validar la arquitectura:

#### Test 1: Múltiples Cambios de Estado ✅
**Objetivo:** Verificar que cada cambio envía un email diferente.

**Ejecución:**
- `shipped` → `delivered` → `cancelled`
- Resultado: 2 emails recibidos con subjects y templates correctos
- IDs únicos en Resend dashboard

#### Test 2: Actualización Sin Cambio de Estado ✅
**Objetivo:** NO enviar email cuando solo cambia otro campo.

**Ejecución:**
- Cambiar `shipping` de 0 → 5.95 sin tocar `orderStatus`
- **Bug encontrado:** Email enviado incorrectamente
- **Fix aplicado:** Comparación de valores
- **Resultado:** Ya no envía email (correcto)

#### Test 3: Resiliencia del Sistema ✅
**Objetivo:** Orden se actualiza aunque Next.js esté apagado.

**Ejecución:**
- Next.js apagado
- Cambiar estado: `refunded` → `paid`
- **Resultado:**
  - Exception capturada en try-catch
  - Orden actualizada exitosamente (PUT 200)
  - Email NO enviado (esperado)
  - Sistema sigue funcional

#### Test 4: Seguridad del Webhook ✅
**Objetivo:** Rechazar llamadas con secret incorrecto.

**Ejecución:**
- Modificar `WEBHOOK_SECRET` en Next.js (agregar "FAKE")
- Cambiar estado de orden
- **Resultado:**
  - Next.js rechazó con 401 Unauthorized
  - Strapi logueó error
  - Orden actualizada (no bloqueada)
  - Email NO enviado (correcto)

#### Test 5: Verificación en Resend Dashboard ✅
**Objetivo:** Ver todos los emails enviados.

**Resultado:**
- 4 emails visibles en dashboard
- Estados: Delivered
- Subjects correctos por estado

### Decisiones de Arquitectura Clave

#### 1. Error Handling No Bloqueante

**Decisión:** El try-catch captura errores pero NO lanza exceptions.

**Razón:** Los emails son notificaciones secundarias. La orden debe actualizarse aunque el email falle. En el futuro se puede agregar un botón "Reenviar email" en el admin (ticket futuro: ORD-24).

#### 2. Comparación de Estados en beforeUpdate + afterUpdate

**Decisión:** Guardar estado anterior antes del update y comparar después.

**Razón:** Strapi Admin envía todos los campos en `params.data`, no solo los modificados. La única forma confiable de detectar cambios reales es comparar valores.

#### 3. Type Assertion con `any`

**Decisión:** Usar `const order: any` para el resultado con populate.

**Razón:** TypeScript no infiere tipos con populate dinámico. `any` es pragmático y funcional. En producción se crearían interfaces específicas.

#### 4. Webhook Secret Validation

**Decisión:** Validar `FRONTEND_URL` y `WEBHOOK_SECRET` antes de llamar.

**Razón:** Prevenir llamadas a URLs indefinidas o sin autenticación. Si faltan, loguear error y salir (early return).

### Aprendizajes Técnicos

1. **Strapi v5 Lifecycle Hooks:**
   - `beforeUpdate` permite guardar estado para comparar después
   - `event.state` es el mecanismo para pasar datos entre hooks
   - `entityService.findOne` con `populate` es necesario para relaciones

2. **Detección de Cambios:**
   - No basta con verificar si un campo existe en `params.data`
   - Hay que comparar valores: anterior vs nuevo

3. **Error Handling Distribuido:**
   - En sistemas distribuidos, los errores deben loguearse pero no bloquear
   - Try-catch sin throw para operaciones no críticas

4. **TypeScript Pragmatismo:**
   - Type safety vs pragmatismo: `any` es válido cuando los tipos dinámicos son complejos
   - En producción, invertir tiempo en interfaces específicas

5. **Testing Sistemático:**
   - Testing exhaustivo encuentra bugs reales
   - 5 tests ejecutados, 3 bugs encontrados y corregidos

### Estadísticas de Implementación

- **Líneas de código:** ~150
- **Hooks implementados:** 3 (beforeCreate, beforeUpdate, afterUpdate)
- **Tests ejecutados:** 5
- **Tests pasados:** 5 (100%)
- **Bugs encontrados:** 4
- **Bugs corregidos:** 4 (100%)
- **Emails enviados exitosamente:** 4

### Resultado Final

El sistema de notificaciones por email está completamente funcional e integrado:

✅ **Flujo Automatizado:** Cada cambio de estado dispara un email automático
✅ **Arquitectura Resiliente:** Sistema sigue funcionando aunque componentes fallen
✅ **Seguridad:** Autenticación con webhook secret (401 si incorrecto)
✅ **Templates Dinámicos:** React Email con 7 estados diferentes
✅ **Error Handling:** Logs detallados, operaciones no bloqueantes
✅ **Testing Validado:** 5/5 tests pasados

### Comandos Útiles

```bash
# Verificar variables de entorno
grep -E "FRONTEND_URL|WEBHOOK_SECRET" .env

# Generar nuevo webhook secret
openssl rand -base64 32

# Ver logs filtrados por ORD-22
npm run develop | grep "\[ORD-22\]"
```

### Referencias

- **Frontend (Next.js):** `/relojes-bv-beni/src/app/api/send-order-email/route.ts`
- **Templates:** `/relojes-bv-beni/src/emails/templates/OrderStatusEmail.tsx`
- **Documentación:** `/relojes-bv-beni/docs/email-system.md`
---

## Desafío #9: [ORD-25] Configuración de Permisos de Admin en Strapi

**Fecha:** 2026-01-13  
**Objetivo:** Configurar permisos completos en Strapi para permitir a los administradores gestionar órdenes desde el panel de admin, y a los usuarios autenticados acceder solo a sus propias órdenes vía API.

**Contexto:**  
A pesar de tener el content type Order creado y funcionando con lifecycle hooks (ORD-22), el sistema tenía una **brecha de seguridad crítica**: no había permisos configurados. Los admins no podían ver órdenes en el panel, y los usuarios autenticados podían acceder a órdenes de otros usuarios.

---

### Obstáculo 1: Order No Visible en Content Manager

**Síntoma:**  
Al acceder al panel de admin de Strapi (`http://localhost:1337/admin`), el content type "Order" no aparecía en el menú lateral de Content Manager, a pesar de existir el schema.

**Análisis:**  
```bash
# Verificación en base de datos SQLite
sqlite3 .tmp/data.db "SELECT action, subject FROM admin_permissions WHERE subject LIKE '%order%';"
# Resultado: (vacío)
```

No había **ningún permiso de admin configurado** para Order. Strapi oculta content types sin permisos configurados.

**Solución:**  
Configurar permisos de admin panel manualmente via UI:

1. Settings → Administration Panel → Roles
2. **Super Admin:** Ya tiene acceso completo (no requiere cambios)
3. **Editor Role:** Configurado con:
   - ✅ Create (crear órdenes manualmente si es necesario)
   - ✅ Read (**CRÍTICO** - ver todas las órdenes)
   - ✅ Update (**CRÍTICO** - cambiar orderStatus)
   - ✅ Publish (aunque draftAndPublish está en false)
   - ❌ Delete (las órdenes no se deben borrar)
4. **Author Role:** Solo lectura
   - ✅ Read (consultar órdenes)
   - ❌ Resto de permisos desactivados

**Resultado:**  
```
✅ Order aparece en Content Manager
✅ Admins pueden ver lista de todas las órdenes
✅ Admins pueden cambiar orderStatus
✅ Cambiar status dispara emails (ORD-22)
```

---

### Obstáculo 2: draftAndPublish Bloqueaba Configuración

**Síntoma:**  
Al intentar configurar permisos del Editor, el checkbox "Publish" no se podía marcar, bloqueando la configuración.

**Análisis:**  
```json
// src/api/order/content-types/order/schema.json (línea 10)
"options": {
  "draftAndPublish": true  // ❌ No tiene sentido para órdenes
}
```

Las órdenes de e-commerce no deberían tener concepto de "borrador" vs "publicado". Se crean automáticamente como finales.

**Solución:**  
Cambiar a `false` en schema.json:

```json
"options": {
  "draftAndPublish": false  // ✅ Órdenes se crean directamente publicadas
}
```

**Impacto:**  
- Órdenes se crean automáticamente como publicadas
- Simplifica el flujo de órdenes
- Elimina confusión en permisos de admin

---

### Obstáculo 3: Brecha de Seguridad - Acceso Cross-User

**Síntoma:**  
Durante testing, un usuario autenticado (`andresprueba@test.com`) pudo acceder a la orden de otro usuario (`andresjpandreiev@gmail.com`) usando:

```
GET http://localhost:3000/mi-cuenta/pedidos/ORD-1768307332-Z6LH
```

**Análisis:**  
El controller de Order usaba el factory por defecto:

```typescript
// src/api/order/controllers/order.ts (ANTES - INSEGURO)
export default factories.createCoreController('api::order.order');
```

Este controller NO filtra automáticamente por usuario autenticado. **Vulnerabilidad crítica de horizontal privilege escalation.**

**Intento de Solución 1: Modificar ctx.query.filters**  
Intentamos inyectar filtros en `ctx.query`:

```typescript
ctx.query.filters = {
  user: { id: { $eq: userId } }
}
```

**Error recibido:**
```
ValidationError: Invalid key user
```

Strapi v5 **no permite filtrar por relaciones** directamente en query params REST API.

**Solución Final: Custom Controller con entityService**  
Reescribimos completamente el controller para usar `entityService` que SÍ soporta filtros de relaciones:

```typescript
// src/api/order/controllers/order.ts (FINAL - SEGURO)
export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  async find(ctx) {
    const userId = ctx.state.user?.id
    
    if (!userId) {
      return ctx.unauthorized('You must be logged in to view orders')
    }

    // entityService permite filtrar por relaciones
    const orders = await strapi.entityService.findMany('api::order.order', {
      filters: {
        user: {
          id: userId,  // ✅ Funciona con entityService
        },
      },
      populate: ctx.query?.populate || '*',
      sort: ctx.query?.sort || { createdAt: 'desc' },
      pagination: ctx.query?.pagination || {},
    })

    strapi.log.info(`[ORD-25] User ${userId} listed their orders (${orders.length} found)`)
    return { data: orders }
  },

  async findOne(ctx) {
    const userId = ctx.state.user?.id
    
    if (!userId) {
      return ctx.unauthorized('You must be logged in to view order details')
    }

    const { id } = ctx.params

    // Obtener orden y popular relación user
    const order: any = await strapi.entityService.findOne('api::order.order', id, {
      populate: ['user'],
    })

    if (!order) {
      strapi.log.warn(`[ORD-25] User ${userId} attempted to access non-existent order: ${id}`)
      return ctx.notFound('Order not found')
    }

    // Validación de ownership
    if (order.user?.id !== userId) {
      strapi.log.warn(
        `[ORD-25] User ${userId} attempted to access unauthorized order: ${id} ` +
        `(belongs to user ${order.user?.id})`
      )
      return ctx.notFound('Order not found')  // ✅ 404, no 403 (evita info disclosure)
    }

    strapi.log.info(`[ORD-25] User ${userId} accessed order: ${id}`)
    return { data: order }
  },
}));
```

**Características de seguridad:**

1. **Filtrado automático por usuario** en `find()`
2. **Validación de ownership** en `findOne()`
3. **404 en lugar de 403** cuando orden no pertenece al usuario (evita information disclosure)
4. **Logging de intentos no autorizados** para auditoría
5. **Type casting `order: any`** para compatibilidad con TypeScript

---

### Obstáculo 4: Errores de TypeScript con Spread Operators

**Síntoma:**  
Al intentar compilar el controller customizado:

```
Los tipos spread solo se pueden crear a partir de tipos de objeto.
Línea 43: ...existingFilters
```

**Análisis:**  
`ctx.query.filters` podía ser `undefined`, y TypeScript no permite spread de valores undefined.

**Iteraciones de solución:**

```typescript
// INTENTO 1: Spread condicional (❌ Error persiste)
ctx.query.filters = {
  ...ctx.query.filters,  // ❌ Aún falla si filters es undefined
  user: { id: { $eq: userId } }
}

// INTENTO 2: Fallback a objeto vacío (❌ Error persiste)
ctx.query.filters = {
  ...(ctx.query.filters || {}),  // ❌ TypeScript no confía en el fallback
  user: { id: { $eq: userId } }
}

// INTENTO 3: Variable intermedia (❌ Error persiste)
const existingFilters = ctx.query.filters || {}
ctx.query.filters = {
  ...existingFilters,  // ❌ TypeScript aún no reconoce el tipo
  user: { id: { $eq: userId } }
}

// SOLUCIÓN FINAL: Type casting (✅ Funciona)
const existingFilters = (ctx.query.filters || {}) as Record<string, any>
ctx.query.filters = {
  ...existingFilters,  // ✅ TypeScript acepta el spread
  user: { id: { $eq: userId } }
}
```

**Sin embargo**, esta solución quedó obsoleta cuando cambiamos a usar `entityService` directamente, que no requiere modificar `ctx.query`.

---

### Obstáculo 5: API Permissions No Configurados

**Síntoma:**  
```bash
# Testing con usuario autenticado
GET /api/orders
# Resultado: 403 Forbidden
```

Usuarios autenticados no podían crear ni ver órdenes via API.

**Análisis:**  
```bash
# Verificación en base de datos
sqlite3 .tmp/data.db "
  SELECT p.action, r.name 
  FROM up_permissions p 
  JOIN up_permissions_role_lnk pr ON p.id = pr.permission_id 
  JOIN up_roles r ON pr.role_id = r.id 
  WHERE p.action LIKE '%order%'
"
# Resultado: (vacío)
```

**ZERO permisos API** configurados para Order.

**Solución:**  
Configurar permisos via UI:

1. Settings → Users & Permissions Plugin → Roles → Authenticated
2. Sección "Order" → Marcar:
   - ✅ **create** (crear órdenes en checkout)
   - ✅ **find** (listar propias órdenes)
   - ✅ **findOne** (ver detalles de orden)
   - ❌ update (usuarios no pueden modificar órdenes)
   - ❌ delete (usuarios no pueden borrar órdenes)

3. Verificar Public role:
   - ❌ TODOS los permisos de Order desactivados (seguridad)

**Resultado:**  
```bash
# Usuario autenticado
GET /api/orders
# 200 OK - Solo sus órdenes

# Usuario sin login
GET /api/orders
# 403 Forbidden ✅
```

---

### Testing Exhaustivo Realizado

#### Test 1: Admin Panel Access ✅
```
Pasos:
1. Login en admin panel (http://localhost:1337/admin)
2. Content Manager → Order
3. Ver lista de órdenes
4. Abrir orden específica
5. Cambiar orderStatus de "pending" → "paid"
6. Guardar

Resultado:
✅ Order visible en Content Manager
✅ Lista de órdenes completa
✅ Todos los campos visibles y editables
✅ orderStatus cambiado exitosamente
✅ Email enviado (log: [ORD-22] ✅ Email sent successfully)
```

#### Test 2: API - Create Order ✅
```
Pasos:
1. Login en frontend como usuario de prueba
2. Agregar producto al carrito
3. Checkout con tarjeta de prueba (4242 4242 4242 4242)

Resultado:
✅ Orden creada: ORD-1768307650-I883
✅ User auto-asignado via lifecycle hook
✅ Orden visible en "Mis Pedidos"
```

#### Test 3: API - List Own Orders ✅
```
Request:
GET /api/orders
Authorization: Bearer {jwt-token-user-1}

Logs Strapi:
[ORD-25] User 1 listed their orders (9 found)

Resultado:
✅ Solo 9 órdenes del usuario 1
✅ No se incluyen órdenes de otros usuarios
```

#### Test 4: Security - Cross-User Access Blocked ✅
```
Setup:
- Usuario 1 (andresprueba@test.com) - Orden: ORD-1768307650-I883
- Usuario 4 (andresjpandreiev@gmail.com) - Orden: ORD-1768307332-Z6LH

Test:
Usuario 1 intenta acceder a orden de Usuario 4:
GET /api/orders/ORD-1768307332-Z6LH
Authorization: Bearer {jwt-token-user-1}

Logs Strapi:
[ORD-25] User 1 attempted to access unauthorized order: xxx (belongs to user 4)

Resultado:
✅ 404 Not Found (correcto, no 403)
✅ Frontend muestra "Pedido no encontrado"
✅ Intento loguead para auditoría

Test positivo:
GET /api/orders/ORD-1768307650-I883 (propia orden)

Logs Strapi:
[ORD-25] User 1 accessed order: xxx

Resultado:
✅ 200 OK
✅ Detalles de orden visibles
```

#### Test 5: Security - Public Access Blocked ✅
```
Test sin autenticación:
curl http://localhost:1337/api/orders

Resultado:
{
  "data": null,
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "Forbidden",
    "details": {}
  }
}

✅ Acceso bloqueado correctamente
✅ No se exponen datos
```

---

### Arquitectura de Permisos en Strapi v5

Strapi maneja **dos sistemas de permisos separados:**

#### 1. Admin Permissions (RBAC)
- **Propósito:** Control de acceso al panel de admin de Strapi
- **Roles:** Super Admin, Editor, Author
- **Tabla:** `admin_permissions` + `admin_permissions_role_lnk`
- **Configuración:** Via UI → Settings → Roles
- **Formato:** `plugin::content-manager.explorer.{action}`
- **Acciones:** create, read, update, delete, publish

#### 2. API Permissions (users-permissions plugin)
- **Propósito:** Control de acceso API para usuarios del frontend
- **Roles:** Public, Authenticated
- **Tabla:** `up_permissions` + `up_permissions_role_lnk`
- **Configuración:** Via UI → Settings → Users & Permissions Plugin
- **Formato:** `api::{content-type}.{action}`
- **Acciones:** find, findOne, create, update, delete

**Limitación Crítica en Strapi v5:**  
⚠️ Los permisos **NO se pueden configurar via código**. Deben configurarse manualmente en la UI. Esto dificulta version control y despliegues automatizados.

---

### Configuración Final de Permisos

#### Admin Permissions (Admin Panel)

| Rol | Create | Read | Update | Delete | Publish |
|-----|--------|------|--------|--------|---------|
| Super Admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ | ✅ | ❌ | ✅ |
| Author | ❌ | ✅ | ❌ | ❌ | ❌ |

#### API Permissions (Frontend Users)

| Rol | find | findOne | create | update | delete |
|-----|------|---------|--------|--------|--------|
| Authenticated | ✅ | ✅ | ✅ | ❌ | ❌ |
| Public | ❌ | ❌ | ❌ | ❌ | ❌ |

**Nota:** Aunque Authenticated tiene permisos de find/findOne, el **controller customizado** garantiza que solo vean sus propias órdenes.

---

### Lecciones Aprendidas

1. **Strapi v5 Query API Limitaciones:**
   - REST API query params NO soportan filtros por relaciones
   - Usar `entityService` para queries complejas con relaciones
   - `ctx.query.filters.user` → ❌ ValidationError
   - `entityService.findMany({ filters: { user: {...} } })` → ✅

2. **Defense in Depth:**
   - Permisos de API + Controller customizado = Doble capa de seguridad
   - Nunca confiar solo en permisos de Strapi
   - Validación manual de ownership crítica

3. **Information Disclosure Prevention:**
   - Devolver 404 (no 403) cuando orden no pertenece al usuario
   - 403 revela que el recurso existe → brecha de seguridad
   - 404 no revela información

4. **Auditing:**
   - Log TODOS los intentos de acceso no autorizado
   - Formato: `[ORD-25] User ${userId} attempted to access...`
   - Crítico para detectar ataques

5. **TypeScript en Controllers:**
   - `order: any` es pragmático cuando tipos dinámicos son complejos
   - Type casting necesario con entityService populate
   - Balance entre type safety y productividad

6. **draftAndPublish Consideration:**
   - No todos los content types necesitan draft/publish
   - E-commerce orders = crear directamente como final
   - Simplifica permisos y flujo

---

### Estadísticas de Implementación

- **Permisos configurados:** 15+ (admin + API)
- **Roles configurados:** 5 (3 admin + 2 API)
- **Tests ejecutados:** 5
- **Tests pasados:** 5 (100%)
- **Bugs de seguridad encontrados:** 1 (acceso cross-user)
- **Bugs corregidos:** 1 (100%)
- **Código añadido/modificado:**
  - `src/api/order/controllers/order.ts`: 89 líneas (reescrito completo)
  - `src/api/order/content-types/order/schema.json`: 1 línea (draftAndPublish)

---

### Resultado Final

✅ **Admin Panel Funcional:**
- Admins pueden ver todas las órdenes
- Editors pueden cambiar orderStatus
- Authors tienen acceso read-only
- Cambios de status disparan emails (ORD-22)

✅ **API Segura:**
- Usuarios autenticados pueden crear y ver solo sus órdenes
- Validación de ownership en controller
- Acceso público bloqueado (403)

✅ **Seguridad Implementada:**
- Filtrado automático por usuario
- Validación manual de ownership
- Logging de intentos no autorizados
- Defense in depth (permisos + controller)

✅ **No Information Disclosure:**
- 404 para órdenes no autorizadas (no 403)
- Mensajes de error genéricos

---

### Comandos Útiles

```bash
# Verificar permisos en base de datos (Admin)
sqlite3 .tmp/data.db "
  SELECT action, subject 
  FROM admin_permissions 
  WHERE subject LIKE '%order%'
"

# Verificar permisos en base de datos (API)
sqlite3 .tmp/data.db "
  SELECT p.action, r.name 
  FROM up_permissions p 
  JOIN up_permissions_role_lnk pr ON p.id = pr.permission_id 
  JOIN up_roles r ON pr.role_id = r.id 
  WHERE p.action LIKE '%order%'
"

# Test de acceso público bloqueado
curl http://localhost:1337/api/orders

# Test de acceso autenticado
curl -H "Authorization: Bearer {jwt-token}" \
  http://localhost:1337/api/orders

# Ver logs filtrados por ORD-25
npm run develop | grep "\[ORD-25\]"
```

---

### Referencias

- **Controller:** `/src/api/order/controllers/order.ts`
- **Schema:** `/src/api/order/content-types/order/schema.json`
- **Plan de implementación:** `/docs/ORD-25-implementation-plan.md`
- **Frontend ownership validation:** `/relojes-bv-beni/src/app/api/orders/[orderId]/route.ts`


---

## Desafío #10: Búsqueda de Órdenes por Email en Admin Panel

**Fecha:** 2026-02-11
**Objetivo:** Permitir buscar órdenes por email del cliente en el componente de búsqueda personalizado del panel de administración.

### Obstáculo: Búsqueda sin Resultados para Emails Válidos

**Síntoma:**
Al ingresar un email de cliente válido en el buscador de órdenes, la consola mostraba "No users found" y no se devolvía ninguna orden, a pesar de que existían órdenes asociadas a ese email.

**Análisis:**
El componente  estaba consultando el endpoint incorrecto para buscar usuarios:

```typescript
// Código Original (Incorrecto)
const usersResponse = await fetchClient.get(
  `/admin/users?pageSize=100&page=1`
)
```

El endpoint `/admin/users` devuelve **administradores** del panel de Strapi, no los **clientes** (usuarios del plugin `users-permissions`) que realizan las compras. Como los emails de los clientes no existen en la tabla de administradores, la búsqueda siempre fallaba.

**Solución:**
Se modificó el componente  para consultar el endpoint del Content Manager correspondiente a los usuarios del plugin `users-permissions`.

1.  **Cambio de Endpoint:** De `/admin/users` a `/content-manager/collection-types/plugin::users-permissions.user`.
2.  **Filtrado Nativo:** Se utilizaron los filtros de Strapi (`filters[email][]`) en lugar de filtrar el array en el cliente, mejorando la eficiencia.
3.  **Manejo de IDs:** Se añadió compatibilidad para `documentId` (Strapi v5) e `id` (Strapi v4).

```typescript
// Código Corregido
const { data: userData } = await fetchClient.get(
  `/content-manager/collection-types/plugin::users-permissions.user`,
  {
    params: {
      page: 1,
      pageSize: 10,
      filters: {
        email: {
          : trimmedValue,
        },
      },
    },
  }
)
```

**Resultado Final:**
La búsqueda por email ahora localiza correctamente a los clientes y filtra sus órdenes asociadas en el listado.

---

## Desafío #11: Corrección de Tests de Historial de Estado de Órdenes (ORD-33)

**Fecha:** 2026-02-17
**Objetivo:** Resolver fallos en los tests del historial de estados de órdenes para asegurar la integridad de los logs de auditoría y evitar regresiones en el sistema de historial de cambios.

### Obstáculo 1: Error de Validación de Schema `fromStatus`

**Síntoma:**
Al crear una nueva orden, el sistema intentaba registrar el historial inicial (`null` → `pending`), pero fallaba con un error de validación.

**Análisis:**
El campo `fromStatus` en el `schema.json` de `order-status-history` estaba marcado como `required: true`. Sin embargo, para la entrada inicial del historial, no existe un estado previo, por lo que el valor es `null`.

**Solución:**
Se modificó el schema para permitir valores nulos en `fromStatus`:
```json
"fromStatus": {
  "type": "enumeration",
  "required": false, // Cambiado de true a false
  ...
}
```

### Obstáculo 2: Error de Formato de Email en `changedByEmail`

**Síntoma:**
Los tests fallaban con `ValidationError: changedByEmail must be a valid email`.

**Análisis:**
El campo `changedByEmail` es de tipo `email`. El valor por defecto en los lifecycles (cuando el cambio lo hace el sistema) era el string `"system"`, que no es un formato de email válido.

**Solución:**
Se actualizó el valor por defecto en `lifecycles.ts` y en la función helper `createStatusHistoryEntry`:
```typescript
const changedByEmail = ctx?.state?.user?.email || 'system@example.com'
```

### Obstáculo 3: Lógica de Test Incorrecta (Orden Cronológico)

**Síntoma:**
El test `[HT-6] should maintain chronological order` fallaba intermitentemente o por lógica incorrecta.

**Análisis:**
El test verificaba que los timestamps estuvieran en orden ascendente, pero la consulta a la API ordenaba por `changedAt: 'desc'` (descendente). Además, los cambios de estado ocurrían tan rápido (<1ms) que los timestamps eran idénticos, causando confusión en el ordenamiento.

**Solución:**
1.  Se corrigió la lógica de aserción para verificar orden descendente.
2.  Se añadieron pequeños delays (`setTimeout(100)`) entre actualizaciones en el test para garantizar timestamps distintos.

### Resultado Final

Tras aplicar estas correcciones:
-   Los 15 tests de `test/api/order-status-history.test.ts` pasan exitosamente (100%).
-   El historial de cambios se registra correctamente tanto para creación de órdenes como para actualizaciones de estado.
-   Se mantiene la integridad de los datos de auditoría con validaciones correctas.
