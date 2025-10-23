export default ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  // Usa URL solo en producción para despliegue detrás de proxy (Render)
  url: env("NODE_ENV") === "production"
    ? env("URL", "https://e-commerce-relojes-bv-beni-api.onrender.com")
    : env("URL", ""),
  proxy: env("NODE_ENV") === "production",
  app: {
    keys: env.array("APP_KEYS"),
  },
  webhooks: {
    populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
  },
});
