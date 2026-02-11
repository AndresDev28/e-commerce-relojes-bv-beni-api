/**
 * order router
 *
 * [ORD-25] Custom router configuration with explicit policies
 * [AND-62] Custom /search endpoint for email search
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::order.order');
