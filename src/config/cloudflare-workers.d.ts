interface Hyperdrive {
  readonly connectionString: string
}

interface Queue<TBody = unknown> {
  send: (message: TBody) => Promise<void>
}

interface DurableObjectNamespace<TDurableObject = unknown> {
  getByName: (name: string) => unknown
}

declare module 'cloudflare:workers' {
  export abstract class DurableObject<TEnvironment = unknown> {
    protected ctx: unknown
    protected env: TEnvironment

    constructor(ctx: unknown, env: TEnvironment)
  }

  export const env: Cloudflare.Env
}
