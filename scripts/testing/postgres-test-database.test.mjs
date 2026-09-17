import { describe, expect, it } from 'vitest'

import {
  createPostgresTestDatabaseName,
  createPostgresTestDatabaseUrl,
  parsePostgresTestAdminUrl,
  quotePostgresTestDatabaseName,
} from './postgres-test-database.mjs'

const TEST_UUID = '12345678-1234-4abc-8def-1234567890ab'

describe('parsePostgresTestAdminUrl', () => {
  it('accepts a loopback PostgreSQL maintenance URL', () => {
    const url = parsePostgresTestAdminUrl('postgresql://postgres:secret@127.0.0.1:5433/postgres')

    expect(url.hostname).toBe('127.0.0.1')
    expect(url.pathname).toBe('/postgres')
  })

  it.each([
    [undefined, 'required'],
    ['not-a-url', 'valid PostgreSQL URL'],
    ['https://127.0.0.1/postgres', 'postgresql: or postgres:'],
    ['postgresql://database.example.com/postgres', 'localhost'],
    ['postgresql://127.0.0.1/productivity_up', 'postgres maintenance database'],
  ])('rejects an unsafe admin URL', (value, message) => {
    expect(() => parsePostgresTestAdminUrl(value)).toThrow(message)
  })
})

describe('PostgreSQL test database names', () => {
  it('creates a run-specific database URL', () => {
    const adminUrl = parsePostgresTestAdminUrl('postgresql://postgres:secret@localhost:5433/postgres')
    const databaseName = createPostgresTestDatabaseName(TEST_UUID)

    expect(databaseName).toBe('productivity_up_test_1234567812344abc8def1234567890ab')
    expect(createPostgresTestDatabaseUrl(adminUrl, databaseName).pathname).toBe(`/${databaseName}`)
    expect(quotePostgresTestDatabaseName(databaseName)).toBe(`"${databaseName}"`)
  })

  it.each(['postgres', 'productivity_up', 'productivity_up_test_manual', 'productivity_up_test_1234'])(
    'refuses a database name outside the generated namespace',
    (databaseName) => {
      expect(() => quotePostgresTestDatabaseName(databaseName)).toThrow('Refusing to operate')
    },
  )
})
