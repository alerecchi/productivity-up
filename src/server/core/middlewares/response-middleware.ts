import { createMiddleware } from '@tanstack/react-start'
import type { z } from 'zod'

/**
 * Replaces the handler's result with its parsed response DTO, so fields outside the DTO never cross the boundary.
 * A result that does not match is an unexpected failure.
 */
export function createResponseMiddleware<TResponse extends z.ZodType>({ response }: { response: TResponse }) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const result = await next()
    const parsedResponse = response.safeParse(Reflect.get(result, 'result'))

    if (!parsedResponse.success) {
      throw new Error('Invalid response DTO')
    }

    return { ...result, result: parsedResponse.data }
  })
}
