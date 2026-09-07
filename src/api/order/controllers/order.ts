/**
 * order controller
 *
 * [ORD-25] Security: Automatic user filtering
 * ============================================
 * Ensures authenticated users can ONLY access their own orders.
 *
 * CRITICAL SECURITY IMPLEMENTATION:
 * - find(): Filters orders by authenticated user (bypassed for administrator)
 * - findOne(): Validates ownership before returning (bypassed for administrator)
 * - create(): User auto-assigned via lifecycle hook
 *
 * [ORD-30] Administrator Access
 * ============================================
 * Users with role type 'administrator' can access ALL orders without filtering.
 *
 * This prevents horizontal privilege escalation where User A
 * could access User B's orders.
 */

import { factories } from '@strapi/strapi'
import Stripe from 'stripe'
import {
    UpsertBadRequestError,
    UpsertForbiddenError,
    UpsertConflictError,
    UpsertUniqueExhaustedError,
} from '../services/upsert'

/**
 * Helper function to get user role type
 * Returns the role type string (e.g., 'administrator', 'authenticated', 'public')
 */
async function getUserRole(userId: number | string, strapi: any): Promise<string | null> {
  try {
    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { id: userId },
      populate: ['role']
    })

    return user?.role?.type || null
  } catch (error) {
    strapi.log.error('[ORD-30] Error getting user role:', error)
    return null
  }
}

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  /**
   * GET /api/orders
   *
   * Returns orders based on user role:
   * - Administrator: Returns ALL orders from all users
   * - Authenticated user: Returns only orders belonging to the authenticated user
   *
   * [ORD-30] Bypass user filtering for administrator role
   */
  async find(ctx) {
    const userId = ctx.state.user?.id

    if (!userId) {
      return ctx.unauthorized('You must be logged in to view orders')
    }

    const userRole = await getUserRole(userId, strapi)
    const isAdministrator = userRole === 'administrator'

    let orders: any[]

    if (isAdministrator) {
      orders = await strapi.entityService.findMany('api::order.order', {
        populate: ctx.query?.populate || ['user'],
        sort: ctx.query?.sort || { createdAt: 'desc' },
        pagination: ctx.query?.pagination || {},
      })
      strapi.log.info(`[ORD-30] Administrator ${userId} listed all orders (${orders.length} found)`)
    } else {
      orders = await strapi.entityService.findMany('api::order.order', {
        filters: {
          user: {
            id: userId,
          },
        },
        populate: ctx.query?.populate || 'user',
        sort: ctx.query?.sort || { createdAt: 'desc' },
        pagination: ctx.query?.pagination || {},
      })
      strapi.log.info(`[ORD-25] User ${userId} listed their orders (${orders.length} found)`)
    }

    return {
      data: orders.map(order => ({
        id: order.documentId,
        attributes: order
      })),
      meta: {}
    }
  },

  /**
   * GET /api/orders/:id
   *
   * Returns order details based on user role:
   * - Administrator: Returns any order regardless of ownership
   * - Authenticated user: Returns order ONLY if it belongs to the authenticated user
   *
   * [ORD-30] Bypass ownership validation for administrator role
   */
  async findOne(ctx) {
    const userId = ctx.state.user?.id

    if (!userId) {
      return ctx.unauthorized('You must be logged in to view order details')
    }

    const { id } = ctx.params

    let order: any
    try {
      order = await strapi.documents('api::order.order').findOne({
        documentId: id,
        populate: ['user'],
      })
    } catch (error) {
      strapi.log.warn(`[ORD-25] Error finding order ${id}:`, error)
      return ctx.notFound('Order not found')
    }

    if (!order) {
      strapi.log.warn(`[ORD-25] User ${userId} attempted to access non-existent order: ${id}`)
      return ctx.notFound('Order not found')
    }

    const userRole = await getUserRole(userId, strapi)
    const isAdministrator = userRole === 'administrator'

    if (isAdministrator) {
      strapi.log.info(`[ORD-30] Administrator ${userId} accessed order ${id} (owner: ${order.user?.id})`)
    } else {
      if (order.user?.id !== userId) {
        strapi.log.warn(`[ORD-25] User ${userId} attempted to access unauthorized order: ${id} (belongs to user ${order.user?.id})`)
        return ctx.notFound('Order not found')
      }
      strapi.log.info(`[ORD-25] User ${userId} accessed order: ${id}`)
    }

    return {
      data: {
        id: order.documentId,
        attributes: order
      },
      meta: {}
    }
  },

  /**
   * GET /api/orders/search
   *
   * [AND-62] Search orders by email and/or orderId.
   * This endpoint is designed for the admin panel and does NOT filter by authenticated user.
   *
   * Query params:
   * - email: Search by customer email (case-insensitive partial match)
   * - orderId: Search by order number (partial match)
   *
   * Both params can be combined to narrow results.
   */
  async search(ctx) {
    const { email, orderId } = ctx.request.query
    const filters: any = {}

    // If email is provided, first find matching users
    if (typeof email === 'string' && email) {
      const users = await strapi.entityService.findMany(
        'plugin::users-permissions.user',
        {
          filters: { email: { $containsi: email } },
          fields: ['id', 'email', 'username'],
        }
      )

      const userIds = users.map((u: any) => u.id)

      if (userIds.length > 0) {
        filters.user = { $in: userIds }
      } else {
        // No users found, return empty result
        return { data: [], meta: { pagination: { total: 0 } } }
      }
    }

    // If orderId is provided, add to filters
    if (typeof orderId === 'string' && orderId) {
      filters.orderId = { $contains: orderId }
    }

    const entity = await strapi.entityService.findMany('api::order.order', {
      filters,
      populate: { user: true },
      sort: { createdAt: 'desc' },
    })

    return {
      data: entity,
      meta: { pagination: { total: entity.length } }
    }
  },

  /**
   * PUT /api/orders/:id
   *
   * [ORD-34] Validates statusChangeNote field before updating.
   * [SEC-01] Validates user ownership and allowed fields for updates.
   */
  async update(ctx) {
    const { id } = ctx.params
    const userId = ctx.state.user?.id

    if (!userId) {
      return ctx.unauthorized('You must be logged in to update an order')
    }

    let order: any
    try {
      order = await strapi.documents('api::order.order').findOne({
        documentId: id,
        populate: ['user'],
      })
    } catch (error) {
      strapi.log.warn(`[SEC-01] Error finding order ${id} for update:`, error)
      return ctx.notFound('Order not found')
    }

    if (!order) {
      return ctx.notFound('Order not found')
    }

    const userRole = await getUserRole(userId, strapi)
    const isAdministrator = userRole === 'administrator'

    if (!isAdministrator) {
      if (order.user?.documentId !== ctx.state.user.documentId && order.user?.id !== userId) {
        strapi.log.warn(`[SEC-01] User ${userId} attempted to modify unauthorized order: ${id}`)
        return ctx.forbidden('You can only update your own orders')
      }

      const updateData = ctx.request.body?.data || {}
      const allowedFields = ['orderStatus', 'statusChangeNote', 'cancellationReason', 'cancellationDate']
      const providedFields = Object.keys(updateData)

      const isUpdatingRestrictedFields = providedFields.some(field => !allowedFields.includes(field))

      if (isUpdatingRestrictedFields) {
        return ctx.badRequest('You are only allowed to update orderStatus and statusChangeNote')
      }

      if (updateData.orderStatus && updateData.orderStatus !== 'cancellation_requested') {
        return ctx.badRequest('You can only request order cancellation')
      }
    }

    const statusChangeNote = ctx.request.body?.data?.statusChangeNote

    if (statusChangeNote !== undefined && statusChangeNote !== null) {
      if (typeof statusChangeNote !== 'string') {
        strapi.log.warn(`[ORD-34] Invalid statusChangeNote type for order ${id}: expected string, got ${typeof statusChangeNote}`)
        return ctx.badRequest('statusChangeNote must be a string')
      }

      if (statusChangeNote.length > 5000) {
        strapi.log.warn(`[ORD-34] statusChangeNote exceeds max length for order ${id}: ${statusChangeNote.length} characters`)
        return ctx.badRequest('statusChangeNote must not exceed 5000 characters')
      }

      strapi.log.info(`[ORD-34] statusChangeNote validated for order ${id} (${statusChangeNote.length} characters)`)
    }

    return super.update(ctx)
  },

  /**
   * POST /api/orders/:id/request-cancellation
   *
   * [ARCH-02] Delegated to request-cancellation service
   * [REF-03] Handles customer requests to cancel an order
   * [REF-04] Validates that only the order owner can request cancellation
   * [REF-05] Validates that order is in a valid state for cancellation
   */
  async requestCancellation(ctx) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;
    const reason = ctx.request.body?.reason;

    if (!userId) {
      return ctx.unauthorized('You must be logged in to request an order cancellation');
    }

    const userRole = await getUserRole(userId, strapi);

    try {
      const updatedOrder = await strapi.service('api::order.request-cancellation').requestCancellation(
        id,
        userId,
        reason,
        userRole
      );

      return {
        data: {
          id: updatedOrder.documentId,
          attributes: updatedOrder
        },
        meta: {}
      };
    } catch (error: any) {
      if (error.message === 'Order not found') {
        return ctx.notFound(error.message);
      }
      if (error.message === 'You can only cancel your own orders') {
        return ctx.forbidden(error.message);
      }
      if (error.message.includes('Invalid status') || error.message.includes('A cancellation reason must be provided') || error.message.includes('Order cannot be cancelled in status')) {
        return ctx.badRequest(error.message);
      }
      return ctx.internalServerError('An error occurred while processing the cancellation request');
    }
  },

  /**
   * POST /api/orders/stripe-webhook
   *
   * [ARCH-02] Delegated to stripe-webhook service
   * [REF-10] Handles Stripe's charge.refunded webhooks
   */
  async stripeWebhook(ctx) {
    const signature = ctx.request.headers['stripe-signature'];
    const unparsedBody = ctx.request.body[Symbol.for('unparsedBody')] || ctx.request.body;

    try {
      const response = await strapi.service('api::order.stripe-webhook').handleStripeWebhook(
        signature,
        unparsedBody
      );
      return ctx.send(response);
    } catch (error: any) {
      const errorMessage = error.message || '';
      if (errorMessage.includes('signature verification failed') ||
          errorMessage.includes('raw body') ||
          errorMessage.includes('No signatures found') ||
          errorMessage.includes('webhook') ||
          errorMessage.includes('Stripe') ||
          errorMessage.includes('apiKey') ||
          errorMessage.includes('not configured')) {
        return ctx.badRequest(error.message);
      }
      return ctx.internalServerError(error.message);
    }
  },

  /**
   * PUT /api/orders/by-order-id/:orderId
   *
   * [GAP-3] Atomic UPSERT-by-orderId for the deferred Gap #1 enrichment
   * half. Thin delegation shim — see `services/upsert.ts` for the
   * transactional find/gates/merge/write logic.
   *
   * Appended AFTER all existing controller methods so the no-touch
   * boundaries (`find`/`findOne`/update/`requestCancellation`/`stripeWebhook`)
   * stay byte-identical.
   */
  async upsertByOrderId(ctx) {
    // [GAP-3 A-6] X-Trace-Id: read inbound header or generate. Set the
    // response header FIRST so it appears on error responses too —
    // Strapi's errors middleware runs outside the controller.
    const inbound = ctx.request.headers['x-trace-id'];
    const traceId =
      typeof inbound === 'string' && inbound.length > 0
        ? inbound
        : (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    ctx.set('X-Trace-Id', String(traceId));

    // [GAP-3 A-10] Auth — `ctx.state.user.id` is the sole identity authority.
    const authUserId = ctx.state.user?.id;
    if (!authUserId) {
      return ctx.unauthorized('You must be logged in to upsert an order');
    }

    const orderId = ctx.params?.orderId;
    const payload = ctx.request?.body || {};

    try {
      const upsertService = strapi.service('api::order.upsert');
      const order = await upsertService.upsertOrderByOrderId(
        orderId,
        payload,
        authUserId,
        String(traceId),
      );

      return {
        data: {
          id: order.documentId,
          attributes: order,
        },
        meta: {},
      };
    } catch (error: any) {
      // [GAP-3 A-7] Map typed marker errors to HTTP 4xx. Strapi 5.23.5
      // has no `ctx.conflict` (verified in @strapi/utils/dist/types.d.ts
      // koa augmentations) and `HttpError` from @strapi/utils is the
      // abstract base class — instantiating it directly throws
      // "cannot construct abstract class" (verified in
      // http-errors/index.js:114). The cleanest portable approach is
      // `ctx.status` + `ctx.body` to manually produce the
      // `{data:null,error:{status,name,message,details:{traceId}}}` shape
      // Strapi's errors middleware would produce. This mirrors the
      // existing `requestCancellation` action's manual error mapping
      // (controllers/order.ts:309-320) and keeps the file's no-touch
      // boundaries untouched.
      if (error instanceof UpsertBadRequestError) {
        ctx.status = 400;
        ctx.body = {
          data: null,
          error: {
            status: 400,
            name: 'BadRequestError',
            message: error.message,
            details: { traceId: error.traceId },
          },
        };
        return;
      }
      if (error instanceof UpsertForbiddenError) {
        ctx.status = 403;
        ctx.body = {
          data: null,
          error: {
            status: 403,
            name: 'ForbiddenError',
            message: error.message,
            details: { traceId: error.traceId },
          },
        };
        return;
      }
      if (error instanceof UpsertConflictError) {
        ctx.status = 409;
        ctx.body = {
          data: null,
          error: {
            status: 409,
            name: 'ConflictError',
            message: error.message,
            details: { traceId: error.traceId },
          },
        };
        return;
      }
      if (error instanceof UpsertUniqueExhaustedError) {
        // [GAP-3 A-11] Bounded retry exhausted — same 409 envelope as
        // ConflictError, distinct name for ops grep + metrics. Same
        // manual assembly as A-7 (HttpError is abstract in 5.23.5).
        ctx.status = 409;
        ctx.body = {
          data: null,
          error: {
            status: 409,
            name: 'ConflictError',
            message: error.message,
            details: { traceId: error.traceId },
          },
        };
        return;
      }
      // Unexpected — log and surface 500 with the same traceId so
      // operators can correlate logs ↔ responses.
      strapi.log.error(
        `[GAP-3] upsertByOrderId unexpected error orderId=${orderId} traceId=${traceId}:`,
        error,
      );
      ctx.status = 500;
      ctx.body = {
        data: null,
        error: {
          status: 500,
          name: 'InternalServerError',
          message: 'Internal server error',
          details: { traceId: String(traceId) },
        },
      };
      return;
    }
  }
}));
