/**
 * Order Status Transition Validation Helper
 * [ORD-32] Implementar lógica de validación de transiciones
 *
 * This helper provides business logic validation for order status transitions.
 * It ensures that orders follow the correct lifecycle and prevents invalid state changes.
 */

export type OrderStatus = 
  | 'pending'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

/**
 * Valid status transitions for each order status.
 *
 * Rules:
 * - Normal flow: pending → paid → processing → shipped → delivered
 * - Terminal states: delivered, cancelled, refunded cannot be changed
 * - Cancellation/refund: Can transition to cancelled/refunded from any active state
 *
 * Active states: pending, paid, processing, shipped
 * Terminal states: delivered, cancelled, refunded
 */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled', 'refunded'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'cancelled', 'refunded'],
  delivered: [], 
  cancelled: [], 
  refunded: [], 
}

/**
 * Validates whether an order status transition is valid.
 *
 * @param from - Current order status
 * @param to - Target order status
 * @returns Validation result with status and optional error message
 *
 * @example
 * ```typescript
 * const result = validateOrderTransition('pending', 'paid');
 * // Returns: { valid: true }
 *
 * const result = validateOrderTransition('delivered', 'pending');
 * // Returns: { valid: false, error: 'Cannot change status from "delivered" to "pending". State "delivered" is terminal.' }
 * ```
 */
export function validateOrderTransition(
  from: OrderStatus,
  to: OrderStatus
): { valid: boolean; error?: string } {
  const validationErrorPrefix = '[ORD-32] Invalid status transition'

  if (from === to) {
    return {
      valid: true,
      error: undefined
    }
  }

  const validTargets = VALID_TRANSITIONS[from]

  if (!validTargets) {
    return {
      valid: false,
      error: `Unknown order status: "${from}"`
    }
  }

  if (validTargets.length === 0) {
    return {
      valid: false,
      error: `Cannot change status from "${from}" to "${to}". State "${from}" is terminal.`
    }
  }

  if (!validTargets.includes(to)) {
    return {
      valid: false,
      error: `Invalid status transition from "${from}" to "${to}". Valid transitions: ${validTargets.map(s => `"${s}"`).join(', ')}`
    }
  }

  return {
    valid: true,
    error: undefined
  }
}

/**
 * Gets all valid next statuses for a given current status.
 *
 * @param from - Current order status
 * @returns Array of valid next statuses (empty if terminal state)
 *
 * @example
 * ```typescript
 * const nextStatuses = getValidNextStatuses('pending');
 * // Returns: ['paid', 'cancelled', 'refunded']
 *
 * const nextStatuses = getValidNextStatuses('delivered');
 * // Returns: []
 * ```
 */
export function getValidNextStatuses(from: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[from] || []
}

/**
 * Checks if a status is a terminal state (cannot be changed).
 *
 * @param status - Order status to check
 * @returns true if terminal, false otherwise
 *
 * @example
 * ```typescript
 * isTerminalStatus('delivered'); // true
 * isTerminalStatus('pending'); // false
 * ```
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0
}

/**
 * Checks if a status is an active state (can be changed).
 *
 * @param status - Order status to check
 * @returns true if active, false otherwise
 *
 * @example
 * ```typescript
 * isActiveStatus('pending'); // true
 * isActiveStatus('delivered'); // false
 * ```
 */
export function isActiveStatus(status: OrderStatus): boolean {
  return !isTerminalStatus(status)
}
