```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c4c069f3ce7df8d3740ceb47a1343d4dab37e221343883a39ffa28cd080bb26d
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 5/5
test_command: DATABASE_CLIENT=sqlite npm run test:only
test_exit_code: 0
test_output_hash: sha256:866c310f039f61e8c10abb1277080e4b0eb58ad2cfbd97456125c85cd1433489
build_command: DATABASE_CLIENT=sqlite npm run build
build_exit_code: 0
build_output_hash: sha256:28d9fb5162c92c197f82233f6eb738560edbd6e58a54267346f2f36f6d256226
```

# Verify Report: F1 — Backend Permission Bootstrap for `upsertByOrderId`

**Change**: `F1-backend-permissions`
**Capability**: `checkout-order-upsert` (delta: R-COU-11/12, S-COU-11..15)
**Version**: Strapi 5.23.5 backend (TypeScript 5, Node 22), 1 PR, 2 commits landed
**Mode**: Strict TDD
**Date**: 2026-09-11
**Verified tree**: `main` @ `a3bc7a7` (RED `5753eca`, GREEN `a3bc7a7`)

## Summary

**Verdict: PASS WITH WARNINGS.** Both delta requirements (R-COU-11, R-COU-12) and all five delta scenarios (S-COU-11..15) are implemented and verified by runtime-passing tests against the **user-patched spec** (row-existence semantics + no `X-Trace-Id` on middleware-level rejections). All four command gates exit 0: the full Vitest suite passes **368/368 across 39 files** (361 baseline + 7 new F1 tests), `npx tsc --noEmit` is clean, `npm run build` succeeds, `npm run lint` reports 0 errors. The six pre-existing UPSERT HTTP suites (21 tests) pass **without** the artificial helper grant — the production bootstrap in `src/index.ts` is provably the sole grant path. `src/api/` and `config/` show a zero-line diff. Zero blockers, zero critical findings. Warnings are inherited test-harness hygiene items (out of F1 code scope), documented below.

## Verification Gates

| # | Gate | Command | Exit | Result |
|---|---|---|---|---|
| 0 | Build (A-6 precondition — harness loads compiled `dist/` bootstrap) | `DATABASE_CLIENT=sqlite npm run build` | 0 | Admin panel built; run BEFORE `test:only` so the new array entry is visible to the harness |
| 1 | Full test suite | `DATABASE_CLIENT=sqlite npm run test:only` | 0 | **39 files, 368/368 passed, 0 failed, 0 skipped**, 96.54s — 361 baseline + 7 F1 tests, all green |
| 2 | TypeScript (mandatory, obs #1740 — vitest skips `*.test.ts` typecheck) | `DATABASE_CLIENT=sqlite npx tsc --noEmit` | 0 | 0 errors, 0 warnings |
| 3 | Production build (standalone gate, post-test) | `DATABASE_CLIENT=sqlite npm run build` | 0 | Clean; evidence hash from this run |
| 4 | Lint | `DATABASE_CLIENT=sqlite npm run lint` | 0 | **0 errors**, 467 warnings (pre-existing `no-explicit-any` convention; 7 attributable to the new test file, same class) |
| 5 | No-touch boundaries | `git diff 1f85b36..HEAD -- src/api config` | — | **Empty diff** — zero changes to routes/controller/service/lifecycles/webhook/config |
| 6 | Changed-file inventory | `git diff 1f85b36..HEAD --stat` | — | Exactly 3 files: `src/index.ts` (+3), `test/api/order-upsert-permission.test.ts` (+212, new), `test/helpers/strapi-test-helpers.ts` (+3/−5) — 218+/5− authored, within the 400-line budget |
| 7 | Coverage (informational, Strict TDD 5d) | `DATABASE_CLIENT=sqlite npm run test:coverage` | 0 | 368/368 re-confirmed under coverage; F1-changed lines `src/index.ts:135-143` **fully covered** |

## Spec Compliance Matrix

All tests below ran green inside the 368/368 suite run (`test/api/order-upsert-permission.test.ts`, 7 tests passed, 1430ms). Requirement and scenario totals: **2/2 and 5/5** (delta spec ADDED sections; R-COU-1..10 / S-COU-1..10 remain byte-identical and out of scope).

| Spec ID | Scenario / Rule | Test (`test/api/order-upsert-permission.test.ts`) | Status |
|---|---|---|---|
| R-COU-11 / S-COU-11 (DB invariant) | Clean bootstrap leaves exactly one `upsertByOrderId` row on `authenticated`; idempotent [ORD-26] pattern; early return `:130-133` preserved | `S-COU-11a` (:72-79) — `rowsForAction` filtered to `role.type === 'authenticated'` asserts length 1 + action match | PASS |
| R-COU-11 / S-COU-11 (HTTP effectiveness) | Owner PUT is NOT middleware-403; reaches the R-COU-2/5 owner-success path | `S-COU-11b` (:112-145) — authenticated owner PUT `.expect(200)`, asserts `response.body.data.id === order.documentId` | PASS |
| R-COU-11 / S-COU-12 | Idempotent re-boot preserves a single row | `S-COU-12` (:97-106) — re-invokes exported `bootstrap({ strapi })` (A-7), asserts exactly 1 row overall and on `authenticated` | PASS |
| R-COU-12 | Grant restricted to `authenticated` only | `R-COU-12` (:85-91) — asserts `roleTypes` deep-equals `['authenticated']`, explicitly non-vacuous (empty list would fail) | PASS |
| S-COU-13 | Anonymous PUT → 403 structured Strapi envelope from the U&P middleware, **no `X-Trace-Id`** (patched wording) | `S-COU-13` (:152-170) — `.expect(403)`, `data: null`, `error.status: 403`, `error.name: 'ForbiddenError'`, message `/forbidden/i` | PASS |
| S-COU-14 | Invalid JWT → 401 before the permission check | `S-COU-14` (:175-190) — `.expect(401)`, `error.status: 401`, `error.name: 'UnauthorizedError'` | PASS |
| S-COU-15 | Helper no longer grants the action; production bootstrap is the sole grant path | `S-COU-15` (:198-211) — extracts `setupTestPermissions` body via regex with non-vacuity guards (still grants `find` + `requestCancellation`), asserts the UPSERT action string is absent | PASS |

**Compliance summary**: 5/5 scenarios compliant, 2/2 requirements satisfied.

## Spec-vs-Implementation Reconciliation (user-approved patches)

The spec was patched on disk before verify to reflect Strapi 5.23.5 reality. This verification confirms the implementation matches the **patched** spec, and that each patch is factually correct:

| Patch | Location | Verification |
|---|---|---|
| R-COU-11: row-existence semantics (no `enabled` column; row existence IS the grant) | delta spec + cumulative spec | **Confirmed against the installed plugin**: `@strapi/plugin-users-permissions/server/content-types/permission/index.js` defines `up_permissions` with ONLY `action` + `role` attributes. The `enabled: true` data keys in `src/index.ts:142` and the helper are silently-accepted v4 remnants — harmless, not asserted by tests |
| S-COU-12: "exactly one permission row exists … no `enabled` column to inspect" | cumulative spec | Test `S-COU-12` asserts row count (1), not an `enabled` value — matches patched wording exactly |
| S-COU-13: structured envelope without `X-Trace-Id` on middleware-level 403 | delta spec + cumulative spec | Test `S-COU-13` asserts `data: null` / `error.status: 403` / `error.name: 'ForbiddenError'` / `/forbidden/i` and does NOT assert `X-Trace-Id` — matches patched wording; the header is set in the order controller, which the middleware short-circuits before |

No unresolved spec-vs-implementation discrepancies remain.

## TDD Compliance (Strict TDD)

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ | TDD Cycle Evidence table present in apply-progress with RED/GREEN/TRIANGULATE/SAFETY NET per task |
| All tasks have tests | ✅ | 2/2 tasks map to `test/api/order-upsert-permission.test.ts` |
| RED confirmed (tests exist) | ✅ | Test file exists on disk (212 lines); RED commit `5753eca` recorded 4 failed / 3 passed, all failures attributed to the absent grant (permission-row absent + owner PUT 403) |
| GREEN confirmed (tests pass) | ✅ | 7/7 passed in this verify run — independent re-execution, not just the apply claim |
| Triangulation adequate | ✅ | 7 cases across 5 scenarios + 1 requirement rule; DB rows + end-to-end 200/403/401 triangulate the grant |
| Safety Net for modified files | ✅ | 361/361 baseline ran before edits (task 1.1); 368/368 after (task 2.1) |

**TDD Compliance**: 6/6 checks passed.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 0 | 0 | — |
| Integration | 7 | 1 (`test/api/order-upsert-permission.test.ts`) | Vitest + real Strapi instance (SQLite) + supertest HTTP + direct `users-permissions_permission` queries |
| E2E | 0 | 0 | not installed (OFF per capability config) |
| **Total (F1 delta)** | **7** | **1** | |

## Changed File Coverage

| File | Line % | Uncovered Lines | Rating |
|---|---|---|---|
| `src/index.ts` (F1 lines 135-143) | 100% of F1-changed range | none in 135-143; file-wide 46/108 stmts uncovered are the `[bug-images-400]` block, log fallbacks, and PRD/ORD error branches — none F1 | ✅ Excellent (F1 range) |
| `test/helpers/strapi-test-helpers.ts` | 77.9% (180/232) | error paths, cleanup fallbacks | ⚠️ Acceptable |

Note: raw per-file v8 coverage of `src/index.ts` is structurally understated because the harness executes the compiled `dist/index.js` bootstrap (A-6); behavioral evidence (368/368 incl. 7 F1 + 21 UPSERT HTTP tests) is authoritative.

## Assertion Quality

**Assertion quality**: ✅ All assertions verify real behavior. No tautologies, no ghost loops, no type-only assertions, no mock-heavy patterns (zero `vi.mock` in the file). Notable hardening: `R-COU-12` (:88-90) is explicitly non-vacuous ("proves the grant exists AND is scoped — no vacuous pass over an empty list"); `S-COU-15` (:207-208) carries non-vacuity guards proving the helper was cleaned, not gutted.

## Quality Metrics

**Linter**: ✅ 0 errors / ⚠️ 467 warnings (pre-existing repo-wide `no-explicit-any` class; 7 from the new test file — consistent with the repo's documented convention)
**Type Checker**: ✅ 0 errors (`npx tsc --noEmit`)

## No-Regression Evidence

The six pre-existing UPSERT HTTP suites all pass **without** the artificial helper grant (removed in RED `5753eca`), proving the production bootstrap is the effective grant path:

| File | Tests | Result |
|---|---|---|
| `test/api/order-upsert-paid-shell.test.ts` | 3 | ✅ (2 HTTP tests failed in RED with helper removed — now green via bootstrap, A-2 confirmed) |
| `test/api/order-upsert-payment-failed.test.ts` | 1 | ✅ |
| `test/api/order-upsert-fallback-insert.test.ts` | 6 | ✅ |
| `test/api/order-upsert-ownership.test.ts` | 3 | ✅ |
| `test/api/order-upsert-concurrency.test.ts` | 4 | ✅ |
| `test/api/order-upsert-kill-switch-invariant.test.ts` | 4 | ✅ |

361-test baseline green; full suite 368/368.

## Design Coherence (A-1..A-7)

| Decision | Followed? | Evidence |
|---|---|---|
| A-1 Reuse [ORD-26] block, no new bootstrap section | ✅ | `src/index.ts:135-143` — single array entry inside the existing enable-or-create loop |
| A-2 Helper loses the artificial grant | ✅ | `strapi-test-helpers.ts:115-123` — action removed; replacement comment names production bootstrap as sole grant path |
| A-3 No `administrator` grant, no admin bypass | ✅ | `adminOrderPermissions` (`src/index.ts:288-295`) does NOT include `upsertByOrderId`; service untouched |
| A-4 Early return `:130-133` preserved verbatim | ✅ | `if (!authenticatedRole) { warn; return; }` byte-intact |
| A-5 Scope limited to `upsertByOrderId` | ✅ | Helper still grants `requestCancellation` (:119); drift deferred as designed |
| A-6 Build-gated verification | ✅ | Both build runs executed before/after `test:only` in this verify |
| A-7 Assert DB rows, not logs; re-invoke exported `bootstrap()` | ✅ | `rowsForAction` queries the permission table; `S-COU-12` re-invokes `strapiApp.bootstrap({ strapi })` |

## Risks Re-evaluated (from apply-progress sections 1-4)

| # | Risk (apply-progress) | Disposition in verify |
|---|---|---|
| 1 | Harness pollution — `:memory:` is a FILE at repo root | **Persists.** The file (1.2 MB SQLite) was re-created by this verify's test run. Mitigated in-run: removed before and after every gate (clean-DB semantics preserved, equivalent to CI fresh checkout). Open item V-O1 |
| 2 | `.env` `DATABASE_CLIENT=postgres` leaks into `test:only` | **Workaround applied.** All gates prefixed `DATABASE_CLIENT=sqlite`; 368/368 confirms the proper harness. Root cause (helper infers `isPgSmoke` from ambient env after dotenv load) is out of F1 scope. Open item V-O2 |
| 3 | `enabled` column v4-ism | **Resolved via spec patch (R-COU-11/S-COU-12).** Verified against the installed plugin schema (`up_permissions` has only `action` + `role`). Tests assert row existence + end-to-end effectiveness |
| 4 | `X-Trace-Id` on middleware-level 403 | **Resolved via spec patch (S-COU-13).** Test asserts the structured Strapi envelope the middleware actually produces; no `X-Trace-Id` assertion |

## NFR / Cross-repo / Rollback

- **Authorization (security):** R-COU-12 closes widening — the action is granted only to `authenticated` (bootstrap role lookup `type: 'authenticated'`, every create/update pins `role: authenticatedRole.id`; admin list excludes it; helper excludes it). Service-level guards (`src/api/order/services/upsert.ts`) untouched (zero `src/api` diff).
- **Performance:** N/A per spec — one idempotent lookup per boot; no per-request overhead. Confirmed: no runtime path changes.
- **Observability:** existing `strapi.log.info` lines at `src/index.ts:159, :169` cover update/create; no new log surface.
- **Operability:** UI-enabled rows are never disabled by the bootstrap (the loop only creates or updates); note that deleting a row via the UI re-creates it on next boot — identical pre-existing [ORD-26] behavior, not a new F1 risk.
- **Cross-repo:** zero frontend impact. The frontend (`e-commerce-relojes-bv-beni`) contract is unchanged — same JWT, same `X-Trace-Id`, same envelopes; the grant only unblocks authenticated checkout on clean backend installs. No frontend changes needed.
- **Rollback reality:** reverting `a3bc7a7` leaves the action ungranted on the next clean boot — behavior returns to the drifted 403, and the F1 tests fail honestly (RED state). The helper does NOT compensate (S-COU-15). Rows already created by the bootstrap persist until manually deleted. No schema, data, or flag to unwind.

## Issues Found

**CRITICAL**: None.
**WARNING**:
- V-W1 — `:memory:` harness pollution persists (risk 1 above); recommend a follow-up pinning `DATABASE_FILENAME` to a real in-memory URI or a gitignored tmp path.
- V-W2 — `.env` `DATABASE_CLIENT` leak requires per-command prefixing (risk 2 above); recommend the helper stop inferring `isPgSmoke` from ambient env.
- V-W3 — `enabled: true` v4-remnant data keys remain in `src/index.ts` and the helper; harmless and now spec-documented, but a future Strapi upgrade audit should sweep them.
- V-W4 — Lint warnings 467 repo-wide (0 errors); 7 from the new test file, same pre-existing class.

**SUGGESTION**: V-O3 — `S-COU-15` verifies the helper by source-inspection regex; a future refactor of the helper's function signature would silently break the extraction. The non-vacuity guards (:207-208) mitigate this; a structural import-based check would be sturdier.

## Verdict

**PASS WITH WARNINGS.**

- All 4 command gates exit 0 (test 368/368, tsc clean, build clean, lint 0 errors).
- Both delta requirements and all 5 delta scenarios covered by runtime-passing tests against the user-patched spec; patches verified factually correct against Strapi 5.23.5.
- No-regression confirmed: 6 pre-existing UPSERT HTTP suites (21 tests) green without the helper grant; zero `src/api`/`config` diff.
- Warnings (V-W1..V-W4) are inherited test-harness hygiene items outside F1's code scope — consistent with the repo's PASS WITH WARNINGS precedent (obs #1761).

## Recommendation

**Ready for archive.** No remediation required. The warnings V-W1/V-W2 are recommended inputs for a named test-harness hygiene follow-up; V-W3/V-W4 can ride the existing lint/upgrade hygiene backlog.
