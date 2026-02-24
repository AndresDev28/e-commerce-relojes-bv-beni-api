# Antigravity Skill: Security-OWASP-Auditor

## 1. Propósito
- Auditar cambios en el código frente a vulnerabilidades críticas de OWASP.

## 2. Puntos de Control (Checklist)
- **A01: Broken Access Control:** Verificar que las rutas de `express` tengan middleware de autenticación (JWT).
- **A03: Injection:** Asegurar que las consultas de `Sequelize` usen bind variables y no concatenación de strings.
- **A04: Insecure Design:** Validar que los datos sensibles (PII) sigan la **Global Rule #2**.
- **A07: Identification and Authentication Failures:** Revisar que las cookies/tokens no se expongan en logs.

## 3. Acciones
- Si se detecta un riesgo alto, la Skill debe emitir un "Security Alert" y bloquear el progreso del workflow.