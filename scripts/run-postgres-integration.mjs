import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'

import {
  createPostgresTestDatabaseName,
  createPostgresTestDatabaseUrl,
  parsePostgresTestAdminUrl,
  quotePostgresTestDatabaseName,
} from './testing/postgres-test-database.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsFolder = path.join(repositoryRoot, 'drizzle')
const vitestPath = path.join(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs')
const adminUrl = parsePostgresTestAdminUrl(process.env.INTEGRATION_DATABASE_URL)
const databaseName = createPostgresTestDatabaseName()
const databaseUrl = createPostgresTestDatabaseUrl(adminUrl, databaseName)
const quotedDatabaseName = quotePostgresTestDatabaseName(databaseName)

let databaseCreated = false
let receivedSignal

try {
  await withClient(adminUrl, async (client) => {
    await client.query(`CREATE DATABASE ${quotedDatabaseName}`)
    databaseCreated = true
  })

  console.info(`Created disposable PostgreSQL database ${databaseName}`)

  await withClient(databaseUrl, async (client) => {
    await migrate(drizzle(client), { migrationsFolder })
  })

  const result = await runVitest(databaseUrl)

  if (result.signal) {
    receivedSignal = result.signal
  } else if (result.code !== 0) {
    process.exitCode = result.code ?? 1
  }
} finally {
  if (databaseCreated) {
    await withClient(adminUrl, async (client) => {
      await client.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      )
      await client.query(`DROP DATABASE ${quotedDatabaseName}`)
    })

    console.info(`Dropped disposable PostgreSQL database ${databaseName}`)
  }
}

if (receivedSignal) {
  process.kill(process.pid, receivedSignal)
}

async function withClient(connectionUrl, operation) {
  const client = new Client({ connectionString: connectionUrl.toString() })
  await client.connect()

  try {
    return await operation(client)
  } finally {
    await client.end()
  }
}

function runVitest(testDatabaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vitestPath, 'run', '--config', 'vitest.integration.config.ts'], {
      cwd: repositoryRoot,
      env: createTestEnvironment(testDatabaseUrl),
      stdio: 'inherit',
    })

    const forwardSignal = (signal) => {
      child.kill(signal)
    }

    process.once('SIGINT', forwardSignal)
    process.once('SIGTERM', forwardSignal)

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      process.off('SIGINT', forwardSignal)
      process.off('SIGTERM', forwardSignal)
      resolve({ code, signal })
    })
  })
}

function createTestEnvironment(testDatabaseUrl) {
  const environment = { ...process.env }

  for (const name of [
    'DATABASE_URL',
    'DATABASE_URL_DIRECT',
    'STAGING_DATABASE_URL_DIRECT',
    'PRODUCTION_DATABASE_URL_DIRECT',
  ]) {
    delete environment[name]
  }

  environment.PRODUCTIVITY_UP_TEST_DATABASE_URL = testDatabaseUrl.toString()
  return environment
}
