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
