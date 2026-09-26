// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createConnectionGrantRequest } from '@/server/realtime/connection-grant'
import { UserRealtimeDurableObject } from '@/server/realtime/user-realtime-durable-object'

const NOW = Date.UTC(2026, 8, 26, 12)
const LATER = NOW + 5 * 60 * 1000

// Test doubles for the Workers runtime primitives Node lacks. They keep only what the hibernation API exposes.
class FakeWebSocket {
  attachment: unknown = null
  closed: { code: number; reason: string } | null = null
  sent: Array<string> = []

  close(code: number, reason: string) {
    this.closed = { code, reason }
  }

  deserializeAttachment() {
    return structuredClone(this.attachment)
  }

  send(message: string) {
    this.sent.push(message)
  }

  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value)
  }
}

class FakeWebSocketPair {
  0 = new FakeWebSocket()
  1 = new FakeWebSocket()
}

class FakeUpgradeResponse {
  status: number
  webSocket: FakeWebSocket | undefined

  constructor(_body: unknown, init: { status: number; webSocket?: FakeWebSocket }) {
    this.status = init.status
    this.webSocket = init.webSocket
  }
}

class FakeWebSocketRequestResponsePair {
  constructor(
    readonly request: string,
    readonly response: string,
  ) {}
}

function createState() {
  const accepted: Array<FakeWebSocket> = []
  const autoResponses: Array<FakeWebSocketRequestResponsePair> = []
  let alarmAt: number | null = null

  return {
    accepted,
    alarmAt: () => alarmAt,
    autoResponses,
    state: {
      acceptWebSocket: (socket: FakeWebSocket) => accepted.push(socket),
      getWebSockets: () => accepted.filter((socket) => socket.closed === null),
      setWebSocketAutoResponse: (pair: FakeWebSocketRequestResponsePair) => autoResponses.push(pair),
      storage: {
        getAlarm: () => Promise.resolve(alarmAt),
        setAlarm: (timestamp: number) => {
          alarmAt = timestamp
          return Promise.resolve()
        },
      },
    },
  }
}

function createDurableObject(state: ReturnType<typeof createState>['state']) {
  return new UserRealtimeDurableObject(state as never, {} as Cloudflare.Env)
}

async function connect(durableObject: UserRealtimeDurableObject, clientInstanceId: string, authorizedUntil = LATER) {
  const response = (await durableObject.fetch(
    createConnectionGrantRequest({ authorizedUntil, clientInstanceId }),
  )) as unknown as FakeUpgradeResponse

  return response
}

function serverSocket(accepted: Array<FakeWebSocket>, index: number) {
  return accepted[index]
}

describe('User realtime Durable Object', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    vi.stubGlobal('WebSocketPair', FakeWebSocketPair)
    vi.stubGlobal('Response', FakeUpgradeResponse)
    vi.stubGlobal('WebSocketRequestResponsePair', FakeWebSocketRequestResponsePair)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('accepts a granted connection and delivers published hints after hibernation', async () => {
    const { accepted, state } = createState()

    const response = await connect(createDurableObject(state), 'client-a')

    expect(response.status).toBe(101)
    expect(response.webSocket).toBeInstanceOf(FakeWebSocket)

    // A hibernated object is reconstructed from its state; only socket attachments survive.
    createDurableObject(state).publish([{ kind: 'opaque-hint' }])

    expect(serverSocket(accepted, 0).sent).toEqual([JSON.stringify({ hints: [{ kind: 'opaque-hint' }] })])
  })

  it("skips only the origin client when publishing to the User's connections", async () => {
    const { accepted, state } = createState()
    const durableObject = createDurableObject(state)
    await connect(durableObject, 'client-a')
    await connect(durableObject, 'client-b')
    await connect(durableObject, 'client-c')

    durableObject.publish(['hint'], { originClientInstanceId: 'client-b' })

    expect(accepted.map((socket) => socket.sent.length)).toEqual([1, 0, 1])
  })

  it('rejects a request that did not come through the gateway with a connection grant', async () => {
    const { accepted, state } = createState()

    const response = (await createDurableObject(state).fetch(
      new Request('https://user-realtime.internal/connect', { headers: { Upgrade: 'websocket' } }),
    )) as unknown as FakeUpgradeResponse

    expect(response.status).toBe(400)
    expect(accepted).toEqual([])
  })

  it('answers client heartbeats without waking the object', () => {
    const { autoResponses, state } = createState()

    createDurableObject(state)

    expect(autoResponses).toEqual([new FakeWebSocketRequestResponsePair('ping', 'pong')])
  })

  it("keeps each User's hints within that User's Durable Object", async () => {
    const firstUser = createState()
    const secondUser = createState()
    await connect(createDurableObject(firstUser.state), 'client-a')
    await connect(createDurableObject(secondUser.state), 'client-b')

    createDurableObject(firstUser.state).publish(['hint'])

    expect(serverSocket(firstUser.accepted, 0).sent).toHaveLength(1)
    expect(serverSocket(secondUser.accepted, 0).sent).toEqual([])
  })

  it('ignores messages a client sends over its connection', async () => {
    const { accepted, state } = createState()
    const durableObject = createDurableObject(state)
    await connect(durableObject, 'client-a')
    await connect(durableObject, 'client-b')

    durableObject.webSocketMessage(serverSocket(accepted, 0) as never, JSON.stringify({ hints: ['forged'] }))

    expect(accepted.map((socket) => [socket.sent, socket.closed])).toEqual([
      [[], null],
      [[], null],
    ])
  })

  it('closes a connection whose authorization expired instead of delivering to it', async () => {
    const { accepted, state } = createState()
    const durableObject = createDurableObject(state)
    await connect(durableObject, 'client-a', NOW + 1000)
    await connect(durableObject, 'client-b', NOW + 60_000)

    vi.setSystemTime(NOW + 1000)
    durableObject.publish(['hint'])

    expect(serverSocket(accepted, 0).sent).toEqual([])
    expect(serverSocket(accepted, 0).closed).toEqual({ code: 4401, reason: 'Authorization expired' })
    expect(serverSocket(accepted, 1).sent).toHaveLength(1)
    expect(serverSocket(accepted, 1).closed).toBeNull()
  })

  it('closes idle connections at grant expiry and schedules the next live connection', async () => {
    const { accepted, alarmAt, state } = createState()
    const durableObject = createDurableObject(state)
    await connect(durableObject, 'client-a', NOW + 1000)
    await connect(durableObject, 'client-b', NOW + 2000)

    expect(alarmAt()).toBe(NOW + 1000)

    vi.setSystemTime(NOW + 1000)
    await createDurableObject(state).alarm()

    expect(serverSocket(accepted, 0).closed).toEqual({ code: 4401, reason: 'Authorization expired' })
    expect(serverSocket(accepted, 1).closed).toBeNull()
    expect(alarmAt()).toBe(NOW + 2000)

    vi.setSystemTime(NOW + 2000)
    await createDurableObject(state).alarm()

    expect(serverSocket(accepted, 1).closed).toEqual({ code: 4401, reason: 'Authorization expired' })
  })

  it('rejects an already-expired grant without opening a socket', async () => {
    const { accepted, state } = createState()
    const response = await connect(createDurableObject(state), 'client-a', NOW)

    expect(response.status).toBe(400)
    expect(accepted).toEqual([])
  })
})
