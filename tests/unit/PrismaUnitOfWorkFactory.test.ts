/**
 * PrismaUnitOfWorkFactory Unit Tests
 */

import { PrismaClient } from '../__mocks__/@prisma/client';
import { MockContext, IsolationLevel } from '../__mocks__/@struktos/core';
import { PrismaUnitOfWorkFactory } from '../../src/unit-of-work/PrismaUnitOfWorkFactory';
import { PrismaUnitOfWork } from '../../src/unit-of-work/PrismaUnitOfWork';
import type { PrismaTransactionClient } from '../../src/types/prisma.types';

// Mock repository for testing
interface ITestRepository {
  findById(id: string): Promise<{ id: string; name: string } | null>;
}

class MockTestRepository implements ITestRepository {
  constructor(private tx: PrismaTransactionClient) {}

  async findById(id: string): Promise<{ id: string; name: string } | null> {
    return { id, name: 'Test' };
  }
}

describe('PrismaUnitOfWorkFactory', () => {
  let prisma: PrismaClient;
  let factory: PrismaUnitOfWorkFactory;

  beforeEach(() => {
    prisma = new PrismaClient();
    factory = new PrismaUnitOfWorkFactory(prisma as any);
  });

  describe('constructor', () => {
    it('should create factory without config', () => {
      const f = new PrismaUnitOfWorkFactory(prisma as any);
      expect(f).toBeDefined();
    });

    it('should create factory with config', () => {
      const f = new PrismaUnitOfWorkFactory(prisma as any, {
        defaultTimeout: 60000,
        defaultIsolationLevel: 'READ_COMMITTED' as any,
      });
      expect(f).toBeDefined();
    });
  });

  describe('registerRepository', () => {
    it('should register a repository factory', () => {
      factory.registerRepository('TestRepository', (tx) => new MockTestRepository(tx));

      expect(factory.hasRepository('TestRepository')).toBe(true);
    });

    it('should allow chaining registrations', () => {
      const result = factory
        .registerRepository('Repo1', (tx) => new MockTestRepository(tx))
        .registerRepository('Repo2', (tx) => new MockTestRepository(tx));

      expect(result).toBe(factory);
      expect(factory.hasRepository('Repo1')).toBe(true);
      expect(factory.hasRepository('Repo2')).toBe(true);
    });

    it('should support Symbol tokens', () => {
      const TOKEN = Symbol('TestRepository');

      factory.registerRepository(TOKEN, (tx) => new MockTestRepository(tx));

      expect(factory.hasRepository(TOKEN)).toBe(true);
    });

    it('should support class tokens', () => {
      class UserRepository {}

      factory.registerRepository(UserRepository, (tx) => new MockTestRepository(tx));

      expect(factory.hasRepository(UserRepository)).toBe(true);
    });
  });

  describe('hasRepository', () => {
    it('should return false for unregistered repository', () => {
      expect(factory.hasRepository('UnknownRepo')).toBe(false);
    });

    it('should return true for registered repository', () => {
      factory.registerRepository('TestRepo', (tx) => new MockTestRepository(tx));

      expect(factory.hasRepository('TestRepo')).toBe(true);
    });
  });

  describe('unregisterRepository', () => {
    it('should remove a registered repository', () => {
      factory.registerRepository('TestRepo', (tx) => new MockTestRepository(tx));
      expect(factory.hasRepository('TestRepo')).toBe(true);

      const result = factory.unregisterRepository('TestRepo');

      expect(result).toBe(true);
      expect(factory.hasRepository('TestRepo')).toBe(false);
    });

    it('should return false for non-existent repository', () => {
      const result = factory.unregisterRepository('NonExistent');

      expect(result).toBe(false);
    });
  });

  describe('getRegisteredRepositories', () => {
    it('should return empty array when no repositories registered', () => {
      const repos = factory.getRegisteredRepositories();

      expect(repos).toEqual([]);
    });

    it('should return all registered repository tokens', () => {
      factory.registerRepository('Repo1', (tx) => new MockTestRepository(tx));
      factory.registerRepository('Repo2', (tx) => new MockTestRepository(tx));

      const repos = factory.getRegisteredRepositories();

      expect(repos).toHaveLength(2);
      expect(repos).toContain('Repo1');
      expect(repos).toContain('Repo2');
    });
  });

  describe('create', () => {
    it('should create a new PrismaUnitOfWork instance', () => {
      const uow = factory.create();

      expect(uow).toBeInstanceOf(PrismaUnitOfWork);
      expect(uow.id).toBeDefined();
    });

    it('should create instances with unique IDs', () => {
      const uow1 = factory.create();
      const uow2 = factory.create();

      expect(uow1.id).not.toBe(uow2.id);
    });

    it('should include registered repository factories', () => {
      factory.registerRepository('TestRepo', (tx) => new MockTestRepository(tx));

      const uow = factory.create();

      expect(uow.hasRepository('TestRepo')).toBe(true);
    });

    it('should include all registered repositories in created UoW', () => {
      factory
        .registerRepository('Repo1', (tx) => new MockTestRepository(tx))
        .registerRepository('Repo2', (tx) => new MockTestRepository(tx));

      const uow = factory.create();

      expect(uow.hasRepository('Repo1')).toBe(true);
      expect(uow.hasRepository('Repo2')).toBe(true);
    });
  });

  // describe('createWithContext', () => {
  //   it('should create UoW with context set', () => {
  //     const ctx = new MockContext({ traceId: 'trace-123', userId: 'user-456' });

  //     const uow = factory.createWithContext(ctx);

  //     expect(uow).toBeInstanceOf(PrismaUnitOfWork);
  //     expect(uow.context).toBe(ctx);
  //   });

  //   it('should include registered repositories', () => {
  //     factory.registerRepository('TestRepo', (tx) => new MockTestRepository(tx));
  //     const ctx = new MockContext({ traceId: 'trace-123' });

  //     const uow = factory.createWithContext(ctx);

  //     expect(uow.hasRepository('TestRepo')).toBe(true);
  //   });
  // });
});