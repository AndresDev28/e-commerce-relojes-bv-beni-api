const path = require('path');
const { parse } = require("pg-connection-string")

module.exports = ({ env }) => {
  // =================================================
  //       CONFIGURACIÓN PARA TESTING
  // =================================================
  if (env('NODE_ENV') === 'test') {
    // [V-S1] Allow PG smoke tests (vitest.config.pg.ts) to override
    // DATABASE_CLIENT=postgres at the shell level. The default SQLite
    // in-memory branch is preserved for the existing `test:only` suite;
    // PG smoke is opt-in via env var. Without this branch the brief's
    // `DATABASE_CLIENT=postgres` env var is silently ignored because
    // the test-mode short-circuit fires first.
    if (env('DATABASE_CLIENT') === 'postgres') {
      return {
        connection: {
          client: 'postgres',
          connection: {
            host: env('DATABASE_HOST', '127.0.0.1'),
            port: env.int('DATABASE_PORT', 5432),
            database: env('DATABASE_NAME', 'relojes_bv_beni_pg_smoke'),
            user: env('DATABASE_USERNAME', 'strapi'),
            password: env('DATABASE_PASSWORD', ''),
            ssl: env.bool('DATABASE_SSL', false),
          },
          debug: false,
        },
      };
    }
    return {
      connection: {
        client: 'sqlite',
        connection: {
          filename: env('DATABASE_FILENAME', ':memory:'),
        },
        useNullAsDefault: true,
        debug: false,
      },
    };
  }

  // =================================================
  //       CONFIGURACIÓN PARA PRODUCCIÓN
  // =================================================
  if (env('NODE_ENV') === 'production') {
    // Railway/Render: DATABASE_URL disponible
    if (env("DATABASE_URL")) {
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

    // Fallback si DATABASE_URL no está disponible (durante build)
    return {
      connection: {
        client: 'postgres',
        connection: {
          host: env('DATABASE_HOST', '127.0.0.1'),
          port: env.int('DATABASE_PORT', 5432),
          database: env('DATABASE_NAME', 'strapi'),
          user: env('DATABASE_USERNAME', 'strapi'),
          password: env('DATABASE_PASSWORD', ''),
          ssl: env.bool('DATABASE_SSL', false) && {
            rejectUnauthorized: env.bool('DATABASE_SSL_SELF', false),
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
