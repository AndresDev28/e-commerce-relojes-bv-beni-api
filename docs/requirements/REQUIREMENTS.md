# Requerimientos del Proyecto - E-commerce Relojes BV Beni

### Contexto del Proyecto

E-commerce de relojes con 25 años de trayectoria. El objetivo es permitir pagos seguros con tarjeta de crédito/débito a través de Stripe, manteniendo una experiencia de usuario fluida y profesional.

**Stack Técnico:**

- Frontend: Next.js 14, TypeScript, React, Tailwind CSS
- Backend: Strapi (Headless CMS)
- Testing: Vitest, React Testing Library
- Pasarela de Pagos: Stripe

---

## EPIC 14: Pasarela de Pagos con Stripe

## User Story 1: Integración básica con Stripe

**Como** usuario registrado  
**Quiero** poder pagar mi pedido con tarjeta de crédito/débito  
**Para** completar mi compra de forma segura y rápida

### Criterios de Aceptación

```gherkin
Feature: Pago con tarjeta de crédito

Scenario: Pago exitoso con tarjeta válida
  Given el usuario está en la página de checkout "/checkout"
  And tiene productos en el carrito por valor de 259.89€
  And ha iniciado sesión correctamente
  When ingresa los datos de una tarjeta válida
    | Campo       | Valor              |
    | Número      | 4242424242424242   |
    | Expiración  | 12/25              |
    | CVC         | 123                |
    | Nombre      | Juan Pérez         |
  And hace click en "Pagar ahora"
  Then el pago se procesa correctamente
  And se muestra un mensaje de confirmación "¡Pago exitoso!"
  And se redirige a la página de confirmación "/checkout/success"
  And el carrito se vacía automáticamente
  And recibe un email con el resumen del pedido

Scenario: Pago rechazado por tarjeta sin fondos
  Given el usuario está en la página de checkout
  And tiene productos en el carrito
  When ingresa una tarjeta con fondos insuficientes (4000000000009995)
  And hace click en "Pagar ahora"
  Then se muestra el error "Tu tarjeta fue rechazada"
  And el pedido NO se crea en el sistema
  And el usuario permanece en la página de checkout
  And el carrito mantiene los productos

Scenario: Validación en tiempo real de datos de tarjeta
  Given el usuario está en el formulario de pago
  When ingresa un número de tarjeta inválido "1234"
  Then se muestra un error "Número de tarjeta inválido" inmediatamente
  And el botón "Pagar ahora" está deshabilitado
  When completa todos los campos correctamente
  Then el botón "Pagar ahora" se habilita
```

### Tareas técnicas

- [ ] [PAY-01] Instalar y configurar Stripe SDK
- [ ] [PAY-02] Crear componente CheckoutForm con Stripe Elements
- [ ] [PAY-03] Implementar página /checkout con diseño responsive
- [ ] [PAY-04] Configurar variables de entorno para Stripe (test/prod)
- [ ] [PAY-05] Tests: Formulario de pago renderiza correctamente

**Prioridad:** Alta  
**Estimación:** 5-8 horas

---

## User Story 2: Manejo de errores y casos edge

**Como** usuario  
**Quiero** recibir mensajes claros cuando hay problemas con el pago  
**Para** entender qué salió mal y cómo solucionarlo

### Criterios de Aceptación

```gherkin
Feature: Manejo de errores en pagos

Scenario: Timeout de conexión con Stripe
  Given el usuario ha iniciado el proceso de pago
  When la conexión con Stripe tarda más de 30 segundos
  Then se muestra el mensaje "Tiempo de espera agotado. Por favor, intenta de nuevo."
  And se habilita un botón "Reintentar pago"
  And el formulario mantiene los datos ingresados (excepto CVV)

Scenario: Tarjeta caducada
  Given el usuario ingresa una tarjeta con fecha de expiración pasada
  When hace click en "Pagar ahora"
  Then se muestra el error "Tu tarjeta ha caducado"
  And se sugiere "Por favor, usa otra tarjeta"

Scenario: Error de red del cliente
  Given el usuario pierde conexión a internet durante el pago
  When intenta procesar el pago
  Then se muestra "Sin conexión. Verifica tu internet."
  And no se realizan intentos adicionales hasta que haya conexión

Scenario: CVC incorrecto
  Given el usuario ingresa un CVC inválido
  When intenta pagar
  Then se muestra "El código de seguridad es incorrecto"
  And el campo CVC se resalta en rojo
```

### Tareas técnicas

- [ ] [PAY-06] Implementar manejo de errores de Stripe
- [ ] [PAY-07] Crear componente ErrorMessage reutilizable
- [ ] [PAY-08] Implementar retry logic para timeouts
- [ ] [PAY-09] Tests: Errores se muestran correctamente
- [ ] [PAY-10] Tests: Retry funciona después de error

**Prioridad:** Alta  
**Estimación:** 3-4 horas

---

## User Story 3: Confirmación y resumen del pedido

**Como** usuario  
**Quiero** ver un resumen de mi pedido antes de pagar  
**Para** confirmar que todo está correcto antes de finalizar

### Criterios de Aceptación

```gherkin
Feature: Resumen del pedido en checkout

Scenario: Mostrar resumen completo del pedido
  Given el usuario está en la página de checkout
  Then se muestra un resumen con:
    | Elemento          | Descripción                    |
    | Productos         | Nombre, cantidad, precio       |
    | Subtotal          | Suma de todos los productos    |
    | Envío             | "Gratis" o costo de envío      |
    | Total             | Subtotal + Envío               |
  And cada campo está claramente etiquetado
  And los precios tienen formato de moneda (XXX,XX €)

Scenario: Editar carrito desde checkout
  Given el usuario está en checkout
  When hace click en "Editar carrito"
  Then se redirige a "/carrito"
  And puede modificar cantidades o eliminar productos
  When regresa a checkout
  Then el resumen se actualiza con los cambios

Scenario: Cambio de cantidad durante checkout
  Given el usuario está en checkout con 2 productos
  When vuelve atrás y cambia la cantidad de un producto
  And regresa a checkout
  Then el resumen muestra los nuevos totales
  And el monto a cobrar es el correcto
```

### Tareas técnicas

- [ ] [PAY-11] Crear componente OrderSummary
- [ ] [PAY-12] Integrar OrderSummary en CheckoutPage
- [ ] [PAY-13] Implementar cálculo de totales
- [ ] [PAY-14] Tests: OrderSummary renderiza correctamente
- [ ] [PAY-15] Tests: Totales se calculan correctamente

**Prioridad:** Media  
**Estimación:** 2-3 horas

---

## User Story 4: Página de confirmación de pago exitoso

**Como** usuario  
**Quiero** ver una confirmación clara después de pagar  
**Para** tener certeza de que mi pedido fue procesado

### Criterios de Aceptación

```gherkin
Feature: Confirmación de pago exitoso

Scenario: Mostrar página de éxito después del pago
  Given el pago se procesó correctamente
  When el usuario es redirigido a "/checkout/success"
  Then se muestra un mensaje "¡Gracias por tu compra!"
  And se muestra el número de pedido "#PED-12345"
  And se muestra el resumen de lo comprado
  And se muestra un botón "Volver a la tienda"

Scenario: Email de confirmación enviado
  Given el pago fue exitoso
  Then el usuario recibe un email a su correo registrado
  And el email contiene:
    | Elemento          | Descripción                     |
    | Número de pedido  | #PED-12345                      |
    | Productos         | Lista con nombres y cantidades  |
    | Total pagado      | Monto con formato de moneda     |
    | Fecha estimada    | Entrega aproximada              |

Scenario: No se puede volver a pagar pedido ya procesado
  Given el usuario está en "/checkout/success"
  When intenta volver a "/checkout"
  Then se redirige a la tienda
  And el carrito está vacío
  And no puede procesar el mismo pedido dos veces
```

### Tareas técnicas

- [ ] [PAY-16] Crear página /checkout/success
- [ ] [PAY-17] Implementar generación de número de pedido
- [ ] [PAY-18] Crear orden en Strapi después de pago exitoso
- [ ] [PAY-19] Tests: Página de éxito renderiza correctamente
- [ ] [PAY-20] Tests: Orden se guarda en backend

**Prioridad:** Media  
**Estimación:** 3-4 horas

---

## User Story 5: Seguridad y mejores prácticas

**Como** desarrollador  
**Quiero** implementar las mejores prácticas de seguridad  
**Para** proteger los datos sensibles de los usuarios

### Criterios de Aceptación

```gherkin
Feature: Seguridad en pagos

Scenario: Datos de tarjeta nunca tocan nuestro servidor
  Given el usuario ingresa datos de tarjeta
  When envía el formulario de pago
  Then los datos van directo a Stripe (tokenización)
  And nuestro backend solo recibe el token de Stripe
  And nunca almacenamos números de tarjeta

Scenario: Uso de claves API correctas por ambiente
  Given la aplicación está en desarrollo
  Then usa las claves de test de Stripe (pk_test_*)
  When la aplicación está en producción
  Then usa las claves de producción de Stripe (pk_live_*)
  And las claves están en variables de entorno (.env)

Scenario: HTTPS obligatorio en producción
  Given la aplicación está en producción
  Then todas las conexiones usan HTTPS
  And no se permite HTTP para el checkout
```

### Tareas técnicas

- [ ] [PAY-21] Verificar que Stripe Elements maneja tokenización
- [ ] [PAY-22] Configurar variables de entorno por ambiente
- [ ] [PAY-23] Implementar validación de HTTPS en producción
- [ ] [PAY-24] Documentar proceso de deployment seguro
- [ ] [PAY-25] Tests: Verificar que no se exponen datos sensibles

**Prioridad:** Alta (seguridad)  
**Estimación:** 2-3 horas

---

## Notas Técnicas Adicionales

### Flujo completo del pago:

```
1. Usuario en /carrito → Click "Finalizar Compra"
2. Redirect a /checkout
3. Mostrar OrderSummary + Stripe Elements
4. Usuario ingresa datos de tarjeta
5. Submit → Stripe tokeniza la tarjeta
6. Frontend recibe token → Envía a backend
7. Backend crea Payment Intent con Stripe
8. Stripe procesa el pago
9. Backend recibe confirmación
10. Crear orden en Strapi
11. Redirect a /checkout/success
12. Enviar email de confirmación
13. Limpiar carrito
```

### Dependencias:

- `@stripe/stripe-js` - Cliente Stripe para frontend
- `stripe` - SDK de Stripe para backend (si usas API Routes)
- Variables de entorno necesarias:
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_SECRET_KEY`

### Casos edge a considerar:

- Usuario cierra la ventana durante el pago
- Pago exitoso pero falla crear orden en Strapi
- Usuario intenta pagar carrito vacío
- Múltiples clicks en botón de pago
- Stock insuficiente al momento de pagar

---

## Métricas de Éxito

- ✅ Tasa de conversión de checkout > 70%
- ✅ Tiempo promedio de checkout < 2 minutos
- ✅ Tasa de error en pagos < 5%
- ✅ 100% de pagos exitosos crean orden
- ✅ Coverage de tests > 80% en módulo de pagos

---

## Próximos EPICs (después del 14)

- **EPIC 15:** Gestión de pedidos (ver historial, estados)
- **EPIC 16:** Notificaciones por email (confirmación, envío)
- **EPIC 17:** Panel de administración de pedidos

## EPIC 15: Gestión de Pedidos Post-Pago

### Contexto

Después de que un cliente completa un pago exitoso (EPIC 14), necesita poder consultar sus pedidos, ver su estado y hacer seguimiento. El administrador necesita herramientas para gestionar el fulfillment (preparación, envío, entrega) de manera eficiente.

---

## User Story 1: Ver historial de pedidos

**Como** cliente registrado  
**Quiero** ver una lista de todos mis pedidos realizados  
**Para** poder consultar mis compras anteriores y su estado actual

### Criterios de Aceptación

```gherkin
Feature: Historial de pedidos del cliente

Scenario: Cliente con pedidos accede a su historial
  Given que soy un cliente autenticado con email "cliente@example.com"
  And he realizado 5 pedidos anteriormente
  When navego a "Mi cuenta" > "Mis pedidos"
  Then veo una lista con mis 5 pedidos
  And los pedidos están ordenados del más reciente al más antiguo
  And cada pedido muestra:
    | Campo           | Formato                        |
    | Número          | ORD-1763064732-F               |
    | Fecha           | 22/11/2025                     |
    | Total           | 259,89 €                       |
    | Estado          | Badge con color (Enviado)      |
  And puedo hacer click en cada pedido para ver detalles

Scenario: Cliente sin pedidos accede a su historial
  Given que soy un cliente autenticado
  And no he realizado ningún pedido
  When accedo a "Mis pedidos"
  Then veo el mensaje "Aún no has realizado ningún pedido"
  And veo un botón "Explorar productos"
  And al hacer click me redirige a "/tienda"

Scenario: Paginación de historial con muchos pedidos
  Given que soy un cliente con 25 pedidos realizados
  When accedo a "Mis pedidos"
  Then veo los primeros 10 pedidos más recientes
  And veo controles de paginación "1, 2, 3, Siguiente"
  When hago click en "Página 2"
  Then veo los pedidos 11-20
  And la URL cambia a "/mi-cuenta/pedidos?page=2"
```

### Tareas técnicas

- [ ] [ORD-01] Crear endpoint GET /api/orders?user=:userId&page=:page
- [ ] [ORD-02] Implementar paginación (10 pedidos por página)
- [ ] [ORD-03] Crear componente OrderHistory.tsx
- [ ] [ORD-04] Crear componente OrderCard.tsx (tarjeta individual)
- [ ] [ORD-05] Añadir ruta /mi-cuenta/pedidos
- [ ] [ORD-06] Implementar estados con badges coloreados
- [ ] [ORD-07] Tests: OrderHistory renderiza lista correctamente
- [ ] [ORD-08] Tests: Paginación funciona correctamente

**Prioridad:** Alta  
**Estimación:** 4-5 horas

---

## User Story 2: Ver detalle de un pedido específico

**Como** cliente  
**Quiero** ver el detalle completo de un pedido específico  
**Para** conocer exactamente qué compré, cuánto pagué y el estado actual

### Criterios de Aceptación

```gherkin
Feature: Detalle de pedido

Scenario: Cliente accede al detalle de un pedido propio
  Given que soy un cliente autenticado
  And tengo un pedido con número "ORD-1763064732-F"
  When hago click en ese pedido desde "Mis pedidos"
  Then veo la página "/mi-cuenta/pedidos/ORD-1763064732-F"
  And se muestra:
    | Sección           | Contenido                                |
    | Cabecera          | Número de pedido, fecha, estado          |
    | Productos         | Imagen, nombre, cantidad, precio unit.   |
    | Resumen           | Subtotal, envío, total                   |
    | Estado            | Timeline visual del progreso             |
    | Pago              | Método usado (Visa ****4242)             |
  And cada producto tiene link a su página
  And veo un botón "Volver a mis pedidos"

Scenario: Intentar acceder a pedido de otro usuario
  Given que soy un cliente autenticado como "cliente1@example.com"
  When intento acceder a "/mi-cuenta/pedidos/ORD-OTRO-USUARIO"
  Then recibo un error 403 "No tienes permiso para ver este pedido"
  And se me redirige a "Mis pedidos"

Scenario: Timeline de estado del pedido
  Given estoy viendo el detalle de un pedido en estado "Enviado"
  Then veo un timeline con:
    | Estado             | Estado Visual  | Fecha           |
    | Pedido realizado   | ✓ Completado   | 20/11/2025      |
    | En preparación     | ✓ Completado   | 20/11/2025      |
    | Enviado            | → En proceso   | 21/11/2025      |
    | Entregado          | ○ Pendiente    | -               |
  And el estado actual está resaltado
  And los estados futuros están en gris
```

### Tareas técnicas

- [ ] [ORD-09] Crear endpoint GET /api/orders/:orderId
- [ ] [ORD-10] Implementar validación de propiedad del pedido
- [ ] [ORD-11] Crear página /mi-cuenta/pedidos/[orderId]
- [ ] [ORD-12] Crear componente OrderDetail.tsx
- [ ] [ORD-13] Crear componente OrderTimeline.tsx
- [ ] [ORD-14] Formatear información de pago (último 4 dígitos)
- [ ] [ORD-15] Tests: OrderDetail renderiza correctamente
- [ ] [ORD-16] Tests: No se puede acceder a pedidos de otros usuarios

**Prioridad:** Alta  
**Estimación:** 5-6 horas

---

## User Story 3: Seguimiento de estado del pedido

**Como** cliente  
**Quiero** ver el estado actual de mi pedido en tiempo real  
**Para** saber cuándo llegará mi reloj

### Criterios de Aceptación

```gherkin
Feature: Seguimiento de estado del pedido

Scenario: Estados disponibles y su significado
  Given que estoy viendo el detalle de un pedido
  Then los estados posibles son:
    | Estado          | Color   | Significado                           |
    | Pendiente       | Gris    | Pago confirmado, aún no procesado     |
    | En preparación  | Azul    | Empaquetando el pedido                |
    | Enviado         | Naranja | En camino al cliente                  |
    | Entregado       | Verde   | Recibido por el cliente               |
    | Cancelado       | Rojo    | Pedido cancelado                      |
    | Reembolsado     | Morado  | Dinero devuelto al cliente            |
  And cada estado tiene un ícono representativo
  And hay una breve descripción del estado actual

Scenario: Notificación de cambio de estado
  Given tengo un pedido en estado "En preparación"
  When el administrador cambia el estado a "Enviado"
  Then recibo un email con el asunto "Tu pedido ha sido enviado"
  And el email contiene el número de seguimiento (si aplica)
  And la próxima vez que accedo al detalle veo el nuevo estado
  And aparece la fecha del cambio en el timeline

Scenario: Fecha estimada de entrega
  Given mi pedido está en estado "Enviado"
  When veo el detalle del pedido
  Then se muestra "Entrega estimada: 24-25 Nov 2025"
  And la fecha se calcula como +3-4 días desde el envío
  When el pedido cambia a "Entregado"
  Then se muestra "Entregado el: 24 Nov 2025"
```

### Tareas técnicas

- [ ] [ORD-17] Definir enum de estados en backend
- [ ] [ORD-18] Crear componente StatusBadge.tsx
- [ ] [ORD-19] Implementar lógica de fecha estimada
- [ ] [ORD-20] Configurar sistema de emails (Resend/SendGrid)
- [ ] [ORD-21] Crear templates de email para cada estado
- [ ] [ORD-22] Hook: Enviar email cuando cambia estado
- [ ] [ORD-23] Tests: Estados se muestran correctamente
- [ ] [ORD-24] Tests: Emails se envían al cambiar estado

**Prioridad:** Alta  
**Estimación:** 6-7 horas

---

## User Story 4: Panel de administración - Listado de pedidos

**Como** administrador de la tienda  
**Quiero** ver una lista de todos los pedidos realizados  
**Para** gestionar las ventas y el fulfillment de manera eficiente

### Criterios de Aceptación

```gherkin
Feature: Panel de administración de pedidos

Scenario: Administrador accede al listado de pedidos
  Given que soy un administrador autenticado
  When accedo a Strapi admin > "Orders"
  Then veo una tabla con todos los pedidos
  And la tabla muestra:
    | Columna         | Formato                      |
    | Número          | ORD-1763064732-F             |
    | Cliente         | nombre + email               |
    | Fecha           | 22/11/2025 14:30             |
    | Total           | 259,89 €                     |
    | Estado          | Badge con color              |
    | Acciones        | Ver, Editar, Cambiar estado  |
  And los pedidos están ordenados por fecha descendente

Scenario: Filtrar pedidos por estado
  Given estoy en el listado de pedidos como admin
  When selecciono el filtro "Estado: Enviado"
  Then veo solo los pedidos en estado "Enviado"
  And el contador muestra "15 pedidos"
  When limpio el filtro
  Then veo todos los pedidos nuevamente

Scenario: Buscar pedido por número o email
  Given estoy en el listado de pedidos
  When escribo "ORD-1763064732" en el buscador
  Then veo solo ese pedido específico
  When busco "cliente@example.com"
  Then veo todos los pedidos de ese cliente
  And puedo ordenar por fecha, total o estado
```

### Tareas técnicas

- [ ] [ORD-25] Configurar permisos de admin en Strapi
- [ ] [ORD-26] Personalizar vista de Orders en Strapi
- [ ] [ORD-27] Añadir filtros por estado
- [ ] [ORD-28] Implementar búsqueda por número/email
- [ ] [ORD-29] Añadir ordenamiento de columnas
- [ ] [ORD-30] Tests: Admin puede ver todos los pedidos
- [ ] [ORD-31] Tests: Filtros funcionan correctamente

**Prioridad:** Alta  
**Estimación:** 4-5 horas

---

## User Story 5: Cambiar estado de un pedido (Admin)

**Como** administrador  
**Quiero** actualizar el estado de un pedido  
**Para** reflejar el progreso del fulfillment

### Criterios de Aceptación

```gherkin
Feature: Cambio de estado de pedidos

Scenario: Cambiar estado de pedido exitosamente
  Given soy un administrador en el detalle de un pedido
  And el pedido está en estado "Pendiente"
  When selecciono "En preparación" en el dropdown de estado
  And hago click en "Guardar"
  Then el estado se actualiza a "En preparación"
  And se registra la fecha y hora del cambio
  And el cliente recibe un email notificando el cambio
  And veo una confirmación "Estado actualizado correctamente"

Scenario: Validación de transiciones de estado
  Given tengo un pedido en estado "Entregado"
  When intento cambiarlo a "Pendiente"
  Then veo un error "No se puede retroceder a estado anterior"
  And el estado permanece como "Entregado"

  Given tengo un pedido en estado "Cancelado"
  When intento cambiarlo a cualquier otro estado
  Then veo un error "No se puede modificar un pedido cancelado"

Scenario: Añadir nota al cambiar estado
  Given estoy cambiando el estado de un pedido a "Enviado"
  When añado la nota "Número de seguimiento: ES123456789"
  And guardo el cambio
  Then la nota se guarda junto al cambio de estado
  And es visible en el historial de cambios
  And el cliente ve la nota en el email de notificación
```

### Tareas técnicas

- [ ] [ORD-32] Implementar lógica de validación de transiciones
- [ ] [ORD-33] Crear tabla de historial de cambios (audit log)
- [ ] [ORD-34] Añadir campo de notas al cambiar estado
- [ ] [ORD-35] Hook lifecycle: Enviar email al guardar
- [ ] [ORD-36] Implementar rollback si falla el email
- [ ] [ORD-37] Tests: Validación de transiciones funciona
- [ ] [ORD-38] Tests: Historial se registra correctamente
- [ ] [ORD-39] Tests: No se puede retroceder estados

**Prioridad:** Alta  
**Estimación:** 5-6 horas

---

## Notas Técnicas Adicionales

### Modelo de datos Order en Strapi:

```typescript
interface Order {
  id: number
  orderNumber: string // ORD-1763064732-F
  status: OrderStatus
  totalAmount: number
  customerEmail: string
  customerName: string
  stripePaymentIntentId: string
  items: OrderItem[]
  shippingAddress?: Address
  createdAt: Date
  updatedAt: Date
  statusHistory: StatusChange[]
}

enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

interface StatusChange {
  from: OrderStatus
  to: OrderStatus
  changedAt: Date
  changedBy: string // admin email
  note?: string
}
```

### Flujo de gestión de pedidos:

```
1. Pago exitoso (EPIC 14) → Crear orden (estado: Pending)
2. Admin ve nuevo pedido en Strapi
3. Admin cambia a "Processing" → Email al cliente
4. Admin prepara el pedido físicamente
5. Admin cambia a "Shipped" → Email con tracking (futuro)
6. Cliente recibe el reloj
7. Admin cambia a "Delivered" → Email de confirmación
```

### Dependencias:

- Sistema de autenticación (usuarios y roles)
- Content type Order ya creado (EPIC 14)
- Servicio de email (Resend, SendGrid, o similar)
- Variables de entorno:
  - `EMAIL_SERVICE_API_KEY`
  - `FROM_EMAIL`

### Casos edge a considerar:

- Admin cambia estado mientras cliente está viendo el detalle
- Fallo al enviar email (debe registrarse el cambio igual)
- Múltiples admins modificando el mismo pedido
- Cliente solicita cancelación de pedido ya enviado
- Pedido sin stock al intentar prepararlo

---

## Métricas de Éxito

- ✅ Tiempo promedio de gestión por pedido < 5 minutos
- ✅ 100% de cambios de estado generan email
- ✅ < 2% de pedidos requieren soporte por confusión de estado
- ✅ Cliente puede ver estado en < 3 clicks desde login
- ✅ Coverage de tests > 80% en módulo de orders

---

## Próximos EPICs (después del 15)

- **EPIC 16:** Sistema de cancelaciones y reembolsos
- **EPIC 17:** Gestión de envíos e integración con transportistas
- **EPIC 18:** Dashboard de analytics de pedidos

## Deuda Técnica

  Esta sección documenta deuda técnica identificada durante el desarrollo que debe abordarse antes de producción o en iteraciones futuras.

  ## [TECH-DEBT-001] Reparar tests fallidos del frontend

  **Tipo:** Deuda Técnica
  **Prioridad:** Media
  **Severidad:** Baja (no bloquea UX)
  **Sprint:** Post-MVP

  ### Contexto

  Durante el desarrollo del MVP se acumularon tests fallidos que no fueron priorizados para mantener el ritmo de entrega de features. Los tests no bloquean funcionalidad pero reducen la confianza en el suite de pruebas.

  ### Estado Actual (2026-01-19)

  | Métrica | Valor |
  |---------|-------|
  | Test Files Failed | 10 |
  | Tests Failed | 73 |
  | Tests Passed | 561 |
  | Tests Skipped | 11 |
  | **Tasa de Éxito** | **86.9%** |

  ### Impacto

  - CI/CD muestra warnings en cada build
  - Nuevos desarrolladores pueden confundirse con tests rotos
  - Dificulta identificar regresiones reales
  - Métricas de cobertura no son confiables

  ### Criterios de Aceptación

  ```gherkin
  Scenario: Todos los tests pasan
    Given ejecuto npm run test
    Then 0 tests fallan
    And la cobertura es >= 80%

  Scenario: Tests skipped son revisados
    Given hay 11 tests skipped
    When los reviso
    Then los reactivo si son válidos
    Or los elimino si son obsoletos

  Tareas

  - Ejecutar npm run test y documentar errores específicos
  - Categorizar fallos (mocks desactualizados, cambios de API, snapshots)
  - Reparar tests por archivo, empezando por los más críticos
  - Revisar tests skipped y decidir su destino
  - Verificar cobertura final >= 80%
  - Configurar CI para fallar si hay tests rotos

  Notas

  - Creado como resultado de priorizar features sobre tests en fase MVP
  - No afecta usuarios finales actualmente
  - Abordar antes de añadir nuevos features significativos

  Estimación: 4-6 horas
  Asignado: Por definir

  ---