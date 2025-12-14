/**
 * @fileoverview Error Classes Exports
 * @description
 * Exports all error classes for @struktos/prisma Unit of Work operations.
 *
 * @packageDocumentation
 * @module @struktos/prisma/errors
 * @version 1.0.0
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
} from './unit-of-work.errors';