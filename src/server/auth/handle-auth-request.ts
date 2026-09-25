import type { Auth } from '@/server/auth/create-auth'

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
  const minimumDuration = ENUMERATION_SENSITIVE_PATHS.has(new URL(request.url).pathname)
    ? delay(MINIMUM_ENUMERATION_SENSITIVE_RESPONSE_MS)
    : Promise.resolve()
  const [response] = await Promise.all([auth.handler(request), minimumDuration])

  return response.status === 429 ? rateLimitedResponse(response) : response
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function rateLimitedResponse(response: Response) {
  return Response.json(
    { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    { headers: { 'Retry-After': response.headers.get('X-Retry-After') ?? '60' }, status: 429 },
  )
}
