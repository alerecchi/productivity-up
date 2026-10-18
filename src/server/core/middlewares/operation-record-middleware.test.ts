import { describe, expect, it, vi } from 'vitest'

import { OperationError, mapOperationError } from '@/server/core/errors'
import { createOperationRecordMiddleware } from '@/server/core/middlewares/operation-record-middleware'
import type {
  OperationMeasurements,
  OperationRecordDependencies,
} from '@/server/core/middlewares/operation-record-middleware'
import { RequestValidationError } from '@/server/core/validation'
import { invokeFunctionMiddleware, nextResolvingTo } from '@/test/function-middleware'

describe('operation record middleware', () => {
  it('records a successful operation once with only allow-listed fields', async () => {
    const { dependencies, emit, measurements, setResponseHeader } = createDependencies()
    measurements.database.durationMs = 12.345
    measurements.database.roundTrips = 3
    const next = nextResolvingTo({ id: 7 })

    const result = await invoke(dependencies, measurements, next)

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(next).toHaveBeenCalledWith({ context: { requestId: 'request-id' } })
    expect(setResponseHeader).toHaveBeenCalledWith('X-Request-ID', 'request-id')
    expect(emit).toHaveBeenCalledExactlyOnceWith({
      coldStart: expect.any(Boolean),
      conflict: false,
      connectionCloseFailed: false,
      databaseDurationMs: 12.35,
      databaseRoundTrips: 3,
      deploymentVersion: 'deployment-version',
      operation: 'todos.list',
      outcome: 'success',
      rateLimited: false,
      region: 'FRA',
      requestId: 'request-id',
      responseBytes: 8,
      status: 200,
      thirdPartyDurationMs: 0,
      totalDurationMs: 1,
    })
    expect(JSON.stringify(emit.mock.calls[0]?.[0])).not.toMatch(
      /cookie-secret|authorization-secret|user@example\.test|token-secret/,
    )
  })

  it('records measurements that inner middleware reported while failing', async () => {
    const { dependencies, emit, measurements } = createDependencies()

    await invoke(
      dependencies,
      measurements,
      vi.fn(() => {
        measurements.connectionCloseFailed = true
        return Promise.reject(new OperationError(409, 'CONFLICT', 'Refresh and retry'))
      }),
    )

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ connectionCloseFailed: true, outcome: 'conflict', status: 409 }),
    )
  })

  it.each([
    {
      error: new RequestValidationError([{ code: 'custom', message: 'Safe detail', path: ['title'] }]),
      expectedCode: 'VALIDATION_FAILED',
      expectedStatus: 400,
    },
    {
      error: new OperationError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'),
      expectedCode: 'AUTHENTICATION_REQUIRED',
      expectedStatus: 401,
    },
    {
      error: new OperationError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification is required'),
      expectedCode: 'EMAIL_VERIFICATION_REQUIRED',
      expectedStatus: 403,
    },
    {
      error: new OperationError(404, 'RESOURCE_NOT_FOUND', 'foreign resource'),
      expectedCode: 'RESOURCE_NOT_FOUND',
      expectedStatus: 404,
    },
    { error: new OperationError(409, 'CONFLICT', 'Refresh and retry'), expectedCode: 'CONFLICT', expectedStatus: 409 },
    {
      error: new OperationError(429, 'RATE_LIMITED', 'Too many requests', { retryAfterSeconds: 30 }),
      expectedCode: 'RATE_LIMITED',
      expectedStatus: 429,
    },
    { error: new Error('database-secret-value'), expectedCode: 'INTERNAL_ERROR', expectedStatus: 500 },
  ])('maps an operation failure to $expectedStatus', async ({ error, expectedCode, expectedStatus }) => {
    const { dependencies, emit, measurements } = createDependencies()

    const response = await invoke(
      dependencies,
      measurements,
      vi.fn(() => Promise.reject(error)),
    )

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(expectedStatus)
    expect((response as Response).headers.get('x-request-id')).toBe('request-id')
    const body = await (response as Response).json()
    expect(body).toMatchObject({ error: { code: expectedCode }, requestId: 'request-id' })
    expect(JSON.stringify(body)).not.toContain('database-secret-value')
    expect(emit).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(emit.mock.calls)).not.toContain('database-secret-value')

    if (expectedStatus === 429) {
      expect((response as Response).headers.get('retry-after')).toBe('30')
    }
  })

  it('preserves safe retry guidance from legacy rate-limit responses', async () => {
    const mapped = await mapOperationError(
      new Response(null, { headers: { 'Retry-After': '45' }, status: 429 }),
      'request-id',
    )

    expect(mapped.response.headers.get('Retry-After')).toBe('45')
    expect(
      (
        await mapOperationError(new OperationError(429, 'RATE_LIMITED', 'Slow down'), 'request-id')
      ).response.headers.get('Retry-After'),
    ).toBe('60')
  })
})

function createDependencies() {
  const emit = vi.fn()
  const setResponseHeader = vi.fn()
  const request = Object.assign(
    new Request('https://example.test/server-function?token=token-secret', {
      headers: {
        authorization: 'authorization-secret',
        cookie: 'session=cookie-secret',
        'x-user-email': 'user@example.test',
      },
    }),
    { cf: { colo: 'FRA' } },
  )
  let now = 100

  const dependencies: OperationRecordDependencies = {
    createRequestId: () => 'request-id',
    emit,
    getDeploymentVersion: () => 'deployment-version',
    getRequest: () => request,
    now: () => now++,
    setResponseHeader,
  }
  const measurements: OperationMeasurements = {
    connectionCloseFailed: false,
    database: { durationMs: 0, roundTrips: 0 },
  }

  return { dependencies, emit, measurements, setResponseHeader }
}

function invoke(
  dependencies: OperationRecordDependencies,
  measurements: OperationMeasurements,
  next: ReturnType<typeof vi.fn>,
) {
  return invokeFunctionMiddleware(createOperationRecordMiddleware({ operation: 'todos.list' }, dependencies), {
    context: { measurements },
    next,
  })
}
