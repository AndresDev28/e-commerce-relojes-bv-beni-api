# [ORD-26] Configuración de Vista de Orders en Strapi Admin

Esta guía documenta cómo configurar la vista de listado de Orders en el panel de administración de Strapi.

## Columnas Requeridas

Según los requerimientos del proyecto, la vista de listado de Orders debe mostrar:

| Columna | Campo Strapi | Formato Esperado |
|---------|--------------|------------------|
| Número | `orderId` | ORD-1763064732-F |
| Cliente | `user` (relación) | nombre + email |
| Fecha | `createdAt` | 22/11/2025 14:30 |
| Total | `total` | 259,89 € |
| Estado | `orderStatus` | Badge con color |

## Configuración Paso a Paso

### 1. Acceder a la Configuración de Vista

1. Inicia sesión en el panel de administración de Strapi
2. Navega a **Content Manager** > **Orders**
3. Haz clic en el icono de **engranaje (⚙️)** en la esquina superior derecha
4. Selecciona **"Configure the view"**

### 2. Configurar Columnas del Listado

En la sección "List view", configura las siguientes columnas en este orden:

1. **orderId** (Número de Pedido)
   - Habilitado: ✅
   - Ordenable: ✅
   - Label: "Número"

2. **user** (Cliente)
   - Habilitado: ✅
   - Ordenable: ❌
   - Label: "Cliente"
   - Nota: Mostrará el campo principal del usuario (email por defecto)

3. **createdAt** (Fecha)
   - Habilitado: ✅
   - Ordenable: ✅
   - Label: "Fecha"

4. **total** (Total)
   - Habilitado: ✅
   - Ordenable: ✅
   - Label: "Total"

5. **orderStatus** (Estado)
   - Habilitado: ✅
   - Ordenable: ✅
   - Label: "Estado"

### 3. Guardar Configuración

1. Haz clic en **"Save"** para guardar la configuración
2. La configuración se aplicará permanentemente para todos los usuarios admin

## Estados de Pedido y Colores

Los estados disponibles y sus significados:

| Estado | Color Sugerido | Significado |
|--------|----------------|-------------|
| `pending` | Gris | Pedido creado, pendiente de pago |
| `paid` | Azul | Pago confirmado |
| `processing` | Amarillo | En preparación |
| `shipped` | Naranja | Enviado |
| `delivered` | Verde | Entregado |
| `cancelled` | Rojo | Cancelado |
| `refunded` | Morado | Reembolsado |

> **Nota**: Los colores de los badges en Strapi Admin son automáticos basados en el valor del enum. Para personalización avanzada de colores, se requiere extensión del admin panel.

## Filtros Recomendados

Para facilitar la gestión de pedidos, configura los siguientes filtros:

- **orderStatus**: Permite filtrar por estado del pedido
- **createdAt**: Permite filtrar por rango de fechas
- **user**: Permite buscar por cliente

## Ordenamiento Por Defecto

Se recomienda ordenar por `createdAt` descendente para mostrar los pedidos más recientes primero.

## Permisos Requeridos

Para configurar la vista, el usuario admin necesita el permiso:
- **Roles > Plugins - Content Manager > Configure view**

---

**Ticket**: ORD-26
**Epic**: EPIC-15 - Gestión de Pedidos Post-Pago
**Última actualización**: 2025-01-21
