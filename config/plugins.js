module.exports = ({ env }) => ({
  // 1. Configuración de JWT
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET"),
    },
  },

  // 2. Configuración de Upload - Local para dev, Cloudinary para producción
  upload: {
    config: env("CLOUDINARY_NAME")
      ? {
          // Producción: Cloudinary
          provider: "cloudinary",
          providerOptions: {
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
          // Desarrollo: Local
          provider: "local",
          providerOptions: {
            sizeLimit: 10000000, // 10MB
          },
        },
  },
});
