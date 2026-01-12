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