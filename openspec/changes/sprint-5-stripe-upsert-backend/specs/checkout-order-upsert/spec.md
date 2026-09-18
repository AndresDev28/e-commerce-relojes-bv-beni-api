# Spec: Checkout Order UPSERT

## Purpose
Atomic UPSERT-by-`orderId` closing Gap #1's deferred enrichment half: webhook `paid`/`payment_failed` shells (R-SW-4, R-SW-5) receive client `items`/`subtotal`/`shipping` without restarting payment. Idempotent `PUT`, merge-only `paymentInfo`, strict ownership.

## Requirements

| ID | Rule |
|----|------|
| R-COU-1 | Dedicated route: system MUST expose `PUT /orders/by-order-id/:orderId` in `src/api/order/routes/01-custom.ts`; core `POST /orders` and `PUT /orders/:id` MUST remain unchanged. |
| R-COU-2 | Paid shell: for `orderStatus: 'paid'`, UPSERT MUST enrich ONLY `items`/`subtotal`/`shipping` and MUST preserve `orderStatus`, `paymentInfo.source`, `paymentInfo.paymentError` byte-identical with no dispatch. |
| R-COU-3 | Payment-failed shell: for `orderStatus: 'payment_failed'`, UPSERT MUST enrich ONLY client-owned fields and MUST preserve `orderStatus` and `paymentInfo.paymentError` byte-identical without restarting payment. |
| R-COU-4 | Terminal status: for `cancelled`/`refunded`, UPSERT MUST return HTTP 409 with zero mutation; no field MUST change and no dispatch MUST fire. |
| R-COU-5 | Fallback insert: when no Order matches `orderId`, UPSERT MUST INSERT with `orderStatus: 'pending'`; webhook SHALL remain authoritative and INSERT MUST satisfy unique `orderId` + `paymentIntentId` atomically. |
| R-COU-6 | Ownership: endpoint MUST reject `userId` mismatch with HTTP 403 and `paymentIntentId` mismatch with HTTP 409; authoritative identifiers MUST NOT be overwritten by request body. |
| R-COU-7 | Merge-only paymentInfo: client MUST supply only `paymentInfo.{method, brand, last4}`; backend MUST shallow-merge over existing `paymentInfo` preserving `source`/`paymentError`/server-owned keys, and MUST NOT wholesale-replace. |
| R-COU-8 | Errors: missing `orderId`/`userId`/`paymentIntentId`, malformed payload, or schema failure MUST yield a structured Strapi error with `X-Trace-Id`; endpoint MUST NOT 500 on client input. |
| R-COU-9 | Concurrency: endpoint MUST rely on unique `orderId` and `paymentIntentId` to serialize concurrent shell-creation and UPSERT writes, guaranteeing one Order per `orderId`; losing-writer updates MUST be rejected at DB layer. |
| R-COU-10 | Idempotency: repeated `PUT` with identical body over same `orderId` MUST produce no observable side-effect beyond the first write; unique `orderId` SHALL serialize concurrent writes. |

## Scenarios

### S-COU-1 Paid Shell Enrichment Preserves State
- GIVEN Order with `orderStatus: 'paid'`, `paymentInfo.source: 'webhook_reconciliation'`, `items: []`
- WHEN `PUT /orders/by-order-id/<orderId>` carries `items`, `subtotal`, `shipping`, `paymentInfo.{method, brand, last4}`
- THEN client fields persist, `orderStatus`/`paymentInfo.source`/`paymentInfo.paymentError` remain byte-identical, zero dispatches fire.

### S-COU-2 Payment-Failed Enrichment Preserves Audit
- GIVEN Order with `orderStatus: 'payment_failed'`, `paymentInfo.paymentError: { code, failure_message }`
- WHEN `PUT` carries `items`/`subtotal`/`shipping`
- THEN those persist, `orderStatus`/`paymentInfo.paymentError` unchanged, payment state machine not invoked.

### S-COU-3 Cancelled Shell Returns 409
- GIVEN Order with `orderStatus: 'cancelled'`
- WHEN `PUT /orders/by-order-id/<orderId>` arrives
- THEN HTTP 409 returned, no field changes.

### S-COU-4 Missing Order Inserts Pending
- GIVEN no Order for `orderId`
- WHEN `PUT` arrives with valid `userId`/`paymentIntentId`/`items`/`paymentInfo`
- THEN new Order created with `orderStatus: 'pending'`.

### S-COU-5 UserId Mismatch → 403
- GIVEN Order with `userId: A`, `paymentIntentId: PI-1`
- WHEN `PUT` arrives with authenticated `userId: B`, `paymentIntentId: PI-1`
- THEN HTTP 403 returned, `userId` remains `A`.

### S-COU-6 PaymentIntentId Mismatch → 409
- GIVEN Order with `userId: A`, `paymentIntentId: PI-1`
- WHEN `PUT` arrives with `userId: A` (auth match), `paymentIntentId: PI-2`
- THEN HTTP 409 returned, `paymentIntentId` remains `PI-1`.

### S-COU-7 PaymentInfo Merge Preserves Server Keys
- GIVEN `paymentInfo: { source: 'webhook_reconciliation', paymentError: { code, failure_message } }`
- WHEN `PUT` supplies `paymentInfo: { method: 'card', brand: 'visa', last4: '4242' }`
- THEN persisted equals `{ source, paymentError, method, brand, last4 }`.

### S-COU-8 Malformed Payload Returns Structured Error
- GIVEN request missing `orderId`, `userId`, or `paymentIntentId`
- WHEN endpoint is invoked
- THEN structured Strapi error returned with `X-Trace-Id`.

### S-COU-9 Concurrent Writes Yield One Authoritative Record
- GIVEN two writers target same `orderId` (shell creator + UPSERT)
- WHEN both commit concurrently
- THEN exactly one Order exists post-commit, loser rejected by unique constraint.

### S-COU-10 Idempotent Repeated PUT
- GIVEN Order enriched by prior successful PUT
- WHEN identical PUT sent again
- THEN no additional dispatch, history row, or side-effect fires.

## Out of Scope
Addresses (#1763), `idempotencyKey` (Gap #4), full `metadata.items`, retry UX post `payment_failed` (Gap #1 PR4b), `POST /orders`/`PUT /orders/:id` semantic changes, E2E expansion, frontend wiring (#1766), `find`/`findOne` security overrides, `STRIPE_PI_WEBHOOKS_ENABLED` coupling (asserted in Verification).

## Verification
`npm run test:only` (vitest, unit+integration) MUST exit 0. `npx tsc --noEmit` MUST exit 0 — mandatory gate; `test:only` skips `*.test.ts` typecheck (#1740). `npm run build` MUST exit 0. E2E OFF. `STRIPE_PI_WEBHOOKS_ENABLED` invariant (#1748).

## References
`proposal.md` (D1–D7); `openspec/specs/stripe-payment-webhooks/spec.md` (R-SW-4, R-SW-5); `openspec/specs/order-stock-authority/spec.md` (S-OSA-3); Engram #1744, #1763, #1765, #1766, #1748, #1761.
