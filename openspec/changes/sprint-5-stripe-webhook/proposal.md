# Proposal: Sprint 5 — Gap #1: Stripe webhooks for payment intents

## Summary

This change makes the backend the server-side authority for payment outcomes. Today the Stripe webhook only handles `charge.refunded` and the client marks orders `paid`. We add `payment_intent.succeeded` and `payment_intent.payment_failed` handlers, move stock authority from `afterCreate` to the confirmed-payment webhook path, introduce a `payment_failed` order status, and harden reconciliation with a unique `paymentIntentId`, an idempotency ledger (`webhook_events`), and a cross-repo UPSERT contract with the frontend. All four blocking decisions are locked (see Key Design Decisions) — this proposal scopes and sequences the work; it does not revisit them.

## Context & Sprint 5 Alignment

Sprint 5 — Stripe Payments Hardening (Engram #1731): Gap #1 is priority 🔴 ALTO; the audit placed the payments module at ~80–85% soft-launch readiness, with Gaps #1/#2/#4 closing it to ~95%. Gap #2 (metadata contract) already shipped via frontend PR #127, which sends `metadata.orderId` / `metadata.userId` server-side — the correlation contract this cycle consumes. Per convention, cross-repo cycles live in the backend. Preflight: Interactive pace, OpenSpec store, ask-on-risk PR strategy, 400-line review budget.

## Problem Statement

- Webhook handles only `charge.refunded` (`src/api/order/services/stripe-webhook.ts:48-85`); unhandled events are acked and dropped.
- `paid` status is set client-side (`useCreateOrder` / `assembleOrderData`) — the server never verifies the PaymentIntent.
- **Orphan payments**: if the webhook arrives before `useCreateOrder`, the `paymentIntentId` lookup finds nothing, returns 200, and a successful payment exists in Stripe with no backend Order.
- **Ghost stock**: `afterCreate` decrements stock before payment is confirmed (`lifecycles.ts:174-185`).
- No `payment_failed` state, no event-ID ledger (idempotency is only a status guard), and `paymentIntentId` is not unique (`schema.json:50-52`).

## Proposed Solution (High-Level)

Locked decisions (Engram #1744 + interactive session):

1. **Orphan contract = D+**: `payment_intent.succeeded` with no matching Order creates a shell Order (`orderId`, `userId`, `paymentIntentId`, `total`, `orderStatus: 'paid'`, `items: []`, `paymentInfo: { source: 'webhook_reconciliation' }`). A later `useCreateOrder` **UPSERTs by `orderId`** (enriches with items/subtotal/shipping) instead of INSERTing. Hardening add-ons, all required: (1) unique constraint on `paymentIntentId`, (2) frontend UPSERT in `useCreateOrder` (cross-repo contract, Gap #3 follow-up), (3) `webhook_events` Strapi model with unique `event.id` (outbox/idempotency ledger).
2. **Stock authority = B**: stock decrements in the `payment_intent.succeeded` handler; the `afterCreate` decrement (lifecycles.ts:174-185) is removed/gated; `beforeCreate` stock validation (lifecycles.ts:128-150) stays as a pre-payment UX guard.
3. **Failure status = B**: new `payment_failed` enum value in Order schema, order-status-history `fromStatus`/`toStatus` enums, `OrderStatus` type, and `VALID_TRANSITIONS`.
4. **Missing metadata = C**: no `metadata.orderId` → `paymentIntentId` lookup; if still unmatched, log `[GAP-1] No metadata.orderId, paymentIntentId=...` at `warn` and ack 200 (no NACK).

New handlers follow the Strapi v5 Document Service convention (Engram #320); the existing `charge.refunded` branch keeps its current behavior.

## Scope

### In scope

- `payment_intent.succeeded` handler: correlation (paymentIntentId → metadata.orderId), shell creation (D+), status transition, exactly-once stock decrement, initial email.
- `payment_intent.payment_failed` handler: status transition + redacted failure audit in `paymentInfo.paymentError`.
- Schema migrations: unique `paymentIntentId`; `payment_failed` in Order + order-status-history enums; regenerate generated types.
- New `webhook_events` content type (unique `event.id`) wired before event processing.
- Order lifecycle refactor: remove/gate `afterCreate` stock decrement; guard against double email/stock on enrichment.
- Tests (strict TDD, Vitest): ~10 new integration tests; all 5 existing webhook tests green.
- OpenSpec phases: spec → design → tasks → apply → verify → archive.

### Out of scope

- Gap #2 (shipped), Gap #3 frontend retry (only the UPSERT contract is defined here), Gap #4 idempotency key, Gap #5 stock refactor beyond what #1 requires, Gap #6 taxes, Gap #7 E2E.
- Refactor of the existing `charge.refunded` branch (may migrate to Document Service as a design sub-decision, not required).
- The frontend UPSERT PR itself (follow-up; contract locked here).

### Capabilities (contract with sdd-spec)

**New:**
- `stripe-payment-webhooks`: signature-verified processing of `payment_intent.succeeded` / `payment_intent.payment_failed` — D+ shell creation, correlation order, missing-metadata fallback, idempotency via `webhook_events`.
- `order-stock-authority`: stock decrements only on confirmed payment; `afterCreate` decrement removed; exactly-once across both arrival orders.
- `payment-failed-status`: new `OrderStatus` value, transition rules, history enums, redacted failure audit contract.

**Modified:** None (`openspec/specs/` is empty — no existing spec-level capabilities).

## Cross-Repo Contract

**Backend guarantees**
- `metadata.orderId` / `metadata.userId` are trusted: they are set server-side behind `requireUser` with the session user (frontend `app/api/create-payment-intent/route.ts:15-41`, verified in obs #1744), and only inside signature-verified events.
- On duplicate `orderId` arrival the backend UPSERTs: enrich an existing shell; never create a second Order (`orderId` already unique; `paymentIntentId` becomes unique).

**Frontend must (Gap #3 follow-up PR)**
- Change `useCreateOrder` from INSERT to **UPSERT by `orderId`**: if the Order exists, enrich (items, subtotal, shipping); otherwise create.
- Stop being the authority on `paid` — server confirms.

**Sequenced rollout (explicit window):** until the frontend UPSERT PR lands, a client INSERT racing a webhook-created shell will hit the unique `orderId` constraint and get a 4xx. The shell only exists in the race window (webhook beat `useCreateOrder`), so exposure is small, but the frontend PR MUST follow immediately; the rollout order is documented in tasks.

**Contract delta (PR #127 → PR #127+1):** #127 = PaymentIntent carries `metadata.orderId`/`metadata.userId`; client INSERTs full Order as `paid`. #127+1 = same metadata contract, but Order creation becomes UPSERT-by-`orderId` and payment status becomes server-authoritative via webhook.

## Key Design Decisions

| # | Decision | Choice | One-line rationale |
|---|----------|--------|--------------------|
| 1 | Orphan contract | D+ (shell + UPSERT) | No new cross-repo metadata PR needed; closes orphan payments now (obs #1744). |
| 2 | Stock authority | B (webhook decrements) | Stock reserved only on confirmed payment; kills ghost stock. |
| 3 | Failure status | B (new `payment_failed`) | Failure ≠ cancellation; clean audit + retry semantics. |
| 4 | Missing metadata | C (lookup → warn → ack 200) | No NACK storms on legacy PaymentIntents; operator visibility via logs. |
| 5 | Add-on: unique `paymentIntentId` | Schema migration | Closes webhook-vs-`useCreateOrder` race; safe `findMany` correlation. |
| 6 | Add-on: UPSERT in `useCreateOrder` | Frontend contract | Late arrival enriches instead of failing/duplicating. |
| 7 | Add-on: `webhook_events` ledger | Unique `event.id` | Real idempotency + safe retry if Strapi dies mid-processing. |
| 8 | Idempotency boundary (design) | Status check + ledger | Status guards steady state; ledger guards duplicates/crashes. |
| 9 | Failure audit (design) | Store `failure_message` + minimal error code in `paymentInfo.paymentError`; redact `last_payment_error.message`, `decline_code`, payment_method_details | Auditability without sensitive card-decline detail. |
| 10 | Email semantics (design) | Shell-created paid Order sends the same initial purchase email, exactly once | Parity with client-created orders; no double send on enrichment. |
| 11 | API layer (design) | New logic on Document Service (obs #320); `charge.refunded` stays on Entity Service for now | Follows v5 convention without churning working code. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Race: webhook + `useCreateOrder` simultaneous for same `orderId` | Med | Add-on #1 (unique `paymentIntentId`) + existing unique `orderId` + UPSERT semantics (design defines the loser path). |
| Duplicate webhook delivery (Stripe retries up to 3 days) | High | Add-on #3 (`webhook_events` unique `event.id`) + status-based guards; duplicates acked with no side effects. |
| Metadata spoofing | Low | Metadata only trusted inside signature-verified events; `orderId`/`userId` set server-side behind `requireUser` (frontend `route.ts:15-41`). |
| Stock timing: exactly-once decrement across webhook-first vs client-first, shell has `items: []` | Med | Single authority (Decision B); decrement trigger defined in design keyed on confirmed payment + known items; add-on #1 serializes the race. |
| Cross-repo sequenced rollout (frontend still INSERTs until Gap #3 PR) | Med | Ship frontend UPSERT PR immediately after; window only opens in the race path; rollout order fixed in tasks. |
| Production schema migration — unique `paymentIntentId` FAILS if existing rows hold duplicate values | Med | Pre-deploy data audit/dedupe of `paymentIntentId`; enum additions are additive; rollback steps below. **Destructive delta — flagged per `rules.archive`.** |
| Double email: shell creation fires initial email AND enrichment fires it again | Med | Design decision: email fires exactly once; enrichment skips new-order email when `paymentInfo.source === 'webhook_reconciliation'`. |
| Generated types drift | Low | `npm run build` regenerates `types/generated/`; CI build gate. |

## Rollback Plan

1. **Code**: change lands as work-unit commits (per `work-unit-commits`) → `git revert` restores prior handler/lifecycle behavior.
2. **`payment_failed` enum**: reversible — Strapi accepts enum-value removal while no rows use it; if rows exist, migrate them (e.g., to `pending`/`cancelled`) before dropping the value. Reverse order: rows first, schema second.
3. **Unique `paymentIntentId`**: drop the constraint (trivial, additive reversal).
4. **`webhook_events`**: delete the content type and drop the table; nothing else references it.
5. **Stock authority**: reverting restores the `afterCreate` decrement; manually reconcile any in-flight orders paid under the new regime that were never webhook-decremented (runbook entry in tasks).
6. Optional design consideration: an env gate for the new handlers to disable them in production without a revert.

## Success Criteria

- [ ] All 5 existing `test/api/stripe-webhook.test.ts` tests pass unchanged.
- [ ] ~10 new integration tests pass (strict TDD): `payment_intent.succeeded` ×3 (client-first `pending→paid` + stock decrement; webhook-first shell creation; idempotent re-delivery on already-paid), `payment_intent.payment_failed` ×3 (existing order → `payment_failed` + redacted audit; retry `payment_failed→pending`; failure with no Order), idempotency ×2 (same `event.id` acked, ledger row written, no double side effects), race ×1 (concurrent shell + `useCreateOrder` → one Order, stock decremented once), missing metadata ×1 (`warn` log + 200 ack).
- [ ] No regression in Order lifecycle test suites.
- [ ] `npm run build` exit 0; `npm run lint` exit 0; `npm run test:only` exit 0.

## References

- `openspec/changes/sprint-5-stripe-webhook/exploration.md` — investigation input (7 findings, 8 open questions, all resolved).
- `openspec/config.yaml` — project rules (strict TDD, Vitest, proposal/archive rules).
- `src/api/order/services/stripe-webhook.ts`, `src/api/order/controllers/order.ts:323-352`, `src/api/order/routes/01-custom.ts` — webhook entry path.
- `src/api/order/content-types/order/lifecycles.ts`, `src/api/order/content-types/order/schema.json`, `src/core/domain/order/order.types.ts`, `src/api/order-status-history/content-types/order-status-history/schema.json` — affected areas.
- Engram #1731 (`sprint-5-stripe-hardening`), #320 (`sdd-init/...`), #1744 (`sdd/sprint-5-stripe-webhook/decisions`).
- Frontend PR #127; `e-commerce-relojes-bv-beni/src/app/api/create-payment-intent/route.ts:15-41`, `src/features/checkout/services/createPaymentIntentService.ts:106-181`, `src/features/checkout/hooks/useCreateOrder.ts:37-107`.
- Stripe: [webhook deliveries/retries](https://docs.stripe.com/webhooks), [signature verification](https://docs.stripe.com/webhooks/signatures), [PaymentIntent status verification](https://docs.stripe.com/payments/payment-intents/verifying-status).
