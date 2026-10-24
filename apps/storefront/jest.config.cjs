module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/app/**/__tests__/*.test.tsx'],
  transform: { '^.+\\.[jt]sx?$': '<rootDir>/test-transform.cjs' },
  moduleNameMapper: { '^@app/(.*)$': '<rootDir>/app/$1', '^@libs/(.*)$': '<rootDir>/libs/$1' },
};
