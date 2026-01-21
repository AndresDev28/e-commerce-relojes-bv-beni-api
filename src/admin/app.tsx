// [ORD-26] Configuración del Admin Panel para gestión de Orders
import type { StrapiApp } from '@strapi/strapi/admin';

export default {
  config: {
    // Habilitar español para el panel de administración
    locales: ['es'],
    // Configuración de traducciones personalizadas
    translations: {
      es: {
        'content-manager.components.LeftMenu.collection-types': 'Tipos de Colección',
        'app.components.LeftMenu.navbrand.title': 'Relojes BV Beni',
      },
    },
  },
  bootstrap(_app: StrapiApp) {
    // Bootstrap hook - puede usarse para extensiones futuras del admin
  },
};
