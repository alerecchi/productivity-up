import { describe, expect, it, vi } from 'vitest'

import { redirectAfterVerification } from '@/routes/_auth-pages/email-verified'

vi.mock('@/server/functions/auth', () => ({
  getUserSession: vi.fn(),
}))

describe('redirectAfterVerification', () => {
  it('uses a document reload to enter the board with fresh auth state', async () => {
    await expectRedirectTo(
      () =>
        redirectAfterVerification({
          search: {},
        }),
      '/board',
      { reloadDocument: true },
    )
  })

  it('returns to email confirmation when the verification callback reports an error', async () => {
    await expectRedirectTo(
      () =>
        redirectAfterVerification({
          search: { error: 'invalid_token' },
        }),
      '/email-confirmation',
    )
  })
})

async function expectRedirectTo(action: () => unknown, to: string, extraOptions: Record<string, unknown> = {}) {
  try {
    await action()
  } catch (error) {
    expect(error).toMatchObject({
      options: { to, ...extraOptions },
    })
    return
  }

  throw new Error(`Expected redirect to ${to}`)
}
