// vitest.config.pg.ts — V-S1 PG smoke test runner.
//
// Mirrors vitest.config.ts (the default SQLite runner used by `npm run
// test:only`) but limits the discovery surface to test/pg-smoke/** and
// explicitly excludes the SQLite test/api/** and test/integration/**
// suites so the two runners cannot accidentally cross-pollinate.
//
// The actual DB engine is selected by config/database.ts based on the
// DATABASE_CLIENT env var (defaults to sqlite in NODE_ENV=test; the PG
// branch fires when DATABASE_CLIENT=postgres, set by `npm run test:pg:smoke`
// and the CI workflow's Test (PG smoke) step).

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Strapi boot + PG roundtrips are slower than SQLite in-memory;
    // bump the per-test ceiling above the global 30s default.
    testTimeout: 60000,
    // Single suite — run sequentially to avoid port conflicts with the
    // Strapi HTTP server and to keep PG connection pool contention
    // deterministic.
    fileParallelism: false,
    include: ['test/pg-smoke/**/*.test.ts'],
    exclude: [
      'dist',
      '.strapi',
      'node_modules',
      // SQLite-only suites — must NEVER run under this config.
      'test/api/**',
      'test/integration/**',
    ],
  },
  resolve: {
    alias: {
      'lodash/fp': 'lodash/fp.js',
    },
  },
  ssr: {
    noExternal: ['@strapi/strapi', '@strapi/core'],
  },
})
