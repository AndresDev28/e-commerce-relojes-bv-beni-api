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
        }
    ]
};
