import * as schema from '@server/db/schema'
import { env } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

import { resolveDatabaseConnectionString } from '@/server/db/connection'

export type Database = ReturnType<typeof createDatabase>

export async function connectDatabase() {
  const databaseEnvironment = env as Cloudflare.Env & { DATABASE_URL?: string }
  const client = new Client({
    connectionString: resolveDatabaseConnectionString({
      DATABASE_URL: databaseEnvironment.DATABASE_URL,
      HYPERDRIVE: databaseEnvironment.HYPERDRIVE,
    }),
  })

  await client.connect()

  return {
    close: () => client.end(),
    db: createDatabase(client),
  }
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
