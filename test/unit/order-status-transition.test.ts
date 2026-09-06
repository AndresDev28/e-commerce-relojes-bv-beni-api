/**
 * [GAP-1 PR1+2] Pure-domain transition matrix for `payment_failed`.
 *
 * Spec refs:
 *   - R-PFS-2 (allowed + forbidden transitions)
 *   - S-PFS-2 (retry → pending)
 *   - S-PFS-3 (cancel after failure)
 *   - S-PFS-4 (direct recovery rejected)
 *   - R-PFS-7 (stock contract: payment_failed ⇒ no decrement)
 *
 * These are pure-domain tests (no Strapi boot, no DB). They import the
 * `validateOrderTransition` function directly so that the matrix
 * behavior is asserted independently of any schema migration noise.
 *
 * RED expectations (locked by the task):
 *   - `pending → payment_failed` MUST be valid.
 *   - `payment_failed → pending` MUST be valid (retry succeeded).
 *   - `payment_failed → cancelled` MUST be valid (user abandons).
 *   - `payment_failed → paid` MUST be rejected.
 *   - `payment_failed → processing | shipped | delivered | refunded` MUST be rejected.
 *   - `paid → payment_failed` MUST be rejected per R-PFS-2 (no direct
 *     recovery — the `paid → payment_failed` edge for stock depletion
 *     is added in PR3 via D-DESIGN-5 with a documented exception,
 *     so it stays rejected here).
 *
 * The matrix wiring ships in T-PR1+2-7 (GREEN); until then, the
 * `pending → payment_failed` and `payment_failed → pending | cancelled`
 * assertions fail, locking the matrix before the implementation.
 */

import { describe, it, expect } from 'vitest';
import {
    validateOrderTransition,
    getValidNextStatuses,
    isTerminalStatus,
    type OrderStatus,
} from '../../src/core/domain/order/order.types';

describe('[GAP-1 PR1+2] payment_failed transition matrix (pure domain)', () => {
    describe('allowed transitions', () => {
        it('[VT-PF-1] allows pending → payment_failed', () => {
            const result = validateOrderTransition('pending', 'payment_failed');
            expect(result.valid).toBe(true);
        });

        it('[VT-PF-2] allows payment_failed → pending (retry succeeded)', () => {
            const result = validateOrderTransition('payment_failed', 'pending');
            expect(result.valid).toBe(true);
        });

        it('[VT-PF-3] allows payment_failed → cancelled (user abandons after failure)', () => {
            const result = validateOrderTransition('payment_failed', 'cancelled');
            expect(result.valid).toBe(true);
        });
    });

    describe('forbidden transitions', () => {
        it('[VT-PF-4] rejects payment_failed → paid (no direct recovery)', () => {
            const result = validateOrderTransition('payment_failed', 'paid');
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
        });

        it.each([
            ['processing'],
            ['shipped'],
            ['delivered'],
            ['refunded'],
        ] as const)(
            '[VT-PF-5] rejects payment_failed → %s (no bypass)',
            (target) => {
                const result = validateOrderTransition(
                    'payment_failed',
                    target as OrderStatus
                );
                expect(result.valid).toBe(false);
            }
        );

        it('[VT-PF-6] rejects paid → payment_failed per R-PFS-2 (no direct recovery)', () => {
            // R-PFS-2 explicitly forbids `payment_failed → paid` AND forbids
            // recovery from `paid` into `payment_failed`. The stock-depletion
            // edge `paid → payment_failed` is a separate concern (D-DESIGN-5,
            // S-OSA-6) introduced in PR3 — it must NOT be present here.
            const result = validateOrderTransition('paid', 'payment_failed');
            expect(result.valid).toBe(false);
        });
    });

    describe('matrix surface', () => {
        it('[VT-PF-7] payment_failed is NOT terminal (must have at least one valid target)', () => {
            // If the matrix incorrectly classifies payment_failed as terminal,
            // S-PFS-3 (cancel-after-failure) and S-PFS-2 (retry-to-pending) would
            // silently break. The function reports "terminal" via empty targets.
            expect(isTerminalStatus('payment_failed')).toBe(false);
            const targets = getValidNextStatuses('payment_failed');
            expect(targets.length).toBeGreaterThan(0);
        });
    });
});
