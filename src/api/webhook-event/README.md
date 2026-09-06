# webhook_events — Private Ledger

[GAP-1 PR1+2] Private server-side idempotency ledger for incoming
Stripe webhooks. This document is the canonical operational
reference for the ledger and includes the pre-deploy audit + rollback
commands required before the `payment_intent_id` unique constraint
is enabled in production.

## Purpose

The `webhook_events` content type is the canonical audit trail for
Stripe events that have reached the Strapi backend. Each row is
written **before** any processing occurs and is keyed by Stripe's
`event.id`, so duplicate deliveries and crashed handlers cannot
double-write state.

## Schema

| Field            | Type                                       | Required | Notes                                              |
| ---------------- | ------------------------------------------ | -------- | -------------------------------------------------- |
| `eventId`        | string                                     | YES      | UNIQUE — Stripe `event.id`. Idempotency key.       |
| `eventType`      | string                                     | YES      | e.g. `payment_intent.succeeded`.                    |
| `paymentIntentId`| string                                     | optional | Correlation audit only; not unique here.           |
| `orderId`        | string                                     | optional | OrderId correlation when known.                    |
| `processedAt`    | datetime                                   | YES      | Used by the retention sweep.                       |
| `outcome`        | enum: `processed` \| `unmatched`           | YES      | `failed` is intentionally NOT stored (D-DESIGN-3). |
| `errorMessage`   | text                                       | optional | Non-fatal warnings only; not for thrown handlers.  |

`payload` is intentionally NOT stored — Stripe retains ~21 days of
event history at scale, and the full payload duplicates PII
(customer, payment method refs). Correlation fields above are
sufficient for audit and re-processing.

## Routes

`src/api/webhook-event/routes/webhook-event.ts` exports
`routes: []` — there is **no public REST surface** for this
content type. Writes happen exclusively from service code inside
the reconciliation transaction (introduced in PR4a). Reads are
admin-panel-only.

## Retention

`config/cron-tasks.ts` registers `webhookLedgerRetention`, a daily
03:17 UTC sweep that deletes rows whose `processedAt` is older
than 90 days (D-DESIGN-8 step 2). The cutoff is strictly `<` so a
row exactly 90 days old is preserved. The sweep runs in dev/prod
(`CRON_ENABLED=true` by default) but is suppressed in tests
(`STRAPI_DISABLE_CRON=true`, see `test/helpers/strapi-test-helpers.ts`).

## Operational guarantees

- **Exactly-once side effects**: duplicates are blocked by the unique
  index on `eventId`. A `23505 unique_violation` (Postgres) or
  `SQLITE_CONSTRAINT_UNIQUE` (SQLite) means the event was already
  processed and the handler MUST ack 200 without writing (R-SW-3).
- **Crash-safe re-processing**: the ledger row is inserted **inside**
  the same transaction as the processing writes. A crash mid-handler
  rolls the ledger row back too, so the Stripe retry re-processes
  cleanly (R-SW-9).
- **Audit-only `outcome`**: only `processed` and `unmatched` are
  persisted. A thrown handler must NOT persist under a unique
  `eventId`; doing so would block legitimate re-processing and
  break R-SW-9.

## Rollback

```sql
-- 1. Pre-deploy data audit (must return 0 rows; otherwise stop and dedupe)
SELECT payment_intent_id, COUNT(*) AS occurrences
FROM orders
WHERE payment_intent_id IS NOT NULL
GROUP BY payment_intent_id
HAVING COUNT(*) > 1;

-- 2. Enable the unique constraint (only after step 1 returns 0 rows)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
    orders_payment_intent_id_unique
ON orders (payment_intent_id)
WHERE payment_intent_id IS NOT NULL;

-- 3. Rollback — drop the unique index (Postgres only)
DROP INDEX CONCURRENTLY IF EXISTS orders_payment_intent_id_unique;

-- 4. Rollback — revert `payment_failed` rows BEFORE dropping the enum
UPDATE orders SET order_status = 'cancelled'
WHERE order_status = 'payment_failed';
UPDATE order_status_histories SET from_status = 'cancelled'
WHERE from_status = 'payment_failed';
UPDATE order_status_histories SET to_status = 'cancelled'
WHERE to_status = 'payment_failed';

-- 5. Rollback — drop the ledger table
DROP TABLE IF EXISTS webhook_events;
```

The full pre-deploy runbook (including the manual dedupe query) is
in the PR description; this README captures the operational
reference for the ledger itself.

## What's NOT in PR1+2

- The webhook handlers themselves (PR4a).
- The transactional dispatch (PR4a).
- Failed-payment reconciliation (PR4b).
- Stock decrement authority migration (PR3).

PR1+2 ships the **ledger + schema/domain foundation** only. No
public behavior change for end users yet.
