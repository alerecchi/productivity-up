interface Hyperdrive {
  readonly connectionString: string
}

interface Queue<TBody = unknown> {
  send: (message: TBody) => Promise<void>
}

interface DurableObjectStub {
  fetch: (request: Request) => Promise<Response>
}

interface DurableObjectNamespace<TDurableObject = unknown> {
  getByName: (name: string) => DurableObjectStub & Omit<TDurableObject, 'fetch'>
}

// The subset of the Workers runtime WebSocket Hibernation API this application uses.
interface DurableObjectState {
  acceptWebSocket: (socket: WebSocket, tags?: Array<string>) => void
  getWebSockets: (tag?: string) => Array<WebSocket>
  setWebSocketAutoResponse: (pair?: WebSocketRequestResponsePair) => void
  storage: {
    getAlarm: () => Promise<number | null>
    setAlarm: (timestamp: number) => Promise<void>
  }
}

interface WebSocket {
  deserializeAttachment: () => unknown
  serializeAttachment: (value: unknown) => void
}

declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
}

interface ResponseInit {
  webSocket?: WebSocket | null
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject<TEnvironment = unknown> {
    protected ctx: DurableObjectState
    protected env: TEnvironment

    constructor(ctx: DurableObjectState, env: TEnvironment)
  }

  export const env: Cloudflare.Env
}
