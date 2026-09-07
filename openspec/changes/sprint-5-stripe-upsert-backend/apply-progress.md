# Apply-Progress: Sprint 5 Gap #3 (backend) — PR1

Cycle: `sprint-5-stripe-upsert-backend`
Capability: `checkout-order-upsert`
PR: **PR1 of 2 (stacked-to-main)** — tasks 1.1.1–2.8
Branch: `feat/sprint-5-stripe-upsert-backend-pr1`
PR URL: <https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/37>

## PR1 Status

`open` — awaiting user-driven merge. Orchestrator asks the user; do NOT auto-merge.

## Commits

```
2da0784 feat(order): add upsertByOrderId controller action + route registration (Phase 2.6 + 2.7)
d3db0a1 feat(order): add upsert service skeleton with transaction envelope (Phase 1.1.2 + 2.5)
fcd7c05 test(order): RED failing tests for upsert service signature and paid-shell preservation (S-COU-1, S-COU-7)
```

| Hash | Subject | Phase | Files |
|---|---|---|---|
| `fcd7c05` | test(order): RED failing tests for upsert service signature and paid-shell preservation (S-COU-1, S-COU-7) | 1.1.1, 2.1, 2.4 | +1 |
| `d3db0a1` | feat(order): add upsert service skeleton with transaction envelope (Phase 1.1.2 + 2.5) | 1.1.2, 2.5, 2.2, 2.3 | +3 / ~1 |
| `2da0784` | feat(order): add upsertByOrderId controller action + route registration (Phase 2.6 + 2.7) | 2.6, 2.7 | +2 / ~1 |

## Files Changed

`git diff --stat main..feat/sprint-5-stripe-upsert-backend-pr1`:

```
 src/api/order/controllers/order.ts            | 126 +++++++++-
 src/api/order/routes/01-custom.ts             |  11 +
 src/api/order/services/order.ts               |  48 ++--
 src/api/order/services/upsert.ts              | 271 ++++++++++++++++++++++++
 test/api/order-upsert-fallback-insert.test.ts | 100 ++++++++++
 test/api/order-upsert-paid-shell.test.ts      | 272 +++++++++++++++++++++++++
 test/api/order-upsert-payment-failed.test.ts  | 122 ++++++++++++
 test/helpers/strapi-test-helpers.ts           |   5 +
 8 files changed, 936 insertions(+), 19 deletions(-)
```

| File | Action | Note |
|---|---|---|
| `src/api/order/services/upsert.ts` | NEW | service + typed marker errors + A-1..A-14 |
| `src/api/order/services/order.ts` | modify | bug fix: `updateProductStock` raw-SQL placeholder binding under ambient trx |
| `src/api/order/controllers/order.ts` | modify | appended `upsertByOrderId`; existing methods byte-identical |
| `src/api/order/routes/01-custom.ts` | modify | new `PUT /orders/by-order-id/:orderId` route |
| `test/api/order-upsert-paid-shell.test.ts` | NEW | 1.1.1, 2.1, 2.4 (S-COU-1, S-COU-7) |
| `test/api/order-upsert-payment-failed.test.ts` | NEW | 2.2 (S-COU-2) |
| `test/api/order-upsert-fallback-insert.test.ts` | NEW | 2.3 (S-COU-4) |
| `test/helpers/strapi-test-helpers.ts` | modify | add `api::order.order.upsertByOrderId` to test authenticated-role permissions |

## Test Counts

| Metric | Count |
|---|---|
| Total tests in this PR (full suite) | **342** |
| New tests added by this PR | **+5** |
| Pre-existing tests (regression) | **337** |
| All-green assertion | ✓ (0 failed) |
| Test files added | 3 |
| Test files modified | 0 |
| New failing RED-tests at first run | 3 (1.1.1, 2.1, 2.4) — all confirmed to fail for the right reason before GREEN |

## Verification Gates

### 1. `npm run test:only`

```
Test Files  34 passed (34)
     Tests  342 passed (342)
  Duration  ~88s
```

### 2. `npx tsc --noEmit` (mandatory additional gate, #1740)

```
exit 0
```

### 3. `npm run build`

```
✔ Compiling TS
✔ Building build context
✔ Building admin panel
exit 0
```

### 4. Lint

```
✖ 391 problems (0 errors, 391 warnings)
0 errors → OK
391 warnings → pre-existing, no new warnings introduced by this PR
```

### 5. Kill-switch invariant (#1748)

```bash
git grep STRIPE_PI_WEBHOOKS_ENABLED \
  src/api/order/services/upsert.ts \
  src/api/order/controllers/order.ts \
  src/api/order/routes/01-custom.ts
# → (no output — zero matches)
```

### 6. No-touch boundaries (verified via `git diff main..HEAD --stat`)

| Boundary | Status |
|---|---|
| `controllers/order.ts:52-92` (find) | byte-identical |
| `controllers/order.ts:103-148` (findOne) | byte-identical |
| `controllers/order.ts:209-273` (update) | byte-identical |
| `controllers/order.ts:requestCancellation` | byte-identical |
| `controllers/order.ts:stripeWebhook` | byte-identical |
| `services/stripe-webhook.ts:272-398` (succeeded handler) | byte-identical |
| `services/stripe-webhook.ts:461-576` (failed handler) | byte-identical |
| `content-types/order/lifecycles.ts` | byte-identical |
| `content-types/order/schema.json` | byte-identical (no migration) |
| `POST /orders` semantics | unchanged |
| `PUT /orders/:id` semantics | unchanged |
| `webhook-event` content type | unchanged |

## Risks Discovered During Implementation

| # | Risk | Disposition |
|---|---|---|
| 1 | Strapi 5.23.5 `HttpError` is abstract; direct `new HttpError(409, ...)` throws "cannot construct abstract class" (verified at `http-errors/index.js:114`). | Mitigated: controller uses `ctx.status` + `ctx.body` manual assembly to produce Strapi's standard `{data:null,error:{status,name,message,details:{traceId}}}` shape. Mirrors the existing `requestCancellation` action's manual error mapping (`controllers/order.ts:309-320`). |
| 2 | `updateProductStock` raw-SQL placeholder binding mismatch under ambient trx — SQLite returned `affected > 0` for the CAS marker but the per-item decrement silently updated zero rows. | Fixed: switched to `connection.raw(SQL, bindings)` on the active connection (trx or default) and engine-portable return-value handling (`res.changes` for SQLite, `res.rowCount` for PG). T-H-4 (concurrent +2 increments) green again. |
| 3 | `entityService.findOne` cache returns stale product stock after raw-SQL decrement. | Documented in PR1 tests: use `strapi.db.query('api::product.product').findOne({ where, select })` for stock assertions (same pattern as `services/order.ts:267`). |
| 4 | Strapi's internal analytics fetch (`https://analytics.strapi.io/api/v2/track`) is stubbed by `vi.stubGlobal('fetch', mockFetch)`, so naïve `expect(mockFetch).not.toHaveBeenCalled()` would fail. | Mitigated in tests: filter mock calls by URL substring `/api/send-order-email` for the email-dispatch assertion. |
| 5 | Test helper's `cleanupUsers` filter (`@example.com` / `@test.com` / contains `test`) does not match arbitrary test emails like `u@e.com`, leaving stale users across test runs. | Documented: existing pre-PR test-helper behavior, not a regression. Future cycles using arbitrary emails should also use the `@example.com` convention. |

## Open Items

PR2 tasks (3.1–5.2) NOT YET STARTED. These are out of scope for PR1:

- [ ] 3.1 RED S-COU-3 terminal 409/zero mutation: `test/api/order-upsert-fallback-insert.test.ts` (~15).
- [ ] 3.2 RED S-COU-5 user 403: `test/api/order-upsert-ownership.test.ts` (~25).
- [ ] 3.3 RED S-COU-6 paymentIntent 409: `test/api/order-upsert-ownership.test.ts` (~25).
- [ ] 3.4 RED S-COU-8 malformed/structured error/trace: `test/api/order-upsert-fallback-insert.test.ts` (~20).
- [ ] 3.5 GREEN A-3/4/5/10 gates, protection, HttpError, trace: `services/upsert.ts`, `controllers/order.ts` (~50).
- [ ] 3.6 Verify S-COU-3/5/6/8; preserve no-touch files (~0).
- [ ] 4.1 RED S-COU-9 barrier race: `test/api/order-upsert-concurrency.test.ts` (~35).
- [ ] 4.2 RED S-COU-10 repeated PUT/no side-effects (~25).
- [ ] 4.3 GREEN bounded unique-retry/409 (~30).
- [ ] 4.4 GREEN omit status, CAS stock, idempotent no-op (~20).
- [ ] 5.1 RED/verify flag unset/false/true plus zero-read grep (~10).
- [ ] 5.2 GREEN invariant; no webhook/lifecycle edits (~0).
- [ ] 6.1 Run `npm run test:only` after build; scenarios/regressions pass (~0).
- [ ] 6.2 Run mandatory `npx tsc --noEmit` (~0).
- [ ] 6.3 Run `npm run build`; record final counts (~0).
- [ ] 6.4 Confirm commits, rollback boundaries, no schema/address/frontend changes (~0).

PR2 will open a fresh PR against `main` with chain `main → PR1 → main → PR2 → main` per the stacked-to-main strategy in #1748.

## PR URL

<https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/37>
