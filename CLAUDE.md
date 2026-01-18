# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Strapi 5** headless CMS backend for an e-commerce watch store (Relojes BV Beni). It provides REST APIs for products, categories, orders, and user management. The frontend is a separate Next.js application hosted on Vercel.

## Common Commands

```bash
# Development (with auto-reload)
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Strapi console (REPL with strapi object)
npm run console

# Upgrade Strapi version
npm run upgrade
npm run upgrade:dry  # dry-run first
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
- `beforeCreate`: Auto-assigns authenticated user to new orders (solves Strapi v5 relation assignment issue)
- `beforeUpdate`: Stores previous orderStatus for change detection
- `afterUpdate`: Triggers email notifications via webhook to frontend when order status changes

**Order Controller** (`src/api/order/controllers/order.ts`):
- Security: Overrides find/findOne to ensure users can only access their own orders
- Prevents horizontal privilege escalation

**Product Controller** (`src/api/product/controllers/product.ts`):
- Normalizes frontend queries (`images` → `image`)
- Default population of image and category relations

### Middleware

**HTTPS Enforcer** (`src/middlewares/https-enforcer.ts`):
- Blocks HTTP requests to sensitive routes in production (`/api/orders`, `/api/payments`, `/api/stripe`)
- Configured in `config/middlewares.ts`

### Database Configuration

- **Development**: PostgreSQL (Docker local) or SQLite
- **Production**: PostgreSQL with `DATABASE_URL` (Railway/Render)

### File Uploads

- **Development**: Local storage
- **Production**: Cloudinary (configured via `CLOUDINARY_NAME`, `CLOUDINARY_KEY`, `CLOUDINARY_SECRET`)

## Environment Variables

Required for full functionality:
- `DATABASE_URL` (production) or `DATABASE_HOST`, `DATABASE_NAME`, `DATABASE_PASSWORD` (dev)
- `JWT_SECRET`, `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- `CLOUDINARY_NAME`, `CLOUDINARY_KEY`, `CLOUDINARY_SECRET` (production)
- `FRONTEND_URL`, `WEBHOOK_SECRET` (for email notifications)

## Strapi v5 Patterns

When setting relations in lifecycle hooks, use the connect syntax:
```typescript
data.user = { connect: [userId] };
```

Content type API identifiers follow the pattern: `api::content-type.content-type`
