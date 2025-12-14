/**
 * Mock implementation of @struktos/core for testing
 */

// Isolation Level Enum
export enum IsolationLevel {
  ReadUncommitted = 'READ_UNCOMMITTED',
  ReadCommitted = 'READ_COMMITTED',
  RepeatableRead = 'REPEATABLE_READ',
  Serializable = 'SERIALIZABLE',
  Snapshot = 'SNAPSHOT',
}

// Transaction State Enum
export enum TransactionState {
  Inactive = 'INACTIVE',
  Active = 'ACTIVE',
  Committing = 'COMMITTING',
  Committed = 'COMMITTED',
  RollingBack = 'ROLLING_BACK',
  RolledBack = 'ROLLED_BACK',
  Failed = 'FAILED',
}

// IContext interface
export interface IContext<T = unknown> {
  get<K extends keyof T>(key: K): T[K] | undefined;
  set<K extends keyof T>(key: K, value: T[K]): void;
  isCancelled(): boolean;
  onCancel(callback: () => void): void;
  cancel(): void;
  getAll(): Readonly<Partial<T>>;
  has<K extends keyof T>(key: K): boolean;
  delete<K extends keyof T>(key: K): boolean;
}

// StruktosContextData interface
export interface StruktosContextData {
  traceId?: string;
  requestId?: string;
  userId?: string;
  timestamp?: number;
  method?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  user?: Record<string, unknown>;
  roles?: string[];
  claims?: Array<{ type: string; value: string }>;
  [key: string]: unknown;
}

// TransactionOptions interface
export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  timeout?: number;
  readOnly?: boolean;
  savepoint?: string;
  databaseOptions?: Record<string, unknown>;
}

// TransactionResult interface
export interface TransactionResult {
  success: boolean;
  duration: number;
  error?: Error;
  affectedCount?: number;
  traceId?: string;
}

// RepositoryToken type
export type RepositoryToken<T> = string | symbol | (new (...args: unknown[]) => T);

// IUnitOfWork interface
export interface IUnitOfWork<TContext extends StruktosContextData = StruktosContextData> {
  readonly state: TransactionState;
  readonly context?: IContext<TContext>;
  readonly id: string;
  start(options?: TransactionOptions): Promise<void>;
  commit(): Promise<TransactionResult>;
  rollback(): Promise<TransactionResult>;
  getRepository<TRepository>(token: RepositoryToken<TRepository>): TRepository;
  hasRepository(token: RepositoryToken<unknown>): boolean;
  executeInTransaction<TResult>(
    callback: (unitOfWork: IUnitOfWork<TContext>) => Promise<TResult>,
    options?: TransactionOptions
  ): Promise<TResult>;
  createSavepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  setContext(context: IContext<TContext>): void;
  dispose(): Promise<void>;
}

// IUnitOfWorkFactory interface
export interface IUnitOfWorkFactory<TContext extends StruktosContextData = StruktosContextData> {
  create(): IUnitOfWork<TContext>;
  createWithContext(context: IContext<TContext>): IUnitOfWork<TContext>;
}

// Mock RequestContext
export class MockContext<T extends StruktosContextData = StruktosContextData>
  implements IContext<T>
{
  private data: Map<string, unknown> = new Map();
  private cancelled = false;
  private cancelCallbacks: Set<() => void> = new Set();

  constructor(initialData?: Partial<T>) {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        this.data.set(key, value);
      });
    }
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.data.get(key as string) as T[K] | undefined;
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data.set(key as string, value);
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  onCancel(callback: () => void): void {
    this.cancelCallbacks.add(callback);
  }

  cancel(): void {
    this.cancelled = true;
    this.cancelCallbacks.forEach((cb) => cb());
  }

  getAll(): Readonly<Partial<T>> {
    return Object.fromEntries(this.data) as Readonly<Partial<T>>;
  }

  has<K extends keyof T>(key: K): boolean {
    return this.data.has(key as string);
  }

  delete<K extends keyof T>(key: K): boolean {
    return this.data.delete(key as string);
  }
}

// DI Tokens
export const UNIT_OF_WORK_TOKEN = Symbol('IUnitOfWork');
export const UNIT_OF_WORK_FACTORY_TOKEN = Symbol('IUnitOfWorkFactory');