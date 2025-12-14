/**
 * Jest setup file for @struktos/prisma tests
 */

// Extend Jest matchers if needed
expect.extend({
  /**
   * Custom matcher to check if a function throws a specific error type
   */
  toThrowErrorType(received: () => unknown, expectedType: new (...args: unknown[]) => Error) {
    try {
      received();
      return {
        pass: false,
        message: () => `Expected function to throw ${expectedType.name}, but it did not throw`,
      };
    } catch (error) {
      const pass = error instanceof expectedType;
      return {
        pass,
        message: () =>
          pass
            ? `Expected function not to throw ${expectedType.name}`
            : `Expected function to throw ${expectedType.name}, but got ${(error as Error).constructor.name}`,
      };
    }
  },
});

// Clear all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Global timeout for async operations
jest.setTimeout(10000);

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };