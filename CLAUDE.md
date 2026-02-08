# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Strapi 5** headless CMS backend for an e-commerce watch store (Relojes BV Beni). It provides REST APIs for products, categories, orders, and user management. The frontend is a separate Next.js application hosted on Vercel.

## Common Commands

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm run start

# Strapi console (REPL with strapi object)
npm run console

# Upgrade Strapi version
npm run upgrade
npm run upgrade:dry  # dry-run first

# Testing (Vitest)
npm run test              # Build and run tests
npm run test:watch        # Build and run tests in watch mode
npm run test:ui           # Build and run tests with UI
npm run test:coverage     # Build and run tests with coverage
npm run test:only         # Run tests without build step
```

## Architecture

### Content Types (src/api/)

- **Product** (`api::product.product`): Watch products with name, price, stock, description (blocks), images (media), slug (UID), and category relation
- **Category** (`api::category.category`): Product categories with name, slug, image, and products relation
- **Order** (`api::order.order`): Customer orders with items (JSON), pricing, status enum (pending/paid/processing/shipped/delivered/cancelled/refunded), user relation, and payment tracking

### Extended User Model (src/extensions/users-permissions/)

The User content type is extended with:
- `favorites`: manyToMany relation to Products
- `orders`: oneToMany relation to Orders

### Key Custom Implementations

**Order Lifecycle Hooks** (`src/api/order/content-types/order/lifecycles.ts`):
- `beforeCreate`: Auto-assigns authenticated user to new orders using Strapi v5 connect syntax
- `beforeUpdate`: Stores previous orderStatus for change detection (ORD-22)
- `afterUpdate`: Triggers email notifications via webhook to frontend when order status changes
- Email notifications controlled by `DISABLE_EMAIL_NOTIFICATIONS` environment variable

**Order Controller** (`src/api/order/controllers/order.ts`):
- Security: Overrides `find()` to filter orders by authenticated user (prevents horizontal privilege escalation)
- Uses Document Service API for `findOne()` with user validation
- Implements strict access control with detailed logging

**Product Controller** (`src/api/product/controllers/product.ts`):
- Normalizes frontend queries (`images` → `image`)
- Default population of image and category relations

### Middleware

**HTTPS Enforcer** (`src/middlewares/https-enforcer.ts`):
- Blocks HTTP requests to sensitive routes in production (`/api/orders`, `/api/payments`, `/api/stripe`)
- Uses `X-Forwarded-Proto` header for Railway/Render proxy compatibility
- Configured in `config/middlewares.ts`

**Security Headers** (`config/middlewares.ts`):
- CORS configured for specific frontend domains
- CSP, HSTS, and frameguard headers enabled

### Database Configuration

- **Development**: PostgreSQL (Docker local) or SQLite
- **Production**: PostgreSQL with `DATABASE_URL` (Railway/Render)

### File Uploads

- **Development**: Local storage
- **Production**: Cloudinary (configured via `CLOUDINARY_NAME`, `CLOUDINARY_KEY`, `CLOUDINARY_SECRET`)

## Testing

Test framework: **Vitest** with SQLite in-memory database.

Test helpers (`tests/helpers/`):
- Strapi instance management with setup/cleanup
- Test user creation and authentication
- Content factories (Category, Product, Order)
- Permission setup for testing
- Database reset utilities

Run tests with `npm run test` or `npm run test:watch` for development.

## Environment Variables

Required for full functionality:
- `DATABASE_URL` (production) or `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD` (dev)
- `JWT_SECRET`, `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `CLOUDINARY_NAME`, `CLOUDINARY_KEY`, `CLOUDINARY_SECRET` (production)
- `FRONTEND_URL`, `WEBHOOK_SECRET` (for email notifications)
- `DISABLE_EMAIL_NOTIFICATIONS` (optional, set to `true` to disable email webhooks)

## Stripe Integration

**Key Validation** (`config/stripe-validation.ts`):
- Prevents test keys in production
- Prevents live keys in development
- Validates key consistency at startup

## Strapi v5 Patterns

When setting relations in lifecycle hooks, use the connect syntax:
```typescript
data.user = { connect: [userId] };
```

Content type API identifiers follow the pattern: `api::content-type.content-type`

For `findOne()` in controllers, use the Document Service API:
```typescript
const entity = await strapi.documents('api::order.order').findOne({
  documentId: id,
  populate: deepPopulate,
});
```
