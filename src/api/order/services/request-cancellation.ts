/**
 * Request Cancellation Service
 * [ARCH-02] Extracted from order controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [REF-03] Handles customer requests to cancel an order
     * [REF-04] Validates that only the order owner can request cancellation
     * [REF-05] Validates that order is in a valid state for cancellation
     */
    async requestCancellation(id: string | number, userId: string | number, reason: string | undefined, userRole: string | null) {
        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
            strapi.log.warn(`[REF-03] Cancel request for order ${id} rejected: Invalid reason`);
            throw new Error('A cancellation reason must be provided');
        }

        let order: any;
        try {
            order = await strapi.documents('api::order.order').findOne({
                documentId: id as string,
                populate: ['user'],
            });
        } catch (error) {
            strapi.log.warn(`[REF-03] Error finding order ${id} for cancellation:`, error);
            throw new Error('Order not found');
        }

        if (!order) {
            throw new Error('Order not found');
        }

        const isAdministrator = userRole === 'administrator';

        // [REF-04] Validate ownership
        // Note: ctx.state.user.documentId is not available here, so we rely on userId matching order.user.id
        if (!isAdministrator && order.user?.id !== userId) {
            strapi.log.warn(`[REF-04] User ${userId} attempted to cancel unauthorized order: ${id}`);
            throw new Error('You can only cancel your own orders');
        }

        // [REF-05] Validate state
        const currentStatus = order.orderStatus;
        const allowedStatuses = ['pending', 'paid', 'processing'];

        if (!allowedStatuses.includes(currentStatus)) {
            strapi.log.warn(`[REF-05] Cancel request rejected for order ${id}: Invalid state ${currentStatus}`);
            throw new Error(`Order cannot be cancelled in status: ${currentStatus}`);
        }

        // Process the cancellation request
        strapi.log.info(`[REF-03] User ${userId} requested cancellation for order ${id}. Reason: "${reason.substring(0, 50)}..."`);

        try {
            // Use db.query to bypass Strapi v5 content API sanitization
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

            return updatedOrder;
        } catch (error) {
            strapi.log.error(`[REF-03] Error updating order ${id} for cancellation:`, error);
            throw new Error('An error occurred while processing the cancellation request');
        }
    }
}));
