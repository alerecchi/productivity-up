import * as schema from '@server/db/schema'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

import { getRuntimeEnvironment } from '@/config/runtime-env'

export type Database = ReturnType<typeof createDatabase>

export async function connectDatabase() {
  const environment = getRuntimeEnvironment()
  const client = new Client({
    connectionString: environment.database.connectionString,
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
