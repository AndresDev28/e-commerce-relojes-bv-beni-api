# Capability: order-stock-authority

## Purpose
Stock decrement authority moves from the `afterCreate` lifecycle hook to the `payment_intent.succeeded` webhook handler. Stock is decremented exactly once, only when payment is confirmed, across both webhook-first and client-first arrival orders.

## Requirements

### R-OSA-1 Confirmed-Payment Decrement
Stock MUST decrement only inside the `payment_intent.succeeded` webhook handler, AFTER the Order exists (shell created or enriched) AND `items.length > 0` AND `orderStatus: 'paid'`. The webhook handler is the single authority.

### R-OSA-2 afterCreate Decrement Removed
`afterCreate` MUST NOT decrement stock. The current decrement block at `lifecycles.ts:174-185` is removed or gated behind an explicit feature flag.

### R-OSA-3 beforeCreate UX Guard Preserved
`beforeCreate` stock validation (`lifecycles.ts:128-150`) MUST remain as a pre-payment UX guard. Insufficient stock raises `ApplicationError`; no Order is created and no charge is attempted.

### R-OSA-4 Exactly-Once Across Race Orders
Stock MUST decrement exactly once across both arrival orders (webhook-first vs client-first). The unique `paymentIntentId` constraint (Decision 5) and `orderId` uniqueness serialize the race; the webhook handler is the single authority.

### R-OSA-5 Transactional Decrement
The Order write and stock decrement MUST be transactional (Strapi `db.query` transaction or equivalent). A failed decrement MUST roll back the status transition.

### R-OSA-6 Hardened Decrement Helper
`updateProductStock` (`services/order.ts:48-73`) MUST handle concurrent decrements safely — row lock, optimistic compare-and-set on `stock`, or equivalent guard.

## Scenarios

### S-OSA-1 Webhook-First Shell Creation
- GIVEN no Order exists and `payment_intent.succeeded` creates a shell with `items: []`
- WHEN the shell is committed
- THEN stock is NOT decremented (items are empty).

### S-OSA-2 Client-First Order Creation
- GIVEN `useCreateOrder` creates a pending Order with items
- WHEN the Order is created
- THEN stock is NOT decremented at creation
- AND stock is decremented once when the later `payment_intent.succeeded` arrives.

### S-OSA-3 Shell Then Enrichment
- GIVEN a webhook-created shell (no items) and a later `useCreateOrder` UPSERT enriches with items
- WHEN enrichment commits
- THEN stock is decremented exactly once after enrichment completes.

### S-OSA-4 Concurrent Webhook And Client Creation
- GIVEN a webhook delivery and `useCreateOrder` arrive concurrently for the same `orderId`
- WHEN both writes attempt
- THEN exactly one Order exists
- AND stock is decremented exactly once.

### S-OSA-5 Client-Side Insufficient Stock
- GIVEN a client request with `quantity` exceeding product stock
- WHEN `useCreateOrder` attempts to create the Order
- THEN `beforeCreate` raises `Insufficient stock` and returns 4xx
- AND no Order is created and no charge is attempted.

### S-OSA-6 Webhook For Shell With Depleted Stock
- GIVEN a webhook-created shell and a product whose stock has since dropped below the items quantity
- WHEN `useCreateOrder` enrichment triggers the decrement
- THEN the system MUST restore shell `orderStatus` to `payment_failed`, store audit, and trigger refund (or document the manual refund path).

## Out of Scope
- Gap #5 broader stock refactor (atomic ledger, product stock reservation marker).
- Inventory reservation TTL semantics.

## Open Questions
None at lock. All locked decisions recorded in `proposal.md` (Decisions 2, 5, 6).

## References
- `src/api/order/content-types/order/lifecycles.ts:128-188` (current create-time stock logic to refactor)
- `src/api/order/services/order.ts:48-73` (`updateProductStock` to harden)
- `openspec/changes/sprint-5-stripe-webhook/proposal.md`
- `openspec/specs/stripe-payment-webhooks/spec.md` (webhook entry point)
- Engram obs #1731, #1744, #1745