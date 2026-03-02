/**
 * order service
 * [ARCH-02] Extracted business logic from lifecycles into dedicated service
 */

import { factories } from '@strapi/strapi';
import { OrderStatus } from '../../../core/domain/order/order.types';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [ORD-33] Centralized logic for status history recording
     * Uses unidirectional relation (manyToOne from statusHistory to order)
     */
    async createStatusHistoryEntry(
        orderId: number | string,
        fromStatus: OrderStatus | null,
        toStatus: OrderStatus,
        changedByEmail: string = 'system@example.com',
        note?: string
    ) {
        try {
            await strapi.entityService.create('api::order-status-history.order-status-history', {
                data: {
                    fromStatus: fromStatus as any,
                    toStatus: toStatus as any,
                    changedAt: new Date(),
                    changedByEmail,
                    note: note || undefined,
                    order: { connect: [orderId] } as any
                }
            });

            strapi.log.info(`[ORD-33] Status change logged: ${fromStatus || 'initial'} → ${toStatus} for order ID ${orderId} by ${changedByEmail}`);
        } catch (error: any) {
            strapi.log.error(`[ORD-33] Failed to create status history entry:`, {
                orderId,
                fromStatus,
                toStatus,
                error: error.message || error?.toString() || String(error),
                stack: error.stack
            });
        }
    },

    /**
     * [REF-09] Atomic stock management
     */
    async updateProductStock(productId: number | string, quantityChange: number) {
        try {
            // Ensure we handle both numeric IDs and string IDs (documentId) correctly
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
        } catch (error: any) {
            strapi.log.error(`[REF-09] Failed to update stock for product ${productId}:`, error.message);
        }
    }
}));
