/**
 * order router
 *
 * [ORD-25] Custom router configuration with explicit policies
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::order.order', {
  config: {
    find: {
      middlewares: [],
      policies: [],
    },
    findOne: {
      middlewares: [],
      policies: [],
    },
    create: {
      middlewares: [],
      policies: [],
    },
  },
});
