# Spec: Checkout Order UPSERT — Permission Bootstrap Delta (F1)

## Purpose

Hardens the **bootstrap provisioning** of action `api::order.order.upsertByOrderId` for the `authenticated` role. The Sprint 5 Gap #3 cycle (archived; Engram #1783) shipped the endpoint, its controller, and its service-level guards, but `orderPermissions` in `src/index.ts:135-140` omits the new action. On a clean install, `PUT /api/orders/by-order-id/:orderId` returns HTTP 403 from the Users & Permissions middleware and blocks authenticated checkout, while the existing test suite passes because `setupTestPermissions` in `test/helpers/strapi-test-helpers.ts:124` artificially grants the action.

This delta (a) appends the action to the idempotent bootstrap pattern [ORD-26] at `src/index.ts:125-173` and (b) removes the artificial test grant — without modifying the endpoint, controller, service, or frontend contract. Endpoint semantics from Gap #3 (R-COU-1..10, S-COU-1..10) stay byte-identical and are explicitly out of scope here; they are referenced from the archived cumulative spec.

## Scope

### IN
- Append `api::order.order.upsertByOrderId` to `orderPermissions` in `src/index.ts`.
- Remove the artificial grant at `test/helpers/strapi-test-helpers.ts:124` and update the surrounding comment.
- Add RED-first `test/api/order-upsert-permission.test.ts` covering the bootstrap invariant, re-boot idempotency, owner PUT not middleware-403, anonymous 403, invalid JWT 401, and the helper-does-not-grant invariant.
- Lock R-COU-1..10 and S-COU-1..10 as unchanged.

### OUT
- `requestCancellation` permission drift (separate action, separate decision space — defer to a named follow-up).
- `administrator` grant or admin-bypass policy for the UPSERT.
- Route, controller, or service edits — JWT, ownership, status, and `paymentIntentId` guards are already correct.
- Frontend repo (`e-commerce-relojes-bv-beni`), schema migration, data backfill, CORS changes.
- Defensive code for a missing `authenticated` role; new error envelopes; Stripe webhook signature reuse.

## Requirements

> **Note on modified requirements**: R-COU-1..10 and S-COU-1..10 from the archived Gap #3 cycle stay byte-identical. Endpoint semantics (D1..D7, merge-only `paymentInfo`, idempotent PUT, `X-Trace-Id`, concurrency, ownership) are out of scope for F1. The new requirements below (R-COU-11, R-COU-12) are additive and modify only the bootstrap provisioning, not the endpoint, controller, or service contract.

### Requirement: R-COU-11 Bootstrap Enables Authenticated UPSERT
The `orderPermissions` array in `src/index.ts` MUST include action `api::order.order.upsertByOrderId` for role `authenticated`. After a clean bootstrap exactly one permission row MUST exist for that action on the `authenticated` role; re-boot MUST NOT duplicate it (idempotent). The bootstrap MUST reuse the idempotent pattern (find role → find permission by `action + role` → enable or create); MUST NOT depend on a present `authenticated` role — the early return at `src/index.ts:130-133` is preserved. **Strapi 5.23.5 v5 semantics**: `plugin::users-permissions.permission` no longer carries an `enabled` column — the row's existence IS the grant; any `enabled: true` data keys in [ORD-26] are silently-accepted v4 remnants and not asserted.

### Requirement: R-COU-12 Grant Scope Restricted to `authenticated`
The action MUST be granted only to `authenticated` and MUST NOT be granted to `public`, `anonymous`, or any role other than `authenticated` or `administrator`. The `administrator` grant remains out of scope per user decision; the UPSERT service MUST NOT add an admin bypass in this delta.

## Scenarios

#### Scenario: S-COU-11 Clean Bootstrap Enables Authenticated UPSERT
- GIVEN a fresh Strapi instance with no prior grant for `api::order.order.upsertByOrderId` on `authenticated`
- WHEN an authenticated owner issues `PUT /api/orders/by-order-id/<orderId>` with a valid JWT matching the Order owner
- THEN the permissions middleware does NOT reject with 403 and the response surfaces the owner-success path from R-COU-2 / R-COU-5.

#### Scenario: S-COU-12 Idempotent Re-Boot Preserves Single Row
- GIVEN Strapi where bootstrap has already provisioned `upsertByOrderId` for `authenticated`
- WHEN the bootstrap runs again (e.g., on re-boot or re-invoked `bootstrap()`)
- THEN exactly one permission row exists for that action on that role. **Strapi 5.23.5 v5 semantics**: row existence IS the grant; no `enabled` column to inspect.

#### Scenario: S-COU-13 Anonymous Request Rejected With 403
- GIVEN a fresh Strapi instance
- WHEN `PUT /api/orders/by-order-id/<orderId>` arrives with no `Authorization` header
- THEN Users & Permissions middleware returns HTTP 403 before reaching the controller, with a structured Strapi error envelope (`data: null`, `error.status: 403`, `error.name: 'ForbiddenError'`, message matching `/forbidden/i`). **Strapi 5.23.5 v5 semantics**: middleware-level rejections do NOT carry `X-Trace-Id` — the header is set in the order controller (`src/api/order/controllers/order.ts:372-380`), which the middleware short-circuits before; no global trace middleware exists in F1 scope.

#### Scenario: S-COU-14 Invalid JWT Rejected With 401
- GIVEN a fresh Strapi instance
- WHEN `PUT /api/orders/by-order-id/<orderId>` arrives with a malformed or expired JWT
- THEN the auth middleware returns HTTP 401 before the permissions check.

#### Scenario: S-COU-15 Test Helper No Longer Grants `upsertByOrderId` Artificially
- GIVEN `setupTestPermissions()` in `test/helpers/strapi-test-helpers.ts`
- WHEN the helper runs during test Strapi bootstrap
- THEN it MUST NOT grant action `api::order.order.upsertByOrderId`; the only grant path MUST be the production bootstrap in `src/index.ts`.

## Non-Functional Concerns

- **Authorization:** Still bounded by the existing service-level guards at `src/api/order/services/upsert.ts:178-323` (`payload.userId` rejection, ownership in transaction, status gate, `paymentIntentId` authority). The gap is bootstrap, not the auth model — R-COU-12 prevents accidental widening.
- **Performance:** N/A. One idempotent lookup per boot. No runtime path changes; no per-request overhead.
- **Observability:** Existing `strapi.log.info` at `src/index.ts:153, 166` covers create/re-enable. No new log surface.
- **Operability:** Installs that manually enabled the action via the Users & Permissions UI retain their row; the idempotent upsert does not disrupt it. Operators can disable manually-enabled rows through the UI if desired. The early return at `src/index.ts:130-133` keeps the bootstrap fail-safe if the `authenticated` role is missing.
- **Compatibility:** Frontend Next.js contract is unchanged — same JWT, same `X-Trace-Id`, same 400/403/409/500 envelopes. CORS allowlist unchanged.

## Verification

`npm run test:only` MUST exit 0 with the new `test/api/order-upsert-permission.test.ts` plus all existing UPSERT, ownership, and security tests. `npx tsc --noEmit` MUST exit 0 — mandatory gate (Engram #1740 lesson: `test:only` does NOT typecheck `*.test.ts`). `npm run build` MUST exit 0. `npm run lint` MUST exit 0. The 361-test baseline from Engram #1783 MUST stay green without the helper grant.

## Out of Scope

`requestCancellation` drift; admin override policy; `find`/`findOne`/`update` permission audit; migrations/backfill; frontend contract changes; defensive code for missing `authenticated` role; route/controller/service edits.

## References

- `openspec/changes/f1-backend-permissions/proposal.md` — proposal intent, scope, acceptance criteria.
- `openspec/changes/sprint-5-stripe-upsert-backend/specs/checkout-order-upsert/spec.md` — R-COU-1..10 / S-COU-1..10 source of truth.
- `src/index.ts:121-173` — [ORD-26] idempotent bootstrap pattern.
- `src/api/order/services/upsert.ts:178-323` — service-level guards untouched by F1.
- `test/helpers/strapi-test-helpers.ts:115-125` — helper cleanup target.
- Engram #1819 (exploration), #1821 (proposal), #1822 (this delta spec), #1824 (tasks), #1783 (Gap #3 archive), #320 (Strapi v5 conventions).
