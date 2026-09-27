// @vitest-environment node
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildAuth, createAuthRateLimitStorage } from '@/server/auth'

const BASE_URL = 'http://localhost:3000'
const INITIAL_TIME = new Date('2026-09-27T12:00:00.000Z')

afterEach(() => vi.useRealTimers())

describe('session refresh over HTTP', () => {
  it('keeps due GET reads free of database writes and renews the session through POST', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(INITIAL_TIME)

    const tables: Record<string, Array<Record<string, unknown>>> = {
      account: [],
      session: [],
      user: [],
      verification: [],
    }
    let verificationUrl = ''
    const auth = buildAuth(
      {
        database: memoryAdapter(tables),
        enqueueAuthEmail: (message) => {
          if (message.type === 'verification') verificationUrl = message.url
          return Promise.resolve()
        },
        provisionInitialBoard: () => Promise.resolve(),
        rateLimitStorage: createAuthRateLimitStorage((_key, _windowMs, now) =>
          Promise.resolve({ count: 1, windowStartedAt: now }),
        ),
      },
      { baseUrl: BASE_URL, secret: 'session-refresh-test-secret-with-32-chars' },
    )

    const signUp = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE_URL },
        body: JSON.stringify({
          email: 'user@example.test',
          name: 'User',
          password: 'password-123',
          timeZone: 'Europe/Berlin',
        }),
      }),
    )
    expect(signUp.status).toBe(200)
    expect(verificationUrl).toBeTruthy()

    const verify = await auth.handler(new Request(verificationUrl))
    expect(verify.status).toBe(302)
    const cookie = verify.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    expect(cookie).toContain('session_token')

    vi.setSystemTime(new Date(INITIAL_TIME.getTime() + 25 * 60 * 60 * 1000))
    const storedSessions = structuredClone(tables.session)
    const response = await auth.handler(new Request(`${BASE_URL}/api/auth/get-session`, { headers: { cookie } }))

    expect(response.status).toBe(200)
    const read = (await response.json()) as { needsRefresh: boolean; session: { expiresAt: string } }
    expect(read.needsRefresh).toBe(true)
    expect(tables.session).toEqual(storedSessions)

    const refresh = await auth.handler(
      new Request(`${BASE_URL}/api/auth/get-session`, {
        method: 'POST',
        headers: { cookie, origin: BASE_URL },
      }),
    )
    expect(refresh.status).toBe(200)
    const renewed = (await refresh.json()) as { session: { expiresAt: string } }
    expect(new Date(renewed.session.expiresAt).getTime()).toBeGreaterThan(new Date(read.session.expiresAt).getTime())
  })
})
