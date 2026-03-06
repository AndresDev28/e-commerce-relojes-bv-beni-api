/**
 * Shipment lifecycle hooks
 *
 * [SHIP-03] Synchronizes Order status when Shipment status changes:
 *   - Shipment → delivered: Order becomes delivered
 *   - Shipment → failed: Order goes back to processing
 */

export default {
    async beforeUpdate(event) {
        const { where } = event.params

        // Store previous status for comparison in afterUpdate
        let existingShipment: any = null

        try {
            if (where.documentId) {
                existingShipment = await strapi
                    .documents('api::shipment.shipment' as any)
                    .findFirst({
                        filters: { documentId: where.documentId },
                        fields: ['status'],
                    } as any)
            } else if (where.id) {
                existingShipment = await strapi.entityService.findOne(
                    'api::shipment.shipment' as any,
                    where.id,
                    { fields: ['status'] }
                )
            }
        } catch (findError) {
            strapi.log.error(
                `[SHIP-03] beforeUpdate: Error finding existing shipment:`,
                findError
            )
        }

        if (existingShipment) {
            event.state = event.state || {}
            event.state.previousStatus = existingShipment.status
        }
    },

    async afterUpdate(event) {
        const { result } = event

        try {
            const previousStatus = event.state?.previousStatus
            const newStatus = result.status

            strapi.log.info(
                `[SHIP-03] afterUpdate: Shipment ${result.tracking_number} | previousStatus = ${previousStatus} | newStatus = ${newStatus}`
            )

            if (previousStatus === newStatus) {
                return // No status change
            }

            // If status changed to delivered or failed, update the related Order
            if (newStatus === 'delivered' || newStatus === 'failed') {
                const orderStatusMap: Record<string, string> = {
                    delivered: 'delivered',
                    failed: 'processing', // If failed, go back to processing
                }

                const targetOrderStatus = orderStatusMap[newStatus]

                // Fetch the shipment with populated order relation
                const shipmentWithOrder: any = await strapi
                    .documents('api::shipment.shipment' as any)
                    .findFirst({
                        filters: { documentId: result.documentId },
                        populate: ['order'],
                    } as any)

                if (
                    shipmentWithOrder?.order?.documentId
                ) {
                    const orderDocId = shipmentWithOrder.order.documentId
                    const currentOrderStatus = shipmentWithOrder.order.orderStatus

                    if (currentOrderStatus !== targetOrderStatus) {
                        strapi.log.info(
                            `[SHIP-03] Triggering Order ${orderDocId} status update to ${targetOrderStatus} due to Shipment status change.`
                        )

                        // Update the Order status
                        // Note: This will trigger the Order's beforeUpdate and afterUpdate hooks
                        await strapi.documents('api::order.order').update({
                            documentId: orderDocId,
                            data: {
                                orderStatus: targetOrderStatus as any,
                                statusChangeNote: `Actualización automática: El envío se ha marcado como ${newStatus}`,
                            },
                        })

                        strapi.log.info(
                            `[SHIP-03] Order ${orderDocId} successfully updated to ${targetOrderStatus}.`
                        )
                    }
                } else {
                    strapi.log.warn(
                        `[SHIP-03] Shipment ${result.documentId} has no associated Order. Cannot sync status.`
                    )
                }
            }
        } catch (error) {
            strapi.log.error(`[SHIP-03] Exception in afterUpdate hook:`, error)
            // We don't throw to avoid blocking the Shipment save operation
        }
    },
}
