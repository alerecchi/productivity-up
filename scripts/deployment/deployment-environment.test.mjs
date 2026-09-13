import { describe, expect, it } from 'vitest'

import { createCommandEnvironment, createMigrationEnvironment } from './deployment-workflow.mjs'
import { createSafeChildProcessEnvironment } from './environment.mjs'
import { requireDirectPostgresUrl, sharePostgresHost } from './postgres-url.mjs'

const stagingDatabaseUrl = 'postgresql://staging.example.test/productivity_up'
const productionDatabaseUrl = 'postgresql://production.example.test/productivity_up'

function sourceEnvironment() {
  return {
    APP_NAME: 'server-only app name',
    BETTER_AUTH_SECRET: 'server-only auth secret',
    DATABASE_URL: 'postgresql://development.example.test/productivity_up',
    DATABASE_URL_DIRECT: 'postgresql://ambient.example.test/productivity_up',
    PRODUCTION_DATABASE_URL_DIRECT: productionDatabaseUrl,
    RESEND_API_KEY: 'server-only email secret',
    STAGING_DATABASE_URL_DIRECT: stagingDatabaseUrl,
    STAGING_PUBLIC_URL: 'https://productivity-up-staging.ale-recchi.workers.dev',
    STAGING_SMOKE_TEST_PASSWORD: 'smoke-test secret',
    VITE_APP_NAME: 'Productivity Up',
  }
}

describe('deployment subprocess environments', () => {
  it.each([
    ['staging', stagingDatabaseUrl],
    ['production', productionDatabaseUrl],
  ])('exposes only the selected direct URL to the %s migration', (environmentName, expectedUrl) => {
    const source = sourceEnvironment()
    const commandEnvironment = createCommandEnvironment(environmentName, source)
    const migrationEnvironment = createMigrationEnvironment(environmentName, commandEnvironment, source)

    expect(migrationEnvironment.DATABASE_URL_DIRECT).toBe(expectedUrl)
    expect(migrationEnvironment).not.toHaveProperty('STAGING_DATABASE_URL_DIRECT')
    expect(migrationEnvironment).not.toHaveProperty('PRODUCTION_DATABASE_URL_DIRECT')
    expect(migrationEnvironment).not.toHaveProperty('DATABASE_URL')
  })

  it.each(['staging', 'production'])(
    'removes all database URLs from the %s build and deploy environment',
    (environmentName) => {
      const commandEnvironment = createCommandEnvironment(environmentName, sourceEnvironment())

      expect(commandEnvironment).not.toHaveProperty('DATABASE_URL_DIRECT')
      expect(commandEnvironment).not.toHaveProperty('STAGING_DATABASE_URL_DIRECT')
      expect(commandEnvironment).not.toHaveProperty('PRODUCTION_DATABASE_URL_DIRECT')
      expect(commandEnvironment).not.toHaveProperty('DATABASE_URL')
    },
  )

  it('removes sensitive application, setup, and operator values from child processes', () => {
    const environment = createSafeChildProcessEnvironment({
      ...sourceEnvironment(),
      PRODUCTION_BETTER_AUTH_SECRET: 'production auth secret',
      STAGING_RESEND_API_KEY: 'staging email secret',
      UNRELATED_VALUE: 'preserved',
    })

    expect(environment).not.toHaveProperty('BETTER_AUTH_SECRET')
    expect(environment).not.toHaveProperty('CLOUDFLARE_ENV')
    expect(environment).not.toHaveProperty('PRODUCTION_BETTER_AUTH_SECRET')
    expect(environment).not.toHaveProperty('STAGING_PUBLIC_URL')
    expect(environment).not.toHaveProperty('STAGING_RESEND_API_KEY')
    expect(environment).not.toHaveProperty('STAGING_SMOKE_TEST_PASSWORD')
    expect(environment.UNRELATED_VALUE).toBe('preserved')
  })
})

describe('PostgreSQL deployment URLs', () => {
  it('accepts direct PostgreSQL URLs and compares their hosts', () => {
    const firstUrl = requireDirectPostgresUrl('postgresql://user:password@database.example.test/app', 'FIRST_URL')
    const secondUrl = requireDirectPostgresUrl('postgres://other:password@database.example.test/other', 'SECOND_URL')

    expect(sharePostgresHost(firstUrl, secondUrl)).toBe(true)
  })

  it.each([
    ['an invalid URL', 'not a URL'],
    ['a non-PostgreSQL URL', 'https://database.example.test/app'],
    ['a pooled URL', 'postgresql://user:password@database-pooler.example.test/app'],
  ])('rejects %s', (_case, value) => {
    expect(() => requireDirectPostgresUrl(value, 'DATABASE_URL')).toThrow()
  })
})
