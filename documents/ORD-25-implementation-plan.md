# ORD-25: Configure Admin Permissions in Strapi

**Status:** Planning
**Priority:** High
**Epic:** EPIC-15 (Order Management System)
**Depends on:** ORD-18, ORD-19, ORD-20, ORD-21, ORD-22
**Date:** 2026-01-12

---

## Overview

Configure comprehensive permissions in Strapi to enable:
1. **Admin users** to manage orders through the Strapi admin panel
2. **Authenticated customers** to create and view their orders via the API
3. **Public users** to have no access to order data (security)

This is a critical task because currently **no permissions are configured** for the Order content type, making it inaccessible to both admins and customers.

---

## Current State Analysis

### Database Investigation Results

**Query executed:**
```bash
sqlite3 .tmp/data.db "SELECT p.action, r.name as role_name
FROM up_permissions p
JOIN up_permissions_role_lnk pr ON p.id = pr.permission_id
JOIN up_roles r ON pr.role_id = r.id
ORDER BY r.name, p.action;"
```

**Current API Permissions (users-permissions plugin):**

| Role | Permissions |
|------|-------------|
| **Public** | • `plugin::users-permissions.auth.*` (login, register, etc.)<br>• `api::category.category.find`<br>• `api::category.category.findOne`<br>• `api::product.product.find`<br>• `api::product.product.findOne` |
| **Authenticated** | • `plugin::users-permissions.auth.changePassword`<br>• `plugin::users-permissions.user.me`<br>• ❌ **NO ORDER PERMISSIONS** |

**Current Admin Permissions (admin panel):**

| Role | Subject | Permissions |
|------|---------|-------------|
| **Super Admin** | All | Full access |
| **Editor** | Category, Product | create, read, update, delete, publish |
| **Editor** | Upload | All upload operations |
| **Author** | Category, Product | create, read, update, delete, publish (own) |
| **All Roles** | Order | ❌ **NO ORDER PERMISSIONS** |

### Critical Findings

1. ✅ Order content type exists (`src/api/order/content-types/order/schema.json`)
2. ✅ Lifecycles are configured (auto-assign user, email notifications)
3. ❌ **ZERO admin permissions** configured for Order
4. ❌ **ZERO API permissions** configured for Order (Authenticated role)
5. ❌ Orders are **completely inaccessible** in admin panel
6. ❌ Customers **cannot create or view** their orders via API

---

## Strapi Permissions Architecture

Strapi has **two separate permission systems**:

### 1. Admin Permissions (RBAC - Role-Based Access Control)
- **Purpose:** Control access to Strapi admin panel
- **Roles:** Super Admin, Editor, Author
- **Storage:** `admin_permissions` table + `admin_permissions_role_lnk`
- **Configuration:** Via Strapi Admin UI → Settings → Roles

**Permission format:** `plugin::content-manager.explorer.{action}`
- Actions: `create`, `read`, `update`, `delete`, `publish`
- Subject: `api::order.order`

### 2. API Permissions (users-permissions plugin)
- **Purpose:** Control API access for frontend users
- **Roles:** Public, Authenticated
- **Storage:** `up_permissions` table + `up_permissions_role_lnk`
- **Configuration:** Via Strapi Admin UI → Settings → Users & Permissions Plugin → Roles

**Permission format:** `api::{content-type}.{action}`
- Actions: `find`, `findOne`, `create`, `update`, `delete`
- Example: `api::order.order.find`

---

## Implementation Plan

### Phase 1: Configure Admin Permissions

**Goal:** Enable admin users to manage orders in Strapi admin panel

**Steps:**

1. **Access Strapi Admin Panel**
   ```bash
   # Start backend server
   cd /Users/andresperezandreiev/repos/personal-projects/relojes-bv-beni-api
   npm run develop
   ```
   - Open: http://localhost:1337/admin
   - Login with Super Admin account

2. **Navigate to Admin Roles**
   - Settings → Administration Panel → Roles
   - Configure permissions for each role

3. **Super Admin Role (strapi-super-admin)**
   - ✅ Already has full access (no action needed)
   - Verify can see Orders in Content Manager

4. **Editor Role (strapi-editor)**

   Enable the following permissions for `api::order.order`:

   | Permission | Enabled | Notes |
   |------------|---------|-------|
   | `plugin::content-manager.explorer.create` | ✅ | Create new orders (rare, but useful for manual entry) |
   | `plugin::content-manager.explorer.read` | ✅ | **CRITICAL:** View all orders |
   | `plugin::content-manager.explorer.update` | ✅ | **CRITICAL:** Change orderStatus |
   | `plugin::content-manager.explorer.delete` | ⚠️ | Optional (normally we don't delete orders) |
   | `plugin::content-manager.explorer.publish` | ✅ | Publish orders (if draft/publish enabled) |

5. **Author Role (strapi-author)**

   Enable read-only access:

   | Permission | Enabled | Notes |
   |------------|---------|-------|
   | `plugin::content-manager.explorer.read` | ✅ | View orders (read-only) |
   | All others | ❌ | Authors cannot modify orders |

**Expected Outcome:**
- ✅ Admins can see "Order" in Content Manager sidebar
- ✅ Admins can view list of all orders
- ✅ Admins can open order details
- ✅ Admins can change `orderStatus` field
- ✅ Changing status triggers email notifications (ORD-22)

---

### Phase 2: Configure API Permissions (Authenticated Role)

**Goal:** Enable customers to create and view their own orders via API

**Steps:**

1. **Navigate to Users & Permissions Plugin**
   - Settings → Users & Permissions Plugin → Roles
   - Click on "Authenticated" role

2. **Enable Order Permissions**

   Under "Permissions" → "Order" section:

   | Permission | Enabled | Notes |
   |------------|---------|-------|
   | `find` | ✅ | **CRITICAL:** List user's own orders |
   | `findOne` | ✅ | **CRITICAL:** View specific order details |
   | `create` | ✅ | **CRITICAL:** Create new order during checkout |
   | `update` | ❌ | Users cannot modify orders after creation |
   | `delete` | ❌ | Users cannot delete orders |

3. **Important Security Notes**

   Strapi **automatically filters** orders by authenticated user:
   - When user calls `GET /api/orders` with JWT token
   - Strapi only returns orders where `user.id = authenticatedUserId`
   - This is handled by the lifecycle hook in `lifecycles.ts:10-27`

   ```typescript
   // Frontend ownership validation layer (additional security)
   // src/app/api/orders/[orderId]/route.ts
   if (!userOrderIds.includes(requestedOrderId)) {
     return NextResponse.json({ error: 'Order not found' }, { status: 404 })
   }
   ```

**Expected Outcome:**
- ✅ Customers can create orders: `POST /api/orders`
- ✅ Customers can list their orders: `GET /api/orders`
- ✅ Customers can view order details: `GET /api/orders/:id`
- ❌ Customers **cannot** see other users' orders (enforced by Strapi + frontend)

---

### Phase 3: Verify Public Role (Security Check)

**Goal:** Ensure public users have ZERO access to orders

**Steps:**

1. **Navigate to Public Role**
   - Settings → Users & Permissions Plugin → Roles → Public

2. **Verify ALL Order Permissions are DISABLED**

   | Permission | Status | Critical |
   |------------|--------|----------|
   | `find` | ❌ DISABLED | 🔒 Security |
   | `findOne` | ❌ DISABLED | 🔒 Security |
   | `create` | ❌ DISABLED | 🔒 Security |
   | `update` | ❌ DISABLED | 🔒 Security |
   | `delete` | ❌ DISABLED | 🔒 Security |

**Expected Outcome:**
- ❌ Unauthenticated requests to `/api/orders` return 401 Unauthorized
- ❌ Public users cannot access any order data

---

## Testing Strategy

### Test 1: Admin Panel Access

**Prerequisites:**
- Strapi backend running: `npm run develop`
- Admin permissions configured

**Test Steps:**

1. Login to Strapi admin panel (http://localhost:1337/admin)
2. Navigate to Content Manager → Orders
3. Verify can see list of orders
4. Click on an order to view details
5. Verify all fields are visible:
   - `orderId`
   - `items` (JSON)
   - `subtotal`, `shipping`, `total`
   - `orderStatus` (enum dropdown)
   - `user` (relation to user)
   - `paymentIntentId`
   - `paymentInfo` (JSON)
   - `shippedAt`, `deliveredAt`
6. Change `orderStatus` to "shipped"
7. Verify email notification is sent (check logs)
8. Save changes

**Expected Results:**
- ✅ All steps complete without errors
- ✅ Email sent confirmation in logs: `[ORD-22] ✅ Email sent successfully for order X`

---

### Test 2: API Permissions (Authenticated)

**Prerequisites:**
- Frontend running: `npm run dev`
- Backend running: `npm run develop`
- API permissions configured for Authenticated role
- Test user account exists

**Test Steps:**

#### A. Create Order (Checkout Flow)

1. Login to frontend as test user
2. Add products to cart
3. Complete checkout process
4. Verify order is created: `POST /api/orders`
5. Check response includes:
   - `orderId`
   - `orderStatus: "pending"`
   - `user` relation (auto-assigned by lifecycle)

#### B. List User Orders

1. Navigate to "Mi Cuenta" → "Mis Pedidos"
2. Verify API call: `GET /api/orders`
3. Verify response includes only user's orders
4. Check order list displays correctly

#### C. View Order Details

1. Click on an order
2. Verify API call: `GET /api/orders/:orderId`
3. Verify order details page loads
4. Check all order information displays

#### D. Ownership Validation (Security Test)

1. Get `orderId` from another user's order (from admin panel)
2. Try to access: `GET /api/orders/OTHER_USER_ORDER_ID`
3. **Expected:** 404 Not Found (ownership validation)
4. **Must NOT:** Return order data or 403 Forbidden (information disclosure)

**Expected Results:**
- ✅ All authenticated requests succeed
- ✅ Ownership validation prevents cross-user access
- ✅ Orders display correctly in frontend

---

### Test 3: Public Access (Security Test)

**Prerequisites:**
- Backend running
- Public role has NO order permissions

**Test Steps:**

1. **Logout from frontend** (clear JWT token)
2. Attempt direct API calls without authentication:
   ```bash
   # Should return 401 Unauthorized
   curl http://localhost:1337/api/orders

   # Should return 401 Unauthorized
   curl http://localhost:1337/api/orders/1
   ```

**Expected Results:**
- ❌ `401 Unauthorized` response
- ❌ No order data returned
- ✅ Security working correctly

---

## Success Criteria

### Admin Panel
- [ ] Super Admin can view all orders
- [ ] Super Admin can change orderStatus
- [ ] Editor role can view and update orders
- [ ] Author role can view orders (read-only)
- [ ] Changing orderStatus triggers email notification

### API Access (Authenticated)
- [ ] Users can create orders during checkout
- [ ] Users can view list of their own orders
- [ ] Users can view individual order details
- [ ] Users **cannot** access other users' orders

### Security
- [ ] Public users have ZERO access to orders
- [ ] Unauthenticated API calls return 401
- [ ] Ownership validation prevents horizontal privilege escalation
- [ ] No information disclosure via error messages

### Documentation
- [ ] Permission configuration documented in CHALLENGES.md
- [ ] Test results documented
- [ ] Security considerations documented

---

## Configuration Reference

### Permission Locations

**Admin Permissions:**
- UI: http://localhost:1337/admin/settings/roles
- Database: `admin_permissions` + `admin_permissions_role_lnk` tables
- Cannot be configured via code in Strapi 5

**API Permissions:**
- UI: http://localhost:1337/admin/settings/users-permissions/roles
- Database: `up_permissions` + `up_permissions_role_lnk` tables
- Cannot be configured via code in Strapi 5

### Important Files

| File | Purpose |
|------|---------|
| `src/api/order/content-types/order/schema.json` | Order model definition |
| `src/api/order/content-types/order/lifecycles.ts` | Auto-assign user, email notifications |
| `src/api/order/controllers/order.ts` | Standard CRUD controller |
| `src/api/order/routes/order.ts` | API routes |
| `.tmp/data.db` | SQLite database (permissions stored here) |

---

## Risk Mitigation

### Risk 1: Data Loss
- **Risk:** Accidentally enabling delete permissions
- **Mitigation:** Keep `delete` permission disabled for both admin and API
- **Reasoning:** Orders are financial records, should never be deleted

### Risk 2: Information Disclosure
- **Risk:** Users accessing other users' orders
- **Mitigation:** Multi-layer security (Strapi + frontend validation)
- **Testing:** Test 2D validates ownership enforcement

### Risk 3: Public Access
- **Risk:** Unauthenticated users accessing order data
- **Mitigation:** Zero permissions for Public role
- **Testing:** Test 3 validates public access blocked

---

## Notes

### Strapi v5 Constraints

1. **Cannot set permissions via code**
   - Must use admin UI to configure
   - Permissions stored in database
   - Cannot version control permission config

2. **Cannot populate user relation in API requests**
   - Requires lifecycle hook to assign user
   - Already implemented in `lifecycles.ts:10-27`

3. **Draft & Publish is enabled**
   - Orders are created as "draft" by default
   - Need to publish orders after creation
   - Consider disabling draft/publish for orders

### Future Enhancements (Out of Scope)

- [ ] Custom admin panel dashboard for order statistics
- [ ] Advanced role: "Fulfillment Manager" (editor focused on orders only)
- [ ] Audit logging for admin order changes
- [ ] Order export functionality (CSV, Excel)
- [ ] Bulk order status updates
- [ ] Order filtering and search in admin panel

---

## Implementation Checklist

### Pre-Implementation
- [x] Verify Order content type exists
- [x] Verify current permissions state (none configured)
- [x] Document current state

### Implementation
- [ ] Start Strapi backend in develop mode
- [ ] Configure Admin permissions (Super Admin, Editor, Author)
- [ ] Configure API permissions (Authenticated role)
- [ ] Verify Public role has no permissions
- [ ] Save all changes

### Testing
- [ ] Test admin panel access
- [ ] Test order creation via API
- [ ] Test order listing via API
- [ ] Test order details via API
- [ ] Test ownership validation
- [ ] Test public access blocked
- [ ] Test email notifications still work

### Documentation
- [ ] Update CHALLENGES.md with permission configuration
- [ ] Document test results
- [ ] Create screenshots of admin UI (optional)

---

## Related Tasks

- **ORD-22:** Email notifications (depends on admin ability to change status)
- **ORD-26:** Automated testing (will test permission boundaries)
- **Future:** Custom admin dashboard

---

**Ready to implement:** ✅
**Estimated time:** 30-45 minutes
**Risk level:** Low (UI configuration, easily reversible)
