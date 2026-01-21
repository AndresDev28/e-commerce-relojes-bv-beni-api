/**
 * order controller
 *
 * [ORD-25] Security: Automatic user filtering
 * ============================================
 * Ensures authenticated users can ONLY access their own orders.
 *
 * CRITICAL SECURITY IMPLEMENTATION:
 * - find(): Filters orders by authenticated user
 * - findOne(): Validates ownership before returning
 * - create(): User auto-assigned via lifecycle hook
 *
 * This prevents horizontal privilege escalation where User A
 * could access User B's orders.
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::order.order', ({ strapi }) => ({
  /**
   * GET /api/orders
   *
   * Returns only orders belonging to the authenticated user.
   * Uses entityService to filter by user relation.
   */
  async find(ctx) {
    // Get authenticated user from context
    const userId = ctx.state.user?.id

    if (!userId) {
      return ctx.unauthorized('You must be logged in to view orders')
    }

    // Use entityService to query orders filtered by user
    const orders = await strapi.entityService.findMany('api::order.order', {
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

    // Return with standard Strapi v5 REST API format
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
   * Returns order details ONLY if it belongs to authenticated user.
   * Validates ownership before returning data.
   */
  async findOne(ctx) {
    // Get authenticated user from context
    const userId = ctx.state.user?.id

    if (!userId) {
      return ctx.unauthorized('You must be logged in to view order details')
    }

    const { id } = ctx.params

    // In Strapi v5, use Document Service API to work with documentId
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

    // Check if order exists
    if (!order) {
      strapi.log.warn(`[ORD-25] User ${userId} attempted to access non-existent order: ${id}`)
      return ctx.notFound('Order not found')
    }

    // Check if order belongs to the authenticated user
    if (order.user?.id !== userId) {
      strapi.log.warn(`[ORD-25] User ${userId} attempted to access unauthorized order: ${id} (belongs to user ${order.user?.id})`)
      return ctx.notFound('Order not found')
    }

    strapi.log.info(`[ORD-25] User ${userId} accessed order: ${id}`)

    // Return with standard Strapi v5 REST API format
    return {
      data: {
        id: order.documentId,
        attributes: order
      },
      meta: {}
    }
  },
}));
