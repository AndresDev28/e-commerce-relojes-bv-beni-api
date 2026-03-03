# Antigravity Skill: Bridge-Schema-Validator

## 1. Propósito
- Garantizar la paridad total entre los esquemas de datos del Backend y las interfaces del Frontend.

## 2. Lógica de Sincronización
Cuando un agente trabaje en un ticket `REF` (Backend) que modifique un modelo:
1. **Export:** Generar una definición JSON del nuevo esquema.
2. **Compare:** Buscar en el repositorio hermano (`e-commerce-relojes-bv-beni`) los archivos en `src/types/` o `src/api/`.
3. **Validate:** Comprobar si los cambios son "Breaking Changes" (ej: cambio de `string` a `number`).
4. **Action:** - SI es compatible: Actualizar automáticamente el archivo de tipos en el Frontend.
   - SI es Breaking: Detener el proceso y exigir la creación de un ticket `FRONT` para adaptar la UI.

## 3. Estándar de Tipado
- Todas las interfaces generadas deben ser `Readonly` para asegurar la inmutabilidad en el flujo de React.