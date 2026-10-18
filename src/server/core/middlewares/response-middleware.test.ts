import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createResponseMiddleware } from '@/server/core/middlewares/response-middleware'
import { invokeFunctionMiddleware, nextResolvingTo } from '@/test/function-middleware'

const middleware = createResponseMiddleware({ response: z.object({ id: z.int().positive() }) })

describe('response middleware', () => {
  it('replaces the handler result with its response DTO', async () => {
    const result = await invokeFunctionMiddleware(middleware, {
      next: nextResolvingTo({ id: 7, todoContent: 'must be stripped', userId: 'must be stripped' }),
    })

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(JSON.stringify(result)).not.toContain('must be stripped')
  })

  it('fails when the handler result does not match the response DTO', async () => {
    const error = await invokeFunctionMiddleware(middleware, { next: nextResolvingTo({ id: -1 }) })

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Response)
  })
})
