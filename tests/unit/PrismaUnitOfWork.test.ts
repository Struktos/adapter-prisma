/**
 * PrismaUnitOfWork Unit Tests
 */

import { PrismaClient, createMockTransactionClient } from '../__mocks__/@prisma/client';
import { MockContext, IsolationLevel, TransactionState } from '../__mocks__/@struktos/core';
import { PrismaUnitOfWork } from '../../src/unit-of-work/PrismaUnitOfWork';
import {
  TransactionAlreadyActiveError,
  NoActiveTransactionError,
  RepositoryNotRegisteredError,
  UnitOfWorkDisposedError,
} from '../../src/errors/unit-of-work.errors';
import type { PrismaTransactionClient } from '../../src/types/prisma.types';

// Mock repository for testing
interface ITestRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
  create(data: { name: string }): Promise<{ id: string; name: string }>;
}

class MockTestRepository implements ITestRepository {
  constructor(private tx: PrismaTransactionClient) {}

  async findById(id: string): Promise<{ id: string; name: string } | null> {
    return { id, name: 'Test' };
  }

  async create(data: { name: string }): Promise<{ id: string; name: string }> {
    return { id: 'test-id', name: data.name };
  }
}

describe('PrismaUnitOfWork', () => {
  let prisma: PrismaClient;
  let unitOfWork: PrismaUnitOfWork;

  beforeEach(() => {
    prisma = new PrismaClient();
    unitOfWork = new PrismaUnitOfWork(prisma as any);
  });

  afterEach(async () => {
    try {
      await unitOfWork.dispose();
    } catch {
      // Ignore disposal errors in cleanup
    }
  });

  describe('constructor', () => {
    it('should create a new instance with unique ID', () => {
      const uow1 = new PrismaUnitOfWork(prisma as any);
      const uow2 = new PrismaUnitOfWork(prisma as any);

      expect(uow1.id).toBeDefined();
      expect(uow2.id).toBeDefined();
      expect(uow1.id).not.toBe(uow2.id);
    });

    it('should initialize with Inactive state', () => {
      expect(unitOfWork.state).toBe('INACTIVE');
    });

    it('should not have context initially', () => {
      expect(unitOfWork.context).toBeUndefined();
    });

    it('should accept custom configuration', () => {
      const logger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const uow = new PrismaUnitOfWork(prisma as any, {
        defaultTimeout: 60000,
        defaultMaxWait: 10000,
        enableSavepoints: false,
        logger,
      });

      expect(uow).toBeDefined();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('registerRepository', () => {
    it('should register a repository factory', () => {
      const factory = (tx: PrismaTransactionClient) => new MockTestRepository(tx);

      unitOfWork.registerRepository('TestRepository', factory);

      expect(unitOfWork.hasRepository('TestRepository')).toBe(true);
    });

    it('should allow chaining registrations', () => {
      const factory1 = (tx: PrismaTransactionClient) => new MockTestRepository(tx);
      const factory2 = (tx: PrismaTransactionClient) => new MockTestRepository(tx);

      const result = unitOfWork
        .registerRepository('Repo1', factory1)
        .registerRepository('Repo2', factory2);

      expect(result).toBe(unitOfWork);
      expect(unitOfWork.hasRepository('Repo1')).toBe(true);
      expect(unitOfWork.hasRepository('Repo2')).toBe(true);
    });

    it('should support Symbol tokens', () => {
      const TOKEN = Symbol('TestRepository');
      const factory = (tx: PrismaTransactionClient) => new MockTestRepository(tx);

      unitOfWork.registerRepository(TOKEN, factory);

      expect(unitOfWork.hasRepository(TOKEN)).toBe(true);
    });

    it('should throw when disposed', async () => {
      await unitOfWork.dispose();

      expect(() => {
        unitOfWork.registerRepository('Test', () => ({} as any));
      }).toThrow(UnitOfWorkDisposedError);
    });
  });

  describe('hasRepository', () => {
    it('should return false for unregistered repository', () => {
      expect(unitOfWork.hasRepository('UnknownRepo')).toBe(false);
    });

    it('should return true for registered repository', () => {
      unitOfWork.registerRepository('TestRepo', () => ({} as any));

      expect(unitOfWork.hasRepository('TestRepo')).toBe(true);
    });
  });

  // describe('setContext', () => {
  //   it('should set the context', () => {
  //     const ctx = new MockContext({ traceId: 'trace-123' });

  //     unitOfWork.setContext(ctx);

  //     expect(unitOfWork.context).toBe(ctx);
  //   });

  //   it('should throw when disposed', async () => {
  //     await unitOfWork.dispose();
  //     const ctx = new MockContext();

  //     expect(() => unitOfWork.setContext(ctx)).toThrow(UnitOfWorkDisposedError);
  //   });
  // });

  describe('dispose', () => {
    it('should be idempotent', async () => {
      await unitOfWork.dispose();
      await unitOfWork.dispose(); // Should not throw

      expect(unitOfWork.state).toBe('INACTIVE');
    });

    it('should prevent further operations', async () => {
      await unitOfWork.dispose();

      await expect(unitOfWork.start()).rejects.toThrow(UnitOfWorkDisposedError);
    });
  });

  describe('getRepository (without active transaction)', () => {
    it('should throw NoActiveTransactionError', () => {
      unitOfWork.registerRepository('TestRepo', () => ({} as any));

      expect(() => {
        unitOfWork.getRepository('TestRepo');
      }).toThrow(NoActiveTransactionError);
    });
  });
});

describe('PrismaUnitOfWork Error Classes', () => {
  describe('TransactionAlreadyActiveError', () => {
    it('should create error with correct properties', () => {
      const error = new TransactionAlreadyActiveError('uow-123', 'trace-456');

      expect(error.name).toBe('TransactionAlreadyActiveError');
      expect(error.code).toBe('TRANSACTION_ALREADY_ACTIVE');
      expect(error.unitOfWorkId).toBe('uow-123');
      expect(error.traceId).toBe('trace-456');
      expect(error.message).toContain('already active');
    });
  });

  describe('NoActiveTransactionError', () => {
    it('should create error with correct properties', () => {
      const error = new NoActiveTransactionError('getRepository', 'uow-123');

      expect(error.name).toBe('NoActiveTransactionError');
      expect(error.code).toBe('NO_ACTIVE_TRANSACTION');
      expect(error.message).toContain('getRepository');
    });
  });

  describe('RepositoryNotRegisteredError', () => {
    it('should create error with string token', () => {
      const error = new RepositoryNotRegisteredError('UserRepository', 'uow-123');

      expect(error.name).toBe('RepositoryNotRegisteredError');
      expect(error.code).toBe('REPOSITORY_NOT_REGISTERED');
      expect(error.repositoryToken).toBe('UserRepository');
      expect(error.message).toContain('UserRepository');
    });

    it('should create error with Symbol token', () => {
      const TOKEN = Symbol('TestRepo');
      const error = new RepositoryNotRegisteredError(TOKEN, 'uow-123');

      expect(error.repositoryToken).toBe(TOKEN.toString());
    });
  });

  describe('UnitOfWorkDisposedError', () => {
    it('should create error with correct properties', () => {
      const error = new UnitOfWorkDisposedError('start', 'uow-123');

      expect(error.name).toBe('UnitOfWorkDisposedError');
      expect(error.code).toBe('UNIT_OF_WORK_DISPOSED');
      expect(error.message).toContain('start');
      expect(error.message).toContain('disposed');
    });
  });
});