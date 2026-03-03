import type { Core } from '@strapi/strapi';

// [SEC-01] Simple in-memory rate limiter for Strapi Backend
// Protects critical endpoints like /api/orders and /api/checkout
const ipMap = new Map<string, { count: number; resetTime: number }>();

const LIMIT = 30; // Max requests per window
const WINDOW_MS = 60 * 1000; // 1 minute

export default (config: any, { strapi }: { strapi: Core.Strapi }) => {
    return async (ctx: any, next: () => Promise<any>) => {
        // Only apply to specific critical API routes
        if (ctx.request.url.startsWith('/api/orders') || ctx.request.url.startsWith('/api/payments')) {
            const ip =
                ctx.request.headers['x-forwarded-for'] ||
                ctx.request.headers['x-real-ip'] ||
                ctx.request.ip ||
                'anonymous';

            const now = Date.now();
            const windowData = ipMap.get(ip as string);

            if (!windowData || now > windowData.resetTime) {
                ipMap.set(ip as string, { count: 1, resetTime: now + WINDOW_MS });
            } else {
                if (windowData.count >= LIMIT) {
                    strapi.log.warn(`[RATE LIMIT EXCEEDED] IP: ${ip} on path: ${ctx.request.url}`);
                    ctx.status = 429;
                    ctx.set('Retry-After', '60');
                    ctx.body = {
                        error: 'Too Many Requests',
                        message: 'Rate limit exceeded, try again later.',
                    };
                    return;
                }
                windowData.count++;
            }
        }

        await next();
    };
};
