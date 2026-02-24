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
import { errors } from '@strapi/utils';

const { ApplicationError } = errors;

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

/**
 * Helper function to update product stock
 * [REF-09] Atomic stock management
 */
async function updateProductStock(strapi: any, productId: number | string, quantityChange: number) {
  try {
    // Ensure we handle both numeric IDs and string IDs (documentId) correctly
    // If it's a numeric string, convert to number
    const numericId = typeof productId === 'string' && !isNaN(Number(productId)) ? Number(productId) : productId;

    const product = await strapi.entityService.findOne('api::product.product', numericId, {
      fields: ['stock', 'name']
    });

    if (!product) {
      strapi.log.error(`[REF-09] Product ${productId} not found for stock update`);
      return;
    }

    const currentStock = product.stock || 0;
    const newStock = currentStock + quantityChange;

    await strapi.entityService.update('api::product.product', product.id, {
      data: { stock: Math.max(0, newStock) }
    });

    strapi.log.info(`[REF-09] Stock updated for "${product.name}" (${product.id}): ${currentStock} → ${newStock}`);
  } catch (error) {
    strapi.log.error(`[REF-09] Failed to update stock for product ${productId}:`, error.message);
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

    // [AND-99] Validate stock before creating the order
    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        // Ensure we handle both numeric IDs and string IDs (documentId) correctly
        const numericId = typeof item.id === 'string' && !isNaN(Number(item.id)) ? Number(item.id) : item.id;

        if (!numericId || !item.quantity) continue;

        const product = await strapi.entityService.findOne('api::product.product', numericId, {
          fields: ['stock', 'name']
        });

        if (!product) {
          strapi.log.error(`[AND-99] Product ${item.id} not found during pre-creation stock validation`);
          continue; // Or throw error? Throwing is safer.
        }

        const availableStock = product.stock || 0;
        if (availableStock < item.quantity) {
          strapi.log.warn(`[AND-99] Order rejected: Insufficient stock for "${product.name}" (Requested: ${item.quantity}, Available: ${availableStock})`);
          throw new ApplicationError(`Insufficient stock for "${product.name}". Available: ${availableStock}, Requested: ${item.quantity}`);
        }
      }
    }
  },

  /**
   * afterCreate hook
   * [ORD-33] Create initial status history entry when order is created
   * [REF-09] Decrement product stock
   */
  async afterCreate(event) {
    const { result } = event

    try {
      // 1. [ORD-33] Get request context to access authenticated user
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

      // 2. [REF-09] Decrement stock for each item in the order
      // We only decrement if the order is NOT already cancelled (e.g., failed immediately)
      if (result.orderStatus !== 'cancelled' && result.items && Array.isArray(result.items)) {
        strapi.log.info(`[REF-09] Order ${result.orderId} created: Decrementing stock for ${result.items.length} items`);

        for (const item of result.items) {
          if (item.id && item.quantity) {
            // quantity is positive, so quantityChange is -item.quantity
            await updateProductStock(strapi, item.id, -item.quantity);
          }
        }
      }
    } catch (error) {
      strapi.log.error(`[ORD-33/REF-09] Exception in afterCreate hook:`, {
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
      // The note will also be saved in the Order entity so the admin can see it directly
    }

    strapi.log.debug(`[ORD-22] beforeUpdate: Stored previous status = ${currentStatus}`);
  },
  /**
       * afterUpdate hook
       * [ORD-22] Sends email notification when order status changes
       * [ORD-33] Creates status history entry for audit purposes
       * [ORD-34] Passes statusChangeNote to history and webhook
       * [REF-09] Restores stock if order is cancelled or refunded
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

      // 4. [REF-09] Restore stock if status changed to 'cancelled' or 'refunded'
      const refundTargetStatuses = ['cancelled', 'refunded'];
      const isNowRefunded = refundTargetStatuses.includes(newStatus);
      const wasAlreadyRefunded = refundTargetStatuses.includes(previousStatus);

      if (isNowRefunded && !wasAlreadyRefunded) {
        strapi.log.info(`[REF-09] Order ${result.orderId} status changed to ${newStatus}: Restoring stock`);

        if (result.items && Array.isArray(result.items)) {
          for (const item of result.items) {
            if (item.id && item.quantity) {
              // quantity is positive, so quantityChange is item.quantity (positive)
              await updateProductStock(strapi, item.id, item.quantity);
            }
          }
        }
      }

      // 5. [ORD-22] Check if email notifications are enabled
      const emailNotificationsDisabled = process.env.DISABLE_EMAIL_NOTIFICATIONS === 'true'
      if (emailNotificationsDisabled) {
        strapi.log.info('[ORD-22] Email notification disabled via env var')
        return
      }

      // 6. Get user mail
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

      // 7. Prepare webhook payload
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

      // 8. Call Next.js webhook
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

      // 9. Handle response
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

      // 10. [REF-08] Trigger Refund if status changed to 'refunded'
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
      strapi.log.error(`[ORD-22/33/REF-09] Exception in afterUpdate hook:`, {
        orderId: result?.orderId,
        error: error.message,
      })
    }
  }
};
