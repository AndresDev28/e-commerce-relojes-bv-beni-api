// [ORD-26] Configuración del Admin Panel para gestión de Orders
import type { StrapiApp } from '@strapi/strapi/admin';
import OrderFiltersPanel from './extensions/components/OrderFiltersPanel';

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
  bootstrap(app: StrapiApp) {
    // [ORD-27/28] Inyectar panel de filtros y búsqueda en Orders
    app.getPlugin('content-manager').injectComponent('listView', 'actions', {
      name: 'OrderFiltersPanel',
      Component: OrderFiltersPanel,
    });
  },
};
