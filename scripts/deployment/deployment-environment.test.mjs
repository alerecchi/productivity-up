import { describe, expect, it } from 'vitest'

import { createCommandEnvironment, createMigrationEnvironment } from './deployment-workflow.mjs'

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
})
