import { describe, expect, it } from 'vitest'

import {
  RuntimeConfigurationError,
  parseCloudflareRuntimeEnvironment,
  parseDevelopmentRuntimeEnvironment,
} from '@/config/runtime-environment'

const commonEnvironment = {
  APP_NAME: 'Productivity Up',
  BETTER_AUTH_SECRET: 'runtime-test-secret-at-least-32-characters',
  BETTER_AUTH_URL: 'https://example.test',
  EMAIL_FROM: 'noreply@example.test',
  RESEND_API_KEY: 'test-resend-api-key',
}

const userRealtime = { getByName: () => ({ fetch: () => Promise.resolve(new Response()) }) }
const versionMetadata = { id: 'worker-version-id' }

describe('development runtime configuration', () => {
  it('returns the direct Neon connection and validated application configuration', () => {
    expect(
      parseDevelopmentRuntimeEnvironment({
        ...commonEnvironment,
        DATABASE_URL: 'postgresql://development.example.test/productivity_up',
        USER_REALTIME: userRealtime,
      }),
    ).toEqual({
      application: { name: 'Productivity Up' },
      authentication: {
        baseUrl: 'https://example.test',
        secret: 'runtime-test-secret-at-least-32-characters',
      },
      database: { connectionString: 'postgresql://development.example.test/productivity_up' },
      deployment: 'development',
      email: {
        apiKey: 'test-resend-api-key',
        from: 'noreply@example.test',
      },
      realtime: { userRealtime },
      version: 'development',
    })
  })

  it('rejects a missing direct Neon connection without printing another value', () => {
    const secretValue = 'runtime-secret-that-must-not-appear-in-an-error'

    expect(() =>
      parseDevelopmentRuntimeEnvironment({
        ...commonEnvironment,
        BETTER_AUTH_SECRET: secretValue,
        USER_REALTIME: userRealtime,
      }),
    ).toThrow('Missing or invalid runtime configuration: DATABASE_URL.')

    try {
      parseDevelopmentRuntimeEnvironment({
        ...commonEnvironment,
        BETTER_AUTH_SECRET: secretValue,
        USER_REALTIME: userRealtime,
      })
    } catch (error) {
      expect(String(error)).not.toContain(secretValue)
    }
  })

  it('rejects a missing realtime Durable Object binding', () => {
    expect(() =>
      parseDevelopmentRuntimeEnvironment({
        ...commonEnvironment,
        DATABASE_URL: 'postgresql://development.example.test/productivity_up',
      }),
    ).toThrow('Missing or invalid runtime configuration: USER_REALTIME.')
  })
})

describe('Cloudflare runtime configuration', () => {
  it.each(['staging', 'production'] as const)('returns every %s binding through one interface', (deployment) => {
    expect(
      parseCloudflareRuntimeEnvironment({
        ...commonEnvironment,
        ENVIRONMENT: deployment,
        HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/productivity_up' },
        USER_REALTIME: userRealtime,
        VERSION_METADATA: versionMetadata,
      }),
    ).toEqual({
      application: { name: 'Productivity Up' },
      authentication: {
        baseUrl: 'https://example.test',
        secret: 'runtime-test-secret-at-least-32-characters',
      },
      database: { connectionString: 'postgresql://hyperdrive.internal/productivity_up' },
      deployment,
      email: {
        apiKey: 'test-resend-api-key',
        from: 'noreply@example.test',
      },
      realtime: { userRealtime },
      version: versionMetadata.id,
    })
  })

  it.each(['ENVIRONMENT', 'HYPERDRIVE', 'USER_REALTIME', 'VERSION_METADATA'])(
    'rejects a missing %s binding or value',
    (missingKey) => {
      const source: Record<string, unknown> = {
        ...commonEnvironment,
        ENVIRONMENT: 'staging',
        HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/productivity_up' },
        USER_REALTIME: userRealtime,
        VERSION_METADATA: versionMetadata,
      }
      delete source[missingKey]

      expect(() => parseCloudflareRuntimeEnvironment(source)).toThrow(
        `Missing or invalid runtime configuration: ${missingKey}.`,
      )
    },
  )

  it('rejects bindings without the required capability', () => {
    expect(() =>
      parseCloudflareRuntimeEnvironment({
        ...commonEnvironment,
        ENVIRONMENT: 'staging',
        HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.internal/productivity_up' },
        USER_REALTIME: {},
        VERSION_METADATA: versionMetadata,
      }),
    ).toThrow('Missing or invalid runtime configuration: USER_REALTIME.')
  })

  it('reports only sorted configuration keys for malformed input', () => {
    let thrownError: unknown

    try {
      parseCloudflareRuntimeEnvironment({
        ...commonEnvironment,
        ENVIRONMENT: 'preview',
        HYPERDRIVE: { connectionString: 'database-secret-value' },
        USER_REALTIME: {},
        VERSION_METADATA: {},
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBeInstanceOf(RuntimeConfigurationError)
    expect(String(thrownError)).toBe(
      'RuntimeConfigurationError: Missing or invalid runtime configuration: ENVIRONMENT, HYPERDRIVE, USER_REALTIME, VERSION_METADATA.',
    )
    expect(String(thrownError)).not.toContain('database-secret-value')
  })
})
