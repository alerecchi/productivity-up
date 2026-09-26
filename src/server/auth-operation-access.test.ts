import { describe, expect, it, vi } from 'vitest'

import { authorizeAccountOperation } from '@/server/auth-operation-access'

const unverifiedSession = { user: { emailVerified: false } }

describe('authorizeAccountOperation', () => {
  it.each(['/update-user', '/change-password', '/list-sessions', '/delete-user'])(
    'requires email verification before an unverified User calls %s',
    async (path) => {
      await expect(authorizeAccountOperation(path, () => Promise.resolve(unverifiedSession))).resolves.toBe(
        'email-verification-required',
      )
    },
  )

  const allowedPaths = [
    '/get-session',
    '/sign-out',
    '/sign-in/email',
    '/sign-in/social',
    '/sign-up/email',
    '/send-verification-email',
    '/verify-email',
    '/request-password-reset',
    '/reset-password',
    '/reset-password/:token',
    '/callback/:id',
    '/ok',
    '/error',
  ]

  it.each(allowedPaths)('lets an unverified User call %s without loading the session', async (path) => {
    const loadSession = vi.fn(() => Promise.resolve(unverifiedSession))

    await expect(authorizeAccountOperation(path, loadSession)).resolves.toBe('allow')
    expect(loadSession).not.toHaveBeenCalled()
  })

  it.each(allowedPaths)('lets a signed-out caller use %s without loading the session', async (path) => {
    const loadSession = vi.fn(() => Promise.resolve(null))

    await expect(authorizeAccountOperation(path, loadSession)).resolves.toBe('allow')
    expect(loadSession).not.toHaveBeenCalled()
  })

  it('rejects a gated path when the authoritative session is missing', async () => {
    await expect(authorizeAccountOperation('/update-user', () => Promise.resolve(null))).resolves.toBe(
      'authentication-required',
    )
  })

  it('allows a verified User to call a gated path', async () => {
    await expect(
      authorizeAccountOperation('/change-password', () => Promise.resolve({ user: { emailVerified: true } })),
    ).resolves.toBe('allow')
  })
})
