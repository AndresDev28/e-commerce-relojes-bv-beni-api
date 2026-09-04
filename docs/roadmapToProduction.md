# 🚀 Roadmap to Production - E-commerce Relojes BV Beni

> ## ⚠️ MIRRORED FILE — DO NOT EDIT HERE
>
> **Source of truth:** [`e-commerce-relojes-bv-beni/docs/roadmapToProduction.md`](https://github.com/AndresDev28/e-commerce-relojes-bv-beni/blob/main/docs/roadmapToProduction.md)
>
> This file is a **manual mirror** of the canonical roadmap maintained in the frontend repository.
>
> ### Why this exists
>
> The roadmap tracks cross-repo work (Strapi backend + Next.js frontend), so both repos need to read it. To avoid drift while keeping the source of truth unambiguous, this copy is regenerated whenever the source changes.
>
> ### Sync contract
>
> - **Edit only in the frontend repo.** Any change to the roadmap goes there first.
> - **Re-mirror manually** after every edit to the source. Typical workflow: edit in front → `cp` to back → commit in both repos with a coordinated message (e.g. `docs: mirror roadmap sprint-5 update`).
> - **CI optional:** if you want, we can add a GitHub Action that fails when the two files diverge (hash comparison). Not enabled by default to keep the workflow simple.
>
> ### When this mirror is acceptable to fall behind
>
> - The Sprint 5 section (Stripe Hardening) is the only block currently diverging in relevance per repo. Even there, treat the front copy as canonical.
> - Repo-specific execution details (PR numbers, file paths) appear in the source.
>
> ---


**Última actualización:** 4 Septiembre 2026
**Estado actual:** EPIC 17 + 17b + 18 + DEBT-LOGIN-REDIRECT + DEBT-02 + TEST-INFRA-VITEST + TEST-INFRA-E2E + Sprint 4 ✅ + Sprint 5 🛠️ EN CURSO (Stripe Payments Hardening, cross-repo)
**Objetivo:** Lanzamiento 14 Abril 2026 (objetivo original, revisado en iteraciones)

---

## 📊 Estado Actual

### ✅ Completado hasta ahora:

**EPIC 15: Sistema de Gestión de Pedidos**
- ✅ UI completa de historial de pedidos
- ✅ Backend Strapi con modelos y relaciones
- ✅ Sistema de estados (pending, paid, processing, shipped, delivered, cancelled)
- ✅ Lifecycle hooks automáticos
- ✅ Notificaciones por email (Resend + React Email)
- ✅ Panel admin básico

**EPIC 16: Sistema de Cancelaciones y Reembolsos**
- ✅ Modelo de cancelación en Strapi
- ✅ Workflow de aprobación admin
- ✅ Validación 24 horas para cancelar
- ✅ Integración Stripe para reembolsos automáticos
- ✅ Emails de notificación (solicitado, aprobado, rechazado)
- ✅ UI cliente y admin

**EPIC 17: Sistema de Envíos y Tracking**
- ✅ Content-type Shipment en Strapi con relación a Order
- ✅ Lifecycle hooks: auto-crear Shipment al pasar Order a "shipped"
- ✅ Transición automática Order→delivered / Order→processing (failed)
- ✅ Emails de envío: "pedido enviado", "pedido entregado", "fallo en envío"
- ✅ Tests de integración para lifecycles y modelo Shipment
- ✅ Campo `shipmentStatus` (renombrado por conflicto con campo reservado Strapi v5)

**EPIC 17b: Hardening y Seguridad**
- ✅ Rate limiting en APIs críticas (middleware Edge Runtime)
- ✅ Headers de seguridad (CSP, HSTS, X-Frame-Options, X-XSS-Protection)
- ✅ Banner de consentimiento de cookies (granular: esenciales vs analytics)
- ✅ Páginas legales: Política de privacidad, Política de cookies
- ✅ Auditoría de secrets y `.env` en `.gitignore`
- ✅ Enmascaramiento de PII en logs (`maskPII.ts`)
- ✅ Tests: rate limiting, headers y compliance GDPR

**EPIC 18: Testing y Integración E2E (QA)**
- ✅ Suite Playwright configurada para Chromium y Firefox
- ✅ Happy path completo: registro → carrito → checkout → success
- ✅ Mobile Testing: checkout verificado en viewport de iPhone 13
- ✅ Verificación de estados vacíos (cesta y pedidos)
- ✅ Manejo de errores de API y fallos de pago
- ✅ Seguimiento y cancelación de pedidos verificado
- ✅ Cobertura de flujos críticos al 100% en navegadores compatibles

### 🐛 Deuda técnica resuelta (post-EPIC 18)

**DEBT-LOGIN-REDIRECT: Honor `?redirect=` query param en `/login` y `/registro`** (PR #100 → release 1.4.3, commit `52a97f2`)
- ✅ Helper `sanitizeRedirect()` con protección open-redirect + auth-page loop prevention
- ✅ `AuthContext.login()`/`register()` aceptan `redirectTo?` opcional (backward compatible)
- ✅ LoginForm y RegisterForm leen `?redirect=` envueltos en `<Suspense>` (Next.js 15 App Router)
- ✅ 7 work-unit commits + hotfix C8 (Suspense boundary para `useSearchParams` bailout)
- ✅ 33/33 tests Vitest scoped · Playwright 4/4 (Chromium + Firefox) · manual QA 8/8
- ✅ Sanitización: rechaza `//`, `/\\`, schemes (`http:`, `javascript:`, `data:`); primer segmento `login` o `registro` → default `/mi-cuenta`

**DEBT-02: Generar `?redirect=` en `/checkout` y `/carrito`** (branch `frontend/DEBT-02-checkout-carrito-redirect`)
- ✅ Los auth guards de `/checkout` y `/carrito` emiten `/login?redirect=` + `encodeURIComponent(usePathname())` (espejo del patrón de Favoritos)
- ✅ Cierra el retrofit de generación diferido en DEBT-LOGIN-REDIRECT (release 1.4.3 solo entregó el lado consume)
- ✅ Tests Vitest: checkout 6/6 · carrito 2/2 (suite nueva) · sin regresiones vs baseline
- ⚠️ Limpieza futura (Q2): `src/app/mi-cuenta/pedidos/[orderId]/page.tsx:28` aún usa `redirect` hardcoded — fuera de alcance, pendiente de retrofit

**TEST-INFRA-VITEST: Arreglar 21 fallos pre-existentes de Vitest (CartContext + CookieBanner)** (PR #106 → release 1.5.1, commit `e9e662e`)
- ✅ Reemplazo del polyfill roto de `localStorage` en `vitest.setup.ts` (truthy-guard contra `window.localStorage` empty stub de jsdom@27)
- ✅ Singleton WHATWG `Storage` instalado en `globalThis.localStorage` y `window.localStorage` vía `Object.defineProperty`
- ✅ Strict TDD: RED baseline (`localStorage.clear is not a function` ×21) → GREEN (21/21) → SWEEP (949/949 unit + 20/20 storybook + 9/9 integration + tsc + eslint)
- ✅ 1 archivo modificado (`vitest.setup.ts`, +40/-6), 0 cambios production code
- ✅ Cap delta: 0 (test-infra only)

**TEST-INFRA-E2E: Self-contained Playwright suite (parcial — 22 → 14 events)** (PR #108 → release 1.5.2, commit `59d197b`)
- ✅ C1 — baseURL `:1355` unreachable arreglado (cambio a `:3000` en `playwright.config.ts:21`); 14 events cerrados (16 → 2)
- ✅ SUG-1 — `webServer` block activado (`reuseExistingServer: !process.env.CI`); suite auto-bootstrapping
- ✅ C2 — Strapi mock orquestado en webServer array (entry 2, readiness `/health`); 6 events cerrados (6 → 0)
- ⚠️ **Refinamiento CSP**: design original decía `:1338` para el mock; `next.config.ts` `connect-src` whitelists solo `:1337`. Fix in-scope: `MOCK_STRAPI_PORT=1337` (el mock ya leía esa env var). Sin cambios production code, sin spec edits.
- ⚠️ **C3 (legacy-auth) descubierto**: 7 specs (cancellation-flow, checkout-happy-path, checkout-mobile, empty-states, order-tracking, payment-errors, +1) mockean auth vieja (`localStorage.jwt` + `/api/users/me`); la app migró a cookie-session `/api/auth/session`. Estos 14 events (7 × 2 browsers) NO son regresiones — estaban masked bajo C1 en el explore inicial. Patrón fix: template `uxw01-regression-sweep.spec.ts` (ya modernizado).
- ✅ Verdict verify: 10/10 spec scenarios COMPLIANT, 0 regresiones, 1 UNTESTED (S5.3 integration sin Strapi real)
- ✅ 1 archivo modificado (`playwright.config.ts`, +28/-7 net), 0 cambios production code, 2 commits work-unit (`87af90f` + `5c7ca91`)
- ✅ Cap delta: 0 (test-infra only)

**Hygiene: Persistir openspec artifacts de DEBT-LOGIN-REDIRECT** (PR #110, branch `chore/persist-debt-login-redirect-artifacts`, 488fdd2)
- ✅ Cierra el followup F4 del archive-report de TEST-INFRA-E2E
- ✅ 7 archivos añadidos: `openspec/changes/archive/2026-08-11-DEBT-LOGIN-REDIRECT-honor-redirect-query-param/` (archive-report, design, exploration, proposal, tasks, verify-report) + `openspec/specs/login-redirect/spec.md`
- ✅ 967 inserciones, 0 production code touched, 0 test code touched
- ✅ Cap delta: 0 (hygiene only)

### 🐛 Sprint 4 — Cierres recientes (post-18 Agosto 2026)

**BUG-CART-PERSISTENCE** 🔴 CRITICAL (business) (PR #114 → release 1.5.4, commit `5b06371`)
- ✅ Items del carrito persisten a través de logout/login vía per-user localStorage key (`bv-beni-cart:<userId>`)
- ✅ Removido `clearCart()` del bloque `finally` de `AuthContext.logout()`
- ✅ Migración one-shot desde la key legacy `bv-beni-cart`
- ✅ Guest→login merge con max-quantity (helper `mergeGuestCartInto`)
- ✅ 7 RED tests en `src/__tests__/context/CartContext.test.tsx` (Vitest + Testing Library)
- ✅ User smoke: 13/08/2026 refutado post-fix

**BUG-FAVORITES-400 (H1)** 🟡 HIGH (UX) (PR #116 → release 1.5.5, commit `0a1e7ab`)
- ✅ Fix canonicalización de favorite IDs a `string` previene el 400 post-login en `/api/favorites`
- ✅ Coerciones defensivas `String()` en `useFavoritesApi`/`FavoritesContext`/`updateFavoritesService`
- ✅ Egreso de IDs en `String(f.id)` desde el `useEffect` que dispara el re-fetch on `[user, fetchFavorites]`
- ✅ 9 RED tests en `src/__tests__/context/FavoritesContext.test.tsx` y friends
- ✅ User smoke: 21/08/2026 end-to-end validado contra Strapi real

**BUG-FAVORITES-IMAGES-401 (H2 follow-up)** 🟡 HIGH (UX) (PR #118 → release 1.5.6, commit `36c1763`, cycle SDD `bug-favorites-images-401` en engram #1666-#1675)
- ✅ Query Strapi: `populate[favorites][populate]=image` (singular; bypass del middleware del Product controller por la ruta del plugin `users-permissions`)
- ✅ `normalizeFavorite.ts`: nueva helper `extractFavoriteImages` (dual-key `images ?? image ?? null`, `{id,url}` → `${NEXT_PUBLIC_STRAPI_API_URL}${url}`)
- ✅ `href` derivado de `slug` (fix de 404 en `/tienda/${id}` descubierto durante smoke)
- ✅ CI fix: `API_URL` (de `@/lib/constants`) primero en la cadena de fallback → `vi.mock('@/lib/constants')` toma efecto en CI sin `.env.local`
- ✅ 1 requirement ADDED al spec canónico `openspec/specs/favorites/spec.md` (4 Given/When/Then scenarios)
- ✅ 1011/1011 vitest pass; tsc/lint exit 0; NO AI co-author
- ✅ User smoke: 21/08/2026 — imágenes hidratan en /favoritos pre y post re-login; click navega a `/tienda/<slug>` sin 404

**BUG-IMAGES-400** 🟡 MEDIUM (UX) — FRONT (PRs #121 + #123 → releases 1.5.7 + 1.5.8, commits `3b35638` + `cfd5148`) + BACKEND cross-repo (PR #32 → `88df294`, cycle SDD `bug-images-400-backend` en engram #1696-#1721)
- ✅ Frontend: helper `normalizeImageUrl` con API_URL-first chain (per #1677) en `src/lib/images/url.ts`; `SafeImage` derived-state wrapper con `onError` placeholder swap; additive `remotePatterns` para `localhost:1337` + `relojes-bv-beni-api.onrender.com` (producción confirmado vía CSP `next.config.ts:6`)
- ✅ Backend (cross-repo C5.S1): lifecycle hooks en `plugin::upload.file` (`afterCreate`, `afterUpdate`, `afterFindOne`, `afterFindMany` — split Strapi 5) que rewrite URLs relativas a absolutas usando `STRAPI_PUBLIC_URL`; Cloudinary URLs pasan byte-identical (early return)
- ✅ Frontend 2 PRs chained stacked-to-main (329 + 412 líneas netas); size exception aprobada para PR2 (+3% over 400 budget, maintainer-approved)
- ✅ 1042/1042 unit + 3/3 integration + 28/29 e2e tests pasan; lint/tsc exit 0; 30/30 spec scenarios PASS (1 N/A: cross-repo declared)
- ⚠️ **Action item operator (post-merge)**: setear `STRAPI_PUBLIC_URL=https://relojes-bv-beni-api.onrender.com` en Render — el frontend ya shipped con helper defensivo (degraded fallback), pero el WARN-once queda activo hasta setear la env var
- ✅ User verification: integration test (`image-allowlist.test.ts`) spawned `next dev` real y confirmó allowlisted hosts ≠ 400; e2e chromium cubrió flujos con imágenes (catalog detail, gallery, checkout, favorites)

**TEST-INFRA-E2E-LEGACY-AUTH** 🟡 MEDIUM (deuda e2e pre-existente) (PR #111 → release 1.5.3, commit `74cdce3`)
- ✅ 7 specs modernizadas de `localStorage.jwt` + `/api/users/me` (legacy auth) a `/api/auth/session` (cookie-session)
- ✅ Specs afectados: `cancellation-flow.spec.ts`, `checkout-happy-path.spec.ts`, `checkout-mobile.spec.ts`, `empty-states.spec.ts`, `order-tracking.spec.ts`, `payment-errors.spec.ts`, +1
- ✅ Plantilla aplicada: `tests/e2e/uxw01-regression-sweep.spec.ts` (ya modernizado en TEST-INFRA-E2E)
- ✅ 14 e2e events cerrados (7 × 2 browsers)
- ✅ Cierra el último followup F del archive-report de TEST-INFRA-E2E

### ✅ Deuda técnica resuelta (post-Sprint 4 — 2 Septiembre 2026)

> Sprint 4 cerrado al 100% (5/5 items) tras el cierre de BUG-IMAGES-400 con su ciclo cross-repo backend. Sin deuda técnica pendiente en este momento.

**Progreso general:** ~228h invertidas de ~240h estimadas (~95%) — Sprint 4 cerrado al 100% (5/5 items). Siguiente foco: Sprint 5 (Stripe Hardening, cross-repo) → SEO setup / Lighthouse audit / operational setup para lanzamiento.

---

### 🛠️ Sprint 5 — Stripe Payments Hardening (cross-repo) — ⏳ EN CURSO

**SPRINT-STRIPE-HARDENING** 🔴 HIGH (negocio) — Auditoría completa del módulo de pagos con Stripe (backend Strapi + frontend Next.js) reveló 8 gaps priorizados. Estimación actual: **~80–85% listo para soft launch**. Cierre de gaps #1, #2 y #4 lleva el módulo a **~95%**.

**Origen:** Auditoría del módulo Stripe el 4 Septiembre 2026, previa a soft launch. Cross-repo por diseño: cambios coordinados entre `e-commerce-relojes-bv-beni-api` (Strapi) y `e-commerce-relojes-bv-beni` (Next.js).

#### Gaps identificados

| # | Prioridad | Gap | Impacto |
|---|---|---|---|
| 1 | 🔴 ALTO | Webhook de Stripe solo maneja `charge.refunded`. NO maneja `payment_intent.succeeded` ni `payment_intent.payment_failed`. El status `paid` lo setea el cliente vía `useCreateOrder` — si el browser se cierra entre el pago y la creación de la orden, no hay reconciliación server-side y el stock queda decrementado fantasma. | Riesgo de pagos huérfanos no detectables |
| 2 | 🔴 ALTO | `paymentIntents.create` no incluye `metadata.orderId` ni `metadata.userId`. Bloquea cualquier reconciliación futura vía webhook (solo se puede buscar por `paymentIntentId`, que se guarda después de crear la orden — circular). | Bloqueante para resolver #1 |
| 3 | 🟡 MEDIO | `useCreateOrder` no tiene retry logic. Si falla POST a `/api/orders` tras pago exitoso, el usuario ve error con instrucción de contactar soporte. El pago quedó cobrado, la orden no quedó guardada, no hay cola ni webhook reconciliador. | Mala UX en fallos de red transitorios |
| 4 | 🟡 MEDIO | `paymentIntents.create` sin `idempotencyKey`. Reintentos de la API route (timeouts, browser retries) pueden crear múltiples PaymentIntents para el mismo carrito. | Riesgo de cobros duplicados |
| 5 | 🟡 MEDIO | Stock se decrementa en `afterCreate` de Order lifecycle, antes de confirmar el pago por Stripe. Sin compensación automática si el pago falla del lado del cliente. | Depende de #1 para resolverse limpio |
| 6 | 🟢 BAJO | Sin cálculo automático de IVA / Stripe Tax. A confirmar con contabilidad si el modelo actual (precios con IVA incluido) es suficiente. | Decisión de negocio |
| 7 | 🟢 BAJO | Sin tests E2E del flujo completo de pago (hay unitarios buenos: `retryHandler`, `errorHandler`, `env-validator`, `security`). | Cobertura de regresión |
| 8 | 🟢 BAJO | `apiVersion: '2026-01-28.clover'` pinned en backend y frontend. OK hoy, pero documentar como ticket de mantenimiento cuando Stripe depreca versiones. | Mantenimiento futuro |

#### Plan de cierre (orden de impacto/costo)

1. **#2** (~10 min) — Agregar `metadata.orderId` y `metadata.userId` en `createPaymentIntentService`. Habilita reconciliación. **Desbloquea #1.**
2. **#1** (~2-3 h) — Implementar handlers `payment_intent.succeeded` y `payment_intent.payment_failed` en `src/api/order/services/stripe-webhook.ts`. Crear/actualizar orden desde el webhook usando metadata. Resuelve #5 de paso.
3. **#4** (~15 min) — `idempotencyKey` determinístico (`cartHash + userId + timestamp-minute`) en `stripe.paymentIntents.create`.
4. **#3** (~1 h) — Retry con backoff en `useCreateOrder` (3 intentos). Defensa en profundidad mientras el webhook del #1 tarda en llegar.
5. **#6** — Confirmar modelo de IVA con contador/a. Decisión de negocio.
6. **#7** (~2-3 h) — Playwright test E2E del happy path con tarjeta `4242 4242 4242 4242`.

#### Alcance cross-repo

**Backend (`e-commerce-relojes-bv-beni-api`):**
- `src/api/order/services/stripe-webhook.ts` — agregar handlers `payment_intent.succeeded` + `payment_intent.payment_failed`
- `src/api/order/content-types/order/lifecycles.ts` — ajustar compensaciones de stock si el webhook reconcilia órdenes
- `test/api/stripe-webhook.test.ts` — nuevos tests para los handlers nuevos

**Frontend (`e-commerce-relojes-bv-beni`):**
- `src/features/checkout/services/createPaymentIntentService.ts` — metadata + idempotencyKey
- `src/features/checkout/hooks/useCreateOrder.ts` — retry con backoff
- `src/lib/stripe/__tests__/` — tests nuevos para los cambios

#### Estado del ciclo

- ⏳ Pendiente apertura de SDD cycle (cuando vos decidas arrancar)
- 📋 Plan listo, decisiones técnicas mayormente tomadas
- 🚧 Sin PRs abiertos aún

**Resultado esperado al cerrar:** Módulo de pagos a ~95% de preparación para soft launch. Resto (~5%) corresponde a #6 (decisión de negocio) y #7 (test E2E, nice-to-have).

---

## 🗺️ Priorización para Lanzamiento

> [!IMPORTANT]
> Se prioriza estabilidad y funcionalidad core sobre features adicionales.
> EPIC 18 (Analytics) y features no esenciales se mueven a v2.0.

| Prioridad | Qué | Por qué |
|---|---|---|
| 🔴 Must | EPIC 17: Envíos (simplificado) | No puedes vender sin enviar |
| 🔴 Must | EPIC 17b: Hardening y Seguridad | Obligatorio para producción en España (GDPR) |
| 🔴 Must | Testing + QA | Estabilidad y confianza |
| 🔴 Must | Setup Producción + DNS | Infraestructura base |
| 🟡 Should | Contenidos + SEO | Crítico para tráfico orgánico |
| 🟡 Should | Soft Launch (7-14 días) | Reduce riesgo |
| 🟢 v2.0 | EPIC 19: Analytics Dashboard | Stripe Dashboard cubre MVP |
| 🟢 v2.0 | API transportistas automática | Manual funciona para MVP |

---

## ✅ EPIC 17: Sistema de Envíos y Tracking (Simplificado MVP) — COMPLETADO

**Objetivo:** Permitir que el admin registre envíos y que los clientes vean el tracking.

> [!NOTE]
> Para MVP: todo es manual. El admin introduce tracking number y cambia estados.
> La integración automática con transportistas queda para v2.0.

### 1. Backend - Modelo de Envío (Strapi)

**Crear estructura:**
- Content-type `Shipment` con relación a `Order`
- Campos: tracking_number, carrier, status, shipped_at, estimated_delivery, actual_delivery
- Estados simplificados: shipped, in_transit, delivered, failed
- Permissions para usuarios autenticados

**Validaciones:**
- Solo pedidos en estado "processing" pueden tener envío
- Tracking number único por pedido

### 2. Lógica de Transiciones

**Lifecycle hooks:**
- Cuando pedido pasa a "shipped" → crear Shipment automáticamente
- Actualizar estado de Order cuando Shipment cambia
- Emails automáticos: "enviado" y "entregado"

**Reglas de negocio:**
- Delivered → Order pasa a "delivered" automáticamente
- Failed delivery → Order vuelve a "processing"
- Tracking updates manuales (admin)

### 3. Frontend - UI de Tracking

**Para Cliente:**
- Sección de tracking dentro de `/mi-cuenta/pedidos/[orderId]`
- Timeline visual simplificado del estado del envío
- Información de transportista + tracking number (con enlace externo)
- Fecha estimada de entrega

**Para Admin (Strapi):**
- Formulario para agregar tracking number y carrier
- Actualización manual de estados desde el panel de Strapi

### 4. Emails de Envío (Esenciales)

**Plantillas MVP:**
- "Tu pedido ha sido enviado" (con tracking number y enlace)
- "Tu pedido ha sido entregado" (confirmación)

### 5. Testing del Sistema de Envíos

**Verificar:**
- Flujo completo: Order → Shipment → Delivered
- Transiciones de estado correctas
- Emails se envían correctamente
- UI muestra información correcta

**Resultado esperado:** Sistema de tracking manual funcional.  
**Estado:** ✅ Completado — 7 Marzo 2026

---

## ✅ EPIC 17b: Hardening y Seguridad — COMPLETADO

**Objetivo:** Asegurar que la aplicación cumple estándares de seguridad para producción.

> [!CAUTION]
> Esta sección es obligatoria antes del lanzamiento. España requiere cumplimiento GDPR/RGPD.

### 1. Rate Limiting

**APIs críticas:**
- Login/Register: máx 5 intentos/minuto
- Checkout/Payment: máx 10 req/minuto
- API general: máx 100 req/minuto por IP

### 2. Validación de Inputs

**Frontend + Backend:**
- Sanitización de inputs en formularios
- Validación de tipos de datos
- Protección contra XSS
- Protección contra SQL injection (Strapi maneja por defecto, verificar custom queries)

### 3. Cookies y GDPR

**Obligatorio en España:**
- Banner de consentimiento de cookies
- Política de privacidad (enlace visible)
- Política de cookies detallada
- Opción de rechazo de cookies no esenciales
- Registro de consentimiento

### 4. Headers de Seguridad

**Configurar:**
- HTTPS forzado everywhere
- CORS restrictivo (solo dominios propios)
- Content-Security-Policy
- X-Frame-Options
- Strict-Transport-Security (HSTS)

### 5. Auditoría de Secrets

**Verificar:**
- Ningún secret en repositorio (`.env` en `.gitignore`)
- Variables de entorno separadas: dev vs production
- API keys con permisos mínimos necesarios
- Stripe keys modo live aisladas

### 6. Protección de Datos Personales

**Cumplimiento RGPD:**
- Datos personales no en logs de debug (Global Rule #2)
- Cifrado en tránsito (SSL/TLS)
- Derecho de acceso y eliminación de datos (básico)
- Enmascaramiento de PII en respuestas API donde sea posible

**Resultado esperado:** Aplicación segura y conforme con regulaciones españolas.  
**Estado:** ✅ Completado — 9 Marzo 2026

---

## ✅ 🧪 Testing y QA — COMPLETADO

**Objetivo:** Asegurar que todo funciona correctamente antes de producción.

### 1. Testing Funcional

**Flujos principales:**
- Registro e inicio de sesión
- Navegación y búsqueda de productos
- Agregar al carrito
- Proceso de checkout completo
- Pago con Stripe
- Confirmación de pedido
- Ver historial de pedidos
- Solicitar cancelación
- Tracking de envío

**Estados y transiciones:**
- Todos los estados de pedido
- Todos los estados de cancelación
- Emails en cada transición

### 2. Testing de Integración

**Verificar:**
- Stripe payments (test mode → live mode)
- Emails (Resend en producción)
- Strapi ↔ Next.js comunicación
- Base de datos (PostgreSQL)

### 3. Testing de Performance

**Lighthouse audits:**
- Performance: >90
- Accessibility: >90
- Best Practices: >90
- SEO: >90

**Load testing básico:**
- 50 usuarios concurrentes
- Tiempo de respuesta < 2s

### 4. Testing Cross-Browser

**Navegadores:**
- Chrome (desktop/mobile)
- Safari (desktop/mobile)
- Firefox (desktop)
- Edge (desktop)

**Dispositivos:**
- Desktop 1920x1080
- Laptop 1366x768
- Tablet 768x1024
- Mobile 375x667

### 5. Testing de Seguridad

**Verificar:**
- Autenticación funciona correctamente
- Protección de rutas privadas
- Validación de inputs (frontend + backend)
- Rate limiting en APIs críticas
- HTTPS everywhere
- Secrets no expuestos
- CORS configurado correctamente

### 6. Testing E2E

**Playwright tests:**
- Happy path completo (registro → compra → tracking)
- Edge cases
- Error handling
- Recovery flows

**Resultado esperado:** Cobertura >80% en flujos críticos, 100% tests passing en Chromium/Firefox.
**Estado:** ✅ Completado — 13 Marzo 2026

---

## 📦 Preparación de Contenidos

**Objetivo:** Migrar contenido de la web actual a la nueva.

### 1. Productos

**Migrar desde web vieja:**
- Información completa de productos
- Imágenes optimizadas (WebP)
- Precios actualizados
- Stock (si aplica)
- Descripciones SEO-friendly

**Verificar:**
- URLs amigables
- Metadata correcta
- Imágenes responsive

### 2. Páginas Institucionales

**Crear/actualizar:**
- Sobre nosotros
- Política de privacidad (obligatorio GDPR)
- Términos y condiciones
- Política de envíos
- Política de devoluciones
- FAQ
- Contacto

### 3. SEO

**Configurar:**
- Redirects 301 de URLs viejas
- Sitemap.xml actualizado
- robots.txt configurado
- Google Search Console
- Google Analytics
- Schema markup (productos)

**Resultado esperado:** Todo el contenido migrado y optimizado.

---

## 🏗️ Setup de Producción

**Objetivo:** Preparar infraestructura para el lanzamiento.

> [!TIP]
> Configurar DNS 3-4 días antes del soft launch para que la propagación esté lista.

### 1. Backend - Railway

**Deploy Strapi:**
- Crear proyecto en Railway
- Configurar PostgreSQL database
- Variables de entorno de producción
- Cloudinary para media
- Configurar dominio: api.relojesbvbeni.com
- SSL automático

**Testing:**
- Verificar todas las APIs funcionan
- Comprobar uploads de imágenes
- Verificar emails se envían
- Testing de performance

### 2. Frontend - Vercel

**Deploy Next.js:**
- Proyecto ya está en Vercel
- Variables de entorno de producción
- Configurar dominio: relojesbvbeni.com
- SSL automático
- Edge functions configuradas

**Optimizaciones:**
- Image optimization habilitado
- Caching estratégico
- Preview deployments configurados

### 3. Base de Datos

**PostgreSQL en Railway:**
- Backups automáticos configurados
- Conexión segura (SSL)
- Monitoring activo
- Plan adecuado para tráfico esperado

### 4. DNS y Dominios

**Configurar en Abansys (3-4 días antes del soft launch):**
- A record para relojesbvbeni.com → Vercel
- CNAME para api.relojesbvbeni.com → Railway
- CNAME para www.relojesbvbeni.com → Vercel
- MX records para email (Zoho - después del lanzamiento)

**Verificar:**
- Propagación DNS completa (24-48h)
- SSL válido en ambos dominios
- Redirecciones www → non-www

### 5. Email - Zoho Mail

**Configuración básica:**
- Crear cuenta en Zoho
- Configurar dominio
- Crear buzón: info@relojesbvbeni.com
- Configurar en Resend como "from" email

**Testing:**
- Enviar email de prueba
- Recibir email de prueba
- Verificar no va a spam

### 6. Servicios Externos

**Stripe:**
- Activar modo Live
- Configurar Webhooks de producción
- Testing con tarjeta real (modo test → live)
- Configurar taxes (si aplica)

**Resend:**
- Verificar dominio en producción
- Configurar "from" con dominio propio
- Testing de emails en producción

**Cloudinary:**
- Verificar plan suficiente
- Configurar límites
- Backups habilitados

### 7. Monitoring y Logs

**Configurar:**
- Vercel Analytics
- Railway logs
- Sentry para errores (opcional)
- Uptime monitoring (UptimeRobot o similar)

**Alerts:**
- Downtime alerts
- Error rate alerts
- Performance degradation

**Resultado esperado:** Infraestructura completa y funcional en producción.

---

## 🎬 Soft Launch

**Objetivo:** Lanzamiento controlado para detectar issues antes del lanzamiento público.

### 1. Preparación

**Checklist pre-soft launch:**
- [ ] Todos los tests passing
- [ ] Infraestructura de producción verificada
- [ ] Backups configurados
- [ ] Monitoring activo
- [ ] Stripe en modo live (testeado)
- [ ] Emails funcionando desde dominio propio
- [ ] GDPR/Cookies compliance verificado

### 2. Grupo Beta

**Invitar a 10-20 personas:**
- Círculo cercano (amigos, familia)
- Usuarios clave (clientes recurrentes de la web vieja)
- Beta testers voluntarios

**Comunicación:**
- Email de invitación
- Explicar que es beta
- Pedir feedback específico
- Ofrecer descuento/incentivo

### 3. Monitoreo Intensivo

**Durante soft launch (7-14 días):**
- Revisar logs diariamente
- Monitorear errores en tiempo real
- Observar métricas de uso
- Recopilar feedback activamente

### 4. Iteración Rápida

**Fixes prioritarios:**
- Bugs críticos → Fix inmediato
- Issues de UX → Ajustar rápido
- Problemas de performance → Optimizar
- Feedback de features → Evaluar para v2.0

### 5. Comunicación con Beta Testers

**Updates regulares:**
- Agradecer feedback
- Comunicar fixes implementados
- Pedir re-testing de issues resueltos
- Mantener canal abierto (email, WhatsApp group)

**Resultado esperado:** App estable, bugs críticos resueltos, feedback incorporado.

---

## 🚀 Lanzamiento Oficial

**Objetivo:** Hacer la web pública y comenzar operación normal.

### 1. Pre-Lanzamiento (1 semana antes)

**Comunicación:**
- Email a base de clientes existentes
- Posts en redes sociales (teaser)
- Actualizar web vieja con anuncio
- Preparar materiales de marketing

**Verificaciones finales:**
- Testing completo de nuevo
- Backups recientes
- Plan de rollback preparado
- Equipo (Diego) informado

### 2. Día del Lanzamiento

**Secuencia:**
- Verificar DNS y SSL al 100%
- Anuncio en redes sociales
- Email de lanzamiento a clientes
- Press release (si aplica)
- Monitoring 24/7 primeras 48h

**Disponibilidad:**
- Estar disponible para hotfixes
- Monitorear constantemente
- Responder feedback rápido

### 3. Post-Lanzamiento Inmediato (Primera semana)

**Monitoreo:**
- Logs cada 2-4 horas
- Métricas de uso diarias (Vercel Analytics + Stripe Dashboard)
- Performance checks
- Feedback de usuarios

**Comunicación:**
- Agradecer early adopters
- Responder comentarios/reviews
- Compartir hitos (primeras ventas, usuarios)

**Fixes:**
- Issues menores → Schedule para próxima semana
- Issues críticos → Fix inmediato
- Mejoras UX → Backlog priorizado

### 4. Celebración 🎉

**Reconocer el logro:**
- Tomar un respiro
- Celebrar con Diego y círculo cercano
- Documentar el proceso
- Agradecer a quienes ayudaron

**Resultado esperado:** Lanzamiento exitoso, operación estable.

---

## 📈 Post-Lanzamiento (Primeras 4 semanas)

**Objetivo:** Estabilización y optimización inicial.

### 1. Optimización Continua

**Análisis de métricas (Vercel Analytics + Stripe Dashboard):**
- Tráfico y conversión
- Páginas más visitadas
- Puntos de abandono (funnel)
- Productos más vistos/vendidos
- Performance real

**Iteraciones:**
- Optimizar páginas con alto abandono
- Mejorar descripciones de productos con pocas ventas
- Ajustar precios si es necesario
- Mejorar imágenes poco atractivas

### 2. Recopilar Feedback

**Canales:**
- Email post-compra
- Encuestas de satisfacción
- Reviews de productos
- Comentarios en redes sociales
- Contacto directo

**Priorizar:**
- Issues recurrentes
- Quick wins (mejoras fáciles con alto impacto)
- Features más solicitadas → v2.0

### 3. Marketing y Crecimiento

**SEO:**
- Monitorear posicionamiento
- Crear contenido relevante (blog)
- Link building básico
- Optimizar según analytics

**Social Media:**
- Posts regulares
- Engagement con audiencia
- User-generated content
- Promociones/descuentos

**Email Marketing:**
- Newsletter mensual
- Promociones especiales

### 4. Migración Final de Email

**Después de 2-4 semanas:**
- Migrar completamente a Zoho
- Cancelar hosting viejo (Hostytec)
- Activar ahorro de 61€/año
- Documentar nuevo setup

### 5. Mantenimiento Regular

**Rutinas establecidas:**

**Semanal:**
- Review de métricas
- Responder feedback usuarios
- Pequeñas mejoras UX

**Mensual:**
- Análisis profundo de ventas
- Optimización de productos
- Review de seguridad
- Updates de dependencias

**Trimestral:**
- Planning de nuevas features
- Review de infraestructura
- Optimización de costos
- Audit de performance y SEO

### 6. Documentación

**Crear/actualizar:**
- Manual de operaciones para Diego
- Guía de troubleshooting común
- Documentación técnica
- Lessons learned

**Resultado esperado:** Sistema estable, optimización continua, negocio saludable.

---

## 🔮 v2.0 — Post-Lanzamiento

> [!NOTE]
> Estas features se implementarán después del lanzamiento, priorizadas por impacto en ventas y feedback de usuarios reales.

### EPIC 19: Analytics Dashboard Admin

**Objetivo:** Dar visibilidad completa del negocio al admin (más allá de Stripe Dashboard).

**Métricas:**
- Total de ventas (día/semana/mes/año)
- Número de pedidos y ticket promedio
- Estado de pedidos (overview)
- Top 10 productos vendidos
- Nuevos clientes por período
- Clientes recurrentes

**Visualizaciones:**
- Gráficos de ventas (Recharts o Chart.js)
- Comparativas por período
- Tendencias

**Exports:**
- CSV de pedidos y ventas
- Filtros por fecha
- Reportes mensuales automáticos

---

### Integración Automática con Transportistas

**Objetivo:** Automatizar el tracking sin intervención manual del admin.

**Implementar:**
- API de transportista principal (Correos, SEUR, etc.)
- Actualización automática de estados vía webhook
- Fallback a manual si API falla
- Emails intermedios: "en camino", "llega hoy"

---

### Email Marketing Avanzado

**Implementar:**
- Recuperación de carritos abandonados
- Re-engagement de usuarios inactivos
- Segmentación de audiencia
- Automatizaciones basadas en comportamiento

---

### Features de Producto

**Backlog priorizado por impacto:**
- Wishlist de productos
- Reviews de clientes
- Comparador de productos
- Recomendaciones personalizadas
- Programa de fidelización
- Notificaciones push
- Chat de soporte

**Priorización:**
- Por impacto en ventas
- Por facilidad de implementación
- Por feedback de usuarios reales

---

## 🎯 Checklist Ejecutivo

### Pre-Producción (Must Have)

- [x] EPIC 17: Sistema de envíos simplificado (manual)
- [x] EPIC 17b: Hardening y seguridad (GDPR, rate limiting, headers)
- [x] EPIC 18: Testing e Integración E2E (QA)
- [ ] Contenidos migrados y optimizados
- [ ] SEO configurado (redirects, sitemap, analytics)

### Infraestructura

- [ ] Backend en Railway funcionando
- [ ] Frontend en Vercel optimizado
- [ ] DNS configurado correctamente (3-4 días antes del soft launch)
- [ ] SSL válido en ambos dominios
- [ ] Backups automáticos configurados
- [ ] Monitoring activo

### Servicios

- [ ] Stripe en modo live y testeado
- [ ] Emails desde dominio propio (Zoho + Resend)
- [ ] Cloudinary configurado
- [ ] Todos los webhooks funcionando

### Lanzamiento

- [ ] Soft launch completado (7-14 días)
- [ ] Feedback incorporado
- [ ] GDPR compliance verificado
- [ ] Comunicación preparada
- [ ] Lanzamiento oficial ejecutado
- [ ] Primeras 48h monitoreadas intensivamente

### Post-Lanzamiento

- [ ] Optimización continua primeras 4 semanas
- [ ] Email migrado completamente a Zoho
- [ ] Hosting viejo cancelado
- [ ] Documentación completa
- [ ] Roadmap v2.0 priorizado con datos reales

---

## 📝 Notas Finales

**Principios para las últimas semanas:**

1. **Priorizar estabilidad sobre features**: Mejor lanzar con menos features pero todo funcional.

2. **Testing no es opcional**: Invertir tiempo en testing ahora evita problemas después.

3. **Documentar todo**: Tu yo del futuro (y Diego) te lo agradecerán.

4. **Backups, backups, backups**: Antes de cualquier cambio en producción.

5. **Comunicación clara**: Con Diego, con usuarios beta, con clientes.

6. **Celebrar pequeños wins**: Cada EPIC completado, cada milestone alcanzado.

7. **Pedir ayuda cuando sea necesario**: Community, mentores, documentación.

8. **Iterar después del lanzamiento**: No todo tiene que ser perfecto el día 1. Para eso existe v2.0.

**El lanzamiento no es el final, es el comienzo.** 🚀

---

**Última actualización:** 2 Septiembre 2026
**Próxima revisión:** Inicio del siguiente SDD cycle (SEO setup, Lighthouse audit, o cleanup) — operational setup (deploy, DNS, Stripe live, soft launch) en paralelo con vos y Diego
**Contacto:** Andrés | andresjpadev@gmail.com