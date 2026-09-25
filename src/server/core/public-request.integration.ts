import handler from '@tanstack/react-start/server-entry'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  completeDay,
  confirmMigrationStep,
  getBoard,
  getBuckets,
  getMigrationStep,
  reconcileLifecycle,
} from '@/server/functions/board'
import { createCategory, deleteCategory, listCategories, updateCategory } from '@/server/functions/categories'
import { PRIVATE_OPERATION_NAMES } from '@/server/functions/private-operation-inventory'
import { createTag, deleteTag, listTags, updateTag } from '@/server/functions/tags'
import { createTodo, deleteTodo, getTodos, moveTodo, updateTodo } from '@/server/functions/todos'

const fixture = vi.hoisted(() => ({
  failCategories: false,
  user: null as { emailVerified: boolean; id: string } | null,
}))

vi.mock('@/server/db/client', () => ({
  connectDatabase: vi.fn((metrics: { durationMs: number; roundTrips: number }) => {
    metrics.durationMs = 5
    metrics.roundTrips = 2

    return Promise.resolve({
      close: vi.fn(() => Promise.resolve()),
      db: {
        query: {
          categories: {
            findMany: () =>
              fixture.failCategories
                ? Promise.reject(new Error('private-database-value'))
                : Promise.resolve([
                    { colorKey: 'blue', id: 7, name: 'Project', secret: 'private-value', userId: 'user-1' },
                  ]),
          },
        },
      },
    })
  }),
}))

vi.mock('@/server/auth', () => ({
  createAuth: () => ({ api: { getSession: () => Promise.resolve(fixture.user ? { user: fixture.user } : null) } }),
}))

const privateFunctions = [
  ['board.get', getBoard],
  ['board.reconcileLifecycle', reconcileLifecycle],
  ['board.completeDay', completeDay],
  ['board.getMigrationStep', getMigrationStep],
  ['board.confirmMigrationStep', confirmMigrationStep],
  ['board.getBuckets', getBuckets],
  ['categories.create', createCategory],
  ['categories.list', listCategories],
  ['categories.update', updateCategory],
  ['categories.delete', deleteCategory],
  ['tags.create', createTag],
  ['tags.list', listTags],
  ['tags.update', updateTag],
  ['tags.delete', deleteTag],
  ['todos.create', createTodo],
  ['todos.list', getTodos],
  ['todos.update', updateTodo],
  ['todos.move', moveTodo],
  ['todos.delete', deleteTodo],
] as const

let completionSpy: ReturnType<typeof vi.spyOn>

describe('public private-operation request seam', () => {
  beforeAll(() => {
    completionSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterAll(() => {
    completionSpy.mockRestore()
  })

  beforeEach(() => {
    fixture.failCategories = false
    fixture.user = null
    completionSpy.mockClear()
  })

  it('covers exactly the exported private operation inventory', () => {
    expect(privateFunctions.map(([operation]) => operation)).toEqual(PRIVATE_OPERATION_NAMES)
  })

  it.each(privateFunctions)('%s rejects a signed-out HTTP request', async (operation, serverFunction) => {
    const response = await requestServerFunction(serverFunction)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required' },
      requestId: response.headers.get('X-Request-ID'),
    })
    expect(completionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation, outcome: 'unauthorized', status: 401 }),
    )
  })

  it.each(privateFunctions)('%s rejects an unverified HTTP request', async (operation, serverFunction) => {
    fixture.user = { emailVerified: false, id: 'user-1' }

    const response = await requestServerFunction(serverFunction)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification is required' },
      requestId: response.headers.get('X-Request-ID'),
    })
    expect(completionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ operation, outcome: 'forbidden', status: 403 }),
    )
  })

  it('proves the exported verified request minimizes the DTO and emits safe completion telemetry', async () => {
    fixture.user = { emailVerified: true, id: 'user-1' }

    const response = await requestServerFunction(listCategories)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Request-ID')).toBeTruthy()
    expect(body).toContain('Project')
    expect(body).not.toContain('private-value')
    expect(body).not.toContain('user-1')
    expect(completionSpy).toHaveBeenCalledTimes(1)

    const record = completionSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(record).toMatchObject({
      conflict: false,
      connectionCloseFailed: false,
      databaseDurationMs: 5,
      databaseRoundTrips: 2,
      operation: 'categories.list',
      outcome: 'success',
      rateLimited: false,
      requestId: response.headers.get('X-Request-ID'),
      status: 200,
    })
    expect(Object.keys(record).sort()).toEqual(
      [
        'coldStart',
        'conflict',
        'connectionCloseFailed',
        'databaseDurationMs',
        'databaseRoundTrips',
        'deploymentVersion',
        'operation',
        'outcome',
        'rateLimited',
        'region',
        'requestId',
        'responseBytes',
        'status',
        'thirdPartyDurationMs',
        'totalDurationMs',
      ].sort(),
    )
    expect(JSON.stringify(record)).not.toMatch(/private-value|user-1|cookie-secret|authorization-secret/)
  })

  it('maps invalid input to a safe 400 through the exported HTTP request path', async () => {
    fixture.user = { emailVerified: true, id: 'user-1' }

    const response = await requestServerFunction(createCategory)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toMatchObject({
      error: { code: 'VALIDATION_FAILED', details: expect.any(Array) },
      requestId: response.headers.get('X-Request-ID'),
    })
    expect(completionSpy).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'validation_error', status: 400 }))
  })

  it('maps unexpected failures to a request-ID-only 500 through the exported HTTP request path', async () => {
    fixture.user = { emailVerified: true, id: 'user-1' }
    fixture.failCategories = true

    const response = await requestServerFunction(listCategories)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR' },
      requestId: response.headers.get('X-Request-ID'),
    })
    expect(JSON.stringify(completionSpy.mock.calls)).not.toContain('private-database-value')
    expect(completionSpy).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'error', status: 500 }))
  })
})

function requestServerFunction(serverFunction: unknown) {
  const { method, url } = serverFunction as { method: string; url: string }

  return handler.fetch(
    new Request(new URL(url, 'http://localhost:3000'), {
      headers: {
        authorization: 'Bearer authorization-secret',
        cookie: 'session=cookie-secret',
        'sec-fetch-site': 'same-origin',
        'x-tsr-serverFn': 'true',
      },
      method,
    }),
  )
}
