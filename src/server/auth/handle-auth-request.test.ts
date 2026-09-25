// @vitest-environment node
import { memoryAdapter } from 'better-auth/adapters/memory'
import { describe, expect, it, vi } from 'vitest'

import { buildAuth, createAuthRateLimitStorage, handleAuthRequest } from '@/server/auth'
import type { RateLimitCounter } from '@/server/auth'
import { sendEmailConfirmation, sendResetPassword } from '@/server/email/sender'

vi.mock('@/server/email/sender', () => ({
  sendEmailConfirmation: vi.fn(() => Promise.resolve()),
  sendResetPassword: vi.fn(() => Promise.resolve()),
}))

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
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
    })
    expect(throttled.headers.get('Retry-After')).toBe('600')
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
  ])('%s responds the same when email delivery fails', async (path, body) => {
    const auth = await createAuthWithUnverifiedUser()
    vi.mocked(sendEmailConfirmation).mockRejectedValue(new Error('provider unavailable'))
    vi.mocked(sendResetPassword).mockRejectedValue(new Error('provider unavailable'))

    const [existing, missing] = await Promise.all([
      handleAuthRequest(authRequest(path, body(existingEmail)), auth),
      handleAuthRequest(authRequest(path, body(missingEmail)), auth),
    ])

    expect(await comparable(existing, existingEmail)).toEqual(await comparable(missing, missingEmail))
  })

  it.each([
    ['/sign-up/email', missingEmail, signUpBody],
    ['/request-password-reset', existingEmail, (email: string) => ({ email })],
    ['/send-verification-email', existingEmail, (email: string) => ({ email })],
  ])('%s responds without waiting for email delivery', async (path, email, body) => {
    const auth = await createAuthWithUnverifiedUser()
    vi.mocked(sendEmailConfirmation).mockReturnValue(new Promise(() => {}))
    vi.mocked(sendResetPassword).mockReturnValue(new Promise(() => {}))

    const response = await handleAuthRequest(authRequest(path, body(email)), auth)

    expect(response.status).toBe(200)
  })

  it.each([
    ['/sign-up/email', signUpBody],
    ['/request-password-reset', (email: string) => ({ email })],
    ['/send-verification-email', (email: string) => ({ email })],
  ])('%s holds existing and missing email responses to the same minimum duration', async (path, body) => {
    const auth = await createAuthWithUnverifiedUser()

    for (const email of [existingEmail, missingEmail]) {
      const startedAt = performance.now()
      await handleAuthRequest(authRequest(path, body(email)), auth)

      // Allows 1 ms for timer granularity between setTimeout and performance.now().
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(499)
    }
  })
})
