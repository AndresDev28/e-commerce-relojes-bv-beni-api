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

// [GAP-1 PR3 T-PR3-3] Access Strapi 5's ambient transaction via AsyncLocalStorage.
// The Document Service wraps create/update in `strapi.db.transaction(cb)`, so
// `afterCreate` and `afterUpdate` always run inside an active transaction.
// Our helper must join that transaction (via `.transacting(trx)`) instead of
// issuing a separate raw UPDATE that would deadlock against the row lock held
// by the ambient transaction.
const transactionContext = require('@strapi/database/dist/transaction-context');

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
     * [GAP-1 PR3 T-PR3-3] Hardened so the helper can be called from both
     * transactional (Strapi lifecycle / PR4a webhook) and non-transactional
     * (tests / external) contexts without deadlocking or losing updates.
     *
     * Contract (T-PR3-2 tests):
     *   - Returns `true` if the row was updated (one affected row).
     *   - Returns `false` for a decrement that would floor below zero
     *     (zero affected rows; stock is left unchanged).
     *   - Inside a transaction the helper joins the ambient trx via
     *     `.transacting(trx)`, so no deadlock against the row lock held
     *     by the outer create/update call.
     *   - Outside a transaction the raw SQL `WHERE stock >= |qty|` guard
     *     makes the decrement race-safe under concurrent calls.
     *
     * Two execution paths:
     *   - **In-transaction path**: when an ambient transaction exists
     *     (Strapi lifecycle, PR4a webhook), we issue a single raw SQL
     *     UPDATE on the ambient trx with the `stock >= |qty|` guard. The
     *     atomic guard is the only correctness mechanism that works under
     *     concurrent decrements in either SQLite (serial) or Postgres
     *     (per-statement row lock).
     *   - **No-transaction path**: tests and external callers get the
     *     same single-statement UPDATE on the default connection.
     *
     * Callers can also pass `{ trx }` explicitly (used by PR4a's
     * reconciliation handler when wrapping multiple helpers in one
     * ambient `strapi.db.transaction`).
     */
    async updateProductStock(
        productId: number | string,
        quantityChange: number,
        opts?: { trx?: any }
    ): Promise<boolean> {
        try {
            const numericId = typeof productId === 'string' && !isNaN(Number(productId))
                ? Number(productId)
                : productId;

            // [GAP-1 PR3 T-PR3-3] Resolve which knex builder to use:
            //   - explicit `opts.trx` wins
            //   - else the ambient ALS transaction (set by
            //     `strapi.db.transaction(cb)`) — the Document Service
            //     wraps create/update in a transaction, so afterCreate
            //     and afterUpdate always run inside one
            //   - else the default knex connection (no ambient trx)
            const ambientTrx = opts?.trx ?? transactionContext.transactionCtx.get();

            const absQty = Math.abs(quantityChange);

            const updateBuilder = (ambientTrx ?? strapi.db.connection)('products')
                .where('id', numericId)
                .update({
                    stock: strapi.db.connection.raw(
                        quantityChange < 0 ? 'stock - ?' : 'stock + ?',
                        [absQty]
                    ),
                });

            if (quantityChange < 0) {
                updateBuilder.where('stock', '>=', absQty);
            }

            if (ambientTrx) {
                updateBuilder.transacting(ambientTrx);
            }

            const affected: number = await updateBuilder;
            const ok = affected > 0;

            if (ok) {
                strapi.log.info(
                    `[REF-09][GAP-1] Stock ${quantityChange < 0 ? 'decremented' : 'restored'} ` +
                    `for product ${productId} by ${quantityChange}` +
                    (ambientTrx ? ' (ambient trx)' : '')
                );
            } else if (quantityChange < 0) {
                strapi.log.warn(
                    `[REF-09][GAP-1] Insufficient stock for product ${productId}: ` +
                    `requested ${absQty}, refused by guard`
                );
            }

            return ok;
        } catch (error: any) {
            strapi.log.error(`[REF-09] Failed to update stock for product ${productId}:`, error.message);
            return false;
        }
    }
}));
