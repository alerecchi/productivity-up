// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/db/client'
import { readConnectionGrant } from '@/server/realtime/connection-grant'
import {
  REALTIME_AUTHORIZATION_WINDOW_MS,
  handleRealtimeRequest,
  realtimeAllowedOrigins,
} from '@/server/realtime/gateway'
import type { RealtimeGatewayDependencies } from '@/server/realtime/gateway'

const ORIGIN = 'https://app.example.test'
const CLIENT_INSTANCE_ID = '5b0c2f55-6d0e-4d8f-9a39-0f7c7f0d8a11'
const NOW = Date.UTC(2026, 8, 26, 12)

type TestSession = {
  session: { expiresAt: Date }
  user: { emailVerified: boolean; id: string }
}

describe('realtime gateway', () => {
  it('allows both configured production domains but only the configured staging domain', () => {
    const authentication = { baseUrl: 'https://productivity-up.com', secret: 'test-secret' }
    expect(realtimeAllowedOrigins({ authentication, deployment: 'production' })).toEqual(
      new Set(['https://productivity-up.com', 'https://www.productivity-up.com']),
    )
    expect(realtimeAllowedOrigins({ authentication, deployment: 'staging' })).toEqual(
      new Set(['https://productivity-up.com']),
    )
  })

  it("forwards a verified User's upgrade to that User's Durable Object with a connection grant", async () => {
    const { dependencies, forwarded, userRealtime } = createDependencies(verifiedSession('user-1'))

    const response = await handleRealtimeRequest(upgradeRequest(), dependencies)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('accepted by user-1')
    expect(userRealtime.getByName).toHaveBeenCalledExactlyOnceWith('user-1')
    expect(readConnectionGrant(forwarded[0])).toEqual({
      authorizedUntil: NOW + REALTIME_AUTHORIZATION_WINDOW_MS,
      clientInstanceId: CLIENT_INSTANCE_ID,
    })
  })

  it('limits the connection grant to a session that expires sooner than the authorization window', async () => {
    const expiresAt = new Date(NOW + 60 * 1000)
    const { dependencies, forwarded } = createDependencies(verifiedSession('user-1', expiresAt))

    await handleRealtimeRequest(upgradeRequest(), dependencies)

    expect(readConnectionGrant(forwarded[0])?.authorizedUntil).toBe(expiresAt.getTime())
  })

  it('never forwards caller headers such as cookies to the Durable Object', async () => {
    const { dependencies, forwarded } = createDependencies(verifiedSession('user-1'))

    await handleRealtimeRequest(
      upgradeRequest({ headers: { 'X-Realtime-Authorized-Until': String(NOW + 1e12) } }),
      dependencies,
    )

    expect(forwarded[0].headers.get('cookie')).toBeNull()
    expect(readConnectionGrant(forwarded[0])?.authorizedUntil).toBe(NOW + REALTIME_AUTHORIZATION_WINDOW_MS)
  })

  // Better Auth resolves signed-out, expired, and malformed session cookies to no session.
  it('rejects a request without a valid session before reaching any Durable Object', async () => {
    const { close, dependencies, emit, userRealtime } = createDependencies(null)

    const response = await handleRealtimeRequest(upgradeRequest(), dependencies)

    expect(response.status).toBe(401)
    expect(response.headers.get('X-Request-ID')).toBe('request-id')
    expect(await response.json()).toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required' },
      requestId: 'request-id',
    })
    expect(userRealtime.getByName).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ operation: 'realtime.connect', outcome: 'unauthorized', status: 401 }),
    )
  })

  it('rejects an authenticated User whose email is not verified', async () => {
    const { dependencies, userRealtime } = createDependencies({
      ...verifiedSession('user-1'),
      user: { emailVerified: false, id: 'user-1' },
    })

    const response = await handleRealtimeRequest(upgradeRequest(), dependencies)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification is required' },
      requestId: 'request-id',
    })
    expect(userRealtime.getByName).not.toHaveBeenCalled()
  })

  // Browsers attach cookies to cross-site WebSocket upgrades, so the Origin check prevents socket hijacking.
  it.each([
    ['a foreign origin', upgradeRequest({ headers: { origin: 'https://attacker.example.test' } })],
    ['a missing origin', upgradeRequest({ headers: { origin: '' } })],
  ])('rejects %s before looking up a session', async (_case, request) => {
    const { dependencies, getSession, userRealtime } = createDependencies(verifiedSession('user-1'))

    const response = await handleRealtimeRequest(request, dependencies)

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' },
      requestId: 'request-id',
    })
    expect(getSession).not.toHaveBeenCalled()
    expect(userRealtime.getByName).not.toHaveBeenCalled()
  })

  it.each([
    ['a request without a WebSocket upgrade', upgradeRequest({ headers: { upgrade: '' } })],
    ['a non-GET upgrade', upgradeRequest({ method: 'POST' })],
    ['a missing client-instance ID', upgradeRequest({ search: '' })],
    ['a malformed client-instance ID', upgradeRequest({ search: '?clientInstanceId=user-1' })],
    ['an unknown query parameter', upgradeRequest({ search: `?clientInstanceId=${CLIENT_INSTANCE_ID}&userId=user-2` })],
  ])('rejects %s before looking up a session', async (_case, request) => {
    const { dependencies, getSession, userRealtime } = createDependencies(verifiedSession('user-1'))

    const response = await handleRealtimeRequest(request, dependencies)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' }, requestId: 'request-id' })
    expect(getSession).not.toHaveBeenCalled()
    expect(userRealtime.getByName).not.toHaveBeenCalled()
  })
})

function verifiedSession(userId: string, expiresAt = new Date(NOW + 60 * 60 * 1000)): TestSession {
  return { session: { expiresAt }, user: { emailVerified: true, id: userId } }
}

function upgradeRequest({
  headers = {},
  method = 'GET',
  search = `?clientInstanceId=${CLIENT_INSTANCE_ID}`,
}: { headers?: Record<string, string>; method?: string; search?: string } = {}) {
  return new Request(`${ORIGIN}/api/realtime${search}`, {
    headers: { cookie: 'session=secret-cookie', origin: ORIGIN, upgrade: 'websocket', ...headers },
    method,
  })
}

function createDependencies(session: TestSession | null) {
  const forwarded: Array<Request> = []
  const close = vi.fn(() => Promise.resolve())
  const emit = vi.fn()
  const getSession = vi.fn((_db: Database, _headers: Headers) => Promise.resolve(session))
  const userRealtime = {
    getByName: vi.fn((name: string) => ({
      fetch: (request: Request) => {
        forwarded.push(request)
        return Promise.resolve(new Response(`accepted by ${name}`))
      },
    })),
  }
  const dependencies: RealtimeGatewayDependencies = {
    allowedOrigins: new Set([ORIGIN]),
    connect: vi.fn(() => Promise.resolve({ close, db: {} as Database })),
    createRequestId: () => 'request-id',
    emit,
    getDeploymentVersion: () => 'version-1',
    getSession,
    now: () => NOW,
    userRealtime,
  }

  return { close, dependencies, emit, forwarded, getSession, userRealtime }
}
