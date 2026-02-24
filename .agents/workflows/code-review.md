---
description: 
---

# Antigravity Workflow: PR-Quality-Gate

## 1. Disparador (Trigger)
- El agente solicita un Pull Request desde una rama `frontend/*` o `backend/*` hacia `main`.

## 2. Pasos del Proceso
1.  **Validación Técnica (QA):**
    - El agente ejecuta la suite de tests (TDD) asociada al ID del ticket (ej: `REF-14`).
    - **Condición:** Si los tests fallan, el workflow se detiene.
2.  **Auditoría de Seguridad (OWASP):**
    - Se invoca la Skill `Security-OWASP-Auditor`.
    - Se verifica el cumplimiento estricto de la **Global Rule #2** (Enmascaramiento de PII).
3.  **Verificación de Contrato:**
    - Se asegura que los cambios en el Backend no rompan las interfaces del Frontend (Workspace Rule #2).
4.  **Generación de Reporte:**
    - El agente publica un comentario en el PR con el resumen: "Tests ✅ | OWASP Security ✅ | TraceID: {trace_id}".

## 3. Resolución
- **Aprobación Automática:** Solo si el riesgo es bajo y todos los tests pasan.
- **Revisión Humana Requerida:** Si hay alertas de seguridad o cambios críticos en la lógica de cobro (Stripe).