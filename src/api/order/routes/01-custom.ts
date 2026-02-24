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
        }
    ]
};
