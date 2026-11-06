import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const createConfig = (rootDirectory) =>
  defineConfig(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.dev/**',
        '**/.turbo/**',
        '**/.deploy-crab/**',
        '**/coverage/**',
        '**/*.tsbuildinfo',
      ],
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [js.configs.recommended],
      languageOptions: { globals: globals.node },
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [
        js.configs.recommended,
        ...tseslint.configs.recommendedTypeChecked,
      ],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: rootDirectory,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: [
        'apps/cli/**/*.{ts,tsx}',
        'apps/server/**/*.ts',
        'packages/core/**/*.ts',
        'apps/web/vite.config.ts',
      ],
      languageOptions: { globals: globals.node },
    },
    {
      files: ['apps/web/src/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
      languageOptions: { globals: globals.browser },
    },
    {
      files: ['**/*.tsx'],
      extends: [reactHooks.configs.flat.recommended],
    },
    {
      files: ['apps/web/src/**/*.tsx', 'packages/ui/**/*.tsx'],
      extends: [reactRefresh.configs.vite],
    },
    {
      files: ['apps/server/**/*.spec.ts', 'apps/server/test/**/*.ts'],
      languageOptions: { globals: globals.vitest },
    },
    prettier,
  );
