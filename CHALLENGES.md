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