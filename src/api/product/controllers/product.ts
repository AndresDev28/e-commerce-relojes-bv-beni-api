/**
 * product controller
 */

import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::product.product",
  ({ strapi }) => ({
    async find(ctx) {
      const defaultPopulate = {
        image: true,
        category: true,
      };
      ctx.query = {
        ...ctx.query,
        populate: ctx.query.populate ?? defaultPopulate,
      };
      // @ts-ignore
      return await super.find(ctx);
    },
    async findOne(ctx) {
      const defaultPopulate = {
        image: true,
        category: true,
      };
      ctx.query = {
        ...ctx.query,
        populate: ctx.query.populate ?? defaultPopulate,
      };
      // @ts-ignore
      return await super.findOne(ctx);
    },
  })
);
