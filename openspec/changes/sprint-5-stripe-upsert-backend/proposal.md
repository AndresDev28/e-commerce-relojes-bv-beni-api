# Proposal: Sprint 5 Gap #3 (backend cycle) — Atomic Order UPSERT endpoint

## Intent

Gap #1 (archived; Engram #1744/#1761) locked the D+ orphan contract: `payment_intent.succeeded` creates a paid shell Order `{orderId, userId, paymentIntentId, total, orderStatus: paid, items: [], paymentInfo.source: "webhook_reconciliation"}` and deferred the enrichment half to an UPSERT-by-`orderId`. That half does not exist yet: core `POST /orders` is insert-only, collides with the shell's unique `orderId`, and a legacy client-side `paid` insert can bypass webhook stock authority (#1763). This cycle ships the missing backend half — a dedicated atomic UPSERT endpoint — so the deferred frontend cycle can rewire `useCreateOrder` against a merged, operational contract.

## Scope

### In Scope
- NEW atomic UPSERT route in `src/api/order/routes/01-custom.ts`, registered next to `POST /orders/stripe-webhook` and `POST /orders/:id/request-cancellation`.
- NEW controller action in `src/api/order/controllers/order.ts` (~203–272 neighborhood): ownership check → status gate → merge delegation. **No-touch boundary**: existing `find`/`findOne` security overrides (Gap #1 hardening) MUST NOT be modified.
- NEW upsert service in `src/api/order/services/`: atomic find-by-`orderId` + conditional update/insert.
- RED-first tests (strict TDD, #1742): ~10 unit + 2 integration.

### Out of Scope
- **Addresses (shipping/billing): NO — deferred.** The Order schema has no address fields; adding them requires a schema migration + PII validation, breaking this cycle's additive/no-migration property and review budget. Addresses are orthogonal to the UPSERT race contract and can layer on later without touching D1–D7.
- Stripe `idempotencyKey` (Gap #4); full `metadata.items` (Gap #1 option A); retry UX post `payment_failed` (Gap #1 PR4b); semantic changes to `POST /orders` or `PUT /orders/:id`; E2E expansion; all frontend wiring (separate cycle, #1766).
- Untouched files: `lifecycles.ts:297–378` enrichment gate; `stripe-webhook.ts` handlers (succeeded 272–398, failed 461–576).

### No schema migration
Verified in place: `orderId` unique (schema.json:14–18), `paymentIntentId` unique (schema.json:51–54), `paymentInfo` JSON unconstrained (schema.json:66–68).

## Capabilities (contract with sdd-spec)

**New:**
- `checkout-order-upsert`: atomic orderId UPSERT contract — shell enrichment, status gates, ownership, paymentInfo merge-only, fallback insert, fail-closed errors. Spec at `openspec/changes/sprint-5-stripe-upsert-backend/specs/checkout-order-upsert/spec.md`.

**Modified:** None — `stripe-payment-webhooks`, `order-stock-authority`, `payment-failed-status` requirements are unchanged; this endpoint implements the backend half of a contract those specs already reference.

## Approach

Locked decisions carried verbatim from #1765/#1766 (this cycle owns D1/D5/D6/D7; D2/D3/D4 apply as backend gate behavior):

1. **D1** — Dedicated atomic UPSERT endpoint; MUST NOT change `POST /orders`.
2. **D2** — `paid` shell: enrich ONLY items/subtotal/shipping; MUST preserve `orderStatus`, `paymentInfo.source`, `paymentInfo.paymentError`.
3. **D3** — `payment_failed` shell: enrich ONLY client-owned fields; MUST preserve status + redacted `paymentError`; never restart payment.
4. **D4** — `cancelled`/`refunded` shell: MUST return 409 with zero mutation.
5. **D5** — No existing Order: INSERT with `orderStatus: pending`; webhook stays authoritative for paid/failed.
6. **D6** — Ownership: `userId`/`paymentIntentId` mismatch → 403/409; authoritative identifiers MUST NOT be overwritten.
7. **D7** — Client supplies only `paymentInfo.{method,brand,last4}`; backend merges over existing `{source, paymentError?}`; MUST NOT replace wholesale.

**Path choice: `PUT /orders/by-order-id/:orderId`** (design confirms). Rationale: PUT is the idempotent verb, matching the retry-safe UPSERT contract; the literal `by-order-id` segment + two-segment path cannot collide with core `PUT /orders/:id` (documentId); path-keyed `orderId` is a single authoritative source; #1765 already named it, preserving continuity for the frontend cycle. Alternative `POST /orders/upsert` matches the action-style precedent (`stripe-webhook`) but POST's non-idempotent verb semantics undersell retry safety. Merge-only (D7) is a contract rule, not client discretion, so PUT-vs-PATCH purism does not apply.

Fail-closed: missing `orderId`/`userId`/`paymentIntentId` or malformed payload → structured Strapi error with `X-Trace-Id`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/api/order/routes/01-custom.ts` | Modified | Register UPSERT route |
| `src/api/order/controllers/order.ts` | Modified | New action; `find`/`findOne` overrides untouched |
| `src/api/order/services/` (new upsert service) | New | Atomic find + conditional update/insert, merge logic |
| `tests/` (~10 unit + 2 integration) | New | RED-first per strict TDD |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Webhook↔UPSERT race on same `orderId` | Med | Unique `orderId`+`paymentIntentId` constraints + atomic service; mandatory concurrency test (exactly one authoritative record) |
| `paymentInfo` clobbering (erase `source`/`paymentError`) | Med | D7 merge-only; byte-identical preservation tests |
| Double email/status-history side effects on enrichment | Med | Enrichment preserves `orderStatus` (D2/D3) → `afterUpdate` status-change email trigger cannot fire; test asserts zero webhook dispatch on enrich |
| Accidental coupling to `STRIPE_PI_WEBHOOKS_ENABLED` | Low | Endpoint MUST behave identically with flag OFF/ON; no flag reads in new code |
| Regression of `find`/`findOne` security overrides | Low | No-touch boundary; existing security tests stay green |
| Review budget overrun (>400 lines) | Med | Forecast below; Review Workload Guard decides per `ask-on-risk` |

## Rollback Plan

Purely additive: `git revert` the merged PR(s). Removes only the route registration, controller action, service file, and tests. No schema migration, no data backfill, no env flag. `POST /orders`, `PUT /orders/:id`, lifecycles, and webhook handlers are untouched, so revert restores exact prior behavior; nothing depends on the endpoint until the frontend cycle ships.

## Dependencies

- Gap #1 D+ shell contract — ✅ archived (#1744/#1761, PRs #33–#36 merged; shells + unique constraints operational).
- Gap #2 server-authoritative `orderId`/`metadata` — ✅ archived (frontend PR #127).
- **`STRIPE_PI_WEBHOOKS_ENABLED` is NOT a dependency**: this endpoint ships and works with the flag OFF or ON (#1748). The frontend cycle assumes UPSERT is merged and operational before flipping the kill-switch to `true`.
- Frontend cycle (`sprint-5-stripe-upsert`, deferred per #1766) consumes this endpoint; backend MUST merge first.

## Success Criteria

- [ ] Paid-shell enrichment preserves `orderStatus`/`paymentInfo.source`/`paymentError` byte-identical (unit+integration)
- [ ] `payment_failed` shell enriches client-owned fields without changing status or redacted `paymentError`
- [ ] `cancelled`/`refunded` → 409 with zero mutation
- [ ] Ownership mismatch (`userId` or `paymentIntentId`) → 403/409, identifiers never overwritten
- [ ] Missing Order → INSERT fallback with `orderStatus: pending`
- [ ] Missing/malformed payload → fail-closed structured error with `X-Trace-Id`
- [ ] Concurrency: shell + UPSERT over same `orderId` → exactly one authoritative record via unique constraints
- [ ] No regression: full existing suite green; `npm run test:only` + `npm run build` exit 0
- [ ] `npx tsc --noEmit` exit 0 — mandatory additional gate: `test:only` (vitest) does NOT typecheck `*.test.ts` (Gap #2 lesson, #1740); apply/verify phases MUST include it

## Review Workload Forecast

Estimate: ~200–300 implementation lines + ~200–300 test lines → total ~400–600 diff lines vs the 400-line budget → **HIGH overrun risk**. Options (Guard decides per `ask-on-risk`, `stacked-to-main` per #1748):
- **Option A — single PR** with `size:exception` if design-phase forecast lands ≤ ~450.
- **Option B — 2 stacked-to-main PRs**: PR1 route + controller + service + unit tests (~350–400); PR2 race/concurrency hardening + integration tests (~150–200).

Lean: Option B if the design forecast exceeds ~450; final call deferred to the Review Workload Guard with a firm line count from tasks.

## References

- Engram: #1763 (explore), #1765 (cross-repo proposal, D1–D7), #1766 (split/sequencing), #1744 (D+ contract), #1748 (PR pattern + kill-switch coupling), #1761 (Gap #1 archive/conventions), #1742 (testing capabilities).
- `openspec/changes/sprint-5-stripe-webhook/` — canonical Gap #1 archive layout.
- `openspec/specs/stripe-payment-webhooks/spec.md`, `openspec/specs/order-stock-authority/spec.md` — RFC 2119 style references.
- `openspec/config.yaml` — strict TDD, RFC 2119 specs, rollback-plan rule.
