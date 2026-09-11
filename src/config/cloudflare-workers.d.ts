interface Hyperdrive {
  readonly connectionString: string
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env
}
