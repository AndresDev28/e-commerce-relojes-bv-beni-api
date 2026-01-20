const { validateStripeKeys } = require('./stripe-validation');

// Validate Stripe keys on startup
validateStripeKeys();

module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  // Use URL in production for deployment behind proxy (Railway)
  url: env("NODE_ENV") === "production"
    ? env("URL", "https://e-commerce-relojes-bv-beni-api-production.up.railway.app")
    : env("URL", ""),
  proxy: env("NODE_ENV") === "production",
  app: {
    keys: env.array("APP_KEYS"),
  },
  webhooks: {
    populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
  },
});
