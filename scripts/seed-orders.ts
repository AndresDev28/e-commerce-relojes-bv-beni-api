/**
 * Seed script para crear usuarios y pedidos de prueba
 *
 * Uso:
 * 1. npx strapi console
 * 2. Copiar y pegar el contenido de la funcion seedTestData()
 */

async function seedTestData() {
  const { strapi } = global;

  // Crear usuarios de prueba
  const users = await Promise.all([
    strapi.entityService.create('plugin::users-permissions.user', {
      data: {
        email: 'cliente1@test.com',
        username: 'cliente1',
        password: 'Test1234!',
        confirmed: true,
        role: 1, // Rol por defecto (authenticated)
      }
    }),
    strapi.entityService.create('plugin::users-permissions.user', {
      data: {
        email: 'cliente2@test.com',
        username: 'cliente2',
        password: 'Test1234!',
        confirmed: true,
        role: 1,
      }
    }),
    strapi.entityService.create('plugin::users-permissions.user', {
      data: {
        email: 'cliente3@test.com',
        username: 'cliente3',
        password: 'Test1234!',
        confirmed: true,
        role: 1,
      }
    }),
  ]);

  console.log('Usuarios creados:', users.map(u => u.email));

  // Crear categorias
  const categories = await Promise.all([
    strapi.entityService.create('api::category.category', {
      data: {
        name: 'Relojes Clasicos',
        slug: 'relojes-clasicos',
      }
    }),
    strapi.entityService.create('api::category.category', {
      data: {
        name: 'Relojes Deportivos',
        slug: 'relojes-deportivos',
      }
    }),
  ]);

  console.log('Categorias creadas:', categories.map(c => c.name));

  // Crear productos
  const products = await Promise.all([
    strapi.entityService.create('api::product.product', {
      data: {
        name: 'Reloj Clasico Dorado',
        slug: 'reloj-clasico-dorado',
        price: 150,
        stock: 10,
        description: [{ type: 'paragraph', children: [{ type: 'text', text: 'Un hermoso reloj clasico' }] }] as any,
        category: categories[0].id,
      }
    }),
    strapi.entityService.create('api::product.product', {
      data: {
        name: 'Reloj Deportivo Negro',
        slug: 'reloj-deportivo-negro',
        price: 200,
        stock: 15,
        description: [{ type: 'paragraph', children: [{ type: 'text', text: 'Reloj deportivo resistente al agua' }] }] as any,
        category: categories[1].id,
      }
    }),
    strapi.entityService.create('api::product.product', {
      data: {
        name: 'Reloj Elegante Plateado',
        slug: 'reloj-elegante-plateado',
        price: 250,
        stock: 8,
        description: [{ type: 'paragraph', children: [{ type: 'text', text: 'Elegancia pura en tu muneca' }] }] as any,
        category: categories[0].id,
      }
    }),
  ]);

  console.log('Productos creados:', products.map(p => p.name));

  // Crear pedidos para cada usuario
  const orderStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered'] as const;
  const orders = [];

  // Pedidos para cliente1
  for (let i = 1; i <= 3; i++) {
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${i}`,
        orderStatus: orderStatuses[i - 1] as any,
        items: JSON.stringify([
          { productId: products[0].id, name: products[0].name, price: products[0].price, quantity: 1 }
        ]),
        subtotal: products[0].price,
        shipping: 0,
        total: products[0].price,
        user: users[0].id,
      }
    });
    orders.push(order);
  }

  // Pedidos para cliente2
  for (let i = 1; i <= 2; i++) {
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${10 + i}`,
        orderStatus: orderStatuses[i + 1] as any,
        items: JSON.stringify([
          { productId: products[1].id, name: products[1].name, price: products[1].price, quantity: 1 }
        ]),
        subtotal: products[1].price,
        shipping: 0,
        total: products[1].price,
        user: users[1].id,
      }
    });
    orders.push(order);
  }

  // Pedidos para cliente3
  for (let i = 1; i <= 2; i++) {
    const order = await strapi.entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${20 + i}`,
        orderStatus: orderStatuses[Math.min(i + 3, 4)] as any,
        items: JSON.stringify([
          { productId: products[2].id, name: products[2].name, price: products[2].price, quantity: 1 }
        ]),
        subtotal: products[2].price,
        shipping: 0,
        total: products[2].price,
        user: users[2].id,
      }
    });
    orders.push(order);
  }

  console.log('Pedidos creados:', orders.length);
  console.log('Seed completado!');
  console.log('Emails de prueba:');
  users.forEach(u => console.log(`  - ${u.email}`));
}

// Para ejecutar, copia esta funcion y pegala en: npx strapi console
seedTestData();
