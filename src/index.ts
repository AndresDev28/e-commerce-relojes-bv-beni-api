import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

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
      // Get the authenticated role
      const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'authenticated' }
      });

      if (!authenticatedRole) {
        strapi.log.warn('[ORD-26] Authenticated role not found, skipping permission setup');
        return;
      }

      // Define permissions for Order content type
      const orderPermissions = [
        { action: 'api::order.order.find', enabled: true },
        { action: 'api::order.order.findOne', enabled: true },
        { action: 'api::order.order.create', enabled: true },
      ];

      // Check and create/update permissions
      for (const perm of orderPermissions) {
        const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
          where: {
            action: perm.action,
            role: authenticatedRole.id
          }
        });

        if (existingPermission) {
          // Update existing permission
          if (!existingPermission.enabled) {
            await strapi.query('plugin::users-permissions.permission').update({
              where: { id: existingPermission.id },
              data: { enabled: true }
            });
            strapi.log.info(`[ORD-26] Updated permission: ${perm.action}`);
          }
        } else {
          // Create new permission
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
  },
};
