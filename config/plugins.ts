export default ({ env }) => ({
  // 1. Configuración de JWT
  "users-permissions": {
    config: {
      jwtSecret: env("JWT_SECRET"),
    },
  },
  // 2. Nueva configuración para Cloudinary
  upload: {
    config: {
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
    },
  },
});
