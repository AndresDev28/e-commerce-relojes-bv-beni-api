# Design: F1 — Backend Permission Bootstrap for `upsertByOrderId`

## 1. Architecture Overview

**Current state (drift).** Gap #3 shipped `PUT /orders/by-order-id/:orderId` with correct service guards (`src/api/order/services/upsert.ts:178-323`), but production bootstrap never granted the action: `orderPermissions` at `src/index.ts:135-140` lists only `find`/`findOne`/`create`/`update`. On a clean install the Users & Permissions middleware rejects the authenticated owner PUT with HTTP 403. The suite never sees this because `setupTestPermissions` artificially grants the action at `test/helpers/strapi-test-helpers.ts:124`.

**Target state.** Append `api::order.order.upsertByOrderId` to the existing [ORD-26] idempotent block (`src/index.ts:121-173`: find role → find permission by `action + role` → enable or create), remove the artificial helper grant, and prove the invariant with a RED-first test. One production line changes; route, controller, service, and the frontend contract stay untouched. R-COU-1..10 / S-COU-1..10 remain byte-identical; this design implements R-COU-11/12 + S-COU-11..15.

## 2. Sequence Diagram

### SD-1 — Bootstrap grant at Strapi start (the only flow F1 touches)

```mermaid
sequenceDiagram
    participant ST as Strapi start
    participant BS as bootstrap() src/index.ts
    participant DB as users-permissions tables

    ST->>BS: bootstrap({ strapi })
    BS->>DB: findOne role type=authenticated
    alt role missing
        BS-->>ST: warn + early return (:130-133, A-4)
    else role found
        loop orderPermissions (5 entries after F1)
            BS->>DB: findOne permission by action+role
            alt exists and disabled
                BS->>DB: update enabled=true
            else missing
                BS->>DB: create {action, role, enabled:true}
            end
        end
        Note over BS,DB: new entry api::order.order.upsertByOrderId;<br/>re-boot → exists+enabled → no-op (S-COU-12)
    end
```

## 3. Architecture Decisions

### A-1 — Reuse the [ORD-26] block, no new bootstrap section
**Choice**: append `{ action: 'api::order.order.upsertByOrderId', enabled: true }` to `orderPermissions` (`src/index.ts:135-140`).
**Rationale**: the block already implements the idempotent enable-or-create loop R-COU-11 mandates; the shape is proven by [ORD-26]/[PRD-01]/[PRD-02]/[ORD-30]; minimal diff; zero-downtime (grant lands on next boot).
**Alternatives**: new `[F1]` try/catch block (~40 duplicated pattern lines ✗); manual UI grant per install (not reproducible — the exact defect F1 fixes ✗); DB migration for permission seeding (no repo precedent ✗).

### A-2 — Test helper loses the artificial grant
**Choice**: remove `'api::order.order.upsertByOrderId'` and its `[GAP-3]` comment (`test/helpers/strapi-test-helpers.ts:120-124`); replace with a comment naming production bootstrap as the sole grant path.
**Rationale**: the helper grant masks the drift — tests exercise a parallel permission setup instead of the shipped one (S-COU-15). Removing it in the RED commit is what makes the failure expose the real defect. `setupStrapi()` runs the production bootstrap via `strapi.load()`/`strapi.start()` (helper `:196-203`), so post-GREEN the existing UPSERT HTTP tests are granted by the same code path production uses.
**Trade-offs**: helper still grants `requestCancellation` (`:119`) — parallel drift deliberately left (A-5).
**Alternatives**: keep helper grant, add a DB assertion (drift stays masked ✗); delete `setupTestPermissions` entirely (breaks `requestCancellation`-dependent tests; out of scope ✗).

### A-3 — No `administrator` grant, no admin bypass
**Choice**: the action is NOT added to `adminOrderPermissions` ([ORD-30], `src/index.ts:285-292`); no admin bypass in the service.
**Rationale**: locked user decision; R-COU-12 restricts the grant to `authenticated`. The real barrier is the service guards (JWT identity `:178-189`, in-transaction ownership, `paymentIntentId` authority, status gate) — a role grant adds middleware surface, not capability.
**Alternatives**: grant `administrator` "for support flows" (never spec'd, widens surface ✗).

### A-4 — Early return at `src/index.ts:130-133` preserved verbatim
**Choice**: keep `return;` when the `authenticated` role is missing; no new defensive code.
**Rationale**: R-COU-11 explicitly preserves it. Documented consequence: that `return` exits the whole `bootstrap()`, also skipping PRD-01/PRD-02/ORD-30 — the known footgun flagged by the "Locked extension point #3" comment at `:25-28`. The users-permissions plugin seeds the role on every clean install, so the branch is fail-safe, not a live risk.
**Alternatives**: refactor to the PRD-01 else-branch style (changes behavior of three unrelated blocks; scope creep ✗); throw on missing role (breaks fail-safe boot ✗).

### A-5 — Scope limited to `upsertByOrderId`
**Choice**: do NOT touch the `requestCancellation` drift, even though it is the identical shape (helper `:119` grants it; production [ORD-26] does not).
**Rationale**: locked user decision to keep F1 small and predictable; `requestCancellation` has its own decision space (admin semantics, cancellation flow) and defers to a named follow-up.
**Alternatives**: bundle both fixes (re-opens locked scope, dilutes the single-purpose RED ✗).

### A-6 — Verification is build-gated (dist gotcha)
**Choice**: GREEN MUST run `npm run build` before `npm run test:only` (or use `npm run test`, which builds first).
**Rationale**: `setupStrapi()` loads the app from `distDir: './dist'` (helper `:196-198`) — tests execute the **compiled** `dist/index.js` bootstrap, not `src/index.ts`. Without a rebuild the new array entry is invisible and GREEN fails spuriously. Captured here so apply does not misdiagnose the failure as a broken fix.
**Alternatives**: point the test harness at `src` (no precedent, harness-wide change ✗).

### A-7 — Assert DB rows, not logs; re-invoke bootstrap for S-COU-12
**Choice**: permission-invariant tests query `plugin::users-permissions.permission` directly; the re-boot test re-invokes the app's exported `bootstrap()` against the loaded instance instead of restarting Strapi.
**Rationale**: the try/catch at `src/index.ts:171-173` swallows bootstrap failures into logs, and `setupStrapi()` silences `strapi.log.warn/info` (helper `:238-247`) — log assertions are unreliable or impossible. A second invocation of the same function deterministically proves enable-or-create idempotency (exactly one enabled row).
**Alternatives**: spy on logs (silenced by harness ✗); full second Strapi start (slow, teardown races ✗).

## 4. File-Level Diff Plan

| File | Change | Description | Lines |
|---|---|---|---|
| `src/index.ts` | modify | append `api::order.order.upsertByOrderId` entry to `orderPermissions` (`:135-140`) | +1 |
| `test/helpers/strapi-test-helpers.ts` | modify | remove grant + `[GAP-3]` comment (`:120-124`); replace with production-bootstrap pointer comment | −5 / +2 |
| `test/api/order-upsert-permission.test.ts` | create | RED tests: bootstrap invariant (S-COU-11), re-boot idempotency (S-COU-12), owner PUT not middleware-403 (S-COU-11), anonymous 403 + `X-Trace-Id` envelope (S-COU-13), invalid JWT 401 (S-COU-14), no public/anonymous grant (R-COU-12), helper-does-not-grant (S-COU-15) | +60–100 |

**No-touch boundaries**: `routes/01-custom.ts`, `controllers/order.ts`, `services/upsert.ts`, `lifecycles.ts`, `stripe-webhook.ts`, schemas, `types/generated`, frontend repo.
**Threat matrix**: N/A all rows — no shell/subprocess/VCS/PR/executable-classification/routing boundary; HTTP trust surface unchanged (route/controller/service untouched). Middleware 401/403 behavior is RED-tested via S-COU-13/14.

## 5. TDD Plan

1. **RED** — `test(order): expose bootstrap permission drift`: create `test/api/order-upsert-permission.test.ts` AND remove the helper grant in the same commit. `npm run test:only` MUST fail specifically on the missing `authenticated` grant (absent DB row + middleware-403 owner PUT). If it fails for any other reason (e.g., stale `dist`, A-6), fix the harness until the failure IS the permission gap; record the failing output as evidence before any production change.
2. **GREEN** — `fix(permissions): bootstrap order upsert action`: append the single array entry; `npm run build && npm run test:only`. New test passes; the six existing UPSERT HTTP tests stay green — proving production bootstrap, not the helper, is now the grant path.
3. **Gates** — `npm run test:only` (post-build), `npx tsc --noEmit` (mandatory — #1740: vitest skips `*.test.ts` typecheck), `npm run build`, `npm run lint`, all exit 0; 361-test baseline green.

## 6. Risks

| Risk | Sev | Mitigation |
|---|---|---|
| Helper removal breaks the six existing UPSERT HTTP tests if test Strapi skips production `bootstrap()` | MED | Verified: `setupStrapi()` runs `load()`/`start()` (helper `:196-203`), which executes `bootstrap()`; RED confirms empirically; treat any failure as evidence, never restore the grant |
| Stale `dist/` makes GREEN fail spuriously (tests load the compiled bootstrap) | MED | A-6: build before `test:only`; `npm run test` as full acceptance |
| Over-broad access if the action leaks to `public`/`anonymous` | LOW | R-COU-12 forbids it; RED test asserts non-grant on every role except `authenticated` |
| Silent bootstrap failure swallowed by try/catch (`:171-173`) | LOW | A-7: assert effective DB rows, not log lines |

**Rollback**: revert the PR; the next boot stops granting the action, restoring prior 403 behavior. Manually UI-enabled rows persist (the idempotent block never disables); operators toggle via UI if desired. No schema, data, or flag to unwind.

## 7. Open Questions

None — all WHAT-level decisions are locked in proposal/spec; A-1…A-7 are the HOW-level resolutions and conflict with none of them.

## 8. References

- Engram: #1821 (proposal), #1822 (delta spec), #1824 (tasks), #1819 (exploration), #1812 (F1 origin), #1783 (Gap #3 archive), #1742 (testing capabilities), #1740 (typecheck gate), #320 (Strapi v5 conventions).
- Sibling artifacts: `proposal.md`; `specs/checkout-order-upsert/spec.md` (R-COU-11/12, S-COU-11..15); `tasks.md`; cumulative `openspec/specs/checkout-order-upsert/spec.md`.
- Code anchors: `src/index.ts:121-173` ([ORD-26]), `:130-133` (early return), `:135-140` (target array), `:25-28` (extension-point comment), `:285-292` ([ORD-30] admin list), `src/api/order/services/upsert.ts:178-323` (guards), `test/helpers/strapi-test-helpers.ts:102-158` (helper), `:196-203` (load/start), `:238-247` (log silencing).
- Pattern precedent: `openspec/changes/sprint-5-stripe-upsert-backend/design.md` (Gap #3 endpoint design).
