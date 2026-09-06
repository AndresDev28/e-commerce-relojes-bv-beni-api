/**
 * webhook-event service (placeholder)
 *
 * [GAP-1 PR1+2] Read-only helpers used by tests, the retention cron
 * (config/cron-tasks.ts), and — in later PRs — the reconciliation service.
 * The ledger writes from the webhook handler are introduced in PR4a
 * (T-PR4a-3 onward). This scaffold exists so the content type compiles
 * and the cron sweep can resolve the `api::webhook-event.webhook-event`
 * collection for retention deletes.
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::webhook-event.webhook-event' as any);
