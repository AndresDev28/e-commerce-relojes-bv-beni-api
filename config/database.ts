const path = require('path');
const { parse } = require("pg-connection-string");

module.exports = ({ env }) => {
  // =================================================
  //       CONFIGURACIÓN PARA PRODUCCIÓN (RENDER)
  // =================================================
  if (env('NODE_ENV') === 'production') {
    const config = parse(env("DATABASE_URL"));
    return {
      connection: {
        client: 'postgres',
        connection: {
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
          ssl: {
            rejectUnauthorized: false,
          },
        },
        debug: false,
      },
    };
  }

  // =================================================
  //     CONFIGURACIÓN PARA DESARROLLO (DOCKER LOCAL)
  // =================================================
  return {
    connection: {
      client: env('DATABASE_CLIENT', 'postgres'),
      connection: {
        host: env('DATABASE_HOST', '127.0.0.1'),
        port: env.int('DATABASE_PORT', 5432),
        database: env('DATABASE_NAME', 'relojes_bv_beni_db'),
        user: env('DATABASE_USERNAME', 'strapi'),
        password: env('DATABASE_PASSWORD'),
        ssl: env.bool('DATABASE_SSL', false),
      },
      debug: false,
    },
  };
};
