/**
 * Cron tasks — Sprint 5 Gap #1 (PR1+2)
 *
 * [GAP-1 PR1+2 SETUP] Cron registration shell. The actual retention
 * sweep (D-DESIGN-3, 90-day `processedAt` cutoff) is added in
 * T-PR1+2-6 (GREEN); until then this file exists so the Strapi
 * config-loader discovers it at boot and the `cron.enabled` flag in
 * `config/server.ts` resolves without warnings. Tests still pin
 * `STRAPI_DISABLE_CRON=true` to suppress scheduling.
 */
export default {};
