# BV Beni Watch Store - Core API

Esta es la infraestructura de backend oficial para la plataforma de alta relojería BV Beni. Desarrollada sobre [Strapi v5](https://strapi.io) y Node.js, esta API proporciona la robustez, seguridad y rendimiento exigidos para el manejo de transacciones de piezas exclusivas, implementando una arquitectura pragmática basada en el dominio de negocio.

## 🏛️ Arquitectura del Dominio y Capas (Screaming Architecture)

Nuestro backend separa estructuralmente las responsabilidades técnicas de la lógica de negocio. Cada dominio maneja sus propios casos de uso, garantizando un código mantenible y escalable:

- **Catálogo & Inventario:** Gestión precisa de piezas de alta relojería, asegurando la integridad de los datos de cada calibre, complicación y disponibilidad.
- **Transacciones (Orders, Shipments & Cancels):** Sistema orquestado de gestión de pedidos integrado con **Stripe** para procesamientos de pagos seguros. Incluye un ciclo de vida completo de envíos (Shipment lifecycle hooks) y transiciones automáticas de estado.
- **Infraestructura de Comunicaciones:** Integración con **Resend** para notificar oportunamente cada etapa clave de la experiencia de compra, manteniendo a los clientes informados de manera profesional y oportuna.
- **Privacidad & Seguridad (Hardening):** Riguroso enmascaramiento de PII en los logs del sistema, rate-limiting, y cumplimiento estricto de las directivas GDPR/RGPD para asegurar la máxima confidencialidad.

## 🛠 Entorno de Desarrollo y Requisitos

Este proyecto integra **Portless** para facilitar conexiones seguras y fluidas en el entorno local (HTTPS) y opera sobre **PostgreSQL**.

### Prerrequisitos
- Node.js (>=18.0.0 <=22.x.x)
- Base de datos PostgreSQL
- [Portless](https://portless.dev/) (Para routing y desarrollo HTTPS local)

### Comandos de Inicialización

Ejecute la instalación de dependencias y levante el servidor de desarrollo:

```bash
npm install

# Para ejecutar con las configuraciones locales de portless
npm run dev

# Para arrancar Strapi vanilla de forma directa
npm run develop
```

## 🧪 Testing y Aseguramiento de Calidad (QA)

El API incorpora una suite de pruebas robusta (unitarias y de integración) utilizando **Vitest**. Para ejecutar la suite siguiendo las normativas de conservación de memoria (Hardware Aware):

```bash
npm run test
# Alternativamente, para ejecutar controlando los workers manualmente:
npx vitest run --maxWorkers=2
```

## 🚀 Entorno de Producción

La infraestructura está configurada para un lanzamiento resiliente en **Railway**, respaldado por una base de datos PostgreSQL de producción y **Cloudinary** para el almacenamiento de los activos multimedia del catálogo.

## 🛡 Normativas Core de Antigravity (Compliance)

Tanto ingenieros como agentes automatizados deben alinear su código a las siguientes directrices globales del ecosistema:

- **Cero Retención de PII en Texto Plano:** Terminantemente prohibido registrar información personal vulnerable en la base de datos o logs sin ofuscar.
- **Single Source of Truth:** Los esquemas y modelos de Strapi aquí definidos actúan como la única fuente de la verdad para el tipo de datos que consume el cliente React. Toda alteración estructural en el backend requiere sincronización del contrato de datos.
- **Tono y Excelencia (Luxury Standard):** Todas las devoluciones de error amigables, notificaciones al cliente o correos estructurados deben presentarse con una voz sobria, experta y orientada al nivel del lujo exigido.

---
<sub>Mantén la precisión técnica como si de un calendario perpetuo se tratase. | **BV Beni Watch Store**</sub>
