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