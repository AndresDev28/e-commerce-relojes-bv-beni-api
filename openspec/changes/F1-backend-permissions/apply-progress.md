# Apply Progress: F1-backend-permissions

**Store**: openspec | **Mode**: Strict TDD | **Date**: 2026-09-11 | **Native attempt**: acquired (`proceed`), max 3 attempts, 200-line budget

## Task Status

| Task | Status | Evidence |
|---|---|---|
| 1.1 RED (test + helper grant removal) | ✅ Done | Commit `5753eca` — `test(order): expose bootstrap permission drift` |
| 2.1 GREEN (bootstrap entry) | ✅ Done | Commit `a3bc7a7` — `fix(permissions): bootstrap order upsert action` |
| 3.1 `test:only` full suite | ✅ 368/368 passed, exit 0 | 361 baseline + 7 new; six existing UPSERT HTTP tests green without the helper grant (A-2 confirmed) |
| 3.2 `npx tsc --noEmit` | ✅ exit 0 | Mandatory gate (#1740) |
| 3.3 `npm run build` | ✅ exit 0 | Ran 3× (RED, GREEN, gate) |
| 3.4 `npm run lint` | ✅ exit 0 | 0 errors; 467 repo-wide pre-existing `no-explicit-any` warnings; new test file adds 7 warnings of the same existing class, 0 errors |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `test/api/order-upsert-permission.test.ts` | Integration (SQLite Strapi + real HTTP via supertest) | ✅ 361/361 before edits (proper harness) | ✅ 4 failed / 3 passed — **all failures attributed to the absent grant** | ✅ 7/7 passed | ✅ 7 scenarios (S-COU-11a/11b/12/13/14/15 + R-COU-12) | ➖ None needed |
| 2.1 | same | Integration | ✅ 368/368 after | N/A (GREEN commit) | ✅ full suite green | ✅ DB rows + end-to-end 200/403/401 triangulate the grant | ➖ Single array entry per A-1 |

**RED evidence (clean DB, pre-fix)** — `npx vitest run test/api/order-upsert-permission.test.ts`:

- S-COU-11a: `AssertionError: expected [] to have a length of 1 but got +0` (grant row absent)
- R-COU-12: `AssertionError: expected [] to deeply equal [ 'authenticated' ]` (no grant at all)
- S-COU-12: `AssertionError: expected [] to have a length of 1 but got +0` (re-boot created nothing)
- S-COU-11b: `Error: expected 200 "OK", got 403 "Forbidden"` (middleware rejection = the real-world bug)
- S-COU-13/14/15: passed (invariants independent of the fix)

**Companion RED evidence (proposal risk #1 materialized as designed)** — `npx vitest run test/api/order-upsert-paid-shell.test.ts` after helper removal, pre-fix: 2 HTTP tests failed with `expected 200 "OK", got 403 "Forbidden"` — proving the helper grant, not production bootstrap, was masking the drift. Post-GREEN: green via the bootstrap path (A-2).

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command + result | `DATABASE_CLIENT=sqlite npx vitest run test/api/order-upsert-permission.test.ts` → RED 4F/3P (permission-absent only) → GREEN 7/7 pass |
| Runtime harness | Real Strapi instance (`setupStrapi()` → compiled `dist/` bootstrap, A-6) + supertest HTTP against `PUT /api/orders/by-order-id/:orderId` + direct `users-permissions_permission` DB queries (A-7) |
| Rollback boundary | Revert `a3bc7a7` (grant returns to drifted state, tests fail 403 — honest) and/or `5753eca` (test + helper restoration). No other files touched; `src/api/`, `config/` diff = 0 lines |

## Lines per File (authored, HEAD~2)

| File | + | − |
|---|---:|---:|
| `src/index.ts` | 3 | 0 |
| `test/api/order-upsert-permission.test.ts` | 212 | 0 |
| `test/helpers/strapi-test-helpers.ts` | 3 | 5 |
| **Total** | **218** | **5** |

Within the 400-line review budget → single PR, no `size:exception`. `src/index.ts` is +3 (not +1): the array entry plus a 2-line anti-regression comment naming bootstrap as the sole grant path (guards the S-COU-15 invariant from re-introduction). Test file is 212 vs the 60–100 forecast — the 8 planned assertions (tasks.md Test Plan) plus schema-drift documentation comments; not minified to fit the estimate.

## Commits

| Hash | Message |
|---|---|
| `5753eca` | `test(order): expose bootstrap permission drift` |
| `a3bc7a7` | `fix(permissions): bootstrap order upsert action` |

## Risks Materialized / New Observations

1. **⚠️ Harness pollution — `:memory:` is a FILE, not a database (major env discovery).** `@strapi/database` resolves `DATABASE_FILENAME=':memory:'` relative to the project root, creating a persisted SQLite **file literally named `:memory:`** at the repo root. Rows from 2026-09-07 (including a stale `upsertByOrderId` grant created by the old helper) survived across runs, making the first RED run fail for the WRONG reasons (row found with `enabled: undefined`; owner PUT 200 from the stale grant). Mitigated by deleting the file before each verified run (equivalent to CI's fresh checkout). The file is a local artifact; verify phase should run with it removed. Consider (out of F1 scope) pinning `DATABASE_FILENAME` to a real in-memory URI or a gitignored tmp path in the helper.
2. **⚠️ Local `.env` `DATABASE_CLIENT=postgres` silently routes `test:only` to the dev Postgres.** The helper's V-S1 `isPgSmoke` guard (strapi-test-helpers.ts:180) reads `DATABASE_CLIENT` AFTER dotenv loaded `.env` at `@strapi/strapi` import time (the `ENV_PATH` pin at :169 runs too late), so un-prefixed runs hit real PG with a dirty schema. This produced 2 pre-existing failures on the untouched tree (`[NT-6]` varchar(255) overflow, `4.1c` duplicate-order race) that vanish with `DATABASE_CLIENT=sqlite` (proper harness → 361/361 baseline). All F1 gates were run with `DATABASE_CLIENT=sqlite`. Recommend a separate fix (helper should not infer isPgSmoke from ambient env) — out of F1 scope.
3. **Strapi 5.23.5 removed `enabled` from `plugin::users-permissions.permission`** (schema has only `action` + `role`; `up_permissions` table has no `enabled` column). **Row existence IS the effective grant.** The `enabled: true` data keys in [ORD-26] and in this change are silently-accepted v4 remnants. R-COU-11/S-COU-12's "enabled: true" wording was mapped to v5 semantics: assert exactly one row for (action, authenticated) + effectiveness proven end-to-end (owner PUT 200). Flag for spec wording sync in verify/archive.
4. **S-COU-13 "with R-COU-8 envelope (structured error + X-Trace-Id)"**: middleware-level 403 never carries `X-Trace-Id` — the header is set in the order controller (`controllers/order.ts:372-380`), which the middleware short-circuits before. No global trace middleware exists. Test asserts what production can do without touching out-of-scope files: 403 + structured envelope (`data: null`, `error.status: 403`, `error.name: 'ForbiddenError'`, message `/forbidden/i` proving middleware origin vs the service's ownership wording). Spec text is over-promising for the middleware path; verify should adjudicate (either relax the scenario wording to Gap #3's envelope for middleware rejects, or defer a global trace middleware to a follow-up).

## Deviations from Design

- **None in mechanism**: A-1 (array entry, [ORD-26] reuse), A-2 (helper grant + `[GAP-3]` comment removed, replaced by bootstrap-pointer comment), A-3 (no administrator grant — `adminOrderPermissions` untouched), A-4 (early return `:130-133` verbatim), A-5 (`requestCancellation` untouched), A-6 (build before every `test:only`), A-7 (DB-row assertions, exported `bootstrap()` re-invoked for S-COU-12 — no log asserts).
- **Wording adaptations forced by environment reality** (documented in Risks 3/4): `enabled:true` assertions → row-existence + effectiveness; X-Trace-Id-on-middleware-403 → structured-envelope-only assertion.

## Verification Snapshot

- `DATABASE_CLIENT=sqlite npm run test:only` → **368 passed (368)** exit 0
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
- `npm run lint` → exit 0 (0 errors)
- `git diff HEAD~2 --name-only` → exactly 3 in-scope files; `src/api/` + `config/` untouched (0 diff lines)

## Next Recommended Step

**`sdd-verify`** — independent verification against R-COU-11/12 + S-COU-11..15, adjudicating observations 3 and 4 (spec wording vs Strapi 5.23.5 reality), and confirming gates on a fresh DB file (remove `:memory:` first).
