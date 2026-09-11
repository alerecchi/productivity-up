export type DatabaseRuntimeEnvironment = {
  DATABASE_URL?: string
  HYPERDRIVE?: { connectionString: string }
}

export function resolveDatabaseConnectionString(environment: DatabaseRuntimeEnvironment) {
  if (environment.HYPERDRIVE?.connectionString) {
    return environment.HYPERDRIVE.connectionString
  }

  if (environment.DATABASE_URL) {
    return environment.DATABASE_URL
  }

  throw new Error('Database connection is not configured. Expected HYPERDRIVE or local DATABASE_URL.')
}
