# Tasks: Checkout Order UPSERT

Strict TDD: every scenario is RED before production; tests/code/docs share a conventional commit.

## Phase 1 — Setup (PR1 candidate)

- [ ] 1.1.1 RED-test the exported `upsertOrderByOrderId` signature and transaction seam in `test/api/order-upsert-paid-shell.test.ts` (~10 lines).
- [ ] 1.1.2 SETUP service registration/placeholders in `src/api/order/services/upsert.ts` (~10 lines).

## Phase 2 — Core behavior (PR1 candidate)

- [ ] 2.1 RED S-COU-1 paid-state preservation + A-13 stock-once/no-email: `test/api/order-upsert-paid-shell.test.ts` (~35).
- [ ] 2.2 RED S-COU-2 status/audit preservation: `test/api/order-upsert-payment-failed.test.ts` (~40).
- [ ] 2.3 RED S-COU-4 fallback/total: `test/api/order-upsert-fallback-insert.test.ts` (~25).
- [ ] 2.4 RED S-COU-7 merge allowlist: `test/api/order-upsert-paid-shell.test.ts` (~25).
- [ ] 2.5 GREEN find/gates/merge/create/logging: `src/api/order/services/upsert.ts` (~140).
- [ ] 2.6 GREEN trace/auth/delegation/error shim: `src/api/order/controllers/order.ts` (~60).
- [ ] 2.7 GREEN route `PUT /orders/by-order-id/:orderId`: `src/api/order/routes/01-custom.ts` (~6).
- [ ] 2.8 Verify S-COU-1/2/4/7 (~0).

## Phase 3 — Hardening (PR2 candidate)

- [x] 3.1 RED S-COU-3 terminal 409/zero mutation: `test/api/order-upsert-fallback-insert.test.ts` (~15).
- [x] 3.2 RED S-COU-5 user 403: `test/api/order-upsert-ownership.test.ts` (~25).
- [x] 3.3 RED S-COU-6 paymentIntent 409: `test/api/order-upsert-ownership.test.ts` (~25).
- [x] 3.4 RED S-COU-8 malformed/structured error/trace: `test/api/order-upsert-fallback-insert.test.ts` (~20).
- [x] 3.5 GREEN A-3/4/5/10 gates, protection, HttpError, trace: `src/api/order/services/upsert.ts`, `src/api/order/controllers/order.ts` (~50).
- [x] 3.6 Verify S-COU-3/5/6/8; preserve no-touch files (~0).

## Phase 4 — Concurrency and idempotency (PR2 candidate)

- [x] 4.1 RED S-COU-9 barrier race: `test/api/order-upsert-concurrency.test.ts` (~35).
- [x] 4.2 RED S-COU-10 repeated PUT/no side-effects: `test/api/order-upsert-concurrency.test.ts`, `test/api/order-upsert-paid-shell.test.ts` (~25).
- [x] 4.3 GREEN bounded unique-retry/409: `src/api/order/services/upsert.ts` (~30).
- [x] 4.4 GREEN omit status, CAS stock, idempotent no-op: `test/api/order-upsert-*.test.ts` (~20).

## Phase 5 — Kill-switch invariant (PR2 candidate)

- [x] 5.1 RED/verify flag unset/false/true plus zero-read grep: `test/api/order-upsert-*.test.ts` (~10).
- [x] 5.2 GREEN invariant; no webhook/lifecycle edits: `src/api/order/services/upsert.ts`, `src/api/order/controllers/order.ts` (~0).

## Phase 6 — Verification

- [x] 6.1 Run `npm run test:only` after build; scenarios/regressions pass (~0).
- [x] 6.2 Run mandatory `npx tsc --noEmit` (~0).
- [x] 6.3 Run `npm run build`; record final counts (~0).
- [x] 6.4 Confirm commits, rollback boundaries, no schema/address/frontend changes (~0).

## Review Workload Forecast

| File | Planned authored lines |
|---|---:|
| `src/api/order/services/upsert.ts` | 150 (range 150–180) |
| `src/api/order/controllers/order.ts` | 60 (range 60–80) |
| `src/api/order/routes/01-custom.ts` | 6 |
| `test/api/order-upsert-paid-shell.test.ts` | 60 |
| `test/api/order-upsert-payment-failed.test.ts` | 40 |
| `test/api/order-upsert-ownership.test.ts` | 50 |
| `test/api/order-upsert-fallback-insert.test.ts` | 60 |
| `test/api/order-upsert-concurrency.test.ts` | 55 |
| **Lower-bound total** | **481 (range 481–531)** |

| Work unit | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|
| PR1 candidate: endpoint + happy paths | `npm run test:only -- test/api/order-upsert-paid-shell.test.ts test/api/order-upsert-payment-failed.test.ts test/api/order-upsert-fallback-insert.test.ts` | SQLite Strapi + authenticated PUT | Revert route/controller/service and happy-path tests |
| PR2 candidate: gates + race | `npm run test:only -- test/api/order-upsert-ownership.test.ts test/api/order-upsert-fallback-insert.test.ts test/api/order-upsert-concurrency.test.ts` | SQLite Strapi + PUT/Promise.all | Revert hardening/retry and three tests |

Recommend **2 PRs (Option B)**: PR1 lower bound 341 lines; PR2 lower bound 140 lines. Boundary: PR1 tasks 1.1.1–2.8; PR2 tasks 3.1–5.2. Delivery is `ask-on-risk`; chain strategy pending Guard.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
