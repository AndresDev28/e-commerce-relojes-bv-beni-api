# Capability: checkout-order-upsert

## Purpose

Atomic UPSERT-by-`orderId` closing Gap #1's deferred enrichment half: webhook `paid`/`payment_failed` shells (R-SW-4, R-SW-5) receive client `items`/`subtotal`/`shipping` without restarting payment. Idempotent `PUT`, merge-only `paymentInfo`, strict ownership. After F1, the bootstrap provisioning of action `api::order.order.upsertByOrderId` for the `authenticated` role is also guaranteed — clean installs no longer return HTTP 403 from the Users & Permissions middleware, and the test helper no longer masks the gap with an artificial grant.

## Requirements

### R-COU-1 Dedicated Route
The system MUST expose `PUT /orders/by-order-id/:orderId` in `src/api/order/routes/01-custom.ts`; core `POST /orders` and `PUT /orders/:id` MUST remain unchanged.

### R-COU-2 Paid Shell
For `orderStatus: 'paid'`, UPSERT MUST enrich ONLY `items`/`subtotal`/`shipping` and MUST preserve `orderStatus`, `paymentInfo.source`, `paymentInfo.paymentError` byte-identical with no dispatch.

### R-COU-3 Payment-Failed Shell
For `orderStatus: 'payment_failed'`, UPSERT MUST enrich ONLY client-owned fields and MUST preserve `orderStatus` and `paymentInfo.paymentError` byte-identical without restarting payment.

### R-COU-4 Terminal Status
For `cancelled`/`refunded`, UPSERT MUST return HTTP 409 with zero mutation; no field MUST change and no dispatch MUST fire.

### R-COU-5 Fallback Insert
When no Order matches `orderId`, UPSERT MUST INSERT with `orderStatus: 'pending'`; webhook SHALL remain authoritative and INSERT MUST satisfy unique `orderId` + `paymentIntentId` atomically.

### R-COU-6 Ownership
The endpoint MUST reject `userId` mismatch with HTTP 403 and `paymentIntentId` mismatch with HTTP 409; authoritative identifiers MUST NOT be overwritten by request body.

### R-COU-7 Merge-Only PaymentInfo
Client MUST supply only `paymentInfo.{method, brand, last4}`; backend MUST shallow-merge over existing `paymentInfo` preserving `source`/`paymentError`/server-owned keys, and MUST NOT wholesale-replace.

### R-COU-8 Errors
Missing `orderId`/`userId`/`paymentIntentId`, malformed payload, or schema failure MUST yield a structured Strapi error with `X-Trace-Id`; endpoint MUST NOT 500 on client input.

### R-COU-9 Concurrency
The endpoint MUST rely on unique `orderId` and `paymentIntentId` to serialize concurrent shell-creation and UPSERT writes, guaranteeing one Order per `orderId`; losing-writer updates MUST be rejected at the DB layer.

### R-COU-10 Idempotency
Repeated `PUT` with identical body over same `orderId` MUST produce no observable side-effect beyond the first write; unique `orderId` SHALL serialize concurrent writes.

### R-COU-11 Bootstrap Enables Authenticated UPSERT
The `orderPermissions` array in `src/index.ts` MUST include action `api::order.order.upsertByOrderId` for role `authenticated`. After a clean bootstrap exactly one permission row MUST exist for that action on the `authenticated` role; re-boot MUST NOT duplicate it (idempotent). The bootstrap MUST reuse the idempotent pattern (find role → find permission by `action + role` → enable or create); MUST NOT depend on a present `authenticated` role — the early return at `src/index.ts:130-133` is preserved. **Strapi 5.23.5 v5 semantics**: `plugin::users-permissions.permission` no longer carries an `enabled` column — the row's existence IS the grant; any `enabled: true` data keys in [ORD-26] are silently-accepted v4 remnants and not asserted.

### R-COU-12 Grant Scope Restricted to `authenticated`
The action MUST be granted only to `authenticated` and MUST NOT be granted to `public`, `anonymous`, or any role other than `authenticated` or `administrator`. The `administrator` grant remains out of scope per user decision; the UPSERT service MUST NOT add an admin bypass in this delta.

## Scenarios

### S-COU-1 Paid Shell Enrichment Preserves State
- GIVEN Order with `orderStatus: 'paid'`, `paymentInfo.source: 'webhook_reconciliation'`, `items: []`
- WHEN `PUT /orders/by-order-id/<orderId>` carries `items`, `subtotal`, `shipping`, `paymentInfo.{method, brand, last4}`
- THEN client fields persist, `orderStatus`/`paymentInfo.source`/`paymentInfo.paymentError` remain byte-identical, zero dispatches fire.

### S-COU-2 Payment-Failed Enrichment Preserves Audit
- GIVEN Order with `orderStatus: 'payment_failed'`, `paymentInfo.paymentError: { code, failure_message }`
- WHEN `PUT` carries `items`/`subtotal`/`shipping`
- THEN those persist, `orderStatus`/`paymentInfo.paymentError` unchanged, payment state machine not invoked.

### S-COU-3 Cancelled Shell Returns 409
- GIVEN Order with `orderStatus: 'cancelled'`
- WHEN `PUT /orders/by-order-id/<orderId>` arrives
- THEN HTTP 409 returned, no field changes.

### S-COU-4 Missing Order Inserts Pending
- GIVEN no Order for `orderId`
- WHEN `PUT` arrives with valid `userId`/`paymentIntentId`/`items`/`paymentInfo`
- THEN new Order created with `orderStatus: 'pending'`.

### S-COU-5 UserId Mismatch → 403
- GIVEN Order with `userId: A`, `paymentIntentId: PI-1`
- WHEN `PUT` arrives with authenticated `userId: B`, `paymentIntentId: PI-1`
- THEN HTTP 403 returned, `userId` remains `A`.

### S-COU-6 PaymentIntentId Mismatch → 409
- GIVEN Order with `userId: A`, `paymentIntentId: PI-1`
- WHEN `PUT` arrives with `userId: A` (auth match), `paymentIntentId: PI-2`
- THEN HTTP 409 returned, `paymentIntentId` remains `PI-1`.

### S-COU-7 PaymentInfo Merge Preserves Server Keys
- GIVEN `paymentInfo: { source: 'webhook_reconciliation', paymentError: { code, failure_message } }`
- WHEN `PUT` supplies `paymentInfo: { method: 'card', brand: 'visa', last4: '4242' }`
- THEN persisted equals `{ source, paymentError, method, brand, last4 }`.

### S-COU-8 Malformed Payload Returns Structured Error
- GIVEN request missing `orderId`, `userId`, or `paymentIntentId`
- WHEN endpoint is invoked
- THEN structured Strapi error returned with `X-Trace-Id`.

### S-COU-9 Concurrent Writes Yield One Authoritative Record
- GIVEN two writers target same `orderId` (shell creator + UPSERT)
- WHEN both commit concurrently
- THEN exactly one Order exists post-commit, loser rejected by unique constraint.

### S-COU-10 Idempotent Repeated PUT
- GIVEN Order enriched by prior successful PUT
- WHEN identical PUT sent again
- THEN no additional dispatch, history row, or side-effect fires.

### S-COU-11 Clean Bootstrap Enables Authenticated UPSERT
- GIVEN a fresh Strapi instance with no prior grant for `api::order.order.upsertByOrderId` on `authenticated`
- WHEN an authenticated owner issues `PUT /api/orders/by-order-id/<orderId>` with a valid JWT matching the Order owner
- THEN the permissions middleware does NOT reject with 403 and the response surfaces the owner-success path from R-COU-2 / R-COU-5.

### S-COU-12 Idempotent Re-Boot Preserves Single Row
- GIVEN Strapi where bootstrap has already provisioned `upsertByOrderId` for `authenticated`
- WHEN the bootstrap runs again (e.g., on re-boot or re-invoked `bootstrap()`)
- THEN exactly one permission row exists for that action on that role. **Strapi 5.23.5 v5 semantics**: row existence IS the grant; no `enabled` column to inspect.

### S-COU-13 Anonymous Request Rejected With 403
- GIVEN a fresh Strapi instance
- WHEN `PUT /api/orders/by-order-id/<orderId>` arrives with no `Authorization` header
- THEN Users & Permissions middleware returns HTTP 403 before reaching the controller, with a structured Strapi error envelope (`data: null`, `error.status: 403`, `error.name: 'ForbiddenError'`, message matching `/forbidden/i`). **Strapi 5.23.5 v5 semantics**: middleware-level rejections do NOT carry `X-Trace-Id` — the header is set in the order controller (`src/api/order/controllers/order.ts:372-380`), which the middleware short-circuits before; no global trace middleware exists in F1 scope.

### S-COU-14 Invalid JWT Rejected With 401
- GIVEN a fresh Strapi instance
- WHEN `PUT /api/orders/by-order-id/<orderId>` arrives with a malformed or expired JWT
- THEN the auth middleware returns HTTP 401 before the permissions check.

### S-COU-15 Test Helper No Longer Grants `upsertByOrderId` Artificially
- GIVEN `setupTestPermissions()` in `test/helpers/strapi-test-helpers.ts`
- WHEN the helper runs during test Strapi bootstrap
- THEN it MUST NOT grant action `api::order.order.upsertByOrderId`; the only grant path MUST be the production bootstrap in `src/index.ts`.

## Out of Scope

Addresses (#1763), `idempotencyKey` (Gap #4), full `metadata.items`, retry UX post `payment_failed` (Gap #1 PR4b), `POST /orders`/`PUT /orders/:id` semantic changes, E2E expansion, frontend wiring (#1766), `find`/`findOne` security overrides, `STRIPE_PI_WEBHOOKS_ENABLED` coupling, `requestCancellation` permission drift, `administrator` override of UPSERT, defensive code for missing `authenticated` role, schema migration, frontend contract changes.

## Verification

`npm run test:only` (vitest, unit+integration) MUST exit 0. `npx tsc --noEmit` MUST exit 0 — mandatory gate; `test:only` skips `*.test.ts` typecheck (#1740). `npm run build` MUST exit 0. `npm run lint` MUST exit 0. E2E OFF. `STRIPE_PI_WEBHOOKS_ENABLED` invariant (#1748). The 361-test baseline from #1783 MUST stay green without the helper grant.

## References

- `openspec/changes/sprint-5-stripe-upsert-backend/specs/checkout-order-upsert/spec.md` — R-COU-1..10 / S-COU-1..10 source of truth (Gap #3 delta).
- `openspec/changes/f1-backend-permissions/specs/checkout-order-upsert/spec.md` — R-COU-11/12 / S-COU-11..15 delta.
- `openspec/changes/f1-backend-permissions/proposal.md` — F1 proposal.
- `openspec/specs/stripe-payment-webhooks/spec.md` — R-SW-4, R-SW-5 referenced by R-COU-2/R-COU-3.
- `openspec/specs/order-stock-authority/spec.md` — S-OSA-3 stock authority referenced by R-COU-2.
- Engram #1744, #1763, #1765, #1766, #1748, #1761 (Gap #1/#3 context); #1783 (Gap #3 archive); #1812 (F1 follow-up); #1819 (F1 exploration); #1821 (F1 proposal); #1822 (F1 delta spec); #1824 (F1 tasks); #320 (Strapi v5 conventions).
