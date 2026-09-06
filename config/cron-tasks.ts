/**
 * Cron tasks — Sprint 5 Gap #1 (PR1+2)
 *
 * Schedules the daily retention sweep for the `webhook_events` ledger.
 * Stripe retains ~21 days of event history; the on-disk ledger extends
 * that to 90 days to cover dispute and audit windows at this scale
 * (see design D-DESIGN-3 and D-DESIGN-8 step 2). The sweep selects rows
 * by `processedAt` and delegates the delete to the standard
 * `entityService.delete` path so it composes with future Strapi hooks.
 *
 * The cron runner is gated by `cron.enabled` in `config/server.ts` —
 * tests set `STRAPI_DISABLE_CRON=true` so the sweep does not run during
 * the suite (see `test/helpers/strapi-test-helpers.ts`).
 */
export default {
    /**
     * Daily retention sweep — deletes webhook_events rows whose
     * `processedAt` is older than 90 days. Uses `entityService` so the
     * delete composes with any future lifecycles and respects the same
     * transaction semantics as production writes.
     *
     * The cutoff is strictly `<` (older than N days), so a row whose
     * `processedAt` is exactly N days old is preserved — this avoids
     * an off-by-one race at the day boundary.
     */
    webhookLedgerRetention: {
        task: async ({ strapi }: { strapi: any }) => {
            const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
            const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

            try {
                const staleRows = await strapi.entityService.findMany(
                    'api::webhook-event.webhook-event',
                    {
                        filters: { processedAt: { $lt: cutoff.toISOString() } },
                        fields: ['id'],
                        limit: -1,
                    }
                );

                if (!staleRows || staleRows.length === 0) {
                    strapi.log.debug(
                        '[GAP-1] webhookLedgerRetention: no rows older than 90 days'
                    );
                    return;
                }

                for (const row of staleRows) {
                    await strapi.entityService.delete(
                        'api::webhook-event.webhook-event',
                        row.id
                    );
                }

                strapi.log.info(
                    `[GAP-1] webhookLedgerRetention: deleted ${staleRows.length} rows older than ${cutoff.toISOString()}`
                );
            } catch (err: any) {
                strapi.log.error(
                    '[GAP-1] webhookLedgerRetention failed:',
                    err?.message || String(err)
                );
            }
        },
        options: {
            // Every day at 03:17 server time — off the typical deploy/backup windows.
            rule: '17 3 * * *',
            tz: 'Etc/UTC',
        },
    },
};
