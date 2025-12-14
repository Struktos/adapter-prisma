/**
 * @fileoverview Prisma Repository Base Classes
 * @description
 * Base classes for implementing repositories that work with PrismaUnitOfWork.
 * These classes provide a foundation for transaction-aware data access.
 *
 * @packageDocumentation
 * @module @struktos/prisma/repository
 * @version 1.0.0
 */

import type { PrismaTransactionClient } from '../types/prisma.types';

/**
 * Generic repository interface for basic CRUD operations.
 *
 * @template TEntity - The entity type
 * @template TId - The entity ID type
 *
 * @remarks
 * This interface defines the standard repository contract.
 * Implementations should provide database-specific logic.
 */
export interface IRepository<TEntity, TId = string> {
  /**
   * Finds an entity by its ID.
   *
   * @param id - The entity ID
   * @returns The entity or null if not found
   */
  findById(id: TId): Promise<TEntity | null>;

  /**
   * Finds all entities.
   *
   * @returns Array of all entities
   */
  findAll(): Promise<TEntity[]>;

  /**
   * Creates a new entity.
   *
   * @param data - The entity data (without ID)
   * @returns The created entity with ID
   */
  create(data: Omit<TEntity, 'id'>): Promise<TEntity>;

  /**
   * Updates an existing entity.
   *
   * @param id - The entity ID
   * @param data - Partial entity data to update
   * @returns The updated entity or null if not found
   */
  update(id: TId, data: Partial<TEntity>): Promise<TEntity | null>;

  /**
   * Deletes an entity by ID.
   *
   * @param id - The entity ID
   * @returns True if deleted, false if not found
   */
  delete(id: TId): Promise<boolean>;

  /**
   * Counts all entities.
   *
   * @returns Total count of entities
   */
  count(): Promise<number>;
}

/**
 * PrismaRepository - Abstract base class for Prisma-based repositories.
 *
 * This class provides a foundation for implementing repositories that
 * work with PrismaUnitOfWork. It accepts either a full PrismaClient
 * or a transaction client, enabling both standalone and transactional use.
 *
 * @template TEntity - The entity type
 * @template TId - The entity ID type (defaults to string)
 * @template TModel - The Prisma model delegate type
 *
 * @remarks
 * **Key Features:**
 * - Works with both standalone Prisma client and transaction client
 * - Type-safe access to the Prisma model delegate
 * - Ready for Unit of Work integration
 *
 * **Implementation Notes:**
 * Subclasses must implement the abstract `getModelDelegate` method
 * to provide access to the specific Prisma model.
 *
 * @example Implementation
 * ```typescript
 * import { PrismaClient, User } from '@prisma/client';
 *
 * export class PrismaUserRepository extends PrismaRepository<User, string> {
 *   protected getModelDelegate() {
 *     return this.client.user;
 *   }
 *
 *   async findById(id: string): Promise<User | null> {
 *     return this.model.findUnique({ where: { id } });
 *   }
 *
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.model.findUnique({ where: { email } });
 *   }
 *
 *   async findAll(): Promise<User[]> {
 *     return this.model.findMany();
 *   }
 *
 *   async create(data: Omit<User, 'id'>): Promise<User> {
 *     return this.model.create({ data });
 *   }
 *
 *   async update(id: string, data: Partial<User>): Promise<User | null> {
 *     try {
 *       return await this.model.update({ where: { id }, data });
 *     } catch {
 *       return null;
 *     }
 *   }
 *
 *   async delete(id: string): Promise<boolean> {
 *     try {
 *       await this.model.delete({ where: { id } });
 *       return true;
 *     } catch {
 *       return false;
 *     }
 *   }
 * }
 * ```
 *
 * @example Usage with Unit of Work
 * ```typescript
 * // Register repository factory
 * uow.registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx));
 *
 * // Use within transaction
 * await uow.executeInTransaction(async (unitOfWork) => {
 *   const userRepo = unitOfWork.getRepository<IUserRepository>('UserRepository');
 *   return userRepo.create({ name: 'John', email: 'john@example.com' });
 * });
 * ```
 *
 * @example Standalone Usage
 * ```typescript
 * const prisma = new PrismaClient();
 * const userRepo = new PrismaUserRepository(prisma);
 *
 * const user = await userRepo.findById('user-123');
 * ```
 */
export abstract class PrismaRepository<TEntity, TId = string, TModel = unknown>
  implements IRepository<TEntity, TId>
{
  /**
   * The Prisma client or transaction client.
   * @protected
   */
  protected readonly client: PrismaTransactionClient;

  /**
   * Cached model delegate for performance.
   * @private
   */
  private _model: TModel | null = null;

  /**
   * Creates a new PrismaRepository instance.
   *
   * @param client - Prisma client or transaction client
   *
   * @example
   * ```typescript
   * // With full Prisma client
   * const repo = new PrismaUserRepository(prismaClient);
   *
   * // With transaction client (from Unit of Work)
   * const repo = new PrismaUserRepository(txClient);
   * ```
   */
  constructor(client: PrismaTransactionClient) {
    this.client = client;
  }

  /**
   * Gets the Prisma model delegate for this repository.
   *
   * @returns The model delegate (cached for performance)
   *
   * @example
   * ```typescript
   * // Access model methods
   * const users = await this.model.findMany({ where: { isActive: true } });
   * ```
   */
  protected get model(): TModel {
    if (!this._model) {
      this._model = this.getModelDelegate();
    }
    return this._model;
  }

  /**
   * Returns the Prisma model delegate for this entity.
   *
   * Subclasses must implement this method to provide access
   * to the specific Prisma model (e.g., `prisma.user`).
   *
   * @returns The Prisma model delegate
   *
   * @example
   * ```typescript
   * protected getModelDelegate() {
   *   return this.client.user;
   * }
   * ```
   */
  protected abstract getModelDelegate(): TModel;

  /**
   * Finds an entity by its ID.
   *
   * @param id - The entity ID
   * @returns The entity or null if not found
   */
  public abstract findById(id: TId): Promise<TEntity | null>;

  /**
   * Finds all entities.
   *
   * @returns Array of all entities
   */
  public abstract findAll(): Promise<TEntity[]>;

  /**
   * Creates a new entity.
   *
   * @param data - The entity data
   * @returns The created entity
   */
  public abstract create(data: Omit<TEntity, 'id'>): Promise<TEntity>;

  /**
   * Updates an existing entity.
   *
   * @param id - The entity ID
   * @param data - Partial entity data to update
   * @returns The updated entity or null
   */
  public abstract update(id: TId, data: Partial<TEntity>): Promise<TEntity | null>;

  /**
   * Deletes an entity by ID.
   *
   * @param id - The entity ID
   * @returns True if deleted
   */
  public abstract delete(id: TId): Promise<boolean>;

  /**
   * Counts all entities.
   *
   * Default implementation - override for optimized counting.
   *
   * @returns Total count
   */
  public async count(): Promise<number> {
    const all = await this.findAll();
    return all.length;
  }
}

/**
 * PrismaCrudRepository - Abstract base class with standard CRUD implementations.
 *
 * This class provides default implementations for common CRUD operations
 * using Prisma's standard model methods. Subclasses only need to implement
 * the `getModelDelegate` method.
 *
 * @template TEntity - The entity type (must have an 'id' field)
 * @template TId - The entity ID type
 *
 * @remarks
 * This class assumes the Prisma model has standard methods:
 * - findUnique, findMany, create, update, delete, count
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   email: string;
 *   createdAt: Date;
 * }
 *
 * class PrismaUserRepository extends PrismaCrudRepository<User, string> {
 *   protected getModelDelegate() {
 *     return this.client.user;
 *   }
 *
 *   // Add custom methods
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.model.findUnique({ where: { email } });
 *   }
 *
 *   async findActive(): Promise<User[]> {
 *     return this.model.findMany({ where: { isActive: true } });
 *   }
 * }
 * ```
 */
export abstract class PrismaCrudRepository<
  TEntity extends { id: TId },
  TId = string,
> extends PrismaRepository<TEntity, TId, PrismaModelDelegate<TEntity, TId>> {
  /**
   * Finds an entity by its ID.
   *
   * @param id - The entity ID
   * @returns The entity or null if not found
   */
  public async findById(id: TId): Promise<TEntity | null> {
    return this.model.findUnique({ where: { id } as any });
  }

  /**
   * Finds all entities.
   *
   * @returns Array of all entities
   */
  public async findAll(): Promise<TEntity[]> {
    return this.model.findMany();
  }

  /**
   * Creates a new entity.
   *
   * @param data - The entity data
   * @returns The created entity
   */
  public async create(data: Omit<TEntity, 'id'>): Promise<TEntity> {
    return this.model.create({ data } as any);
  }

  /**
   * Updates an existing entity.
   *
   * @param id - The entity ID
   * @param data - Partial entity data to update
   * @returns The updated entity or null
   */
  public async update(id: TId, data: Partial<TEntity>): Promise<TEntity | null> {
    try {
      return await this.model.update({
        where: { id } as any,
        data: data as any,
      });
    } catch (error) {
      // Return null if record not found (P2025)
      if ((error as any)?.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes an entity by ID.
   *
   * @param id - The entity ID
   * @returns True if deleted
   */
  public async delete(id: TId): Promise<boolean> {
    try {
      await this.model.delete({ where: { id } as any });
      return true;
    } catch (error) {
      // Return false if record not found (P2025)
      if ((error as any)?.code === 'P2025') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Counts all entities.
   *
   * @returns Total count
   */
  public async count(): Promise<number> {
    return this.model.count();
  }
}

/**
 * Type helper for Prisma model delegate.
 *
 * Represents a Prisma model with standard CRUD methods.
 *
 * @template TEntity - The entity type
 * @template TId - The entity ID type
 */
export interface PrismaModelDelegate<TEntity, TId = string> {
  /**
   * Find a unique record.
   */
  findUnique(args: { where: { id: TId } }): Promise<TEntity | null>;

  /**
   * Find many records.
   */
  findMany(args?: unknown): Promise<TEntity[]>;

  /**
   * Create a record.
   */
  create(args: { data: Omit<TEntity, 'id'> }): Promise<TEntity>;

  /**
   * Update a record.
   */
  update(args: { where: { id: TId }; data: Partial<TEntity> }): Promise<TEntity>;

  /**
   * Delete a record.
   */
  delete(args: { where: { id: TId } }): Promise<TEntity>;

  /**
   * Count records.
   */
  count(args?: unknown): Promise<number>;
}