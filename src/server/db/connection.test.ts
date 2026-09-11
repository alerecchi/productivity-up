import { describe, expect, it } from 'vitest'

import { resolveDatabaseConnectionString } from '@/server/db/connection'

describe('resolveDatabaseConnectionString', () => {
  it('uses Hyperdrive when the binding is available', () => {
    expect(
      resolveDatabaseConnectionString({
        DATABASE_URL: 'postgresql://local.example/development',
        HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/database' },
      }),
    ).toBe('postgresql://hyperdrive.internal/database')
  })

  it('uses the local URL without a Hyperdrive binding', () => {
    expect(resolveDatabaseConnectionString({ DATABASE_URL: 'postgresql://local.example/development' })).toBe(
      'postgresql://local.example/development',
    )
  })

  it('fails when neither connection source is configured', () => {
    expect(() => resolveDatabaseConnectionString({})).toThrow(
      'Database connection is not configured. Expected HYPERDRIVE or local DATABASE_URL.',
    )
  })
})
