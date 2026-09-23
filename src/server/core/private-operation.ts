import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import type { z } from 'zod'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { createAuth } from '@/server/auth'
import { authenticationRequired, emailVerificationRequired, mapOperationError } from '@/server/core/errors'
import { createDatabaseMetrics, emitCompletionRecord, responseByteLength } from '@/server/core/telemetry'
import type { CompletionRecordEmitter } from '@/server/core/telemetry'
import { connectDatabase } from '@/server/db/client'
import type { Database } from '@/server/db/client'

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
  setResponseHeader: (name: string, value: string) => void
}

type PrivateOperationOptions<TResponse extends z.ZodType> = {
  operation: string
  response: TResponse
}

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
    setResponseHeader,
  }),
)

export function createPrivateOperation<TResponse extends z.ZodType>(
  { operation, response }: PrivateOperationOptions<TResponse>,
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
      region: getRegion(request),
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

function getRegion(request: Request | undefined) {
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
