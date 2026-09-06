# Capability: stripe-payment-webhooks

## Purpose
Server-side processing of Stripe `payment_intent.succeeded` and `payment_intent.payment_failed` with signature verification, idempotency via a unique `webhook_events` ledger, and correlation by `metadata.orderId` then `paymentIntentId`. Orphan payments create a shell; later `useCreateOrder` enriches. The `charge.refunded` branch is preserved unchanged.

## Requirements

### R-SW-1 Signature Verification
MUST verify the Stripe signature BEFORE any processing. Signature/config failures throw, surfacing as HTTP 400 (no Stripe retry).

### R-SW-2 Event-Type Dispatch
MUST dispatch on `event.type` to `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` (existing), or unhandled. Unhandled MUST ack 200 with no side effects.

### R-SW-3 Idempotency Ledger
MUST persist a `webhook_events` row keyed on `event.id` (unique) BEFORE processing. Duplicate `event.id` MUST ack 200 with no side effects.

### R-SW-4 Payment Intent Succeeded
On `payment_intent.succeeded` MUST extract `paymentIntentId`, `metadata.orderId`, `metadata.userId`; lookup by `orderId` (unique) first, then `paymentIntentId`. Outcomes:
- No Order → shell (`orderStatus: 'paid'`, `items: []`, `paymentInfo: { source: 'webhook_reconciliation' }`).
- Order `paid` → ack 200, no side effects (idempotent re-delivery).
- Order `pending` → transition to `paid`; stock decrement fires (see `order-stock-authority`).
- Order in `[processing, shipped, delivered, cancelled, refunded, payment_failed]` → `[GAP-1] Late succeeded event, orderStatus=...` warn + ack 200.

### R-SW-5 Payment Intent Failed
On `payment_intent.payment_failed` MUST locate Order by `metadata.orderId` (preferred) then `paymentIntentId`. Found: transition to `payment_failed` (subject to `VALID_TRANSITIONS`) + store redacted audit in `paymentInfo.paymentError`. Terminal `cancelled|refunded` → ack 200, no transition. Missing → `[GAP-1] payment_failed with no matching Order` warn + ack 200.

### R-SW-6 Missing Metadata Fallback
Absent `metadata.orderId` → MUST lookup by `paymentIntentId`; if unmatched, MUST log `[GAP-1] No metadata.orderId, paymentIntentId=...` warn + ack 200 (no NACK storm).

### R-SW-7 Refund Regression
`charge.refunded` MUST continue working unchanged; the five existing tests at `test/api/stripe-webhook.test.ts` MUST pass.

### R-SW-8 HTTP Error Mapping
Signature/config/raw-body errors → HTTP 400 (no Stripe retry); processing errors → HTTP 500 (Stripe retries). Per `controllers/order.ts:338-350`.

### R-SW-9 Transactional Ledger
The `webhook_events` insert and processing MUST commit/rollback together so a Stripe retry re-processes a crashed event.

## Scenarios

### S-SW-1 Succeeded, No Order
- GIVEN no Order exists and `metadata.orderId` is present
- WHEN `payment_intent.succeeded` arrives
- THEN a shell is created with `orderStatus: 'paid'`, `items: []`, `paymentInfo.source: 'webhook_reconciliation'`, response 200.

### S-SW-2 Succeeded, Pending Order
- GIVEN an Order with `orderStatus: 'pending'`
- WHEN `payment_intent.succeeded` arrives
- THEN status transitions to `paid` and stock is decremented exactly once.

### S-SW-3 Succeeded Re-Delivery, Paid
- GIVEN an Order with `orderStatus: 'paid'`
- WHEN `payment_intent.succeeded` is re-delivered
- THEN HTTP 200 with no side effects.

### S-SW-4 Payment Failed, Pending Order
- GIVEN an Order with `orderStatus: 'pending'`
- WHEN `payment_intent.payment_failed` arrives
- THEN status transitions to `payment_failed` with redacted audit in `paymentInfo.paymentError`.

### S-SW-5 Payment Failed, No Order
- GIVEN no Order exists
- WHEN `payment_intent.payment_failed` arrives
- THEN `[GAP-1] payment_failed with no matching Order` warn logged, response 200.

### S-SW-6 Missing Metadata, Order By PaymentIntent
- GIVEN an Order exists for `paymentIntentId`, `metadata.orderId` absent
- WHEN a payment-intent event arrives
- THEN handler processes normally.

### S-SW-7 Missing Metadata, No Order
- GIVEN no Order and `metadata.orderId` absent
- WHEN any payment-intent event arrives
- THEN `[GAP-1] No metadata.orderId, paymentIntentId=...` warn logged, response 200.

### S-SW-8 Late Succeeded, Processing Order
- GIVEN an Order with `orderStatus: 'processing'`
- WHEN `payment_intent.succeeded` arrives out of order
- THEN `[GAP-1] Late succeeded event, orderStatus=processing` warn logged, response 200.

### S-SW-9 Duplicate Event ID
- GIVEN a `webhook_events` row exists with the same `event.id`
- WHEN the event is re-delivered
- THEN HTTP 200 with no side effects.

### S-SW-10 Refund Regression
- GIVEN the five existing `charge.refunded` tests
- WHEN this change ships
- THEN all five tests pass unchanged.

## Out of Scope
- Gap #3 frontend UPSERT (contract only); Gaps #4–#7.

## Open Questions
None. Decisions 1, 4, 5, 7, 8, 11 in `proposal.md`.

## References
- `src/api/order/services/stripe-webhook.ts`, `controllers/order.ts:323-352`
- `proposal.md`, `exploration.md`
- Engram #1731, #1744, #1745
- Stripe: webhook retries, signature verification