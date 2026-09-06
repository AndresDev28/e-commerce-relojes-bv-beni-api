# Tasks: Sprint 5 — Gap #1: Stripe webhooks for payment intents

## Tasks Overview

This change is approximately 1,050 changed lines across four stacked-to-main PRs. Strict TDD applies: each behavior is introduced as RED, made GREEN, then refactored; schemas and scaffolding are SETUP. PR1+2 establishes the ledger and status/stock contracts, PR3 moves stock authority, PR4a implements succeeded reconciliation, and PR4b implements failed-payment behavior. Production deployment is one release after PR4b, with the kill-switch off until the frontend UPSERT contract lands.

Hierarchical IDs use `T-PR{N}-{M}-{slug}`; the combined first PR uses `T-PR1+2-{M}-{slug}`.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Task Groups by PR

### PR1+2 — Ledger + Schema/Domain
**Goal:** Add the webhook ledger, additive order/history vocabulary, unique payment correlation, and stock marker.  
**Depends on:** none.  
**~Lines:** 340.  
**Work-unit commits:** Commit each schema/domain slice with its RED/GREEN tests together; keep generated types in the same schema commit, and finish with the migration/runbook review commit.

- [x] T-PR1+2-1-ledger-scaffold
- [x] T-PR1+2-2-schema-domain-scaffold
- [x] T-PR1+2-3-ledger-red
- [x] T-PR1+2-4-transition-red
- [x] T-PR1+2-5-constraint-marker-red
- [x] T-PR1+2-6-ledger-green
- [x] T-PR1+2-7-schema-domain-green
- [x] T-PR1+2-8-generated-types-green
- [x] T-PR1+2-9-migration-refactor
- [x] T-PR1+2-10-regression

### PR3 — Stock Authority
**Goal:** Make confirmed-payment reconciliation the only decrement authority and make stock updates atomic/idempotent.  
**Depends on:** PR1+2.  
**~Lines:** 280.  
**Work-unit commits:** Pair each stock RED test with its implementation; separate the atomic helper, lifecycle gates, and depleted-stock path into independently revertible commits.

- [x] T-PR3-1-stock-seams
- [x] T-PR3-2-stock-helper-red
- [x] T-PR3-3-stock-helper-green
- [x] T-PR3-4-create-lifecycle-red
- [x] T-PR3-5-create-lifecycle-green
- [x] T-PR3-6-enrichment-red
- [x] T-PR3-7-enrichment-green

### PR4a — Succeeded Reconciliation
**Goal:** Dispatch verified succeeded events through transactional, correlation-first D+ reconciliation with exactly-once stock claims.  
**Depends on:** PR1+2 and PR3.  
**~Lines:** 330.  
**Work-unit commits:** Keep dispatch/kill-switch, client-first success, shell creation, and ledger/race handling as four test-plus-implementation commits; never separate all tests from their production changes.

- [x] T-PR4a-1-reconciliation-scaffold
- [x] T-PR4a-2-dispatch-red
- [x] T-PR4a-3-dispatch-green
- [x] T-PR4a-4-pending-success-red
- [x] T-PR4a-5-pending-success-green
- [x] T-PR4a-6-shell-red
- [x] T-PR4a-7-shell-green
- [x] T-PR4a-8-ledger-race-red
- [x] T-PR4a-9-ledger-race-green

### PR4b — Failed Payment
**Goal:** Reconcile failed PaymentIntents into a redacted, auditable `payment_failed` state without phantom restoration or refund retry storms.  
**Depends on:** PR1+2, PR3, and PR4a.  
**~Lines:** 190.  
**Work-unit commits:** Pair failure RED/GREEN with its handler, then pair transition/refund-guard RED/GREEN; finish with a focused refactor and full regression commit.

- [x] T-PR4b-1-failure-scaffold
- [x] T-PR4b-2-failure-red
- [x] T-PR4b-3-failure-green
- [x] T-PR4b-4-transition-guard-red
- [x] T-PR4b-5-transition-guard-green
- [x] T-PR4b-6-regression-refactor

## Per-Task Detail

#### T-PR1+2-1-ledger-scaffold
- **Goal:** Create the private `webhook_events` content type, empty public routes, and 90-day cron sweep scaffold.
- **TDD step:** SETUP.
- **Files touched:** `src/api/webhook-event/content-types/webhook-event/schema.json`, `src/api/webhook-event/routes/webhook-event.ts`, `config/cron-tasks.ts`.
- **Spec coverage:** R-SW-3, R-SW-9 ledger foundation.
- **Test command:** `npm run build`.
- **Done when:** Strapi discovers the CT, its REST route list is empty, and build exits 0.
- **Work-unit commit message:** `feat(webhooks): scaffold private webhook event ledger [GAP-1 PR1+2]`

#### T-PR1+2-2-schema-domain-scaffold
- **Goal:** Prepare additive schema/domain changes for `payment_failed`, unique `paymentIntentId`, and `stockDeducted` without wiring handlers.
- **TDD step:** SETUP.
- **Files touched:** `src/api/order/content-types/order/schema.json`, `src/api/order-status-history/content-types/order-status-history/schema.json`, `src/core/domain/order/order.types.ts`, `types/generated/contentTypes.d.ts`.
- **Spec coverage:** R-PFS-1, R-PFS-4, R-OSA-4 contract scaffolding.
- **Test command:** `npm run build`.
- **Done when:** Additive fields/enums have a reviewable migration boundary and no webhook behavior is enabled.
- **Work-unit commit message:** `chore(order): stage payment status and stock marker schema [GAP-1 PR1+2]`

#### T-PR1+2-3-ledger-red
- **Goal:** Add failing model tests for required ledger fields, `eventId` uniqueness, allowed outcomes, and retention selection.
- **TDD step:** RED.
- **Files touched:** `test/api/webhook-ledger.test.ts`, `test/helpers/strapi-test-helpers.ts`.
- **Spec coverage:** R-SW-3, R-SW-9; S-SW-9 setup.
- **Test command:** `npm run test:only -- test/api/webhook-ledger.test.ts`.
- **Done when:** Tests fail only because the ledger schema/cron contract is not complete; duplicate `eventId` and invalid outcome are asserted.
- **Work-unit commit message:** `test(webhooks): specify ledger uniqueness and retention [GAP-1 PR1+2]`

#### T-PR1+2-4-transition-red
- **Goal:** Add failing pure-domain tests for all allowed and forbidden `payment_failed` transitions.
- **TDD step:** RED.
- **Files touched:** `test/unit/order-status-transition.test.ts`.
- **Spec coverage:** R-PFS-2; S-PFS-2, S-PFS-3, S-PFS-4.
- **Test command:** `npm run test:only -- test/unit/order-status-transition.test.ts`.
- **Done when:** Tests prove `pending→payment_failed`, `payment_failed→pending|cancelled`, and rejection of direct paid/processing/shipped/delivered/refunded recovery.
- **Work-unit commit message:** `test(order): specify payment failure transition matrix [GAP-1 PR1+2]`

#### T-PR1+2-5-constraint-marker-red
- **Goal:** Add failing integration assertions for unique `paymentIntentId`, default-false `stockDeducted`, and history enum acceptance.
- **TDD step:** RED.
- **Files touched:** `test/api/order-schema-contract.test.ts`.
- **Spec coverage:** R-PFS-1, R-PFS-4, R-OSA-4.
- **Test command:** `npm run test:only -- test/api/order-schema-contract.test.ts`.
- **Done when:** Tests explicitly fail against the pre-migration schema and detect duplicate PaymentIntent correlation.
- **Work-unit commit message:** `test(order): specify payment correlation and deduction marker [GAP-1 PR1+2]`

#### T-PR1+2-6-ledger-green
- **Goal:** Complete ledger attributes, private routes, and retention query so the ledger RED tests pass.
- **TDD step:** GREEN.
- **Files touched:** `src/api/webhook-event/content-types/webhook-event/schema.json`, `src/api/webhook-event/routes/webhook-event.ts`, `config/cron-tasks.ts`.
- **Spec coverage:** R-SW-3, R-SW-9; S-SW-9 persistence contract.
- **Test command:** `npm run test:only -- test/api/webhook-ledger.test.ts`.
- **Done when:** Unique duplicate rejection, `processed|unmatched` outcomes, no payload storage, and 90-day deletion tests pass.
- **Work-unit commit message:** `feat(webhooks): enforce transactional ledger schema [GAP-1 PR1+2]`

#### T-PR1+2-7-schema-domain-green
- **Goal:** Implement the new enum values, transition matrix, unique PaymentIntent field, and stock marker defaults.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/content-types/order/schema.json`, `src/api/order-status-history/content-types/order-status-history/schema.json`, `src/core/domain/order/order.types.ts`.
- **Spec coverage:** R-PFS-1, R-PFS-2, R-PFS-4; S-PFS-2, S-PFS-3, S-PFS-4.
- **Test command:** `npm run test:only -- test/unit/order-status-transition.test.ts test/api/order-schema-contract.test.ts`.
- **Done when:** All transition and schema contract RED tests pass, including `paid→payment_failed` for stock depletion.
- **Work-unit commit message:** `feat(order): add payment_failed state and stock marker [GAP-1 PR1+2]`

#### T-PR1+2-8-generated-types-green
- **Goal:** Regenerate Strapi types and update test factories for the new status and ledger records.
- **TDD step:** GREEN.
- **Files touched:** `types/generated/contentTypes.d.ts`, `test/helpers/strapi-test-helpers.ts`.
- **Spec coverage:** R-PFS-1, R-PFS-4; test support for R-SW-3.
- **Test command:** `npm run build && npm run test:only -- test/unit/order-status-transition.test.ts test/api/webhook-ledger.test.ts`.
- **Done when:** Generated types are build-produced, factories compile, and focused tests pass without hand-edit drift.
- **Work-unit commit message:** `chore(types): regenerate payment webhook content types [GAP-1 PR1+2]`

#### T-PR1+2-9-migration-refactor
- **Goal:** Refine schema metadata and record the pre-deploy duplicate audit, stock backfill, constraint sequencing, and rollback commands in the PR description.
- **TDD step:** REFACTOR.
- **Files touched:** `src/api/order/content-types/order/schema.json`, `src/api/webhook-event/content-types/webhook-event/schema.json`.
- **Spec coverage:** R-OSA-4, R-SW-3; D-DESIGN-8 migration safety.
- **Test command:** `npm run build`.
- **Done when:** The additive-first/unique-last order is documented, duplicate audit is required, and schema remains buildable.
- **Work-unit commit message:** `refactor(schema): document additive webhook migration boundary [GAP-1 PR1+2]`

#### T-PR1+2-10-regression
- **Goal:** Verify PR1+2 independently before allowing PR3 to consume its contracts.
- **TDD step:** REFACTOR.
- **Files touched:** `test/api/webhook-ledger.test.ts`, `test/api/order-schema-contract.test.ts`, `test/unit/order-status-transition.test.ts`.
- **Spec coverage:** R-PFS-1/R-PFS-2/R-PFS-4 and R-SW-3/R-SW-9 regression coverage.
- **Test command:** `npm run build && npm run test:only -- test/api/webhook-ledger.test.ts test/api/order-schema-contract.test.ts test/unit/order-status-transition.test.ts`.
- **Done when:** Focused suite and build pass; no handler or lifecycle behavior is enabled.
- **Work-unit commit message:** `test(gap-1): verify ledger and domain foundation [GAP-1 PR1+2]`

#### T-PR3-1-stock-seams
- **Goal:** Establish transaction-aware stock-service signatures and the persisted marker seam used by lifecycle and webhook code.
- **TDD step:** SETUP.
- **Files touched:** `src/api/order/services/order.ts`, `src/api/order/content-types/order/lifecycles.ts`.
- **Spec coverage:** R-OSA-1, R-OSA-5, R-OSA-6 scaffolding.
- **Test command:** `npm run build`.
- **Done when:** Optional transaction context and marker-aware service boundaries compile without changing existing behavior yet.
- **Work-unit commit message:** `refactor(order): prepare transaction-aware stock seams [GAP-1 PR3]`

#### T-PR3-2-stock-helper-red
- **Goal:** Add failing tests for guarded relative decrement, insufficient stock, and CAS idempotency.
- **TDD step:** RED.
- **Files touched:** `test/api/order-stock-management.test.ts`.
- **Spec coverage:** R-OSA-5, R-OSA-6; S-OSA-1 and S-OSA-2 stock outcomes.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts`.
- **Done when:** Tests fail against read-then-write behavior and require no negative stock plus one marker claim.
- **Work-unit commit message:** `test(stock): specify atomic guarded decrement [GAP-1 PR3]`

#### T-PR3-3-stock-helper-green
- **Goal:** Implement atomic product updates and `decrementStockOnce` with ambient transaction support.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/order.ts`.
- **Spec coverage:** R-OSA-1, R-OSA-5, R-OSA-6; S-OSA-2.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts`.
- **Done when:** Guarded SQL works on SQLite/Postgres paths, failed decrement raises the expected application error, and repeated claims are no-ops.
- **Work-unit commit message:** `feat(stock): add atomic exactly-once decrement helper [GAP-1 PR3]`

#### T-PR3-4-create-lifecycle-red
- **Goal:** Add failing lifecycle tests proving creation never decrements stock while pre-create validation still rejects insufficient stock.
- **TDD step:** RED.
- **Files touched:** `test/api/order-stock-management.test.ts`, `test/api/order-security-lifecycle.test.ts` (read-only existing scenarios).
- **Spec coverage:** R-OSA-2, R-OSA-3; S-OSA-1, S-OSA-2, S-OSA-5.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts test/api/order-security-lifecycle.test.ts`.
- **Done when:** RED assertions cover pending and paid creation stock unchanged, and `Insufficient stock` returns 4xx with no Order.
- **Work-unit commit message:** `test(order): specify payment-authoritative lifecycle stock rules [GAP-1 PR3]`

#### T-PR3-5-create-lifecycle-green
- **Goal:** Remove create-time decrement, preserve `beforeCreate` validation, gate paid email, and gate restoration on `stockDeducted`.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/content-types/order/lifecycles.ts`.
- **Spec coverage:** R-OSA-2, R-OSA-3, R-PFS-3, R-PFS-7; S-OSA-1, S-OSA-2, S-OSA-5, S-PFS-3.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts test/api/order-security-lifecycle.test.ts`.
- **Done when:** Creation leaves stock untouched, validation remains fail-closed, and cancellation/refund restores only previously deducted stock.
- **Work-unit commit message:** `feat(order): move stock authority off afterCreate [GAP-1 PR3]`

#### T-PR3-6-enrichment-red
- **Goal:** Add failing tests for paid shell enrichment, exactly-once enrichment, and depleted-stock failure handling.
- **TDD step:** RED.
- **Files touched:** `test/api/order-stock-management.test.ts`, `test/api/stripe-payment-intent-webhook.test.ts`.
- **Spec coverage:** R-OSA-1, R-OSA-4; S-OSA-3, S-OSA-6.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** Tests demonstrate an enriched paid shell needs one decrement and depleted stock requires `payment_failed` audit plus documented manual refund.
- **Work-unit commit message:** `test(stock): specify shell enrichment and depletion recovery [GAP-1 PR3]`

#### T-PR3-7-enrichment-green
- **Goal:** Add the paid/enrichment gate before unchanged-status return and implement the depleted-stock transition without phantom restoration.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/content-types/order/lifecycles.ts`, `src/api/order/services/order.ts`.
- **Spec coverage:** R-OSA-1, R-OSA-4, R-OSA-5; S-OSA-3, S-OSA-6.
- **Test command:** `npm run test:only -- test/api/order-stock-management.test.ts test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** Shell enrichment decrements once, depletion stores `stock_depleted` and transitions to `payment_failed`, and no automatic refund is attempted.
- **Work-unit commit message:** `feat(stock): reconcile paid enrichment exactly once [GAP-1 PR3]`

#### T-PR4a-1-reconciliation-scaffold
- **Goal:** Create the reconciliation service seam, webhook-context/on-commit seam, and default-off kill-switch check.
- **TDD step:** SETUP.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/services/stripe-webhook.ts`.
- **Spec coverage:** R-SW-1, R-SW-2, R-SW-8; D-DESIGN-1 and D-DESIGN-7 scaffolding.
- **Test command:** `npm run build`.
- **Done when:** New service exports succeeded/reconciliation entry points, kill-switch defaults false, and existing refund code remains reachable.
- **Work-unit commit message:** `feat(stripe-webhook): scaffold payment reconciliation service [GAP-1 PR4a]`

#### T-PR4a-2-dispatch-red
- **Goal:** Add failing endpoint tests for signature-before-processing, unhandled ack, kill-switch-off behavior, HTTP mapping, and unchanged five-test refund coverage.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`, `test/api/stripe-webhook.test.ts` (read-only regression fixture).
- **Spec coverage:** R-SW-1, R-SW-2, R-SW-7, R-SW-8; S-SW-10.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts test/api/stripe-webhook.test.ts`.
- **Done when:** Tests fail for missing dispatch/kill-switch handling while the five existing refund cases remain executable.
- **Work-unit commit message:** `test(stripe-webhook): specify verified dispatch and kill switch [GAP-1 PR4a]`

#### T-PR4a-3-dispatch-green
- **Goal:** Dispatch succeeded events to reconciliation after verification and preserve unhandled/refund/error mappings.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/stripe-webhook.ts`.
- **Spec coverage:** R-SW-1, R-SW-2, R-SW-7, R-SW-8; S-SW-10.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts test/api/stripe-webhook.test.ts`.
- **Done when:** Invalid signatures/config/raw body return 400, processing errors return 500, unhandled events ack 200, and refunds still pass.
- **Work-unit commit message:** `feat(stripe-webhook): dispatch verified payment intent events [GAP-1 PR4a]`

#### T-PR4a-4-pending-success-red
- **Goal:** Add failing client-first tests for pending-to-paid transition, status history/email, and one stock decrement.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`.
- **Spec coverage:** R-SW-4, R-OSA-1, R-OSA-5; S-SW-2.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** RED assertions require `pending→paid`, ledger row, history, post-commit notification registration, and exact stock decrement.
- **Work-unit commit message:** `test(stripe-webhook): specify client-first succeeded reconciliation [GAP-1 PR4a]`

#### T-PR4a-5-pending-success-green
- **Goal:** Implement transactional client-first succeeded reconciliation and post-commit email registration.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/content-types/order/lifecycles.ts`.
- **Spec coverage:** R-SW-4, R-SW-9, R-OSA-1, R-OSA-5; S-SW-2.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** One transaction writes ledger/status/history/stock, commits before network email, and Stripe receives 200.
- **Work-unit commit message:** `feat(stripe-webhook): reconcile pending orders on succeeded [GAP-1 PR4a]`

#### T-PR4a-6-shell-red
- **Goal:** Add failing D+ tests for webhook-first shell creation and later enrichment without duplicate email or stock deduction.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`.
- **Spec coverage:** R-SW-4, R-OSA-1; S-SW-1, S-OSA-1, S-OSA-3.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** RED tests require shell fields, connected user, paid status, empty items, reconciliation source, one email, then exactly one enrichment decrement.
- **Work-unit commit message:** `test(stripe-webhook): specify D-plus shell reconciliation [GAP-1 PR4a]`

#### T-PR4a-7-shell-green
- **Goal:** Create and correlate D+ shells by orderId then paymentIntentId through Document Service lifecycle-safe writes.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/content-types/order/lifecycles.ts`.
- **Spec coverage:** R-SW-4, R-SW-6, R-OSA-1, R-OSA-4; S-SW-1, S-SW-6, S-OSA-1, S-OSA-3.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** Shell creation uses `metadata.userId`, infers total from amount, preserves source marker, and enrichment bypasses duplicate email.
- **Work-unit commit message:** `feat(stripe-webhook): create and enrich orphan payment shells [GAP-1 PR4a]`

#### T-PR4a-8-ledger-race-red
- **Goal:** Add failing tests for duplicate event IDs, missing metadata fallback/warn, late succeeded events, concurrent arrival, and rollback-on-processing-error.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`, `test/helpers/strapi-test-helpers.ts`.
- **Spec coverage:** R-SW-3, R-SW-4, R-SW-6, R-SW-9, R-OSA-4; S-SW-3, S-SW-6, S-SW-7, S-SW-8, S-SW-9, S-OSA-4.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** RED tests assert zero duplicate side effects, exact warning text, late-event ack, one Order/stock claim under `Promise.all`, and ledger rollback after a thrown handler.
- **Work-unit commit message:** `test(stripe-webhook): specify idempotency and race safety [GAP-1 PR4a]`

#### T-PR4a-9-ledger-race-green
- **Goal:** Complete transactional ledger-first processing, unique-violation duplicate ack, correlation fallback, late guards, and race-safe exactly-once behavior.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/services/stripe-webhook.ts`, `src/api/order/services/order.ts`.
- **Spec coverage:** R-SW-3, R-SW-4, R-SW-6, R-SW-9, R-OSA-4; S-SW-3, S-SW-6, S-SW-7, S-SW-8, S-SW-9, S-OSA-4.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** Duplicate events ack without writes, crashes leave no ledger row, missing metadata warns/acks, late states do not transition, and concurrent delivery leaves one Order and one decrement.
- **Work-unit commit message:** `feat(stripe-webhook): enforce transactional idempotent reconciliation [GAP-1 PR4a]`

#### T-PR4b-1-failure-scaffold
- **Goal:** Prepare failure payload mapping, redaction boundary, and the legacy refund terminal-guard seam.
- **TDD step:** SETUP.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/services/stripe-webhook.ts`.
- **Spec coverage:** R-SW-5, R-PFS-5, R-PFS-6, R-PFS-7 scaffolding.
- **Test command:** `npm run build`.
- **Done when:** Failure handling has typed inputs for `last_payment_error`/`failure_message` and no sensitive fields are persisted by default.
- **Work-unit commit message:** `feat(stripe-webhook): scaffold failed-payment reconciliation [GAP-1 PR4b]`

#### T-PR4b-2-failure-red
- **Goal:** Add failing tests for pending failure transition, exact redacted audit, notification note, missing Order warning, and no-order 200.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`.
- **Spec coverage:** R-SW-5, R-PFS-5, R-PFS-6; S-SW-4, S-SW-5, S-PFS-1, S-PFS-5.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** RED assertions require only `{ code, failure_message }`, exclude message/decline/payment-method details, and verify the exact email note.
- **Work-unit commit message:** `test(stripe-webhook): specify failed-payment redaction and audit [GAP-1 PR4b]`

#### T-PR4b-3-failure-green
- **Goal:** Implement transactional failed-event correlation, `pending→payment_failed`, redacted audit, and post-commit notification.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/content-types/order/lifecycles.ts`, `src/api/order/services/stripe-webhook.ts`.
- **Spec coverage:** R-SW-5, R-SW-9, R-PFS-5, R-PFS-6, R-PFS-7; S-SW-4, S-SW-5, S-PFS-1, S-PFS-5.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts`.
- **Done when:** Existing pending Orders transition once, audit is redacted, email is opt-out aware, and unmatched failures warn/ack without writes beyond the ledger outcome.
- **Work-unit commit message:** `feat(stripe-webhook): record redacted payment failures [GAP-1 PR4b]`

#### T-PR4b-4-transition-guard-red
- **Goal:** Add failing tests for retry-to-pending, cancel-after-failure, direct-recovery rejection, no stock restoration, and failed-order refund guard.
- **TDD step:** RED.
- **Files touched:** `test/api/stripe-payment-intent-webhook.test.ts`, `test/api/order-status-transition-validation.test.ts`.
- **Spec coverage:** R-PFS-2, R-PFS-3, R-PFS-7; S-PFS-2, S-PFS-3, S-PFS-4.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts test/api/order-status-transition-validation.test.ts`.
- **Done when:** Tests prove retry history, cancellation without restore, rejection of direct paid recovery, no shipment/refund, and refund webhook acknowledgement.
- **Work-unit commit message:** `test(order): specify payment failure recovery guards [GAP-1 PR4b]`

#### T-PR4b-5-transition-guard-green
- **Goal:** Implement failure recovery semantics and prevent `charge.refunded` from retry-storming on `payment_failed` orders.
- **TDD step:** GREEN.
- **Files touched:** `src/api/order/content-types/order/lifecycles.ts`, `src/api/order/services/stripe-webhook.ts`, `src/core/domain/order/order.types.ts`.
- **Spec coverage:** R-PFS-2, R-PFS-3, R-PFS-7, R-SW-7; S-PFS-2, S-PFS-3, S-PFS-4, S-SW-10.
- **Test command:** `npm run test:only -- test/api/stripe-payment-intent-webhook.test.ts test/api/order-status-transition-validation.test.ts test/api/stripe-webhook.test.ts`.
- **Done when:** Retry/cancel transitions pass, invalid bypasses fail, no phantom restore/refund/shipment occurs, and all five refund tests remain green.
- **Work-unit commit message:** `feat(order): enforce payment failure recovery semantics [GAP-1 PR4b]`

#### T-PR4b-6-regression-refactor
- **Goal:** Refactor duplicated failure mapping, verify the complete release, and preserve the documented manual-refund path for depleted stock.
- **TDD step:** REFACTOR.
- **Files touched:** `src/api/order/services/payment-reconciliation.ts`, `src/api/order/services/stripe-webhook.ts`, `src/api/order/content-types/order/lifecycles.ts`, `types/generated/contentTypes.d.ts`.
- **Spec coverage:** All R-SW, R-OSA, and R-PFS requirements; all 21 scenarios, especially S-SW-10 and S-PFS-5.
- **Test command:** `npm run build && npm run lint && npm run test:only`.
- **Done when:** Build, lint, full Vitest suite, and unchanged refund regression pass; deployment remains `STRIPE_PI_WEBHOOKS_ENABLED=false` until frontend UPSERT is ready.
- **Work-unit commit message:** `refactor(gap-1): finalize payment webhook release verification [GAP-1 PR4b]`

## Cross-PR Sequencing

```text
PR1+2 (ledger + schema/domain) ──→ main
                                  └─→ PR3 (stock authority) ──→ main
                                                                  └─→ PR4a (succeeded) ──→ main
                                                                                              └─→ PR4b (failed) ──→ main
Final production deploy: kill-switch OFF
                         → flip STRIPE_PI_WEBHOOKS_ENABLED=true alongside frontend Gap #3 UPSERT PR
```

## Out-of-Scope Tasks

- Frontend Gap #3 UPSERT implementation, retry logic beyond the locked contract, and frontend status/email changes.
- Gap #4 PaymentIntent idempotency key, Gap #5 broader inventory reservation/refactor, taxes, and browser E2E.
- Refactoring `charge.refunded` to Document Service, automatic refunds for depleted stock, and historical inconsistent-row migration.

## Risks & Mitigations per PR

- **PR1+2:** Existing duplicate `paymentIntentId` values can block the unique index; require the production audit/dedupe sign-off before constraint deployment. Stock-marker backfill can misclassify legacy rows; use the design status-based backfill and review counts. Generated types can drift; gate merge on `npm run build`.
- **PR3:** SQLite cannot validate PostgreSQL locking fully; use guarded relative updates and verify outcomes with focused tests. Lifecycle hooks can restore phantom stock; gate restoration on `stockDeducted`. Depleted shell stock can create a paid-without-stock state; transition to `payment_failed` and document manual Stripe refund.
- **PR4a:** Duplicate deliveries can double side effects; insert the unique ledger row first inside `strapi.db.transaction`. Webhook/client races can duplicate shells; rely on unique `orderId`/`paymentIntentId` and retry-safe correlation. Email/network I/O can hold locks; defer it through `onCommit`.
- **PR4b:** Stripe failure payloads can contain sensitive details; whitelist only `code` and `failure_message`. Failure-to-cancel could restore stock never deducted; marker-gate restoration. Legacy refund delivery could become a 500 loop; warn and acknowledge `payment_failed` refund cases.

## References

- `openspec/config.yaml`; `openspec/changes/sprint-5-stripe-webhook/{exploration.md,proposal.md,design.md}`.
- `openspec/changes/sprint-5-stripe-webhook/specs/stripe-payment-webhooks/spec.md` (R-SW-1..9, S-SW-1..10).
- `openspec/changes/sprint-5-stripe-webhook/specs/order-stock-authority/spec.md` (R-OSA-1..6, S-OSA-1..6).
- `openspec/changes/sprint-5-stripe-webhook/specs/payment-failed-status/spec.md` (R-PFS-1..7, S-PFS-1..5).
- `src/api/order/services/stripe-webhook.ts`, `src/api/order/services/order.ts`, `src/api/order/content-types/order/lifecycles.ts`, `src/api/order/content-types/order/schema.json`, `src/api/order-status-history/content-types/order-status-history/schema.json`, `src/core/domain/order/order.types.ts`.
- `test/api/stripe-webhook.test.ts`, `test/helpers/strapi-test-helpers.ts`.
- Engram observations #1731, #320, #1744, #1745, #1746, #1747, #1748; design sections D-DESIGN-1..8, §4, §5, §7.
