// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { createAuthEmailDispatcher } from '@/server/email/auth-email'
import type { AuthEmail, AuthEmailDispatcherDependencies, AuthEmailSendRecord } from '@/server/email/auth-email'
import { EmailDeliveryError } from '@/server/email/sender'

const verificationEmail: AuthEmail = {
  actionUrl: 'https://example.test/verify-email?token=verification-secret',
  kind: 'email_verification',
  recipient: 'person@example.test',
  recipientName: 'Private Name',
}

function createDependencies(overrides: Partial<AuthEmailDispatcherDependencies> = {}) {
  const records: Array<AuthEmailSendRecord> = []
  const scheduled: Array<Promise<unknown>> = []
  const dependencies: AuthEmailDispatcherDependencies = {
    deploymentVersion: 'version-1',
    emit: (record) => records.push(record),
    schedule: (work) => scheduled.push(work),
    send: vi.fn(() => Promise.resolve({ providerMessageId: 'provider-message-1' })),
    ...overrides,
  }

  return { dependencies, records, scheduled }
}

describe('authentication email dispatch', () => {
  it('schedules the send and records a sent outcome', async () => {
    const { dependencies, records, scheduled } = createDependencies()

    await createAuthEmailDispatcher(dependencies)(verificationEmail, 'request-1')
    expect(dependencies.send).toHaveBeenCalledWith(verificationEmail)
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)

    expect(records).toEqual([
      {
        deploymentVersion: 'version-1',
        kind: 'email_verification',
        operation: 'auth_email.send',
        outcome: 'sent',
        providerMessageId: 'provider-message-1',
        requestId: 'request-1',
        thirdPartyDurationMs: expect.any(Number),
      },
    ])
  })

  it('returns before the provider finishes', async () => {
    const { dependencies, records, scheduled } = createDependencies({ send: () => new Promise(() => undefined) })

    await createAuthEmailDispatcher(dependencies)(verificationEmail, 'request-1')

    expect(scheduled).toHaveLength(1)
    expect(records).toEqual([])
  })

  it('records a failed outcome with the safe provider error code without rejecting', async () => {
    const { dependencies, records, scheduled } = createDependencies({
      send: () => Promise.reject(new EmailDeliveryError('rate_limit_exceeded')),
    })

    await createAuthEmailDispatcher(dependencies)(verificationEmail, 'request-1')
    await Promise.all(scheduled)

    expect(records).toEqual([
      {
        deploymentVersion: 'version-1',
        kind: 'email_verification',
        operation: 'auth_email.send',
        outcome: 'failed',
        providerErrorCode: 'rate_limit_exceeded',
        requestId: 'request-1',
        thirdPartyDurationMs: expect.any(Number),
      },
    ])
  })

  it('reports an unexpected failure as a generic provider error without its message', async () => {
    const { dependencies, records, scheduled } = createDependencies({
      send: () =>
        Promise.reject(new Error(`Could not send ${verificationEmail.actionUrl} to ${verificationEmail.recipient}`)),
    })

    await createAuthEmailDispatcher(dependencies)(verificationEmail, 'request-1')
    await Promise.all(scheduled)

    expect(records).toEqual([expect.objectContaining({ outcome: 'failed', providerErrorCode: 'provider_error' })])
    const serialized = JSON.stringify(records)
    expect(serialized).not.toContain(verificationEmail.recipient)
    expect(serialized).not.toContain('verification-secret')
    expect(serialized).not.toContain('Private Name')
  })

  it('sends inline when no request context can keep the work alive', async () => {
    const { dependencies, records } = createDependencies({
      schedule: () => {
        throw new Error('waitUntil is unavailable outside a request')
      },
    })

    await createAuthEmailDispatcher(dependencies)(verificationEmail, 'request-1')

    expect(records).toEqual([expect.objectContaining({ outcome: 'sent' })])
  })
})
