/**
 * webhook-event routes
 *
 * [GAP-1 PR1+2] The webhook_events collection is private — it is the
 * server-side idempotency ledger for incoming Stripe webhooks and must
 * never be exposed via public REST endpoints. Writes are only performed
 * by service code inside the reconciliation transaction (PR4a); reads
 * remain admin-panel-only.
 */
export default {
  routes: [],
};
