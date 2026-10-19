import { describe, expect, it, vi } from 'vitest'

import { OperationError } from '@/server/core/errors'
import { createDatabaseMiddleware } from '@/server/core/middlewares/database-middleware'
import type { OperationMeasurements } from '@/server/core/middlewares/operation-record-middleware'
import type { Database } from '@/server/db/client'
import { invokeFunctionMiddleware, nextResolvingTo } from '@/test/function-middleware'

describe('database middleware', () => {
  it('gives the operation a metered connection and closes it afterwards', async () => {
    const { close, connect, measurements, middleware } = createMiddleware()
    const next = nextResolvingTo({ id: 7 })

    const result = await invokeFunctionMiddleware(middleware, { context: { measurements }, next })

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(connect).toHaveBeenCalledWith(measurements.database)
    expect(next).toHaveBeenCalledWith({ context: { db: expect.any(Object) } })
    expect(close).toHaveBeenCalledOnce()
    expect(measurements.connectionCloseFailed).toBe(false)
  })

  it('closes its connection when the operation fails', async () => {
    const { close, measurements, middleware } = createMiddleware()
    const error = new OperationError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required')

    const result = await invokeFunctionMiddleware(middleware, {
      context: { measurements },
      next: vi.fn(() => Promise.reject(error)),
    })

    expect(result).toBe(error)
    expect(close).toHaveBeenCalledOnce()
  })

  it('keeps a successful result and reports when closing the connection fails', async () => {
    const { close, measurements, middleware } = createMiddleware()
    close.mockRejectedValueOnce(new Error('connection close failed'))

    const result = await invokeFunctionMiddleware(middleware, {
      context: { measurements },
      next: nextResolvingTo({ id: 7 }),
    })

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(measurements.connectionCloseFailed).toBe(true)
  })

  it('keeps the original error and reports when closing the connection also fails', async () => {
    const { close, measurements, middleware } = createMiddleware()
    close.mockRejectedValueOnce(new Error('connection close failed'))
    const error = new OperationError(409, 'CONFLICT', 'Refresh and retry')

    const result = await invokeFunctionMiddleware(middleware, {
      context: { measurements },
      next: vi.fn(() => Promise.reject(error)),
    })

    expect(result).toBe(error)
    expect(measurements.connectionCloseFailed).toBe(true)
  })
})

function createMiddleware() {
  const close = vi.fn(() => Promise.resolve())
  const connect = vi.fn(() => Promise.resolve({ close, db: {} as Database }))
  const measurements: OperationMeasurements = {
    connectionCloseFailed: false,
    database: { durationMs: 0, roundTrips: 0 },
  }

  return { close, connect, measurements, middleware: createDatabaseMiddleware({ connect }) }
}
