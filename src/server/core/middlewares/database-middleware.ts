import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'

import { operationMeasurementsMiddleware } from '@/server/core/middlewares/operation-record-middleware'
import { connectDatabase } from '@/server/db/client'

export type DatabaseMiddlewareDependencies = {
  connect: typeof connectDatabase
}

const getDefaultDependencies = createServerOnlyFn((): DatabaseMiddlewareDependencies => ({ connect: connectDatabase }))

/**
 * Opens one database connection for the operation and closes it when the operation finishes. A failed close is
 * reported to the completion record without changing the operation's outcome.
 */
export function createDatabaseMiddleware(providedDependencies?: DatabaseMiddlewareDependencies) {
  return createMiddleware({ type: 'function' })
    .middleware([operationMeasurementsMiddleware])
    .server(async ({ context, next }) => {
      const dependencies = providedDependencies ?? getDefaultDependencies()
      const connection = await dependencies.connect(context.measurements.database)

      try {
        return await next({ context: { db: connection.db } })
      } finally {
        try {
          await connection.close()
        } catch {
          context.measurements.connectionCloseFailed = true
        }
      }
    })
}

export const databaseMiddleware = createDatabaseMiddleware()
