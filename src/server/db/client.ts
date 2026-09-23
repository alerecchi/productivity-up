import * as schema from '@server/db/schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import type { DatabaseMetrics } from '@/server/core/telemetry'

export type Database = ReturnType<typeof createDatabase>

export async function connectDatabase(metrics?: DatabaseMetrics) {
  const environment = getRuntimeEnvironment()
  const client = new Client({
    connectionString: environment.database.connectionString,
  })

  await client.connect()

  return {
    close: () => client.end(),
    db: createDatabase(metrics ? observeQueries(client, metrics) : client),
  }
}

function observeQueries(client: Client, metrics: DatabaseMetrics) {
  return new Proxy(client, {
    get(target, property) {
      if (property !== 'query') {
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      }

      return (...args: Array<unknown>) => {
        metrics.roundTrips += 1
        const startedAt = performance.now()

        try {
          const result: unknown = Reflect.apply(target.query, target, args)

          if (isPromiseLike(result)) {
            return result.finally(() => {
              metrics.durationMs += performance.now() - startedAt
            })
          }

          metrics.durationMs += performance.now() - startedAt
          return result
        } catch (error) {
          metrics.durationMs += performance.now() - startedAt
          throw error
        }
      }
    },
  })
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return value instanceof Promise || (typeof value === 'object' && value !== null && 'then' in value)
}

export async function withDatabase<TResult>(operation: (db: Database) => Promise<TResult> | TResult) {
  const connection = await connectDatabase()

  try {
    return await operation(connection.db)
  } finally {
    await connection.close()
  }
}

function createDatabase(client: Client) {
  return drizzle(client, { schema })
}
