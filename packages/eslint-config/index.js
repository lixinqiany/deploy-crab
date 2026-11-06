import js from '@eslint/js';
import react from '@eslint-react/eslint-plugin';
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
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
        reportUnusedInlineConfigs: 'error',
      },
    },
    {
      files: ['**/*.{js,mjs,cjs,ts,tsx}'],
      rules: {
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-var': 'error',
        'prefer-const': 'error',
        'array-callback-return': 'error',
        'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      },
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
        '@typescript-eslint/no-import-type-side-effects': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/return-await': ['error', 'in-try-catch'],
        // TypeScript checks fallthrough and unreachable code for TS files.
        'no-fallthrough': 'off',
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
      files: [
        'apps/cli/**/*.{ts,tsx}',
        'apps/web/src/**/*.{ts,tsx}',
        'packages/ui/**/*.{ts,tsx}',
      ],
      extends: [reactHooks.configs.flat.recommended],
      plugins: { '@eslint-react': react },
      // Keep Hooks under the official plugin; add JSX correctness separately.
      rules: {
        '@eslint-react/no-missing-key': 'error',
        '@eslint-react/no-duplicate-key': 'error',
        '@eslint-react/no-array-index-key': 'error',
        '@eslint-react/jsx-no-children-prop-with-children': 'error',
        '@eslint-react/jsx-no-comment-textnodes': 'error',
      },
    },
    {
      files: ['apps/web/src/**/*.tsx', 'packages/ui/**/*.tsx'],
      extends: [reactRefresh.configs.vite],
      // DOM rules must not apply to the Ink terminal UI.
      rules: {
        '@eslint-react/dom-no-dangerously-set-innerhtml-with-children': 'error',
        '@eslint-react/dom-no-void-elements-with-children': 'error',
        '@eslint-react/dom-no-script-url': 'error',
        '@eslint-react/dom-no-unsafe-iframe-sandbox': 'error',
      },
    },
    {
      files: ['apps/server/**/*.spec.ts', 'apps/server/test/**/*.ts'],
      languageOptions: { globals: globals.vitest },
    },
    prettier,
  );
