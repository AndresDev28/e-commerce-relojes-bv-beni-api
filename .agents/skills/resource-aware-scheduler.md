# Antigravity Skill: Resource-Aware-Scheduler

## 1. Propósito
- Gestionar proactivamente la carga de trabajo de los agentes para evitar el estrangulamiento térmico y el desbordamiento de RAM en hardware i7-HX.

## 2. Contrato de Entrada (Thresholds)
- **RAM_MAX_THRESHOLD:** 82%
- **CPU_CORES_RESERVED:** 4 (P-Cores para el Sistema Operativo/IDE)
- **CONCURRENCY_LIMIT:** 2 Workers (Sincronizado con `test:ag`)

## 3. Protocolo de Ejecución (Pre-Flight Check)
Antes de ejecutar cualquier comando marcado como `RESOURCE_INTENSIVE` (Tests, Builds, Refactors masivos), el agente DEBE:
1. **Sensing:** Consultar la telemetría del sistema (Uso de RAM y CPU actual).
2. **Decision Tree:**
    - SI `RAM > 82%`: Abortar ejecución y notificar al usuario: "Sistema bajo estrés. Liberando memoria antes de proceder".
    - SI `RAM < 82%`: Proceder utilizando exclusivamente el script `npm run test:ag`.
3. **Queueing:** Si hay más de 2 agentes intentando escribir archivos simultáneamente, establecer una cola de prioridad.

## 4. Manejo de Lag (Anti-Freeze)
- Si el agente detecta una latencia de respuesta superior a 3 segundos en el IDE, debe pausar inmediatamente los procesos de fondo de `vitest` o `next dev` hasta recuperar la fluidez.