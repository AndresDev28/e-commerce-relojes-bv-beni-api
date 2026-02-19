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
   * - Must be a string if provided
   * - Must not exceed 5000 characters
   */
  async update(ctx) {
    const { id } = ctx.params
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
}));
