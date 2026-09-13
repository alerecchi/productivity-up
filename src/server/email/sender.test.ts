import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendEmailConfirmation, sendResetPassword } from '@/server/email/sender'

const { sendEmailMock } = vi.hoisted(() => {
  process.env.APP_NAME = 'Productivity Up'
  process.env.EMAIL_FROM = 'noreply@example.test'
  process.env.RESEND_API_KEY = 'test-resend-api-key'

  return { sendEmailMock: vi.fn() }
})

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmailMock }
  },
}))

const consoleMethods = ['debug', 'error', 'info', 'log', 'warn'] as const

afterEach(() => {
  sendEmailMock.mockReset()
})

describe('authentication email delivery', () => {
  it('sends verification email to the requested recipient without application logging', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'verification-recipient@example.test'
    const verificationUrl = 'https://example.test/verify-email?token=verification-secret'
    sendEmailMock.mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null })

    await sendEmailConfirmation({
      to: recipient,
      userName: 'Verification User',
      url: verificationUrl,
    })

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: recipient,
      subject: 'Verify your email for Productivity Up',
      text: expect.stringContaining(verificationUrl),
      html: expect.stringContaining(verificationUrl),
    })
    expectNoApplicationLogs(consoleSpies)
  })

  it('sends password-reset email to the requested recipient without application logging', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'password-reset-recipient@example.test'
    const resetUrl = 'https://example.test/reset-password/reset-secret?callbackURL=%2Flogin'
    sendEmailMock.mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null })

    await sendResetPassword({
      to: recipient,
      userName: 'Password Reset User',
      url: resetUrl,
    })

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: recipient,
      subject: 'Reset your password for Productivity Up',
      text: expect.stringContaining(resetUrl),
      html: expect.stringContaining(resetUrl),
    })
    expectNoApplicationLogs(consoleSpies)
  })

  it('replaces a provider error response with a safe failure', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'rejected-recipient@example.test'
    const resetUrl = 'https://example.test/reset-password/rejected-secret?callbackURL=%2Flogin'
    sendEmailMock.mockResolvedValue({
      data: null,
      error: {
        message: `Could not deliver ${resetUrl} to ${recipient}`,
        name: 'validation_error',
        statusCode: 422,
      },
      headers: { authorization: 'provider-credential' },
    })

    await expect(sendResetPassword({ to: recipient, url: resetUrl })).rejects.toThrow(/^Email delivery failed$/)

    expectNoApplicationLogs(consoleSpies)
  })

  it('replaces a thrown provider error with a safe failure', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'network-failure@example.test'
    const verificationUrl = 'https://example.test/verify-email?token=network-secret'
    sendEmailMock.mockRejectedValue(new Error(`Provider exposed ${recipient}, ${verificationUrl}, and api-key-secret`))

    await expect(sendEmailConfirmation({ to: recipient, url: verificationUrl })).rejects.toThrow(
      /^Email delivery failed$/,
    )

    expectNoApplicationLogs(consoleSpies)
  })
})

function spyOnConsole() {
  return consoleMethods.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined))
}

function expectNoApplicationLogs(consoleSpies: Array<ReturnType<typeof vi.spyOn>>) {
  for (const consoleSpy of consoleSpies) {
    expect(consoleSpy).not.toHaveBeenCalled()
  }
}
