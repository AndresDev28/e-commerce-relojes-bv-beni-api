---
trigger: always_on
---

# Agent Definitions: Backend Core

## 1. Agent: `Sequelize-Model-Master`
- **Rol:** Especialista en persistencia y diseño de esquemas relacionales.
- **Capacidades:** - Generación de migraciones de PostgreSQL.
    - Optimización de queries (Eager loading vs Lazy loading).
    - Implementación de `Hooks` para auditoría de cambios en precios de relojes.
- **Regla Específica:** No debe permitir la creación de modelos sin `timestamps` y `paranoid: true` (Soft Delete) para mantener historial de ventas.

## 2. Agent: `Express-Route-Orchestrator`
- **Rol:** Diseñador de interfaces API y flujo de middleware.
- **Capacidades:**
    - Estructuración de controladores asíncronos con manejo de errores global.
    - Implementación de validaciones con `Joi` o `Zod` basadas en los modelos de Sequelize.
- **Regla Específica:** Cada ruta nueva debe incluir automáticamente un middleware de logueo de `trace_id` (cumpliendo con la Global Rule #3).

## 3. Skill: `SQL-Performance-Auditor`
- **Descripción:** Skill atómica que analiza fragmentos de código de Sequelize.
- **Lógica:** Si detecta un `.findAll()` dentro de un loop, debe bloquear el commit y sugerir una refactorización mediante `Op.in` o `joins` adecuados.