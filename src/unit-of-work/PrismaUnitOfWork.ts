/**
 * @fileoverview PrismaUnitOfWork Implementation
 * @description
 * Implements the Unit of Work pattern using Prisma Client's interactive
 * transaction API. Provides atomic transaction management across multiple
 * repository operations with full support for savepoints, isolation levels,
 * and context propagation.
 *
 * @packageDocumentation
 * @module @struktos/prisma/unit-of-work
 * @version 1.0.0
 *
 * @see {@link https://www.prisma.io/docs/concepts/components/prisma-client/transactions | Prisma Transactions}
 * @see {@link https://martinfowler.com/eaaCatalog/unitOfWork.html | Unit of Work Pattern}
 */

import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  IUnitOfWork,
  IContext,
  StruktosContextData,
  TransactionOptions,
  TransactionResult,
  TransactionState,
  RepositoryToken,
  IsolationLevel,
} from '@struktos/core';

import type {
  PrismaTransactionClient,
  PrismaTransactionOptions,
  PrismaIsolationLevel,
  RepositoryFactory,
  SavepointInfo,
  PrismaUnitOfWorkConfig,
  PrismaUnitOfWorkLogger,
} from '../types/prisma.types';

import {
  TransactionError,
  TransactionAlreadyActiveError,
  NoActiveTransactionError,
  RepositoryNotRegisteredError,
  SavepointError,
  SavepointNotFoundError,
  TransactionTimeoutError,
  UnitOfWorkDisposedError,
  ErrorCodes,
} from '../errors/unit-of-work.errors';

/**
 * Internal transaction state enum (mirrors @struktos/core TransactionState)
 * @internal
 */
const TransactionStateEnum = {
  Inactive: 'INACTIVE',
  Active: 'ACTIVE',
  Committing: 'COMMITTING',
  Committed: 'COMMITTED',
  RollingBack: 'ROLLING_BACK',
  RolledBack: 'ROLLED_BACK',
  Failed: 'FAILED',
} as const;

/**
 * Isolation level mapping from Struktos to Prisma format.
 * @internal
 */
const ISOLATION_LEVEL_MAP: Record<string, PrismaIsolationLevel> = {
  READ_UNCOMMITTED: 'ReadUncommitted',
  READ_COMMITTED: 'ReadCommitted',
  REPEATABLE_READ: 'RepeatableRead',
  SERIALIZABLE: 'Serializable',
  SNAPSHOT: 'Snapshot',
};

/**
 * PrismaUnitOfWork - Prisma-based implementation of the Unit of Work pattern.
 *
 * This class provides transaction management using Prisma's interactive
 * transaction API. It coordinates multiple repository operations within
 * a single atomic transaction, ensuring data consistency.
 *
 * @template TContext - Context data type extending StruktosContextData
 *
 * @remarks
 * **Key Features:**
 * - Interactive transactions with automatic rollback on errors
 * - Support for all standard isolation levels
 * - Savepoint support for partial rollbacks (PostgreSQL, MySQL)
 * - Integration with Struktos context for distributed tracing
 * - Transaction-scoped repository instances
 *
 * **Usage Pattern:**
 * 1. Create via factory or constructor
 * 2. Register repository factories
 * 3. Start transaction
 * 4. Get repositories and perform operations
 * 5. Commit or rollback
 * 6. Dispose when done
 *
 * **Thread Safety:**
 * Each Unit of Work instance should be used by a single request/thread.
 * Do not share instances across concurrent operations.
 *
 * @example Basic Usage
 * ```typescript
 * const uow = new PrismaUnitOfWork(prisma);
 *
 * // Register repositories
 * uow.registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx));
 * uow.registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx));
 *
 * try {
 *   await uow.start({ isolationLevel: IsolationLevel.ReadCommitted });
 *
 *   const userRepo = uow.getRepository<IUserRepository>('UserRepository');
 *   const orderRepo = uow.getRepository<IOrderRepository>('OrderRepository');
 *
 *   const user = await userRepo.create({ name: 'John', email: 'john@example.com' });
 *   await orderRepo.create({ userId: user.id, total: 99.99 });
 *
 *   await uow.commit();
 * } catch (error) {
 *   await uow.rollback();
 *   throw error;
 * } finally {
 *   await uow.dispose();
 * }
 * ```
 *
 * @example Using executeInTransaction Helper
 * ```typescript
 * const uow = new PrismaUnitOfWork(prisma);
 * uow.registerRepository('AccountRepository', (tx) => new PrismaAccountRepository(tx));
 *
 * const result = await uow.executeInTransaction(async (unitOfWork) => {
 *   const accountRepo = unitOfWork.getRepository<IAccountRepository>('AccountRepository');
 *
 *   await accountRepo.debit(fromAccountId, amount);
 *   await accountRepo.credit(toAccountId, amount);
 *
 *   return { success: true, transferId: generateId() };
 * }, { isolationLevel: IsolationLevel.Serializable });
 * ```
 *
 * @example With Context Integration
 * ```typescript
 * const ctx = RequestContext.current();
 * const uow = new PrismaUnitOfWork(prisma);
 *
 * uow.setContext(ctx);
 *
 * await uow.executeInTransaction(async (unitOfWork) => {
 *   // Operations are automatically traced with the request context
 *   const repo = unitOfWork.getRepository<IOrderRepository>('OrderRepository');
 *   return repo.create(orderData);
 * });
 * ```
 */
export class PrismaUnitOfWork<TContext extends StruktosContextData = StruktosContextData>
  implements IUnitOfWork<TContext>
{
  /**
   * Unique identifier for this Unit of Work instance.
   * @readonly
   */
  public readonly id: string;

  /**
   * Current transaction state.
   * @private
   */
  private _state: TransactionState;

  /**
   * Associated request context.
   * @private
   */
  private _context?: IContext<TContext>;

  /**
   * Prisma client instance.
   * @private
   */
  private readonly prisma: PrismaClient;

  /**
   * Current transaction client (available during active transaction).
   * @private
   */
  private txClient: PrismaTransactionClient | null = null;

  /**
   * Registered repository factories.
   * @private
   */
  private readonly repositoryFactories: Map<string | symbol, RepositoryFactory<unknown>> = new Map();

  /**
   * Cached repository instances for the current transaction.
   * @private
   */
  private readonly repositoryCache: Map<string | symbol, unknown> = new Map();

  /**
   * Active savepoints within the current transaction.
   * @private
   */
  private readonly savepoints: Map<string, SavepointInfo> = new Map();

  /**
   * Transaction start time for duration calculation.
   * @private
   */
  private transactionStartTime: number = 0;

  /**
   * Current transaction options.
   * @private
   */
  private currentOptions: TransactionOptions | null = null;

  /**
   * Whether the Unit of Work has been disposed.
   * @private
   */
  private disposed: boolean = false;

  /**
   * Transaction result to be returned.
   * @private
   */
  private transactionResult: TransactionResult | null = null;

  /**
   * Configuration options.
   * @private
   */
  private readonly config: Required<Omit<PrismaUnitOfWorkConfig, 'logger'>> & {
    logger?: PrismaUnitOfWorkLogger;
  };

  /**
   * Promise resolve function for commit.
   * @private
   */
  private commitResolve: ((value: void) => void) | null = null;

  /**
   * Promise reject function for rollback.
   * @private
   */
  private rollbackReject: ((reason: Error) => void) | null = null;

  /**
   * Creates a new PrismaUnitOfWork instance.
   *
   * @param prisma - Prisma client instance
   * @param config - Optional configuration options
   *
   * @example
   * ```typescript
   * const prisma = new PrismaClient();
   * const uow = new PrismaUnitOfWork(prisma);
   * ```
   *
   * @example With Configuration
   * ```typescript
   * const uow = new PrismaUnitOfWork(prisma, {
   *   defaultTimeout: 60000,
   *   defaultIsolationLevel: IsolationLevel.RepeatableRead,
   *   logger: winston.createLogger({ ... })
   * });
   * ```
   */
  constructor(prisma: PrismaClient, config?: PrismaUnitOfWorkConfig) {
    this.id = randomUUID();
    this.prisma = prisma;
    this._state = TransactionStateEnum.Inactive as TransactionState;

    // Apply defaults
    this.config = {
      defaultTimeout: config?.defaultTimeout ?? 30000,
      defaultMaxWait: config?.defaultMaxWait ?? 5000,
      defaultIsolationLevel: config?.defaultIsolationLevel ?? ('READ_COMMITTED' as IsolationLevel),
      enableSavepoints: config?.enableSavepoints ?? true,
      logger: config?.logger,
    };

    this.log('debug', 'PrismaUnitOfWork created', { id: this.id });
  }

  /**
   * Gets the current transaction state.
   *
   * @returns Current transaction state
   *
   * @example
   * ```typescript
   * if (uow.state === TransactionState.Active) {
   *   // Transaction is active
   * }
   * ```
   */
  public get state(): TransactionState {
    return this._state;
  }

  /**
   * Gets the associated request context.
   *
   * @returns The associated context or undefined
   */
  public get context(): IContext<TContext> | undefined {
    return this._context;
  }

  /**
   * Registers a repository factory with this Unit of Work.
   *
   * Repository factories create repository instances bound to the
   * current transaction client. This enables transaction-aware
   * repository operations.
   *
   * @template TRepository - The repository interface type
   * @param token - Unique identifier for the repository
   * @param factory - Factory function that creates the repository
   * @returns This Unit of Work instance for chaining
   *
   * @remarks
   * - Register all repositories before starting the transaction
   * - Factories receive the Prisma transaction client
   * - Repository instances are cached per transaction
   *
   * @example
   * ```typescript
   * uow
   *   .registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx))
   *   .registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx))
   *   .registerRepository(PRODUCT_REPO, (tx) => new PrismaProductRepository(tx));
   * ```
   */
  public registerRepository<TRepository>(
    token: RepositoryToken<TRepository>,
    factory: RepositoryFactory<TRepository>
  ): this {
    this.ensureNotDisposed('registerRepository');
    const key = this.normalizeToken(token);
    this.repositoryFactories.set(key, factory as RepositoryFactory<unknown>);
    this.log('debug', 'Repository registered', { token: key.toString(), unitOfWorkId: this.id });
    return this;
  }

  /**
   * Starts a new transaction.
   *
   * Begins a database transaction with the specified options.
   * Must be called before any repository operations.
   *
   * @param options - Transaction configuration options
   * @returns Promise that resolves when the transaction is started
   * @throws {TransactionAlreadyActiveError} If a transaction is already active
   * @throws {UnitOfWorkDisposedError} If the Unit of Work is disposed
   * @throws {TransactionError} If transaction start fails
   *
   * @remarks
   * This method uses Prisma's interactive transaction API internally.
   * The transaction remains open until commit() or rollback() is called.
   *
   * @example
   * ```typescript
   * // Start with defaults
   * await uow.start();
   *
   * // Start with custom options
   * await uow.start({
   *   isolationLevel: IsolationLevel.Serializable,
   *   timeout: 60000,
   *   readOnly: true
   * });
   * ```
   */
  public async start(options?: TransactionOptions): Promise<void> {
    this.ensureNotDisposed('start');

    if (this._state !== TransactionStateEnum.Inactive) {
      throw new TransactionAlreadyActiveError(this.id, this.getTraceId());
    }

    this.currentOptions = options ?? {};
    this.transactionStartTime = Date.now();
    this._state = TransactionStateEnum.Active as TransactionState;

    const prismaOptions = this.buildPrismaOptions(this.currentOptions);

    this.log('info', 'Starting transaction', {
      unitOfWorkId: this.id,
      isolationLevel: prismaOptions.isolationLevel,
      timeout: prismaOptions.timeout,
      traceId: this.getTraceId(),
    });

    // Create a promise that will be resolved by commit() or rejected by rollback()
    return new Promise<void>((resolve, reject) => {
      // Start the interactive transaction
      this.prisma
        .$transaction(
          async (tx: PrismaTransactionClient) => {
            this.txClient = tx;

            // Wait for commit or rollback signal
            await new Promise<void>((commitResolve, rollbackReject) => {
              this.commitResolve = commitResolve;
              this.rollbackReject = rollbackReject;

              // Signal that transaction is ready
              resolve();
            });
          },
          prismaOptions
        )
        .then(() => {
          // Transaction committed successfully
          this._state = TransactionStateEnum.Committed as TransactionState;
          this.log('info', 'Transaction committed', {
            unitOfWorkId: this.id,
            duration: Date.now() - this.transactionStartTime,
            traceId: this.getTraceId(),
          });
        })
        .catch((error: Error) => {
          // Transaction failed or rolled back
          if (this._state === TransactionStateEnum.RollingBack) {
            this._state = TransactionStateEnum.RolledBack as TransactionState;
            this.log('info', 'Transaction rolled back', {
              unitOfWorkId: this.id,
              duration: Date.now() - this.transactionStartTime,
              traceId: this.getTraceId(),
            });
          } else {
            this._state = TransactionStateEnum.Failed as TransactionState;
            this.log('error', 'Transaction failed', {
              unitOfWorkId: this.id,
              error: error.message,
              traceId: this.getTraceId(),
            });

            // Check for timeout error
            if (this.isTimeoutError(error)) {
              reject(
                new TransactionTimeoutError(
                  prismaOptions.timeout ?? this.config.defaultTimeout,
                  this.id,
                  this.getTraceId(),
                  error
                )
              );
            }
          }
        });
    });
  }

  /**
   * Commits the current transaction.
   *
   * Persists all changes made within the transaction to the database.
   * After commit, the Unit of Work returns to inactive state.
   *
   * @returns Promise resolving to the transaction result
   * @throws {NoActiveTransactionError} If no transaction is active
   * @throws {UnitOfWorkDisposedError} If the Unit of Work is disposed
   * @throws {TransactionError} If commit fails
   *
   * @example
   * ```typescript
   * const result = await uow.commit();
   * console.log(`Transaction completed in ${result.duration}ms`);
   * ```
   */
  public async commit(): Promise<TransactionResult> {
    this.ensureNotDisposed('commit');
    this.ensureActiveTransaction('commit');

    this._state = TransactionStateEnum.Committing as TransactionState;

    const duration = Date.now() - this.transactionStartTime;
    const result: TransactionResult = {
      success: true,
      duration,
      traceId: this.getTraceId(),
    };

    try {
      // Signal the transaction to complete successfully
      if (this.commitResolve) {
        this.commitResolve();
        this.commitResolve = null;
        this.rollbackReject = null;
      }

      this.clearTransactionState();
      this.transactionResult = result;

      return result;
    } catch (error) {
      this._state = TransactionStateEnum.Failed as TransactionState;
      const txError = error instanceof Error ? error : new Error(String(error));

      throw new TransactionError('Failed to commit transaction', ErrorCodes.TRANSACTION_COMMIT_FAILED, {
        cause: txError,
        unitOfWorkId: this.id,
        traceId: this.getTraceId(),
        state: this._state,
      });
    }
  }

  /**
   * Rolls back the current transaction.
   *
   * Reverts all changes made within the transaction scope.
   * Should be called when an error occurs or business rules are violated.
   *
   * @returns Promise resolving to the transaction result
   * @throws {NoActiveTransactionError} If no transaction is active
   * @throws {UnitOfWorkDisposedError} If the Unit of Work is disposed
   *
   * @example
   * ```typescript
   * try {
   *   await performBusinessLogic(uow);
   *   await uow.commit();
   * } catch (error) {
   *   const result = await uow.rollback();
   *   console.log('Rolled back transaction');
   * }
   * ```
   */
  public async rollback(): Promise<TransactionResult> {
    this.ensureNotDisposed('rollback');

    // Allow rollback even if no active transaction (idempotent)
    if (
      this._state === TransactionStateEnum.Inactive ||
      this._state === TransactionStateEnum.Committed ||
      this._state === TransactionStateEnum.RolledBack
    ) {
      return {
        success: true,
        duration: 0,
        traceId: this.getTraceId(),
      };
    }

    this._state = TransactionStateEnum.RollingBack as TransactionState;

    const duration = Date.now() - this.transactionStartTime;
    const result: TransactionResult = {
      success: true,
      duration,
      traceId: this.getTraceId(),
    };

    try {
      // Signal the transaction to rollback by rejecting
      if (this.rollbackReject) {
        this.rollbackReject(new Error('Transaction rolled back'));
        this.rollbackReject = null;
        this.commitResolve = null;
      }

      this.clearTransactionState();
      this.transactionResult = result;

      return result;
    } catch (error) {
      this._state = TransactionStateEnum.Failed as TransactionState;
      const txError = error instanceof Error ? error : new Error(String(error));

      return {
        success: false,
        duration,
        error: txError,
        traceId: this.getTraceId(),
      };
    }
  }

  /**
   * Gets a repository instance within the current transaction scope.
   *
   * Returns a repository that participates in the active transaction.
   * All operations through this repository are part of the transaction.
   *
   * @template TRepository - The repository interface type
   * @param token - Repository identifier
   * @returns Repository instance bound to the current transaction
   * @throws {NoActiveTransactionError} If no transaction is active
   * @throws {RepositoryNotRegisteredError} If repository is not registered
   * @throws {UnitOfWorkDisposedError} If the Unit of Work is disposed
   *
   * @example
   * ```typescript
   * const userRepo = uow.getRepository<IUserRepository>('UserRepository');
   * const user = await userRepo.findById(userId);
   * ```
   */
  public getRepository<TRepository>(token: RepositoryToken<TRepository>): TRepository {
    this.ensureNotDisposed('getRepository');
    this.ensureActiveTransaction('getRepository');

    const key = this.normalizeToken(token);

    // Check cache first
    if (this.repositoryCache.has(key)) {
      return this.repositoryCache.get(key) as TRepository;
    }

    // Get factory
    const factory = this.repositoryFactories.get(key) as RepositoryFactory<TRepository> | undefined;
    if (!factory) {
      throw new RepositoryNotRegisteredError(key, this.id, this.getTraceId());
    }

    // Create repository with transaction client
    const repository = factory(this.txClient!);
    this.repositoryCache.set(key, repository);

    return repository;
  }

  /**
   * Checks if a repository is registered with this Unit of Work.
   *
   * @param token - Repository identifier
   * @returns True if the repository is registered
   *
   * @example
   * ```typescript
   * if (uow.hasRepository('UserRepository')) {
   *   const repo = uow.getRepository<IUserRepository>('UserRepository');
   * }
   * ```
   */
  public hasRepository(token: RepositoryToken<unknown>): boolean {
    const key = this.normalizeToken(token);
    return this.repositoryFactories.has(key);
  }

  /**
   * Executes a function within a transaction scope.
   *
   * Convenience method that handles transaction lifecycle automatically.
   * Starts a transaction, executes the callback, and commits on success
   * or rolls back on failure.
   *
   * @template TResult - Return type of the callback
   * @param callback - Function to execute within the transaction
   * @param options - Transaction configuration options
   * @returns Promise resolving to the callback result
   * @throws Rethrows any error from the callback after rollback
   *
   * @example
   * ```typescript
   * const result = await uow.executeInTransaction(async (unitOfWork) => {
   *   const userRepo = unitOfWork.getRepository<IUserRepository>('UserRepository');
   *   return userRepo.create({ name: 'John', email: 'john@example.com' });
   * });
   * ```
   */
  public async executeInTransaction<TResult>(
    callback: (unitOfWork: IUnitOfWork<TContext>) => Promise<TResult>,
    options?: TransactionOptions
  ): Promise<TResult> {
    this.ensureNotDisposed('executeInTransaction');

    await this.start(options);

    try {
      const result = await callback(this);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  /**
   * Creates a savepoint within the current transaction.
   *
   * Savepoints allow partial rollback within a transaction,
   * enabling nested transaction-like behavior.
   *
   * @param name - Unique name for the savepoint
   * @throws {NoActiveTransactionError} If no transaction is active
   * @throws {SavepointError} If savepoints are not enabled or creation fails
   *
   * @remarks
   * Savepoint support depends on the database. PostgreSQL and MySQL
   * support savepoints, while SQLite does not.
   *
   * @example
   * ```typescript
   * await uow.start();
   * await createUser(uow);
   *
   * await uow.createSavepoint('before_order');
   * try {
   *   await createOrder(uow);
   * } catch (error) {
   *   await uow.rollbackToSavepoint('before_order');
   *   // User is still created, order is rolled back
   * }
   *
   * await uow.commit();
   * ```
   */
  public async createSavepoint(name: string): Promise<void> {
    this.ensureNotDisposed('createSavepoint');
    this.ensureActiveTransaction('createSavepoint');
    this.ensureSavepointsEnabled();

    if (this.savepoints.has(name)) {
      throw new SavepointError(
        `Savepoint '${name}' already exists`,
        ErrorCodes.SAVEPOINT_CREATE_FAILED,
        { unitOfWorkId: this.id, traceId: this.getTraceId(), savepointName: name }
      );
    }

    try {
      // Execute raw SQL to create savepoint
      await (this.txClient as any).$executeRawUnsafe(`SAVEPOINT "${name}"`);

      this.savepoints.set(name, {
        name,
        createdAt: new Date(),
      });

      this.log('debug', 'Savepoint created', {
        savepointName: name,
        unitOfWorkId: this.id,
        traceId: this.getTraceId(),
      });
    } catch (error) {
      throw new SavepointError(
        `Failed to create savepoint '${name}'`,
        ErrorCodes.SAVEPOINT_CREATE_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          unitOfWorkId: this.id,
          traceId: this.getTraceId(),
          savepointName: name,
        }
      );
    }
  }

  /**
   * Rolls back to a previously created savepoint.
   *
   * Reverts all changes made after the savepoint was created.
   *
   * @param name - Name of the savepoint to rollback to
   * @throws {SavepointNotFoundError} If savepoint doesn't exist
   * @throws {NoActiveTransactionError} If no transaction is active
   *
   * @example
   * ```typescript
   * await uow.rollbackToSavepoint('before_risky_operation');
   * ```
   */
  public async rollbackToSavepoint(name: string): Promise<void> {
    this.ensureNotDisposed('rollbackToSavepoint');
    this.ensureActiveTransaction('rollbackToSavepoint');
    this.ensureSavepointsEnabled();

    if (!this.savepoints.has(name)) {
      throw new SavepointNotFoundError(name, this.id, this.getTraceId());
    }

    try {
      await (this.txClient as any).$executeRawUnsafe(`ROLLBACK TO SAVEPOINT "${name}"`);

      // Remove savepoints created after this one
      const savepointTime = this.savepoints.get(name)!.createdAt;
      for (const [spName, spInfo] of this.savepoints) {
        if (spInfo.createdAt > savepointTime) {
          this.savepoints.delete(spName);
        }
      }

      // Clear repository cache as state may have changed
      this.repositoryCache.clear();

      this.log('debug', 'Rolled back to savepoint', {
        savepointName: name,
        unitOfWorkId: this.id,
        traceId: this.getTraceId(),
      });
    } catch (error) {
      throw new SavepointError(
        `Failed to rollback to savepoint '${name}'`,
        ErrorCodes.SAVEPOINT_ROLLBACK_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          unitOfWorkId: this.id,
          traceId: this.getTraceId(),
          savepointName: name,
        }
      );
    }
  }

  /**
   * Releases a savepoint without rolling back.
   *
   * Removes the savepoint from the transaction, keeping all changes.
   *
   * @param name - Name of the savepoint to release
   * @throws {SavepointNotFoundError} If savepoint doesn't exist
   *
   * @example
   * ```typescript
   * await uow.createSavepoint('checkpoint');
   * await performOperation();
   * await uow.releaseSavepoint('checkpoint');
   * ```
   */
  public async releaseSavepoint(name: string): Promise<void> {
    this.ensureNotDisposed('releaseSavepoint');
    this.ensureActiveTransaction('releaseSavepoint');
    this.ensureSavepointsEnabled();

    if (!this.savepoints.has(name)) {
      throw new SavepointNotFoundError(name, this.id, this.getTraceId());
    }

    try {
      await (this.txClient as any).$executeRawUnsafe(`RELEASE SAVEPOINT "${name}"`);
      this.savepoints.delete(name);

      this.log('debug', 'Savepoint released', {
        savepointName: name,
        unitOfWorkId: this.id,
        traceId: this.getTraceId(),
      });
    } catch (error) {
      throw new SavepointError(
        `Failed to release savepoint '${name}'`,
        ErrorCodes.SAVEPOINT_RELEASE_FAILED,
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          unitOfWorkId: this.id,
          traceId: this.getTraceId(),
          savepointName: name,
        }
      );
    }
  }

  /**
   * Sets the request context for this Unit of Work.
   *
   * Associates a request context with the transaction for
   * tracing, logging, and cancellation support.
   *
   * @param context - Request context to associate
   *
   * @example
   * ```typescript
   * const ctx = RequestContext.current();
   * uow.setContext(ctx);
   * ```
   */
  public setContext(context: IContext<TContext>): void {
    this.ensureNotDisposed('setContext');
    this._context = context;

    this.log('debug', 'Context set', {
      unitOfWorkId: this.id,
      traceId: context.get('traceId' as keyof TContext),
    });
  }

  /**
   * Disposes of the Unit of Work and releases resources.
   *
   * If a transaction is active, it will be rolled back.
   * After disposal, the Unit of Work cannot be reused.
   *
   * @returns Promise that resolves when disposal is complete
   *
   * @example
   * ```typescript
   * const uow = new PrismaUnitOfWork(prisma);
   * try {
   *   // ... operations
   * } finally {
   *   await uow.dispose();
   * }
   * ```
   */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.log('debug', 'Disposing Unit of Work', { unitOfWorkId: this.id });

    // Rollback if transaction is active
    if (
      this._state === TransactionStateEnum.Active ||
      this._state === TransactionStateEnum.Committing
    ) {
      this.log('warn', 'Disposing with active transaction, rolling back', {
        unitOfWorkId: this.id,
        state: this._state,
      });
      await this.rollback();
    }

    this.clearTransactionState();
    this.repositoryFactories.clear();
    this.disposed = true;

    this.log('debug', 'Unit of Work disposed', { unitOfWorkId: this.id });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Normalizes a repository token to a consistent key format.
   * @private
   */
  private normalizeToken(token: RepositoryToken<unknown>): string | symbol {
    if (typeof token === 'string' || typeof token === 'symbol') {
      return token;
    }
    // For class references, use the class name
    return token.name || token.toString();
  }

  /**
   * Ensures the Unit of Work is not disposed.
   * @private
   */
  private ensureNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new UnitOfWorkDisposedError(operation, this.id, this.getTraceId());
    }
  }

  /**
   * Ensures a transaction is active.
   * @private
   */
  private ensureActiveTransaction(operation: string): void {
    if (this._state !== TransactionStateEnum.Active || !this.txClient) {
      throw new NoActiveTransactionError(operation, this.id, this.getTraceId());
    }
  }

  /**
   * Ensures savepoints are enabled.
   * @private
   */
  private ensureSavepointsEnabled(): void {
    if (!this.config.enableSavepoints) {
      throw new SavepointError(
        'Savepoints are disabled in configuration',
        'SAVEPOINTS_DISABLED',
        { unitOfWorkId: this.id, traceId: this.getTraceId() }
      );
    }
  }

  /**
   * Builds Prisma transaction options from Struktos options.
   * @private
   */
  private buildPrismaOptions(options: TransactionOptions): PrismaTransactionOptions {
    const prismaOptions: PrismaTransactionOptions = {
      maxWait: this.config.defaultMaxWait,
      timeout: options.timeout ?? this.config.defaultTimeout,
    };

    // Map isolation level
    if (options.isolationLevel) {
      prismaOptions.isolationLevel = ISOLATION_LEVEL_MAP[options.isolationLevel];
    } else if (this.config.defaultIsolationLevel) {
      prismaOptions.isolationLevel = ISOLATION_LEVEL_MAP[this.config.defaultIsolationLevel];
    }

    return prismaOptions;
  }

  /**
   * Clears transaction-related state.
   * @private
   */
  private clearTransactionState(): void {
    this.txClient = null;
    this.repositoryCache.clear();
    this.savepoints.clear();
    this.currentOptions = null;
    this.commitResolve = null;
    this.rollbackReject = null;
  }

  /**
   * Gets the trace ID from the context.
   * @private
   */
  private getTraceId(): string | undefined {
    return this._context?.get('traceId' as keyof TContext) as string | undefined;
  }

  /**
   * Checks if an error is a timeout error.
   * @private
   */
  private isTimeoutError(error: Error): boolean {
    return (
      error.message.includes('timeout') ||
      error.message.includes('Transaction API error') ||
      (error as any).code === 'P2024'
    );
  }

  /**
   * Logs a message using the configured logger.
   * @private
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>
  ): void {
    this.config.logger?.[level](message, meta);
  }
}