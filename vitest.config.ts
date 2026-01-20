import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000, // Increased timeout for Strapi initialization
    // Run tests sequentially to avoid port conflicts with Strapi
    fileParallelism: false,
    exclude: ['dist', '.strapi', 'node_modules'],
  },
  resolve: {
    alias: {
      // Handle lodash/fp import issue
      'lodash/fp': 'lodash/fp.js',
    },
  },
  ssr: {
    noExternal: ['@strapi/strapi', '@strapi/core'],
  },
})
