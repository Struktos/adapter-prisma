/**
 * @fileoverview PrismaUnitOfWorkFactory Implementation
 * @description
 * Factory for creating PrismaUnitOfWork instances. This factory manages
 * shared configuration and repository factory registration, enabling
 * consistent Unit of Work creation across the application.
 *
 * @packageDocumentation
 * @module @struktos/prisma/unit-of-work
 * @version 1.0.0
 */

import type { PrismaClient } from '@prisma/client';
import type {
  IUnitOfWork,
  IUnitOfWorkFactory,
  IContext,
  StruktosContextData,
} from '@struktos/core';

import { PrismaUnitOfWork } from './PrismaUnitOfWork';
import type {
  PrismaUnitOfWorkConfig,
  RepositoryFactory,
  RepositoryToken,
} from '../types/prisma.types';

/**
 * PrismaUnitOfWorkFactory - Factory for creating PrismaUnitOfWork instances.
 *
 * This factory centralizes Unit of Work creation with consistent configuration
 * and pre-registered repository factories. Use this factory when you need
 * request-scoped Unit of Work instances.
 *
 * @template TContext - Context data type extending StruktosContextData
 *
 * @remarks
 * **Key Benefits:**
 * - Centralized configuration management
 * - Pre-registered repository factories
 * - Context propagation support
 * - Consistent Unit of Work creation
 *
 * **Dependency Injection:**
 * Register this factory with your DI container using `UNIT_OF_WORK_FACTORY_TOKEN`.
 *
 * @example Basic Usage
 * ```typescript
 * // Create factory with Prisma client
 * const factory = new PrismaUnitOfWorkFactory(prisma, {
 *   defaultTimeout: 30000,
 *   defaultIsolationLevel: IsolationLevel.ReadCommitted
 * });
 *
 * // Register repository factories (once)
 * factory.registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx));
 * factory.registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx));
 *
 * // Create Unit of Work instances (per request)
 * const uow = factory.create();
 * ```
 *
 * @example With Dependency Injection
 * ```typescript
 * // In your DI container setup
 * container.bind(UNIT_OF_WORK_FACTORY_TOKEN).toConstantValue(
 *   new PrismaUnitOfWorkFactory(prisma, config)
 * );
 *
 * // In your use case
 * class CreateOrderUseCase {
 *   constructor(
 *     @Inject(UNIT_OF_WORK_FACTORY_TOKEN)
 *     private readonly uowFactory: IUnitOfWorkFactory
 *   ) {}
 *
 *   async execute(command: CreateOrderCommand): Promise<Order> {
 *     const uow = this.uowFactory.create();
 *
 *     return uow.executeInTransaction(async (unitOfWork) => {
 *       const orderRepo = unitOfWork.getRepository<IOrderRepository>('OrderRepository');
 *       return orderRepo.create(command);
 *     });
 *   }
 * }
 * ```
 *
 * @example With Request Context
 * ```typescript
 * // In your middleware
 * app.use((req, res, next) => {
 *   RequestContext.run({ traceId: req.headers['x-trace-id'] }, () => {
 *     const ctx = RequestContext.current();
 *     const uow = uowFactory.createWithContext(ctx);
 *
 *     req.unitOfWork = uow;
 *     next();
 *   });
 * });
 * ```
 */
export class PrismaUnitOfWorkFactory<TContext extends StruktosContextData = StruktosContextData>
  implements IUnitOfWorkFactory<TContext>
{
  /**
   * Prisma client instance.
   * @private
   */
  private readonly prisma: PrismaClient;

  /**
   * Configuration for created Unit of Work instances.
   * @private
   */
  private readonly config: PrismaUnitOfWorkConfig;

  /**
   * Shared repository factories for all Unit of Work instances.
   * @private
   */
  private readonly repositoryFactories: Map<string | symbol, RepositoryFactory<unknown>> =
    new Map();

  /**
   * Creates a new PrismaUnitOfWorkFactory instance.
   *
   * @param prisma - Prisma client instance
   * @param config - Optional configuration options
   *
   * @example
   * ```typescript
   * const factory = new PrismaUnitOfWorkFactory(prisma, {
   *   defaultTimeout: 60000,
   *   defaultIsolationLevel: IsolationLevel.Serializable,
   *   logger: winston.createLogger({ ... })
   * });
   * ```
   */
  constructor(prisma: PrismaClient, config?: PrismaUnitOfWorkConfig) {
    this.prisma = prisma;
    this.config = config ?? {};
  }

  /**
   * Creates a new Unit of Work instance.
   *
   * The created instance will have all registered repository factories
   * pre-configured and ready to use.
   *
   * @returns A new PrismaUnitOfWork instance
   *
   * @example
   * ```typescript
   * const uow = factory.create();
   *
   * await uow.executeInTransaction(async (unitOfWork) => {
   *   const userRepo = unitOfWork.getRepository<IUserRepository>('UserRepository');
   *   return userRepo.create({ name: 'John' });
   * });
   * ```
   */
  public create(): IUnitOfWork<TContext> {
    const unitOfWork = new PrismaUnitOfWork<TContext>(this.prisma, this.config);

    // Register all repository factories
    for (const [token, factory] of this.repositoryFactories) {
      unitOfWork.registerRepository(token, factory);
    }

    return unitOfWork;
  }

  /**
   * Creates a new Unit of Work instance with an associated context.
   *
   * The context is automatically set on the created Unit of Work,
   * enabling trace ID propagation and context-aware logging.
   *
   * @param context - Request context to associate with the Unit of Work
   * @returns A new PrismaUnitOfWork instance with context set
   *
   * @example
   * ```typescript
   * const ctx = RequestContext.current();
   * const uow = factory.createWithContext(ctx);
   *
   * // Unit of Work operations will include trace ID in logs
   * await uow.executeInTransaction(async (unitOfWork) => {
   *   // ...
   * });
   * ```
   */
  public createWithContext(context: IContext<TContext>): IUnitOfWork<TContext> {
    const unitOfWork = this.create();
    unitOfWork.setContext(context);
    return unitOfWork;
  }

  /**
   * Registers a repository factory with this factory.
   *
   * All Unit of Work instances created by this factory will have
   * access to this repository.
   *
   * @template TRepository - The repository interface type
   * @param token - Unique identifier for the repository
   * @param factory - Factory function that creates the repository
   * @returns This factory instance for chaining
   *
   * @remarks
   * Repository factories are shared across all Unit of Work instances.
   * Register all repositories during application startup.
   *
   * @example
   * ```typescript
   * factory
   *   .registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx))
   *   .registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx))
   *   .registerRepository(PRODUCT_REPO, (tx) => new PrismaProductRepository(tx));
   * ```
   */
  public registerRepository<TRepository>(
    token: RepositoryToken<TRepository>,
    factory: RepositoryFactory<TRepository>
  ): this {
    const key = this.normalizeToken(token);
    this.repositoryFactories.set(key, factory as RepositoryFactory<unknown>);
    return this;
  }

  /**
   * Checks if a repository is registered with this factory.
   *
   * @param token - Repository identifier
   * @returns True if the repository is registered
   *
   * @example
   * ```typescript
   * if (factory.hasRepository('UserRepository')) {
   *   console.log('UserRepository is available');
   * }
   * ```
   */
  public hasRepository(token: RepositoryToken<unknown>): boolean {
    const key = this.normalizeToken(token);
    return this.repositoryFactories.has(key);
  }

  /**
   * Removes a repository factory from this factory.
   *
   * @param token - Repository identifier
   * @returns True if the repository was removed
   *
   * @example
   * ```typescript
   * factory.unregisterRepository('LegacyRepository');
   * ```
   */
  public unregisterRepository(token: RepositoryToken<unknown>): boolean {
    const key = this.normalizeToken(token);
    return this.repositoryFactories.delete(key);
  }

  /**
   * Gets the list of registered repository tokens.
   *
   * @returns Array of registered repository tokens
   *
   * @example
   * ```typescript
   * const tokens = factory.getRegisteredRepositories();
   * console.log('Registered repositories:', tokens);
   * ```
   */
  public getRegisteredRepositories(): (string | symbol)[] {
    return Array.from(this.repositoryFactories.keys());
  }

  /**
   * Normalizes a repository token to a consistent key format.
   * @private
   */
  private normalizeToken(token: RepositoryToken<unknown>): string | symbol {
    if (typeof token === 'string' || typeof token === 'symbol') {
      return token;
    }
    return token.name || token.toString();
  }
}