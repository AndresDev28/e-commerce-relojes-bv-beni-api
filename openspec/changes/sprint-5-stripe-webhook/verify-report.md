```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:5807e41fc7696ca1b3ab52409b22f950cde115a9eee01adca08cd9cdb9a666e2
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 22/22
scenarios: 21/21
test_command: npm run test:only
test_exit_code: 0
test_output_hash: sha256:63d9faf7c4e33f4d5d04ea4ec068cfadaf6b96a5be0a5480ca185074e7f7b656
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:6042cc6c3323c46c2456f430c7bbdd26e497b27a89a86bdd85ecccba092c22be
```

# Verification Report — Sprint 5 — Gap #1: Stripe webhooks for payment intents

**Change**: `sprint-5-stripe-webhook`
**Version**: Strapi 5.23.5 backend (cross-repo cycle, 4 chained PRs)
**Mode**: Strict TDD
**Date**: 2026-09-06

## 1. Executive Summary

**Verdict: PASS (with warnings).** All 22 requirements (R-SW-1..9, R-OSA-1..6, R-PFS-1..7) and all 21 scenarios (S-SW-1..10, S-OSA-1..6, S-PFS-1..5) across the three delta specs are implemented and verified against the merged code on `main`. The full Vitest suite passes 337/337 tests across 31 files (exit 0), including the 5 pre-existing `charge.refunded` regression tests unchanged and 76 new tests added during the cycle. `npm run build` exits 0 and `npm run lint` exits 0 (0 errors, 352 pre-existing-style warnings). All 4 chained PRs (#33, #34, #35, #36) are merged and every one of the 32 tasks has commit evidence. Zero critical findings; zero blockers. Five non-blocking warnings and ten suggestions are documented below — the most notable are (a) the `tasks.md` checkbox bookkeeping lag (26/32 unchecked despite commits), (b) the `afterCreate` email paid-gate divergence from D-DESIGN-5, and (c) the unused `onCommit` email-deferral seam from D-DESIGN-1. The user-locked `cancellation_requested → payment_failed` transition (obs #1758) is documented as a spec-adjacent decision, covered by test T-F-9, and is NOT a blocker or regression.

## 2. Spec Coverage Matrix (Requirements — 22/22)

| Requirement | Description | Spec source | Test ID(s) | Status | Evidence |
|---|---|---|---|---|---|
| R-SW-1 | Signature verification BEFORE processing; failures throw → HTTP 400 | stripe-payment-webhooks | Baseline tests 4–5 (400 paths), T-D-1..5 | PASS | `test/api/stripe-webhook.test.ts` (400 signature/config tests pass); `src/api/order/services/stripe-webhook.ts:85-96` (`constructEvent` before `dispatch`) |
| R-SW-2 | Event-type dispatch: succeeded / payment_failed / charge.refunded / unhandled; unhandled acks 200, no side effects | stripe-payment-webhooks | T-D-1, T-D-2, T-D-3, T-D-4, T-D-5 | PASS | `test/api/stripe-webhook-dispatch.test.ts:51-128`; `stripe-webhook.ts:114-177` |
| R-SW-3 | Ledger row keyed on unique `event.id` inserted BEFORE processing; duplicate acks 200 with no side effects | stripe-payment-webhooks | T-LR-1, T-PS-3, T-SH-3, T-F-8, L-1 | PASS | `test/api/stripe-webhook-idempotency.test.ts:52`; `stripe-webhook.ts:136-161` (ledger-first insert + unique-violation ack); `test/api/webhook-ledger.test.ts` L-1 |
| R-SW-4 | Succeeded: extract PI/metadata; orderId → paymentIntentId lookup; shell / paid-ack / pending→paid / late-warn outcomes | stripe-payment-webhooks | T-SH-1..3, T-PS-1..4, T-LR-5 | PASS | `test/api/stripe-webhook-succeeded.test.ts:56-422`; `stripe-webhook.ts:272-398` |
| R-SW-5 | Failed: locate by orderId → paymentIntentId; transition + redacted audit; terminal ack; missing → warn + ack 200 | stripe-payment-webhooks | T-F-1..10 | PASS | `test/api/stripe-webhook-failed.test.ts:61-427`; `stripe-webhook.ts:461-576` |
| R-SW-6 | Missing `metadata.orderId` → paymentIntentId lookup; unmatched → warn + ack 200 (no NACK) | stripe-payment-webhooks | T-PS-4, T-F-6, T-F-7, T-LR-4 | PASS | `succeeded.test.ts:195`; `failed.test.ts:273,316`; `idempotency.test.ts:206`; `stripe-webhook.ts:340-346` |
| R-SW-7 | `charge.refunded` unchanged; 5 existing tests pass | stripe-payment-webhooks | Baseline 5 tests, T-D-3, T-TG-3 | PASS | `test/api/stripe-webhook.test.ts` — 5/5 pass unchanged; legacy branch preserved on Entity Service (`stripe-webhook.ts:193-247`) with the documented `payment_failed` terminal guard (spec-adjacent, §8) |
| R-SW-8 | Signature/config/raw-body → 400; processing errors → 500 | stripe-payment-webhooks | Baseline 400 tests (2); controller unchanged | PASS | `test/api/stripe-webhook.test.ts` (400 tests); `src/api/order/controllers/order.ts:338-350` — verified unchanged via `git diff 88df294..HEAD` (empty for controllers/routes). HTTP 500 path has no direct test → Suggestion S2 |
| R-SW-9 | Ledger insert and processing commit/rollback together (crash → retry re-processes) | stripe-payment-webhooks | T-PS-2, T-LR-1 + structural | PASS | `stripe-webhook.ts:136-176` (ledger inside `strapi.db.transaction`); `succeeded.test.ts:109` (ledger row outcome=processed). Direct rollback-on-throw test absent → Suggestion S1 |
| R-OSA-1 | Stock decrements only on confirmed payment, after Order exists + items + paid | order-stock-authority | T-PS-1, T-E-2b, T-L-1 | PASS | `succeeded.test.ts:56`; `order-stock-lifecycle.test.ts:241`; `lifecycles.ts:297-378` (enrichment gate) |
| R-OSA-2 | `afterCreate` MUST NOT decrement stock | order-stock-authority | T-L-1, T-L-2, T-L-6 + 5 `[GAP-1 PR3]` stock-management tests | PASS | `lifecycles.ts:192-201` (decrement block removed, comment documents removal); `test/api/order-stock-management.test.ts` (creation no-decrement tests) |
| R-OSA-3 | `beforeCreate` stock validation preserved (Insufficient stock → ApplicationError, 4xx, no Order) | order-stock-authority | T-L-5 + baseline `[AND-99]` | PASS | `lifecycles.ts:127-150`; `order-stock-lifecycle.test.ts:121` |
| R-OSA-4 | Exactly-once across both arrival orders; unique paymentIntentId + orderId serialize the race | order-stock-authority | T-LR-2, T-LR-3, T-E-3, SC-1 | PASS | `idempotency.test.ts:102,152`; `order-stock-lifecycle.test.ts:276`; `order-schema-contract.test.ts` SC-1 (unique constraint) |
| R-OSA-5 | Order write and stock decrement transactional; failed decrement rolls back transition | order-stock-authority | T-H-1..5 + depletion path T-E-4 | PASS | `order.ts:95-154` (ALS ambient-trx join); S-OSA-6 depletion → `payment_failed` (equivalent-or-stronger than rollback); Suggestion S4 (PG concurrency untested) |
| R-OSA-6 | `updateProductStock` hardened against concurrent decrements (guard, no lost updates) | order-stock-authority | T-H-1..5 | PASS | `order.ts:95-154` (guarded relative UPDATE `WHERE stock >= qty`); `order-stock-management.test.ts:290-360` (incl. T-H-2 parallel no-oversell) |
| R-PFS-1 | `payment_failed` in Order schema, history enums, generated types, `OrderStatus` type | payment-failed-status | SC-3, SC-4, VT-PF-* | PASS | `order/schema.json:48`; `order-status-history/schema.json:26,40`; `order.types.ts:22`; `types/generated/contentTypes.d.ts` (regenerated, build-gated) |
| R-PFS-2 | Transitions: allow pending→pf, pf→pending, pf→cancelled; forbid pf→paid/processing/shipped/delivered/refunded | payment-failed-status | VT-PF-1..4, VT-PF-6b, T-TG-4 | PASS | `order.types.ts:93-109` (matrix); `test/unit/order-status-transition.test.ts` (12 tests pass) |
| R-PFS-3 | `payment_failed`: no auto-shipment, no auto-refund, no purchase-confirmed email | payment-failed-status | T-TG-2, T-TG-3 + code audit | PASS | `lifecycles.ts:409-435` (restore gated on `stockDeducted`); refund terminal guard `stripe-webhook.ts:224-231`; no controller/route path to `payment_failed` (grep: 0 hits in controllers/routes) |
| R-PFS-4 | History `fromStatus`/`toStatus` enums include `payment_failed` | payment-failed-status | SC-4 | PASS | `order-status-history/schema.json:26,40`; `order-schema-contract.test.ts` SC-4 |
| R-PFS-5 | `paymentInfo.paymentError` = `{ code, failure_message }` ONLY; no decline_code / message / payment-method details | payment-failed-status | T-TG-5, T-F-1, T-F-10 | PASS | `stripe-webhook.ts:601-618` (strict whitelist by construction); `failed-guards.test.ts:209`; `failed.test.ts:61,427` |
| R-PFS-6 | `sendOrderEmailWebhook` with `statusChangeNote: 'Payment failed: <failure_message>'`; opt-out via env | payment-failed-status | Code-verified (note construction) + existing email lifecycle suite | PASS | `stripe-webhook.ts:552-553` (`statusChangeNote = 'Payment failed: ${failureMessage}'` passed to the Document Service update → afterUpdate email path). Email delivery itself not directly asserted in cycle tests → Suggestion S3 |
| R-PFS-7 | No stock decremented entering `payment_failed`; cancel-from-pf restores nothing; retry→succeeded decrements normally | payment-failed-status | T-TG-1, T-TG-2, T-F-1 | PASS | `failed-guards.test.ts:53,83`; marker gate `lifecycles.ts:413` |

## 3. Scenario Coverage Matrix (Scenarios — 21/21)

| Scenario | Description | Spec source | Test ID(s) | Status | Evidence |
|---|---|---|---|---|---|
| S-SW-1 | Succeeded, no Order → shell (paid, items [], source=webhook_reconciliation), 200 | stripe-payment-webhooks | T-SH-1, T-SH-2 | PASS | `succeeded.test.ts:273` (asserts `paymentInfo.source === 'webhook_reconciliation'`) |
| S-SW-2 | Succeeded, pending Order → paid, stock decremented exactly once | stripe-payment-webhooks | T-PS-1 | PASS | `succeeded.test.ts:56` |
| S-SW-3 | Succeeded re-delivery on paid Order → 200, no side effects | stripe-payment-webhooks | T-PS-3, T-LR-3 | PASS | `succeeded.test.ts:146`; `idempotency.test.ts:152` |
| S-SW-4 | payment_failed event, pending Order → payment_failed + redacted audit | stripe-payment-webhooks | T-F-1 | PASS | `failed.test.ts:61` |
| S-SW-5 | payment_failed event, no Order → warn + 200 | stripe-payment-webhooks | T-F-2 | PASS | `failed.test.ts:139` |
| S-SW-6 | Missing metadata, Order matched by paymentIntentId → normal processing | stripe-payment-webhooks | T-PS-4, T-F-6 | PASS | `succeeded.test.ts:195`; `failed.test.ts:273` |
| S-SW-7 | Missing metadata, no Order → warn + 200 | stripe-payment-webhooks | T-LR-4, T-F-7 | PASS | `idempotency.test.ts:206`; `failed.test.ts:316` |
| S-SW-8 | Late succeeded on processing Order → warn + 200, no transition | stripe-payment-webhooks | T-LR-5 | PASS | `idempotency.test.ts:239` |
| S-SW-9 | Duplicate event.id → 200, no side effects | stripe-payment-webhooks | T-LR-1 (+ T-PS-3, T-SH-3, T-F-8) | PASS | `idempotency.test.ts:52` |
| S-SW-10 | Five existing charge.refunded tests pass unchanged | stripe-payment-webhooks | Baseline suite | PASS | `stripe-webhook.test.ts` — 5/5 pass in the full run |
| S-OSA-1 | Webhook-first shell (items []) → no stock decrement at commit | order-stock-authority | T-SH-2, T-E-1 | PASS | `succeeded.test.ts:311`; `order-stock-lifecycle.test.ts:181` |
| S-OSA-2 | Client-first pending creation → no decrement at create; one decrement on later succeeded | order-stock-authority | T-L-1, T-PS-1 | PASS | `order-stock-lifecycle.test.ts:36`; `succeeded.test.ts:56` |
| S-OSA-3 | Shell then enrichment → exactly one decrement after enrichment | order-stock-authority | T-SH-4, T-E-2, T-E-2b, T-E-3 | PASS | `succeeded.test.ts:384`; `order-stock-lifecycle.test.ts:205,241,276` |
| S-OSA-4 | Concurrent webhook + client creation → one Order, one decrement | order-stock-authority | T-LR-2, T-LR-3 | PASS | `idempotency.test.ts:102,152` (Promise.all outcome assertion; SQLite serializes — engine-level PG concurrency noted in S4) |
| S-OSA-5 | Client insufficient stock → `Insufficient stock` 4xx, no Order, no charge | order-stock-authority | T-L-5 + `[AND-99]` baseline | PASS | `order-stock-lifecycle.test.ts:121`; `order-stock-management.test.ts` |
| S-OSA-6 | Depleted stock at enrichment → restore to payment_failed, audit, manual refund documented | order-stock-authority | T-E-4 | PASS | `order-stock-lifecycle.test.ts:311` (asserts `stock_depleted` audit + `payment_failed`); manual-refund path documented in `stripe-webhook.ts:183-191` and `webhook-event/README.md` |
| S-PFS-1 | pending + payment_failed → payment_failed + redacted audit + email | payment-failed-status | T-F-1 (status + audit; email via lifecycle path — S3) | PASS | `failed.test.ts:61`; `stripe-webhook.ts:552-573` |
| S-PFS-2 | Retry payment_failed → pending; history records both; later succeeded decrements | payment-failed-status | T-TG-1, VT-PF-2 | PASS | `failed-guards.test.ts:53`; `order-status-transition.test.ts` |
| S-PFS-3 | payment_failed → cancelled: email sent, no stock restoration | payment-failed-status | T-TG-2 | PASS | `failed-guards.test.ts:83` |
| S-PFS-4 | Direct recovery payment_failed → paid rejected | payment-failed-status | T-TG-4, VT-PF-4 | PASS | `failed-guards.test.ts:177` (beforeUpdate rejection through the real update path) |
| S-PFS-5 | Audit redaction: stored object contains code + failure_message only | payment-failed-status | T-TG-5, T-F-1 | PASS | `failed-guards.test.ts:209`; `failed.test.ts:61` |

## 4. Task Coverage Matrix (32/32 tasks with commit evidence)

All four PRs merged to `main`: #33 (`36a670f`), #34 (`01b0923`), #35 (`9632c0f`), #36 (`f02e324`).

| Task | PR | Status | Commit | Notes |
|---|---|---|---|---|
| T-PR1+2-1-ledger-scaffold | PR1+2 | Complete | `d72cbc5` | webhook-event CT + empty routes + cron scaffold |
| T-PR1+2-2-schema-domain-scaffold | PR1+2 | Complete | `b610e1f` | additive enums/marker/unique staging |
| T-PR1+2-3-ledger-red | PR1+2 | Complete | `54b98af` | RED: ledger uniqueness + retention (+ webhook-event factory helper) |
| T-PR1+2-4-transition-red | PR1+2 | Complete | `aed35f4` | RED: transition matrix tests |
| T-PR1+2-5-constraint-marker-red | PR1+2 | Complete | `bde8ea7` | RED: unique PI + marker contract tests |
| T-PR1+2-6-ledger-green | PR1+2 | Complete | `3220343` | GREEN: ledger schema + retention query |
| T-PR1+2-7-schema-domain-green | PR1+2 | Complete | `f49fb83` | GREEN: enums + matrix + unique + marker |
| T-PR1+2-8-generated-types-green | PR1+2 | Complete | `f49fb83` (folded) | generated types regenerated within the schema-green commit; `npm run build` gate green |
| T-PR1+2-9-migration-refactor | PR1+2 | Complete | `d98616d` | migration boundary + pre-deploy audit documented (webhook-event/README.md) |
| T-PR1+2-10-regression | PR1+2 | Complete | `d98616d` (folded) | focused suites re-run in the PR1+2 refactor commit; full regression enforced at PR merge |
| T-PR3-1-stock-seams | PR3 | Complete | `5e46576` | transaction-aware service seams |
| T-PR3-2-stock-helper-red | PR3 | Complete | `5742a2c` | RED: guarded decrement tests |
| T-PR3-3-stock-helper-green | PR3 | Complete | `448ff67` | GREEN: atomic guarded `updateProductStock` |
| T-PR3-4-create-lifecycle-red | PR3 | Complete | `4de8cac` | RED: creation never decrements |
| T-PR3-5-create-lifecycle-green | PR3 | Complete | `7c80467` | GREEN: afterCreate decrement removed, marker-gated restoration |
| T-PR3-6-enrichment-red | PR3 | Complete | `ffaf616` | RED: enrichment + depleted-stock tests |
| T-PR3-7-enrichment-green | PR3 | Complete | `902d498` | GREEN: enrichment gate + depleted → payment_failed |
| T-PR4a-1-reconciliation-scaffold | PR4a | Complete | `f4f6049` | dispatcher scaffold (handler embedded in stripe-webhook.ts — see §8.7) |
| T-PR4a-2-dispatch-red | PR4a | Complete | `b6c9945` | RED: dispatch tests (T-D-1..5) |
| T-PR4a-3-dispatch-green | PR4a | Complete | `3f54b21` | GREEN: signature+ledger+dispatch |
| T-PR4a-4-pending-success-red | PR4a | Complete | `7830b1f` | RED: T-PS-1..4 |
| T-PR4a-5-pending-success-green | PR4a | Complete | `e963048` | GREEN: pending→paid reconciliation |
| T-PR4a-6-shell-red | PR4a | Complete | `a607a02` | RED: T-SH-1..5 |
| T-PR4a-7-shell-green | PR4a | Complete | `b2304d2` | GREEN: D+ shell creation |
| T-PR4a-8-ledger-race-red | PR4a | Complete | `dcd0a27` | RED: T-LR-1..5 |
| T-PR4a-9-ledger-race-green | PR4a | Complete | `942fc1b` | GREEN: idempotent ledger-CAS reconciliation |
| T-PR4b-1-failure-scaffold | PR4b | Complete | `f0d5c9c` | failure handler scaffold + redaction boundary |
| T-PR4b-2-failure-red | PR4b | Complete | `0319970` | RED: T-F-1..10 |
| T-PR4b-3-failure-green | PR4b | Complete | `69a5e73` | GREEN: failed handler + redacted audit |
| T-PR4b-4-transition-guard-red | PR4b | Complete | `5705e93` | RED: T-TG-1..5 |
| T-PR4b-5-transition-guard-green | PR4b | Complete | `157c012` | GREEN: recovery guards + refund terminal guard |
| T-PR4b-6-regression-refactor | PR4b | Complete | `ae7c786` | refactor + full build/lint/test regression sweep |

**Note (W1)**: the checkbox column in `tasks.md` was only updated for the PR4b group (6/32 checked); PR1+2, PR3, and PR4a checkboxes remain unchecked despite completed, merged commits. The git evidence above is authoritative. `tasks.md` is an existing SDD artifact and was not modified by this verification.

## 5. Architecture Compliance (D-DESIGN-1..8)

| Decision | Followed? | Evidence / Notes |
|---|---|---|
| D-DESIGN-1 — transactional boundary via `strapi.db.transaction` | ✅ Yes, with one deviation | `stripe-webhook.ts:136-176`: `dispatch` opens `strapi.db.transaction(async ({ trx, onCommit }) => …)`, ledger insert first, handler calls join the ambient trx (Document Service auto-join + ALS in `order.ts:112,204`). R-SW-9/R-OSA-5 atomicity holds. **Deviation (W3)**: the `{ trx, onCommit }` context is passed to handlers but never used — emails fire synchronously via `afterUpdate` inside the transaction rather than being deferred to `onCommit`, so the "no network I/O while holding locks" consequence is not literally implemented. |
| D-DESIGN-2 — atomic guarded UPDATE in `updateProductStock` | ✅ Yes | `order.ts:95-154`: single relative UPDATE (`stock = stock - ?`) with `WHERE stock >= qty` guard, ambient-trx join via `@strapi/database` ALS `transactionCtx`, self-opening fallback, boolean affected-rows contract. T-H-1..5 verify incl. parallel no-oversell (T-H-2). Minor note (S6): table names `products`/`orders` are hardcoded in the raw knex calls rather than resolved from content-type metadata as the design text suggested. |
| D-DESIGN-3 — `webhook_events` content type shape | ✅ Yes | `src/api/webhook-event/content-types/webhook-event/schema.json`: eventId (required, unique), eventType (required), paymentIntentId/orderId (optional), processedAt (required datetime), outcome enum (`processed`\|`unmatched`), errorMessage; no payload field. Routes: `routes: []` (private). Retention: `config/cron-tasks.ts` daily 03:17 UTC sweep, 90-day cutoff, `<` strict. Verified by L-1..5. |
| D-DESIGN-4 — Document Service mapping | ✅ Yes | `findFirst` for both correlation lookups (`stripe-webhook.ts:292,302,481,494`), `documents.create` for shells with `user: { connect: [userId] }` (`:358-370`), `documents.update` by `documentId` for transitions (`:324,563`), marker writes via `db.query`/raw knex (lifecycle-free, `lifecycles.ts:428`, `order.ts:206`). `charge.refunded` stays on Entity Service (`:203-238`). |
| D-DESIGN-5 — lifecycle refactor | ✅ Yes, with one deviation | Decrement block REMOVED (`lifecycles.ts:192-201`, comment documents removal; T-L-1/T-L-2 prove). Enrichment gate present at top of `afterUpdate` BEFORE the unchanged-status early-return (`:297-378`). Restoration gated on `stockDeducted === true` with marker clear (`:409-435`; T-L-4, T-TG-2). Depleted stock → `payment_failed` + `stock_depleted` audit (T-E-4). **Deviation (W2)**: the design specifies re-gating the `afterCreate` email to `orderStatus === 'paid'`; the implementation keeps the legacy gate (`orderStatus !== 'cancelled' && items present`, `lifecycles.ts:198`). Behaviorally equivalent today (frontend creates orders as `paid`); under the future Gap #3 pending-at-create contract a pending order with items would receive both the create-time email and the pending→paid status-change email. Untested because tests run with `DISABLE_EMAIL_NOTIFICATIONS=true`. |
| D-DESIGN-6 — shell creation via full Document Service lifecycle | ✅ Yes | Shells go through `documents.create` (`stripe-webhook.ts:357-370`) — beforeCreate user-connect branch, `null → paid` history, exactly-one email at create, no decrement (items empty). Verified by T-SH-1 (and T-SH-5 for the invalid-user fallback). `enrichShellWithItems` remains test-only: grep confirms zero non-test callers and no route registration. |
| D-DESIGN-7 — email exactly-once across arrival orders | ✅ Structurally yes | Operative guards implemented as designed: ledger eventId (duplicates never reach writes), `afterUpdate` unchanged-status early-return (`lifecycles.ts:380-383`), no lifecycle-bearing write on the paid-ack path. `paymentInfo.source === 'webhook_reconciliation'` retained as audit/UPSERT-discriminator marker (grep: set only in shell creation, `stripe-webhook.ts:367`; asserted in T-SH-1). No direct email-count tests (see S3). |
| D-DESIGN-8 — destructive delta migration plan | ✅ Yes | `src/api/webhook-event/README.md` contains the pre-deploy duplicate audit SQL (`SELECT payment_intent_id … HAVING COUNT(*) > 1`), constraint/rollback commands, `payment_failed` row-revert SQL, ledger drop. Additive-first/unique-last ordering documented in tasks/proposal; deploy gates on the clean audit. |

## 6. Test Evidence

**Final suite (this verification, run on `main` @ `f02e324`)**: `npm run test:only` → **337 passed / 337** (0 failed, 0 skipped) across 31 files, exit 0.

**Regression baseline**: the 5 original `charge.refunded` tests in `test/api/stripe-webhook.test.ts` pass unchanged — 0 regressions. Broader order lifecycle suites (order-stock-management, order-security-lifecycle, order-status-transition-validation, order-status-history, order-email-webhook, shipment-lifecycle) all pass in the full run.

**New tests added across the cycle — 76 total**:

| File | Tests | Scope |
|---|---|---|
| `test/api/stripe-webhook-dispatch.test.ts` (new) | 5 | R-SW-1/2, T-D-1..5 |
| `test/api/stripe-webhook-succeeded.test.ts` (new) | 9 | R-SW-4/6, S-SW-1/2/3, T-PS-1..4, T-SH-1..5 |
| `test/api/stripe-webhook-idempotency.test.ts` (new) | 5 | R-SW-3/9, T-LR-1..5 |
| `test/api/stripe-webhook-failed.test.ts` (new) | 10 | R-SW-5, R-PFS-5, T-F-1..10 |
| `test/api/stripe-webhook-failed-guards.test.ts` (new) | 5 | R-PFS-2/3/7, T-TG-1..5 |
| `test/api/order-stock-lifecycle.test.ts` (new) | 11 | R-OSA-1/2/4, T-L-1..6, T-E-1..4 |
| `test/api/order-schema-contract.test.ts` (new) | 4 | R-PFS-1/4, R-OSA-4, SC-1..4 |
| `test/api/webhook-ledger.test.ts` (new) | 5 | R-SW-3/9, L-1..5 |
| `test/unit/order-status-transition.test.ts` (new) | 12 | R-PFS-2, VT-PF-* |
| `test/api/order-stock-management.test.ts` (+10 added) | +10 | R-OSA-2/5/6, T-H-1..5 + 5 `[GAP-1 PR3]` no-decrement tests |
| `test/helpers/webhook-event-factory.ts` (new helper) | — | event payload factory |

**Coverage by capability** (all pass):
- `stripe-payment-webhooks`: 39 tests (5 baseline + 34 new across dispatch/succeeded/idempotency/failed/failed-guards).
- `order-stock-authority`: 21 new tests (order-stock-lifecycle 11 + order-stock-management additions 10) plus pre-existing stock suite green.
- `payment-failed-status`: 21 tests (unit transitions 12 + schema-contract 4 + ledger 5, ledger shared with R-SW-3/9).

**TDD Compliance (Strict TDD)**:

| Check | Result | Details |
|---|---|---|
| TDD evidence reported | ⚠️ | No `apply-progress` artifact exists for this cross-repo chained-PR cycle (W5); TDD evidence reconstructed and verified from git history instead |
| All tasks have tests | ✅ | 32/32 tasks have RED test commits or scaffold+build gates |
| RED confirmed (tests exist) | ✅ | Every RED commit's test file exists and runs today (dispatch/succeeded/idempotency/failed/guards/stock-lifecycle/schema-contract/ledger/transition suites) |
| GREEN confirmed (tests pass) | ✅ | 337/337 pass on current `main` |
| RED→GREEN ordering | ✅ | `git log --reverse` shows test commit preceding its feat commit for every task pair (e.g. `b6c9945`→`3f54b21`, `0319970`→`69a5e73`) |
| Safety net for modified files | ✅ | `order-stock-management.test.ts` modified WITH its 10 new tests co-located; baseline 5 refund tests untouched (`git diff` on `stripe-webhook.test.ts` shows no changes) |

**Test Layer Distribution**: Unit 12 tests / 1 file (`order-status-transition.test.ts`); Integration 65 tests / 8 files (Supertest through `POST /api/orders/stripe-webhook` + service-level); E2E 0 (declared out of scope, Gap #7).

**Changed File Coverage**: not run — `rules.verify.coverage_threshold: 0` (informational only, non-blocking per config).

**Assertion Quality**: tautology scan across all 10 cycle test files found 0 tautologies, 0 ghost loops, 0 type-only-only assertions; 85 `expect()` behavioral assertions in the two largest new files alone (39 + 46). Assertions verify status values, exact stock quantities, ledger rows, redacted payload shapes, and document fields. **Assertion quality: ✅ All assertions verify real behavior.**

## 7. Build / Lint Evidence

| Command | Exit code | Result |
|---|---|---|
| `npm run build` | 0 | TS compile + admin build succeed; generated types regenerated; Stripe test-key validation passes in dev |
| `npm run lint` | 0 | 0 errors, 352 warnings (spread across pre-existing and test files; `no-explicit-any` dominant; consistent with `strict: false` convention — see S10) |
| `npm run test:only` | 0 | 337/337 tests, 31 files (evidence hash `sha256:63d9faf7…`) |

## 8. Spec-Adjacent Decisions (documented choices — NOT blockers)

1. **`cancellation_requested → payment_failed` transition** — added in PR4b (`157c012`), not enumerated in R-PFS-2, consistent with the minimum-list rule (R-PFS-2 lists MUST-allow edges as a minimum). Realistic race: cancel requested in parallel with a failed charge; payment outcome honored over cancel intent. **User-locked decision per obs #1758: KEEP.** Covered by T-F-9 and VT-PF-6c. Documented in `order.types.ts:80-92`. Status: intentional, no action required.
2. **`STRIPE_PI_WEBHOOKS_ENABLED` kill-switch** — designed as the deploy-time toggle (D-DESIGN-8 step 4) but not implemented as code; referenced only in the `stripe-webhook.ts:48-54` operational comment, proposal, design, and PR bodies. Ops concern; no code action this cycle.
3. **Pre-deploy audit SQL** — required before the unique `paymentIntentId` constraint goes live; documented in `src/api/webhook-event/README.md` (audit + rollback runbook). Ops runbook; no code action.
4. **`enrichShellWithItems` test-only** — designed to stay test-only, NOT a REST endpoint. Verified: grep finds zero non-test callers and no route registration; enforcement by code review. The production enrichment path is the `afterUpdate` gate.
5. **`paid → payment_failed` exception** — required by S-OSA-6 (stock depletion at enrichment). User-locked per obs #1754. Reachable ONLY from the enrichment gate / `enrichShellWithItems`; audit confirms zero user-driven controller or route paths fire `payment_failed` (grep over `src/api/order/controllers/` and `routes/`: 0 hits). Documented in `order.types.ts:69-79`.
6. **Vitest gotcha: `npm run build` before `npm run test:only`** — tests load from `dist/`; discovered by the PR4b sub-agent. Operational note for maintainers; worth a `CONTRIBUTING.md` entry (S9), not this cycle.
7. **Reconciliation logic embedded in `stripe-webhook.ts`** — design's component table planned a separate `src/api/order/services/payment-reconciliation.ts`; the apply embedded `handlePaymentIntentSucceeded` / `handlePaymentIntentPaymentFailed` / `reconcilePaymentFailed` in `stripe-webhook.ts` instead. Behavior equivalent; one fewer service indirection; documented here as a structural deviation (W4).
8. **Test file layout differs from tasks.md plan** — the planned monolithic `stripe-payment-intent-webhook.test.ts` was delivered as six focused webhook files (dispatch / succeeded / idempotency / failed / failed-guards + `order-stock-lifecycle.test.ts`). Same coverage, better review slices for the 400-line budget; documented as structural deviation.
9. **Missing `metadata.userId` logs "No metadata.orderId"** — the shell-path guard `if (!orderIdFromMetadata || !userIdFromMetadata)` (`stripe-webhook.ts:340`) reuses the R-SW-6 warn message even when only `userId` is missing (T-SH-5 asserts the no-shell behavior, not the message). Minor log imprecision (S8).

## 9. Findings — Categorized

| Status | Count | Items |
|---|---|---|
| **CRITICAL** (blocks PASS) | 0 | — |
| **WARNING** (non-blocking, documented) | 5 | W1: `tasks.md` checkboxes lag — 26/32 unchecked (PR1+2, PR3, PR4a groups) despite merged commits; git history authoritative. W2: `afterCreate` email gate kept as legacy `!== 'cancelled' && items` instead of D-DESIGN-5's `=== 'paid'` — equivalent under the current paid-at-create frontend; double-email risk only under the future Gap #3 pending-at-create contract. W3: D-DESIGN-1 `onCommit` email deferral seam scaffolded but unused — email fetch I/O runs inside the ambient transaction (lock window); R-SW-9 atomicity unaffected. W4: design's `payment-reconciliation.ts` service not created — handlers embedded in `stripe-webhook.ts` (§8.7). W5: no `apply-progress` artifact for the cycle — TDD evidence reconstructed from git history (verified RED→GREEN ordering for all task pairs). |
| **SUGGESTION** (future cycles) | 10 | S1: no direct test for R-SW-9 ledger rollback on a thrown handler (planned in T-PR4a-8; structural coverage only). S2: no direct test for the HTTP 500 processing-error mapping (R-SW-8; only 400 paths asserted; controller verified unchanged). S3: email side effects untested in cycle tests (`DISABLE_EMAIL_NOTIFICATIONS=true` in helpers) — R-PFS-6 delivery and D-DESIGN-7 exactly-once verified structurally only. S4: PostgreSQL-specific concurrency not exercised in CI (SQLite serializes; guarded SQL is engine-correct by design; `T-H-2`/`T-LR-2` assert outcomes, not engine locking). S5: `||` falsy-default pattern in test helpers (`data?.price \|\| 99.99` etc. in `strapi-test-helpers.ts:515-625`) — 0/'' silently replaced by defaults; audit and convert to `??`. S6: raw knex calls hardcode `products`/`orders` table names (`order.ts:116,206`) vs design's "resolved from content-type metadata" — works with Strapi defaults; rename-sensitive. S7: intentional `console.error` diagnostic in production path (`order.ts:249`, eslint-disabled for vitest visibility) — consider strapi.log-only. S8: shell-path warn message imprecision when only `metadata.userId` is missing (§8.9). S9: add a `CONTRIBUTING.md` entry for "run `npm run build` before `npm run test:only` — tests load from `dist/`". S10: 352 lint warnings repo-wide (0 errors), including `no-explicit-any` in cycle files — consistent with the existing `strict: false` convention; consider a dedicated lint-hygiene cycle. |
| **PASS** (all requirements verified) | 22 requirements, 21 scenarios, 32 tasks | All green: 337/337 tests, build 0, lint 0 errors, 4/4 PRs merged |

## 10. Risk Register (final)

| Risk | Status / Mitigation |
|---|---|
| Production migration: unique `paymentIntentId` fails if duplicates exist | OPEN — pre-deploy audit SQL in `src/api/webhook-event/README.md` is mandatory before Deploy 2; dedupe + sign-off required |
| Cross-repo coupling: frontend Gap #3 UPSERT PR | OPEN — `STRIPE_PI_WEBHOOKS_ENABLED` must stay off (default false) until the frontend UPSERT PR lands; sequenced rollout documented in proposal/tasks |
| Stock rollback: reverting this cycle while the new regime is live | OPEN — manual runbook required for in-flight Orders paid under webhook authority (never `afterCreate`-decremented); proposal rollback plan §5 covers it |
| `paid → payment_failed` admin exposure | CLOSED for this cycle — audit found zero user-driven controller/route paths to `payment_failed`; reachable only from the enrichment gate; matrix comment documents the invariant |
| `charge.refunded` on `payment_failed` orders 5xx-storm | CLOSED — terminal guard added (`stripe-webhook.ts:224-231`), covered by T-TG-3 |

## 11. Success Criteria (per proposal.md)

- [x] All 5 existing `test/api/stripe-webhook.test.ts` tests pass unchanged (5/5 in full suite; file untouched per git diff).
- [x] New integration tests pass (strict TDD) — **76 new tests** delivered vs the ~10 estimated (PR1+2: 21, PR3: 21, PR4a: 19, PR4b: 15 across the final file layout), all green.
- [x] No regression in Order lifecycle test suites (order-stock-management, order-security-lifecycle, order-status-transition-validation, order-status-history, order-email-webhook, shipment-lifecycle all pass).
- [x] `npm run build` exit 0.
- [x] `npm run lint` exit 0 (0 errors; 352 pre-existing-style warnings).
- [x] `npm run test:only` exit 0 (337/337).

## 12. Recommendations

**Ops (before enabling the feature):**
- Run the pre-deploy `payment_intent_id` duplicate audit (`src/api/webhook-event/README.md`) on production; dedupe and sign off before the unique-constraint deploy.
- Keep `STRIPE_PI_WEBHOOKS_ENABLED=false` (default) until the frontend Gap #3 UPSERT PR ships; flip the flag in the same rollout as that PR (D-DESIGN-8 step 4).
- Verify the daily 03:17 UTC retention cron runs in production after the first deploy.

**Frontend (cross-repo):**
- Ship Gap #3: change `useCreateOrder` from INSERT to UPSERT-by-`orderId` (enrich shell with items/subtotal/shipping) and stop client-authoritative `paid`.
- Then Gap #4 (PaymentIntent idempotency key) as the next frontend hardening step.

**Next SDD cycle candidates:**
- Sprint 5 Gap #4 (idempotency key) or the SEO/operational cleanup cycle, per the sprint plan.
- A small test-hygiene follow-up could bundle S1–S3 (rollback-on-throw test, 500-mapping test, email-side-effect tests with a mocked fetch), S5 (`??` in helpers), and S9 (CONTRIBUTING note).

**Open follow-ups to track:** tasks.md checkbox reconciliation at archive time (W1); the D-DESIGN-5 paid-gate correction should be folded into the Gap #3 window (W2) since it only matters once the frontend creates pending orders; `onCommit` email deferral (W3) is optional hardening if lock contention is observed.

---

**Verdict: PASS WITH WARNINGS** — 22/22 requirements, 21/21 scenarios, 32/32 tasks, 337/337 tests, build 0, lint 0 errors; zero blockers, zero critical findings; warnings and suggestions documented above for the orchestrator.
