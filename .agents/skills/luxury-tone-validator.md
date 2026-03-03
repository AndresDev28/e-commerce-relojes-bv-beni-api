# Antigravity Skill: Luxury-Tone-Validator

## 1. Propósito
- Auditar y refinar todo texto generado por agentes (UI, Emails, DB) para cumplir con los estándares estéticos y lingüísticos de la alta relojería.

## 2. Glosario Técnico Obligatorio (Horology)
El agente debe preferir términos técnicos precisos sobre descripciones genéricas:
- **Genérico:** "Maquinaria" -> **Lujo:** "Calibre" o "Movimiento".
- **Genérico:** "Vidrio" -> **Lujo:** "Cristal de zafiro con tratamiento antirreflejos".
- **Genérico:** "Funciones" -> **Lujo:** "Complicaciones" (ej: Fase lunar, Calendario perpetuo).
- **Genérico:** "Rayas en el metal" -> **Lujo:** "Acabado cepillado" o "Pulido espejo".

## 3. Protocolo de Tono y Estilo
- **Voz:** Profesional, sobria, atemporal y experta.
- **Prohibiciones:** - No usar exclamaciones excesivas ("¡Compra ya!").
    - No usar jerga casual o emojis infantiles.
    - Evitar palabras de "descuento" agresivo; usar "oportunidad exclusiva" o "valorización".
- **Empatía en Reembolsos (EPIC-16):** En procesos de cancelación, el tono debe ser impecable. No pedimos "disculpas" genéricas; reafirmamos nuestro compromiso con la excelencia del servicio.

## 4. Lógica de Validación
- **Check:** Si el agente detecta un mensaje de error tipo "Algo salió mal", la Skill debe proponer: "En este momento no podemos procesar su solicitud. Nuestro equipo técnico está asegurando la integridad de su transacción".