---
trigger: always_on
---

# Antigravity Workspace Rules: BV Beni Watch Store

## 1. Contexto del Ecosistema
- Este workspace comprende un sistema desacoplado: Backend (Node/Express/Sequelize) y Frontend (React).
- El objetivo es la comercialización de relojes de alta gama, donde la precisión de los datos y la estética visual son críticas.

## 2. Contrato de Integración (Front-Back)
- **Single Source of Truth:** Los agentes deben considerar los modelos de Sequelize en el Backend como la única fuente de verdad para las estructuras de datos. Cualquier interfaz de TypeScript en el Frontend debe derivarse de estos modelos.
- **Protocolo de API:** Se prohíbe el uso de mocks en producción. Los agentes de Frontend deben interactuar con los endpoints reales definidos en el `Route-Orchestrator` del Backend.
- **Sincronización de Precios:** Cualquier lógica de descuento o impuestos debe ejecutarse en el Backend. El Frontend solo tiene permitido formatear y mostrar estos valores.

## 3. Workflow de Sincronización
- Cuando se modifique un modelo en el repositorio `e-commerce-relojes-bv-beni-api`, el agente encargado debe notificar la necesidad de actualizar los tipos o servicios en el repositorio `e-commerce-relojes-bv-beni`.
- **Validación Cruzada:** No se permite un commit en el Backend que rompa un contrato de datos consumido por el Frontend sin antes proponer la refactorización correspondiente en ambos lados.

## 4. Gestión de Activos (Relojes)
- Los agentes deben asegurar que las imágenes de los productos (relojes) se gestionen mediante URLs consistentes y que el Frontend implemente "Lazy Loading" para no penalizar la performance de la galería.

## 5. Prioridad de Resolución
- En caso de conflicto entre una regla de este archivo y las `global.rules`, prevalecen las `global.rules`.
- En caso de conflicto entre este archivo y las reglas específicas de un sub-directorio (ej. `.antigravity/rules/frontend.md`), prevalecen estas **Workspace Rules** para asegurar la integridad del sistema completo.

## 6. Política de Branching y Protección de Main
- **Prohibición de Commits Directos:** Queda terminantemente prohibido que cualquier agente realice commits o pushes directos a la rama `main` o `master` en cualquiera de los dos repositorios.
- **Creación Obligatoria de Branch:** Para cada nuevo ticket, feature o corrección de error, el agente debe:
    1. Crear una rama nueva siguiendo el formato: `{tipo}/{ticket-id}-{descripcion-breve}`.
       - Ejemplos: `feat/BV-102-auth-service`, `fix/BV-05-gallery-styles`, `refactor/BV-88-sequelize-hooks`.
    2. Verificar que la rama base siempre sea la versión más reciente de `main`.
- **Validación de Agente a Agente:** Antes de proponer un merge a `main`, el agente del repositorio correspondiente debe ejecutar un "Self-Audit" confirmando que:
    - No hay secretos expuestos (Global Rule #2).
    - Los tests (si existen) pasan.
    - El contrato de integración no se ha roto (Workspace Rule #2).
- **Flujo de Trabajo:** El agente solo puede solicitar la integración mediante un Pull Request, dejando un resumen técnico de los cambios para la revisión humana.

## 7. Protocolo de Branching Basado en Tickets (Linear Standard)

- **Aislamiento Obligatorio:** Queda terminantemente prohibido realizar cambios directamente en `main`. Todo trabajo debe nacer de un ticket identificado en el backlog.
- **Nomenclatura de Ramas:** Los agentes deben generar el nombre de la rama siguiendo estrictamente el formato de tus tickets de EPIC:
  `{categoría}/{ID-TICKET}-{descripción-breve-slug}`

  **Reglas de Mapeo de Categoría:**
  1. Si el ticket tiene la etiqueta o label `frontend`, la rama debe colgar de `frontend/`.
  2. Si el ticket tiene la etiqueta o label `backend`, la rama debe colgar de `backend/`.

  **Ejemplos de ejecución esperada:**
  - Ticket: `[FRONT-01] Botón "Solicitar cancelación" en detalle del pedido`, label `frontend`
    -> Branch: `frontend/FRONT-01-boton-cancelacion-detalle`
  - Ticket: `[REF-10] Configurar webhook de Stripe para confirmar reembolsos`, label `backend`
    -> Branch: `backend/REF-10-webhook-stripe-reembolsos`

- **Sincronización de Contexto:** - Si un agente está trabajando en una rama `frontend/FRONT-XX`, tiene permiso para consultar (Read-Only) la rama `main` del backend para asegurar la compatibilidad del contrato de API.
  - Al finalizar la tarea, el agente debe generar un Pull Request (PR) y NO intentar un merge automático.