# Design: Checkout Order UPSERT

## 1. Overview

Ship Gap #1's deferred enrichment half: a dedicated `PUT /orders/by-order-id/:orderId` endpoint that atomically finds an Order by unique `orderId` and either enriches it (paid / payment_failed / pending shells — client-owned fields only, status and server-owned `paymentInfo` keys preserved) or inserts a `pending` Order when none exists. Implements R-COU-1..10 (D1–D7 locked upstream); ownership mismatches 403/409, terminal statuses 409 zero-mutation, all client errors fail-closed with `X-Trace-Id`. No schema migration, no touching of existing webhook/lifecycle/controller security code.

## 2. Architecture Decisions

### A-1 — Service layer location
**Choice**: New `src/api/order/services/upsert.ts` → registered `api::order.upsert`, exposing `upsertOrderByOrderId(orderId, payload, authUserId, traceId)`. Controller stays a thin shim.
**Rationale**: mirrors Gap #1's split (reconciliation logic in `stripe-webhook.ts`, controller `stripeWebhook` at `controllers/order.ts:329-352` is a delegation shim); service is unit-testable without HTTP; matches `request-cancellation` delegation pattern exactly.
**Trade-offs**: one extra indirection layer; service access via `strapi.service('api::order.upsert')` string (untyped) — accepted, repo-wide convention.
**Alternatives**: inline in controller (untestable in isolation, bloats the security-hardened file ✗); logic in core `services/order.ts` (mixes stock-authority with checkout semantics ✗).

### A-2 — Atomic upsert pattern
**Choice**: one `strapi.db.transaction(async ({ trx }) => { find → gates → write })` envelope; conditional `documents.findFirst({ filters: { orderId } })` then `documents.update` or `documents.create` inside it.
**Rationale**: `strapi.db.transaction` is already proven in-repo at `stripe-webhook.ts:136` on Strapi 5.23.5 (verified — no blocker); Document Service calls join the ambient trx (Gap #1 D-DESIGN-1). Strapi v5 has no native `findOrCreate`.
**Trade-offs**: first non-webhook use of trx in the checkout path; SQLite serializes globally so tests can't prove PG lock behavior — unique constraints are the engine-independent guard (R-COU-9).
**Alternatives**: no transaction (find/write race widens the insert-then-crash window ✗); optimistic UPDATE-then-INSERT without trx (two statements can interleave with the webhook shell creator ✗); `findOrCreate` (doesn't exist ✗).

### A-3 — Ownership check timing (TOCTOU)
**Choice**: inside the same transaction, immediately after the find, before any write or merge.
**Rationale**: ownership reject must not race with the status mutation it protects; row state read and check share one snapshot.
**Trade-offs**: none meaningful; check is a pure comparison of already-loaded fields.
**Alternatives**: pre-transaction check (TOCTOU: webhook could transition between check and write ✗); post-write compensating rollback (leaks a mutation window ✗).

### A-4 — Status gate ordering and full enumeration
**Choice**: inside trx: find → ownership → status gate → merge/write. Gate allowlist by action: `paid` → enrich (D2); `payment_failed` → enrich (D3); `pending` → enrich client fields, recompute `total = subtotal + shipping` (see below); `cancelled`/`refunded` → throw 409 zero-mutation (D4); **every other status** (`processing`/`shipped`/`delivered`/`cancellation_requested`) → throw 409 zero-mutation (fail-closed); no row → INSERT `pending` (D5).
**Rationale**: `pending` is not spec-enumerated but is *required* by R-COU-10: the first PUT fallback-inserts `pending`, so the identical retry PUT hits a `pending` row and must update-in-place, not 409. `total` is recomputed only while `pending` (no server payment authority yet); once `paid`/`payment_failed`, `total` is webhook-set (Stripe amount) and preserved. Unlisted statuses fail closed because mutation authority over them is unspecified (R-COU-8's fail-closed spirit).
**Trade-offs**: one design-locked choice (`pending` enrichment semantics) extends, not contradicts, D1–D7; unlisted-status 409s are unreachable in the current happy flow but documented in tests.
**Alternatives**: 409 on `pending` (breaks R-COU-10 ✗); treat unlisted statuses like `pending` (grants client mutation over post-payment lifecycle states ✗).

### A-5 — paymentInfo merge semantics
**Choice**: controller sanitizes the client `paymentInfo` to an allowlist `{method, brand, last4}` (drops `source`, `paymentError`, anything else, silently); service shallow-merges `{ ...existing, ...sanitized }`.
**Rationale**: R-COU-7/D7 shallow merge + explicit server-owned key drop removes any escalation vector where a client tries to forge `source: 'webhook_reconciliation'` or erase `paymentError`; shallow is enough because paymentInfo is flat (verified shapes in `stripe-webhook.ts:367, 568`).
**Trade-offs**: nested future keys would need deep merge — out of scope; silent drop vs 400 on unknown keys — drop chosen so retries from older clients never 400 (idempotency).
**Alternatives**: deep merge (complexity without shape need ✗); wholesale replace (violates D7 ✗); 400 on extra keys (brittle across client versions ✗).

### A-6 — X-Trace-Id propagation
**Choice**: `const traceId = ctx.request.headers['x-trace-id'] || crypto.randomUUID()`; set response header `X-Trace-Id` **first thing** in the action; include traceId in every error's `details` and in log lines.
**Rationale**: frontend already sends `X-Trace-Id` (CORS allowlist at `config/middlewares.ts:20` — verified); no repo trace middleware exists, so per-action handling is the only option that doesn't touch shared config; setting the header before work guarantees it appears on thrown-error responses too (Strapi's errors middleware runs outside the controller — `@strapi/core/dist/middlewares/errors.js`).
**Trade-offs**: repeated line, not centralized — acceptable for one endpoint.
**Alternatives**: global middleware (touches shared config, widens diff ✗); error-handler-only injection (misses success-path correlation ✗).

### A-7 — Error mapping (design-phase correction)
**Choice**: `ctx.badRequest/forbidden/unauthorized` where they exist; **409 via `new HttpError(409, message, { traceId })` thrown from `@strapi/utils`** (serialized by the errors middleware into the standard `{data:null,error:{status:409,name:'ConflictError',message,details}}` — mechanism verified in `@strapi/core/dist/services/errors.js:formatHttpError`); service throws typed marker errors (`UpsertConflictError`/`UpsertForbiddenError`) that the controller catches and rethrows/maps.
**Rationale**: **Strapi 5.23.5 has no `ctx.conflict`** (verified: koa augmentations list in `@strapi/utils/dist/types.d.ts:60-71` and the `mapErrorsAndStatus` table omit it); `HttpError` is the framework's own 4xx vehicle; controller catch-and-map mirrors the existing `requestCancellation` action (`controllers/order.ts:309-320`).
**Trade-offs**: `HttpError` is semi-public API — stable since v4; details-based traceId payload deviates slightly from plain-message errors.
**Alternatives**: `ctx.status = 409; ctx.body = …` manual assembly (re-implements framework serialization ✗); `ctx.throw` (bypasses Strapi's `{data,error}` shape ✗).

### A-8 — Controller action name and shape
**Choice**: `async upsertByOrderId(ctx)` added as a new factory method at the end of `controllers/order.ts`; reads `ctx.params.orderId`, `ctx.state.user?.id`, `ctx.request.body`; success `return { data: { id: doc.documentId, attributes: doc }, meta: {} }` (existing response convention).
**Rationale**: identical shape to `find`/`findOne`/`requestCancellation` returns; appended method cannot disturb the security-override neighborhood.
**Trade-offs**: none. **Alternatives**: new controller file (Strapi factory controllers are 1:1 with API; a second file is unidiomatic ✗).

### A-9 — Route registration
**Choice**: append to `src/api/order/routes/01-custom.ts`: `{ method: 'PUT', path: '/orders/by-order-id/:orderId', handler: 'order.upsertByOrderId' }` — **no `config` block**.
**Rationale**: repo convention verified — `request-cancellation` route has no `config` (Strapi's api-context default = authenticated) and the action carries a belt-and-suspenders `ctx.state.user` → `ctx.unauthorized` guard; webhook uses explicit `auth: false` only because Stripe is unauthenticated. Path collision impossible: `/orders/by-order-id/:id` is two segments, core `PUT /orders/:id` is one (verified route files `routes/order.ts` defaults + `01-custom.ts`).
**Trade-offs**: relies on framework default rather than declarative scope. **Alternatives**: `config.auth.scope: ['authenticated']` (no repo precedent; scope names are users-permissions JWT-scope concepts, not a repo pattern here ✗).

### A-10 — Auth semantics
**Choice**: authenticated user required; the authenticated `ctx.state.user.id` is the **sole identity authority** — payload `userId` must equal it (else 403, prevents acting-as another user) and must equal the existing row's `user` (else 403); INSERT always connects `ctx.state.user.id`, never the raw payload value.
**Rationale**: D6; one principal for all three comparisons closes header/body confusion.
**Trade-offs**: admin cannot UPSERT for a customer (never spec'd; admin uses `PUT /orders/:id`).
**Alternatives**: trust payload `userId` (privilege escalation ✗); derive identity from header only (breaks S-COU-5's payload shape ✗).

### A-11 — Concurrency / lost-writer test mechanism
**Choice**: integration test interleaves the two writers with `Promise.all([webhookShell, upsertRequest])` plus an `await new Promise(setImmediate)` barrier at each writer's decision point; assert exactly one Order row for the `orderId` post-commit; on the losing INSERT, assert the design's **bounded retry**: service catches the `orderId`/`paymentIntentId` unique-violation (`ER_DUP_ENTRY`/`SQLITE_CONSTRAINT_UNIQUE`/PG 23505) inside the trx, aborts, and on a single re-run re-finds (now sees the winner's shell) and enriches — converging to one authoritative record; a second violation surfaces as 409 with traceId.
**Rationale**: R-COU-9 + R-COU-10 demand both rejection of the losing write *and* observable idempotent convergence; unique constraints are the serialization point on any engine (SQLite serializes naturally in tests — assertions on outcome, same convention as Gap #1 §5).
**Trade-offs**: one retry costs a second transaction on a rare interleaving; retry is bounded (never loops).
**Alternatives**: blind 409 without retry (legitimate first-retry client races surface as spurious 409, frontend must special-case ✗); Postgres `INSERT … ON CONFLICT` (engine-specific SQL, breaks SQLite tests ✗).

### A-12 — Test file layout
**Choice**: 5 focused files in `test/api/`: `order-upsert-paid-shell.test.ts` (S-COU-1/7/10), `order-upsert-payment-failed.test.ts` (S-COU-2), `order-upsert-ownership.test.ts` (S-COU-5/6), `order-upsert-fallback-insert.test.ts` (S-COU-4 + terminal 409 S-COU-3 + malformed S-COU-8), `order-upsert-concurrency.test.ts` (S-COU-9/10 race).
**Rationale**: obs #1761 lesson — split beats monolithic; names follow existing `order-*`/`stripe-webhook-*` convention; each file maps to a spec cluster for review slices.
**Trade-offs**: small fixture duplication across files (createTestUser/create shell) — accepted for isolation; shared helpers already exist in `test/helpers/strapi-test-helpers.ts` (`createTestUser` returns `.jwt` — verified).
**Alternatives**: one monolith (~350 lines, single review blob ✗).

### A-13 — Lifecycle side effects on enrichment (design-phase correction to the "no dispatch" reading)
**Choice**: UPSERT writes via Document Service and **deliberately omits `orderStatus` from every update payload** (never write it, byte-preservation by construction). Consequences verified in `lifecycles.ts`: (a) `beforeUpdate` transition validation is skipped (`:253` requires a changed `data.orderStatus`); (b) paid-shell enrichment **DOES fire the intended `[GAP-1]` stock-decrement enrichment gate** (`:297-378`, `paid && !stockDeducted && items.some(id && quantity)`) — this is S-OSA-3 completing, exactly the behavior Gap #1's SD-2 reserved for "Gap #3 UPSERT"; items are passed through untransformed so the gate's `item.id` check matches; (c) email/status-history do **not** fire: unchanged-status early-return at `:380-383`. Tests assert zero email dispatch AND assert the CAS decrement fired once (the latter is a requirement, not a risk).
**Rationale**: the lifecycle comment at `:313` literally names this endpoint ("SHELL ENRICHMENT (Gap #3 UPSERT)") as one of two arrival orders; preventing the decrement would defeat order-stock-authority.
**Trade-offs**: UPSERT's write is lifecycle-bearing (must document, not fight); idempotent repeat PUT is safe via the `stockDeducted` CAS marker.
**Alternatives**: `db.query` bypass writes (skips the gate → stock never decremented → breaks S-OSA-3 ✗; also re-implements history semantics ✗).

### A-14 — Logging
**Choice**: `strapi.log.info/warn/error` with tag `[GAP-3]` (mirrors `[GAP-1]`), structured line per call: `traceId, orderId, action: hit|miss|reject|insert|retry, reason?`; rejections at warn, unexpected at error with stack.
**Rationale**: existing controllers/webhook log exactly this way; ops can grep one tag for the endpoint's full audit trail.
**Trade-offs**: none. **Alternatives**: request-context logger (doesn't exist ✗); silent (fails fail-closed observability ✗).

## 3. Sequence Diagrams

### SD-1 — Paid shell enrichment (happy path)

```mermaid
sequenceDiagram
    participant FE as Frontend (auth JWT)
    participant CT as order controller (upsertByOrderId)
    participant UP as upsert service
    participant LC as Order lifecycles
    participant DB as Database

    FE->>CT: PUT /api/orders/by-order-id/ORD-9 (items, subtotal, shipping, paymentInfo{method,brand,last4})
    CT->>CT: traceId = inbound X-Trace-Id || crypto.randomUUID(); set response header FIRST
    CT->>CT: auth guard (ctx.state.user?) + sanitize paymentInfo allowlist
    CT->>UP: upsertOrderByOrderId(ORD-9, payload, authUserId, traceId)
    Note over UP: strapi.db.transaction OPEN
    UP->>DB: documents.findFirst({ orderId }) -> paid shell (items [], source webhook_reconciliation)
    UP->>UP: ownership: payload.userId == authUserId == row.user -> OK; paymentIntentId match -> OK
    UP->>UP: status gate: paid -> enrichment set = {items, subtotal, shipping, paymentInfo merged}
    UP->>DB: documents.update({ documentId, data WITHOUT orderStatus, paymentInfo: {...existing, ...sanitized} })
    DB->>LC: beforeUpdate: no data.orderStatus -> transition validation skipped
    DB->>LC: afterUpdate: enrichment gate paid && !stockDeducted && items -> decrementStockOnce (CAS)
    LC->>DB: stock_deducted=false->true; guarded product stock UPDATE
    DB->>LC: previousStatus == newStatus (paid) -> early-return: NO history, NO email
    Note over UP: COMMIT
    UP-->>CT: updated doc
    CT-->>FE: 200 {data:{id:documentId, attributes}} + X-Trace-Id header
    Note over FE,LC: zero email/webhook dispatches; one stock decrement (S-OSA-3 completes)
```

### SD-2 — Fallback INSERT (no existing Order)

```mermaid
sequenceDiagram
    participant FE as Frontend (auth JWT)
    participant CT as order controller
    participant UP as upsert service
    participant LC as Order lifecycles
    participant DB as Database

    FE->>CT: PUT /api/orders/by-order-id/ORD-7 (valid payload)
    CT->>UP: upsertOrderByOrderId(...)
    Note over UP: strapi.db.transaction OPEN
    UP->>DB: documents.findFirst({ orderId }) -> null
    UP->>UP: ownership vacuous (no row); status gate vacuous
    UP->>DB: documents.create({ orderId, paymentIntentId, user:{connect:[authUserId]}, orderStatus:'pending', items, subtotal, shipping, total: subtotal+shipping (server-computed), paymentInfo: sanitized })
    DB->>LC: beforeCreate: data.user preserved (connect syntax); afterCreate: history null->pending; NO email (not paid); NO decrement (not paid)
    Note over UP: COMMIT
    UP-->>CT: new doc
    CT-->>FE: 200 + X-Trace-Id
```

### SD-3 — Ownership mismatch (403 / 409) and terminal status (409)

```mermaid
sequenceDiagram
    participant FE as Frontend (user B)
    participant CT as order controller
    participant UP as upsert service
    participant DB as Database

    FE->>CT: PUT /orders/by-order-id/ORD-5 (userId B) — row owned by A
    CT->>UP: upsertOrderByOrderId(...)
    Note over UP: transaction OPEN
    UP->>DB: findFirst -> row (user A, PI-1)
    UP->>UP: payload.userId(B) != authUser(B)? ok; authUser(B) != row.user(A) -> throw Forbidden
    Note over UP: ROLLBACK (no writes issued) — zero mutation
    UP-->>CT: UpsertForbiddenError
    CT-->>FE: 403 {error.details.traceId} + X-Trace-Id header; row userId stays A

    FE->>CT: PUT with paymentIntentId PI-2 — row has PI-1
    UP->>UP: PI mismatch -> throw Conflict (identical shape)
    CT-->>FE: 409; paymentIntentId stays PI-1 (never in update data)

    FE->>CT: PUT /orders/by-order-id/ORD-3 (row cancelled)
    UP->>UP: status gate: cancelled|refunded -> throw Conflict ZERO reads of merge inputs
    CT-->>FE: 409 — no field touched, no dispatch
```

### SD-4 — Race: webhook shell creator vs UPSERT INSERT

```mermaid
sequenceDiagram
    participant WH as stripe-webhook service
    participant UP as upsert service
    participant DB as Database

    par concurrent on same orderId
        WH->>DB: trx1: ledger INSERT, findFirst(ORD-1) -> null, create paid shell
    and
        UP->>DB: trx2: findFirst(ORD-1) -> null, create pending
    end
    DB-->>UP: UNIQUE violation on orders.order_id (ORD-1) — losing writer rejected at DB layer (R-COU-9)
    Note over UP: trx2 aborted; bounded retry (max 1)
    UP->>DB: trx3: findFirst(ORD-1) -> paid shell (winner)
    UP->>DB: enrich (SD-1 path) -> items land on THE authoritative row
    Note over DB: exactly one Order for ORD-1; status paid (webhook authority preserved)
```

### SD-5 — Malformed payload, fail-closed with X-Trace-Id

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant CT as order controller
    participant UP as upsert service

    FE->>CT: PUT /orders/by-order-id/ORD-8 (body missing paymentIntentId)
    CT->>CT: traceId generated/inherited; ctx.set('X-Trace-Id', traceId)
    CT->>CT: validate required: orderId param, userId, paymentIntentId, items array, numeric subtotal/shipping
    CT-->>FE: 400 badRequest({ traceId }) — service never invoked, transaction never opened
    Note over CT,FE: endpoint MUST NOT 500 on client input (R-COU-8); same shape for unparseable bodies via Strapi parse errors surfacing as 4xx
```

## 4. Data Flow

```
PUT /api/orders/by-order-id/:orderId  (X-Trace-Id?, Authorization: Bearer)
  └─ routes/01-custom.ts ── controller upsertByOrderId  [NEW method, appended]
       trace header → auth guard → payload validation + paymentInfo allowlist
       └─ strapi.service('api::order.upsert')  [NEW file]
            strapi.db.transaction:
              findFirst(orderId) ──┬─ found ─→ ownership(A-10) → status gate(A-4) → merge(A-5) → documents.update   ─┐
                                   └─ null ─→ documents.create(pending, server total) ───────────────────────────────┤
              unique-violation → bounded retry → converge/enrich | 409 (A-11)                                        │
       error mapping: Forbidden→403 · Conflict/terminal→409 (HttpError) · invalid→400 · unexpected→500+traceId        │
  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  Document Service → lifecycles (UNCHANGED): beforeUpdate skip-validation · enrichment CAS decrement · no-email early-return

NO-TOUCH BOUNDARIES (verified ranges): controllers/order.ts:52-92 (find), :103-148 (findOne), :209-273 (update),
:requestCancellation/:stripeWebhook actions · services/stripe-webhook.ts:272-398, :461-576 (webhook handlers) ·
content-types/order/lifecycles.ts (all) · schema.json (no migration) · POST /orders, PUT /orders/:id semantics.
```

Payload contract (client view): `{ userId, paymentIntentId, items[], subtotal, shipping, paymentInfo?{method,brand,last4} }`.

## 5. File-Level Diff Plan

| File | Action | Est. ± | Responsibility |
|---|---|---|---|
| `src/api/order/services/upsert.ts` | Create | +150–180 | trx envelope, find/gates/merge/write, error classes, `[GAP-3]` logging, bounded retry |
| `src/api/order/controllers/order.ts` | Modify | +60–80 | new `upsertByOrderId` method appended; trace header; validation; error map; imports `HttpError` |
| `src/api/order/routes/01-custom.ts` | Modify | +6 | route literal (A-9 shape) |
| `test/api/order-upsert-paid-shell.test.ts` | Create | +60 | S-COU-1/7/10 + decrement-once assert |
| `test/api/order-upsert-payment-failed.test.ts` | Create | +40 | S-COU-2 |
| `test/api/order-upsert-ownership.test.ts` | Create | +50 | S-COU-5/6 |
| `test/api/order-upsert-fallback-insert.test.ts` | Create | +60 | S-COU-3/4/8 |
| `test/api/order-upsert-concurrency.test.ts` | Create | +55 | S-COU-9 barrier race + idempotent PUT |

**Threat matrix**: N/A all rows (`references/threat-matrix.md` covers shell/subprocess/VCS/PR/executable-classification boundaries; this change registers an HTTP route only). The HTTP trust boundary is governed by R-COU-6/8 and RED-tested (SD-3/SD-5), mirroring Gap #1's design disposition.

## 6. Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | merge purity (server keys survive), sanitize allowlist, status-gate decisions, ownership matrix, total recompute rule | Vitest against exported service helpers with the test Strapi instance, direct `strapi.service('api::order.upsert')` calls |
| Integration | all S-COU-1..10 through supertest `PUT` with `createTestUser().jwt` (verified helper); byte-identical `source`/`paymentError` asserts; zero email dispatch (spy on webhook fetch like `order-email-webhook.test.ts`); exactly-one-row race (A-11 barrier); idempotent repeat PUT | `test/api/` existing bootstrap + `webhook-event-factory`-style shell creation via documents API |
| Regression | full existing suite green incl. `stripe-webhook-*`, `order-security-*`, lifecycle tests (no-touch proof) | `npm run test:only` |
| Type gate | `npx tsc --noEmit` — vitest does not typecheck `*.test.ts` (#1740) | mandatory in apply/verify |

## 7. Review Workload Forecast

Implementation ≈ 216–266 + tests ≈ 265 → **total ≈ 480–530 diff lines vs 400 budget → HIGH overrun risk.** Lean: **Option B — two stacked-to-main PRs** (PR1: routes + controller + service + unit/happy-path tests ≈ 330; PR2: ownership/terminal/race/idempotency integration tests ≈ 180). Final call deferred to Review Workload Guard with tasks-phase line counts; Option A (single PR + `size:exception`) only if tasks trim under ~450.

## 8. Rollback Plan

Purely additive — `git revert` the merged PR(s). Deletes exactly: route literal in `01-custom.ts`, appended controller method + its two import additions, `services/upsert.ts`, 5 test files. No schema change, no data, no flag, no generated-types drift (untouched). Prior behavior restored bit-for-bit because every NO-TOUCH boundary in §4 was never edited; nothing consumes the endpoint until the deferred frontend cycle.

## 9. Verification Gates

1. `npm run test:only` exit 0 (unit + integration + full existing suite).
2. `npx tsc --noEmit` exit 0 — **mandatory** (#1740: vitest skips `*.test.ts` typecheck).
3. `npm run build` exit 0.
4. Kill-switch invariant (#1748): endpoint integration tests pass with `STRIPE_PI_WEBHOOKS_ENABLED` unset/false and true; grep gate — zero flag reads in new files.

## 10. Open Questions

None — all HOW-level choices locked in §2 (A-1…A-14), including two design-phase corrections to pre-design assumptions (A-7: no `ctx.conflict` in 5.23.5; A-13: enrichment intentionally fires the stock gate, not emails).

## References

`proposal.md` (D1–D7); `specs/checkout-order-upsert/spec.md` (R-COU-1..10); `openspec/changes/sprint-5-stripe-webhook/design.md` (D-DESIGN-1/4/6/7, SD-2); code anchors: `controllers/order.ts:42-353`, `routes/01-custom.ts:1-20`, `services/stripe-webhook.ts:136, 272-398, 461-576`, `lifecycles.ts:215-383`, `schema.json:14-68`, `config/middlewares.ts:20`, `test/api/order-ownership-validation.test.ts`, `@strapi/core/dist/services/errors.js`, `@strapi/utils/dist/types.d.ts:56-71`; Engram #1744, #1748, #1761, #1763, #1765, #1766, #1769, #1770, #1742, #1740.
