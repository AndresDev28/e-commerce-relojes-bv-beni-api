/**
 * Checkout Order UPSERT service
 * [GAP-3] PR1 — atomic UPSERT-by-orderId endpoint.
 *
 * Architecture (A-1..A-14, design.md §2):
 *   - Registered as `api::order.upsert`.
 *   - `upsertOrderByOrderId(orderId, payload, authUserId, traceId)` opens a
 *     `strapi.db.transaction` envelope (A-2), finds by `orderId`, runs
 *     ownership (A-3, A-10) + status gate (A-4) + merge (A-5) inside it,
 *     then either updates via Document Service or INSERTs a `pending` row
 *     (D5 / R-COU-5). Throws typed marker errors; the controller maps
 *     them to HTTP 400/403/409/500 (A-7).
 *   - Per A-13 the update payload NEVER carries `orderStatus` — status is
 *     preserved by construction. The CAS `stockDeducted` decrement is
 *     driven by the lifecycle gate at `lifecycles.ts:297-378` after the
 *     Document Service write commits.
 *
 * Kill-switch invariant (#1748): this file MUST NOT read
 * `STRIPE_PI_WEBHOOKS_ENABLED`. Behavior is identical with the flag off,
 * on, or absent. Verification: `git grep STRIPE_PI_WEBHOOKS_ENABLED
 * src/api/order/services/upsert.ts` — expect zero matches.
 */

import { factories } from '@strapi/strapi';

// [GAP-3 A-7] Typed marker errors. The controller catches these and
// remaps to Strapi's standard {data:null, error:{status,...}} shape via
// `new HttpError(...)` from `@strapi/utils` (Strapi 5.23.5 has no
// `ctx.conflict` — verified in design A-7 / `@strapi/utils/dist/types.d.ts:60-71`).
export class UpsertBadRequestError extends Error {
    traceId: string;
    constructor(message: string, traceId: string) {
        super(message);
        this.name = 'UpsertBadRequestError';
        this.traceId = traceId;
    }
}
export class UpsertForbiddenError extends Error {
    traceId: string;
    constructor(message: string, traceId: string) {
        super(message);
        this.name = 'UpsertForbiddenError';
        this.traceId = traceId;
    }
}
export class UpsertConflictError extends Error {
    traceId: string;
    constructor(message: string, traceId: string) {
        super(message);
        this.name = 'UpsertConflictError';
        this.traceId = traceId;
    }
}

// [GAP-3 A-11] Surfaced when the bounded unique-retry is exhausted
// (or the constraint is on a non-recoverable field). Distinct from
// UpsertConflictError so the controller can map both to 409 with the
// correct envelope and trace id.
export class UpsertUniqueExhaustedError extends Error {
    traceId: string;
    constructor(message: string, traceId: string) {
        super(message);
        this.name = 'UpsertUniqueExhaustedError';
        this.traceId = traceId;
    }
}

// [GAP-3 A-4] Status gate allowlist (enrich). `pending` is in the set
// because R-COU-10 demands the first fallback-insert be re-enrichable
// by an identical retry PUT. `cancelled` and `refunded` are terminal —
// any other status is unlisted → fail-closed 409 zero-mutation.
const ENRICHABLE_STATUSES = ['paid', 'payment_failed', 'pending'];
const TERMINAL_STATUSES = ['cancelled', 'refunded'];

// [GAP-3 A-5] paymentInfo allowlist. Anything else in the client payload
// is silently dropped (retry-safe across older client versions per A-5).
const PAYMENTINFO_ALLOWLIST = ['method', 'brand', 'last4'] as const;

function sanitizePaymentInfo(paymentInfo: any): Record<string, any> {
    if (!paymentInfo || typeof paymentInfo !== 'object' || Array.isArray(paymentInfo)) {
        return {};
    }
    const result: Record<string, any> = {};
    for (const key of PAYMENTINFO_ALLOWLIST) {
        if (paymentInfo[key] !== undefined) {
            result[key] = paymentInfo[key];
        }
    }
    return result;
}

// [GAP-3 A-11] Detect a unique-constraint violation across engines.
// Returns true for SQLITE_CONSTRAINT_UNIQUE, Postgres 23505, and
// MySQL ER_DUP_ENTRY (1062). Also matches the human-readable fallback
// because some Strapi error wrappers strip the `code` field.
export function isUniqueConstraintViolation(err: any): boolean {
    if (!err) return false;
    const code = (err as any).code || (err as any).errno;
    const message = typeof (err as any).message === 'string' ? (err as any).message : '';
    if (
        code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
        code === 23505 ||
        code === 'ER_DUP_ENTRY' ||
        code === 1062
    ) {
        return true;
    }
    return (
        message.includes('UNIQUE constraint failed') ||
        message.includes('duplicate key value') ||
        message.includes('orders_order_id_unique') ||
        message.includes('orders_payment_intent_id_unique')
    );
}

function validateRequired(payload: any, traceId: string): void {
    if (!payload?.userId) {
        throw new UpsertBadRequestError('userId is required', traceId);
    }
    if (!payload?.paymentIntentId || typeof payload.paymentIntentId !== 'string') {
        throw new UpsertBadRequestError('paymentIntentId is required', traceId);
    }
    if (!Array.isArray(payload?.items)) {
        throw new UpsertBadRequestError('items must be an array', traceId);
    }
    if (typeof payload?.subtotal !== 'number' || Number.isNaN(payload.subtotal)) {
        throw new UpsertBadRequestError('subtotal must be a number', traceId);
    }
    if (typeof payload?.shipping !== 'number' || Number.isNaN(payload.shipping)) {
        throw new UpsertBadRequestError('shipping must be a number', traceId);
    }
}

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [GAP-3] Atomic UPSERT by `orderId`.
     *
     * @param orderId      unique client-supplied order id (path param)
     * @param payload      `{ userId, paymentIntentId, items[], subtotal, shipping, paymentInfo?{method,brand,last4} }`
     * @param authUserId   authenticated user id (sole identity authority per A-10)
     * @param traceId      X-Trace-Id (inbound header or generated)
     * @returns updated or inserted Order document
     */
    async upsertOrderByOrderId(
        orderId: string,
        payload: any,
        authUserId: number | string,
        traceId: string,
    ) {
        // [GAP-3] Input validation — fail-closed, no 500 on client input.
        if (!orderId || typeof orderId !== 'string') {
            throw new UpsertBadRequestError('orderId is required', traceId);
        }
        validateRequired(payload, traceId);

        // [GAP-3 A-10] Identity authority: payload userId must equal auth.
        // Catches acting-as-another-user before we ever open a transaction.
        if (Number(payload.userId) !== Number(authUserId)) {
            strapi.log.warn(
                `[GAP-3] upsertByOrderId userId mismatch payload=${payload.userId} ` +
                `auth=${authUserId} orderId=${orderId} traceId=${traceId}`,
            );
            throw new UpsertForbiddenError(
                'userId does not match authenticated user',
                traceId,
            );
        }

        const sanitizedPaymentInfo = sanitizePaymentInfo(payload.paymentInfo);

        // [GAP-3 A-11] Bounded unique-retry (R-COU-9). The trx envelope
        // is re-entered up to MAX_UNIQUE_RETRIES times on a unique
        // constraint violation. The retry's findFirst sees the winner's
        // committed row and converges to the enrich path. NEVER loops
        // — if a second violation surfaces, we propagate as 409 to
        // protect against pathological writers.
        const MAX_UNIQUE_RETRIES = 1;
        let attempt = 0;

        while (true) {
            try {
                return await this._runUpsertTransaction(
                    orderId,
                    payload,
                    authUserId,
                    traceId,
                    sanitizedPaymentInfo,
                );
            } catch (err: any) {
                if (isUniqueConstraintViolation(err) && attempt < MAX_UNIQUE_RETRIES) {
                    attempt++;
                    strapi.log.warn(
                        `[GAP-3] upsertByOrderId unique-violation, bounded retry ${attempt}/${MAX_UNIQUE_RETRIES} ` +
                        `orderId=${orderId} traceId=${traceId}`,
                    );
                    continue;
                }
                // Second unique violation or non-recoverable constraint:
                // surface as 409 with traceId. The controller maps
                // UpsertUniqueExhaustedError to the same Strapi envelope
                // as UpsertConflictError, but keeps the distinct name
                // for ops grep + metrics.
                if (isUniqueConstraintViolation(err)) {
                    strapi.log.error(
                        `[GAP-3] upsertByOrderId unique-violation exhausted retries ` +
                        `orderId=${orderId} traceId=${traceId} attempts=${attempt + 1}`,
                    );
                    throw new UpsertUniqueExhaustedError(
                        'Concurrent write lost on orderId/paymentIntentId; please retry',
                        traceId,
                    );
                }
                // Non-unique error: surface as-is (UpsertConflictError →
                // 409; anything else → 500 via controller).
                throw err;
            }
        }
    },

    /**
     * [GAP-3 A-11] Internal: single trx envelope. Extracted so the
     * bounded-retry loop in `upsertOrderByOrderId` can re-enter on a
     * unique-violation abort. Each iteration opens a fresh trx; the
     * previous one is rolled back by `strapi.db.transaction` on throw.
     */
    async _runUpsertTransaction(
        orderId: string,
        payload: any,
        authUserId: number | string,
        traceId: string,
        sanitizedPaymentInfo: Record<string, any>,
    ) {
        // [GAP-3 A-2] Transactional envelope. Document Service calls inside
        // join the ambient trx (verified at stripe-webhook.ts:136 and
        // services/order.ts:112 via the @strapi/database ALS hook).
        return strapi.db.transaction(async () => {
            // [GAP-3] Find existing by orderId (unique). A-3 ownership and
            // A-4 status gate happen BEFORE any write so a rejected
            // request never mutates the row. `populate: ['user']` is
            // required for the ownership check — without it, `existing.user`
            // is just a relation id and the equality check below cannot
            // compare it to the auth user id.
            const existing: any = await strapi.documents('api::order.order').findFirst({
                filters: { orderId } as any,
                populate: ['user'] as any,
            });

            if (existing) {
                // [GAP-3 A-3 / A-10] Ownership: row's user must equal auth user.
                if (
                    existing.user?.id !== Number(authUserId) &&
                    Number(existing.user?.id) !== Number(authUserId)
                ) {
                    strapi.log.warn(
                        `[GAP-3] upsertByOrderId row ownership mismatch ` +
                        `authUser=${authUserId} rowUser=${existing.user?.id} ` +
                        `orderId=${orderId} traceId=${traceId}`,
                    );
                    throw new UpsertForbiddenError(
                        'You can only modify your own orders',
                        traceId,
                    );
                }

                // [GAP-3 A-10] paymentIntentId is authoritative — never overwritten.
                if (existing.paymentIntentId !== payload.paymentIntentId) {
                    strapi.log.warn(
                        `[GAP-3] upsertByOrderId paymentIntentId mismatch ` +
                        `payload=${payload.paymentIntentId} row=${existing.paymentIntentId} ` +
                        `orderId=${orderId} traceId=${traceId}`,
                    );
                    throw new UpsertConflictError(
                        'paymentIntentId does not match existing order',
                        traceId,
                    );
                }

                const status = existing.orderStatus;

                // [GAP-3 A-4 / D4] Terminal statuses — 409 zero-mutation.
                if (TERMINAL_STATUSES.includes(status)) {
                    strapi.log.info(
                        `[GAP-3] upsertByOrderId terminal status=${status} ` +
                        `orderId=${orderId} traceId=${traceId} action=reject`,
                    );
                    throw new UpsertConflictError(
                        `Order is in terminal status: ${status}`,
                        traceId,
                    );
                }

                // [GAP-3 A-4] Unlisted statuses — fail closed (R-COU-8 spirit).
                if (!ENRICHABLE_STATUSES.includes(status)) {
                    strapi.log.warn(
                        `[GAP-3] upsertByOrderId unlisted status=${status} ` +
                        `orderId=${orderId} traceId=${traceId} action=reject`,
                    );
                    throw new UpsertConflictError(
                        `Order status ${status} cannot be modified via upsert`,
                        traceId,
                    );
                }

                // [GAP-3 A-5] Shallow-merge sanitized client paymentInfo
                // over existing. Server-owned keys (`source`,
                // `paymentError`) survive by being on the LEFT of the spread.
                const mergedPaymentInfo = {
                    ...((existing as any).paymentInfo || {}),
                    ...sanitizedPaymentInfo,
                };

                // [GAP-3 A-13] Build update payload WITHOUT `orderStatus`
                // — status is preserved by construction. The lifecycle at
                // lifecycles.ts:297-378 fires the CAS stock decrement
                // exactly once when items are present and stockDeducted=false.
                const updateData: any = {
                    items: payload.items,
                    subtotal: payload.subtotal,
                    shipping: payload.shipping,
                    paymentInfo: mergedPaymentInfo,
                };

                // [GAP-3 A-4] `pending` rows have no webhook payment
                // authority yet, so we recompute `total` server-side.
                // `paid` and `payment_failed` totals are webhook-set and
                // preserved by not writing them.
                if (status === 'pending') {
                    updateData.total = payload.subtotal + payload.shipping;
                }

                strapi.log.info(
                    `[GAP-3] upsertByOrderId enrich orderId=${orderId} ` +
                    `status=${status} traceId=${traceId} action=update`,
                );

                const updated = await strapi.documents('api::order.order').update({
                    documentId: existing.documentId,
                    data: updateData,
                });
                return updated;
            }

            // [GAP-3 D5 / R-COU-5] No existing Order → INSERT pending.
            // Webhook remains authoritative for paid/failed transitions;
            // this row will be enriched by the next PUT (R-COU-10 idempotent
            // retry) or transitioned by the webhook if/when it arrives.
            const total = payload.subtotal + payload.shipping;
            strapi.log.info(
                `[GAP-3] upsertByOrderId INSERT pending orderId=${orderId} ` +
                `authUser=${authUserId} traceId=${traceId} action=insert`,
            );

            const created = await strapi.documents('api::order.order').create({
                data: {
                    orderId,
                    paymentIntentId: payload.paymentIntentId,
                    // [GAP-3 A-10] INSERT always connects auth user, never raw payload.
                    user: { connect: [authUserId] } as any,
                    orderStatus: 'pending',
                    items: payload.items,
                    subtotal: payload.subtotal,
                    shipping: payload.shipping,
                    total,
                    paymentInfo: sanitizedPaymentInfo,
                } as any,
            });
            return created;
        });
    },
}));
