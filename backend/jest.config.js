/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.ts',
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 60_000,
  maxWorkers: 1,
  clearMocks: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.routes.ts', '!src/server.ts', '!src/docs/**'],
};
