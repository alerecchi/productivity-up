import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { waitUntil } from 'cloudflare:workers'
import { z } from 'zod'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { CLIENT_INSTANCE_ID_HEADER } from '@/lib/realtime'
import type { RealtimeHint } from '@/lib/realtime'
import { createAuth } from '@/server/auth'
import { authenticationRequired, emailVerificationRequired, mapOperationError } from '@/server/core/errors'
import {
  createDatabaseMetrics,
  emitCompletionRecord,
  getRequestRegion,
  responseByteLength,
} from '@/server/core/telemetry'
import type { CompletionRecordEmitter } from '@/server/core/telemetry'
import { connectDatabase } from '@/server/db/client'
import type { Database } from '@/server/db/client'
import type { PublishOptions } from '@/server/realtime/user-realtime-durable-object'

type PrivateUser = {
  id: string
}

type PrivateOperationContext = {
  db: Database
  requestId: string
  user: PrivateUser
}

type OperationResult = {
  result?: unknown
  [key: string]: unknown
}

type PrivateOperationResult = OperationResult & {
  'use functions must return the result of next()': true
  '~types': { context: PrivateOperationContext; sendContext: undefined }
  context: PrivateOperationContext
  sendContext: undefined
}

export type PrivateOperationDependencies = {
  connect: typeof connectDatabase
  createRequestId: () => string
  emit: CompletionRecordEmitter
  getDeploymentVersion: () => string
  getRequest: () => Request
  getSession: (db: Database, headers: Headers) => Promise<{ user?: { emailVerified: boolean; id: string } } | null>
  now: () => number
  /** Delivers hints to the User's realtime connections without delaying the response; failures only lose hints. */
  publish: (userId: string, hints: Array<RealtimeHint>, options: PublishOptions) => void
  setResponseHeader: (name: string, value: string) => void
}

type PrivateOperationOptions<TResponse extends z.ZodType> = {
  /**
   * The realtime hints of a committed command, derived from its validated response. They are published as one list
   * only after the operation succeeds, and skip the requesting client, whose own response reconciles every hinted
   * scope. Declare hints only for commands whose response fully reconciles the requesting client's cache.
   */
  hints?: (result: z.output<TResponse>) => Array<RealtimeHint>
  operation: string
  response: TResponse
}

const ClientInstanceIdSchema = z.uuid()

let isColdStart = true

const getDefaultDependencies = createServerOnlyFn(
  (): PrivateOperationDependencies => ({
    connect: connectDatabase,
    createRequestId: () => crypto.randomUUID(),
    emit: emitCompletionRecord,
    getDeploymentVersion: () => {
      try {
        return getRuntimeEnvironment().version
      } catch {
        return 'unknown'
      }
    },
    getRequest,
    getSession: async (db, headers) => createAuth(db).api.getSession({ headers }),
    now: () => performance.now(),
    publish: (userId, hints, options) => {
      const delivery = getRuntimeEnvironment().realtime.userRealtime.getByName(userId).publish(hints, options)
      waitUntil(delivery.catch(() => undefined))
    },
    setResponseHeader,
  }),
)

export function createPrivateOperation<TResponse extends z.ZodType>(
  { hints, operation, response }: PrivateOperationOptions<TResponse>,
  providedDependencies?: PrivateOperationDependencies,
) {
  return createMiddleware({ type: 'function' }).server(async ({ next }) => {
    const dependencies = providedDependencies ?? getDefaultDependencies()
    const startedAt = dependencies.now()
    const requestId = dependencies.createRequestId()
    const database = createDatabaseMetrics()
    const coldStart = isColdStart
    isColdStart = false
    let connection: Awaited<ReturnType<typeof connectDatabase>> | undefined
    let connectionCloseFailed = false
    let conflict = false
    let outcome = 'error'
    let rateLimited = false
    let responseBytes = 0
    let status = 500
    let operationResult: OperationResult | Response

    try {
      dependencies.setResponseHeader('X-Request-ID', requestId)
      const request = dependencies.getRequest()
      connection = await dependencies.connect(database)
      const session = await dependencies.getSession(connection.db, request.headers)

      if (!session?.user) {
        throw authenticationRequired()
      }

      if (!session.user.emailVerified) {
        throw emailVerificationRequired()
      }

      const result = (await next({
        context: {
          db: connection.db,
          requestId,
          user: { id: session.user.id } satisfies PrivateUser,
        },
      })) as OperationResult
      const parsedResponse = response.safeParse(result.result)

      if (!parsedResponse.success) {
        throw new Error(`Invalid response DTO for ${operation}`)
      }

      operationResult = { ...result, result: parsedResponse.data }
      outcome = 'success'
      responseBytes = responseByteLength(parsedResponse.data)
      status = 200

      if (hints) {
        publishHints(dependencies, session.user.id, () => hints(parsedResponse.data), request)
      }
    } catch (error) {
      const mapped = await mapOperationError(error, requestId)
      conflict = mapped.conflict
      outcome = mapped.outcome
      rateLimited = mapped.rateLimited
      status = mapped.status
      responseBytes = (await mapped.response.clone().arrayBuffer()).byteLength
      operationResult = mapped.response
    }

    if (connection) {
      try {
        await connection.close()
      } catch {
        connectionCloseFailed = true
      }
    }

    const request = safelyGetRequest(dependencies)
    dependencies.emit({
      coldStart,
      conflict,
      connectionCloseFailed,
      databaseDurationMs: roundDuration(database.durationMs),
      databaseRoundTrips: database.roundTrips,
      deploymentVersion: dependencies.getDeploymentVersion(),
      operation,
      outcome,
      rateLimited,
      region: getRequestRegion(request),
      requestId,
      responseBytes,
      status,
      thirdPartyDurationMs: 0,
      totalDurationMs: roundDuration(dependencies.now() - startedAt),
    })

    if (operationResult instanceof Response) {
      throw operationResult
    }

    return operationResult as PrivateOperationResult
  })
}

function publishHints(
  dependencies: PrivateOperationDependencies,
  userId: string,
  getHints: () => Array<RealtimeHint>,
  request: Request,
) {
  // An unidentifiable origin only costs that client a redundant refetch.
  const originClientInstanceId = ClientInstanceIdSchema.safeParse(request.headers.get(CLIENT_INSTANCE_ID_HEADER))

  try {
    dependencies.publish(userId, getHints(), {
      originClientInstanceId: originClientInstanceId.success ? originClientInstanceId.data : undefined,
    })
  } catch {
    // The command already committed; clients that miss the hint recover on their next resynchronization.
  }
}

function roundDuration(durationMs: number) {
  return Math.round(durationMs * 100) / 100
}

function safelyGetRequest(dependencies: PrivateOperationDependencies) {
  try {
    return dependencies.getRequest()
  } catch {
    return undefined
  }
}
