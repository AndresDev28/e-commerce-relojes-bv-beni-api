/**
 * Custom routes for Order API
 */
export default {
    routes: [
        {
            method: 'POST',
            path: '/orders/stripe-webhook',
            handler: 'order.stripeWebhook',
            config: {
                auth: false,
            },
        },
        {
            method: 'POST',
            path: '/orders/:id/request-cancellation',
            handler: 'order.requestCancellation',
        },
        {
            // [GAP-3] Atomic UPSERT-by-orderId endpoint. No `config` block:
            // relies on Strapi's framework default (authenticated), same
            // pattern as `request-cancellation` above. The action carries
            // a belt-and-suspenders `ctx.state.user` → `ctx.unauthorized`
            // guard. Path is two segments, cannot collide with core
            // `PUT /orders/:id` (single segment).
            method: 'PUT',
            path: '/orders/by-order-id/:orderId',
            handler: 'order.upsertByOrderId',
        }
    ]
};
