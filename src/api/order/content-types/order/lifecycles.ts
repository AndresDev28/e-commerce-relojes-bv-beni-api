/**
 * Order lifecycle hooks
 * 
 * Automatically assigns the authenticated user to new orders.
 * This is necessary because Strapi v5 rejects the "user" field in REST API requests
 * with "Invalid key user" error when trying to set relations directly.
 */

export default {
  async beforeCreate(event) {
    const { data } = event.params

    // Get the request context to access the authenticated user
    const ctx = strapi.requestContext.get();

    if (ctx?.state?.user?.id) {
      // Assign the authenticated user's ID to the order (from HTTP request)
      // In Strapi v5, relations are set using the "connect" syntax
      data.user = {
        connect: [ctx.state.user.id]
      };

      strapi.log.info(`Order lifecycle: Assigning user ${ctx.state.user.id} to new order`)
    } else if (data.user) {
      // User already provided in payload (e.g., from programmatic creation in tests)
      // Keep the existing user assignment
      strapi.log.info('Order lifecycle: User already assigned in payload (programmatic creation)')
    } else {
      strapi.log.warn('Order lifecycle: No authenticated user found in request context or payload')
    }
  },
  /**
     * beforeUpdate hook
     * [ORD-22] Store previous orderStatus for comparison
     */
  async beforeUpdate(event) {
      const { where } = event.params;

      // Get current order to compare status later
      const existingOrder = await strapi.entityService.findOne('api::order.order', where.id, {
        fields: ['orderStatus'],
      });

      // Store previous status in event state for afterUpdate hook
      event.state = event.state || {};
      event.state.previousOrderStatus = existingOrder?.orderStatus;

      strapi.log.debug(`[ORD-22] beforeUpdate: Stored previous status = ${existingOrder?.orderStatus}`);
    },
  /**
     * afterUpdate hook
     * [ORD-22] Sends email notification when order status changes
     */
  async afterUpdate(event) {
    const { result } = event

    try {
      // 1. Check if email notifications are enable
      const emailNotificationsDisabled = process.env.DISABLE_EMAIL_NOTIFICATIONS === 'true'
      if (emailNotificationsDisabled) {
        strapi.log.info('[ORD-22] Email notification disabled via env var')
        return
      }

      // 2. Check if orderStatus actually changed (not just updated)
      const previousStatus = event.state?.previousOrderStatus
      const newStatus = result.orderStatus

      if (previousStatus === newStatus) {
        strapi.log.debug(`[ORD-22] Order ${result.orderId}: orderStatus unchanged (${newStatus}), skipping email`);
        return;
      }

      strapi.log.info(`[ORD-22] Order ${result.orderId}: Status changed ${previousStatus} → ${newStatus}`)

      // 3. Get user mail
      // Important: Need to populate user relation to get email
      const order: any = await strapi.entityService.findOne('api::order.order', result.id, {
        populate: ['user'],
      })

      if (!order?.user?.email) {
        strapi.log.error(`[ORD-22] Order ${result.orderId}: No user email found, cannot send notification`)
        return
      }

      const customerEmail = order.user.email
      const customerName = order.user.username || 'Cliente'

      strapi.log.info(`[ORD-22] Order ${result.orderId}: Sending email to ${customerEmail}`)
      
      // 4. Prepare webhook payload
      const payload = {
        orderId: result.orderId,
        customerEmail,
        customerName,
        orderStatus: newStatus,
        orderData: {
          items: result.items,
          subtotal: parseFloat(result.subtotal),
          shipping: parseFloat(result.shipping),
          total: parseFloat(result.total),
          createdAt: result.createdAt,
        },
      }

      strapi.log.debug(`[ORD-22] Payload prepared:`, {orderId: result.orderId, status: newStatus})

      // 5. Call Next.js webhook
      const frontendUrl = process.env.FRONTEND_URL
      const webhookSecret = process.env.WEBHOOK_SECRET

      if (!frontendUrl || !webhookSecret) {
        strapi.log.error('[ORD-22] Missing FRONTEND_URL or WEBHOOK_SECRET env vars')
        return
      }

      const webhookUrl = `${frontendUrl}/api/send-order-email`

      strapi.log.debug(`[ORD-22] Calling webhook: ${webhookUrl}`)

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhookSecret,
        },
        body: JSON.stringify(payload),
      })

      // 6. Handle response
      const responseData = await response.json()

      if (response.ok) {
        strapi.log.info(`[ORD-22] ✅ Email sent successfully for order ${result.orderId}`)
      } else {
        strapi.log.error(`[ORD-22] ❌ Email sending failed for order ${result.orderId}:`, {
          status: response.status,
          error: responseData,
        })
      }
    } catch (error) {
      // Error handling - NEVER throw, just log
      strapi.log.error(`[ORD-22] Exception in afterUpdate hook:`, {
        orderId: result?.orderId,
        error: error.message,
      })
    }
  }
};
