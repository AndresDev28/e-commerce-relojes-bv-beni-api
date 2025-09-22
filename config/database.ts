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
  //     CONFIGURACIÓN POR DEFECTO PARA DESARROLLO
  // =================================================
  return {
    connection: {
      client: 'sqlite',
      connection: {
        filename: path.join(__dirname, '../..', env('DATABASE_FILENAME', '.tmp/data.db')),
      },
      useNullAsDefault: true,
    },
  };
};
