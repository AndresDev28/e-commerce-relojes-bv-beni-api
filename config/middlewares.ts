export default [
  "strapi::errors",
  // HTTPS enforcer - must be early in the chain
  {
    name: "global::https-enforcer",
    config: {
      enabled: true,
      redirectToHttps: false,
      sensitiveRoutes: ["/api/orders", "/api/payments", "/api/stripe"],
    },
  },
  {
    name: "strapi::cors",
    config: {
      origin: [
        "http://localhost:3000",
        "https://e-commerce-relojes-bv-beni.vercel.app",
      ],
      headers: ["Content-Type", "Authorization", "Origin", "Accept"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      credentials: true,
    },
  },
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "blob:", "https:", "http:"],
          "media-src": ["'self'", "data:", "blob:", "https:", "http:"],
        },
      },
      // HSTS - Force HTTPS for 1 year, include subdomains
      hsts: {
        enabled: true,
        maxAge: 31536000,
        includeSubDomains: true,
      },
      // Prevent clickjacking
      frameguard: {
        action: "deny",
      },
    },
  },
  "strapi::poweredBy",
  "strapi::logger",
  "strapi::query",
  {
    name: "strapi::body",
    config: {
      includeUnparsed: true,
    },
  },
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
