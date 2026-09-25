import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { OperationError, mapOperationError } from '@/server/core/errors'
import { createPrivateOperation } from '@/server/core/private-operation'
import type { PrivateOperationDependencies } from '@/server/core/private-operation'
import { RequestValidationError } from '@/server/core/validation'
import type { Database } from '@/server/db/client'
import { PRIVATE_OPERATION_NAMES } from '@/server/functions/private-operation-inventory'

const responseSchema = z.object({ id: z.int().positive() })

describe('private operation public request contract', () => {
  it.each(PRIVATE_OPERATION_NAMES)('%s rejects a signed-out request before product behavior', async (operation) => {
    const next = vi.fn()
    const { close, dependencies, emit } = createDependencies(null)

    const response = await invokeOperation(operation, dependencies, next)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(401)
    await expect((response as Response).json()).resolves.toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required' },
      requestId: 'request-id',
    })
    expect(next).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ operation, outcome: 'unauthorized', status: 401 }))
  })

  it.each(PRIVATE_OPERATION_NAMES)('%s rejects an authenticated unverified User', async (operation) => {
    const next = vi.fn()
    const { close, dependencies, emit } = createDependencies({ emailVerified: false, id: 'user-1' })

    const response = await invokeOperation(operation, dependencies, next)

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(403)
    await expect((response as Response).json()).resolves.toEqual({
      error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification is required' },
      requestId: 'request-id',
    })
    expect(next).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ operation, outcome: 'forbidden', status: 403 }))
  })

  it('proves request ID, verified identity, DTO minimization, database metrics, and telemetry in one request', async () => {
    const { dependencies, emit, getSession, setResponseHeader } = createDependencies({
      emailVerified: true,
      id: 'user-1',
    })
    const next = vi.fn(({ context }) =>
      Promise.resolve(
        middlewareResult(context, {
          id: 7,
          todoContent: 'must be stripped',
          userId: 'must be stripped',
        }),
      ),
    )

    const result = await invokeOperation('todos.list', dependencies, next)

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(next).toHaveBeenCalledWith({
      context: {
        db: expect.any(Object),
        requestId: 'request-id',
        user: { id: 'user-1' },
      },
    })
    expect(setResponseHeader).toHaveBeenCalledWith('X-Request-ID', 'request-id')
    expect(setResponseHeader.mock.invocationCallOrder[0]).toBeLessThan(getSession.mock.invocationCallOrder[0])
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({
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
      /todoContent|must be stripped|cookie-secret|authorization-secret|user@example\.test|token-secret/,
    )
  })

  it('keeps a successful operation result when closing its database connection fails', async () => {
    const { close, dependencies, emit } = createDependencies({ emailVerified: true, id: 'user-1' })
    close.mockRejectedValueOnce(new Error('connection close failed'))

    const result = await invokeOperation(
      'todos.create',
      dependencies,
      vi.fn(({ context }) => Promise.resolve(middlewareResult(context, { id: 7 }))),
    )

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ connectionCloseFailed: true, outcome: 'success', status: 200 }),
    )
  })

  it('keeps the original error when closing its database connection also fails', async () => {
    const { close, dependencies, emit } = createDependencies({ emailVerified: true, id: 'user-1' })
    close.mockRejectedValueOnce(new Error('connection close failed'))

    const result = await invokeOperation(
      'todos.create',
      dependencies,
      vi.fn(() => Promise.reject(new OperationError(409, 'CONFLICT', 'Refresh and retry'))),
    )

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(409)
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
    const { dependencies, emit } = createDependencies({ emailVerified: true, id: 'user-1' })
    const response = await invokeOperation(
      'todos.list',
      dependencies,
      vi.fn(() => Promise.reject(error)),
    )

    expect(response).toBeInstanceOf(Response)
    expect((response as Response).status).toBe(expectedStatus)
    expect((response as Response).headers.get('x-request-id')).toBe('request-id')
    const body = await (response as Response).json()
    expect(body).toMatchObject({ error: { code: expectedCode }, requestId: 'request-id' })
    expect(JSON.stringify(body)).not.toContain('database-secret-value')
    expect(emit).toHaveBeenCalledTimes(1)

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

  it('keeps every declared server function on the shared contract with an explicit method', () => {
    const areas = { board: 6, categories: 4, tags: 4, todos: 5 } as const
    const operationNames: Array<string> = []

    for (const [area, expectedCount] of Object.entries(areas)) {
      const source = readFileSync(join(process.cwd(), 'src/server/functions', area, 'index.ts'), 'utf8')
      expect(source.match(/createServerFn\(\{ method: '(?:GET|POST)' \}\)/g)).toHaveLength(expectedCount)
      expect(source.match(/createPrivateOperation\(\{/g)).toHaveLength(expectedCount)
      expect(source.match(/\.validator\(validateInput\(/g)).toHaveLength(expectedCount)
      expect(source.match(/Promise<z\.output<typeof \w+Response>>/g)).toHaveLength(expectedCount)
      operationNames.push(...[...source.matchAll(/operation: '([^']+)'/g)].map((match) => match[1]))
    }

    expect(operationNames).toEqual(PRIVATE_OPERATION_NAMES)
  })
})

function createDependencies(user: { emailVerified: boolean; id: string } | null) {
  const emit = vi.fn()
  const close = vi.fn(() => Promise.resolve())
  const getSession = vi.fn(() => Promise.resolve(user ? { user } : null))
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

  const dependencies: PrivateOperationDependencies = {
    connect: (metrics) => {
      if (!metrics) {
        throw new Error('Private operations require database metrics')
      }
      metrics.durationMs = 12.345
      metrics.roundTrips = 3
      return Promise.resolve({ close, db: {} as Database })
    },
    createRequestId: () => 'request-id',
    emit,
    getDeploymentVersion: () => 'deployment-version',
    getRequest: () => request,
    getSession,
    now: () => now++,
    setResponseHeader,
  }

  return { close, dependencies, emit, getSession, setResponseHeader }
}

async function invokeOperation(
  operation: string,
  dependencies: PrivateOperationDependencies,
  next: ReturnType<typeof vi.fn>,
) {
  const middleware = createPrivateOperation({ operation, response: responseSchema }, dependencies)
  const server = middleware.options.server as (options: unknown) => Promise<unknown>

  try {
    return await server({
      context: {},
      data: {},
      method: 'GET',
      next,
      serverFnMeta: {},
      signal: new AbortController().signal,
    })
  } catch (error) {
    return error
  }
}

function middlewareResult(context: unknown, result: unknown) {
  return {
    'use functions must return the result of next()': true,
    '~types': { context: {}, sendContext: undefined },
    context,
    result,
    sendContext: undefined,
  }
}
