import { describe, expect, it, vi } from 'vitest'

import { OperationError } from '@/server/core/errors'
import { createRequireVerifiedUserMiddleware } from '@/server/core/middlewares/verified-user-middleware'
import { invokeFunctionMiddleware, nextResolvingTo } from '@/test/function-middleware'

describe('verified user middleware', () => {
  it.each([
    ['a signed-out request', null, 401, 'AUTHENTICATION_REQUIRED'],
    ['an authenticated unverified User', { emailVerified: false, id: 'user-1' }, 403, 'EMAIL_VERIFICATION_REQUIRED'],
  ])('rejects %s before product behavior', async (_case, user, status, code) => {
    const next = vi.fn()

    const error = await invoke(user, next)

    expect(error).toBeInstanceOf(OperationError)
    expect(error).toMatchObject({ code, status })
    expect(next).not.toHaveBeenCalled()
  })

  it('gives the operation only the verified User ID', async () => {
    const next = nextResolvingTo({ id: 7 })

    const result = await invoke({ email: 'user@example.test', emailVerified: true, id: 'user-1' }, next)

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(next).toHaveBeenCalledWith({ context: { user: { id: 'user-1' } } })
  })
})

function invoke(user: { email?: string; emailVerified: boolean; id: string } | null, next: ReturnType<typeof vi.fn>) {
  const request = new Request('https://example.test/server-function', { headers: { cookie: 'session=cookie' } })
  const getSession = vi.fn((_db: unknown, headers: Headers) =>
    Promise.resolve(headers.get('cookie') && user ? { user } : null),
  )

  return invokeFunctionMiddleware(createRequireVerifiedUserMiddleware({ getRequest: () => request, getSession }), {
    context: { db: {} },
    next,
  })
}
