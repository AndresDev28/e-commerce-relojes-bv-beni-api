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
   * [REF-03] Handles customer requests to cancel an order
   * [REF-04] Validates that only the order owner can request cancellation
   * [REF-05] Validates that order is in a valid state for cancellation
   */
  async requestCancellation(ctx) {
    const { id } = ctx.params;
    const userId = ctx.state.user?.id;

    if (!userId) {
      return ctx.unauthorized('You must be logged in to request an order cancellation');
    }

    const reason = ctx.request.body?.reason;
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      strapi.log.warn(`[REF-03] Cancel request for order ${id} rejected: Invalid reason`);
      return ctx.badRequest('A cancellation reason must be provided');
    }

    let order: any;
    try {
      order = await strapi.documents('api::order.order').findOne({
        documentId: id,
        populate: ['user'],
      });
    } catch (error) {
      strapi.log.warn(`[REF-03] Error finding order ${id} for cancellation:`, error);
      return ctx.notFound('Order not found');
    }

    if (!order) {
      return ctx.notFound('Order not found');
    }

    const userRole = await getUserRole(userId, strapi);
    const isAdministrator = userRole === 'administrator';

    // [REF-04] Validate ownership
    if (!isAdministrator && order.user?.documentId !== ctx.state.user.documentId && order.user?.id !== userId) {
      strapi.log.warn(`[REF-04] User ${userId} attempted to cancel unauthorized order: ${id}`);
      return ctx.forbidden('You can only cancel your own orders');
    }

    // [REF-05] Validate state
    const currentStatus = order.orderStatus;
    const allowedStatuses = ['pending', 'paid', 'processing'];

    if (!allowedStatuses.includes(currentStatus)) {
      strapi.log.warn(`[REF-05] Cancel request rejected for order ${id}: Invalid state ${currentStatus}`);
      return ctx.badRequest(`Order cannot be cancelled in status: ${currentStatus}`);
    }

    // Process the cancellation request
    strapi.log.info(`[REF-03] User ${userId} requested cancellation for order ${id}. Reason: "${reason.substring(0, 50)}..."`);

    try {
      // Use db.query to bypass Strapi v5 content API sanitization
      // which strips cancellationReason and cancellationDate from controller context
      await strapi.db.query('api::order.order').update({
        where: { id: order.id },
        data: {
          orderStatus: 'cancellation_requested',
          cancellationReason: reason.substring(0, 1000),
          cancellationDate: new Date().toISOString(),
          statusChangeNote: `El cliente ha solicitado la cancelación del pedido. Motivo: ${reason}`,
        },
      });

      // Fetch the updated order to return in response
      const updatedOrder = await strapi.documents('api::order.order').findOne({
        documentId: order.documentId,
      });

      strapi.log.info(`[REF-03] ✅ Order ${id} updated to cancellation_requested. Reason saved: "${reason.substring(0, 50)}..."`);

      return {
        data: {
          id: updatedOrder.documentId,
          attributes: updatedOrder
        },
        meta: {}
      };
    } catch (error) {
      strapi.log.error(`[REF-03] Error updating order ${id} for cancellation:`, error);
      return ctx.internalServerError('An error occurred while processing the cancellation request');
    }
  },

  /**
   * POST /api/orders/stripe-webhook
   *
   * [REF-10] Handles Stripe's charge.refunded webhooks
   */
  async stripeWebhook(ctx) {
    const signature = ctx.request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      strapi.log.error('[REF-10] STRIPE_WEBHOOK_SECRET is not configured');
      return ctx.internalServerError('Webhook secret not configured');
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: '2026-01-28.clover' as any,
    });

    let event: Stripe.Event;

    try {
      const unparsedBody = ctx.request.body[Symbol.for('unparsedBody')] || ctx.request.body;

      if (!unparsedBody) {
        strapi.log.error('[REF-10] No unparsed body available for Stripe webhook');
        return ctx.badRequest('Missing raw body');
      }

      event = stripe.webhooks.constructEvent(unparsedBody, signature, endpointSecret);
    } catch (err: any) {
      strapi.log.error(`[REF-10] Webhook signature verification failed: ${err.message}`);
      return ctx.badRequest(`Webhook signature verification failed.`);
    }

    strapi.log.info(`[REF-10] Stripe webhook received: ${event.type}`);

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

      if (!paymentIntentId) {
        strapi.log.warn('[REF-10] charge.refunded received without a payment_intent ID');
        return ctx.send({ received: true });
      }

      try {
        const orders = await strapi.entityService.findMany('api::order.order', {
          filters: { paymentIntentId: paymentIntentId },
        }) as any[];

        if (!orders || orders.length === 0) {
          strapi.log.warn(`[REF-10] Webhook: No order found for paymentIntent ${paymentIntentId}`);
          return ctx.send({ received: true });
        }

        const order = orders[0];

        if (order.orderStatus === 'refunded') {
          strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} is already refunded. Ignoring.`);
          return ctx.send({ received: true });
        }

        await strapi.entityService.update('api::order.order', order.id, {
          data: {
            orderStatus: 'refunded',
            statusChangeNote: 'Automated refund confirmation via Stripe webhook',
          },
        });

        strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} successfully marked as refunded.`);
      } catch (error) {
        strapi.log.error(`[REF-10] Webhook: Error processing charge.refunded for payment intent ${paymentIntentId}:`, error);
        return ctx.internalServerError('Error processing webhook event');
      }
    } else {
      strapi.log.debug(`[REF-10] Unhandled webhook event type: ${event.type}`);
    }

    return ctx.send({ received: true });
  }
}));
