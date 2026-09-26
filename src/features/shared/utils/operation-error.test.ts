import { describe, expect, it } from 'vitest'

import { getOperationErrorMessage } from '@/features/shared/utils/operation-error'

const FALLBACK = 'Could not save the category.'

describe('getOperationErrorMessage', () => {
  it('returns the safe server message from an operation error response', async () => {
    const response = new Response(
      JSON.stringify({
        error: { code: 'CONFLICT', message: 'A category with this name already exists', details: [] },
        requestId: 'request-1',
      }),
      { status: 409 },
    )

    await expect(getOperationErrorMessage(response, FALLBACK)).resolves.toBe('A category with this name already exists')
  })

  it('leaves the original response body readable', async () => {
    const body = { error: { code: 'CONFLICT', message: 'A category with this name already exists' }, requestId: 'r' }
    const response = new Response(JSON.stringify(body), { status: 409 })

    await getOperationErrorMessage(response, FALLBACK)

    await expect(response.json()).resolves.toEqual(body)
  })

  it('returns the fallback when the response body has already been consumed', async () => {
    const response = new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Already used' } }), {
      status: 409,
    })
    await response.text()

    await expect(getOperationErrorMessage(response, FALLBACK)).resolves.toBe(FALLBACK)
  })

  it.each([
    [
      'an internal error without a message',
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR' }, requestId: 'request-1' }), { status: 500 }),
    ],
    ['a legacy top-level message body', new Response(JSON.stringify({ message: 'Raw legacy text' }), { status: 409 })],
    ['a non-JSON body', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['a network failure', new TypeError('Failed to fetch')],
    ['an unexpected exception', new Error('Cannot read properties of undefined')],
  ])('returns the fallback for %s', async (_case, error) => {
    await expect(getOperationErrorMessage(error, FALLBACK)).resolves.toBe(FALLBACK)
  })
})
