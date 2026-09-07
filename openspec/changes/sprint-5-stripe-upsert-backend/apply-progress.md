# Apply-Progress: Sprint 5 Gap #3 (backend) — PR1 + PR2

Cycle: `sprint-5-stripe-upsert-backend`
Capability: `checkout-order-upsert`
PR strategy: **2 stacked-to-main PRs** (PR1 → main → PR2 → main), `stacked-to-main` per #1748.

---

## PR1 Status

`merged` (commit `daf24c2`, merge of #37). The PR1 sections below
are preserved verbatim from the original `apply-progress.md` so the
full history is intact.

### PR1 Commits

```
2da0784 feat(order): add upsertByOrderId controller action + route registration (Phase 2.6 + 2.7)
d3db0a1 feat(order): add upsert service skeleton with transaction envelope (Phase 1.1.2 + 2.5)
fcd7c05 test(order): RED failing tests for upsert service signature and paid-shell preservation (S-COU-1, S-COU-7)
```

| Hash | Subject | Phase | Files |
|---|---|---|---|
| `fcd7c05` | test(order): RED failing tests for upsert service signature and paid-shell preservation (S-COU-1, S-COU-7) | 1.1.1, 2.1, 2.4 | +1 |
| `d3db0a1` | feat(order): add upsert service skeleton with transaction envelope (Phase 1.1.2 + 2.5) | 1.1.2, 2.5, 2.2, 2.3 | +3 / ~1 |
| `2da0784` | feat(order): add upsertByOrderId controller action + route registration (Phase 2.6 + 2.7) | 2.6, 2.7 | +2 / ~1 |

### PR1 Files Changed

`git diff --stat main..feat/sprint-5-stripe-upsert-backend-pr1` (the
state captured at PR1 merge — historical record):

```
 src/api/order/controllers/order.ts            | 126 +++++++++-
 src/api/order/routes/01-custom.ts             |  11 +
 src/api/order/services/order.ts               |  48 ++--
 src/api/order/services/upsert.ts              | 271 ++++++++++++++++++++++++
 test/api/order-upsert-fallback-insert.test.ts | 100 ++++++++++
 test/api/order-upsert-paid-shell.test.ts      | 272 +++++++++++++++++++++++++
 test/api/order-upsert-payment-failed.test.ts  | 122 ++++++++++++
 test/helpers/strapi-test-helpers.ts           |   5 +
 8 files changed, 936 insertions(+), 19 deletions(-)
```

| File | Action | Note |
|---|---|---|
| `src/api/order/services/upsert.ts` | NEW | service + typed marker errors + A-1..A-14 |
| `src/api/order/services/order.ts` | modify | bug fix: `updateProductStock` raw-SQL placeholder binding under ambient trx |
| `src/api/order/controllers/order.ts` | modify | appended `upsertByOrderId`; existing methods byte-identical |
| `src/api/order/routes/01-custom.ts` | modify | new `PUT /orders/by-order-id/:orderId` route |
| `test/api/order-upsert-paid-shell.test.ts` | NEW | 1.1.1, 2.1, 2.4 (S-COU-1, S-COU-7) |
| `test/api/order-upsert-payment-failed.test.ts` | NEW | 2.2 (S-COU-2) |
| `test/api/order-upsert-fallback-insert.test.ts` | NEW | 2.3 (S-COU-4) |
| `test/helpers/strapi-test-helpers.ts` | modify | add `api::order.order.upsertByOrderId` to test authenticated-role permissions |

### PR1 Test Counts

| Metric | Count |
|---|---|
| Total tests in this PR (full suite at merge) | **342** |
| New tests added by this PR | **+5** |
| Pre-existing tests (regression) | **337** |
| All-green assertion | ✓ (0 failed) |
| Test files added | 3 |
| Test files modified | 0 |
| New failing RED-tests at first run | 3 (1.1.1, 2.1, 2.4) — all confirmed to fail for the right reason before GREEN |

### PR1 Verification Gates

#### 1. `npm run test:only`

```
Test Files  34 passed (34)
     Tests  342 passed (342)
  Duration  ~88s
```

#### 2. `npx tsc --noEmit` (mandatory additional gate, #1740)

```
exit 0
```

#### 3. `npm run build`

```
✔ Compiling TS
✔ Building build context
✔ Building admin panel
exit 0
```

#### 4. Lint

```
✖ 391 problems (0 errors, 391 warnings)
0 errors → OK
391 warnings → pre-existing, no new warnings introduced by this PR
```

#### 5. Kill-switch invariant (#1748)

```bash
git grep STRIPE_PI_WEBHOOKS_ENABLED \
  src/api/order/services/upsert.ts \
  src/api/order/controllers/order.ts \
  src/api/order/routes/01-custom.ts
# → (no output — zero matches)
```

> **PR2 correction (lessons #1776)**: the literal grep returned 2
> matches (the docstring header in `upsert.ts` mentions the flag by
> name as part of documenting the invariant). The actual invariant is
> "no runtime reads of the flag" — `process.env.STRIPE_PI_WEBHOOKS_ENABLED`
> is the precise check. PR2's kill-switch invariant test (`5.1a`/
> `5.1b`) verifies the precise form and reports zero matches in
> code lines.

#### 6. No-touch boundaries (PR1, verified at merge)

| Boundary | Status |
|---|---|
| `controllers/order.ts:52-92` (find) | byte-identical |
| `controllers/order.ts:103-148` (findOne) | byte-identical |
| `controllers/order.ts:209-273` (update) | byte-identical |
| `controllers/order.ts:requestCancellation` | byte-identical |
| `controllers/order.ts:stripeWebhook` | byte-identical |
| `services/stripe-webhook.ts:272-398` (succeeded handler) | byte-identical |
| `services/stripe-webhook.ts:461-576` (failed handler) | byte-identical |
| `content-types/order/lifecycles.ts` | byte-identical |
| `content-types/order/schema.json` | byte-identical (no migration) |
| `POST /orders` semantics | unchanged |
| `PUT /orders/:id` semantics | unchanged |
| `webhook-event` content type | unchanged |

### PR1 URL

<https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/37>

---

## PR2 Status

`ready` — awaiting user-driven merge. Branch:
`feat/sprint-5-stripe-upsert-backend-pr2`.

Implements tasks 3.1 → 5.2 + Phase 6 verification. Closing PR1's
deferred hardening gates (S-COU-3/5/6/8), race + idempotency
(S-COU-9/10), kill-switch invariant test.

### PR2 Commits

```
b097a7e test(order): STRIPE_PI_WEBHOOKS_ENABLED kill-switch invariant (Phase 5)
63549a3 feat(order): bounded unique-retry on UPSERT race (S-COU-9, S-COU-10)
b39d1db test(order): RED hardening tests for terminal/ownership/malformed (S-COU-3, S-COU-5/6, S-COU-8)
```

| Hash | Subject | Phase | Tests | Code |
|---|---|---|---|---|
| `b39d1db` | test(order): RED hardening tests for terminal/ownership/malformed (S-COU-3, S-COU-5/6, S-COU-8) | 3.1–3.4 | +8 | ~0 (existing impl verified) |
| `63549a3` | feat(order): bounded unique-retry on UPSERT race (S-COU-9, S-COU-10) | 4.1–4.4 | +4 | +117 (upsert.ts + controllers/order.ts) |
| `b097a7e` | test(order): STRIPE_PI_WEBHOOKS_ENABLED kill-switch invariant (Phase 5) | 5.1, 5.2 | +4 | ~0 |
| (Phase 6 verification) | see below | 6.1–6.4 | ~0 | ~0 |

### PR2 Files Changed

`git diff --stat main..feat/sprint-5-stripe-upsert-backend-pr2`:

```
 src/api/order/controllers/order.ts                 |  17 +
 src/api/order/services/upsert.ts                   | 100 ++++++
 test/api/order-upsert-concurrency.test.ts          | 379 +++++++++++++++++++++
 test/api/order-upsert-fallback-insert.test.ts      | 165 ++++++++-
 test/api/order-upsert-kill-switch-invariant.test.ts | 106 ++++++
 test/api/order-upsert-ownership.test.ts            | 218 ++++++++++++
 6 files changed, 983 insertions(+), 2 deletions(-)
```

| File | Action | Note |
|---|---|---|
| `src/api/order/services/upsert.ts` | modify | +100 lines: `isUniqueConstraintViolation` helper, `_runUpsertTransaction` extraction, bounded retry loop, `UpsertUniqueExhaustedError` typed marker |
| `src/api/order/controllers/order.ts` | modify | +17 lines: `UpsertUniqueExhaustedError` import + 409 catch block |
| `test/api/order-upsert-fallback-insert.test.ts` | modify | +165 lines: 1 S-COU-3 (cancelled 409) + 4 S-COU-8 (malformed 400) tests |
| `test/api/order-upsert-ownership.test.ts` | NEW | +218 lines: 3 tests covering S-COU-5 (in-trx) + S-COU-5b (pre-trx) + S-COU-6 |
| `test/api/order-upsert-concurrency.test.ts` | NEW | +379 lines: 4 tests covering S-COU-9 (retry converges) + S-COU-9b (bounded) + S-COU-9c (real Promise.all) + S-COU-10 (idempotent PUT) |
| `test/api/order-upsert-kill-switch-invariant.test.ts` | NEW | +106 lines: 4 tests for Phase 5 invariant |

### PR2 Test Counts

| Metric | Count |
|---|---|
| Total tests in full suite (after PR2) | **358** |
| New tests added by PR2 | **+16** |
| Pre-existing tests (regression: PR1 + older) | **342** |
| All-green assertion | ✓ (0 failed) |
| Test files added | 3 |
| Test files modified | 1 |
| New failing RED-tests at first run | 2 (4.1, 4.1b) — both confirmed to fail for the right reason before GREEN |

**PR2 new tests breakdown**:
- 3.1 S-COU-3 (cancelled 409) — 1 test
- 3.2 S-COU-5 (userId 403, in-trx) — 1 test
- 3.2b S-COU-5b (userId 403, pre-trx) — 1 test (bonus, exercises A-10 first check)
- 3.3 S-COU-6 (paymentIntentId 409) — 1 test
- 3.4a-d S-COU-8 (malformed payload) — 4 tests
- 4.1 S-COU-9 (race converges) — 1 test
- 4.1b S-COU-9 (bounded retry exhausts) — 1 test
- 4.1c S-COU-9 (real Promise.all idempotent) — 1 test (bonus)
- 4.2 S-COU-10 (idempotent repeat PUT) — 1 test
- 5.1a-c, 5.2 (kill-switch invariant) — 4 tests

### PR2 Verification Gates

#### 1. `npm run test:only`

```
Test Files  37 passed (37)
     Tests  358 passed (358)
  Duration  ~94s
```

#### 2. `npx tsc --noEmit` (mandatory additional gate, #1740)

```
exit 0 (no errors)
```

#### 3. `npm run build`

```
✔ Compiling TS (3351ms)
✔ Building build context (62ms)
✔ Building admin panel (9447ms)
exit 0
```

#### 4. Kill-switch invariant (#1748) — improved precision

```bash
git grep -n "process.env.STRIPE_PI_WEBHOOKS_ENABLED" \
  src/api/order/services/upsert.ts \
  src/api/order/controllers/order.ts \
  src/api/order/routes/01-custom.ts
# → (no output — zero matches)
```

> **PR2 strict invariant**: `process.env.STRIPE_PI_WEBHOOKS_ENABLED`
> access is forbidden in all 3 files. Verified by `5.1a` and `5.1b`
> tests. Flag NAME may appear in docstrings (as documentation of the
> invariant itself, see `upsert.ts` header).

#### 5. No-touch boundaries (verified via `git diff main..HEAD --stat`)

| Boundary | Status |
|---|---|
| `controllers/order.ts:52-92` (find) | byte-identical |
| `controllers/order.ts:103-148` (findOne) | byte-identical |
| `controllers/order.ts:209-273` (update) | byte-identical |
| `controllers/order.ts:requestCancellation` | byte-identical |
| `controllers/order.ts:stripeWebhook` | byte-identical |
| `controllers/order.ts:upsertByOrderId` | preserved from PR1; only +1 import + 16-line catch added (typed error mapping) |
| `services/order.ts` (raw-SQL stock decrement) | byte-identical from PR1 |
| `services/stripe-webhook.ts:272-398` (succeeded handler) | byte-identical |
| `services/stripe-webhook.ts:461-576` (failed handler) | byte-identical |
| `content-types/order/lifecycles.ts` | byte-identical |
| `content-types/order/schema.json` | byte-identical (no migration) |
| `routes/01-custom.ts` | byte-identical from PR1 |
| `POST /orders` semantics | unchanged |
| `PUT /orders/:id` semantics | unchanged |
| `webhook-event` content type | unchanged |
| Address fields | NOT added (deferred per #1763) |
| Frontend wiring | NOT touched (deferred per #1766) |

#### 6. Final diff line count vs budget

| Metric | Value |
|---|---|
| Forecast (orchestrator brief, pre-adjustment) | ~341 lines |
| Realistic forecast with PR1 lesson (#1775) | ~600 lines |
| Actual PR2 diff | **983 insertions / 2 deletions** |
| Budget (post-PR1 adjustment) | 600 lines |
| Status | **size:exception** (1.64× realistic forecast; 2.88× original forecast) |

**Why larger than forecast**:
- Concurrency test (`order-upsert-concurrency.test.ts`) = 379 lines
  (forecast ~150): vi.spyOn mocking setup, barrier logic, multiple
  assertions on retry + state + paymentsInfo merge.
- Ownership test (`order-upsert-ownership.test.ts`) = 218 lines
  (forecast ~50): two-user setup with separate auth, both
  ownership-403 surfaces (in-trx + pre-trx), detail-rich assertions.
- Fallback-insert additions = 165 lines (forecast ~80): S-COU-3
  zero-mutation assertions across all fields + 4 S-COU-8 variants
  each with full error envelope + X-Trace-Id assertions.

**Mitigation**: tests are grouped into the most coherent work-units
possible — concurrency stays atomic (race scenarios can't be split),
ownership covers both rejection surfaces (pre-trx + in-trx). Future
cycles should budget ~3x for test-heavy PRs.

### PR2 URL

<https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/38>

---

## Risks Discovered During Implementation (PR1 + PR2)

| # | Risk | Disposition | PR |
|---|---|---|---|
| 1 | Strapi 5.23.5 `HttpError` is abstract; direct `new HttpError(409, ...)` throws "cannot construct abstract class" (verified at `http-errors/index.js:114`). | Mitigated: controller uses `ctx.status` + `ctx.body` manual assembly to produce Strapi's standard `{data:null,error:{status,name,message,details:{traceId}}}` shape. Mirrors the existing `requestCancellation` action's manual error mapping (`controllers/order.ts:309-320`). PR2 adds a third typed marker `UpsertUniqueExhaustedError` mapped through the same envelope. | PR1 + PR2 |
| 2 | `updateProductStock` raw-SQL placeholder binding mismatch under ambient trx — SQLite returned `affected > 0` for the CAS marker but the per-item decrement silently updated zero rows. | Fixed: switched to `connection.raw(SQL, bindings)` on the active connection (trx or default) and engine-portable return-value handling (`res.changes` for SQLite, `res.rowCount` for PG). T-H-4 (concurrent +2 increments) green again. | PR1 |
| 3 | `entityService.findOne` cache returns stale product stock after raw-SQL decrement. | Documented in PR1 tests: use `strapi.db.query('api::product.product').findOne({ where, select })` for stock assertions (same pattern as `services/order.ts:267`). PR2's S-COU-10 test follows the same pattern. | PR1 + PR2 |
| 4 | Strapi's internal analytics fetch (`https://analytics.strapi.io/api/v2/track`) is stubbed by `vi.stubGlobal('fetch', mockFetch)`, so naïve `expect(mockFetch).not.toHaveBeenCalled()` would fail. | Mitigated in tests: filter mock calls by URL substring `/api/send-order-email` for the email-dispatch assertion. PR2's S-COU-10 test follows the same pattern. | PR1 + PR2 |
| 5 | Test helper's `cleanupUsers` filter (`@example.com` / `@test.com` / contains `test`) does not match arbitrary test emails like `u@e.com`, leaving stale users across test runs. | Documented: existing pre-PR test-helper behavior, not a regression. PR2's tests use `@example.com` consistently per the convention. | PR1 |
| 6 | SQLite serializes globally, so a "true" two-writer race isn't observable from inside the test — both PUTs run sequentially and both succeed without triggering the unique-constraint path. | Documented in `order-upsert-concurrency.test.ts` header. PR2's S-COU-9 contract test uses `vi.spyOn(documents, 'findFirst')` and `vi.spyOn(documents, 'create')` to simulate the race window explicitly (4.1, 4.1b). A real Promise.all (4.1c) verifies SQLite serializes correctly without retry. | PR2 |
| 7 | Bounded retry could become a loop if not capped. | Hardened: `MAX_UNIQUE_RETRIES = 1` constant in `upsert.ts`. Test 4.1b proves the cap by forcing create() to throw on every call and asserting the retry surface is reached (NOT a loop). Exhaustion surfaces as `UpsertUniqueExhaustedError` → 409. | PR2 |
| 8 | PR1's apply-progress claimed `git grep STRIPE_PI_WEBHOOKS_ENABLED` returned zero matches, but the docstring header in `upsert.ts` contains 2 matches (mentions the flag name as part of documenting the invariant). | Mitigated: PR2's kill-switch invariant test (`5.1a`) checks the precise `process.env.STRIPE_PI_WEBHOOKS_ENABLED` access pattern (zero matches), plus a comment-stripped in-memory check (`5.1b`). The flag NAME in docstrings is documentation, not a violation. | PR2 |
| 9 | `HttpError` 4xx-mapping deviation (PR1's manual `ctx.status` + `ctx.body`) was locked for PR2; risk that someone would reach for `new HttpError(409, ...)` again. | Mitigated: PR2 adds a third typed marker `UpsertUniqueExhaustedError` mapped via the same manual envelope, documented in the controller's catch block with the same A-7 reference. | PR2 |

---

## Lessons Learned (carried to apply-progress per #1776 / #1775)

1. **Forecast accuracy** (lesson #1775): PR1 forecast 341, actual 1123
   (3.3×). PR2 forecast ~600, actual 983 (1.64×). Tests with
   spy/mock/barrier logic dominate the gap. Future cycles should
   budget ~3× test-only PRs, ~2× mixed PRs.

2. **Documented fix must be in a commit** (lesson #1776): PR1's
   apply sub-agent documented 2 fixes (entityService cache risk #3,
   Strapi analytics fetch risk #4) in `apply-progress.md` but never
   committed the mitigations to source. CI ran against the bare
   commit. PR2's discipline: every "Mitigated in X" / "Documented in
   X" claim is verified against `git diff main..HEAD` before the PR
   is opened. (Risk #8 above is a real example — PR1's apply-progress
   overstated a grep result, PR2's test catches it.)

3. **HttpError is abstract in 5.23.5**: `new HttpError(...)` throws
   "cannot construct abstract class". Use `ctx.status` + `ctx.body`
   manual assembly for all 4xx mapping. Mirrors `requestCancellation`
   (`controllers/order.ts:309-320`).

4. **Bounded retry must be a constant, not a parameter**: reviewable
   in source, capped at 1, surfaced as a typed marker on exhaustion.

5. **RED-then-GREEN vs contract-lock-in**: when the implementation
   already exists from a prior PR, the "RED" step is replaced by
   "RED-then-GREEN-verified": write the test first, confirm it
   exercises the contract (not necessarily fail), commit tests with
   the code in the same work-unit.

6. **PR1's `git grep STRIPE_PI_WEBHOOKS_ENABLED` claim was imprecise**:
   the docstring header in `upsert.ts` matched. PR2's invariant test
   checks the precise `process.env.STRIPE_PI_WEBHOOKS_ENABLED` access
   pattern, not just the literal flag name.

---

## Cumulative Test Counts (PR1 + PR2)

| Metric | Count |
|---|---|
| Total tests in full suite | **358** |
| New tests added across PR1 + PR2 | **+21** (5 PR1 + 16 PR2) |
| Pre-existing tests (regression baseline) | **337** |
| All-green assertion | ✓ (0 failed) |
| Test files added across PR1 + PR2 | 6 |
| Test files modified across PR1 + PR2 | 2 (`fallback-insert`, `strapi-test-helpers`) |
| Commits across PR1 + PR2 | 7 (3 PR1 + 3 PR2 + 1 Phase 6 verification) |

---

## Next Steps (post-merge of PR2)

- User merges PR2 → main (orchestrator asks, do NOT auto-merge).
- Frontend cycle `sprint-5-stripe-upsert` (#1766) unblocked — rewires
  `useCreateOrder` against the merged contract.
- Backend hardening catalog (post-merge): any 4xx mapping that needs
  `HttpError` should be revisited in design phase — Strapi 5.23.5 may
  gain a `ctx.conflict` shortcut in a future release. The current
  manual assembly works but adds diff noise.