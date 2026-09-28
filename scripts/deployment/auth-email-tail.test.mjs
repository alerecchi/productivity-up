import { describe, expect, it } from 'vitest'

import { findAuthEmailSendRecord } from './auth-email-tail.mjs'

function tailEvent(record) {
  return JSON.stringify({ logs: [{ level: 'info', message: [record] }] }, null, 4)
}

describe('staging authentication email tail selection', () => {
  it('ignores unrelated failures and sends from concurrent staging requests', () => {
    const output = [
      tailEvent({ operation: 'auth_email.send', outcome: 'failed', requestId: 'other-request' }),
      tailEvent({
        operation: 'auth_email.send',
        outcome: 'sent',
        providerMessageId: 'other-message',
        requestId: 'other-request',
      }),
      tailEvent({
        operation: 'auth_email.send',
        outcome: 'sent',
        providerMessageId: 'our-message',
        requestId: 'our-request',
      }),
    ].join('\n')

    expect(findAuthEmailSendRecord(output, 'our-request')).toMatchObject({
      outcome: 'sent',
      providerMessageId: 'our-message',
    })
  })

  it('accepts a serialized record and ignores an incomplete tail event', () => {
    const record = { operation: 'auth_email.send', outcome: 'failed', requestId: 'our-request' }
    const output = `${tailEvent(JSON.stringify(record))}\n{"logs": [`

    expect(findAuthEmailSendRecord(output, 'our-request')).toEqual(record)
  })
})
