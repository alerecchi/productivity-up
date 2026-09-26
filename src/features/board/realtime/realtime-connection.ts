import type { createBoardCache } from '@/features/board/cache'
import { RealtimeMessageSchema } from '@/lib/realtime'

const HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30_000

type BoardCache = Pick<ReturnType<typeof createBoardCache>, 'sync'>

export type RealtimeConnectionOptions = {
  cache: BoardCache
  clientInstanceId: string
  createSocket?: (url: string) => WebSocket
  /** Applies hints from a well-formed message. Defaults to treating every hint as unknown. */
  handleHints?: (hints: ReadonlyArray<unknown>) => Promise<void>
  random?: () => number
  url: string
}

/**
 * Keeps one WebSocket open to the User's realtime channel and turns what it receives into cache work.
 * Hints missed while disconnected are never replayed, so every reconnect repairs from canonical state.
 */
export function createRealtimeConnection({
  cache,
  clientInstanceId,
  createSocket = (socketUrl) => new WebSocket(socketUrl),
  handleHints = () => cache.sync({ type: 'all' }),
  random = Math.random,
  url,
}: RealtimeConnectionOptions) {
  let failedAttempts = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let pongTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let socket: WebSocket | undefined

  const connect = () => {
    const current = createSocket(`${url}?${new URLSearchParams({ clientInstanceId })}`)
    socket = current

    current.onopen = () => {
      failedAttempts = 0

      void cache.sync({ type: 'all' })
      heartbeatTimer = setInterval(checkLiveness, HEARTBEAT_INTERVAL_MS)
    }
    current.onmessage = (event) => receive(event.data)
    current.onclose = () => {
      stopHeartbeat()
      socket = undefined
      scheduleReconnect()
    }
  }

  const receive = (data: unknown) => {
    if (data === 'pong') {
      clearTimeout(pongTimer)
      pongTimer = undefined
      return
    }

    const message = RealtimeMessageSchema.safeParse(typeof data === 'string' ? parseJson(data) : undefined)

    void (message.success ? handleHints(message.data.hints) : cache.sync({ type: 'all' }))
  }

  const checkLiveness = () => {
    if (pongTimer !== undefined || socket?.readyState !== WebSocket.OPEN) {
      return
    }

    socket.send('ping')
    pongTimer = setTimeout(() => {
      closeSocket()
      scheduleReconnect()
    }, HEARTBEAT_TIMEOUT_MS)
  }

  const scheduleReconnect = () => {
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** failedAttempts)
    failedAttempts += 1
    reconnectTimer = setTimeout(connect, delay * (0.5 + random() / 2))
  }

  const stopHeartbeat = () => {
    clearInterval(heartbeatTimer)
    clearTimeout(pongTimer)
    pongTimer = undefined
  }

  const closeSocket = () => {
    stopHeartbeat()

    if (socket) {
      socket.onclose = null
      socket.onmessage = null
      socket.onopen = null
      socket.close(1000)
      socket = undefined
    }
  }

  /** Focus and network recovery: reconnect now instead of waiting, or verify an open connection is alive. */
  const recover = () => {
    if (socket) {
      void cache.sync({ type: 'all' })
      checkLiveness()
      return
    }

    clearTimeout(reconnectTimer)
    failedAttempts = 0
    connect()
  }

  const recoverWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      recover()
    }
  }

  const stop = () => {
    document.removeEventListener('visibilitychange', recoverWhenVisible)
    window.removeEventListener('online', recover)
    clearTimeout(reconnectTimer)
    closeSocket()
  }

  return {
    start() {
      stop()
      document.addEventListener('visibilitychange', recoverWhenVisible)
      window.addEventListener('online', recover)
      connect()
    },
    stop,
  }
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}
