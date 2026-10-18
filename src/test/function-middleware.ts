import { vi } from 'vitest'

/**
 * Runs one function middleware's server step on its own, with `next` standing in for every inner middleware and the
 * handler. A thrown value is returned, so tests can assert on rejected Responses and errors alike.
 */
export async function invokeFunctionMiddleware(
  middleware: { options: { server?: unknown } },
  { context = {}, next }: { context?: Record<string, unknown>; next: ReturnType<typeof vi.fn> },
) {
  const server = middleware.options.server as (options: unknown) => Promise<unknown>

  try {
    return await server({
      context,
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

/** A `next` that resolves like an inner middleware chain whose handler returned `result`. */
export function nextResolvingTo(result: unknown) {
  return vi.fn(({ context }: { context?: unknown } = {}) =>
    Promise.resolve({
      'use functions must return the result of next()': true,
      '~types': { context: {}, sendContext: undefined },
      context,
      result,
      sendContext: undefined,
    }),
  )
}
