# Technical Debt

This document tracks areas of the codebase that require improvement, particularly around test coverage and code quality.

Last updated: 2026-02-26

## Test Coverage Gaps

### Overall Coverage: 69.81%

| Area | Statements | Branches | Functions | Lines | Priority |
|------|------------|----------|-----------|-------|----------|
| All files | 69.81% | 53.76% | 75.86% | 69.81% | - |

---

## High Priority

### 1. Product Controller (`src/api/product/controllers/product.js`)

**Coverage:** 20% statements, 0% branches, 33.33% functions

**Uncovered Lines:** 10-47

**Impact:** Product API endpoints are critical for the storefront. Lack of tests risks regressions in:
- Product listing
- Product detail retrieval
- Image population logic
- Category filtering

**Recommended Actions:**
- [ ] Create `test/api/product.test.ts`
- [ ] Add tests for `find()` with pagination
- [ ] Add tests for `findOne()` with slug
- [ ] Add tests for image population normalization
- [ ] Add tests for category filtering

**Estimated Effort:** 4-6 hours

---

### 2. Order Controller HTTP Endpoints (`src/api/order/controllers/order.js`)

**Coverage:** 53.84% statements, 59.61% branches, 62.5% functions

**Uncovered Lines:** 113-114, 153-206

**Impact:** Direct HTTP endpoint testing is missing. Current tests use `entityService` directly, bypassing:
- Authentication middleware
- Request validation
- Response formatting
- Error handling paths

**Recommended Actions:**
- [ ] Add HTTP integration tests using `ctx` mock
- [ ] Test `find()` with authenticated vs unauthenticated users
- [ ] Test `findOne()` access control (ORD-25)
- [ ] Test `update()` with `statusChangeNote` validation (ORD-34)
- [ ] Test `search()` endpoint (AND-62)

**Estimated Effort:** 6-8 hours

---

## Medium Priority

### 3. HTTPS Enforcer Middleware (`src/middlewares/https-enforcer.js`)

**Coverage:** 53.84% statements, 41.66% branches, 66.66% functions

**Uncovered Lines:** 31-34, 42-52

**Impact:** Production security middleware is partially tested. Missing tests for:
- Production environment behavior
- Proxy header handling (`X-Forwarded-Proto`)
- Sensitive route blocking

**Recommended Actions:**
- [ ] Create `test/middlewares/https-enforcer.test.ts`
- [ ] Test with `NODE_ENV=production`
- [ ] Test proxy header scenarios (Railway/Render)
- [ ] Test sensitive route blocking (`/api/orders`, `/api/payments`)

**Estimated Effort:** 2-3 hours

---

### 4. Order Transition Validation (`src/api/order/helpers/validate-order-transition.js`)

**Coverage:** 77.27% statements, 60% branches, 40% functions

**Uncovered Lines:** 50, 57, 96, 112, 128

**Impact:** Some edge cases in status transitions are not tested:
- Invalid transition error messages
- Refund scenarios
- Terminal state handling (delivered, cancelled, refunded)

**Recommended Actions:**
- [ ] Add tests for all invalid transition error messages
- [ ] Add tests for terminal state immutability
- [ ] Add tests for refund transitions
- [ ] Add tests for concurrent status changes

**Estimated Effort:** 2-3 hours

---

### 5. Order Lifecycles (`src/api/order/content-types/order/lifecycles.ts`)

**Coverage:** 89.87% statements, 81.08% branches, 100% functions

**Uncovered Lines:** 164, 189-190, 208

**Impact:** Minor gaps in webhook error handling paths:
- Missing `FRONTEND_URL` or `WEBHOOK_SECRET` scenarios
- User without email scenario
- Webhook failure logging

**Recommended Actions:**
- [ ] Test webhook with missing environment variables
- [ ] Test order with user that has no email
- [ ] Verify error logging doesn't throw

**Estimated Effort:** 1-2 hours

---

## Low Priority

### 6. Database Configuration (`config/database.js`)

**Coverage:** 45.45% statements, 12.5% branches, 100% functions

**Uncovered Lines:** 22-64

**Impact:** Production database connection scenarios are untested. This is configuration code and typically tested via integration tests.

**Recommended Actions:**
- [ ] Consider if unit tests are needed
- [ ] Document connection string parsing logic
- [ ] Add validation for required environment variables

**Estimated Effort:** 1 hour (if needed)

---

### 7. Stripe Validation (`config/stripe-validation.js`)

**Coverage:** 58.06% statements, 37.5% branches, 100% functions

**Uncovered Lines:** 16, 25-29, 33-41, 43

**Impact:** Key validation edge cases are untested:
- Test keys in production (should fail)
- Live keys in development (should fail)
- Missing key scenarios

**Recommended Actions:**
- [ ] Create `test/config/stripe-validation.test.ts`
- [ ] Test key mismatch scenarios
- [ ] Test startup validation behavior

**Estimated Effort:** 1-2 hours

---

## Post-MVP Improvements

### 8. Email Webhook Rollback (ORD-36)

**Status:** Not implemented

**Description:** If the email webhook fails, the order status has already changed. This creates an inconsistency where the customer doesn't receive notification of their order status change.

**Current Behavior:**
- Order status changes in database
- Webhook called to frontend
- If webhook fails, status remains changed but no email sent
- Status history records the change regardless

**Impact:** 
- Customer may not be notified of status changes
- Admin sees log of failed webhook but must manually resend
- No automatic recovery mechanism

**Recommended Actions:**
- [ ] Implement webhook retry with exponential backoff (3 retries)
- [ ] Store webhook status in order (pending/sent/failed)
- [ ] Add admin UI to manually resend failed notifications
- [ ] Consider implementing saga pattern for eventual consistency

**Estimated Effort:** 4-6 hours

---

### 9. Persistir cancellationReason y cancellationDate (EPIC-16)

**Status:** Deferred to Post-MVP

**Description:** Los campos `cancellationReason` y `cancellationDate` del modelo Order no se persisten cuando el cliente solicita una cancelación. Strapi v5 aplica sanitización profunda en el controller genérico `update`, eliminando estos campos del payload.

**Current Workaround:**
- El motivo se guarda en `statusChangeNote` (visible en admin)
- La fecha queda en `order_status_history` (timestamp del cambio a `cancellation_requested`)
- El flujo completo funciona correctamente

**Root Cause:**
- Frontend proxy (`src/app/api/orders/[orderId]/request-cancellation/route.ts`) usa `PUT /api/orders/:id` genérico
- Strapi v5 sanitiza el input y elimina `cancellationReason`/`cancellationDate`
- El controller custom `requestCancellation` del backend nunca se invoca

**Recommended Actions:**
- [ ] Refactorizar el proxy frontend para llamar al endpoint custom `POST /api/orders/:id/request-cancellation`
- [ ] O registrar un Document Service middleware que permita los campos sin sanitización
- [ ] Verificar E2E que ambos campos se persistan

**Estimated Effort:** 2-3 hours

---

## Test Infrastructure Improvements

### Test Helper Coverage

**File:** `test/helpers/strapi-test-helpers.ts`

**Coverage:** 69.37% statements, 40.74% branches, 81.48% functions

**Recommended Actions:**
- [ ] Refactor helpers to be more testable
- [ ] Add unit tests for helper functions
- [ ] Consider extracting test utilities to separate package

---

## Coverage Targets

| Milestone | Target Date | Global Coverage | Focus Areas |
|-----------|-------------|-----------------|-------------|
| Current | - | 69.81% | - |
| Short-term | 2026-Q2 | 75% | Product controller, Order HTTP tests |
| Mid-term | 2026-Q3 | 80% | Middleware, Stripe validation |
| Long-term | 2026-Q4 | 85%+ | Edge cases, error paths |

---

## How to Improve Coverage

1. **Run coverage report:**
   ```bash
   npm run test:coverage
   ```

2. **View detailed HTML report:**
   ```bash
   npm run test:coverage -- --reporter=html
   open coverage/index.html
   ```

3. **Run specific test file:**
   ```bash
   npm run test:only -- test/api/order.test.ts
   ```

4. **Run tests in watch mode:**
   ```bash
   npm run test:watch
   ```

---

## Related Issues

| Issue ID | Description | Status |
|----------|-------------|--------|
| ORD-31 | Order search filters tests | Partial (sanity check only) |
| ORD-32 | Status transition validation | Complete |
| ORD-33 | Order status history | Complete |
| ORD-34 | Status change notes | Complete |
| ORD-35 | Email on status change | Complete (via ORD-22 webhook) |
| ORD-36 | Rollback on email failure | Pending (Post-MVP) |
| ORD-37 | Tests: Transition validation | Complete |
| ORD-38 | Tests: Status history | Complete |
| ORD-39 | Tests: No backward transitions | Complete |
| AND-100 | Persistir cancellationReason/cancellationDate | Deferred (Post-MVP) |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-02-19 | Initial document creation after ORD-34 implementation | - |
| 2026-02-19 | Added ORD-36 (email rollback) as Post-MVP improvement | - |
| 2026-02-19 | Updated related issues table with ORD-35 to ORD-39 status | - |
| 2026-02-26 | Added AND-100: cancellationReason/Date persistence as Post-MVP debt | - |