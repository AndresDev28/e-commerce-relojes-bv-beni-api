/**
 * order service
 * [ARCH-02] Extracted business logic from lifecycles into dedicated service
 *
 * [GAP-1 PR3 T-PR3-1] Stock-authority seams:
 *   - `updateProductStock` is the single entry point for product stock changes
 *     used by every other layer (legacy charge.refunded, new payment-reconciliation,
 *     lifecycle restoration gate).
 *   - In T-PR3-3 it becomes atomic and idempotent via a guarded SQL UPDATE.
 *   - In T-PR3-5 the lifecycle restoration gate is moved from
 *     `result.orderStatus` alone to `result.stockDeducted === true`, which is
 *     why the seam comment block sits here rather than on the lifecycles file.
 *   - In T-PR3-7 the helper is also exported via a `decrementStockOnce` flow
 *     that the webhook enrichment gate calls from `afterUpdate`.
 */

import { factories } from '@strapi/strapi';
import { OrderStatus } from '../../../core/domain/order/order.types';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [ORD-33] Centralized logic for status history recording
     * Uses unidirectional relation (manyToMany from statusHistory to order)
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
     *
     * [GAP-1 PR3 T-PR3-1 seam] Contract is being upgraded to an atomic
     * compare-and-set on `products.stock` (see T-PR3-3 for the implementation
     * and T-PR3-2 for the test contract). The seam comment marks where the
     * signature gains an optional `{ trx }` so the webhook enrichment gate
     * can join the ambient transaction.
     *
     * [GAP-1 PR3 T-PR3-5 seam] Callers must treat a `false` return as
     * "insufficient stock" — the lifecycle restoration gate relies on this
     * to know whether to clear the `stockDeducted` marker.
     */
    async updateProductStock(
        productId: number | string,
        quantityChange: number,
        opts?: { trx?: any }
    ): Promise<boolean> {
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
