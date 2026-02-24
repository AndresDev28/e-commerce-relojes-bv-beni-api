# Antigravity Skill: Semantic-Commit-Generator (v2.0)

## 1. Propósito
- Generar mensajes de commit de alta calidad industrial utilizando separadores semánticos (whitespace) en lugar de etiquetas literales y siempre en inglés.

## 2. Estándar de Formato (Estructura de Salida)
El agente debe producir el commit exactamente así:

<tipo>(<scope>): [<TICKET-ID>] <descripción corta en presente>

- **Motivación:** <explicación breve del porqué>
- **Técnica:** <detalle técnico relevante/cambios en DB/hooks>
- **Impacto:** <módulos afectados/cambio de comportamiento>

Refs: #<TICKET-ID>
TraceID: {trace_id}
Breaking Changes: <None o detalle del cambio>