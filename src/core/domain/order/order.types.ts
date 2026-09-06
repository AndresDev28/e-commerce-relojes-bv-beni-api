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
 *   - `paid → payment_failed` is also forbidden (R-PFS-2: no direct
 *     recovery). The stock-depletion edge for S-OSA-6 is added later in
 *     PR3 via D-DESIGN-5 with a documented exception.
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: [
        'paid',
        'cancelled',
        'refunded',
        'cancellation_requested',
        'payment_failed',
    ],
    paid: ['processing', 'cancelled', 'refunded', 'cancellation_requested'],
    processing: ['shipped', 'cancelled', 'refunded', 'cancellation_requested'],
    cancellation_requested: ['cancelled', 'refunded', 'processing'],
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
