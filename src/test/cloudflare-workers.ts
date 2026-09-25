export const env = process.env

export abstract class DurableObject<TEnvironment = unknown> {
  protected ctx: DurableObjectState
  protected env: TEnvironment

  constructor(ctx: DurableObjectState, runtimeEnv: TEnvironment) {
    this.ctx = ctx
    this.env = runtimeEnv
  }
}

/** Test stand-in for the Worker runtime: background work keeps running but is not awaited. */
export function waitUntil(promise: Promise<unknown>) {
  void promise
}
