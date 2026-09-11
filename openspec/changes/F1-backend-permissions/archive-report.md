# Archive Report: F1 — Backend Permission Bootstrap for `upsertByOrderId`

**Change**: `F1-backend-permissions`
**Cycle status**: CLOSED (archived)
**Archive date**: 2026-09-11
**Mode**: Strict TDD (one PR; 2 commits; OpenSpec artifact store)
**Repo state at archive**: `main` @ `a3bc7a7` (HEAD on `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions`; PR #40 OPEN)
**Evidence**: `verify-report.md` (PASS WITH WARNINGS — `evidence_revision: sha256:c4c069f3ce7df8d3740ceb47a1343d4dab37e221343883a39ffa28cd080bb26d`)

---

## Cycle Summary

F1 follow-up of 5 (Engram #1812–#1816) from Sprint 5 Gap #1 verify-phase warnings (Engram #1760, #1761). Clean Strapi installs were returning HTTP 403 on `PUT /api/orders/by-order-id/:orderId` from the Users & Permissions middleware because `orderPermissions` in `src/index.ts:135-140` omitted `api::order.order.upsertByOrderId`. The endpoint, controller, and service-level guards from Gap #3 (Engram #1783) were correct; the defect was purely the missing grant in the idempotent bootstrap block. The defect survived Gap #3 verification because `setupTestPermissions` artificially granted the action at `test/helpers/strapi-test-helpers.ts:124`, masking the drift in CI.

F1 closes the gap with the smallest possible diff — one array entry plus a 2-line anti-regression comment naming the bootstrap as the sole grant path — and removes the artificial helper grant that hid it. A RED-first integration test (`test/api/order-upsert-permission.test.ts`, 212 lines, 7 tests) proves the invariant end-to-end: DB row existence on `authenticated`, idempotent re-boot, owner PUT not middleware-403, anonymous 403, invalid JWT 401, no public/anonymous grant, helper does not grant. The cycle ended **PASS WITH WARNINGS** (4 warnings V-W1..V-W4 — test-harness hygiene items out of F1 code scope; consistent with Gap #3 archive convention Engram #1760/#1761). PR #40 is **OPEN** on `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions` (https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/40); the cycle is shipped pending merge.

**Verdict**: SUCCESS — 1 PR (2 commits), 7 new tests, 368/368 tests, 2/2 requirements + 5/5 scenarios green, kill-switch invariant preserved, no schema migration, fully revertible. Purely additive cycle on the bootstrap side; zero changes to routes/controller/service/lifecycles/webhook/config (verified: `git diff 1f85b36..HEAD -- src/api config` = empty).

---

## Cycle Metrics

| Metric | Value |
|---|---|
| PRs opened | 1 (#40 OPEN on `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions`) |
| Total commits (cycle, work-unit) | **2** (`5753eca` RED + `a3bc7a7` GREEN) |
| New tests added (cycle) | **+7** (single RED-first file) |
| Final test count (post-cycle) | **368 passing** across 39 files (361 Gap #3 baseline + 7 F1 tests) |
| Pre-cycle regression baseline (361 tests) | **0 regressions** — full baseline green post-GREEN, **without** the helper grant (A-2 confirmed) |
| Test files added (cycle) | 1 (`test/api/order-upsert-permission.test.ts`, 212 lines) |
| Test files modified (cycle) | 1 (`test/helpers/strapi-test-helpers.ts`, −5/+3 — removed artificial grant + `[GAP-3]` comment, added bootstrap-pointer comment) |
| Source files modified (cycle) | 1 (`src/index.ts`, +3 — one array entry + 2-line anti-regression comment) |
| No-touch files (cycle) | **Verified** — `src/api/order/routes/01-custom.ts`, `src/api/order/controllers/order.ts`, `src/api/order/services/upsert.ts`, `lifecycles.ts`, `stripe-webhook.ts`, all schemas, `config/` — `git diff 1f85b36..HEAD -- src/api config` = empty (0 lines) |
| Total diff (full cycle) | **+218 / −5** lines (`1f85b36..a3bc7a7`) — within the 400-line review budget |
| Locked decisions validated | **7/7 A-1..A-7** PASS — A-1 array block reuse, A-2 helper grant removed, A-3 no admin grant, A-4 early return `:130-133` preserved, A-5 scope limited to UPSERT, A-6 build-gated verification, A-7 DB-row assertions |
| Spec coverage | **R-COU 2/2** (R-COU-11, R-COU-12), **S-COU 5/5** (S-COU-11..15) — every delta requirement and scenario covered by ≥1 green test |
| Spec patches applied (user-approved) | R-COU-11/S-COU-12 row-existence semantics (Strapi 5.23.5 dropped `enabled` column); S-COU-13 no `X-Trace-Id` on middleware-level 403 (header is set in controller, which middleware short-circuits before) |
| Schema migration | **None** — `schema.json` 0-byte diff; no DB migration; no env flag changes |
| Build / Typecheck / Lint | `DATABASE_CLIENT=sqlite npm run build` exit 0 · `DATABASE_CLIENT=sqlite npx tsc --noEmit` exit 0 (mandatory per Engram #1740: vitest skips `*.test.ts` typecheck) · `DATABASE_CLIENT=sqlite npm run lint` exit 0 (0 errors, 467 pre-existing `no-explicit-any` warnings; 7 from new test file, same class) |
| Test command (green) | `DATABASE_CLIENT=sqlite npm run test:only` → 368/368 pass, 96.54s |

> **Final test count source**: `verify-report.md` Gate #1 — 368/368 confirmed at independent re-execution post-GREEN. This is the highest-ranked source per Final-State Authority; 367 number does not appear. Pre-GREEN, the helper removal exposed 2 HTTP tests in `order-upsert-paid-shell.test.ts` failing 403 (RED evidence; A-2 confirmed).
>
> **Diff numbers**: `git diff --shortstat 1f85b36..a3bc7a7` = **218 insertions, 5 deletions, 3 files**. PR forecast in `tasks.md` §Review Workload Forecast was ~91 authored lines (range 66–118); actual 218 is `~2.4×` forecast — within the 400-line review budget. Test file is 212 vs the 60–100 forecast (8 planned assertions plus schema-drift documentation comments; honest test coverage, not minified to fit the estimate per Engram #1830).

---

## PR Breakdown

### PR #40 — Permission Bootstrap + RED-First Integration Test (commit `a3bc7a7`, branch `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions`)

A single PR, two conventional commits, **GREEN as HEAD**. The smallest possible diff that fixes the defect and proves the invariant end-to-end:

- **RED commit `5753eca`** — `test(order): expose bootstrap permission drift`:
  - **NEW test file**: `test/api/order-upsert-permission.test.ts` (212 lines, 7 tests, all green post-GREEN).
  - **MODIFIED helper**: `test/helpers/strapi-test-helpers.ts:115-125` — removed `'api::order.order.upsertByOrderId'` artificial grant + `[GAP-3]` comment.
  - **RED evidence captured in apply-progress**: S-COU-11a (`expected [] to have a length of 1 but got +0`), R-COU-12 (`expected [] to deeply equal ['authenticated']`), S-COU-12 (`expected [] to have a length of 1 but got +0`), S-COU-11b (`expected 200 "OK", got 403 "Forbidden"`) — all attributed to the absent grant. Companion RED: 2 pre-existing UPSERT HTTP tests in `order-upsert-paid-shell.test.ts` failed 403 without the helper grant, proving the helper, not production bootstrap, was masking the drift.
- **GREEN commit `a3bc7a7`** — `fix(permissions): bootstrap order upsert action`:
  - **MODIFIED production code**: `src/index.ts:135-143` — appended `{ action: 'api::order.order.upsertByOrderId', enabled: true }` to `orderPermissions`, plus a 2-line anti-regression comment naming bootstrap as the sole grant path (guards the S-COU-15 invariant from re-introduction).
  - **No-touch boundary held**: routes/controller/service/lifecycles/webhook/schemas/config unchanged. Verified `git diff 1f85b36..HEAD -- src/api config` = empty.

**PR #40 verdict**: PASS. All gates green (`DATABASE_CLIENT=sqlite npm run test:only` 368/368, `npx tsc --noEmit` exit 0, `npm run build` exit 0, lint 0 errors + 467 pre-existing warnings). The 6 pre-existing UPSERT HTTP suites (21 tests) pass **without** the artificial helper grant — production bootstrap is provably the sole grant path. PR is OPEN awaiting review/merge (cycle is shipped regardless; merge is delivery policy, not a verification gate).

> **Single-PR rationale** (per `tasks.md` Review Workload Forecast): the cycle was designed as **Option A, 1 PR** — ~91 authored lines vs 400-line budget → LOW overrun risk. No chained PRs; `ask-on-risk` strategy did not need to fire. Actual diff (218+/5−) is `~2.4×` forecast but still `~54%` of the budget; the inflation is honest test coverage (8 assertions + no-vacuity guards + drift documentation), not minified to fit.

---

## Spec Compliance

All tests below ran green inside the 368/368 suite run (`test/api/order-upsert-permission.test.ts`, 7 tests passed, 1430ms). Requirement and scenario totals: **2/2 and 5/5** (delta spec ADDED sections; R-COU-1..10 / S-COU-1..10 from Gap #3 remain byte-identical and out of scope per design §1).

| Spec ID | Scenario / Rule | Test Reference | Status |
|---|---|---|---|
| R-COU-11 / S-COU-11 (DB invariant) | Clean bootstrap leaves exactly one `upsertByOrderId` row on `authenticated`; idempotent [ORD-26] pattern; early return `:130-133` preserved | `S-COU-11a` — `rowsForAction` filtered to `role.type === 'authenticated'` asserts length 1 + action match | PASS |
| R-COU-11 / S-COU-11 (HTTP effectiveness) | Owner PUT is NOT middleware-403; reaches the R-COU-2/5 owner-success path | `S-COU-11b` — authenticated owner PUT `.expect(200)`, asserts `response.body.data.id === order.documentId` | PASS |
| R-COU-11 / S-COU-12 | Idempotent re-boot preserves a single row | `S-COU-12` — re-invokes exported `bootstrap({ strapi })` (A-7), asserts exactly 1 row overall and on `authenticated` | PASS |
| R-COU-12 | Grant restricted to `authenticated` only | `R-COU-12` — asserts `roleTypes` deep-equals `['authenticated']`, explicitly non-vacuous (empty list would fail — Engram #1830 hardening) | PASS |
| S-COU-13 | Anonymous PUT → 403 structured Strapi envelope from the U&P middleware, **no `X-Trace-Id`** (patched wording) | `S-COU-13` — `.expect(403)`, `data: null`, `error.status: 403`, `error.name: 'ForbiddenError'`, message `/forbidden/i` | PASS |
| S-COU-14 | Invalid JWT → 401 before the permission check | `S-COU-14` — `.expect(401)`, `error.status: 401`, `error.name: 'UnauthorizedError'` | PASS |
| S-COU-15 | Helper no longer grants the action; production bootstrap is the sole grant path | `S-COU-15` — extracts `setupTestPermissions` body via regex with non-vacuity guards (still grants `find` + `requestCancellation`), asserts the UPSERT action string is absent | PASS |

**Compliance summary**: 5/5 scenarios compliant, 2/2 requirements satisfied, all against the **user-patched spec** (per session: row-existence semantics + no `X-Trace-Id` on middleware-level rejections — verified factually correct against Strapi 5.23.5).

### Spec-vs-Implementation Reconciliation (user-approved patches)

The spec was patched on disk before verify to reflect Strapi 5.23.5 reality. Each patch is verified factually correct:

| Patch | Verification |
|---|---|
| **R-COU-11: row-existence semantics** (no `enabled` column; row existence IS the grant) | Confirmed against the installed plugin: `@strapi/plugin-users-permissions/server/content-types/permission/index.js` defines `up_permissions` with ONLY `action` + `role` attributes. `enabled: true` data keys in `src/index.ts:142` and the helper are silently-accepted v4 remnants — harmless, not asserted by tests |
| **S-COU-12: "exactly one permission row exists … no `enabled` column to inspect"** | Test `S-COU-12` asserts row count (1), not an `enabled` value — matches patched wording exactly |
| **S-COU-13: structured envelope without `X-Trace-Id` on middleware-level 403** | Test asserts `data: null` / `error.status: 403` / `error.name: 'ForbiddenError'` / `/forbidden/i` and does NOT assert `X-Trace-Id` — matches patched wording; the header is set in `controllers/order.ts:372-380`, which the middleware short-circuits before |

No unresolved spec-vs-implementation discrepancies remain.

---

## Discovery Transfer

Strapi 5.23.5 facts already documented in Engram #1830 + #1834 (apply/verify) and reconfirmed in this cycle. Carried forward to future F-cycles as hardened knowledge:

1. **Strapi 5.23.5 dropped the `enabled` column** from `plugin::users-permissions.permission`. The `up_permissions` table has only `action` + `role`; row existence **is** the grant. Any `enabled: true` data keys are silently-accepted v4 remnants. (Spec wording patched accordingly — see Spec Compliance.)
2. **`DATABASE_FILENAME=':memory:'` does NOT resolve as in-memory.** `@strapi/database` resolves it relative to the project root, creating a persisted SQLite file literally named `:memory:` (1.2 MB at repo root, gitignored by `.gitignore` line 135). Stale rows survive across runs. **Hygiene**: remove the file before each verified run; equivalent to CI's fresh checkout. Future fix: pin `DATABASE_FILENAME` to a real in-memory URI or a gitignored tmp path — out of F1 scope (V-W1).
3. **`.env` `DATABASE_CLIENT=postgres` silently routes `test:only` to dev Postgres.** The helper's `isPgSmoke` guard reads `DATABASE_CLIENT` **after** dotenv loaded `.env` at `@strapi/strapi` import time (the `ENV_PATH` pin at `:169` runs too late). Un-prefixed `npm run test:only` hits real PG with a dirty schema. **Workaround**: prefix `DATABASE_CLIENT=sqlite` on every gate invocation (used throughout this cycle). **Root cause fix** out of F1 scope (V-W2).
4. **U&P middleware rejections never carry `X-Trace-Id`.** The header is set in `controllers/order.ts:372-380` after auth — middleware rejects before. S-COU-13 wording over-promised; test asserts the structured envelope (`ForbiddenError`, `/forbidden/i`) instead.
5. **Harness loads bootstrap from `distDir: './dist'`** (compiled) per `setupStrapi()` line 197. Every GREEN must `npm run build && npm run test:only`; without rebuild, the bootstrap fix is invisible and GREEN fails spuriously. A-6 design decision; double-applied during this cycle.
6. **Native dispatcher parses `### Requirement:` and `#### Scenario:` headings.** The project's convention `### R-COU-N Name` does NOT match the spec parser; the F1 spec was reformatted before verify to use `### Requirement: R-COU-N Name`. Future delta specs should match on first authoring (Engram #1834 lesson).
7. **OpenSpec untracked convention** (per Engram #6baa483 commit message): planning artifacts (`exploration.md`, `proposal.md`, `design.md`, delta specs, `verify-report.md`, `config.yaml`) remain **UNTRACKED**; only canonical specs (`openspec/specs/<cap>/spec.md`), `tasks.md`, and `archive-report.md` are committed. The F1 folder is untracked throughout (confirmed by `git status --short`).
8. **Attempt ledger `--max-changed-lines` counts untracked `openspec/` artifacts as part of the diff.** For verify, all 23 untracked artifacts totaled 2934 lines vs the 50-line cap — same pattern as the apply generation (Engram #1830). Two mitigations available for future cycles: (a) declare `--untracked-scope=exclude` on acquire, or (b) add `openspec/` to `.gitignore` properly (a hygiene improvement). This cycle ran with `--untracked-scope=exclude` after the user reset per Engram #1832.

---

## Issues Remaining / Open Follow-ups

Four non-blocking warnings from `verify-report.md` are intentionally preserved per the Gap #3 archive convention (Engram #1760/#1761: prioritize soft-launch MVP; fix warnings after observing production behavior). All four are **test-harness hygiene items out of F1 code scope** — consistent with the repo's PASS WITH WARNINGS precedent.

| # | Warning | Severity | Source | Final State | Action / Mitigation |
|---|---------|----------|--------|-------------|---------------------|
| V-W1 | `:memory:` harness pollution persists — `DATABASE_FILENAME=':memory:'` resolves as a project-root file that survives across runs (1.2 MB SQLite). Stale rows from 2026-09-07 contaminated the first RED run. | **MED** | verify-report W1 | **PRESERVED** | Mitigated in-run by removing the file before every gate. Recommend a follow-up pinning `DATABASE_FILENAME` to a real in-memory URI or a gitignored tmp path. Filed as a named test-harness hygiene follow-up. |
| V-W2 | `.env` `DATABASE_CLIENT` leaks into `test:only` BEFORE the helper's `ENV_PATH` pin. Un-prefixed runs hit real PG with a dirty schema. The 2 pre-existing failures (`[NT-6]` varchar(255) overflow, `4.1c` duplicate-order race) vanish with `DATABASE_CLIENT=sqlite`. | **MED** | verify-report W2 | **PRESERVED** (workaround applied throughout this cycle) | Mitigated by `DATABASE_CLIENT=sqlite` prefix on every gate. Root cause (helper infers `isPgSmoke` from ambient env after dotenv load) is out of F1 scope. Recommend the helper stop inferring from ambient env. Filed as a named test-harness hygiene follow-up. |
| V-W3 | `enabled: true` v4-remnant data keys remain in `src/index.ts:142` and the helper. Harmless (Strapi 5.23.5 silently accepts them) and now spec-documented. | **LOW** | verify-report W3 | **PRESERVED** | Spec patches R-COU-11/S-COU-12 acknowledge the v5 row-existence semantics; the data keys ride forward as documentation. A future Strapi upgrade audit should sweep them. |
| V-W4 | Lint warnings 467 repo-wide (0 errors); 7 from the new test file, same pre-existing `no-explicit-any` class. | **LOW** | verify-report W4 | **PRESERVED** | Consistent with Gap #3 archive precedent (Engram #1761). Candidate for the post-launch lint-hygiene cycle. |

**Net preserved warnings**: 4 (V-W1..V-W4). None block production deploy; all sit on the same soft-launch observation track as Gap #1/Gap #3 preserved warnings.

### Open follow-ups surfaced by this cycle (outside V-W1..V-W4)

1. **openspec/ untracked convention** (per Engram #6baa483) — the planning artifacts (exploration, proposal, design, delta specs, verify-report, config.yaml) remain untracked; only canonical specs, tasks, and archive-report are committed. This cycle honors the convention. **Future hygiene improvement**: add `openspec/` to `.gitignore` (or selectively `openspec/changes/*/{exploration,proposal,design,specs,verify-report}.md` if finer control is desired) so `git status --short` doesn't show the 23+ untracked planning files. Out of scope for this cycle; documented for the next maintainer.
2. **sdd-attempt `--max-changed-lines` cap pattern** — the default cap under-counts the untracked artifact set. Future cycles should set `--untracked-scope=exclude` on `sdd-attempt acquire` when the cycle's intended diff is small (≤200 lines authored) but the untracked planning files push the total past the cap. Recorded as a pattern for F2–F5.
3. **F1.5 / F2 candidate — `requestCancellation` parallel drift** (per Engram #1819 §6, #1821 Out-of-scope): the test helper still grants `requestCancellation` artificially at `strapi-test-helpers.ts:119`; the production `[ORD-26]` block does NOT include it. Same defect shape as F1, separate decision space. Deferred to a named follow-up by user decision.
4. **F1.5 / F2 candidate — admin override policy** (per Engram #1819 §6, #1821 Out-of-scope): `adminOrderPermissions` (`src/index.ts:285-292`) does NOT include `upsertByOrderId`; the service has no admin bypass. Locked user decision; revisit only if admin tooling requires it.

---

## Cross-repo Impact

| Dependency | Status | Impact |
|---|---|---|
| **Frontend Next.js repo** (`e-commerce-relojes-bv-beni`) | **ZERO CHANGES** | The contract is byte-identical — same JWT (`Authorization: Bearer`), same `X-Trace-Id`, same 400/403/409/500 envelopes, same business body. F1 is **transparent** from the frontend's perspective: the fix unblocks authenticated checkout on clean backend installs without any client-visible change. `e-commerce-relojes-bv-beni/src/app/api/orders/by-order-id/[orderId]/route.ts:20-44` + `src/features/orders/services/upsertOrderService.ts:41-62` + `src/features/checkout/hooks/useCreateOrder.ts:71-96` continue working unchanged. |
| **Backend `main`** | **MODIFIED** | `src/index.ts:135-143` (+3) and `test/helpers/strapi-test-helpers.ts` (+3/−5) — the bootstrap now grants `api::order.order.upsertByOrderId` to `authenticated`. Routes/controller/service/lifecycles/webhook/config untouched (`git diff 1f85b36..HEAD -- src/api config` = empty). |
| **Gap #3 archive (`sprint-5-stripe-upsert-backend`)** | **UNCHANGED** | The cumulative spec stays at R-COU-1..10 / S-COU-1..10; the F1 delta (R-COU-11/12, S-COU-11..15) lives in the F1 change folder only — canonical promotion is the orchestrator's settle step (Engram #1832 follow-up after archive). |
| **Gap #1 archive (`sprint-5-stripe-webhook`)** | **UNCHANGED** | Frontend already provides `metadata.orderId` / `metadata.userId`; the bootstrap fix is the matching server-side authentication half for the UPSERT flow. |
| **`STRIPE_PI_WEBHOOKS_ENABLED` flag** | **OFF (default)** | Unchanged. F1 does not touch any webhook or env flag path. |
| **Stripe webhook production registration** | **OPEN (ops concern)** | Independent of this cycle. |
| **Gap #4 (idempotencyKey in `paymentIntents.create`)** | **OPEN (adjacent Sprint 5 work)** | Per Gap #1 archive §12 / Engram #1731; not blocking Gap #3/F1 close. |
| **Gaps #5 / #6 / #7** (deferred per Engram #1731) | **OPEN (not blocking)** | Gap #5 stock hardening beyond Gap #1; Gap #6 business-decision cleanup; Gap #7 E2E tests (long pole). |
| **Follow-ups F2–F5** (Engram #1813–#1816) | **OPEN** | F1 closes the first of five follow-ups. The remaining four are independent of F1 and unblocked by its merge. |

**What the frontend gets from this cycle**:
- Authenticated `PUT /api/orders/by-order-id/:orderId` works on clean backend installs (previously 403'd).
- All other behavior (ownership 403, paymentIntentId mismatch 409, terminal status 409, malformed 400, internal 500) is byte-identical.
- No env flag flip, no schema migration, no client-visible payload change.

---

## Rollback Plan

**Revert the PR merge** of `a3bc7a7` (or close PR #40 without merging if pre-merge). The next bootstrap stops granting `api::order.order.upsertByOrderId`, restoring the prior 403 behavior on clean installs.

| Component | Rollback behavior |
|---|---|
| `src/index.ts:135-143` (production) | Reverts to the prior 4-entry `orderPermissions` (find/findOne/create/update). The action is no longer granted by bootstrap. |
| `test/helpers/strapi-test-helpers.ts:120-124` | If the GREEN commit is reverted but the RED commit (`5753eca`) is kept, the helper would still lack the artificial grant — but the new F1 test would fail (S-COU-11a, R-COU-12, S-COU-12). To restore test stability, **revert both commits** (RED + GREEN together) as a unit. |
| `test/api/order-upsert-permission.test.ts` | Removed with the RED commit. |
| Manually-enabled permission rows (created via the U&P UI) | **PERSIST** — the idempotent [ORD-26] block never disables rows, only creates or enables. Operators can disable manually-enabled rows through the UI if desired. |
| F1 test rows in `users-permissions_permission` table | **PERSIST** until manually deleted — they don't auto-undo. Operators can clean up via the U&P UI. |
| Database schema | **No migration to revert** — F1 touches no schema. |
| Environment variables | **No flag to flip** — F1 introduces no env dependency. |
| Frontend impact | **None** — frontend contract is unchanged. |

**Rollback boundary is honest**: reverting returns clean installs to the pre-F1 403 behavior, with tests failing RED on the missing grant (matches pre-F1 state). No silent degradation, no data loss.

---

## References

### PR

- **#40** — `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions` (HEAD `a3bc7a7`, OPEN) — bootstrap entry + RED-first integration test + helper cleanup. URL: https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/40.

### Commits (2 cycle commits)

```
5753eca test(order): expose bootstrap permission drift        [RED]
a3bc7a7 fix(permissions): bootstrap order upsert action       [GREEN, HEAD]
```

### OpenSpec artifacts (this cycle)

- `openspec/changes/F1-backend-permissions/proposal.md` — R-COU-11/12 + S-COU-11..15 intent, scope, acceptance criteria, risks, rollback
- `openspec/changes/F1-backend-permissions/exploration.md` — pre-cycle investigation (Engram #1819)
- `openspec/changes/F1-backend-permissions/design.md` — A-1..A-7 + 1 sequence diagram (SD-1)
- `openspec/changes/F1-backend-permissions/specs/checkout-order-upsert/spec.md` — R-COU-11/12 + S-COU-11..15 (delta spec; patched for Strapi 5.23.5 reality)
- `openspec/changes/F1-backend-permissions/tasks.md` — Phase 1 RED + Phase 2 GREEN + Phase 3 verification (6/6 tasks complete)
- `openspec/changes/F1-backend-permissions/apply-progress.md` — RED/GREEN/triangulation evidence, risks #1–#4, deviations
- `openspec/changes/F1-backend-permissions/verify-report.md` — PASS WITH WARNINGS, 2/2 requirements + 5/5 scenarios + 4 command gates + V-W1..V-W4
- `openspec/changes/F1-backend-permissions/archive-report.md` — **THIS FILE** (closing artifact)

### Engram observations (this cycle)

- **Origin**: #1812 (F1 follow-up definition, DX footgun from UX testing)
- **Inputs consulted**: #1819 (exploration), #1821 (proposal), #1822 (delta spec), #1824 (tasks), #1828 (design)
- **Discovery (apply)**: #1830 — Strapi 5.23.5 dropped `enabled` column + `:memory:` file + `.env` leak + no `X-Trace-Id` on middleware 403 + build-before-test (A-6)
- **Verify-phase obs**: #1832 (PASS WITH WARNINGS, validated 2/2 req, 5/5 scen)
- **Cycle-close obs**: #1834 (PR #40 OPEN, F1 of 5 closed, dispatcher `### Requirement:`/`#### Scenario:` heading constraint, openspec untracked convention, `--untracked-scope=exclude` pattern)
- **This archive obs**: see §"SDD Cycle Complete" → Engram `sdd/F1-backend-permissions/archive-report` (post-save, persisted at archive time)

### Cross-repo

- Frontend `e-commerce-relojes-bv-beni` — zero changes; F1 is transparent client-side.
- Gap #3 archive (`openspec/changes/sprint-5-stripe-upsert-backend/`, Engram #1783) — R-COU-1..10 / S-COU-1..10 source of truth; F1 is the bootstrap-hardening half that Gap #3 deferred.

### Related cycle archives (project precedent)

- **Gap #1 archive** — `openspec/changes/sprint-5-stripe-webhook/archive-report.md` (Engram #1761) — canonical precedent for this report's structure.
- **Gap #3 archive** — `openspec/changes/sprint-5-stripe-upsert-backend/archive-report.md` — direct line of inheritance for Cycle Metrics, PR Breakdown, Warnings Preserved, Cross-repo Readiness, Rollback Plan, Recommendations, References, Cycle Complete.

### Project rules (from `openspec/config.yaml`)

- `rules.specs`: RFC 2119 keywords (MUST, SHALL, SHOULD, MAY) — honored throughout the delta spec.
- `rules.archive`: warn before merging destructive deltas — applied; no destructive deltas (purely additive cycle, 0-byte schema diff).
- `rules.apply`: Strapi v5 patterns (Document Service API for `findOne`; `connect` syntax for relations) — followed; the new action is added to the existing `[ORD-26]` enable-or-create loop.

### Convention references (project-specific)

- **Engram #6baa483 commit message** — openspec untracked convention: planning artifacts (exploration, proposal, design, delta specs, verify-report, config.yaml) UNTRACKED; canonical specs and tasks COMMITTED. The F1 folder is untracked throughout; `archive-report.md` is added to the local folder per this archive phase and is itself **untracked** (consistent with the prior archive precedents).
- **Engram #1834** — cycle format notes: native dispatcher parses `### Requirement:` (3-hash) and `#### Scenario:` (4-hash) headings.

---

## SDD Cycle Complete

The change `F1-backend-permissions` has been fully planned (exploration #1819, proposal #1821, spec #1822, design #1828, tasks #1824), implemented via 2 work-unit commits (`5753eca` RED, `a3bc7a7` GREEN), verified against the user-patched spec (**PASS WITH WARNINGS — 2/2 R-COU + 5/5 S-COU + 4 command gates: 368/368 tests, tsc clean, build clean, lint 0 errors; 4 warnings V-W1..V-W4 preserved for soft-launch observation per Gap #3 archive convention Engram #1760/#1761**), and archived (this report). The new capability (`checkout-order-upsert` delta) lives in the F1 change folder as a delta spec; canonical promotion + change-folder move with date prefix are **out of scope for this archive phase** (per the project's `openspec/` untracked convention, the folder is left in place with `archive-report.md` added).

**PR #40 is OPEN** on `follow-ups/sprint-5-stripe-upsert/F1-backend-permissions` (https://github.com/AndresDev28/e-commerce-relojes-bv-beni-api/pull/40). The cycle is shipped pending merge; merge is delivery policy, not a verification gate. The cycle is **CLOSED**.

**Next cycle**: F2-F5 of the 5 follow-ups (Engram #1813–#1816). F1 is the smallest (1 PR, 2 commits, ~91 authored lines forecast / 218 actual) and validates the F1.5/`requestCancellation` parallel drift as a natural candidate for F2. Recommended F2 scope: apply the same fix pattern (bootstrap entry + helper cleanup + RED-first integration test) to `requestCancellation`. The same 4 warnings (V-W1..V-W4) would carry forward until a dedicated test-harness hygiene cycle is filed.
