# Registro de Desafíos de Despliegue

Este documento registra los obstáculos encontrados durante el proyecto y sus soluciones.

---

## Desafío #1: Desplegando Strapi en Render

**Objetivo:** Desplegar con éxito el backend de Strapi en Render, conectándolo a una base de datos PostgreSQL.

### Obstáculo 1: `Cannot find module 'pg'`

Tras el intento de despliegue inicial, la compilación (build) fue exitosa, pero la aplicación no pudo arrancar. Los logs mostraban el siguiente error:

```
Error: Cannot find module 'pg
```

-   **Análisis:** La aplicación, configurada para usar PostgreSQL, requiere el paquete `pg` de Node.js para actuar como controlador de la base de datos. Aunque podría haber sido instalado localmente, no se guardó como una dependencia del proyecto en `package.json`. Por lo tanto, el comando `npm install` de Render no lo instaló.
-   **Solución:** Añadir `pg` como una dependencia del proyecto.
    ```bash
    npm install pg
    ```
    Este comando actualiza `package.json` y `package-lock.json`, que luego se suben al repositorio.
---

### Obstáculo 2: `self-signed certificate`

Después de solucionar el primer problema, apareció un nuevo error durante la fase de inicio de la aplicación:

```
error: self-signed certificate
```

-   **Analisis:** Las bases de datos de PostgreSQL de Render utilizan certificados SSL autofirmados para conexiones seguras. Por defecto, el controlador `pg` rechaza estas conexiones porque el certificado no es emitido por una Autoridad de Certificación (CA) de confianza. La aplicación necesita ser instruida explícitamente para permitir este tipo de conexión.
-   **Solución:** Modificar el archivo principal de configuración de la base de datos (`config/database.js`) para manejar el entorno de producción de manera diferente. La lógica verifica si `NODE_ENV` está configurado como `production` y, si es así, añade la opción `ssl: { rejectUnauthorized: false }` a la configuración de la conexión.

    ```javascript
    // In /config/database.js
    
    if (env('NODE_ENV') === 'production') {
      const config = parse(env("DATABASE_URL"));
      return {
        connection: {
          client: 'postgres',
          connection: {
            // ... other settings
            ssl: {
              rejectUnauthorized: false,
            },
          },
          debug: false,
        },
      };
    }
    ```
    **Nota:** Esto también requirió asegurarse de que la variable de entorno `NODE_ENV=production` estuviera correctamente configurada en el servicio de Render.

---

### Obstáculo 3: `Missing jwtSecret`

Con la conexión a la base de datos resuelta, surgió un último error de inicio, esta vez relacionado con la seguridad:

```
error: Missing jwtSecret. Please, set configuration variable "jwtSecret" for the users-permissions plugin...
```

-   **Analisis:** Por motivos de seguridad, Strapi requiere una clave secreta única y persistente para firmar los JSON Web Tokens (JWT) en un entorno de producción. Esto no puede dejarse con el valor por defecto de desarrollo.
-   **Solución:**
    1.  **Generar un Valor Secreto:** Crear una cadena aleatoria criptográficamente fuerte.
        ```bash
        node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
        ```
    2.  **Configurar la Variable de Entorno:** Añadir una nueva variable de entorno en Render llamada `JWT_SECRET` con la cadena generada como su valor.
    3.  **Configurar Strapi:** Crear un nuevo archivo `config/plugins.js` para indicar al `plugin users-permissions` dónde encontrar el valor secreto.



        ```javascript
        // In /config/plugins.js
        
        module.exports = ({ env }) => ({
          "users-permissions": {
            config: {
              jwtSecret: env("JWT_SECRET"),
            },
          },
        });
        ```

### Resultado Final

Después de abordar estos tres problemas distintos—una dependencia faltante, una configuración de SSL y un requisito de seguridad—la aplicación se desplegó y se inició exitosamente en Render.

---

## Desafío #2: Migración de Base de Datos a Docker (Desarrollo Local)

**Objetivo:** Implementar Docker como gestor de base de datos PostgreSQL en el entorno de desarrollo local tras la finalización del período de prueba gratuito de Render.

### Contexto

Después del período de prueba de Render, se necesitaba una solución de base de datos para el desarrollo local que:
- Mantuviera la paridad con el entorno de producción (PostgreSQL)
- Fuera fácil de configurar y reproducible
- No dependiera de servicios externos de pago para desarrollo

### Solución Implementada

Se implementó Docker Compose para gestionar un contenedor de PostgreSQL local con las siguientes características:

#### 1. Configuración de Docker Compose

Se creó el archivo `docker-compose.yml` con:
- **Imagen:** PostgreSQL 15 Alpine (versión ligera)
- **Persistencia:** Volumen local para los datos
- **Health Check:** Verificación automática del estado de la base de datos
- **Reinicio:** Configurado para reiniciar automáticamente

```yaml
services:
  postgres:
    image: postgres:15-alpine
    container_name: relojes-bv-beni-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: relojes_bv_beni_db
      POSTGRES_USER: strapi
      POSTGRES_PASSWORD: "EO2D1TetxtvxRAaYOXyABjMELAPO1gjgZ3Em"
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

#### 2. Actualización de Configuración de Base de Datos

Se modificó `config/database.ts` para cambiar de SQLite a PostgreSQL en desarrollo:

**Antes:**
```typescript
// Configuración SQLite para desarrollo
connection: {
  client: 'sqlite',
  connection: {
    filename: path.join(__dirname, '../..', env('DATABASE_FILENAME', '.tmp/data.db')),
  },
  useNullAsDefault: true,
}
```

**Después:**
```typescript
// Configuración PostgreSQL para desarrollo con Docker
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
}
```

#### 3. Actualización de Configuración del Servidor

Se modificó `config/server.ts` para comportarse diferente en desarrollo vs producción:

```typescript
// Usa URL y proxy solo en producción
url: env("NODE_ENV") === "production"
  ? env("URL", "https://e-commerce-relojes-bv-beni-api.onrender.com")
  : env("URL", ""),
proxy: env("NODE_ENV") === "production",
```

#### 4. Configuración de Upload Condicional

Se actualizó `config/plugins.ts` para usar almacenamiento local en desarrollo y Cloudinary en producción:

```typescript
upload: {
  config: env("CLOUDINARY_NAME")
    ? {
        // Producción: Cloudinary
        provider: "cloudinary",
        providerOptions: { /* ... */ },
      }
    : {
        // Desarrollo: Local
        provider: "local",
        providerOptions: {
          sizeLimit: 10000000, // 10MB
        },
      },
}
```

### Comandos Útiles

```bash
# Iniciar base de datos
docker-compose up -d

# Ver logs
docker-compose logs -f postgres

# Detener base de datos
docker-compose down

# Detener y eliminar volúmenes (¡cuidado, borra datos!)
docker-compose down -v
```

### Beneficios

1. **Paridad de Entornos:** Desarrollo local con PostgreSQL igual que producción
2. **Portabilidad:** Cualquier desarrollador puede levantar el entorno con un solo comando
3. **Aislamiento:** La base de datos está completamente contenida y no interfiere con el sistema
4. **Persistencia:** Los datos se mantienen entre reinicios del contenedor
5. **Costo Cero:** Solución gratuita para desarrollo local

### Resultado Final

El entorno de desarrollo ahora usa PostgreSQL mediante Docker, manteniendo compatibilidad total con producción mientras mantiene la simplicidad en el desarrollo local.