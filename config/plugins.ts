export default ({ env }) => ({
  // 1. Configuración de JWT
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET"),
    },
  },

  // 2. Configuración de Upload - Local para dev, Cloudinary para producción
  // Usamos provider custom que procesa hero images automáticamente
  upload: {
    config: env("CLOUDINARY_NAME")
      ? {
          // Producción: Cloudinary con procesamiento
          provider: "strapi-provider-upload-standardize",
          providerOptions: {
            provider: "@strapi/provider-upload-cloudinary",
            cloud_name: env("CLOUDINARY_NAME"),
            api_key: env("CLOUDINARY_KEY"),
            api_secret: env("CLOUDINARY_SECRET"),
          },
          actionOptions: {
            upload: {},
            delete: {},
          },
        }
      : {
          // Desarrollo: Local con procesamiento
          provider: "strapi-provider-upload-standardize",
          providerOptions: {
            provider: "@strapi/provider-upload-local",
            sizeLimit: 10000000, // 10MB
          },
        },
  },
});
