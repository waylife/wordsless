// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'ios/*', 'android/*'],
  },
  {
    files: ['scripts/**/*.{js,ts,mjs,cjs}', 'data/**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      // Standalone Node scripts (build / batch AI / migration) — no React Native runtime.
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
  },
  {
    files: ['jest.setup.js', 'jest.*.js'],
    languageOptions: {
      globals: {
        // jest is a Node global injected by the jest CLI; no import
        // is needed and ESLint shouldn't flag it.
        jest: 'readonly',
      },
    },
  },
]);
