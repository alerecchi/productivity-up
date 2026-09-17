import { randomUUID } from 'node:crypto'

export const TEST_DATABASE_PREFIX = 'productivity_up_test_'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])
const TEST_DATABASE_NAME_PATTERN = /^productivity_up_test_[0-9a-f]{32}$/

export function parsePostgresTestAdminUrl(value) {
  if (!value) {
    throw new Error('INTEGRATION_DATABASE_URL is required')
  }

  let url

  try {
    url = new URL(value)
  } catch {
    throw new Error('INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error('INTEGRATION_DATABASE_URL must use the postgresql: or postgres: protocol')
  }

  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1')

  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error('INTEGRATION_DATABASE_URL must point to localhost')
  }

  if (decodeURIComponent(url.pathname.slice(1)) !== 'postgres') {
    throw new Error('INTEGRATION_DATABASE_URL must target the postgres maintenance database')
  }

  return url
}

export function createPostgresTestDatabaseName(uuid = randomUUID()) {
  const databaseName = `${TEST_DATABASE_PREFIX}${uuid.replaceAll('-', '').toLowerCase()}`
  assertPostgresTestDatabaseName(databaseName)
  return databaseName
}

export function createPostgresTestDatabaseUrl(adminUrl, databaseName) {
  assertPostgresTestDatabaseName(databaseName)

  const databaseUrl = new URL(adminUrl)
  databaseUrl.pathname = `/${databaseName}`
  return databaseUrl
}

export function quotePostgresTestDatabaseName(databaseName) {
  assertPostgresTestDatabaseName(databaseName)
  return `"${databaseName}"`
}

export function assertPostgresTestDatabaseName(databaseName) {
  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(`Refusing to operate on database outside the ${TEST_DATABASE_PREFIX} namespace`)
  }
}
