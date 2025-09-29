export default ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  // Usa URL como variable canónica para despliegue detrás de proxy (Render)
  url: env("URL", "https://e-commerce-relojes-bv-beni-api.onrender.com"),
  proxy: true,
  app: {
    keys: env.array("APP_KEYS"),
  },
  webhooks: {
    populateRelations: env.bool("WEBHOOKS_POPULATE_RELATIONS", false),
  },
});
