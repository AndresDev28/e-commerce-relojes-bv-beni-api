```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:670e89716e53c7287770aa8a0099c7cb8b2608ac17331f295e58428ed0dd28d0
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 10/10
test_command: npm run test:only
test_exit_code: 0
test_output_hash: sha256:d05c6065c42e7f4318c2297364d56818b5fdac5ccd07cd5e3e97048e2ef42340
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:3b2ff684292555e66c23419e7dccc6f7c2a02340bc135e722bcf7b303386599b
```

# Verify Report: Checkout Order UPSERT

**Change**: `sprint-5-stripe-upsert-backend`
**Capability**: `checkout-order-upsert`
**Version**: Strapi 5.23.5 backend (TypeScript 5, `strict:false`; Node 22), 2 stacked-to-main PRs (#37, #38), both merged
**Mode**: Strict TDD
**Date**: 2026-09-07
**Verified tree**: `main` @ `f8cfac8` (PR1 merge `daf24c2`, PR2 merge `f8cfac8`)

## Summary

**Verdict: PASS WITH WARNINGS.** All 10 requirements (R-COU-1..10) and all 10 scenarios (S-COU-1..10) are implemented and verified against merged `main`, plus the `STRIPE_PI_WEBHOOKS_ENABLED` kill-switch invariant (0 flag reads in the 3 endpoint files). The full Vitest suite passes 358/358 tests across 37 files (exit 0), including the 337-test pre-cycle regression baseline. `npx tsc --noEmit` exits 0, `npm run build` exits 0, `npm run lint` exits 0 (0 errors, 442 warnings — pre-existing style convention). All 7 locked decisions (D1–D7) are validated with code evidence. Zero blockers, zero critical findings; 4 non-blocking warnings and 1 suggestion are documented below. The frontend cycle `sprint-5-stripe-upsert` is unblocked.

## Verification Gates

| # | Gate | Command | Exit | Result |
|---|---|---|---|---|
| 1 | Test suite | `npm run test:only` | 0 | **37 files, 358/358 passed, 0 failed, 0 skipped**, 91.32s (re-run for evidence hash: identical 37/358 green) |
| 2 | TypeScript (mandatory, obs #1740) | `npx tsc --noEmit` | 0 | 0 errors, 0 warnings — vitest does not typecheck `*.test.ts`; this gate covers it |
| 3 | Production build | `npm run build` | 0 | TS compile + build context + admin panel all succeed; 0 errors in output |
| 4 | Lint (informational) | `npm run lint` | 0 | **0 errors**, 442 warnings (98 of them in the 9 cycle files, all `no-explicit-any`-style; consistent with repo `strict:false` convention; warnings tolerable per project convention — see V-W3) |
| 5 | Kill-switch invariant (obs #1748) | `git grep -nE '(process\.env\.STRIPE_PI_WEBHOOKS_ENABLED\|STRIPE_PI_WEBHOOKS_ENABLED\s*=\|require.*STRIPE_PI_WEBHOOKS_ENABLED)' src/api/order/services/upsert.ts src/api/order/controllers/order.ts src/api/order/routes/01-custom.ts` | 1 (no matches) | **Zero matches** — no runtime flag access in any of the 3 endpoint files. Flag NAME in the `upsert.ts` docstring is invariant documentation, not an access pattern. Reinforced by tests 5.1a–5.1c |
| 6 | No-touch boundaries | `git diff main~2..main -- <boundary files/ranges>` (see note below) | — | All canonical ranges **byte-identical** (see V-W1, V-W2) |
| 7 | Schema migration | `git diff main~2..main -- src/api/order/content-types/order/schema.json` (also run literally as `main~6..main`) | — | **Empty diff** — zero migration; unique `orderId`/`paymentIntentId` constraints from Gap #1 reused as-is |

**Note on baseline correction (V-W2)**: the verification brief specified `git diff main~6..main~5` for gate 6. On the actual first-parent chain, `main~6..main~5` is `9632c0f..f02e324` (Gap #1 PR4a→PR4b era — before this cycle). The correct pre-cycle baseline is **`main~2` = `6baa483`** (verified: first parent of the PR1 merge `daf24c2`, i.e., main HEAD immediately before PR1). All no-touch diffs above were run as `git diff main~2..main` — exactly the PR1+PR2 change set.

**No-touch evidence (baseline `6baa483` → `main`)**:

| Boundary | Result |
|---|---|
| `controllers/order.ts:52-92` (`find` security override) | byte-identical — no diff hunk intersects the range |
| `controllers/order.ts:103-148` (`findOne` security override) | byte-identical — no diff hunk intersects the range |
| `controllers/order.ts:209-273` (`update`) | byte-identical — no diff hunk intersects the range |
| `controllers/order.ts` `requestCancellation` / `stripeWebhook` | `requestCancellation` byte-identical; `stripeWebhook` has a **1-byte trailing-whitespace removal** in its catch block (V-W1) — `git diff -w` proves semantic identity |
| `services/stripe-webhook.ts:272-398` (succeeded handler) | byte-identical — full-file diff is 0 bytes |
| `services/stripe-webhook.ts:461-576` (failed handler) | byte-identical — full-file diff is 0 bytes |
| `content-types/order/lifecycles.ts` (all) | byte-identical — full-file diff is 0 bytes |
| `content-types/order/schema.json` (all) | byte-identical — full-file diff is 0 bytes (gate 7) |
| `routes/order.ts` (core `POST /orders`, `PUT /orders/:id`) | byte-identical — full-file diff is 0 bytes |

The only `controllers/order.ts` diff hunks are: (a) the typed-error import block at the top, (b) the V-W1 whitespace byte, (c) the appended `upsertByOrderId` method at the end of the file. `routes/01-custom.ts` diff adds only the new `PUT /orders/by-order-id/:orderId` route literal.

## Spec Coverage Matrix

All tests below ran green in the full suite (358/358). Requirement and scenario totals: **10/10 and 10/10**.

| Spec ID | Scenario / Rule | Test file | Test(s) | Status |
|---|---|---|---|---|
| R-COU-1 | Dedicated `PUT /orders/by-order-id/:orderId`; core routes unchanged | all 6 upsert files (route exercised via supertest on every test) + regression baseline | `routes/01-custom.ts:24-31` route literal; `routes/order.ts` 0-byte diff; core `POST /orders` suites (`order-security-*`, `order-stock-*`) green | PASS |
| R-COU-2 / S-COU-1 | Paid shell enrichment preserves state byte-identical, zero dispatch | `test/api/order-upsert-paid-shell.test.ts` | `2.1 [S-COU-1]` (:104) — asserts `orderStatus`/`paymentInfo.source`/`paymentError` byte-identical, stock decremented once (A-13), zero email dispatches | PASS |
| R-COU-3 / S-COU-2 | `payment_failed` shell preserves status + redacted audit, no payment restart | `test/api/order-upsert-payment-failed.test.ts` | `2.2 [S-COU-2]` (:41) | PASS |
| R-COU-4 / S-COU-3 | `cancelled`/`refunded` → 409 zero mutation | `test/api/order-upsert-fallback-insert.test.ts` | `3.1 [S-COU-3]` (:107) — 409 + zero mutation + X-Trace-Id | PASS |
| R-COU-5 / S-COU-4 | Missing Order → INSERT `pending` | `test/api/order-upsert-fallback-insert.test.ts` | `2.3 [S-COU-4]` (:43) — INSERT pending with server-computed `total` | PASS |
| R-COU-6 / S-COU-5 | `userId` mismatch → 403, identifiers never overwritten | `test/api/order-upsert-ownership.test.ts` | `3.2 [S-COU-5]` (:60, in-trx) + `3.2b` (:178, pre-trx A-10 first check) — 403 + `userId` stays A | PASS |
| S-COU-6 | `paymentIntentId` mismatch → 409 | `test/api/order-upsert-ownership.test.ts` | `3.3 [S-COU-6]` (:120) — 409 + PI stays PI-1 | PASS |
| R-COU-7 / S-COU-7 | paymentInfo merge-only, server keys preserved | `test/api/order-upsert-paid-shell.test.ts` | `2.4 [S-COU-7]` (:212) — allowlist merges over `{source, paymentError}` without clobbering | PASS |
| R-COU-8 / S-COU-8 | Malformed payload → structured error + X-Trace-Id, never 500 | `test/api/order-upsert-fallback-insert.test.ts` | `3.4a-d [S-COU-8]` (:176, :203, :223, :243) — missing `paymentIntentId`/`userId`, non-array `items`, non-numeric `subtotal` → 400 envelope + trace | PASS |
| R-COU-9 / S-COU-9 | Concurrent writers → exactly one authoritative record | `test/api/order-upsert-concurrency.test.ts` | `4.1` (:53, bounded retry converges), `4.1b` (:160, retry is BOUNDED — second violation → 409, never loops), `4.1c` (:240, real `Promise.all` idempotent convergence) | PASS |
| R-COU-10 / S-COU-10 | Idempotent repeated PUT — no side effect beyond first write | `test/api/order-upsert-concurrency.test.ts` | `4.2 [S-COU-10]` (:281) — no additional dispatch, history row, or stock decrement | PASS |
| Kill-switch (Phase 5 invariant, obs #1748) | Endpoint behaves identically flag OFF/ON/absent; zero flag reads | `test/api/order-upsert-kill-switch-invariant.test.ts` | `5.1a` (:28, no `process.env` reads), `5.1b` (:47, comment-stripped in-memory check), `5.1c` (:65, no flag refs via imports), `5.2` (:81, docstring NAME is documentation) — counted outside the 10/10 spec totals as a proposal success criterion | PASS |

## Locked Decisions Validation

| Decision | Contract | Evidence (code + test) | Status |
|---|---|---|---|
| D1 | Dedicated atomic UPSERT endpoint; `POST /orders` unchanged | `routes/01-custom.ts` — new `PUT /orders/by-order-id/:orderId` handler `order.upsertByOrderId`; `routes/order.ts` 0-byte diff (core routes untouched); 337-test pre-cycle regression baseline green incl. core `POST /orders` suites | PASS |
| D2 | Paid shell: enrich ONLY `items`/`subtotal`/`shipping`; preserve `orderStatus`, `paymentInfo.source`, `paymentError` | `upsert.ts:317-322` — `updateData = { items, subtotal, shipping, paymentInfo: merged }`, **no `orderStatus` key** (A-13 preserve-by-construction); `upsert.ts:308-311` — existing `paymentInfo` keys on the LEFT of the spread; test `2.1` asserts byte-identical preservation + zero dispatch | PASS |
| D3 | `payment_failed` shell: enrich client-owned fields only; preserve status + redacted `paymentError`; never restart payment | `upsert.ts:72` — `'payment_failed'` ∈ `ENRICHABLE_STATUSES`; `sanitizePaymentInfo` (:79-90) drops any client `paymentError`/`source` attempt (allowlist `method/brand/last4` only); update payload never touches status; test `2.2` asserts audit byte-identical, no restart | PASS |
| D4 | `cancelled`/`refunded` → 409 zero mutation | `upsert.ts:73` `TERMINAL_STATUSES = ['cancelled','refunded']`; gate `:282-291` throws `UpsertConflictError` BEFORE any write (find → ownership → status gate ordering); test `3.1` asserts 409 + zero mutation + X-Trace-Id | PASS |
| D5 | No existing Order → INSERT `orderStatus: 'pending'`; webhook stays authoritative | `upsert.ts:354-367` — `documents.create` with `orderStatus: 'pending'`, `user: { connect: [authUserId] }`, server-computed `total`; test `2.3` | PASS |
| D6 | Ownership: `userId` mismatch → 403; `paymentIntentId` mismatch → 409; identifiers never overwritten | `upsert.ts:159-168` (payload `userId` ≠ auth → `UpsertForbiddenError`/403, pre-trx), `:251-264` (row `user` ≠ auth → 403, in-trx), `:267-277` (PI mismatch → `UpsertConflictError`/409); `paymentIntentId`/`userId` never appear in `updateData`; tests `3.2`, `3.2b`, `3.3` | PASS |
| D7 | Client supplies only `paymentInfo.{method,brand,last4}`; backend shallow-merges over existing | `upsert.ts:77` `PAYMENTINFO_ALLOWLIST = ['method','brand','last4']`; `:308-311` shallow merge `{ ...existing.paymentInfo, ...sanitized }`; test `2.4` asserts `{source, paymentError, method, brand, last4}` survives | PASS |

## Risks Carried Forward

From `apply-progress.md` risks #1–#9 (the four PR2-era rows correspond to the brief's PR2-R1..R4), plus new findings from this verification:

| # | Risk | Disposition | Source |
|---|---|---|---|
| 1 | Strapi 5.23.5 `HttpError` is abstract — direct construction throws | Mitigated: manual `ctx.status` + `ctx.body` envelope (mirrors `requestCancellation`); revisit if a future Strapi release adds `ctx.conflict` (backend hardening catalog) | apply-progress #1 |
| 2 | `updateProductStock` raw-SQL placeholder binding under ambient trx | Fixed in PR1 (`services/order.ts` +30/−18 — see V-W4); T-H-4 green | apply-progress #2 |
| 3 | `entityService.findOne` stale stock cache after raw-SQL decrement | Documented pattern: assert stock via `strapi.db.query` | apply-progress #3 |
| 4 | Strapi analytics fetch stub vs email-dispatch assertion | Documented pattern: filter mock calls by `/api/send-order-email` | apply-progress #4 |
| 5 | Test-helper `cleanupUsers` filter misses arbitrary emails | Documented; cycle tests use `@example.com` convention | apply-progress #5 |
| 6 | SQLite serializes globally — true two-writer race not observable in-test | Documented in `order-upsert-concurrency.test.ts` header; race simulated via `vi.spyOn` (4.1/4.1b) + real `Promise.all` outcome assertion (4.1c); PG-level locking untested (V-S1) | apply-progress #6 (PR2-R1) |
| 7 | Bounded retry could loop | Hardened: `MAX_UNIQUE_RETRIES = 1` constant; test 4.1b proves the cap; exhaustion → `UpsertUniqueExhaustedError` → 409 | apply-progress #7 (PR2-R2) |
| 8 | PR1's literal flag-name grep claim was imprecise (docstring matches) | Mitigated: precise `process.env.STRIPE_PI_WEBHOOKS_ENABLED` invariant test (5.1a/5.1b); this verify re-ran the precise grep — 0 matches | apply-progress #8 (PR2-R3) |
| 9 | Risk of reaching for `new HttpError(409, ...)` again in future 4xx mapping | Mitigated: third typed marker `UpsertUniqueExhaustedError` mapped through the same manual envelope, documented at the controller catch | apply-progress #9 (PR2-R4) |
| V-W1 | `stripeWebhook` catch block: 1 trailing-whitespace byte removed (line ~341 baseline) — apply-progress's "byte-identical" claim is imprecise by 1 byte | `git diff -w` empty for the hunk — provably semantic-identical; zero behavior/security impact; the canonical gate-6 ranges are all strictly byte-identical. Optional: restore the byte in a trivial follow-up commit or annotate at archive | NEW (verify) |
| V-W2 | Verification brief's gate-6 command used `main~6..main~5` — the wrong commit pair (Gap #1 PR4b era) | Corrected: baseline `main~2` (`6baa483` = `daf24c2^1`, main HEAD before PR1); all no-touch diffs re-run against it | NEW (verify) |
| V-W3 | Lint warnings grew 391 → 442 repo-wide; the 9 cycle files contribute 98 (`no-explicit-any`-style) | 0 errors — tolerable per project convention and Gap #1 archive precedent (obs #1761); candidate for a dedicated lint-hygiene cycle | NEW (verify) |
| V-W4 | `services/order.ts` modified beyond the proposal's diff plan | Documented in apply-progress as PR1's raw-SQL binding bug fix (risk #2), covered by green T-H-4; in-scope by exception, not a silent change | apply-progress #2 / NEW (verify) |
| V-W5 | `tasks.md` Phase 1/2 checkboxes (1.1.1–2.8) unchecked despite PR1 merged | Checkbox bookkeeping lag (same class as Gap #1 W1); git history + apply-progress PR1 table are authoritative | NEW (verify) |
| V-S1 | PostgreSQL-specific unique-violation/retry behavior not exercised in CI (SQLite serializes) | Suggestion: staging smoke on PG before the frontend flag flip; guarded SQL + `isUniqueConstraintViolation` are engine-portable by design | NEW (verify) |

## Diff Summary

`git diff --stat main~2..main` (PR1 + PR2, the full cycle):

```
 .../apply-progress.md                              | 383 +++++++++++++++++++++
 .../sprint-5-stripe-upsert-backend/tasks.md        |  73 ++++
 src/api/order/controllers/order.ts                 | 143 +++++++-
 src/api/order/routes/01-custom.ts                  |  11 +
 src/api/order/services/order.ts                    |  48 ++-
 src/api/order/services/upsert.ts                   | 371 ++++++++++++++++++++
 test/api/order-upsert-concurrency.test.ts          | 379 +++++++++++++++++++++
 test/api/order-upsert-fallback-insert.test.ts      | 261 ++++++++++++++
 .../api/order-upsert-kill-switch-invariant.test.ts | 106 ++++++
 test/api/order-upsert-ownership.test.ts            | 218 ++++++++++++
 test/api/order-upsert-paid-shell.test.ts           | 279 +++++++++++++++
 test/api/order-upsert-payment-failed.test.ts       | 122 +++++++
 test/helpers/strapi-test-helpers.ts                |   5 +
 13 files changed, 2380 insertions(+), 19 deletions(-)
```

Code: 573 changed lines (upsert service 371, controller 143, routes 11, services/order fix 48). Tests: 1370 lines across 6 new files + helper. Both PRs carried `size:exception` per the Review Workload Guard (`ask-on-risk` resolved as 2 stacked-to-main PRs); the forecast-vs-actual gap (lesson #1775) is documented in apply-progress with the ~3× test-PR budgeting recommendation.

## Verdict

**PASS WITH WARNINGS.**

- All 4 command gates exit 0 (test 358/358, tsc clean, build clean, lint 0 errors).
- All 10 requirements and 10 scenarios covered by green tests; kill-switch invariant holds (0 flag reads, grep + 4 tests).
- All 7 locked decisions (D1–D7) validated against actual code with test evidence.
- All canonical no-touch boundary ranges byte-identical; zero schema migration.
- Warnings (V-W1..V-W5) are non-blocking: one provably semantic-identical whitespace byte, a corrected verification command, lint-warning hygiene, a documented scope exception, and checkbox lag. This matches the Gap #1 archive convention (obs #1761: PASS WITH WARNINGS acceptable for soft launch; warnings preserved for post-soft-launch review, obs #1760).

## Cross-repo Readiness

- **Frontend cycle `sprint-5-stripe-upsert` (Engram #1766) is unblocked now**: the merged contract is `PUT /api/orders/by-order-id/:orderId` with payload `{ userId, paymentIntentId, items[], subtotal, shipping, paymentInfo?{method, brand, last4} }`, responses per D1–D7 (403/409/400 envelopes carry `error.details.traceId` + `X-Trace-Id` header). The frontend cycle can begin its proposal/spec rewrite and apply.
- **`STRIPE_PI_WEBHOOKS_ENABLED` flip is the user's decision** once the frontend cycle merges (obs #1748): the flag stays OFF (default) until the frontend UPSERT rewiring ships; this endpoint behaves identically in all three flag states (verified: 0 flag reads + tests 5.1a–c).
- Suggested pre-flip smoke on PostgreSQL staging (V-S1) to exercise engine-level unique-violation paths once, given CI runs on SQLite.
