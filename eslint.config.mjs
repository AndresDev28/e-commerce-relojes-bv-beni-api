import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Strapi uses `any` extensively in its types — warn, don't error
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars are common in test helpers — warn, don't error
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Strapi test helpers use require() for dynamic imports
      '@typescript-eslint/no-require-imports': 'warn',
      // Strapi controllers use @ts-ignore for type overrides
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Generated content types use `module` keyword
      '@typescript-eslint/prefer-namespace-keyword': 'warn',
      // Generated types use {} pattern
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Existing test files use literal type assertions
      '@typescript-eslint/prefer-as-const': 'warn',
    },
  },
  {
    ignores: [
      'dist/',
      'build/',
      'node_modules/',
      'src/admin/',
      '.strapi/',
      'coverage/',
      '**/*.js',
      '**/*.mjs',
      'config/',
      'scripts/',
      'types/generated/',
    ],
  },
);
