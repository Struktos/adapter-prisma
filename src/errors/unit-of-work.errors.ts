/**
 * @fileoverview Prisma Unit of Work Error Classes
 * @description
 * Custom error classes for Prisma-based Unit of Work operations.
 * These errors provide detailed context for transaction failures,
 * repository issues, and database connectivity problems.
 *
 * @packageDocumentation
 * @module @struktos/prisma/errors
 * @version 1.0.0
 */

/**
 * Base error class for Prisma Unit of Work errors.
 *
 * All Prisma-related errors extend this class to enable
 * instanceof checks and centralized error handling.
 *
 * @remarks
 * This class preserves the original error stack trace when
 * wrapping underlying errors, making debugging easier.
 *
 * @example
 * ```typescript
 * try {
 *   await unitOfWork.commit();
 * } catch (error) {
 *   if (error instanceof PrismaUnitOfWorkError) {
 *     console.error('UoW Error:', error.code, error.message);
 *   }
 * }
 * ```
 */
export class PrismaUnitOfWorkError extends Error {
  /**
   * Error code for programmatic error handling.
   */
  public readonly code: string;

  /**
   * Original error that caused this error.
   */
  public readonly cause?: Error;

  /**
   * Unit of Work ID where the error occurred.
   */
  public readonly unitOfWorkId?: string;

  /**
   * Trace ID for distributed tracing correlation.
   */
  public readonly traceId?: string;

  /**
   * Creates a new PrismaUnitOfWorkError.
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param options - Additional error options
   */
  constructor(
    message: string,
    code: string,
    options?: {
      cause?: Error;
      unitOfWorkId?: string;
      traceId?: string;
    }
  ) {
    super(message);
    this.name = 'PrismaUnitOfWorkError';
    this.code = code;
    this.cause = options?.cause;
    this.unitOfWorkId = options?.unitOfWorkId;
    this.traceId = options?.traceId;

    // Preserve stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PrismaUnitOfWorkError);
    }
  }

  /**
   * Returns a JSON-serializable representation of the error.
   *
   * @returns Object containing error details
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      unitOfWorkId: this.unitOfWorkId,
      traceId: this.traceId,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when a transaction operation fails.
 *
 * This error is thrown when start, commit, or rollback
 * operations encounter issues.
 *
 * @example
 * ```typescript
 * throw new TransactionError(
 *   'Failed to start transaction: Connection timeout',
 *   'TRANSACTION_START_FAILED',
 *   {
 *     cause: originalError,
 *     unitOfWorkId: '123-456',
 *     state: 'Inactive'
 *   }
 * );
 * ```
 */
export class TransactionError extends PrismaUnitOfWorkError {
  /**
   * Transaction state when the error occurred.
   */
  public readonly state?: string;

  /**
   * Creates a new TransactionError.
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param options - Additional error options
   */
  constructor(
    message: string,
    code: string,
    options?: {
      cause?: Error;
      unitOfWorkId?: string;
      traceId?: string;
      state?: string;
    }
  ) {
    super(message, code, options);
    this.name = 'TransactionError';
    this.state = options?.state;
  }
}

/**
 * Error thrown when a repository is not registered.
 *
 * This error indicates that a requested repository has not
 * been registered with the Unit of Work.
 *
 * @example
 * ```typescript
 * throw new RepositoryNotRegisteredError('UserRepository', unitOfWorkId);
 * ```
 */
export class RepositoryNotRegisteredError extends PrismaUnitOfWorkError {
  /**
   * The token/name of the unregistered repository.
   */
  public readonly repositoryToken: string;

  /**
   * Creates a new RepositoryNotRegisteredError.
   *
   * @param token - Repository token that was not found
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   */
  constructor(token: string | symbol, unitOfWorkId?: string, traceId?: string) {
    const tokenString = typeof token === 'symbol' ? token.toString() : token;
    super(
      `Repository '${tokenString}' is not registered with this Unit of Work. ` +
        `Register it using registerRepository() before calling getRepository().`,
      'REPOSITORY_NOT_REGISTERED',
      { unitOfWorkId, traceId }
    );
    this.name = 'RepositoryNotRegisteredError';
    this.repositoryToken = tokenString;
  }
}

/**
 * Error thrown when accessing repositories without an active transaction.
 *
 * This error indicates that getRepository() was called before
 * starting a transaction.
 *
 * @example
 * ```typescript
 * // This will throw NoActiveTransactionError
 * const repo = unitOfWork.getRepository('UserRepository');
 * // Should call unitOfWork.start() first
 * ```
 */
export class NoActiveTransactionError extends PrismaUnitOfWorkError {
  /**
   * Creates a new NoActiveTransactionError.
   *
   * @param operation - The operation that required an active transaction
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   */
  constructor(operation: string, unitOfWorkId?: string, traceId?: string) {
    super(
      `Cannot perform '${operation}' without an active transaction. ` +
        `Call start() before performing this operation.`,
      'NO_ACTIVE_TRANSACTION',
      { unitOfWorkId, traceId }
    );
    this.name = 'NoActiveTransactionError';
  }
}

/**
 * Error thrown when attempting to start a transaction while one is active.
 *
 * Unit of Work instances are single-use. Create a new instance
 * for each transaction scope.
 *
 * @example
 * ```typescript
 * await unitOfWork.start();
 * await unitOfWork.start(); // Throws TransactionAlreadyActiveError
 * ```
 */
export class TransactionAlreadyActiveError extends PrismaUnitOfWorkError {
  /**
   * Creates a new TransactionAlreadyActiveError.
   *
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   */
  constructor(unitOfWorkId?: string, traceId?: string) {
    super(
      'A transaction is already active on this Unit of Work. ' +
        'Commit or rollback the current transaction before starting a new one, ' +
        'or create a new Unit of Work instance.',
      'TRANSACTION_ALREADY_ACTIVE',
      { unitOfWorkId, traceId }
    );
    this.name = 'TransactionAlreadyActiveError';
  }
}

/**
 * Error thrown when a savepoint operation fails.
 *
 * This error is thrown for savepoint-related issues such as
 * creating, rolling back to, or releasing savepoints.
 *
 * @example
 * ```typescript
 * throw new SavepointError(
 *   'Savepoint not found',
 *   'SAVEPOINT_NOT_FOUND',
 *   { savepointName: 'my_savepoint' }
 * );
 * ```
 */
export class SavepointError extends PrismaUnitOfWorkError {
  /**
   * The name of the savepoint involved.
   */
  public readonly savepointName?: string;

  /**
   * Creates a new SavepointError.
   *
   * @param message - Human-readable error message
   * @param code - Error code for programmatic handling
   * @param options - Additional error options
   */
  constructor(
    message: string,
    code: string,
    options?: {
      cause?: Error;
      unitOfWorkId?: string;
      traceId?: string;
      savepointName?: string;
    }
  ) {
    super(message, code, options);
    this.name = 'SavepointError';
    this.savepointName = options?.savepointName;
  }
}

/**
 * Error thrown when a savepoint is not found.
 *
 * This error is thrown when attempting to rollback to or release
 * a savepoint that doesn't exist.
 *
 * @example
 * ```typescript
 * await unitOfWork.rollbackToSavepoint('nonexistent'); // Throws SavepointNotFoundError
 * ```
 */
export class SavepointNotFoundError extends SavepointError {
  /**
   * Creates a new SavepointNotFoundError.
   *
   * @param savepointName - Name of the savepoint that was not found
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   */
  constructor(savepointName: string, unitOfWorkId?: string, traceId?: string) {
    super(
      `Savepoint '${savepointName}' does not exist. ` +
        `Available savepoints can be checked before rollback.`,
      'SAVEPOINT_NOT_FOUND',
      { unitOfWorkId, traceId, savepointName }
    );
    this.name = 'SavepointNotFoundError';
  }
}

/**
 * Error thrown when database connection fails.
 *
 * This error indicates that the Prisma client could not
 * connect to the database.
 *
 * @example
 * ```typescript
 * throw new DatabaseConnectionError(
 *   'Connection refused',
 *   originalPrismaError
 * );
 * ```
 */
export class DatabaseConnectionError extends PrismaUnitOfWorkError {
  /**
   * Creates a new DatabaseConnectionError.
   *
   * @param message - Human-readable error message
   * @param cause - The original Prisma error
   * @param options - Additional error options
   */
  constructor(
    message: string,
    cause?: Error,
    options?: {
      unitOfWorkId?: string;
      traceId?: string;
    }
  ) {
    super(
      `Database connection failed: ${message}`,
      'DATABASE_CONNECTION_ERROR',
      { cause, ...options }
    );
    this.name = 'DatabaseConnectionError';
  }
}

/**
 * Error thrown when transaction times out.
 *
 * This error indicates that the transaction exceeded its
 * configured timeout duration.
 *
 * @example
 * ```typescript
 * throw new TransactionTimeoutError(30000, unitOfWorkId);
 * ```
 */
export class TransactionTimeoutError extends TransactionError {
  /**
   * The timeout duration in milliseconds.
   */
  public readonly timeoutMs: number;

  /**
   * Creates a new TransactionTimeoutError.
   *
   * @param timeoutMs - The timeout duration that was exceeded
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   * @param cause - The original error
   */
  constructor(
    timeoutMs: number,
    unitOfWorkId?: string,
    traceId?: string,
    cause?: Error
  ) {
    super(
      `Transaction timed out after ${timeoutMs}ms. ` +
        `Consider increasing the timeout or optimizing the transaction.`,
      'TRANSACTION_TIMEOUT',
      { cause, unitOfWorkId, traceId }
    );
    this.name = 'TransactionTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when Unit of Work is disposed.
 *
 * This error is thrown when attempting to use a Unit of Work
 * after it has been disposed.
 *
 * @example
 * ```typescript
 * await unitOfWork.dispose();
 * await unitOfWork.start(); // Throws UnitOfWorkDisposedError
 * ```
 */
export class UnitOfWorkDisposedError extends PrismaUnitOfWorkError {
  /**
   * Creates a new UnitOfWorkDisposedError.
   *
   * @param operation - The operation that was attempted
   * @param unitOfWorkId - Unit of Work ID
   * @param traceId - Optional trace ID
   */
  constructor(operation: string, unitOfWorkId?: string, traceId?: string) {
    super(
      `Cannot perform '${operation}' on a disposed Unit of Work. ` +
        `Create a new Unit of Work instance.`,
      'UNIT_OF_WORK_DISPOSED',
      { unitOfWorkId, traceId }
    );
    this.name = 'UnitOfWorkDisposedError';
  }
}

/**
 * Error codes for programmatic error handling.
 *
 * @remarks
 * Use these constants when checking error codes:
 * ```typescript
 * if (error.code === ErrorCodes.TRANSACTION_TIMEOUT) {
 *   // Handle timeout specifically
 * }
 * ```
 */
export const ErrorCodes = {
  /** Transaction start/commit/rollback failed */
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  /** Transaction start failed */
  TRANSACTION_START_FAILED: 'TRANSACTION_START_FAILED',
  /** Transaction commit failed */
  TRANSACTION_COMMIT_FAILED: 'TRANSACTION_COMMIT_FAILED',
  /** Transaction rollback failed */
  TRANSACTION_ROLLBACK_FAILED: 'TRANSACTION_ROLLBACK_FAILED',
  /** Transaction timed out */
  TRANSACTION_TIMEOUT: 'TRANSACTION_TIMEOUT',
  /** Transaction already active */
  TRANSACTION_ALREADY_ACTIVE: 'TRANSACTION_ALREADY_ACTIVE',
  /** No active transaction */
  NO_ACTIVE_TRANSACTION: 'NO_ACTIVE_TRANSACTION',
  /** Repository not registered */
  REPOSITORY_NOT_REGISTERED: 'REPOSITORY_NOT_REGISTERED',
  /** Savepoint not found */
  SAVEPOINT_NOT_FOUND: 'SAVEPOINT_NOT_FOUND',
  /** Savepoint creation failed */
  SAVEPOINT_CREATE_FAILED: 'SAVEPOINT_CREATE_FAILED',
  /** Savepoint rollback failed */
  SAVEPOINT_ROLLBACK_FAILED: 'SAVEPOINT_ROLLBACK_FAILED',
  /** Savepoint release failed */
  SAVEPOINT_RELEASE_FAILED: 'SAVEPOINT_RELEASE_FAILED',
  /** Database connection error */
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  /** Unit of Work disposed */
  UNIT_OF_WORK_DISPOSED: 'UNIT_OF_WORK_DISPOSED',
} as const;