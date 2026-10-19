import { createMiddleware, createServerOnlyFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { mapOperationError } from '@/server/core/errors'
import {
  createDatabaseMetrics,
  emitCompletionRecord,
  getRequestRegion,
  responseByteLength,
} from '@/server/core/telemetry'
import type { CompletionRecord, CompletionRecordEmitter, DatabaseMetrics } from '@/server/core/telemetry'

/** Measurements that inner middleware report into the operation's completion record. */
export type OperationMeasurements = {
  connectionCloseFailed: boolean
  database: DatabaseMetrics
}

export type OperationRecordDependencies = {
  createRequestId: () => string
  emit: CompletionRecordEmitter
  getDeploymentVersion: () => string
  getRequest: () => Request
  now: () => number
  setResponseHeader: (name: string, value: string) => void
}

let isColdStart = true

const getDefaultDependencies = createServerOnlyFn(
  (): OperationRecordDependencies => ({
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
    now: () => performance.now(),
    setResponseHeader,
  }),
)

/**
 * Gives every middleware of one operation the same measurements object. It runs outside the operation record, so
 * measurements reported by failing middleware still reach the record.
 */
export const operationMeasurementsMiddleware = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({
    context: {
      measurements: createOperationMeasurements(),
    },
  }),
)

/**
 * Turns whatever happens inside a named operation into the backend contract: a request ID on the response, the
 * standard error DTO for any failure, and exactly one completion record.
 */
export function createOperationRecordMiddleware(
  { operation }: { operation: string },
  providedDependencies?: OperationRecordDependencies,
) {
  return createMiddleware({ type: 'function' })
    .middleware([operationMeasurementsMiddleware])
    .server(async ({ context, next }) => {
      const dependencies = providedDependencies ?? getDefaultDependencies()
      const startedAt = dependencies.now()
      const requestId = dependencies.createRequestId()
      const coldStart = isColdStart
      isColdStart = false

      const emit = (
        outcome: Pick<CompletionRecord, 'conflict' | 'outcome' | 'rateLimited' | 'responseBytes' | 'status'>,
      ) =>
        dependencies.emit({
          ...outcome,
          coldStart,
          connectionCloseFailed: context.measurements.connectionCloseFailed,
          databaseDurationMs: roundDuration(context.measurements.database.durationMs),
          databaseRoundTrips: context.measurements.database.roundTrips,
          deploymentVersion: dependencies.getDeploymentVersion(),
          operation,
          region: getRequestRegion(safelyGetRequest(dependencies)),
          requestId,
          thirdPartyDurationMs: 0,
          totalDurationMs: roundDuration(dependencies.now() - startedAt),
        })

      dependencies.setResponseHeader('X-Request-ID', requestId)
      const result = await next({ context: { requestId } }).catch(async (error: unknown) => {
        const mapped = await mapOperationError(error, requestId)
        emit({
          conflict: mapped.conflict,
          outcome: mapped.outcome,
          rateLimited: mapped.rateLimited,
          responseBytes: (await mapped.response.clone().arrayBuffer()).byteLength,
          status: mapped.status,
        })
        throw mapped.response
      })

      // Emitted outside the failure handler, so a failing emitter can never record the operation twice.
      emit({
        conflict: false,
        outcome: 'success',
        rateLimited: false,
        responseBytes: responseByteLength(Reflect.get(result, 'result')),
        status: 200,
      })

      return result
    })
}

function createOperationMeasurements(): OperationMeasurements {
  return { connectionCloseFailed: false, database: createDatabaseMetrics() }
}

function roundDuration(durationMs: number) {
  return Math.round(durationMs * 100) / 100
}

function safelyGetRequest(dependencies: OperationRecordDependencies) {
  try {
    return dependencies.getRequest()
  } catch {
    return undefined
  }
}
