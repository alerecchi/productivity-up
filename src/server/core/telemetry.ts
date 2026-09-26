export type DatabaseMetrics = {
  durationMs: number
  roundTrips: number
}

export type CompletionRecord = {
  coldStart?: boolean
  conflict: boolean
  connectionCloseFailed: boolean
  databaseDurationMs: number
  databaseRoundTrips: number
  deploymentVersion: string
  operation: string
  outcome: string
  rateLimited: boolean
  region: string
  requestId: string
  responseBytes: number
  status: number
  thirdPartyDurationMs: number
  totalDurationMs: number
}

export type CompletionRecordEmitter = (record: CompletionRecord) => void

export function createDatabaseMetrics(): DatabaseMetrics {
  return { durationMs: 0, roundTrips: 0 }
}

export function emitCompletionRecord(record: CompletionRecord) {
  console.info(record)
}

export function responseByteLength(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

/** Returns the Cloudflare colo that received the request, or `unknown` outside Cloudflare. */
export function getRequestRegion(request: Request | undefined) {
  if (!request) {
    return 'unknown'
  }

  const cloudflare = Reflect.get(request, 'cf')
  if (!cloudflare || typeof cloudflare !== 'object') {
    return 'unknown'
  }

  const colo = Reflect.get(cloudflare, 'colo')
  return typeof colo === 'string' ? colo : 'unknown'
}
