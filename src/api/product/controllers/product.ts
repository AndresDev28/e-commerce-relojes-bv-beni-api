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
      // Normaliza query del Front que usa "images" en lugar de "image"
      if (ctx.query?.populate && typeof ctx.query.populate === "object") {
        const p = ctx.query.populate as Record<string, unknown>;
        if ((p as any).images && !(p as any).image) {
          (p as any).image = (p as any).images;
          delete (p as any).images;
        }
      }
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
      if (ctx.query?.populate && typeof ctx.query.populate === "object") {
        const p = ctx.query.populate as Record<string, unknown>;
        if ((p as any).images && !(p as any).image) {
          (p as any).image = (p as any).images;
          delete (p as any).images;
        }
      }
      ctx.query = {
        ...ctx.query,
        populate: ctx.query.populate ?? defaultPopulate,
      };
      // @ts-ignore
      return await super.findOne(ctx);
    },
  })
);
