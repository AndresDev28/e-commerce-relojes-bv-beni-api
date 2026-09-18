# Tasks: F1 — Backend Permission Bootstrap for `upsertByOrderId`

Strict TDD: every scenario is RED before production; tests/code/docs share a conventional commit. R-COU-1..10 / S-COU-1..10 from Gap #3 (Engram #1783) remain byte-identical and are out of scope for this cycle.

## Phase 1 — RED (single PR)

- [x] 1.1 RED test `test/api/order-upsert-permission.test.ts` covering R-COU-11/12 and S-COU-11..15 against a clean bootstrap; remove the artificial grant at `test/helpers/strapi-test-helpers.ts:124` in the same commit. `npm run test:only` MUST fail on the missing authenticated grant before any production change.

## Phase 2 — GREEN (single PR)

- [x] 2.1 Append `api::order.order.upsertByOrderId` to `orderPermissions` in `src/index.ts`; rerun `npm run test:only` to confirm the new test passes and the six existing UPSERT HTTP tests stay green.

## Phase 3 — Verification

- [x] 3.1 `npm run test:only` after `npm run build` — new test + 361-test baseline all green.
- [x] 3.2 `npx tsc --noEmit` — mandatory additional gate (Engram #1740: `test:only` skips `*.test.ts` typecheck).
- [x] 3.3 `npm run build` — production build succeeds; record final counts.
- [x] 3.4 `npm run lint` — no new warnings; confirm no-touch on `src/api/order/routes/01-custom.ts`, `src/api/order/controllers/order.ts`, `src/api/order/services/upsert.ts`, lifecycle, webhook.

## Acceptance Criteria

These are verification gates, not implementation tasks — already proven by verify-report.md (PASS WITH WARNINGS):

- Authenticated permission exists and is enabled after clean bootstrap (R-COU-11).
- Re-boot leaves exactly one enabled row (S-COU-12).
- Public/anonymous remain denied (R-COU-12, S-COU-13).
- Owner PUT is not middleware-403; reaches the service (S-COU-11).
- Anonymous PUT returns 403 with structured envelope (S-COU-13 patched wording).
- Invalid JWT returns 401 (S-COU-14).
- `setupTestPermissions` no longer grants `upsertByOrderId` (S-COU-15).
- Existing endpoint ownership/status behavior is unchanged.
- `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` all exit 0.

## Review Workload Forecast

| File | Planned authored lines |
|---|---:|
| `src/index.ts` | 1 (range 1–3) — append one entry to `orderPermissions` |
| `test/helpers/strapi-test-helpers.ts` | ~10 (range 5–15) — remove one grant, update comment |
| `test/api/order-upsert-permission.test.ts` | ~80 (range 60–100) — bootstrap invariant + middleware 401/403 + helper-does-not-grant |
| **Total** | **~91 (range 66–118)** |

| Work unit | Focused test | Runtime harness | Rollback boundary |
|---|---|---|---|
| Single PR: bootstrap entry + RED test + helper cleanup | `npm run test:only -- test/api/order-upsert-permission.test.ts` | SQLite Strapi + clean `bootstrap()` + authenticated PUT | Revert the PR; `orderPermissions` reverts to prior 4-entry list, helper re-grants, defect returns |

Recommend **1 PR** (Option A): ~91 authored lines vs 400-line budget → LOW overrun risk. No chained PRs; `ask-on-risk` strategy does not need to fire.

Decision needed before apply: No
Chained PRs recommended: No
400-line budget risk: Low

## Risks per task

- **1.1 — Medium:** removing the helper line may expose any test setup that relies on bypassing bootstrap. Treat any failure as evidence the suite was over-privileged, not as a reason to restore the grant. Confirm `setupStrapi()` runs `bootstrap()` before this RED commit.
- **2.1 — Low:** a wrong permission string or duplicate bootstrap row could leave clean installs blocked. The R-COU-11/12 invariant tests catch both (existence-with-`enabled:true` and one-row-after-re-boot).

## Dependency Graph

`1.1 RED (test + helper removal)` → `2.1 GREEN (bootstrap entry)` → `3.1–3.4 verification`. Do not add production code before the RED failure is observed and recorded.

## Test Plan

- **1.1 RED, before production change:**
  - One test boots a fresh Strapi instance, queries the `users-permissions_permission` table, asserts exactly one enabled row for `api::order.order.upsertByOrderId` on `authenticated`.
  - One test simulates a restart (re-invokes bootstrap) and asserts no duplicate row.
  - One test asserts the action is **not** granted to `public` or `anonymous`.
  - One integration test issues `PUT /api/orders/by-order-id/<orderId>` with a valid owner JWT and asserts the request is not middleware-403 (it reaches the controller; the service-level owner-success path applies).
  - One integration test issues the same PUT without an `Authorization` header and asserts HTTP 403 with the R-COU-8 envelope (`X-Trace-Id`).
  - One integration test issues the same PUT with a malformed JWT and asserts HTTP 401.
  - One test inspects `setupTestPermissions()` after the cleanup and asserts it does not include `api::order.order.upsertByOrderId`.
  - Existing `order-upsert-ownership.test.ts` and `order-security-authentication.test.ts` remain the regression net for service-level 403 and unchanged guards.

- **2.1 GREEN:** rerun the new test plus the full UPSERT, ownership, and security suites; confirm the 361-test baseline remains green without the helper grant.

## Verification Strategy

Required gates, all exit 0: `npm run test:only` (after `npm run build`), `npx tsc --noEmit`, `npm run build`, `npm run lint`. Run `npm run test` as the full build-plus-suite acceptance command.

## Commit Strategy

1. `test(order): expose bootstrap permission drift` — RED test in `test/api/order-upsert-permission.test.ts` and removal of the artificial grant in `test/helpers/strapi-test-helpers.ts`. Failing test is expected evidence. Commit only after `npm run test:only` shows the new test failing.
2. `fix(permissions): bootstrap order upsert action` — one production array entry in `src/index.ts`. All four gates green.

## PR Plan

**One PR** to `main`. No chained PRs.

**Title:** `fix(permissions): bootstrap order upsert action`

**Description:**
> F1 follow-up (post-soft-launch UX testing). Clean Strapi installs never grant `api::order.order.upsertByOrderId` to `authenticated`, so `PUT /api/orders/by-order-id/:orderId` returns HTTP 403 from the Users & Permissions middleware and blocks authenticated checkout. The UPSERT service-level guards are already correct; the defect is purely the missing grant in `orderPermissions`. F1 appends the action to the idempotent [ORD-26] bootstrap pattern (`src/index.ts:125-173`), removes the artificial grant that was masking the gap in tests (`strapi-test-helpers.ts:124`), and adds a RED-first integration test that proves the bootstrap invariant on a clean boot. R-COU-1..10 from Gap #3 (Engram #1783) are unchanged; R-COU-11/12 + S-COU-11..15 are the delta.

**Acceptance checklist** (proof in `verify-report.md`):
- Authenticated permission exists and is enabled after clean bootstrap (R-COU-11).
- Re-boot leaves exactly one enabled row (S-COU-12).
- Public/anonymous remain denied (R-COU-12, S-COU-13).
- Owner PUT is not middleware-403; reaches the service (S-COU-11).
- Anonymous PUT returns 403 with structured envelope (S-COU-13 patched wording).
- Invalid JWT returns 401 (S-COU-14).
- `setupTestPermissions` no longer grants `upsertByOrderId` (S-COU-15).
- Existing endpoint ownership/status behavior is unchanged.
- `npm run test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` all exit 0.
