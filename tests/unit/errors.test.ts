/**
 * Error Classes Unit Tests
 */

import {
  PrismaUnitOfWorkError,
  TransactionError,
  TransactionAlreadyActiveError,
  NoActiveTransactionError,
  RepositoryNotRegisteredError,
  SavepointError,
  SavepointNotFoundError,
  DatabaseConnectionError,
  TransactionTimeoutError,
  UnitOfWorkDisposedError,
  ErrorCodes,
} from '../../src/errors/unit-of-work.errors';

describe('PrismaUnitOfWorkError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new PrismaUnitOfWorkError('Test error', 'TEST_CODE', {
      cause,
      unitOfWorkId: 'uow-123',
      traceId: 'trace-456',
    });

    expect(error.name).toBe('PrismaUnitOfWorkError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.cause).toBe(cause);
    expect(error.unitOfWorkId).toBe('uow-123');
    expect(error.traceId).toBe('trace-456');
  });

  it('should be an instance of Error', () => {
    const error = new PrismaUnitOfWorkError('Test', 'TEST');
    expect(error).toBeInstanceOf(Error);
  });

  it('should serialize to JSON correctly', () => {
    const error = new PrismaUnitOfWorkError('Test error', 'TEST_CODE', {
      unitOfWorkId: 'uow-123',
    });

    const json = error.toJSON();

    expect(json.name).toBe('PrismaUnitOfWorkError');
    expect(json.code).toBe('TEST_CODE');
    expect(json.message).toBe('Test error');
    expect(json.unitOfWorkId).toBe('uow-123');
  });
});

describe('TransactionError', () => {
  it('should include state in error', () => {
    const error = new TransactionError('Transaction failed', 'TX_ERROR', {
      state: 'COMMITTING',
    });

    expect(error.name).toBe('TransactionError');
    expect(error.state).toBe('COMMITTING');
  });
});

describe('TransactionAlreadyActiveError', () => {
  it('should create with correct message and code', () => {
    const error = new TransactionAlreadyActiveError('uow-123', 'trace-456');

    expect(error.name).toBe('TransactionAlreadyActiveError');
    expect(error.code).toBe('TRANSACTION_ALREADY_ACTIVE');
    expect(error.unitOfWorkId).toBe('uow-123');
    expect(error.traceId).toBe('trace-456');
    expect(error.message).toContain('already active');
  });
});

describe('NoActiveTransactionError', () => {
  it('should include operation name in message', () => {
    const error = new NoActiveTransactionError('getRepository', 'uow-123');

    expect(error.name).toBe('NoActiveTransactionError');
    expect(error.code).toBe('NO_ACTIVE_TRANSACTION');
    expect(error.message).toContain('getRepository');
    expect(error.message).toContain('start()');
  });
});

describe('RepositoryNotRegisteredError', () => {
  it('should handle string token', () => {
    const error = new RepositoryNotRegisteredError('UserRepository', 'uow-123');

    expect(error.name).toBe('RepositoryNotRegisteredError');
    expect(error.code).toBe('REPOSITORY_NOT_REGISTERED');
    expect(error.repositoryToken).toBe('UserRepository');
    expect(error.message).toContain('UserRepository');
    expect(error.message).toContain('registerRepository()');
  });

  it('should handle Symbol token', () => {
    const TOKEN = Symbol('TestRepo');
    const error = new RepositoryNotRegisteredError(TOKEN, 'uow-123');

    expect(error.repositoryToken).toBe(TOKEN.toString());
    expect(error.message).toContain('Symbol(TestRepo)');
  });
});

describe('SavepointError', () => {
  it('should include savepoint name', () => {
    const error = new SavepointError('Savepoint failed', 'SP_ERROR', {
      savepointName: 'sp_1',
    });

    expect(error.name).toBe('SavepointError');
    expect(error.savepointName).toBe('sp_1');
  });
});

describe('SavepointNotFoundError', () => {
  it('should create with savepoint name', () => {
    const error = new SavepointNotFoundError('my_savepoint', 'uow-123');

    expect(error.name).toBe('SavepointNotFoundError');
    expect(error.code).toBe('SAVEPOINT_NOT_FOUND');
    expect(error.savepointName).toBe('my_savepoint');
    expect(error.message).toContain('my_savepoint');
  });
});

describe('DatabaseConnectionError', () => {
  it('should wrap connection error', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new DatabaseConnectionError('Connection refused', cause);

    expect(error.name).toBe('DatabaseConnectionError');
    expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('Connection refused');
  });
});

describe('TransactionTimeoutError', () => {
  it('should include timeout duration', () => {
    const error = new TransactionTimeoutError(30000, 'uow-123', 'trace-456');

    expect(error.name).toBe('TransactionTimeoutError');
    expect(error.code).toBe('TRANSACTION_TIMEOUT');
    expect(error.timeoutMs).toBe(30000);
    expect(error.message).toContain('30000ms');
  });
});

describe('UnitOfWorkDisposedError', () => {
  it('should include operation name', () => {
    const error = new UnitOfWorkDisposedError('start', 'uow-123');

    expect(error.name).toBe('UnitOfWorkDisposedError');
    expect(error.code).toBe('UNIT_OF_WORK_DISPOSED');
    expect(error.message).toContain('start');
    expect(error.message).toContain('disposed');
  });
});

describe('ErrorCodes', () => {
  it('should have all error codes defined', () => {
    expect(ErrorCodes.TRANSACTION_ERROR).toBe('TRANSACTION_ERROR');
    expect(ErrorCodes.TRANSACTION_START_FAILED).toBe('TRANSACTION_START_FAILED');
    expect(ErrorCodes.TRANSACTION_COMMIT_FAILED).toBe('TRANSACTION_COMMIT_FAILED');
    expect(ErrorCodes.TRANSACTION_ROLLBACK_FAILED).toBe('TRANSACTION_ROLLBACK_FAILED');
    expect(ErrorCodes.TRANSACTION_TIMEOUT).toBe('TRANSACTION_TIMEOUT');
    expect(ErrorCodes.TRANSACTION_ALREADY_ACTIVE).toBe('TRANSACTION_ALREADY_ACTIVE');
    expect(ErrorCodes.NO_ACTIVE_TRANSACTION).toBe('NO_ACTIVE_TRANSACTION');
    expect(ErrorCodes.REPOSITORY_NOT_REGISTERED).toBe('REPOSITORY_NOT_REGISTERED');
    expect(ErrorCodes.SAVEPOINT_NOT_FOUND).toBe('SAVEPOINT_NOT_FOUND');
    expect(ErrorCodes.SAVEPOINT_CREATE_FAILED).toBe('SAVEPOINT_CREATE_FAILED');
    expect(ErrorCodes.SAVEPOINT_ROLLBACK_FAILED).toBe('SAVEPOINT_ROLLBACK_FAILED');
    expect(ErrorCodes.SAVEPOINT_RELEASE_FAILED).toBe('SAVEPOINT_RELEASE_FAILED');
    expect(ErrorCodes.DATABASE_CONNECTION_ERROR).toBe('DATABASE_CONNECTION_ERROR');
    expect(ErrorCodes.UNIT_OF_WORK_DISPOSED).toBe('UNIT_OF_WORK_DISPOSED');
  });
});