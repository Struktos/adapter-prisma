/**
 * Mock implementation of @prisma/client for testing
 */

export type PrismaTransactionClient = {
  user: MockModelDelegate;
  order: MockModelDelegate;
  $executeRawUnsafe: jest.Mock;
};

export interface MockModelDelegate {
  findUnique: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  count: jest.Mock;
}

export function createMockModelDelegate(): MockModelDelegate {
  return {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

export function createMockTransactionClient(): PrismaTransactionClient {
  return {
    user: createMockModelDelegate(),
    order: createMockModelDelegate(),
    $executeRawUnsafe: jest.fn(),
  };
}

export class PrismaClient {
  private _transactionCallback:
    | ((tx: PrismaTransactionClient) => Promise<unknown>)
    | null = null;
  private _transactionResolve: ((value: unknown) => void) | null = null;
  private _transactionReject: ((reason: Error) => void) | null = null;

  user = createMockModelDelegate();
  order = createMockModelDelegate();

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $on = jest.fn();
  $use = jest.fn();
  $extends = jest.fn();

  /**
   * Mock $transaction that simulates interactive transactions
   */
  $transaction = jest.fn().mockImplementation(
    async <T>(
      fn: (tx: PrismaTransactionClient) => Promise<T>,
      _options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: string;
      }
    ): Promise<T> => {
      const mockTx = createMockTransactionClient();

      // Store the callback for later resolution
      this._transactionCallback = fn as (
        tx: PrismaTransactionClient
      ) => Promise<unknown>;

      try {
        const result = await fn(mockTx);
        return result;
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * Helper to get the mock transaction client
   */
  getMockTransactionClient(): PrismaTransactionClient {
    return createMockTransactionClient();
  }

  /**
   * Helper to simulate transaction timeout
   */
  simulateTransactionTimeout(): void {
    this.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('Transaction API error: Transaction timed out'), {
        code: 'P2024',
      })
    );
  }

  /**
   * Helper to simulate connection error
   */
  simulateConnectionError(): void {
    this.$transaction.mockRejectedValueOnce(
      new Error('Connection refused')
    );
  }
}

// Prisma Error Classes
export class PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;

  constructor(message: string, code: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}

export class PrismaClientUnknownRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientUnknownRequestError';
  }
}

export class PrismaClientRustPanicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientRustPanicError';
  }
}

export class PrismaClientInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientInitializationError';
  }
}

export class PrismaClientValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrismaClientValidationError';
  }
}