import { QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { getClientInstanceId } from '@/features/board/realtime/client-instance-id'
import { RealtimeSync } from '@/features/board/realtime/realtime-sync'
import { createTestQueryClient, render } from '@/test'

class FakeSocket {
  static readonly OPEN = 1
  static instances: Array<FakeSocket> = []

  closed = false
  onclose: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onopen: (() => void) | null = null
  readyState = 0

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  close() {
    this.closed = true
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  send() {}
}

describe('realtime sync', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects only for a verified session and follows session changes with a canonical resync', async () => {
    const queryClient = createTestQueryClient()
    const boardQueryFn = vi.fn(() => Promise.resolve({ status: 'ready' }))
    const unsubscribe = new QueryObserver(queryClient, {
      queryFn: boardQueryFn,
      queryKey: boardCacheKeys.board(),
    }).subscribe(() => undefined)
    await vi.waitFor(() => expect(queryClient.getQueryState(boardCacheKeys.board())?.status).toBe('success'))

    const { rerender } = render(<RealtimeSync userId={undefined} />, { queryClient })
    expect(FakeSocket.instances).toEqual([])

    rerender(<RealtimeSync userId='user-1' />)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(FakeSocket.instances[0].url).toBe(
      `ws://localhost:3000/api/realtime?clientInstanceId=${getClientInstanceId(queryClient)}`,
    )
    FakeSocket.instances[0].open()

    rerender(<RealtimeSync userId={undefined} />)
    expect(FakeSocket.instances[0].closed).toBe(true)

    rerender(<RealtimeSync userId='user-2' />)
    expect(FakeSocket.instances).toHaveLength(2)
    await vi.waitFor(() => expect(boardQueryFn).toHaveBeenCalledTimes(3))

    unsubscribe()
  })

  it('gives each running QueryClient one stable client-instance ID', () => {
    const first = createTestQueryClient()
    const second = createTestQueryClient()

    expect(getClientInstanceId(first)).toBe(getClientInstanceId(first))
    expect(getClientInstanceId(first)).not.toBe(getClientInstanceId(second))
    expect(getClientInstanceId(first)).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  })
})
