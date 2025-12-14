/**
 * PrismaRepository Unit Tests
 */

import { createMockTransactionClient, createMockModelDelegate } from '../__mocks__/@prisma/client';
import { PrismaRepository, PrismaCrudRepository, IRepository } from '../../src/repository/PrismaRepository';
import type { PrismaTransactionClient } from '../../src/types/prisma.types';

// Test entity interface
interface TestEntity {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// Concrete implementation for testing PrismaRepository
class TestPrismaRepository extends PrismaRepository<TestEntity, string, any> {
  protected getModelDelegate() {
    return (this.client as any).testEntity;
  }

  async findById(id: string): Promise<TestEntity | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findAll(): Promise<TestEntity[]> {
    return this.model.findMany();
  }

  async create(data: Omit<TestEntity, 'id'>): Promise<TestEntity> {
    return this.model.create({ data });
  }

  async update(id: string, data: Partial<TestEntity>): Promise<TestEntity | null> {
    try {
      return await this.model.update({ where: { id }, data });
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.model.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}

// Concrete implementation for testing PrismaCrudRepository
class TestPrismaCrudRepository extends PrismaCrudRepository<TestEntity, string> {
  protected getModelDelegate() {
    return (this.client as any).testEntity;
  }
}

describe('PrismaRepository', () => {
  let mockClient: any;
  let mockModel: any;
  let repository: TestPrismaRepository;

  beforeEach(() => {
    mockModel = createMockModelDelegate();
    mockClient = {
      testEntity: mockModel,
    };
    repository = new TestPrismaRepository(mockClient as PrismaTransactionClient);
  });

  describe('constructor', () => {
    it('should create repository with client', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should call model.findUnique with correct id', async () => {
      const testEntity: TestEntity = {
        id: 'test-1',
        name: 'Test',
        email: 'test@example.com',
        createdAt: new Date(),
      };
      mockModel.findUnique.mockResolvedValue(testEntity);

      const result = await repository.findById('test-1');

      expect(mockModel.findUnique).toHaveBeenCalledWith({ where: { id: 'test-1' } });
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity not found', async () => {
      mockModel.findUnique.mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all entities', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'Test 1', email: 'test1@example.com', createdAt: new Date() },
        { id: '2', name: 'Test 2', email: 'test2@example.com', createdAt: new Date() },
      ];
      mockModel.findMany.mockResolvedValue(entities);

      const result = await repository.findAll();

      expect(mockModel.findMany).toHaveBeenCalled();
      expect(result).toEqual(entities);
    });

    it('should return empty array when no entities', async () => {
      mockModel.findMany.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create entity with provided data', async () => {
      const createData = { name: 'New Entity', email: 'new@example.com', createdAt: new Date() };
      const createdEntity: TestEntity = { id: 'new-id', ...createData };
      mockModel.create.mockResolvedValue(createdEntity);

      const result = await repository.create(createData);

      expect(mockModel.create).toHaveBeenCalledWith({ data: createData });
      expect(result).toEqual(createdEntity);
    });
  });

  describe('update', () => {
    it('should update entity with provided data', async () => {
      const updatedEntity: TestEntity = {
        id: 'test-1',
        name: 'Updated',
        email: 'test@example.com',
        createdAt: new Date(),
      };
      mockModel.update.mockResolvedValue(updatedEntity);

      const result = await repository.update('test-1', { name: 'Updated' });

      expect(mockModel.update).toHaveBeenCalledWith({
        where: { id: 'test-1' },
        data: { name: 'Updated' },
      });
      expect(result).toEqual(updatedEntity);
    });

    it('should return null when entity not found', async () => {
      mockModel.update.mockRejectedValue(new Error('Not found'));

      const result = await repository.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete entity and return true', async () => {
      mockModel.delete.mockResolvedValue({});

      const result = await repository.delete('test-1');

      expect(mockModel.delete).toHaveBeenCalledWith({ where: { id: 'test-1' } });
      expect(result).toBe(true);
    });

    it('should return false when entity not found', async () => {
      mockModel.delete.mockRejectedValue(new Error('Not found'));

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('should return count based on findAll by default', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'Test 1', email: 'test1@example.com', createdAt: new Date() },
        { id: '2', name: 'Test 2', email: 'test2@example.com', createdAt: new Date() },
      ];
      mockModel.findMany.mockResolvedValue(entities);

      const result = await repository.count();

      expect(result).toBe(2);
    });
  });
});

describe('PrismaCrudRepository', () => {
  let mockClient: any;
  let mockModel: any;
  let repository: TestPrismaCrudRepository;

  beforeEach(() => {
    mockModel = createMockModelDelegate();
    mockClient = {
      testEntity: mockModel,
    };
    repository = new TestPrismaCrudRepository(mockClient as PrismaTransactionClient);
  });

  describe('findById', () => {
    it('should call model.findUnique', async () => {
      const entity: TestEntity = {
        id: 'test-1',
        name: 'Test',
        email: 'test@example.com',
        createdAt: new Date(),
      };
      mockModel.findUnique.mockResolvedValue(entity);

      const result = await repository.findById('test-1');

      expect(mockModel.findUnique).toHaveBeenCalled();
      expect(result).toEqual(entity);
    });
  });

  describe('findAll', () => {
    it('should call model.findMany', async () => {
      mockModel.findMany.mockResolvedValue([]);

      await repository.findAll();

      expect(mockModel.findMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should call model.create', async () => {
      const data = { name: 'New', email: 'new@example.com', createdAt: new Date() };
      mockModel.create.mockResolvedValue({ id: 'new-id', ...data });

      await repository.create(data);

      expect(mockModel.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should call model.update', async () => {
      mockModel.update.mockResolvedValue({ id: '1', name: 'Updated' });

      await repository.update('1', { name: 'Updated' });

      expect(mockModel.update).toHaveBeenCalled();
    });

    it('should return null on P2025 error (record not found)', async () => {
      const error = Object.assign(new Error('Record not found'), { code: 'P2025' });
      mockModel.update.mockRejectedValue(error);

      const result = await repository.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should throw on other errors', async () => {
      const error = new Error('Database connection failed');
      mockModel.update.mockRejectedValue(error);

      await expect(repository.update('1', { name: 'Test' })).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('delete', () => {
    it('should call model.delete', async () => {
      mockModel.delete.mockResolvedValue({});

      const result = await repository.delete('1');

      expect(mockModel.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false on P2025 error', async () => {
      const error = Object.assign(new Error('Record not found'), { code: 'P2025' });
      mockModel.delete.mockRejectedValue(error);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should throw on other errors', async () => {
      const error = new Error('Database connection failed');
      mockModel.delete.mockRejectedValue(error);

      await expect(repository.delete('1')).rejects.toThrow('Database connection failed');
    });
  });

  describe('count', () => {
    it('should call model.count', async () => {
      mockModel.count.mockResolvedValue(42);

      const result = await repository.count();

      expect(mockModel.count).toHaveBeenCalled();
      expect(result).toBe(42);
    });
  });
});