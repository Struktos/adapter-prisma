/**
 * @fileoverview @struktos/prisma - Prisma Adapter for Struktos.js
 * @description
 * Provides Prisma-based implementations of @struktos/core abstractions,
 * including the Unit of Work pattern for transaction management and
 * base repository classes for data access.
 *
 * ## Features
 *
 * - **PrismaUnitOfWork**: Transaction management using Prisma's interactive transactions
 * - **PrismaUnitOfWorkFactory**: Factory for creating Unit of Work instances
 * - **Base Repository Classes**: Abstract classes for implementing Prisma repositories
 * - **Savepoint Support**: Partial rollback capability for PostgreSQL and MySQL
 * - **Context Integration**: Request context propagation for distributed tracing
 *
 * ## Installation
 *
 * ```bash
 * npm install @struktos/prisma @struktos/core @prisma/client
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { PrismaClient } from '@prisma/client';
 * import { PrismaUnitOfWork, PrismaUnitOfWorkFactory } from '@struktos/prisma';
 * import { IsolationLevel } from '@struktos/core';
 *
 * const prisma = new PrismaClient();
 *
 * // Create factory and register repositories
 * const uowFactory = new PrismaUnitOfWorkFactory(prisma, {
 *   defaultTimeout: 30000,
 *   defaultIsolationLevel: IsolationLevel.ReadCommitted
 * });
 *
 * uowFactory.registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx));
 * uowFactory.registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx));
 *
 * // Use in application
 * const uow = uowFactory.create();
 *
 * const result = await uow.executeInTransaction(async (unitOfWork) => {
 *   const userRepo = unitOfWork.getRepository<IUserRepository>('UserRepository');
 *   const orderRepo = unitOfWork.getRepository<IOrderRepository>('OrderRepository');
 *
 *   const user = await userRepo.create({ name: 'John', email: 'john@example.com' });
 *   await orderRepo.create({ userId: user.id, total: 99.99 });
 *
 *   return user;
 * });
 * ```
 *
 * @packageDocumentation
 * @module @struktos/prisma
 * @version 1.0.0
 *
 * @see {@link https://www.prisma.io/docs | Prisma Documentation}
 * @see {@link https://struktos.dev | Struktos.js Documentation}
 */

// ============================================================================
// Unit of Work
// ============================================================================

/**
 * Unit of Work classes for transaction management.
 * @see {@link module:@struktos/prisma/unit-of-work}
 */
export { PrismaUnitOfWork, PrismaUnitOfWorkFactory } from './unit-of-work';

// ============================================================================
// Repository
// ============================================================================

/**
 * Base repository classes for data access.
 * @see {@link module:@struktos/prisma/repository}
 */
export {
  type IRepository,
  PrismaRepository,
  PrismaCrudRepository,
  type PrismaModelDelegate,
} from './repository';

// ============================================================================
// Types
// ============================================================================

/**
 * Type definitions for Prisma integration.
 * @see {@link module:@struktos/prisma/types}
 */
export type {
  PrismaTransactionClient,
  PrismaClientType,
  PrismaTransactionOptions,
  PrismaIsolationLevel,
  RepositoryToken,
  RepositoryFactory,
  SavepointInfo,
  PrismaUnitOfWorkConfig,
  PrismaUnitOfWorkLogger,
} from './types';

export { ISOLATION_LEVEL_MAP } from './types';

// ============================================================================
// Errors
// ============================================================================

/**
 * Error classes for Unit of Work operations.
 * @see {@link module:@struktos/prisma/errors}
 */
export {
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
} from './errors';

// ============================================================================
// DI Tokens
// ============================================================================

/**
 * Dependency injection token for PrismaUnitOfWorkFactory.
 *
 * @remarks
 * Use this token when registering the factory with your DI container:
 *
 * ```typescript
 * container.bind(PRISMA_UNIT_OF_WORK_FACTORY_TOKEN).toConstantValue(
 *   new PrismaUnitOfWorkFactory(prisma, config)
 * );
 * ```
 */
export const PRISMA_UNIT_OF_WORK_FACTORY_TOKEN = Symbol('PrismaUnitOfWorkFactory');

/**
 * Dependency injection token for PrismaClient.
 *
 * @remarks
 * Use this token when registering the Prisma client with your DI container:
 *
 * ```typescript
 * container.bind(PRISMA_CLIENT_TOKEN).toConstantValue(
 *   new PrismaClient()
 * );
 * ```
 */
export const PRISMA_CLIENT_TOKEN = Symbol('PrismaClient');