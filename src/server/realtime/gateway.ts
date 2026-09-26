import { z } from 'zod'

import type { RuntimeEnvironment } from '@/config/runtime-environment'
import { REALTIME_PATH } from '@/lib/realtime'
import { createAuth } from '@/server/auth'
import {
  authenticationRequired,
  emailVerificationRequired,
  mapOperationError,
  originNotAllowed,
} from '@/server/core/errors'
import { createDatabaseMetrics, emitCompletionRecord, getRequestRegion } from '@/server/core/telemetry'
import type { CompletionRecordEmitter, DatabaseMetrics } from '@/server/core/telemetry'
import { RequestValidationError } from '@/server/core/validation'
import { connectDatabase } from '@/server/db/client'
import type { Database } from '@/server/db/client'
import { createConnectionGrantRequest } from '@/server/realtime/connection-grant'

export { REALTIME_PATH }

/** Matches the session cookie cache: a connection re-authenticates at least this often. */
export const REALTIME_AUTHORIZATION_WINDOW_MS = 5 * 60 * 1000
const PRODUCTION_WWW_ORIGIN = 'https://www.productivity-up.com'

const RealtimeUpgradeSchema = z
  .object({
    method: z.literal('GET'),
    query: z.object({ clientInstanceId: z.uuid() }).strict(),
    upgrade: z.string().toLowerCase().pipe(z.literal('websocket')),
  })
  .strict()

type RealtimeSession = {
  session: { expiresAt: Date }
  user: { emailVerified: boolean; id: string }
}

export type UserRealtimeNamespace = {
  getByName: (name: string) => { fetch: (request: Request) => Promise<Response> }
}

export type RealtimeGatewayDependencies = {
  allowedOrigins: ReadonlySet<string>
  connect: (metrics: DatabaseMetrics) => Promise<{ close: () => Promise<void>; db: Database }>
  createRequestId: () => string
  emit: CompletionRecordEmitter
  getDeploymentVersion: () => string
  getSession: (db: Database, headers: Headers) => Promise<RealtimeSession | null>
  now: () => number
  userRealtime: UserRealtimeNamespace
}

export function createRealtimeGatewayDependencies(environment: RuntimeEnvironment): RealtimeGatewayDependencies {
  return {
    allowedOrigins: realtimeAllowedOrigins(environment),
    connect: connectDatabase,
    createRequestId: () => crypto.randomUUID(),
    emit: emitCompletionRecord,
    getDeploymentVersion: () => environment.version,
    getSession: (db, headers) => createAuth(db).api.getSession({ headers }),
    now: Date.now,
    userRealtime: environment.realtime.userRealtime,
  }
}

export function realtimeAllowedOrigins(environment: Pick<RuntimeEnvironment, 'authentication' | 'deployment'>) {
  const configuredOrigin = new URL(environment.authentication.baseUrl).origin
  return new Set(
    environment.deployment === 'production' ? [configuredOrigin, PRODUCTION_WWW_ORIGIN] : [configuredOrigin],
  )
}

/**
 * Authenticates a WebSocket upgrade for `REALTIME_PATH` and hands it to the session User's Durable Object.
 * The User always comes from the Better Auth session, never from the request.
 */
export async function handleRealtimeRequest(request: Request, dependencies: RealtimeGatewayDependencies) {
  const startedAt = dependencies.now()
  const requestId = dependencies.createRequestId()
  const database = createDatabaseMetrics()
  let connectionCloseFailed = false
  let outcome = 'error'
  let response: Response
  let responseBytes = 0
  let status = 500

  try {
    if (!dependencies.allowedOrigins.has(request.headers.get('Origin') ?? '')) {
      throw originNotAllowed()
    }

    const upgrade = RealtimeUpgradeSchema.safeParse({
      method: request.method,
      query: Object.fromEntries(new URL(request.url).searchParams),
      upgrade: request.headers.get('Upgrade') ?? '',
    })

    if (!upgrade.success) {
      throw new RequestValidationError(upgrade.error.issues)
    }

    const { clientInstanceId } = upgrade.data.query
    const connection = await dependencies.connect(database)
    let session: RealtimeSession | null

    try {
      session = await dependencies.getSession(connection.db, request.headers)
    } finally {
      try {
        await connection.close()
      } catch {
        connectionCloseFailed = true
      }
    }

    if (!session) {
      throw authenticationRequired()
    }

    if (!session.user.emailVerified) {
      throw emailVerificationRequired()
    }

    const authorizedUntil = Math.min(
      session.session.expiresAt.getTime(),
      dependencies.now() + REALTIME_AUTHORIZATION_WINDOW_MS,
    )

    response = await dependencies.userRealtime
      .getByName(session.user.id)
      .fetch(createConnectionGrantRequest({ authorizedUntil, clientInstanceId }))
    outcome = 'success'
    status = response.status
  } catch (error) {
    const mapped = await mapOperationError(error, requestId)
    outcome = mapped.outcome
    response = mapped.response
    responseBytes = (await mapped.response.clone().arrayBuffer()).byteLength
    status = mapped.status
  }

  dependencies.emit({
    conflict: false,
    connectionCloseFailed,
    databaseDurationMs: Math.round(database.durationMs),
    databaseRoundTrips: database.roundTrips,
    deploymentVersion: dependencies.getDeploymentVersion(),
    operation: 'realtime.connect',
    outcome,
    rateLimited: false,
    region: getRequestRegion(request),
    requestId,
    responseBytes,
    status,
    thirdPartyDurationMs: 0,
    totalDurationMs: dependencies.now() - startedAt,
  })

  return response
}
