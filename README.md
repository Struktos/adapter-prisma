# @struktos/prisma

Prisma adapter for Struktos.js - Unit of Work and repository implementations using Prisma Client.

[![npm version](https://badge.fury.io/js/%40struktos%2Fprisma.svg)](https://www.npmjs.com/package/@struktos/prisma)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## Features

- 🔄 **Unit of Work Pattern** - Transaction management with automatic commit/rollback
- 💾 **Interactive Transactions** - Uses Prisma's interactive transaction API
- 📦 **Repository Pattern** - Base classes for implementing Prisma repositories
- 🎯 **Savepoint Support** - Partial rollback capability (PostgreSQL, MySQL)
- 🔍 **Context Integration** - Request context propagation for distributed tracing
- 📊 **All Isolation Levels** - Full support for transaction isolation levels
- 📘 **TypeScript First** - Complete type safety and IntelliSense

## Installation

```bash
npm install @struktos/prisma @struktos/core @prisma/client
# or
yarn add @struktos/prisma @struktos/core @prisma/client
# or
pnpm add @struktos/prisma @struktos/core @prisma/client
```

## Quick Start

### 1. Create Repository Classes

```typescript
import { PrismaCrudRepository } from '@struktos/prisma';
import type { User } from '@prisma/client';

// Interface for your repository
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
}

// Prisma implementation
export class PrismaUserRepository 
  extends PrismaCrudRepository<User, string>
  implements IUserRepository {
  
  protected getModelDelegate() {
    return this.client.user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.model.findUnique({ where: { email } });
  }
}
```

### 2. Set Up Unit of Work Factory

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaUnitOfWorkFactory } from '@struktos/prisma';
import { IsolationLevel } from '@struktos/core';

const prisma = new PrismaClient();

// Create factory with configuration
const uowFactory = new PrismaUnitOfWorkFactory(prisma, {
  defaultTimeout: 30000,
  defaultIsolationLevel: IsolationLevel.ReadCommitted,
  enableSavepoints: true,
  logger: console, // Optional logging
});

// Register repository factories
uowFactory.registerRepository('UserRepository', (tx) => new PrismaUserRepository(tx));
uowFactory.registerRepository('OrderRepository', (tx) => new PrismaOrderRepository(tx));
```

### 3. Use in Your Application

```typescript
// Create Unit of Work instance
const uow = uowFactory.create();

// Execute within transaction
const user = await uow.executeInTransaction(async (unitOfWork) => {
  const userRepo = unitOfWork.getRepository<IUserRepository>('UserRepository');
  const orderRepo = unitOfWork.getRepository<IOrderRepository>('OrderRepository');

  // All operations are in the same transaction
  const newUser = await userRepo.create({
    name: 'John Doe',
    email: 'john@example.com',
  });

  await orderRepo.create({
    userId: newUser.id,
    total: 99.99,
  });

  return newUser;
});
```

## Advanced Usage

### Manual Transaction Control

```typescript
const uow = uowFactory.create();

try {
  await uow.start({
    isolationLevel: IsolationLevel.Serializable,
    timeout: 60000,
  });

  const accountRepo = uow.getRepository<IAccountRepository>('AccountRepository');

  // Debit source account
  const source = await accountRepo.findById(fromAccountId);
  if (source.balance < amount) {
    throw new InsufficientFundsError();
  }
  await accountRepo.update(fromAccountId, { balance: source.balance - amount });

  // Credit destination account
  const dest = await accountRepo.findById(toAccountId);
  await accountRepo.update(toAccountId, { balance: dest.balance + amount });

  const result = await uow.commit();
  console.log(`Transfer completed in ${result.duration}ms`);
} catch (error) {
  await uow.rollback();
  throw error;
} finally {
  await uow.dispose();
}
```

### Using Savepoints

```typescript
await uow.start();

// Create initial user
const userRepo = uow.getRepository<IUserRepository>('UserRepository');
const user = await userRepo.create({ name: 'Alice', email: 'alice@example.com' });

// Create savepoint before risky operation
await uow.createSavepoint('before_order');

try {
  const orderRepo = uow.getRepository<IOrderRepository>('OrderRepository');
  await orderRepo.create({ userId: user.id, total: -100 }); // Invalid!
} catch (error) {
  // Rollback only the order, keep the user
  await uow.rollbackToSavepoint('before_order');
}

// Commit - user is saved, order is not
await uow.commit();
```

### Context Integration

```typescript
import { RequestContext } from '@struktos/core';

// In your middleware
app.use((req, res, next) => {
  RequestContext.run(
    { 
      traceId: req.headers['x-trace-id'] || generateTraceId(),
      userId: req.user?.id,
    },
    () => {
      const ctx = RequestContext.current();
      const uow = uowFactory.createWithContext(ctx);
      
      req.unitOfWork = uow;
      next();
    }
  );
});

// In your handler
app.post('/orders', async (req, res) => {
  const result = await req.unitOfWork.executeInTransaction(async (uow) => {
    // Operations automatically include trace ID in logs
    const orderRepo = uow.getRepository<IOrderRepository>('OrderRepository');
    return orderRepo.create(req.body);
  });

  res.json(result);
});
```

### Custom Repository Implementation

```typescript
import { PrismaRepository, type PrismaTransactionClient } from '@struktos/prisma';

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export class PrismaProductRepository extends PrismaRepository<Product, string> {
  protected getModelDelegate() {
    return this.client.product;
  }

  async findById(id: string): Promise<Product | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findAll(): Promise<Product[]> {
    return this.model.findMany({ orderBy: { name: 'asc' } });
  }

  async create(data: Omit<Product, 'id'>): Promise<Product> {
    return this.model.create({ data });
  }

  async update(id: string, data: Partial<Product>): Promise<Product | null> {
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

  // Custom methods
  async findInStock(): Promise<Product[]> {
    return this.model.findMany({ where: { stock: { gt: 0 } } });
  }

  async decrementStock(id: string, quantity: number): Promise<Product | null> {
    return this.model.update({
      where: { id, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
  }
}
```

### Error Handling

```typescript
import {
  TransactionError,
  TransactionTimeoutError,
  RepositoryNotRegisteredError,
  NoActiveTransactionError,
  ErrorCodes,
} from '@struktos/prisma';

try {
  await uow.executeInTransaction(async (unitOfWork) => {
    // ... operations
  });
} catch (error) {
  if (error instanceof TransactionTimeoutError) {
    console.error(`Transaction timed out after ${error.timeoutMs}ms`);
  } else if (error instanceof RepositoryNotRegisteredError) {
    console.error(`Repository '${error.repositoryToken}' not registered`);
  } else if (error instanceof TransactionError) {
    console.error(`Transaction error [${error.code}]:`, error.message);
  }

  // Or check by error code
  if (error.code === ErrorCodes.TRANSACTION_TIMEOUT) {
    // Handle timeout
  }
}
```

## API Reference

### PrismaUnitOfWork

| Method | Description |
|--------|-------------|
| `start(options?)` | Start a new transaction |
| `commit()` | Commit the transaction |
| `rollback()` | Rollback the transaction |
| `getRepository<T>(token)` | Get a repository instance |
| `hasRepository(token)` | Check if repository is registered |
| `executeInTransaction(callback, options?)` | Execute within auto-managed transaction |
| `createSavepoint(name)` | Create a savepoint |
| `rollbackToSavepoint(name)` | Rollback to a savepoint |
| `releaseSavepoint(name)` | Release a savepoint |
| `setContext(context)` | Set request context |
| `dispose()` | Dispose and release resources |

### PrismaUnitOfWorkFactory

| Method | Description |
|--------|-------------|
| `create()` | Create a new Unit of Work instance |
| `createWithContext(context)` | Create with associated context |
| `registerRepository(token, factory)` | Register a repository factory |
| `hasRepository(token)` | Check if repository is registered |
| `unregisterRepository(token)` | Remove a repository factory |
| `getRegisteredRepositories()` | List all registered repositories |

### Configuration Options

```typescript
interface PrismaUnitOfWorkConfig {
  defaultTimeout?: number;        // Default: 30000ms
  defaultMaxWait?: number;        // Default: 5000ms
  defaultIsolationLevel?: IsolationLevel;  // Default: ReadCommitted
  enableSavepoints?: boolean;     // Default: true
  logger?: PrismaUnitOfWorkLogger;
}
```

## Isolation Levels

| Level | Description |
|-------|-------------|
| `ReadUncommitted` | Allows dirty reads |
| `ReadCommitted` | Default for most databases |
| `RepeatableRead` | Prevents non-repeatable reads |
| `Serializable` | Highest isolation |
| `Snapshot` | Uses row versioning (PostgreSQL, SQL Server) |

## Related Packages

- `@struktos/core` - Core framework interfaces
- `@struktos/adapter-express` - Express.js integration
- `@struktos/adapter-fastify` - Fastify integration
- `@struktos/auth` - Authentication & Authorization

## Documentation

- [Full Documentation](https://struktos.dev)
- [API Reference](https://struktos.dev/api/prisma)
- [Prisma Documentation](https://www.prisma.io/docs)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Struktos Contributors