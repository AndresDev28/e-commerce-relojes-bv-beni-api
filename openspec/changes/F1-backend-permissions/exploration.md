# F1 — Backend Permission Bootstrap for `upsertByOrderId`

## Context

The post-soft-launch follow-up cycle F1–F5 investigates residual gaps discovered during UX testing of the Sprint 5 Stripe UPSERT PR2 (Gap #3 archive, Engram #1783). F1 specifically targets a permission-bootstrap defect: the UPSERT endpoint exists and its service-level guards are correct, but a clean Strapi install never grants `api::order.order.upsertByOrderId` to the `authenticated` role, so `PUT /api/orders/by-order-id/:orderId` returns HTTP 403 from the Users & Permissions middleware and blocks authenticated checkout. Tests mask the defect because `setupTestPermissions` grants the missing action artificially, so the gap is invisible to CI.

F1 hardens the **bootstrap provisioning** of that single permission. It does not change endpoint, controller, service, frontend, schema, or webhook behavior. The fix is one entry in the existing idempotent `orderPermissions` array (`src/index.ts:135-140`) plus the removal of the artificial grant from the test helper. A new RED-first integration test (`test/api/order-upsert-permission.test.ts`) makes the bootstrap invariant and middleware-level 401/403 behavior verifiable on a clean boot.

## Current State

### Bootstrap and permission drift

- `src/index.ts:24` already exposes `bootstrap({ strapi })`; F1 does not introduce a bootstrap from scratch — it appends to the existing one.
- `src/index.ts:121-173` synchronizes permissions of the `authenticated` role idempotently: locate the role (`126-128`), look up the permission by `action + role` (`143-147`), enable an existing row (`150-156`) or create a new one (`158-166`), then log. This is the [ORD-26] pattern reused here.
- The current `orderPermissions` array (`src/index.ts:135-140`) contains `find`, `findOne`, `create`, and `update`, but **not** `api::order.order.upsertByOrderId`. That omission is the defect.
- `src/index.ts:130-133` early-returns when the `authenticated` role is missing; F1 preserves that fail-safe behavior.
- Adjacent drift outside F1 scope: `src/api/order/routes/01-custom.ts:15-18` registers `requestCancellation`, and `test/helpers/strapi-test-helpers.ts:115-125` enables it for tests, but `src/index.ts:135-140` does not add it to the production bootstrap. `search` appears only in the `administrator` grants (`src/index.ts:285-292`), not in `authenticated`. These are real but deferred to a later follow-up.

### Endpoint, controller, and service guards

- `src/api/order/routes/01-custom.ts:20-29` registers `PUT /api/orders/by-order-id/:orderId` → `order.upsertByOrderId`. No `config.auth` override; the comment (`20-24`) explicitly notes reliance on the default authenticated Strapi behavior. Not declared as public.
- `src/api/order/controllers/order.ts:371-398` applies a second guard: it reads `ctx.state.user.id` exclusively (`382-386`) and rejects unauthenticated requests before service dispatch. It generates/propagates `X-Trace-Id` (`372-380`) and maps service errors to 400/403/409/500 (`407-491`). The middleware-level 403 from Users & Permissions fires **before** this guard when the action is not enabled — which is exactly the F1 defect.
- `src/api/order/services/upsert.ts:178-188` rejects a `payload.userId` that differs from the JWT with `UpsertForbiddenError` (403).
- `src/api/order/services/upsert.ts:265-285` loads `user` and verifies that the existing row belongs to the authenticated user; user B cannot enrich user A's order.
- `src/api/order/services/upsert.ts:287-323` makes `paymentIntentId` and the status gate authoritative; terminal/unlisted statuses return 409 with zero mutation.
- `src/api/order/services/upsert.ts:375-387` connects the INSERT to `authUserId`, not to a `userId` from the body.

### Other endpoints already guarded

- `src/api/order/controllers/order.ts:58-98` (`find`) and `109-153` (`findOne`) user-scope orders and leave an `administrator` bypass.
- `src/api/order/controllers/order.ts:215-279` (`update`) applies ownership and allowlist.
- `src/api/order/controllers/order.ts:289-326` (`requestCancellation`) delegates with role + ownership; its service (`src/api/order/services/request-cancellation.ts:35-41`) allows `administrator` to bypass ownership. The UPSERT service has **no** admin bypass today; F1 does not add one.

### Middleware, CORS, and Stripe signature

- `config/middlewares.ts:3-10` registers `global::https-enforcer` early for `/api/orders`, `/api/payments`, and `/api/stripe`; CORS allows `Authorization` and `X-Trace-Id` (`14-23`).
- `src/middlewares/https-enforcer.ts:25-58` only blocks HTTP in production and returns 403 for sensitive routes. Transport only — does not replace Users & Permissions.
- The Stripe webhook is intentionally public (`src/api/order/routes/01-custom.ts:7-12`, `auth:false`) and protected by signature: `src/api/order/controllers/order.ts:335-357` reads the `stripe-signature` and raw body; `src/api/order/services/stripe-webhook.ts:62-100` requires `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` and calls `stripe.webhooks.constructEvent(...)`. The UPSERT cannot reuse this pattern: the frontend contract is JWT + business body, not a Stripe-signed payload.

### Blast radius

- **Direct:** any `PUT /api/orders/by-order-id/:orderId` from a clean install — checkout cannot complete the enrichment/insert step.
- **Indirect:** if a developer or operator has manually enabled the action via the Users & Permissions UI, the defect is masked in their environment but still present on every other install.
- **Untouched by F1:** webhook `POST /api/orders/stripe-webhook`, orders `GET`, the transactional UPSERT service, lifecycles, and Stripe validation.

## Findings

- **1. The defect is a permission-bootstrap drift, not an authorization design flaw.** The UPSERT service already enforces JWT identity (`upsert.ts:178-188`), `payload.userId` rejection, ownership inside the transaction (`265-285`), `paymentIntentId` authority, and the status gate. Granting the action to `authenticated` does not weaken any of these; it only removes the middleware-level 403 that fires before the controller can run its second guard. F1 stays inside the [ORD-26] pattern (`src/index.ts:125-173`).
- **2. Test coverage today is false-positive.** `test/helpers/strapi-test-helpers.ts:115-125` (line 124) artificially grants `api::order.order.upsertByOrderId`. All six existing UPSERT HTTP tests therefore exercise a permission state that does not exist on a clean install. Removing this grant is part of the fix because it eliminates the false coverage; without that change, the suite would still pass even if production bootstrap were broken.
- **3. The bootstrap is idempotent.** `src/index.ts:125-173` already finds-by-`{action, role}` and creates only when absent. Re-boot never duplicates the row. The fix appends one constant to `orderPermissions`; the rest of the function is unchanged.
- **4. Scope is intentionally tight.** F1 does **not** touch `requestCancellation` (separate drift), `administrator` grants (separate decision), route/controller/service (already correct), or frontend (no contract change). The frontend repo (`e-commerce-relojes-bv-beni`) continues to send `Authorization: Bearer`, `X-Trace-Id`, and the same business body; the fix is transparent.
- **5. The minimum RED test must exercise a real bootstrap, not the artificial helper grant.** To make RED genuine, the helper change (`strapi-test-helpers.ts:124`) ships in the same commit as the failing test. Otherwise, the test would still pass without any production change.
- **6. The 400-line budget absorbs F1 with margin.** Forecast is ≤130 authored diff lines (~1 production entry + ~10 helper lines + ~60–100 test lines). No chained PRs needed. The `ask-on-risk` strategy does not need to fire.
- **7. Adjacent infrastructure is reusable as-is.** `test/helpers/strapi-test-helpers.ts:102-158` already centralizes roles/permissions; `setupStrapi()` invokes the helper at `210-215`; `createTestUser()` and `authenticateUser()` are at `318-378`. `test/api/order-upsert-ownership.test.ts:60-115` and `178-217` already prove owner-vs-non-owner and `payload.userId` rejection — those tests cover service-level 403 and continue to serve as the regression net.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Helper removal breaks the six existing UPSERT HTTP tests if test Strapi does not run `bootstrap` | Medium | Tests fail for the wrong reason | Confirm bootstrap fires in test setup during RED; run the full suite before GREEN; treat any failure as evidence, not as a reason to restore the helper grant |
| Over-broad access if `upsertByOrderId` is granted to the wrong role | Low | Privilege escalation across users | Service guards (JWT identity, `payload.userId`, ownership, status gate) are untouched; R-COU-12 limits the grant to `authenticated` and forbids an admin bypass |
| Silent bootstrap failure swallowed by the `try/catch` at `src/index.ts:171-173` | Low | Defect recurs on next clean boot | Test asserts the effective grant against the `users-permissions_permission` table, not log lines |
| Accidentally widening the route to `auth:false` while editing `01-custom.ts` | Low | Public UPSERT = critical data leak | F1 does not touch `01-custom.ts`; review guard enforces no-touch on routes/controller/service |
| Missing `authenticated` role causes bootstrap to silently abort (`src/index.ts:130-133`) | Low | Defect recurs on roles-less installs | Preserve the early-return; document the failure mode; do not introduce defensive code in F1 |

## Open Questions

1. **Scope boundary.** Should F1 also fix the parallel `requestCancellation` drift (controller registers it, helper grants it for tests, but `src/index.ts:135-140` does not grant it for production)? Recommendation: **no** — different action, different decision space; defer to a named follow-up.
2. **`administrator` grant for `upsertByOrderId`.** Today the service has no admin bypass. Adding one would change the authorization model and require explicit scenarios. Recommendation: **out of F1 scope**; lock behind R-COU-12.
3. **Defensive code for missing `authenticated` role.** Keep the existing early-return (`src/index.ts:130-133`) or convert to a startup error? Recommendation: **keep the early-return**; do not add defensive code in F1.
4. **Compatibility assumptions.** Frontend keeps the same-origin proxy, sends a valid JWT, and uses the same `X-Trace-Id` envelope. No CORS or payload changes. Recommendation: **document and lock** in the proposal's "Out of Scope".

## Adjacent Context

- **F2–F5 (other follow-ups, deferred).** F1 is the first of the F-series (F1–F5). Once F1 merges, subsequent cycles can audit `requestCancellation`, admin overrides, and broader `find/findOne/update` permission reviews without re-doing the bootstrap pattern.
- **Gap #3 archive (Engram #1783).** Provides the endpoint, controller, service, and ten integration tests. F1 reuses everything except the helper grant and adds one integration test of its own.
- **Gap #1 archive (Engram #1744/#1761).** Defined the D+ orphan contract that the UPSERT exists to satisfy. Unchanged by F1.
- **Engram #320 (`sdd-init/e-commerce-relojes-bv-beni-api`).** Strapi 5 conventions, Document Service API for `findOne` in controllers, strict TDD discipline.

## References

### Codebase

- `src/index.ts:24, 121-173, 285-292` — bootstrap entry, idempotent authenticated permission provisioning, admin grants.
- `src/api/order/routes/01-custom.ts:7-29` — webhook (`auth:false`) and UPSERT (default authenticated) routes.
- `src/api/order/controllers/order.ts:58-153, 215-326, 335-491` — `find`/`findOne`/`update`/`requestCancellation` security; webhook signature; UPSERT controller action.
- `src/api/order/services/upsert.ts:178-323, 375-387` — `payload.userId` rejection, in-transaction ownership, status gate, INSERT connects to `authUserId`.
- `src/api/order/services/request-cancellation.ts:35-41` — admin bypass precedent (not extended to UPSERT).
- `src/middlewares/https-enforcer.ts:25-58` — transport-only HTTPS guard.
- `config/middlewares.ts:3-23` — middleware order and CORS allowlist.
- `test/helpers/strapi-test-helpers.ts:115-125, 318-378` — test helper grants (line 124 artificially grants `upsertByOrderId`); factories.
- `test/api/order-upsert-ownership.test.ts:60-115, 178-217` — owner/non-owner and `payload.userId` mismatch tests.
- `test/api/order-security-authentication.test.ts:22-61` — anonymous/invalid JWT documentation for core routes.
- `src/api/order/content-types/order/schema.json` — `orderId`/`paymentIntentId` uniqueness.

### Project decisions and external documentation

- Engram #1812 — F1 follow-up definition (DX footgun discovered during UX testing).
- Engram #1819 — this exploration.
- Engram #1783 — Gap #3 archive (endpoint, controller, service, ten tests).
- Engram #320 — Strapi v5 conventions, Document Service API for `findOne`, strict TDD.
- `openspec/changes/sprint-5-stripe-upsert-backend/specs/checkout-order-upsert/spec.md` — R-COU-1..10 source of truth.
- `openspec/changes/sprint-5-stripe-webhook/exploration.md` — canonical exploration layout for the changes/ directory.
- `openspec/config.yaml` — strict TDD, RFC 2119 specs, rollback-plan rule.
