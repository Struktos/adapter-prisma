/**
 * @fileoverview Prisma-specific Type Definitions
 * @description
 * Type definitions for Prisma Client integration with @struktos/core.
 * These types provide type-safe abstractions for Prisma's transaction
 * client and configuration options.
 *
 * @packageDocumentation
 * @module @struktos/prisma/types
 * @version 1.0.0
 */

import type { PrismaClient } from '@prisma/client';
import type { IsolationLevel } from '@struktos/core';

/**
 * Prisma transaction client type.
 *
 * Represents the client instance available within an interactive transaction.
 * This type is used to ensure type safety when working with Prisma
 * transactions.
 *
 * @remarks
 * Prisma's interactive transactions provide a transaction client (`tx`)
 * that has the same API as PrismaClient but operates within the
 * transaction boundary. All operations performed through this client
 * are part of the same transaction.
 *
 * @example
 * ```typescript
 * async function transferFunds(tx: PrismaTransactionClient) {
 *   await tx.account.update({
 *     where: { id: fromId },
 *     data: { balance: { decrement: amount } }
 *   });
 *   await tx.account.update({
 *     where: { id: toId },
 *     data: { balance: { increment: amount } }
 *   });
 * }
 * ```
 */
export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Type alias for PrismaClient for convenience.
 *
 * @remarks
 * Use this type when you need to reference the full PrismaClient
 * including connection and transaction methods.
 */
export type PrismaClientType = PrismaClient;

/**
 * Prisma transaction options configuration.
 *
 * Extends Prisma's native transaction options with additional
 * Struktos-specific configuration.
 *
 * @remarks
 * These options map to Prisma's `$transaction` method options.
 * The isolation level is converted from Struktos' enum to
 * Prisma's expected format.
 *
 * @see {@link https://www.prisma.io/docs/concepts/components/prisma-client/transactions#interactive-transactions | Prisma Interactive Transactions}
 *
 * @example
 * ```typescript
 * const options: PrismaTransactionOptions = {
 *   maxWait: 5000,
 *   timeout: 30000,
 *   isolationLevel: 'Serializable'
 * };
 * ```
 */
export interface PrismaTransactionOptions {
  /**
   * Maximum time to wait for a transaction slot in milliseconds.
   *
   * @remarks
   * If the database connection pool is exhausted, this is the maximum
   * time the transaction will wait for a connection to become available.
   *
   * @defaultValue 2000
   */
  maxWait?: number;

  /**
   * Maximum transaction duration in milliseconds.
   *
   * @remarks
   * After this time, the transaction will be automatically rolled back.
   * Set this based on your expected transaction complexity.
   *
   * @defaultValue 5000
   */
  timeout?: number;

  /**
   * Transaction isolation level.
   *
   * @remarks
   * Prisma uses different isolation level names than SQL standard.
   * The PrismaUnitOfWork automatically converts Struktos IsolationLevel
   * to Prisma's format.
   *
   * @see {@link https://www.prisma.io/docs/concepts/components/prisma-client/transactions#transaction-isolation-level | Prisma Isolation Levels}
   */
  isolationLevel?: PrismaIsolationLevel;
}

/**
 * Prisma isolation level type.
 *
 * Maps to Prisma's supported transaction isolation levels.
 *
 * @remarks
 * Not all databases support all isolation levels. Check your
 * database documentation for supported levels:
 * - PostgreSQL: All levels
 * - MySQL: All levels
 * - SQLite: Only Serializable
 * - SQL Server: All levels including Snapshot
 */
export type PrismaIsolationLevel =
  | 'ReadUncommitted'
  | 'ReadCommitted'
  | 'RepeatableRead'
  | 'Serializable'
  | 'Snapshot';

/**
 * Mapping from Struktos IsolationLevel to Prisma isolation level.
 *
 * @remarks
 * This constant provides the mapping between the framework's
 * database-agnostic isolation levels and Prisma's specific format.
 *
 * @example
 * ```typescript
 * import { IsolationLevel } from '@struktos/core';
 * import { ISOLATION_LEVEL_MAP } from '@struktos/prisma';
 *
 * const struktoLevel = IsolationLevel.Serializable;
 * const prismaLevel = ISOLATION_LEVEL_MAP[struktoLevel]; // 'Serializable'
 * ```
 */
export const ISOLATION_LEVEL_MAP: Record<IsolationLevel, PrismaIsolationLevel> = {
  READ_UNCOMMITTED: 'ReadUncommitted',
  READ_COMMITTED: 'ReadCommitted',
  REPEATABLE_READ: 'RepeatableRead',
  SERIALIZABLE: 'Serializable',
  SNAPSHOT: 'Snapshot',
} as const;

/**
 * Repository type token for dependency injection.
 *
 * Used to identify repository types when retrieving them from the Unit of Work.
 * Supports string identifiers, symbols, or class constructors.
 *
 * @template T - The repository interface type
 *
 * @example
 * ```typescript
 * // String token
 * const token1: RepositoryToken<IUserRepository> = 'UserRepository';
 *
 * // Symbol token
 * const USER_REPO = Symbol('UserRepository');
 * const token2: RepositoryToken<IUserRepository> = USER_REPO;
 *
 * // Class token
 * const token3: RepositoryToken<IUserRepository> = UserRepository;
 * ```
 */
export type RepositoryToken<T> = string | symbol | (new (...args: unknown[]) => T);

/**
 * Repository factory function type.
 *
 * A function that creates a repository instance bound to the
 * current transaction client.
 *
 * @template TRepository - The repository interface type
 *
 * @param tx - The Prisma transaction client
 * @returns A repository instance bound to the transaction
 *
 * @remarks
 * Repository factories are registered with PrismaUnitOfWork to
 * create transaction-aware repository instances. This pattern
 * ensures all repository operations participate in the same
 * transaction.
 *
 * @example
 * ```typescript
 * // Define a repository factory
 * const userRepoFactory: RepositoryFactory<IUserRepository> = (tx) => {
 *   return new PrismaUserRepository(tx);
 * };
 *
 * // Register with Unit of Work
 * unitOfWork.registerRepository('UserRepository', userRepoFactory);
 * ```
 */
export type RepositoryFactory<TRepository> = (
  tx: PrismaTransactionClient
) => TRepository;

/**
 * Savepoint information structure.
 *
 * Stores metadata about a savepoint created within a transaction.
 *
 * @remarks
 * Savepoints allow partial rollback within a transaction.
 * This structure tracks when each savepoint was created
 * for debugging and logging purposes.
 */
export interface SavepointInfo {
  /**
   * Unique name of the savepoint.
   */
  name: string;

  /**
   * Timestamp when the savepoint was created.
   */
  createdAt: Date;
}

/**
 * Unit of Work configuration options.
 *
 * Configuration for PrismaUnitOfWork instances.
 *
 * @template TContext - Context data type
 *
 * @example
 * ```typescript
 * const config: PrismaUnitOfWorkConfig = {
 *   defaultTimeout: 30000,
 *   defaultMaxWait: 5000,
 *   defaultIsolationLevel: IsolationLevel.ReadCommitted,
 *   enableSavepoints: true,
 *   logger: console
 * };
 *
 * const unitOfWorkFactory = new PrismaUnitOfWorkFactory(prisma, config);
 * ```
 */
export interface PrismaUnitOfWorkConfig {
  /**
   * Default transaction timeout in milliseconds.
   *
   * @defaultValue 30000
   */
  defaultTimeout?: number;

  /**
   * Default maximum wait time for transaction slot.
   *
   * @defaultValue 5000
   */
  defaultMaxWait?: number;

  /**
   * Default transaction isolation level.
   *
   * @defaultValue IsolationLevel.ReadCommitted
   */
  defaultIsolationLevel?: IsolationLevel;

  /**
   * Whether to enable savepoint support.
   *
   * @remarks
   * Savepoints require raw SQL execution which may not be
   * supported in all Prisma configurations.
   *
   * @defaultValue true
   */
  enableSavepoints?: boolean;

  /**
   * Logger instance for transaction lifecycle events.
   *
   * @remarks
   * If provided, the Unit of Work will log transaction start,
   * commit, rollback, and error events.
   */
  logger?: PrismaUnitOfWorkLogger;
}

/**
 * Logger interface for PrismaUnitOfWork.
 *
 * Minimal logging interface that can be implemented by
 * any logging library (winston, pino, console, etc.).
 *
 * @example
 * ```typescript
 * const logger: PrismaUnitOfWorkLogger = {
 *   debug: (msg, meta) => console.debug(msg, meta),
 *   info: (msg, meta) => console.info(msg, meta),
 *   warn: (msg, meta) => console.warn(msg, meta),
 *   error: (msg, meta) => console.error(msg, meta)
 * };
 * ```
 */
export interface PrismaUnitOfWorkLogger {
  /**
   * Log debug message.
   *
   * @param message - Log message
   * @param meta - Additional metadata
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log info message.
   *
   * @param message - Log message
   * @param meta - Additional metadata
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log warning message.
   *
   * @param message - Log message
   * @param meta - Additional metadata
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log error message.
   *
   * @param message - Log message
   * @param meta - Additional metadata
   */
  error(message: string, meta?: Record<string, unknown>): void;
}