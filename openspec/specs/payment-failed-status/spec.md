# Capability: payment-failed-status

## Purpose
`payment_failed` is part of the Order status vocabulary with explicit transition rules, redacted failure audit stored in `paymentInfo.paymentError`, and notification semantics. The capability distinguishes a Stripe payment failure from user-initiated cancellation and from cancellation that stems from a payment failure.

## Requirements

### R-PFS-1 Enum Addition
`OrderStatus` MUST include `payment_failed`. The Order schema enum, `order-status-history.fromStatus` and `toStatus` enums, generated types, and the `OrderStatus` TypeScript type MUST be updated.

### R-PFS-2 Transition Rules
`VALID_TRANSITIONS` MUST allow: `pending → payment_failed` (failure while pending), `payment_failed → pending` (retry succeeded; webhook or manual), `payment_failed → cancelled` (user abandons after failure). MUST NOT allow: `payment_failed → paid` (no direct recovery), `payment_failed → processing|shipped|delivered|refunded` (no bypass).

### R-PFS-3 Terminal Semantics
`payment_failed` MUST NOT auto-create a Shipment, MUST NOT auto-trigger a refund, MUST NOT auto-send a "purchase confirmed" email. Emails for `payment_failed` fire only when an explicit transition rule fires them (R-PFS-6).

### R-PFS-4 History Enums
`order-status-history.fromStatus` and `toStatus` enums MUST include `payment_failed`.

### R-PFS-5 Redacted Audit
`paymentInfo.paymentError` MUST contain `{ code: string, failure_message: string }`. MUST NOT contain `last_payment_error.message`, `decline_code`, or any payment-method detail (PAN, expiry, CVV, billing address, payment_method_details).

### R-PFS-6 Customer Notification
When an Order enters `payment_failed`, `sendOrderEmailWebhook` MUST be called with `statusChangeNote: 'Payment failed: <failure_message>'`. Email is opt-out via `DISABLE_EMAIL_NOTIFICATIONS=true`.

### R-PFS-7 Stock Contract For payment_failed
Per `order-stock-authority`, stock MUST be decremented only on confirmed payment. `payment_failed` by definition means payment was never confirmed, so stock MUST NOT be decremented when entering `payment_failed`. Cancellation from `payment_failed` therefore restores nothing (nothing was decremented); a retry transition `payment_failed → pending` followed by a successful `payment_intent.succeeded` triggers the normal webhook stock-decrement path.

## Scenarios

### S-PFS-1 Payment Failed On Pending Order
- GIVEN an Order exists with `orderStatus: 'pending'`
- WHEN `payment_intent.payment_failed` arrives
- THEN status transitions to `payment_failed`
- AND `paymentInfo.paymentError` is stored with redacted fields only
- AND customer email is sent (unless `DISABLE_EMAIL_NOTIFICATIONS=true`).

### S-PFS-2 Retry To Pending
- GIVEN an Order exists with `orderStatus: 'payment_failed'`
- WHEN the retry transitions the Order to `pending`
- THEN status history records both transitions
- AND stock behavior follows capability 2: no stock was decremented at `payment_failed`, so the later `payment_intent.succeeded` triggers the normal decrement.

### S-PFS-3 Cancel After Failure
- GIVEN an Order exists with `orderStatus: 'payment_failed'`
- WHEN the user abandons and status transitions to `cancelled`
- THEN email is sent
- AND no stock restoration is performed (none was decremented per capability 2).

### S-PFS-4 Direct Recovery Rejected
- GIVEN an Order exists with `orderStatus: 'payment_failed'`
- WHEN an attempt is made to transition to `paid`
- THEN `validateOrderTransition` rejects the transition.

### S-PFS-5 Audit Redaction
- GIVEN a Stripe failure payload containing `last_payment_error.message`, `decline_code`, and payment_method_details
- WHEN the audit is stored into `paymentInfo.paymentError`
- THEN the stored object contains `code` and `failure_message` only.

## Out of Scope
- Refund automation for `payment_failed` (manual path or design-time decision in tasks).
- Frontend status/email contract changes (handled in the cross-repo Gap #3 PR).
- Migrating any historical rows currently in inconsistent states.

## Open Questions
None at lock. All locked decisions recorded in `proposal.md` (Decisions 3, 9).

## References
- `src/core/domain/order/order.types.ts:13-71` (OrderStatus, VALID_TRANSITIONS, validateOrderTransition)
- `src/api/order/content-types/order/schema.json:35-49` (Order status enum)
- `src/api/order-status-history/content-types/order-status-history/schema.json:14-39` (history enums)
- `openspec/changes/sprint-5-stripe-webhook/proposal.md`
- `openspec/specs/stripe-payment-webhooks/spec.md` (handler that fires the transition)
- `openspec/specs/order-stock-authority/spec.md` (stock contract)
- Engram obs #1731, #1744, #1745