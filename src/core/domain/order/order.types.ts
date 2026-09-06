/**
 * Core Domain: Order
 * [ARCH-02] Pragmatic Screaming Architecture
 * 
 * This file contains pure TypeScript business boundaries, types, and logic for Orders,
 * independent of the Strapi infrastructure layer.
 */

// -----------------------------------------------------------------------------
// ENUMS & TYPES
// -----------------------------------------------------------------------------

export type OrderStatus =
    | 'pending'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'refunded'
    | 'cancellation_requested'
    | 'payment_failed';

export interface RefundPayload {
    paymentIntentId: string;
    amount: number;
    orderId: string;
}

export interface WebhookEmailPayload {
    orderId: string;
    customerEmail: string;
    customerName: string;
    orderStatus: OrderStatus;
    previousOrderStatus: OrderStatus | null;
    statusChangeNote: string | null;
    orderData: {
        items: any[];
        subtotal: number;
        shipping: number;
        total: number;
        createdAt: string | Date;
    };
}

// -----------------------------------------------------------------------------
// BUSINESS LOGIC: STATUS TRANSITIONS
// -----------------------------------------------------------------------------

/**
 * Valid status transitions for each order status.
 *
 * Rules:
 * - Normal flow: pending → paid → processing → shipped → delivered
 * - Terminal states: cancelled, refunded cannot be changed
 * - Delivered can revert to processing if shipment fails (SHIP-03)
 * - Cancellation/refund: Can transition to cancelled/refunded from any active state
 * - Cancellation request: Customer can request cancellation from pending, paid, or processing
 *
 * Active states: pending, paid, processing, shipped, cancellation_requested, delivered
 * Terminal states: cancelled, refunded
 *
 * [GAP-1 PR1+2 T-PR1+2-7] Lock the payment_failed matrix per R-PFS-2:
 *   - `pending → payment_failed` (failure while pending)
 *   - `payment_failed → pending` (retry succeeded; webhook or manual)
 *   - `payment_failed → cancelled` (user abandons after failure)
 *   - direct recovery (`payment_failed → paid`, `payment_failed → processing|...|refunded`) is forbidden.
 *
 * [GAP-1 PR3 T-PR3-7] Add the S-OSA-6 stock-depletion exception:
 *   - `paid → payment_failed` is triggered ONLY by the webhook
 *     enrichment gate when a paid shell (or paid order) cannot have its
 *     stock claimed because the product is depleted between Order
 *     creation and the inventory UPSERT. This is a documented D-DESIGN-5
 *     exception to the R-PFS-2 "no direct recovery" rule. The transition
 *     MUST NOT be reachable from any user-driven controller — it's only
 *     fired from `services/order.ts:enrichShellWithItems` /
 *     `lifecycles.ts:afterUpdate` enrichment gate. Manual refunds (via
 *     Stripe dashboard) follow up.
 *
 * [GAP-1 PR4b T-PR4b-3] Add the cancellation→payment_failed edge:
 *   - `cancellation_requested → payment_failed` is now allowed because a
 *     realistic scenario is: customer requested cancellation, but the
 *     Stripe charge failed in parallel. The webhook arrives after the
 *     cancel request, and the Order is in `cancellation_requested`. We
 *     honor the payment outcome over the cancel-request intent: the
 *     Order moves to `payment_failed` (user-friendly: "your payment was
 *     declined, please retry") rather than completing the cancellation
 *     or staying in a request state. R-PFS-2 does NOT forbid this edge
 *     (it lists the MUST-allow edges as a minimum, not an exhaustive
 *     enumeration). The handler treats `pending | cancellation_requested`
 *     symmetrically.
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: [
        'paid',
        'cancelled',
        'refunded',
        'cancellation_requested',
        'payment_failed',
    ],
    paid: ['processing', 'cancelled', 'refunded', 'cancellation_requested', 'payment_failed'],
    processing: ['shipped', 'cancelled', 'refunded', 'cancellation_requested'],
    cancellation_requested: ['cancelled', 'refunded', 'processing', 'payment_failed'],
    shipped: ['delivered', 'cancelled', 'refunded', 'processing'],
    delivered: ['processing'], // Allow revert if shipment fails after delivery
    cancelled: [],
    refunded: [],
    payment_failed: ['pending', 'cancelled'],
};

/**
 * Validates whether an order status transition is valid.
 * [ORD-32] Implementar lógica de validación de transiciones
 */
export function validateOrderTransition(
    from: OrderStatus,
    to: OrderStatus
): { valid: boolean; error?: string } {
    if (from === to) {
        return { valid: true };
    }

    const validTargets = VALID_TRANSITIONS[from];

    if (!validTargets) {
        return { valid: false, error: `Unknown order status: "${from}"` };
    }

    if (validTargets.length === 0) {
        return {
            valid: false,
            error: `Cannot change status from "${from}" to "${to}". State "${from}" is terminal.`,
        };
    }

    if (!validTargets.includes(to)) {
        return {
            valid: false,
            error: `Invalid status transition from "${from}" to "${to}". Valid transitions: ${validTargets
                .map((s) => `"${s}"`)
                .join(', ')}`,
        };
    }

    return { valid: true };
}

export function getValidNextStatuses(from: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[from] || [];
}

export function isTerminalStatus(status: OrderStatus): boolean {
    return VALID_TRANSITIONS[status].length === 0;
}

export function isActiveStatus(status: OrderStatus): boolean {
    return !isTerminalStatus(status);
}
