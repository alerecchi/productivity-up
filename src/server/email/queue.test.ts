// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { handleAuthEmailBatch } from '@/server/email/queue'

const { sendEmailConfirmation, sendResetPassword } = vi.hoisted(() => ({
  sendEmailConfirmation: vi.fn(() => Promise.resolve()),
  sendResetPassword: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/server/email/sender', () => ({ sendEmailConfirmation, sendResetPassword }))

describe('authentication email queue consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendEmailConfirmation.mockResolvedValue()
    sendResetPassword.mockResolvedValue()
  })

  it('acknowledges messages after provider delivery succeeds', async () => {
    const ack = vi.fn()
    const retry = vi.fn()

    await handleAuthEmailBatch({
      messages: [
        {
          ack,
          body: { to: 'person@example.test', type: 'verification', url: 'https://example.test/verify' },
          retry,
        },
      ],
    })

    expect(sendEmailConfirmation).toHaveBeenCalledOnce()
    expect(ack).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it('retries messages after provider delivery fails', async () => {
    const ack = vi.fn()
    const retry = vi.fn()
    sendResetPassword.mockRejectedValueOnce(new Error('provider unavailable'))

    await handleAuthEmailBatch({
      messages: [
        {
          ack,
          body: { to: 'person@example.test', type: 'password-reset', url: 'https://example.test/reset' },
          retry,
        },
      ],
    })

    expect(ack).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledOnce()
  })
})
