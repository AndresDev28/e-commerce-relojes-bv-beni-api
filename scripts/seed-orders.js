/**
 * Seed script para crear usuarios y pedidos de prueba
 * Uso: node scripts/seed-orders.js
 */

const { createStrapi } = require('@strapi/strapi');

async function seed() {
  const app = await createStrapi({ dist: false });

  await app.load();

  const { entityService } = app;

  // Crear usuarios de prueba
  console.log('Creando usuarios...');
  const users = await Promise.all([
    entityService.create('plugin::users-permissions.user', {
      data: {
        email: 'cliente1@test.com',
        username: 'cliente1',
        password: 'Test1234!',
        confirmed: true,
        role: 1,
      }
    }),
    entityService.create('plugin::users-permissions.user', {
      data: {
        email: 'cliente2@test.com',
        username: 'cliente2',
        password: 'Test1234!',
        confirmed: true,
        role: 1,
      }
    }),
    entityService.create('plugin::users-permissions.user', {
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
  console.log('Creando categorias...');
  const categories = await Promise.all([
    entityService.create('api::category.category', {
      data: {
        name: 'Relojes Clasicos',
        slug: 'relojes-clasicos',
      }
    }),
    entityService.create('api::category.category', {
      data: {
        name: 'Relojes Deportivos',
        slug: 'relojes-deportivos',
      }
    }),
  ]);

  console.log('Categorias creadas:', categories.map(c => c.name));

  // Crear productos
  console.log('Creando productos...');
  const products = await Promise.all([
    entityService.create('api::product.product', {
      data: {
        name: 'Reloj Clasico Dorado',
        slug: 'reloj-clasico-dorado',
        price: 150,
        stock: 10,
        description: 'Un hermoso reloj clasico',
        category: categories[0].id,
      }
    }),
    entityService.create('api::product.product', {
      data: {
        name: 'Reloj Deportivo Negro',
        slug: 'reloj-deportivo-negro',
        price: 200,
        stock: 15,
        description: 'Reloj deportivo resistente al agua',
        category: categories[1].id,
      }
    }),
    entityService.create('api::product.product', {
      data: {
        name: 'Reloj Elegante Plateado',
        slug: 'reloj-elegante-plateado',
        price: 250,
        stock: 8,
        description: 'Elegancia pura en tu muneca',
        category: categories[0].id,
      }
    }),
  ]);

  console.log('Productos creados:', products.map(p => p.name));

  // Crear pedidos para cada usuario
  console.log('Creando pedidos...');
  const orderStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered'];
  const orders = [];

  // Pedidos para cliente1
  for (let i = 1; i <= 3; i++) {
    const order = await entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${i}`,
        orderStatus: orderStatuses[i - 1],
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
    const order = await entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${10 + i}`,
        orderStatus: orderStatuses[i + 1],
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
    const order = await entityService.create('api::order.order', {
      data: {
        orderId: `ORD-${Date.now()}-${20 + i}`,
        orderStatus: orderStatuses[Math.min(i + 3, 4)],
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

  await app.destroy();
  process.exit(0);
}

seed().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
