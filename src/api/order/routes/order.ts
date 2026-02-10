/**
 * order router
 *
 * [ORD-25] Custom router configuration with explicit policies
 * [AND-62] Custom /search endpoint for email search
 */

import { factories } from '@strapi/strapi';

export default {
  ...factories.createCoreRouter('api::order.order', {
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
  }),
  routes: [
    {
      method: 'GET',
      path: '/search',
      handler: 'order.search',
      config: {
        policies: [],
        middlewares: [],
      }
    }
  ]
};
