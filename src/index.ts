import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) { },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // [ORD-26] Configure permissions for Order API
    // This ensures the 'authenticated' role has proper permissions
    // for find, findOne, and create actions on orders

    try {
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      });

      if (!authenticatedRole) {
        strapi.log.warn('[ORD-26] Authenticated role not found, skipping permission setup');
        return;
      }

      const orderPermissions = [
        { action: 'api::order.order.find', enabled: true },
        { action: 'api::order.order.findOne', enabled: true },
        { action: 'api::order.order.create', enabled: true },
        { action: 'api::order.order.update', enabled: true },
      ];

      for (const perm of orderPermissions) {
        const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
          where: {
            action: perm.action,
            role: authenticatedRole.id
          }
        });

        if (existingPermission) {
          if (!existingPermission.enabled) {
            await strapi.query('plugin::users-permissions.permission').update({
              where: { id: existingPermission.id },
              data: { enabled: true }
            });
            strapi.log.info(`[ORD-26] Updated permission: ${perm.action}`);
          }
        } else {
          await strapi.query('plugin::users-permissions.permission').create({
            data: {
              action: perm.action,
              role: authenticatedRole.id,
              enabled: true
            }
          });
          strapi.log.info(`[ORD-26] Created permission: ${perm.action}`);
        }
      }

      strapi.log.info('[ORD-26] Order API permissions configured successfully');
    } catch (error) {
      strapi.log.error('[ORD-26] Error configuring Order permissions:', error);
    }

    // [PRD-01] Configure Product API permissions for authenticated role.
    // Required by the frontend's stock-verification step in checkout
    // (createPaymentIntentService.ts). Without find/findOne, authenticated
    // users hit 403 on `filters[id][$eq]=...` queries.
    try {
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      });

      if (!authenticatedRole) {
        strapi.log.warn('[PRD-01] Authenticated role not found, skipping product permission setup');
      } else {
        const productPermissions = [
          { action: 'api::product.product.find', enabled: true },
          { action: 'api::product.product.findOne', enabled: true },
        ];

        for (const perm of productPermissions) {
          const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
            where: {
              action: perm.action,
              role: authenticatedRole.id
            }
          });

          if (existingPermission) {
            if (!existingPermission.enabled) {
              await strapi.query('plugin::users-permissions.permission').update({
                where: { id: existingPermission.id },
                data: { enabled: true }
              });
              strapi.log.info(`[PRD-01] Updated permission: ${perm.action}`);
            }
          } else {
            await strapi.query('plugin::users-permissions.permission').create({
              data: {
                action: perm.action,
                role: authenticatedRole.id,
                enabled: true
              }
            });
            strapi.log.info(`[PRD-01] Created permission: ${perm.action}`);
          }
        }

        strapi.log.info('[PRD-01] Product API permissions configured successfully');
      }
    } catch (error) {
      strapi.log.error('[PRD-01] Error configuring Product permissions:', error);
    }

    // [PRD-02] Configure User-permissions User update for authenticated role.
    // Required by the frontend's favorites feature (updateFavoritesService.ts).
    // Without user.update, authenticated users hit 403 on PUT /api/users/:id.
    try {
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      });

      if (!authenticatedRole) {
        strapi.log.warn('[PRD-02] Authenticated role not found, skipping user permission setup');
      } else {
        const userPermissions = [
          'plugin::users-permissions.user.update',
        ];

        for (const action of userPermissions) {
          const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
            where: { action, role: authenticatedRole.id }
          });

          if (existingPermission) {
            if (!existingPermission.enabled) {
              await strapi.query('plugin::users-permissions.permission').update({
                where: { id: existingPermission.id },
                data: { enabled: true }
              });
              strapi.log.info(`[PRD-02] Updated permission: ${action}`);
            }
          } else {
            await strapi.query('plugin::users-permissions.permission').create({
              data: { action, role: authenticatedRole.id, enabled: true }
            });
            strapi.log.info(`[PRD-02] Created permission: ${action}`);
          }
        }

        strapi.log.info('[PRD-02] User update permissions configured successfully');
      }
    } catch (error) {
      strapi.log.error('[PRD-02] Error configuring User update permissions:', error);
    }

    // [ORD-30] Setup administrator role and permissions
    try {
      let adminRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'administrator' }
      });

      if (!adminRole) {
        adminRole = await strapi.query('plugin::users-permissions.role').create({
          data: {
            name: 'Administrator',
            description: 'Full administrative access to all resources',
            type: 'administrator',
          },
        });
        strapi.log.info('[ORD-30] Administrator role created');
      }

      const adminOrderPermissions = [
        'api::order.order.find',
        'api::order.order.findOne',
        'api::order.order.create',
        'api::order.order.update',
        'api::order.order.delete',
        'api::order.order.search',
      ];

      for (const action of adminOrderPermissions) {
        const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
          where: {
            action,
            role: adminRole.id
          }
        });

        if (existingPermission) {
          if (!existingPermission.enabled) {
            await strapi.query('plugin::users-permissions.permission').update({
              where: { id: existingPermission.id },
              data: { enabled: true }
            });
          }
        } else {
          await strapi.query('plugin::users-permissions.permission').create({
            data: {
              action,
              role: adminRole.id,
              enabled: true
            }
          });
        }
      }

      strapi.log.info('[ORD-30] Administrator role permissions configured successfully');
    } catch (error) {
      strapi.log.error('[ORD-30] Error configuring administrator role:', error);
    }
  },
};
