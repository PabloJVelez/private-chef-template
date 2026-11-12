const { loadEnv } = require('@medusajs/framework/utils');
loadEnv('test', process.cwd());

module.exports = {
  transform: {
    '^.+\\.[jt]sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true, tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  moduleFileExtensions: ['js', 'ts', 'tsx', 'json'],
  modulePathIgnorePatterns: ['dist/', '<rootDir>/.medusa/'],
};

if (process.env.TEST_TYPE === 'integration:http') {
  module.exports.testMatch = ['**/integration-tests/http/*.spec.[jt]s'];
} else if (process.env.TEST_TYPE === 'integration:modules') {
  module.exports.testMatch = ['**/src/modules/*/__tests__/**/*.[jt]s', '**/integration-tests/availability/*.spec.ts', '**/integration-tests/social-gallery/*.spec.ts'];
} else if (process.env.TEST_TYPE === 'unit') {
  module.exports.testMatch = ['**/src/**/__tests__/**/*.unit.spec.[jt]s'];
}
