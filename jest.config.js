/**
 * Jest configuration for the Wordsless app.
 *
 * Uses jest-expo preset so the React Native / Expo runtime is correctly mocked
 * (e.g. expo-router, expo-constants, native modules all have sane defaults).
 *
 * Pin jest to ^29 for now — jest-expo 57 ships transformIgnorePatterns that
 * are written for jest 29; the same strings don't compile under jest 30.
 */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Order matters: the first matching regex wins. Stub CSS (and its
    // .module.css variant) before the @/ alias mapper can resolve them
    // to real source files.
    '^(.*)\\.module\\.css$': '<rootDir>/jest.styleMock.js',
    '^(.*)\\.css$': '<rootDir>/jest.styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.expo/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
  ],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
};
