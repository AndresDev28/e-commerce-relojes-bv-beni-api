/**
 * Order lifecycle hooks
 *
 * Automatically assigns the authenticated user to new orders.
 * This is necessary because Strapi v5 rejects the "user" field in REST API requests
 * with "Invalid key user" error when trying to set relations directly.
 *
 * [ORD-33] Creates status history entries for audit purposes
 */

import { validateOrderTransition } from '../../../../core/domain/order/order.types'
import { errors } from '@strapi/utils';

const { ApplicationError } = errors;

async function sendOrderEmailWebhook(strapi: any, result: any, newStatus: string, previousStatus: string | null, statusChangeNote: string | null, isNewOrder = false) {
  // 5. [ORD-22] Check if email notifications are enabled
  const emailNotificationsDisabled = process.env.DISABLE_EMAIL_NOTIFICATIONS === 'true'
  if (emailNotificationsDisabled) {
    strapi.log.info('[ORD-22] Email notification disabled via env var')
    return
  }

  // 6. Get user mail and shipment info
  // Important: Need to populate user relation to get email and shipment for tracking
  const order: any = await strapi.entityService.findOne('api::order.order', result.id, {
    populate: ['user', 'shipment'] as any,
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
    previousOrderStatus: previousStatus, // [REF-12] Usado en frontend para detectar rechazos de cancelación
    statusChangeNote, // [ORD-34] Include note in webhook payload
    isNewOrder,
    orderData: {
      items: result.items,
      subtotal: parseFloat(result.subtotal),
      shipping: parseFloat(result.shipping),
      total: parseFloat(result.total),
      createdAt: result.createdAt,
      shipment: order.shipment ? {
        tracking_number: order.shipment.tracking_number,
        carrier: order.shipment.carrier,
        shipmentStatus: order.shipment.shipmentStatus,
        estimated_delivery_date: order.shipment.estimated_delivery_date
      } : null
    },
  }

  strapi.log.debug(`[ORD-22] Payload prepared:`, { orderId: result.orderId, status: newStatus, isNewOrder })

  // 8. Call Next.js webhook
  const frontendUrl = process.env.FRONTEND_URL
  const webhookSecret = process.env.WEBHOOK_SECRET

  if (!frontendUrl || !webhookSecret) {
    strapi.log.error('[ORD-22] Missing FRONTEND_URL or WEBHOOK_SECRET env vars')
    return
  }

  const webhookUrl = `${frontendUrl}/api/send-order-email`

  strapi.log.debug(`[ORD-22] Calling webhook: ${webhookUrl}`)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': webhookSecret,
      },
      body: JSON.stringify(payload),
    })

    // 9. Handle response
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
      await strapi.service('api::order.order').createStatusHistoryEntry(
        result.id,
        null, // No previous status for new orders
        result.orderStatus,
        changedByEmail
      )

      // 2. [REF-09][GAP-1 PR3 T-PR3-5] Decrement block REMOVED.
      // Stock authority moved to the webhook (`payment_intent.succeeded`
      // handler in PR4a via the `decrementStockOnce` helper). The
      // status-history creation (above) and the initial-purchase email
      // (below) remain — they fire for both client-created and
      // webhook-created orders with no stock side effect.
      if (result.orderStatus !== 'cancelled' && result.items && Array.isArray(result.items)) {
        // 3. Send initial purchase email webhook to frontend
        await sendOrderEmailWebhook(strapi, result, result.orderStatus, null, null, true);
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

    strapi.log.info(`[ORD-32] beforeUpdate: where = ${JSON.stringify(where)}, data.orderStatus = ${data.orderStatus}`)

    // Get current order to compare status later
    // Strapi v5: admin panel may pass documentId instead of numeric id
    let existingOrder: any = null;

    try {
      if (where.documentId) {
        // Strapi v5 Document Service path (admin panel uses this)
        const results = await strapi.documents('api::order.order').findFirst({
          filters: { documentId: where.documentId },
          fields: ['orderStatus', 'orderId'],
        });
        existingOrder = results;
      } else if (where.id) {
        // Legacy entityService path
        existingOrder = await strapi.entityService.findOne('api::order.order', where.id, {
          fields: ['orderStatus', 'orderId'],
        });
      }
    } catch (findError) {
      strapi.log.error(`[ORD-32] beforeUpdate: Error finding existing order:`, findError);
    }

    if (!existingOrder) {
      strapi.log.warn(`[ORD-32] beforeUpdate: Could not find existing order with where = ${JSON.stringify(where)}. Skipping validation.`);
      return;
    }

    const currentStatus = existingOrder.orderStatus
    const newStatus = data.orderStatus

    strapi.log.info(`[ORD-32] beforeUpdate: Order ${existingOrder.orderId || where.id}: currentStatus = ${currentStatus}, newStatus = ${newStatus}`);

    // [ORD-32] Validate status transition if status is being changed
    if (newStatus && currentStatus && newStatus !== currentStatus) {
      const validation = validateOrderTransition(currentStatus, newStatus)

      if (!validation.valid) {
        strapi.log.warn(`[ORD-32] Invalid status transition attempted: ${currentStatus} → ${newStatus} for order ${existingOrder.orderId}. Error: ${validation.error}`)
        throw new ApplicationError(validation.error)
      }

      strapi.log.info(`[ORD-32] Valid status transition: ${currentStatus} → ${newStatus} for order ${existingOrder.orderId}`)
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

    strapi.log.info(`[ORD-22] beforeUpdate: Stored previous status = ${currentStatus} for afterUpdate hook`);
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

      strapi.log.info(`[ORD-22/33] afterUpdate: Order ${result.orderId} | previousStatus = ${previousStatus} | newStatus = ${newStatus} | hasState = ${!!event.state}`)

      // [GAP-1 PR3 T-PR3-7] Webhook enrichment gate. Fires when an Order
      // was created as a shell (or with empty items) by the webhook and
      // is later enriched by a frontend UPSERT (Gap #3 follow-up). The
      // gate is what makes the stock decrement authoritative:
      //   - orderStatus === 'paid' (already authorized)
      //   - stockDeducted === false (no claim yet)
      //   - items have at least one entry with a product `id` (the
      //     actual webhook enrichment shape; legacy client-first items
      //     keyed by `productId` are NOT enrichment updates and must
      //     fall through to the normal status-history + email path)
      //   - items.length > 0 (now we know what to decrement)
      // The helper is CAS-idempotent, so concurrent enrichment calls
      // decrement exactly once. After the gate fires, we early-return
      // to avoid duplicate status-history/email side effects on the
      // enrichment update (status didn't change; D-DESIGN-7 dedup row 3).
      const hasDecrementableItems =
        Array.isArray(result.items) &&
        result.items.length > 0 &&
        result.items.some((item: any) => item.id && item.quantity)

      const isEnrichmentUpdate =
        newStatus === 'paid' &&
        result.stockDeducted === false &&
        hasDecrementableItems

      if (isEnrichmentUpdate) {
        strapi.log.info(`[GAP-1] Webhook enrichment gate fired for order ${result.orderId}`)
        const enrichResult = await strapi
          .service('api::order.order')
          .decrementStockOnce({
            id: result.id,
            documentId: result.documentId,
            stockDeducted: false,
            items: result.items,
          })

        if (enrichResult.ok) {
          strapi.log.info(`[GAP-1] Enrichment decremented stock for order ${result.orderId}`)
        } else if (enrichResult.stockDepleted) {
          strapi.log.warn(
            `[GAP-1] Enrichment depleted stock for order ${result.orderId}, transitioning to payment_failed`
          )
          try {
            await strapi.documents('api::order.order').update({
              documentId: result.documentId,
              data: {
                orderStatus: 'payment_failed',
                statusChangeNote: 'Stock depleted during payment confirmation; manual refund required',
                paymentInfo: {
                  ...(result.paymentInfo || {}),
                  paymentError: {
                    code: 'stock_depleted',
                    failure_message: 'Insufficient stock to confirm payment',
                  },
                },
              },
            } as any)
          } catch (transitionError) {
            strapi.log.error(
              `[GAP-1] Failed to transition order ${result.orderId} to payment_failed after enrichment depletion`,
              transitionError
            )
          }
        }

        // Early-return: enrichment updates don't change status, so we
        // skip history/email/restoration side-effects.
        return
      }

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
      await strapi.service('api::order.order').createStatusHistoryEntry(
        result.id,
        previousStatus,
        newStatus,
        changedByEmail,
        statusChangeNote
      )

      // 4. [REF-09][GAP-1 PR3 T-PR3-5] Restore stock if status changed to
      // 'cancelled' or 'refunded' AND stock was previously deducted. The
      // `stockDeducted` marker (set true ONLY by the webhook enrichment
      // gate) prevents phantom restoration on Orders whose stock was
      // never decremented — covering S-PFS-3 (`payment_failed →
      // cancelled`) and any shell or paid-order that was never enriched.
      const refundTargetStatuses = ['cancelled', 'refunded'];
      const isNowRefunded = refundTargetStatuses.includes(newStatus);
      const wasAlreadyRefunded = refundTargetStatuses.includes(previousStatus);

      if (isNowRefunded && !wasAlreadyRefunded && result.stockDeducted === true) {
        strapi.log.info(`[REF-09] Order ${result.orderId} status changed to ${newStatus}: Restoring stock (was deducted)`);

        if (result.items && Array.isArray(result.items)) {
          for (const item of result.items) {
            if (item.id && item.quantity) {
              // quantity is positive, so quantityChange is item.quantity (positive)
              await strapi.service('api::order.order').updateProductStock(item.id, item.quantity);
            }
          }
        }

        // [GAP-1 PR3 T-PR3-5] Clear the marker so a second cancel/refund
        // (e.g. cancelled → refunded) does not double-restore.
        try {
          await strapi.db.query('api::order.order').updateMany({
            where: { id: result.id },
            data: { stockDeducted: false },
          } as any);
        } catch (clearError) {
          strapi.log.warn(`[GAP-1] Failed to clear stockDeducted marker after restore for order ${result.orderId}`, clearError);
        }
      }

      // [SHIP-02] Auto-create Shipment when order becomes 'shipped'
      if (newStatus === 'shipped' && previousStatus !== 'shipped') {
        try {
          // Attempt to extract tracking info from the admin note
          let trackingNumber = `TRK-${result.orderId}`; // Default tracking if none provided
          let carrier = 'Otro';

          if (statusChangeNote) {
            const lowerNote = statusChangeNote.toLowerCase();
            if (lowerNote.includes('seur')) carrier = 'SEUR';
            else if (lowerNote.includes('correos')) carrier = 'Correos';
            else if (lowerNote.includes('gls')) carrier = 'GLS';
            else if (lowerNote.includes('mrw')) carrier = 'MRW';

            // Extract potential tracking number (alphanumeric string > 5 chars)
            const match = statusChangeNote.match(/[A-Z0-9]{6,20}/i);
            if (match) {
              trackingNumber = match[0].toUpperCase();
            }
          }

          // Query real: afterUpdate result does NOT populate relations
          const existingShipments = await strapi.documents('api::shipment.shipment' as any).findMany({
            filters: { order: { documentId: result.documentId } },
            limit: 1,
          } as any);

          if (!existingShipments || existingShipments.length === 0) {
            strapi.log.info(`[SHIP-02] Auto-creating shipment for order ${result.orderId} with tracking ${trackingNumber}`);

            // In Strapi v5 Document Service API, relations use connect syntax
            await strapi.documents('api::shipment.shipment' as any).create({
              data: {
                order: { connect: [result.documentId] },
                shipmentStatus: 'shipped',
                carrier: carrier,
                tracking_number: trackingNumber,
              } as any
            });
            strapi.log.info(`[SHIP-02] Successfully created Shipment for Order ${result.orderId}`);
          } else {
            strapi.log.info(`[SHIP-02] Shipment already exists for Order ${result.orderId}, skipping creation.`);
          }
        } catch (shipmentError) {
          strapi.log.error(`[SHIP-02] Failed to auto-create Shipment for Order ${result.orderId}:`, shipmentError);
        }
      }

      // 5. Send Email webhook to Next.js
      await sendOrderEmailWebhook(strapi, result, newStatus, previousStatus, statusChangeNote, false);

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
