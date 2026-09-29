import { afterEach, describe, expect, it, vi } from 'vitest'

import { EmailDeliveryError, sendAuthEmail } from '@/server/email/sender'

const { sendEmailMock } = vi.hoisted(() => {
  return { sendEmailMock: vi.fn() }
})

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendEmailMock }
  },
}))

const consoleMethods = ['debug', 'error', 'info', 'log', 'warn'] as const
const emailConfiguration = {
  apiKey: 'test-resend-api-key',
  appName: 'Productivity Up',
  from: 'noreply@example.test',
}

afterEach(() => {
  sendEmailMock.mockReset()
})

describe('authentication email delivery', () => {
  it('sends verification email to the requested recipient', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'verification-recipient@example.test'
    const verificationUrl = 'https://example.test/verify-email?token=verification-secret'
    sendEmailMock.mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null })

    const result = await sendAuthEmail(
      { actionUrl: verificationUrl, kind: 'email_verification', recipient, recipientName: 'Verification User' },
      emailConfiguration,
    )

    expect(result).toEqual({ providerMessageId: 'email-id' })
    expect(sendEmailMock).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: recipient,
      subject: 'Verify your email for Productivity Up',
      text: expect.stringContaining(verificationUrl),
      html: expect.stringContaining(verificationUrl),
    })
    expectNoApplicationLogs(consoleSpies)
  })

  it('sends password-reset email to the requested recipient', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'password-reset-recipient@example.test'
    const resetUrl = 'https://example.test/reset-password/reset-secret?callbackURL=%2Flogin'
    sendEmailMock.mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null })

    await sendAuthEmail(
      { actionUrl: resetUrl, kind: 'password_reset', recipient, recipientName: 'Password Reset User' },
      emailConfiguration,
    )

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: 'noreply@example.test',
      to: recipient,
      subject: 'Reset your password for Productivity Up',
      text: expect.stringContaining(resetUrl),
      html: expect.stringContaining(resetUrl),
    })
    expectNoApplicationLogs(consoleSpies)
  })

  it('replaces a provider error response with a safe failure carrying the provider code', async () => {
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

    const failure = await sendAuthEmail(
      { actionUrl: resetUrl, kind: 'password_reset', recipient },
      emailConfiguration,
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(EmailDeliveryError)
    expect(failure).toMatchObject({ message: 'Email delivery failed', providerErrorCode: 'validation_error' })
    expectNoApplicationLogs(consoleSpies)
  })

  it('reports an unrecognized provider error name as a generic provider error', async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: 'unexpected', name: 'person@example.test', statusCode: 500 },
      headers: null,
    })

    await expect(
      sendAuthEmail(
        {
          actionUrl: 'https://example.test/verify-email?token=secret',
          kind: 'email_verification',
          recipient: 'a@b.test',
        },
        emailConfiguration,
      ),
    ).rejects.toMatchObject({ providerErrorCode: 'provider_error' })
  })

  it('replaces a thrown provider error with a safe failure', async () => {
    const consoleSpies = spyOnConsole()
    const recipient = 'network-failure@example.test'
    const verificationUrl = 'https://example.test/verify-email?token=network-secret'
    sendEmailMock.mockRejectedValue(new Error(`Provider exposed ${recipient}, ${verificationUrl}, and api-key-secret`))

    await expect(
      sendAuthEmail({ actionUrl: verificationUrl, kind: 'email_verification', recipient }, emailConfiguration),
    ).rejects.toMatchObject({ message: 'Email delivery failed', providerErrorCode: 'provider_unreachable' })

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
