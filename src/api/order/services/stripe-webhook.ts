/**
 * Stripe Webhook Service
 * [ARCH-02] Extracted from order controller
 * [GAP-1 PR4a] Dispatcher with transactional ledger-first processing
 * (D-DESIGN-1). Every handled event runs inside a `strapi.db.transaction`
 * so the `webhook_events` ledger row, the Order write, and any stock
 * decrement all commit/rollback together. Network side effects (email)
 * are deferred via `onCommit` to ensure they fire only after a successful
 * commit. The legacy `charge.refunded` branch is preserved byte-identical
 * (D-DESIGN-11 / Decision 11) and stays outside the transactional path
 * because it predates the ledger contract.
 *
 * [GAP-1 PR4b T-PR4b-6] Dispatch summary (event → behavior):
 *
 *   - `charge.refunded`:
 *       Legacy Entity Service branch. Looks up Order by paymentIntentId.
 *       Terminal guard: if the Order is `payment_failed`, return 200
 *       without transitioning (R-PFS-2 forbids `payment_failed → refunded`;
 *       a transition attempt would 4xx-loop). Otherwise transitions to
 *       `refunded` (existing behavior, D-DESIGN-11).
 *
 *   - `payment_intent.succeeded`:
 *       Document Service reconciliation. Correlation: orderId → paymentIntentId.
 *       No Order → D+ shell (`orderStatus: paid`, `items: []`,
 *       `paymentInfo.source: webhook_reconciliation`).
 *       Order `paid` → ack 200 (idempotent re-delivery).
 *       Order `pending` → transition to `paid`; afterUpdate enrichment
 *       gate decrements stock exactly once via `decrementStockOnce`.
 *       Order in `[processing, shipped, delivered, cancelled, refunded,
 *       payment_failed]` → warn + ack 200 (no transition; late event).
 *       Missing metadata + no Order → warn + ack 200 (R-SW-6).
 *
 *   - `payment_intent.payment_failed`:
 *       Document Service reconciliation. Correlation: orderId → paymentIntentId.
 *       No Order → warn + ack 200 (R-SW-5 / S-SW-5).
 *       Terminal `cancelled | refunded` → ack 200 (no transition).
 *       Already `payment_failed` → ack 200 (idempotent).
 *       Non-transitionable `paid | processing | shipped | delivered`
 *         → warn + ack 200 (no transition; matrix rejects the edge).
 *       `pending | cancellation_requested` → transition to `payment_failed`
 *         with redacted `paymentInfo.paymentError = { code,
 *         failure_message }` only; status history + email fire via
 *         afterUpdate (R-PFS-6, D-DESIGN-7).
 *
 *   - Unhandled event types:
 *       Ack 200, no side effects (R-SW-2).
 *
 *   - Operational toggle:
 *       The `STRIPE_PI_WEBHOOKS_ENABLED` env var (set at deploy time) is
 *       the kill-switch for `payment_intent.*` dispatch. PR4b does NOT
 *       add or modify that switch — it's an ops concern at deploy time
 *       and must default to `false` until the frontend Gap #3 UPSERT PR
 *       lands. See `openspec/changes/sprint-5-stripe-webhook/proposal.md`
 *       for the sequenced rollout.
 */

import { factories } from '@strapi/strapi';
import Stripe from 'stripe';

export default factories.createCoreService('api::order.order', ({ strapi }) => ({
    /**
     * [REF-10] Top-level Stripe webhook entry point. Verifies the signature,
     * then dispatches to the per-event-type handler.
     */
    async handleStripeWebhook(signature: string, unparsedBody: any) {
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!endpointSecret) {
            const msg = '[REF-10] STRIPE_WEBHOOK_SECRET is not configured';
            strapi.log.error(msg);
            throw new Error(msg);
        }

        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            const msg = '[REF-10] STRIPE_SECRET_KEY is not configured';
            strapi.log.error(msg);
            throw new Error(msg);
        }

        const stripe = new Stripe(secretKey, {
            apiVersion: '2026-01-28.clover' as any,
        });

        let event: Stripe.Event;

        try {
            if (!unparsedBody) {
                throw new Error('Missing raw body');
            }

            event = stripe.webhooks.constructEvent(unparsedBody, signature, endpointSecret);
        } catch (err: any) {
            strapi.log.error(`[REF-10] Webhook signature verification failed: ${err.message}`);
            throw new Error(`Webhook signature verification failed.`);
        }

        strapi.log.info(`[REF-10] Stripe webhook received: ${event.type}`);

        return this.dispatch(event);
    },

    /**
     * [GAP-1 PR4a T-PR4a-3] Dispatch verified events by `event.type`.
     * Each handled branch is wrapped in `strapi.db.transaction({ trx,
     * onCommit })` so the ledger row, the Order write, and any stock
     * decrement all commit/rollback together (R-SW-9).
     *
     * The `charge.refunded` branch (Decision 11) keeps its Entity Service
     * code path because it predates the ledger contract and is not
     * migrated in PR4a. Unknown event types are acknowledged with
     * `{ received: true }` and produce no ledger row.
     */
    async dispatch(event: Stripe.Event) {
        if (event.type === 'charge.refunded') {
            // Legacy branch — outside the transactional path. S-SW-10.
            return this.handleChargeRefunded(event);
        }

        // Extract correlation fields from the event payload for the
        // ledger row (D-DESIGN-3). `paymentIntentId` is on the
        // PaymentIntent; `orderId` lives in metadata; for charge-style
        // events it falls through to nulls.
        const obj: any = event.data?.object || {};
        const paymentIntentId =
            typeof obj.id === 'string' && event.type.startsWith('payment_intent')
                ? obj.id
                : null;
        const orderIdFromMetadata =
            (obj.metadata && (obj.metadata as any).orderId) || null;

        // [GAP-1 PR4a T-PR4a-3] Ledger-first transactional envelope.
        // The unique `eventId` violation is the detection path for
        // duplicate deliveries (R-SW-3 / S-SW-9); on violation we
        // commit the existing row and ack without side effects.
        return strapi.db.transaction(async ({ trx, onCommit }) => {
            // 1. Insert the ledger row first. Catch the unique violation.
            try {
                await strapi.documents('api::webhook-event.webhook-event').create({
                    data: {
                        eventId: event.id,
                        eventType: event.type,
                        paymentIntentId: paymentIntentId || undefined,
                        orderId: orderIdFromMetadata || undefined,
                        processedAt: new Date().toISOString(),
                        outcome: 'processed',
                    } as any,
                });
            } catch (ledgerErr: any) {
                const msg = String(ledgerErr?.message || ledgerErr);
                const isUniqueViolation =
                    msg.includes('unique') ||
                    msg.includes('duplicate') ||
                    msg.includes('SQLITE_CONSTRAINT_UNIQUE') ||
                    msg.includes('23505');
                if (isUniqueViolation) {
                    strapi.log.info(`[GAP-1] Duplicate webhook event.id=${event.id} — ack 200`);
                    return { received: true };
                }
                throw ledgerErr;
            }

            // 2. Dispatch to the per-event handler. Each handler is
            //    responsible for its own correlation / Order writes.
            //    Helpers auto-join the ambient transaction via
            //    `transactionContext.transactionCtx.get()`.
            switch (event.type) {
                case 'payment_intent.succeeded':
                    return this.handlePaymentIntentSucceeded(event, { trx, onCommit });
                case 'payment_intent.payment_failed':
                    return this.handlePaymentIntentPaymentFailed(event, { trx, onCommit });
                default:
                    strapi.log.debug(`[REF-10] Unhandled webhook event type: ${event.type}`);
                    return { received: true };
            }
        }) as any;
    },

    /**
     * [REF-10] Legacy `charge.refunded` branch — preserved byte-identical
     * per D-DESIGN-11 / Decision 11. Stays on Entity Service.
     *
     * [GAP-1 PR4b T-PR4b-5] Terminal guard: when the matched Order is in
     * `payment_failed`, the unconditional transition to `refunded` would
     * be REJECTED by `beforeUpdate`'s `validateOrderTransition` (R-PFS-2
     * — `payment_failed → refunded` is forbidden) and surface as a
     * 4xx/5xx error. Stripe would then retry the webhook indefinitely,
     * creating a 5xx-storm. To break the loop, warn and ack 200 without
     * attempting the transition. Manual Stripe dashboard refund of a
     * `payment_failed` Order is the supported operator path (D-DESIGN-7
     * — no auto-refund).
     */
    async handleChargeRefunded(event: Stripe.Event) {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

        if (!paymentIntentId) {
            strapi.log.warn('[REF-10] charge.refunded received without a payment_intent ID');
            return { received: true };
        }

        try {
            const orders = await strapi.entityService.findMany('api::order.order', {
                filters: { paymentIntentId: paymentIntentId },
            }) as any[];

            if (!orders || orders.length === 0) {
                strapi.log.warn(`[REF-10] Webhook: No order found for paymentIntent ${paymentIntentId}`);
                return { received: true };
            }

            const order = orders[0];

            if (order.orderStatus === 'refunded') {
                strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} is already refunded. Ignoring.`);
                return { received: true };
            }

            // [GAP-1 PR4b T-PR4b-5] Terminal guard — `payment_failed`
            // Orders cannot be transitioned to `refunded` (R-PFS-2).
            // The legacy branch would otherwise throw `ApplicationError`
            // from `beforeUpdate`, creating a permanent 5xx retry loop
            // against the new transition matrix. Warn + ack 200 instead.
            if (order.orderStatus === 'payment_failed') {
                strapi.log.warn(
                    `[GAP-1] charge.refunded on payment_failed Order ${order.orderId} ` +
                    `(paymentIntentId=${paymentIntentId}), skipping transition. ` +
                    `Manual refund via Stripe dashboard required.`
                );
                return { received: true };
            }

            await strapi.entityService.update('api::order.order', order.id, {
                data: {
                    orderStatus: 'refunded',
                    statusChangeNote: 'Automated refund confirmation via Stripe webhook',
                },
            });

            strapi.log.info(`[REF-10] Webhook: Order ${order.orderId} successfully marked as refunded.`);
        } catch (error) {
            strapi.log.error(`[REF-10] Webhook: Error processing charge.refunded for payment intent ${paymentIntentId}:`, error);
            throw new Error('Error processing webhook event');
        }

        return { received: true };
    },

    /**
     * [GAP-1 PR4a T-PR4a-5 / T-PR4a-7] `payment_intent.succeeded` reconciliation.
     *
     * Two arrival orders are wired here:
     *   - **client-first pending Order** (T-PR4a-5): transition pending →
     *     paid; the PR3 enrichment gate in `afterUpdate` decrements stock
     *     exactly once (CAS on `stockDeducted`) and writes the status
     *     history entry. Status guard covers paid re-delivery and
     *     late-state (processing|shipped|...) warns.
     *   - **D+ shell Order** (T-PR4a-7): if no Order matches the
     *     correlation, create a paid shell (`items: []`,
     *     `paymentInfo.source: 'webhook_reconciliation'`) via the full
     *     Document Service lifecycle. Enrichment by the frontend UPSERT
     *     (Gap #3) lands later and triggers the same enrichment gate.
     *
     * Missing metadata fallback (R-SW-6 / S-SW-7): if no Order matches
     * `metadata.orderId` or `paymentIntentId`, warn and ack 200 — never
     * NACK a Stripe webhook that has no Order (would cause retry storms).
     *
     * This handler runs INSIDE the `strapi.db.transaction({ trx, onCommit })`
     * envelope opened by `dispatch`. All Document Service / Entity Service
     * calls here join that ambient transaction automatically.
     */
    async handlePaymentIntentSucceeded(
        event: Stripe.Event,
        ctx?: { trx?: any; onCommit?: any }
    ) {
        const intent = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = intent.id;
        const orderIdFromMetadata = (intent.metadata && (intent.metadata as any).orderId) || null;
        const userIdFromMetadata = (intent.metadata && (intent.metadata as any).userId) || null;
        const amount = typeof intent.amount === 'number' ? intent.amount : 0;

        strapi.log.info(
            `[GAP-1] payment_intent.succeeded paymentIntentId=${paymentIntentId} ` +
            `orderId=${orderIdFromMetadata} userId=${userIdFromMetadata} amount=${amount}`
        );

        // [GAP-1 PR4a R-SW-4 / D-DESIGN-4] Correlation: orderId (unique) → paymentIntentId.
        let order: any = null;

        if (orderIdFromMetadata) {
            try {
                order = await strapi.documents('api::order.order').findFirst({
                    filters: { orderId: orderIdFromMetadata } as any,
                });
            } catch (findErr) {
                strapi.log.warn(`[GAP-1] findFirst by orderId failed: ${(findErr as any).message}`);
            }
        }

        if (!order && paymentIntentId) {
            try {
                order = await strapi.documents('api::order.order').findFirst({
                    filters: { paymentIntentId } as any,
                });
            } catch (findErr) {
                strapi.log.warn(`[GAP-1] findFirst by paymentIntentId failed: ${(findErr as any).message}`);
            }
        }

        if (order) {
            // R-SW-4 outcomes for known Order.
            if (order.orderStatus === 'paid') {
                strapi.log.info(`[GAP-1] Order ${order.orderId} already paid (re-delivery), ack 200`);
                return { received: true };
            }

            if (order.orderStatus === 'pending') {
                strapi.log.info(
                    `[GAP-1] Transitioning pending Order ${order.orderId} → paid via webhook`
                );
                // [GAP-1 PR4a D-DESIGN-4] Document Service update by
                // documentId triggers beforeUpdate (transition validation)
                // and afterUpdate (enrichment gate + status history + email).
                await strapi.documents('api::order.order').update({
                    documentId: order.documentId,
                    data: { orderStatus: 'paid' } as any,
                });
                return { received: true };
            }

            // Late event: S-SW-8.
            strapi.log.warn(
                `[GAP-1] Late succeeded event, orderStatus=${order.orderStatus} ` +
                `orderId=${order.orderId}`
            );
            return { received: true };
        }

        // No Order found → D+ shell creation path (T-PR4a-7).
        if (!orderIdFromMetadata || !userIdFromMetadata) {
            // R-SW-6 / S-SW-7: missing metadata fallback. Never NACK.
            strapi.log.warn(
                `[GAP-1] No metadata.orderId, paymentIntentId=${paymentIntentId}`
            );
            return { received: true };
        }

        strapi.log.info(
            `[GAP-1] Creating D+ shell for orderId=${orderIdFromMetadata} ` +
            `userId=${userIdFromMetadata} amount=${amount}`
        );

        // [GAP-1 PR4a D-DESIGN-6] Shell goes through the full Document
        // Service lifecycle (afterCreate records `null → paid` history
        // and fires the initial-purchase email exactly once; no stock
        // decrement because items are empty).
        try {
            await strapi.documents('api::order.order').create({
                data: {
                    orderId: orderIdFromMetadata,
                    paymentIntentId,
                    total: amount / 100,
                    subtotal: 0,
                    shipping: 0,
                    orderStatus: 'paid',
                    items: [],
                    paymentInfo: { source: 'webhook_reconciliation' },
                    user: { connect: [userIdFromMetadata] } as any,
                } as any,
            });
        } catch (shellErr: any) {
            // [GAP-1 PR4a T-PR4a-9] Graceful fallback when the shell
            // creation fails (e.g. userId doesn't resolve to a real
            // user, or the orderId already exists). Log a warning and
            // ack 200 — never NACK a Stripe webhook that already passed
            // signature verification.
            strapi.log.warn(
                `[GAP-1] Shell creation failed for orderId=${orderIdFromMetadata} ` +
                `userId=${userIdFromMetadata}: ${(shellErr as any).message || shellErr}. ` +
                `Ack 200 — operator must reconcile manually.`
            );
            // Update the ledger row to outcome=unmatched so ops can see
            // the unfulfilled event.
            try {
                await strapi.documents('api::webhook-event.webhook-event').update({
                    documentId: event.id,
                    data: {
                        outcome: 'unmatched',
                        errorMessage: `Shell creation failed: ${(shellErr as any).message || 'unknown'}`,
                    } as any,
                });
            } catch (_updateErr) {
                // Ledger update is best-effort; the original ledger row
                // still has outcome=processed.
            }
        }

        return { received: true };
    },

    /**
     * [GAP-1 PR4a T-PR4a-1] [GAP-1 PR4b T-PR4b-1] Stub → skeleton for
     * `payment_intent.payment_failed`. PR4a shipped a throws-stub so the
     * dispatcher wired in correctly and a missing implementation would
     * surface as a 500 (Stripe retry). PR4b replaces the throw with a
     * real skeleton that logs and delegates to `reconcilePaymentFailed`
     * — the redaction + transition logic lands in T-PR4b-3.
     *
     * Runs INSIDE the `strapi.db.transaction({ trx, onCommit })` envelope
     * opened by `dispatch`. All Document Service / Entity Service calls
     * join that ambient transaction automatically.
     */
    async handlePaymentIntentPaymentFailed(
        event: Stripe.Event,
        ctx?: { trx?: any; onCommit?: any }
    ) {
        strapi.log.info(`[GAP-1] payment_failed handler starting, event.id=${event.id}`);
        return this.reconcilePaymentFailed(event);
    },

    /**
     * [GAP-1 PR4b T-PR4b-1 / T-PR4b-3] Failed-payment reconciliation.
     *
     * Implements the SD-3 sequence diagram (design.md §2) and satisfies
     * R-SW-5, R-PFS-2, R-PFS-3, R-PFS-5, R-PFS-6, R-PFS-7.
     *
     * Flow:
     *   1. Extract `paymentIntentId`, `metadata.orderId`, `metadata.userId`
     *      from `event.data.object as Stripe.PaymentIntent`.
     *   2. Build the audit via `extractPaymentFailureAudit(paymentIntent)`
     *      then `redactPaymentError(...)` — ONLY `{ code, failure_message }`
     *      is persisted. Never store `decline_code`, `payment_method_details`,
     *      PAN, expiry, CVV, billing address (R-PFS-5 / S-PFS-5).
     *   3. Lookup the Order: first by `metadata.orderId`, then by
     *      `paymentIntentId` (same pattern as the succeeded handler).
     *   4. If Order not found → log `[GAP-1] payment_failed with no matching
     *      Order` warn, return `{ received: true }` (R-SW-5, S-SW-5).
     *   5. If Order terminal (`cancelled | refunded`) → ack 200,
     *      no transition (R-SW-5).
     *   6. If Order in non-transitionable status (`paid`, `processing`,
     *      `shipped`, `delivered`) → log `[GAP-1] payment_failed on
     *      non-transitionable Order, orderStatus=...` warn, ack 200.
     *   7. If Order in `pending | cancellation_requested` →
     *      `strapi.documents().update({ orderStatus: 'payment_failed',
     *      paymentInfo: { ...existing, paymentError: audit },
     *      statusChangeNote: 'Payment failed: <failure_message>' })`.
     *      `beforeUpdate` validates the transition per `VALID_TRANSITIONS`;
     *      `afterUpdate` creates the status history entry and sends the
     *      failure email with the note (R-PFS-6, D-DESIGN-7).
     *      Stock is NOT decremented (R-PFS-7 — payment never confirmed) and
     *      NO automatic refund / shipment / restoration fires (R-PFS-3).
     *   8. If Order is `payment_failed` (re-delivery) → ack 200, no
     *      transition (idempotent; the unique ledger row already blocked
     *      a true duplicate, but a `payment_failed → payment_failed`
     *      update would also no-op via the unchanged-status guard).
     *
     * Runs INSIDE the `strapi.db.transaction({ trx, onCommit })` envelope
     * opened by `dispatch`. All Document Service calls join that ambient
     * transaction automatically.
     */
    async reconcilePaymentFailed(event: Stripe.Event) {
        const intent = event.data.object as Stripe.PaymentIntent;
        const paymentIntentId = intent?.id;
        const orderIdFromMetadata = (intent?.metadata && (intent.metadata as any).orderId) || null;

        // [GAP-1 PR4b R-PFS-5] Build the redacted audit BEFORE any DB
        // lookup so we never accidentally persist a non-redacted payload.
        const audit = this.extractPaymentFailureAudit(intent);

        strapi.log.info(
            `[GAP-1] reconcilePaymentFailed event.id=${event.id} ` +
            `paymentIntentId=${paymentIntentId} orderId=${orderIdFromMetadata} ` +
            `code=${audit.code}`
        );

        // [GAP-1 PR4b R-SW-4 / D-DESIGN-4] Correlation: orderId (unique) → paymentIntentId.
        let order: any = null;

        if (orderIdFromMetadata) {
            try {
                order = await strapi.documents('api::order.order').findFirst({
                    filters: { orderId: orderIdFromMetadata } as any,
                });
            } catch (findErr) {
                strapi.log.warn(
                    `[GAP-1] reconcilePaymentFailed: findFirst by orderId failed: ` +
                    `${(findErr as any).message}`
                );
            }
        }

        if (!order && paymentIntentId) {
            try {
                order = await strapi.documents('api::order.order').findFirst({
                    filters: { paymentIntentId } as any,
                });
            } catch (findErr) {
                strapi.log.warn(
                    `[GAP-1] reconcilePaymentFailed: findFirst by paymentIntentId failed: ` +
                    `${(findErr as any).message}`
                );
            }
        }

        // R-SW-5 / S-SW-5: no Order → warn + ack.
        if (!order) {
            strapi.log.warn(
                `[GAP-1] payment_failed with no matching Order ` +
                `event.id=${event.id} paymentIntentId=${paymentIntentId} ` +
                `orderId=${orderIdFromMetadata}`
            );
            return { received: true };
        }

        const status = order.orderStatus;

        // R-SW-5: terminal states → ack 200, no transition.
        if (status === 'cancelled' || status === 'refunded') {
            strapi.log.info(
                `[GAP-1] payment_failed on terminal Order ${order.orderId} ` +
                `orderStatus=${status}, ack 200 (no transition)`
            );
            return { received: true };
        }

        // Already payment_failed (re-delivery or duplicate via the
        // status-shape match) → idempotent ack.
        if (status === 'payment_failed') {
            strapi.log.info(
                `[GAP-1] payment_failed on already-failed Order ${order.orderId}, ` +
                `ack 200 (idempotent)`
            );
            return { received: true };
        }

        // Non-transitionable from `payment_failed` per R-PFS-2 — but
        // here we're talking about the Order not being in a state that
        // can move TO `payment_failed`. Per VALID_TRANSITIONS only
        // `pending` and `cancellation_requested` can transition to
        // `payment_failed`; anything else (paid, processing, shipped,
        // delivered) is non-transitionable. Warn + ack to avoid a 500
        // retry storm.
        if (status !== 'pending' && status !== 'cancellation_requested') {
            strapi.log.warn(
                `[GAP-1] payment_failed on non-transitionable Order ` +
                `${order.orderId} orderStatus=${status}, ack 200 (no transition)`
            );
            return { received: true };
        }

        // Transition path: `pending | cancellation_requested → payment_failed`.
        const failureMessage = audit.failure_message;
        const statusChangeNote = `Payment failed: ${failureMessage}`;

        strapi.log.info(
            `[GAP-1] Transitioning ${status} Order ${order.orderId} → payment_failed ` +
            `via webhook (code=${audit.code})`
        );

        // [GAP-1 PR4b D-DESIGN-4] Document Service update by documentId
        // triggers `beforeUpdate` (transition validation) and `afterUpdate`
        // (status history + email with `statusChangeNote`).
        await strapi.documents('api::order.order').update({
            documentId: order.documentId,
            data: {
                orderStatus: 'payment_failed',
                statusChangeNote,
                paymentInfo: {
                    ...((order as any).paymentInfo || {}),
                    paymentError: audit,
                },
            } as any,
        });

        return { received: true };
    },

    /**
     * [GAP-1 PR4b T-PR4b-1] Extract a redacted failure audit from a
     * Stripe PaymentIntent's `last_payment_error`. Returns the safe
     * `{ code, failure_message }` shape via `redactPaymentError(...)`.
     */
    extractPaymentFailureAudit(paymentIntent: Stripe.PaymentIntent): { code: string; failure_message: string } {
        const raw = (paymentIntent as any)?.last_payment_error || null;
        return this.redactPaymentError(raw);
    },

    /**
     * [GAP-1 PR4b T-PR4b-1 / R-PFS-5 / S-PFS-5] Redact Stripe's raw
     * `last_payment_error` to a SAFE shape containing ONLY
     * `{ code, failure_message }`.
     *
     * MUST NEVER return `decline_code`, `payment_method_details`, PAN,
     * expiry, CVV, billing address, or any nested object. The strict
     * shape is enforced by T-TG-5 (redaction contract test) in T-PR4b-5.
     *
     * Inputs are coerced to strings when present and non-empty; any
     * missing or non-string field falls back to the safe default so
     * no sensitive shape can leak via `undefined`-key serialization.
     */
    redactPaymentError(raw: any): { code: string; failure_message: string } {
        // [GAP-1 PR4b T-PR4b-5 strict whitelist — implemented here in
        // T-PR4b-3 so the audit contract is enforced from the very
        // first transition. Whitelist only `code` and `message` (renamed
        // to `failure_message`). All other fields are dropped by
        // construction — we never read them, so they cannot leak.
        const code = typeof raw?.code === 'string' && raw.code.length > 0
            ? raw.code
            : 'unknown';
        const message = typeof raw?.message === 'string' && raw.message.length > 0
            ? raw.message
            : 'Unknown failure';

        return {
            code,
            failure_message: message,
        };
    },
}));
