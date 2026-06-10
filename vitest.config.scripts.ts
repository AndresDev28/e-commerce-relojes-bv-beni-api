import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 60000, // Background removal can be slow
    exclude: ['dist', '.strapi', 'node_modules'],
    include: ['tests/scripts/**/*.test.{js,ts}', 'tests/upload/**/*.test.{js,ts}'],
  },
})
