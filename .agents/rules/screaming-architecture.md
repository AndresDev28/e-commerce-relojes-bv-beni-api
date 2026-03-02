# Antigravity Workspace Rule: Pragmatic Screaming Architecture Standard

## 1. Principio fundamental
El código debe estructurarse para que un nuevo desarrollador entienda el DOMINIO DEL NEGOCIO (Catálogo, Checkout, Envíos, Pagos) antes que la tecnología subyacente. Sin embargo, respetaremos las convenciones obligatorias de los frameworks (Next.js y Strapi).

## 2. Aplicación en Frontend (Next.js - E-commerce)
Se adopta una arquitectura basada en **Features (Vertical Slices)**.
- **Rutas (`src/app/`)**: Solo contienen la capa de *Delivery* HTTP (UI de página, layous y metadatos). Son lo más delgadas posible.
- **Dominios (`src/features/`)**: Aquí "grita" la arquitectura. Carpetas como `cart/`, `checkout/`, `catalog/`, `orders/`.
  - Cada *feature* expone su propia API pública (`index.ts`) y oculta su implementación oculta internamente (`components`, `hooks`, `services`, `utils`).
  - Las features NO deben importar componentes de otras features de forma circular.
- **Core Compartido (`src/shared/` o `src/core/`)**: UI genérica (botones, modales), utilidades matemáticas o configuraciones globales.

## 3. Aplicación en Backend (Strapi - API)
Strapi ya divide por entidades (`src/api/[entidad]`). La arquitectura limpia se aplica en la separación de responsabilidades:
- **Delivery (`controllers` / `routes`)**: Solo validan la request y llaman al Use Case (Service). NO tienen lógica de negocio.
- **Infrastructure (`lifecycles` / `middlewares`)**: Reaccionan a eventos de la DB o interceptan HTTP.
- **Use Cases (`services`)**: Contienen la orquestación. Si un Use Case es complejo (ej. `process-refund`), debe extraerse a su propio archivo de servicio aislado, no amontonarse en un archivo gigante.
- **Domain Puro (`src/core/domain/`)**: [NUEVO] Carpeta para interfaces TypeScript, constantes de negocio (ej. Estados de Orden permitidos) y funciones puras de cálculo (ej. impuestos) independientes de la DB de Strapi.

## 4. Agente: Screaming-Architect-Sentinel
- **Misión**: Actuar como el Guardián del Dominio.
- **Autoridad restrictiva**: Tiene el poder de bloquear refactorizaciones o nuevos features si detecta que se está añadiendo código espagueti a directores técnicos globales, forzando la extracción hacia la carpeta de la Feature correspondiente.
