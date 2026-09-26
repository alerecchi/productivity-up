import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createBoardCache } from '@/features/board/cache'
import { boardCacheKeys } from '@/features/board/cache/board-cache-keys'
import { createRealtimeConnection } from '@/features/board/realtime/realtime-connection'

const URL = 'wss://app.example.test/api/realtime'
const CLIENT_INSTANCE_ID = '5b0c2f55-6d0e-4d8f-9a39-0f7c7f0d8a11'

class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 3

  closed = false
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onopen: (() => void) | null = null
  readyState = FakeSocket.CONNECTING
  sent: Array<string> = []

  constructor(readonly url: string) {}

  close() {
    this.closed = true
    this.readyState = FakeSocket.CLOSED
  }

  send(message: string) {
    this.sent.push(message)
  }

  // Server-side events the tests drive.
  drop() {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }

  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }

  receive(data: unknown) {
    this.onmessage?.({ data })
  }
}

const connections: Array<ReturnType<typeof createRealtimeConnection>> = []

function setup(handleHints?: (hints: ReadonlyArray<unknown>) => Promise<void>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const boardQueryFn = vi.fn(() => Promise.resolve({ status: 'ready' }))
  queryClient.setQueryData(boardCacheKeys.board(), { status: 'ready' })
  const observer = new QueryObserver(queryClient, { queryFn: boardQueryFn, queryKey: boardCacheKeys.board() })
  const unsubscribe = observer.subscribe(() => undefined)
  const sockets: Array<FakeSocket> = []
  const connection = createRealtimeConnection({
    cache: createBoardCache(queryClient),
    clientInstanceId: CLIENT_INSTANCE_ID,
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket as unknown as WebSocket
    },
    handleHints,
    random: () => 1,
    url: URL,
  })
  connections.push(connection)

  return {
    connection,
    resyncCount: () => boardQueryFn.mock.calls.length,
    socket: () => sockets.at(-1)!,
    sockets,
    unsubscribe,
  }
}

function showTab() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}

async function flush() {
  await vi.advanceTimersByTimeAsync(0)
}

describe('realtime connection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    connections.splice(0).forEach((connection) => connection.stop())
    vi.useRealTimers()
  })

  it('connects with its client-instance ID and fully resynchronizes for a hint it does not know', async () => {
    const { connection, resyncCount, socket } = setup()
    await flush()

    connection.start()
    socket().open()
    await flush()

    expect(socket().url).toBe(`${URL}?clientInstanceId=${CLIENT_INSTANCE_ID}`)
    expect(resyncCount()).toBe(1)

    socket().receive(JSON.stringify({ hints: [{ type: 'todo-created' }] }))
    await flush()

    expect(resyncCount()).toBe(2)
  })

  it('hands well-formed hints to a provided handler', async () => {
    const handleHints = vi.fn(() => Promise.resolve())
    const { connection, resyncCount, socket } = setup(handleHints)
    connection.start()
    socket().open()

    socket().receive(JSON.stringify({ hints: [{ type: 'known' }, { type: 'known' }] }))
    await flush()

    expect(handleHints).toHaveBeenCalledExactlyOnceWith([{ type: 'known' }, { type: 'known' }])
    expect(resyncCount()).toBe(1)
  })

  it.each([
    ['non-JSON data', 'not json'],
    ['a message without hints', JSON.stringify({ type: 'hint' })],
    ['an envelope with an unknown field', JSON.stringify({ hints: [], sequence: 4 })],
    ['binary data', new ArrayBuffer(4)],
  ])('fully resynchronizes after %s', async (_case, data) => {
    const { connection, resyncCount, socket } = setup()
    connection.start()
    socket().open()
    await flush()

    socket().receive(data)
    await flush()

    expect(resyncCount()).toBe(2)
  })

  it('keeps a connection that answers heartbeats and replaces one that stops answering', async () => {
    const { connection, resyncCount, socket, sockets } = setup()
    connection.start()
    socket().open()

    await vi.advanceTimersByTimeAsync(25_000)
    expect(socket().sent).toEqual(['ping'])
    socket().receive('pong')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(socket().sent).toEqual(['ping', 'ping'])
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sockets[0].closed).toBe(true)
    expect(resyncCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(2)
    socket().open()
    await flush()

    expect(resyncCount()).toBe(2)
  })

  it.each([
    ['the tab becomes visible', () => showTab()],
    ['the browser comes back online', () => window.dispatchEvent(new Event('online'))],
  ])('reconnects immediately when %s while waiting to reconnect', async (_case, recover) => {
    const { connection, resyncCount, socket, sockets } = setup()
    connection.start()
    socket().open()
    socket().drop()
    await vi.advanceTimersByTimeAsync(1000)
    socket().drop()

    recover()

    expect(sockets).toHaveLength(3)
    socket().open()
    await flush()
    expect(resyncCount()).toBe(2)

    // The cancelled backoff timer must not open a duplicate connection.
    await vi.advanceTimersByTimeAsync(2000)
    expect(sockets).toHaveLength(3)
    connection.stop()
  })

  it('checks an open connection immediately when the tab becomes visible and replaces it if it is dead', async () => {
    const { connection, resyncCount, socket, sockets } = setup()
    connection.start()
    socket().open()

    showTab()
    expect(socket().sent).toEqual(['ping'])
    await vi.advanceTimersByTimeAsync(10_000)
    await vi.advanceTimersByTimeAsync(1000)
    socket().open()
    await flush()

    expect(sockets).toHaveLength(2)
    expect(resyncCount()).toBe(3)
    connection.stop()
  })

  it('resynchronizes on focus even when the existing socket still answers heartbeats', async () => {
    const { connection, resyncCount, socket, sockets } = setup()
    connection.start()
    socket().open()
    await flush()

    showTab()
    socket().receive('pong')
    await flush()

    expect(sockets).toHaveLength(1)
    expect(resyncCount()).toBe(2)
  })

  it('stops listening for recovery events once stopped', async () => {
    const { connection, socket, sockets } = setup()
    connection.start()
    socket().open()
    connection.stop()

    showTab()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(60_000)

    expect(sockets).toHaveLength(1)
    expect(socket().sent).toEqual([])
  })

  it('stops by closing its socket and cancelling any pending reconnect', async () => {
    const { connection, socket, sockets } = setup()
    connection.start()
    socket().open()
    socket().drop()

    connection.stop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(sockets).toHaveLength(1)

    connection.start()
    connection.stop()
    socket().drop()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(socket().closed).toBe(true)
    expect(sockets).toHaveLength(2)
  })

  it('reconnects with backoff after a disconnect and resynchronizes once reconnected', async () => {
    const { connection, resyncCount, socket, sockets } = setup()
    connection.start()
    socket().open()
    await flush()

    socket().drop()
    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(2)

    // A failed attempt doubles the delay.
    socket().drop()
    await vi.advanceTimersByTimeAsync(1999)
    expect(sockets).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(3)
    expect(resyncCount()).toBe(1)

    socket().open()
    await flush()

    expect(resyncCount()).toBe(2)
  })
})
