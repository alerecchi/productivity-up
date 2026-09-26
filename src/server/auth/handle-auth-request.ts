import type { Auth } from '@/server/auth/create-auth'
import { OperationError, mapOperationError } from '@/server/core/errors'

// Routes whose work differs between existing and missing emails; each response is held to the same minimum duration.
const ENUMERATION_SENSITIVE_PATHS = new Set([
  '/api/auth/request-password-reset',
  '/api/auth/send-verification-email',
  '/api/auth/sign-up/email',
])
const MINIMUM_ENUMERATION_SENSITIVE_RESPONSE_MS = 500

/**
 * Handles a public `/api/auth/*` request. Enumeration-sensitive routes respond no sooner than a shared minimum
 * duration, and throttled requests receive standard retry guidance.
 */
export async function handleAuthRequest(request: Request, auth: Auth) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
  const minimumDuration = ENUMERATION_SENSITIVE_PATHS.has(pathname)
    ? delay(MINIMUM_ENUMERATION_SENSITIVE_RESPONSE_MS)
    : Promise.resolve()
  const [response] = await Promise.all([auth.handler(request), minimumDuration])

  if (response.status !== 429) {
    return response
  }

  const retryAfter = Number(response.headers.get('X-Retry-After'))
  const mapped = await mapOperationError(
    new OperationError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.', {
      retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    }),
    crypto.randomUUID(),
  )

  return mapped.response
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
