import { describe, expect, it, vi } from 'vitest'

import type { RealtimeHint } from '@/lib/realtime'
import { OperationError } from '@/server/core/errors'
import { createRealtimeHintsMiddleware } from '@/server/core/middlewares/realtime-hints-middleware'
import type { RealtimeHintsMiddlewareDependencies } from '@/server/core/middlewares/realtime-hints-middleware'
import { invokeFunctionMiddleware, nextResolvingTo } from '@/test/function-middleware'

const CLIENT_INSTANCE_ID = '5b0c2f55-6d0e-4d8f-9a39-0f7c7f0d8a11'
const createdHints = ({ id }: { id: number }): Array<RealtimeHint> => [{ bucketIds: [id], type: 'todo-created' }]

describe('realtime hints middleware', () => {
  it("publishes a successful command's hints once to the User's clients other than the origin", async () => {
    const { dependencies, publish } = createDependencies({ 'X-Client-Instance-Id': CLIENT_INSTANCE_ID })

    const result = await invoke(dependencies, nextResolvingTo({ id: 7 }), createdHints)

    expect(result).toMatchObject({ result: { id: 7 } })
    expect(publish).toHaveBeenCalledExactlyOnceWith('user-1', [{ bucketIds: [7], type: 'todo-created' }], {
      originClientInstanceId: CLIENT_INSTANCE_ID,
    })
  })

  it('publishes multiple committed consequences in one atomic payload', async () => {
    const { dependencies, publish } = createDependencies()

    await invoke(dependencies, nextResolvingTo({ id: 7 }), () => [{ type: 'board-changed' }, { type: 'tags-changed' }])

    expect(publish).toHaveBeenCalledExactlyOnceWith('user-1', [{ type: 'board-changed' }, { type: 'tags-changed' }], {
      originClientInstanceId: undefined,
    })
  })

  it('publishes nothing when the command fails', async () => {
    const { dependencies, publish } = createDependencies()
    const error = new OperationError(409, 'CONFLICT', 'Refresh and retry')

    const result = await invoke(
      dependencies,
      vi.fn(() => Promise.reject(error)),
      createdHints,
    )

    expect(result).toBe(error)
    expect(publish).not.toHaveBeenCalled()
  })

  it('publishes nothing for an operation without declared hints', async () => {
    const { dependencies, publish } = createDependencies()

    await invoke(dependencies, nextResolvingTo({ id: 7 }))

    expect(publish).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing', {}],
    ['a malformed', { 'X-Client-Instance-Id': 'user-2' }],
  ])('notifies every client when the request has %s client-instance ID', async (_case, headers) => {
    const { dependencies, publish } = createDependencies(headers)

    await invoke(dependencies, nextResolvingTo({ id: 7 }), createdHints)

    expect(publish).toHaveBeenCalledExactlyOnceWith('user-1', [{ bucketIds: [7], type: 'todo-created' }], {
      originClientInstanceId: undefined,
    })
  })

  it.each([
    ['publishing fails', createdHints],
    [
      'deriving its hints fails',
      () => {
        throw new Error('hint bug')
      },
    ],
  ])('keeps a committed result when %s', async (_case, hints) => {
    const { dependencies, publish } = createDependencies()
    publish.mockImplementationOnce(() => {
      throw new Error('realtime unavailable')
    })

    const result = await invoke(dependencies, nextResolvingTo({ id: 7 }), hints)

    expect(result).toMatchObject({ result: { id: 7 } })
  })
})

function createDependencies(requestHeaders: Record<string, string> = {}) {
  const publish = vi.fn<RealtimeHintsMiddlewareDependencies['publish']>()
  const request = new Request('https://example.test/server-function', { headers: requestHeaders })
  const dependencies: RealtimeHintsMiddlewareDependencies = { getRequest: () => request, publish }

  return { dependencies, publish }
}

function invoke(
  dependencies: RealtimeHintsMiddlewareDependencies,
  next: ReturnType<typeof vi.fn>,
  hints?: (result: { id: number }) => Array<RealtimeHint>,
) {
  return invokeFunctionMiddleware(createRealtimeHintsMiddleware({ hints }, dependencies), {
    context: { user: { id: 'user-1' } },
    next,
  })
}
