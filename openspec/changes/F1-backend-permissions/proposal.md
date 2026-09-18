# Proposal: F1 — Backend Permission Bootstrap for `upsertByOrderId`

## Intent

Clean installs never grant `api::order.order.upsertByOrderId` to the `authenticated` role during Strapi bootstrap, so `PUT /api/orders/by-order-id/:orderId` returns HTTP 403 from the Users & Permissions middleware and blocks authenticated checkout on a fresh deploy/dev setup. The UPSERT service-level guards (JWT identity, `payload.userId` rejection, in-transaction ownership, `paymentIntentId` authority, status gate) are correct; the defect is purely the missing grant in `orderPermissions`. Tests mask the gap because `setupTestPermissions` artificially grants the action at `test/helpers/strapi-test-helpers.ts:124`. F1 appends the action to the idempotent bootstrap pattern [ORD-26], removes the artificial helper grant, and adds one RED-first integration test that proves the bootstrap invariant on a clean boot.

## Scope

### In Scope
- Add `api::order.order.upsertByOrderId` to the `orderPermissions` array in `src/index.ts` (one entry, [ORD-26] pattern).
- Remove the artificial grant at `test/helpers/strapi-test-helpers.ts:124` and update the surrounding comment so the helper no longer hides the bootstrap defect.
- New RED-first integration test `test/api/order-upsert-permission.test.ts` covering bootstrap invariant, re-boot idempotency, owner PUT not middleware-403, anonymous 403, invalid JWT 401, and the helper-does-not-grant invariant.
- Preserve `src/index.ts:130-133` early-return when the `authenticated` role is missing.

### Out of Scope
- `requestCancellation` permission drift (separate action, separate decision space — defer to a named follow-up).
- `administrator` grant or admin-bypass policy for the UPSERT.
- Route/controller/service edits — JWT, ownership, status, and `paymentIntentId` guards are already correct.
- Frontend repo (Next.js), schema migration, data backfill, CORS changes.
- Defensive code for a missing `authenticated` role; new error envelopes; Stripe webhook signature reuse; `X-Trace-Id` envelope changes.

## Capabilities

**Modified:** `checkout-order-upsert` — permission provisioning becomes bootstrap-guaranteed (clean install grants `api::order.order.upsertByOrderId` to `authenticated`). Endpoint semantics, service guards, and 400/403/409/500 envelopes are unchanged.

No new capabilities. No capability removals.

## Approach

Reuse the idempotent [ORD-26] pattern at `src/index.ts:125-173`: find role → find permission by `action + role` → enable or create. The production change is a single array entry. Strict TDD order:

1. **RED commit** — write `test/api/order-upsert-permission.test.ts` against a clean boot, asserting the bootstrap invariant + middleware-level 401/403, and remove the artificial grant at `strapi-test-helpers.ts:124` in the same commit. The full suite must fail on the missing authenticated grant before any production change.
2. **GREEN commit** — append `api::order.order.upsertByOrderId` to `orderPermissions`; the new test passes; the six existing UPSERT HTTP tests continue to pass (proving bootstrap, not the helper, is the grant path); the 361-test baseline remains green.

No migration, no schema change, no new env vars, no new middleware. The frontend contract (JWT, `X-Trace-Id`, 400/403/409/500 envelopes) is byte-identical.

## Acceptance criteria

- [ ] After bootstrap on a clean install, a permission row exists for `api::order.order.upsertByOrderId` on the `authenticated` role with `enabled: true`; re-boot does not duplicate the row.
- [ ] Owner PUT with a valid JWT is not rejected by the permissions middleware and reaches the controller's service dispatch; anonymous requests return HTTP 403; invalid/expired JWTs return HTTP 401; non-owner PUTs continue to receive service-level 403 (unchanged).
- [ ] `setupTestPermissions` no longer grants `api::order.order.upsertByOrderId`; the only grant path is the production bootstrap in `src/index.ts`.
- [ ] `npm run test`, `npm run test:only`, `npx tsc --noEmit`, `npm run build`, and `npm run lint` all exit 0; the 361-test baseline stays green.

## Risks

| Risk | Sev | Mitigation |
|------|-----|------------|
| Helper removal breaks the six existing UPSERT HTTP tests if test Strapi skips `bootstrap()` | MED | Confirm bootstrap fires in `setupStrapi()` during RED; run the full suite before GREEN; treat any failure as evidence, not as a reason to restore the helper grant |
| Over-broad access if `upsertByOrderId` is granted to the wrong role | LOW | R-COU-12 restricts the grant to `authenticated`; service guards (JWT identity, `payload.userId`, ownership, status gate) are untouched |
| Silent bootstrap failure swallowed by the `try/catch` at `src/index.ts:171-173` | LOW | New test asserts the effective grant against the `users-permissions_permission` table, not log lines |
| Accidental widening of route `config.auth` while editing `01-custom.ts` | LOW | F1 does not touch routes/controller/service; review guard enforces no-touch |

## Open questions

None blocking. Deferred by user decision: `requestCancellation` drift, admin override policy, defensive code for missing `authenticated` role.

## Effort

~1 production line + ~10 helper/comment lines + ~60–100 test lines → ≤130 authored diff lines. 1 PR, well under the 400-line budget. Estimated session: ~45 minutes (RED bootstrap ~25 min, GREEN verification ~20 min).

## Cross-repo impact

None. The frontend Next.js repo (`e-commerce-relojes-bv-beni`) continues to call `PUT /api/orders/by-order-id/:orderId` with `Authorization: Bearer`, `X-Trace-Id`, and the same business body. F1 is transparent from the frontend's perspective — the fix unblocks checkout on clean backend installs without changing any client-visible contract.

## Rollback

Revert the merged commit; the next bootstrap stops granting `api::order.order.upsertByOrderId`, restoring the prior 403 behavior. Manually enabled rows (created via the Users & Permissions UI on existing installs) persist — operators can disable them through the UI if desired. No data to unwind, no schema to revert, no env flag to flip.

## TDD plan

1. **RED — `test(order): expose bootstrap permission drift`** — write `test/api/order-upsert-permission.test.ts` covering R-COU-11/12 + S-COU-11..15, and remove the line that artificially grants `upsertByOrderId` in `test/helpers/strapi-test-helpers.ts`. `npm run test:only` MUST fail on the missing authenticated grant before any production change.
2. **GREEN — `fix(permissions): bootstrap order upsert action`** — append `api::order.order.upsertByOrderId` to `orderPermissions` in `src/index.ts`. The new test passes; `npm run test` stays green; `npx tsc --noEmit` and `npm run build` and `npm run lint` all exit 0.

## Success criteria

- [ ] R-COU-11 and R-COU-12 satisfied (bootstrap enables, scope restricted).
- [ ] S-COU-11 through S-COU-15 verified by `test/api/order-upsert-permission.test.ts`.
- [ ] `setupTestPermissions` no longer grants `upsertByOrderId`.
- [ ] All four verification gates (`npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint`) exit 0.
- [ ] 361-test baseline remains green without the helper grant.

## Dependencies

- `sprint-5-stripe-upsert-backend` archive (Engram #1783) — endpoint, controller, service, and ten integration tests are merged and operational.
- [ORD-26] idempotent permission provisioning pattern (`src/index.ts:125-173`).
- No frontend, schema, or env changes.

## Review Workload Forecast

Estimate: ~1 production line + ~10 helper lines + ~60–100 test lines → ~71–111 authored diff lines, well under the 400-line budget. Single PR; chained PRs not required. `ask-on-risk` strategy does not need to fire.

## References

- Engram #1812 — F1 follow-up definition (DX footgun from UX testing).
- Engram #1819 — exploration.
- Engram #1821 — this proposal.
- Engram #1822 — delta spec (R-COU-11/12 + S-COU-11..15).
- Engram #1824 — task breakdown.
- Engram #1783 — Gap #3 archive (R-COU-1..10 source of truth).
- Engram #320 — Strapi v5 conventions, strict TDD.
- `src/index.ts:121-173` — [ORD-26] bootstrap pattern.
- `src/api/order/services/upsert.ts:178-323` — service-level guards.
- `test/helpers/strapi-test-helpers.ts:115-125` — test helper to be cleaned.
- `openspec/changes/sprint-5-stripe-upsert-backend/specs/checkout-order-upsert/spec.md` — R-COU-1..10 / S-COU-1..10.
- `openspec/changes/sprint-5-stripe-upsert-backend/proposal.md` — canonical Gap #3 proposal layout.
- `openspec/changes/sprint-5-stripe-webhook/exploration.md` — canonical exploration layout.
- `openspec/config.yaml` — strict TDD, RFC 2119 specs, rollback-plan rule.
