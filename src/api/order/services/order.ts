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

            // [GAP-1 PR3 T-PR3-3] Raw SQL through the active connection
            // (trx or default). This bypasses knex's query-builder state
            // machine and is the only path that produced correct
            // placeholder binding under the SQLite ambient-trx case
            // observed during GAP-3 PR1 RED→GREEN work.
            //
            // Decrement: `stock = stock - N WHERE … AND stock >= N` — the
            // `stock >= N` guard makes the decrement race-safe (insufficient
            // stock → 0 affected rows, no UPDATE).
            // Increment: `stock = stock + N WHERE …` — no guard, restores
            // are unconditional.
            //
            // Return-value handling: `connection.raw(UPDATE …)` resolves
            // to different shapes per engine — SQLite (better-sqlite3
            // driver) returns the numeric `changes` count directly, while
            // node-postgres returns a `{ rowCount }` object. We accept
            // both and fall back to 0 on the unknown shape.
            const connection = ambientTrx ?? strapi.db.connection;
            const operator = quantityChange < 0 ? '-' : '+';
            const sql = quantityChange < 0
                ? `UPDATE products SET stock = stock ${operator} ? WHERE id = ? AND stock >= ?`
                : `UPDATE products SET stock = stock ${operator} ? WHERE id = ?`;
            const bindings = quantityChange < 0
                ? [absQty, numericId, absQty]
                : [absQty, numericId];
            const affected: number = await connection.raw(sql, bindings).then((res: any) => {
                if (typeof res === 'number') return res;
                if (res && typeof res === 'object') return res.changes ?? res.rowCount ?? 0;
                return 0;
            });
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
    },

    /**
     * [GAP-1 PR3 T-PR3-7] `decrementStockOnce` — the stock-authority
     * idempotent claim. Combines:
     *   - A CAS on the Order's `stockDeducted` marker (claim only if
     *     currently false; idempotent across concurrent enrichment calls
     *     and webhook re-deliveries).
     *   - A guarded per-item atomic decrement via `updateProductStock`.
     *   - If ANY item fails the guard (insufficient stock), the marker
     *     is reverted to false and the function returns `{ ok: false,
     *     stockDepleted: true, failedItem }`. The caller (the webhook
     *     enrichment gate) is responsible for transitioning the Order to
     *     `payment_failed` and logging the audit.
     *
     * The CAS-then-decrement-then-revert pattern is what makes the
     * helper race-safe under concurrent calls:
     *   - The CAS UPDATE WHERE `stockDeducted = false` SET `stockDeducted
     *     = true` is a single atomic statement — only one concurrent
     *     caller will see `affected = 1`.
     *   - The second caller sees `affected = 0` and is a no-op.
     *   - On decrement failure, the marker is reverted so the next call
     *     (e.g. from a Stripe retry) can re-attempt.
     *
     * Returns `{ ok: true }` on a successful one-shot decrement,
     * `{ ok: false, stockDepleted: true, failedItem }` on guard failure,
     * `{ ok: false, stockDepleted: false }` if the marker was already
     * true (no-op).
     */
    async decrementStockOnce(
        order: { id: number | string; documentId?: string; stockDeducted: boolean; items: any[] },
        opts?: { trx?: any }
    ): Promise<{ ok: boolean; stockDepleted: boolean; failedItem?: any }> {
        try {
            if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
                return { ok: false, stockDepleted: false };
            }

            // [GAP-1 PR3 T-PR3-7] CAS claim: flip the marker from false
            // to true atomically. Only one concurrent caller wins. We
            // join the ambient ALS transaction when one is active so
            // the UPDATE doesn't deadlock against the row lock held
            // by the surrounding `strapi.db.transaction` (e.g. the
            // Document Service wrapper around afterUpdate).
            //
            // [GAP-1 PR3 T-PR3-7] Column-name note: the DB stores
            // `stock_deducted` (snake_case) — Strapi's Query Engine
            // auto-converts camelCase ↔ snake_case for entityService
            // and documents, but raw knex queries must use the DB
            // column name explicitly.
            const ambientTrx = opts?.trx ?? transactionContext.transactionCtx.get();

            const claimBuilder = (ambientTrx ?? strapi.db.connection)('orders')
                .where('id', order.id)
                .where('stock_deducted', false)
                .update({ stock_deducted: true });

            if (ambientTrx) {
                claimBuilder.transacting(ambientTrx);
            }

            const claimed: number = await claimBuilder;

            if (claimed === 0) {
                // Someone else won the CAS race (or the marker was
                // already true from a prior successful enrichment).
                return { ok: false, stockDepleted: false };
            }

            // Per-item guarded decrement. Stop at first failure.
            for (const item of order.items) {
                if (!item.id || !item.quantity) continue;
                const ok = await this.updateProductStock(item.id, -item.quantity, opts);
                if (!ok) {
                    strapi.log.warn(
                        `[GAP-1] Stock depleted during enrichment, orderId=${order.id}, ` +
                        `productId=${item.id}, requested=${item.quantity}`
                    );
                    // [GAP-1 PR3 T-PR3-7] Revert the marker so the next
                    // call (e.g. operator-triggered retry after
                    // restock) can re-attempt.
                    await this.revertStockDeductedMarker(order.id, opts);
                    return { ok: false, stockDepleted: true, failedItem: item };
                }
            }

            return { ok: true, stockDepleted: false };
        } catch (error: any) {
            // [GAP-1 PR3 T-PR3-7] diagnostic logging for unexpected throws.
            const diag = `[GAP-1] decrementStockOnce failed for order ${order.id}: ` +
                `type=${typeof error} msg=${error?.message} val=${JSON.stringify(error)} ` +
                `stack=${error?.stack}`;
            strapi.log.error(diag);
            // Also console.error so vitest captures it even if strapi.log is muted.
            // eslint-disable-next-line no-console
            console.error('[GAP-1] decrementStockOnce failure:', diag);
            return { ok: false, stockDepleted: false };
        }
    },

    /**
     * [GAP-1 PR3 T-PR3-7] Internal helper to revert the `stockDeducted`
     * marker after a depleted-stock failure inside `decrementStockOnce`.
     * Best-effort: a failed revert is logged but does not propagate,
     * because the operator path (manual retry after restock) only needs
     * eventual consistency. Joins the ambient ALS transaction when one
     * is active. Uses the snake_case DB column (`stock_deducted`).
     */
    async revertStockDeductedMarker(orderId: number | string, opts?: { trx?: any }): Promise<void> {
        try {
            const ambientTrx = opts?.trx ?? transactionContext.transactionCtx.get();

            if (ambientTrx) {
                await ambientTrx('orders').where('id', orderId).update({ stock_deducted: false });
            } else {
                await strapi.db.connection('orders').where('id', orderId).update({ stock_deducted: false });
            }
        } catch (error) {
            strapi.log.error(
                `[GAP-1] CRITICAL: failed to revert stock_deducted marker for order ${orderId}`,
                error
            );
        }
    },

    /**
     * [GAP-1 PR3 T-PR3-7] Test-only entry point that wires the webhook
     * enrichment flow without requiring a full Stripe webhook dispatch.
     * PR4a will wire the same `decrementStockOnce` logic into the real
     * `payment_intent.succeeded` handler.
     *
     * The enrichment contract:
     *   1. Read the current Order (by documentId).
     *   2. Assert `stockDeducted === false` — idempotent.
     *   3. Call `decrementStockOnce` for each item.
     *   4. On success: flip the marker via Document Service.
     *   5. On stock depletion: store `paymentInfo.paymentError = { code,
     *      failure_message }` and transition the Order to `payment_failed`
     *      with an audit note. No automatic refund (manual path per
     *      design D-DESIGN-7 / scenario S-OSA-6).
     */
    async enrichShellWithItems(
        documentId: string,
        items: any[],
        opts?: { paymentIntentId?: string }
    ): Promise<{ ok: boolean; stockDepleted: boolean; transitionedTo?: string }> {
        try {
            const order: any = await strapi.documents('api::order.order').findOne({
                documentId,
            });

            if (!order) {
                strapi.log.warn(`[GAP-1] enrichShellWithItems: order ${documentId} not found`);
                return { ok: false, stockDepleted: false };
            }

            if (order.stockDeducted) {
                // Idempotent — already enriched.
                return { ok: false, stockDepleted: false };
            }

            const result = await this.decrementStockOnce({
                id: order.id,
                documentId,
                stockDeducted: order.stockDeducted,
                items,
            });

            if (result.ok) {
                // The marker flip inside decrementStockOnce already persisted.
                return { ok: true, stockDepleted: false };
            }

            if (result.stockDepleted) {
                // S-OSA-6: depleted stock during enrichment. Mark the order
                // payment_failed with an audit note. No automatic refund —
                // operator handles via Stripe dashboard per D-DESIGN-7.
                strapi.log.warn(
                    `[GAP-1] Stock depleted during enrichment, paymentIntentId=${opts?.paymentIntentId || 'n/a'}, ` +
                    `order=${order.orderId}, transitioning to payment_failed`
                );

                try {
                    await strapi.documents('api::order.order').update({
                        documentId,
                        data: {
                            orderStatus: 'payment_failed',
                            statusChangeNote: 'Stock depleted during payment confirmation; manual refund required',
                            paymentInfo: {
                                ...(order.paymentInfo || {}),
                                paymentError: {
                                    code: 'stock_depleted',
                                    failure_message: 'Insufficient stock to confirm payment',
                                },
                            },
                        },
                    });
                } catch (transitionError) {
                    strapi.log.error(
                        `[GAP-1] Failed to transition order ${order.orderId} to payment_failed after stock depletion`,
                        transitionError
                    );
                }

                return { ok: false, stockDepleted: true, transitionedTo: 'payment_failed' };
            }

            return { ok: false, stockDepleted: false };
        } catch (error: any) {
            strapi.log.error(`[GAP-1] enrichShellWithItems failed for ${documentId}:`, error.message);
            return { ok: false, stockDepleted: false };
        }
    },
}));
