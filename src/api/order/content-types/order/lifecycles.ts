/**
 * Order lifecycle hooks
 *
 * Automatically assigns the authenticated user to new orders.
 * This is necessary because Strapi v5 rejects the "user" field in REST API requests
 * with "Invalid key user" error when trying to set relations directly.
 *
 * [ORD-33] Creates status history entries for audit purposes
 */

import { validateOrderTransition } from '../../helpers/validate-order-transition'

/**
 * Helper function to create status history entry
 * [ORD-33] Centralized logic for status history recording
 * Uses unidirectional relation (manyToOne from statusHistory to order)
 */
async function createStatusHistoryEntry(
  strapi: any,
  orderId: number,
  fromStatus: string | null,
  toStatus: string,
  changedByEmail: string = 'system@example.com',
  note?: string
) {
  try {
    await strapi.entityService.create('api::order-status-history.order-status-history', {
      data: {
        fromStatus,
        toStatus,
        changedAt: new Date(),
        changedByEmail,
        note: note || undefined,
        order: { connect: [orderId] }
      }
    })

    console.log(`[ORD-33] Status change logged: ${fromStatus || 'initial'} → ${toStatus} for order ID ${orderId} by ${changedByEmail}`)
  } catch (error) {
    console.error(`[ORD-33] Failed to create status history entry:`, {
      orderId,
      fromStatus,
      toStatus,
      error: error.message || error?.toString() || String(error),
      stack: error.stack
    })
  }
}

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
   * afterCreate hook
   * [ORD-33] Create initial status history entry when order is created
   */
  async afterCreate(event) {
    const { result } = event

    try {
      // Get request context to access authenticated user
      const ctx = strapi.requestContext.get();
      const changedByEmail = ctx?.state?.user?.email || 'system@example.com'

      // Create initial status history entry (from null to current status)
      await createStatusHistoryEntry(
        strapi,
        result.id,
        null, // No previous status for new orders
        result.orderStatus,
        changedByEmail
      )
    } catch (error) {
      strapi.log.error(`[ORD-33] Exception in afterCreate hook:`, {
        orderId: result?.id,
        error: error.message,
      })
    }
  },
  /**
     * beforeUpdate hook
     * [ORD-22] Store previous orderStatus for comparison
     * [ORD-32] Validate order status transitions
     * [ORD-34] Capture statusChangeNote from update payload
     */
  async beforeUpdate(event) {
    const { where, data } = event.params;

    // Get current order to compare status later
    const existingOrder = await strapi.entityService.findOne('api::order.order', where.id, {
      fields: ['orderStatus'],
    });

    const currentStatus = existingOrder?.orderStatus
    const newStatus = data.orderStatus

    // [ORD-32] Validate status transition if status is being changed
    if (newStatus && currentStatus && newStatus !== currentStatus) {
      const validation = validateOrderTransition(currentStatus, newStatus)

      if (!validation.valid) {
        strapi.log.warn(`[ORD-32] Invalid status transition attempted: ${currentStatus} → ${newStatus} for order ${where.id}. Error: ${validation.error}`)
        throw new Error(validation.error)
      }

      strapi.log.info(`[ORD-32] Valid status transition: ${currentStatus} → ${newStatus} for order ${where.id}`)
    }

    // Store previous status in event state for afterUpdate hook
    event.state = event.state || {};
    event.state.previousOrderStatus = currentStatus;

    // [ORD-34] Capture statusChangeNote from update payload for use in afterUpdate
    const { statusChangeNote } = data
    if (statusChangeNote !== undefined) {
      event.state.statusChangeNote = statusChangeNote || null
      strapi.log.debug(`[ORD-34] beforeUpdate: Captured statusChangeNote = "${statusChangeNote}"`);
      // Remove from data so it doesn't persist in Order entity
      delete data.statusChangeNote
    }

    strapi.log.debug(`[ORD-22] beforeUpdate: Stored previous status = ${currentStatus}`);
  },
  /**
       * afterUpdate hook
       * [ORD-22] Sends email notification when order status changes
       * [ORD-33] Creates status history entry for audit purposes
       * [ORD-34] Passes statusChangeNote to history and webhook
       */
  async afterUpdate(event) {
    const { result } = event

    try {
      // 1. Check if orderStatus actually changed (not just updated)
      const previousStatus = event.state?.previousOrderStatus
      const newStatus = result.orderStatus
      // [ORD-34] Retrieve statusChangeNote captured in beforeUpdate
      const statusChangeNote = event.state?.statusChangeNote || null

      if (previousStatus === newStatus) {
        strapi.log.debug(`[ORD-22/33] Order ${result.orderId}: orderStatus unchanged (${newStatus}), skipping history and email`);
        return;
      }

      strapi.log.info(`[ORD-22/33] Order ${result.orderId}: Status changed ${previousStatus} → ${newStatus}`)
      if (statusChangeNote) {
        strapi.log.debug(`[ORD-34] Order ${result.orderId}: Status change note = "${statusChangeNote}"`)
      }

      // 2. Get request context to access authenticated user
      const ctx = strapi.requestContext.get();
      const changedByEmail = ctx?.state?.user?.email || 'system@example.com'

      // 3. [ORD-33/34] Create status history entry with note
      await createStatusHistoryEntry(
        strapi,
        result.id,
        previousStatus,
        newStatus,
        changedByEmail,
        statusChangeNote
      )

      // 4. [ORD-22] Check if email notifications are enabled
      const emailNotificationsDisabled = process.env.DISABLE_EMAIL_NOTIFICATIONS === 'true'
      if (emailNotificationsDisabled) {
        strapi.log.info('[ORD-22] Email notification disabled via env var')
        return
      }

      // 5. Get user mail
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

      // 6. Prepare webhook payload
      const payload = {
        orderId: result.orderId,
        customerEmail,
        customerName,
        orderStatus: newStatus,
        statusChangeNote, // [ORD-34] Include note in webhook payload
        orderData: {
          items: result.items,
          subtotal: parseFloat(result.subtotal),
          shipping: parseFloat(result.shipping),
          total: parseFloat(result.total),
          createdAt: result.createdAt,
        },
      }

      strapi.log.debug(`[ORD-22] Payload prepared:`, { orderId: result.orderId, status: newStatus })

      // 7. Call Next.js webhook
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

      // 8. Handle response
      try {
        const responseData = await response.json()
        if (response.ok) {
          strapi.log.info(`[ORD-22] ✅ Email sent successfully for order ${result.orderId}`)
        } else {
          strapi.log.error(`[ORD-22] ❌ Email sending failed for order ${result.orderId}:`, {
            status: response.status,
            error: responseData,
          })
        }
      } catch (webhookError) {
        strapi.log.error(`[ORD-22] ❌ Webhook call failed:`, webhookError)
      }

      // 9. [REF-08] Trigger Refund if status changed to 'refunded'
      if (newStatus === 'refunded') {
        try {
          // Both WEBHOOK_SECRET (used in email for historical reasons) and STRAPI_WEBHOOK_SECRET are needed.
          // Since both front/back ends share env concepts, we reuse WEBHOOK_SECRET or fallback to a dedicated one if configured.
          const frontendUrl = process.env.FRONTEND_URL
          const refundSecret = process.env.STRAPI_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET

          if (!frontendUrl || !refundSecret) {
            strapi.log.error('[REF-08] Missing FRONTEND_URL or STRAPI_WEBHOOK_SECRET to process refund')
          } else if (!result.paymentIntentId || !result.total) {
            strapi.log.error(`[REF-08] Order ${result.orderId} missing paymentIntentId or total for refund`)
          } else {
            const refundUrl = `${frontendUrl}/api/refund-order`
            strapi.log.info(`[REF-08] Triggering refund for order ${result.orderId} via ${refundUrl}`)

            // amount must be in euros (or native currency), the frontend converts to cents
            const refundPayload = {
              paymentIntentId: result.paymentIntentId,
              amount: parseFloat(result.total),
              orderId: result.orderId
            }

            const refundResponse = await fetch(refundUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-strapi-secret': refundSecret,
              },
              body: JSON.stringify(refundPayload),
            })

            const refundData = await refundResponse.json()

            if (refundResponse.ok) {
              strapi.log.info(`[REF-08] ✅ Refund processed successfully for order ${result.orderId}`)
            } else {
              strapi.log.error(`[REF-08] ❌ Refund failed for order ${result.orderId}:`, {
                status: refundResponse.status,
                error: refundData,
              })
            }
          }
        } catch (refundError) {
          strapi.log.error(`[REF-08] ❌ Refund webhook call failed:`, refundError)
        }
      }

    } catch (error) {
      // Error handling - NEVER throw, just log
      strapi.log.error(`[ORD-22/33] Exception in afterUpdate hook:`, {
        orderId: result?.orderId,
        error: error.message,
      })
    }
  }
};
