import { act, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('renews a signed-in User session through POST when GET reports renewal is due', async () => {
  const methods: Array<string> = []
  const fetchSession = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    methods.push(method)

    return Promise.resolve(
      Response.json({
        session: { expiresAt: '2026-10-04T12:00:00.000Z', id: 'session-1' },
        user: { emailVerified: true, id: 'user-1' },
        ...(method === 'GET' ? { needsRefresh: true } : {}),
      }),
    )
  })
  vi.stubGlobal('fetch', fetchSession)
  vi.stubEnv('VITE_APP_NAME', 'Productivity Up')
  vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')

  const { SessionRefresh } = await import('@/features/authentication/components/session-refresh')
  render(<SessionRefresh />)

  await waitFor(() => expect(methods).toEqual(['GET', 'POST']))
})

it('checks an active User session again while the app stays open', async () => {
  vi.useFakeTimers()
  const methods: Array<string> = []
  const fetchSession = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    methods.push(method)

    return Promise.resolve(
      Response.json({
        session: { expiresAt: '2026-10-04T12:00:00.000Z', id: 'session-1' },
        user: { emailVerified: true, id: 'user-1' },
        ...(method === 'GET' && methods.length > 1 ? { needsRefresh: true } : {}),
      }),
    )
  })
  vi.stubGlobal('fetch', fetchSession)
  vi.stubEnv('VITE_APP_NAME', 'Productivity Up')
  vi.stubEnv('VITE_SERVER_URL', 'http://localhost:3000')

  const { SessionRefresh } = await import('@/features/authentication/components/session-refresh')
  render(<SessionRefresh />)

  await act(async () => vi.advanceTimersByTimeAsync(0))
  expect(methods).toEqual(['GET'])

  await act(async () => vi.advanceTimersByTimeAsync(15 * 60 * 1000))
  expect(methods).toEqual(['GET', 'GET', 'POST'])
})
