/**
 * HTTPS Enforcer Middleware
 *
 * Forces HTTPS connections in production environment.
 * Rejects HTTP requests to sensitive endpoints (payments, orders).
 */

import type { Core } from '@strapi/strapi';

interface MiddlewareConfig {
  enabled: boolean;
  redirectToHttps: boolean;
  sensitiveRoutes: string[];
}

const defaultConfig: MiddlewareConfig = {
  enabled: true,
  redirectToHttps: false, // In API context, reject rather than redirect
  sensitiveRoutes: ['/api/orders', '/api/payments', '/api/stripe'],
};

export default (config: Partial<MiddlewareConfig>, { strapi }: { strapi: Core.Strapi }) => {
  const finalConfig = { ...defaultConfig, ...config };

  return async (ctx, next) => {
    // Only enforce in production
    if (process.env.NODE_ENV !== 'production') {
      return next();
    }

    if (!finalConfig.enabled) {
      return next();
    }

    // Check if request is secure
    // Railway and other proxies set X-Forwarded-Proto header
    const protocol = ctx.request.headers['x-forwarded-proto'] || ctx.protocol;
    const isSecure = protocol === 'https';

    if (!isSecure) {
      const path = ctx.request.path;

      // Check if this is a sensitive route
      const isSensitiveRoute = finalConfig.sensitiveRoutes.some(route =>
        path.startsWith(route)
      );

      if (isSensitiveRoute) {
        strapi.log.warn(`Blocked insecure request to sensitive route: ${path}`);
        ctx.status = 403;
        ctx.body = {
          error: {
            status: 403,
            name: 'ForbiddenError',
            message: 'HTTPS is required for this endpoint',
          },
        };
        return;
      }

      // For non-sensitive routes, optionally redirect
      if (finalConfig.redirectToHttps) {
        const host = ctx.request.headers.host;
        const redirectUrl = `https://${host}${ctx.request.url}`;
        ctx.redirect(redirectUrl);
        return;
      }
    }

    return next();
  };
};
