// @vitest-environment node
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it, vi } from 'vitest'

import { AUTH_RATE_LIMIT_RULES, buildAuth, createAuthRateLimitStorage, handleAuthRequest } from '@/server/auth'
import type { RateLimitCounter } from '@/server/auth'

const BASE_URL = 'http://localhost:3000'

type SharedState = {
  counter: RateLimitCounter
  now: number
  tables: Record<string, Array<Record<string, unknown>>>
}

function createSharedState(): SharedState {
  return {
    counter: createInMemoryCounter(),
    now: Date.UTC(2026, 8, 25, 12),
    tables: { account: [], session: [], user: [], verification: [] },
  }
}

/** Mirrors the Neon counter statement: increment the current fixed window or start a new one. */
function createInMemoryCounter(): RateLimitCounter {
  const windows = new Map<string, { count: number; windowStartedAt: number }>()

  return (key, windowMs, now) => {
    const current = windows.get(key)
    const next =
      !current || current.windowStartedAt <= now - windowMs
        ? { count: 1, windowStartedAt: now }
        : { count: current.count + 1, windowStartedAt: current.windowStartedAt }

    windows.set(key, next)
    return Promise.resolve(next)
  }
}

function createTestAuth(state: SharedState) {
  return buildAuth(
    {
      database: memoryAdapter(state.tables),
      enqueueAuthEmail: vi.fn(() => Promise.resolve()),
      provisionInitialBoard: () => Promise.resolve(),
      rateLimitStorage: createAuthRateLimitStorage(state.counter, () => state.now),
    },
    { baseUrl: BASE_URL, secret: 'handle-auth-request-test-secret-with-32-chars' },
  )
}

function authRequest(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request(`${BASE_URL}/api/auth${path}`, {
    body: JSON.stringify(body),
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
      origin: BASE_URL,
      ...headers,
    },
    method: 'POST',
  })
}

describe('public authentication rate limits', () => {
  it('throttles sign-in after ten attempts with safe retry guidance', async () => {
    const auth = createTestAuth(createSharedState())
    const signIn = () =>
      handleAuthRequest(
        authRequest('/sign-in/email', { email: 'missing@example.test', password: 'wrong-password' }),
        auth,
      )

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await signIn()).status).toBe(401)
    }

    const throttled = await signIn()

    expect(throttled.status).toBe(429)
    expect(await throttled.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
      requestId: expect.any(String),
    })
    expect(throttled.headers.get('X-Request-ID')).toBeTruthy()
    expect(throttled.headers.get('Retry-After')).toBe('600')
  })

  it('shares a route counter between independent auth instances', async () => {
    const state = createSharedState()
    const firstIsolate = createTestAuth(state)
    const secondIsolate = createTestAuth(state)
    const request = () => authRequest('/sign-in/email', { email: 'missing@example.test', password: 'wrong-password' })

    for (let attempt = 1; attempt <= AUTH_RATE_LIMIT_RULES['/sign-in/email'].max; attempt += 1) {
      expect((await firstIsolate.handler(request())).status).toBe(401)
    }

    expect((await secondIsolate.handler(request())).status).toBe(429)
  })

  it('ignores spoofed forwarding headers when identifying the client IP', async () => {
    const auth = createTestAuth(createSharedState())

    for (let attempt = 1; attempt <= AUTH_RATE_LIMIT_RULES['/sign-in/email'].max; attempt += 1) {
      const response = await auth.handler(
        authRequest(
          '/sign-in/email',
          { email: 'missing@example.test', password: 'wrong-password' },
          {
            forwarded: `for=198.51.100.${attempt}`,
            'x-forwarded-for': `198.51.100.${attempt}`,
          },
        ),
      )
      expect(response.status).toBe(401)
    }

    const throttled = await auth.handler(
      authRequest(
        '/sign-in/email',
        { email: 'missing@example.test', password: 'wrong-password' },
        {
          forwarded: 'for=198.51.100.99',
          'x-forwarded-for': '198.51.100.99',
        },
      ),
    )
    expect(throttled.status).toBe(429)
  })

  it.each([
    ['/request-password-reset', (email: string) => ({ email })],
    ['/reset-password', (email: string) => ({ newPassword: 'password-123', token: email })],
    ['/send-verification-email', (email: string) => ({ email })],
    ['/sign-in/email', (email: string) => ({ email, password: 'wrong-password' })],
    ['/sign-up/email', (email: string) => ({ email, name: 'Person', password: 'password-123' })],
  ] as const)('applies the configured limit to %s', async (path, body) => {
    const auth = createTestAuth(createSharedState())
    const max = AUTH_RATE_LIMIT_RULES[path].max

    for (let attempt = 1; attempt <= max; attempt += 1) {
      const response = await auth.handler(authRequest(path, body(`person-${attempt}@example.test`)))
      expect(response.status).not.toBe(429)
    }

    expect((await auth.handler(authRequest(path, body('throttled@example.test')))).status).toBe(429)
  })

  it('starts a new window once the previous one has elapsed', async () => {
    const state = createSharedState()
    const auth = createTestAuth(state)
    const requestReset = () =>
      handleAuthRequest(authRequest('/request-password-reset', { email: 'missing@example.test' }), auth)

    await Promise.all([requestReset(), requestReset(), requestReset()])
    state.now += 14 * 60 * 1000

    const stillThrottled = await requestReset()
    state.now += 60 * 1000

    expect(stillThrottled.headers.get('Retry-After')).toBe('60')
    expect((await requestReset()).status).toBe(200)
  })
})

describe('public authentication enumeration resistance', () => {
  const existingEmail = 'existing@example.test'
  const missingEmail = 'missing@example.test'

  async function createAuthWithUnverifiedUser() {
    const auth = createTestAuth(createSharedState())
    const response = await handleAuthRequest(
      authRequest('/sign-up/email', signUpBody(existingEmail), { 'cf-connecting-ip': '203.0.113.99' }),
      auth,
    )
    expect(response.status).toBe(200)
    return auth
  }

  function signUpBody(email: string) {
    return { email, name: 'Person', password: 'password-123', timeZone: 'Europe/Rome' }
  }

  /** Reads a response without the values that legitimately differ: the submitted email, generated IDs, and timestamps. */
  async function comparable(response: Response, email: string) {
    const body = JSON.parse(
      (await response.text())
        .replaceAll(email, '<email>')
        .replace(/"(id|createdAt|updatedAt)":"[^"]*"/g, '"$1":"<generated>"'),
    ) as { user?: Record<string, unknown> }

    // The memory adapter omits unset nullable columns that PostgreSQL returns as null.
    if (body.user) {
      body.user.image ??= null
    }

    return { body, status: response.status }
  }

  it.each([
    ['/sign-up/email', signUpBody],
    ['/request-password-reset', (email: string) => ({ email })],
    ['/send-verification-email', (email: string) => ({ email })],
  ])('%s responds the same for existing and missing email addresses', async (path, body) => {
    const auth = await createAuthWithUnverifiedUser()

    const [existing, missing] = await Promise.all([
      handleAuthRequest(authRequest(path, body(existingEmail)), auth),
      handleAuthRequest(authRequest(path, body(missingEmail)), auth),
    ])

    expect(await comparable(existing, existingEmail)).toEqual(await comparable(missing, missingEmail))
  })

  it('applies the enumeration response hold to normalized trailing-slash paths', async () => {
    vi.useFakeTimers()
    try {
      const auth = {
        handler: vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
      } as unknown as ReturnType<typeof createTestAuth>
      const response = handleAuthRequest(authRequest('/request-password-reset/', { email: missingEmail }), auth)
      let settled = false
      void response.then(() => {
        settled = true
      })

      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      expect((await response).status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })
})
