import type { Auth } from '@/server/auth/create-auth'
import { OperationError, mapOperationError } from '@/server/core/errors'

/** Handles public authentication requests with a request ID and standard retry guidance. */
export async function handleAuthRequest(request: Request, auth: Auth) {
  const requestId = crypto.randomUUID()
  const headers = new Headers(request.headers)
  headers.set('X-Request-ID', requestId)
  const response = await auth.handler(new Request(request, { headers }))

  if (response.status !== 429) {
    const result = new Response(response.body, response)
    result.headers.set('X-Request-ID', requestId)
    return result
  }

  const retryAfter = Number(response.headers.get('X-Retry-After'))
  const mapped = await mapOperationError(
    new OperationError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.', {
      retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    }),
    requestId,
  )

  return mapped.response
}
