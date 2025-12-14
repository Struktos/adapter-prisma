/**
 * @fileoverview Repository Exports
 * @description
 * Exports base repository classes for Prisma-based data access.
 *
 * @packageDocumentation
 * @module @struktos/prisma/repository
 * @version 1.0.0
 */

export {
  type IRepository,
  PrismaRepository,
  PrismaCrudRepository,
  type PrismaModelDelegate,
} from './PrismaRepository';