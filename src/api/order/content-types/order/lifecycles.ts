/**
 * Order lifecycle hooks
 * 
 * Automatically assigns the authenticated user to new orders.
 * This is necessary because Strapi v5 rejects the "user" field in REST API requests
 * with "Invalid key user" error when trying to set relations directly.
 */

export default {
  async beforeCreate(event) {
    const { data } = event.params;

    // Get the request context to access the authenticated user
    const ctx = strapi.requestContext.get();

    if (ctx?.state?.user?.id) {
      // Assign the authenticated user's ID to the order
      // In Strapi v5, relations are set using the "connect" syntax
      data.user = {
        connect: [ctx.state.user.id]
      };

      strapi.log.info(`Order lifecycle: Assigning user ${ctx.state.user.id} to new order`);
    } else {
      strapi.log.warn('Order lifecycle: No authenticated user found in request context');
    }
  },
};
