import handler from '@tanstack/react-start/server-entry'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import { createDatabaseMetrics } from '@/server/core/telemetry'
import { createAuthEmailRepository, expirePendingAuthEmailWork } from '@/server/db/auth-email-repository'
import { connectDatabase } from '@/server/db/client'
import { consumeAuthEmailBatch, dispatchPendingAuthEmailWork } from '@/server/email/queue'
import type { AuthEmailBatch } from '@/server/email/queue'
import { REALTIME_PATH, createRealtimeGatewayDependencies, handleRealtimeRequest } from '@/server/realtime/gateway'

export { UserRealtimeDurableObject } from '@/server/realtime/user-realtime-durable-object'

export default {
  async fetch(request: Request) {
    const environment = getRuntimeEnvironment()

    // Handled before TanStack Start so the Durable Object's WebSocket upgrade response reaches the client as-is.
    if (new URL(request.url).pathname === REALTIME_PATH) {
      return await handleRealtimeRequest(request, createRealtimeGatewayDependencies(environment))
    }

    return await handler.fetch(request)
  },
  queue(batch: AuthEmailBatch) {
    return consumeAuthEmailBatch(batch)
  },
  async scheduled() {
    const environment = getRuntimeEnvironment()
    if (environment.deployment === 'development') {
      throw new Error('Authentication email Queue maintenance is not configured in development')
    }

    let failed = false

    try {
      await runAuthEmailMaintenance('auth_email.dispatch_pending', environment, async (db) => {
        const result = await dispatchPendingAuthEmailWork({
          dispatch: (message) => environment.bindings.authEmailQueue.send(message),
          now: () => new Date(),
          store: createAuthEmailRepository(db),
        })

        return {
          failedItems: result.failed,
          outcome: result.failed > 0 ? 'partial_failure' : 'success',
          thirdPartyDurationMs: result.thirdPartyDurationMs,
          workItems: result.published,
        }
      })
    } catch {
      failed = true
    }

    try {
      await runAuthEmailMaintenance('auth_email.expire_pending', environment, async (db) => ({
        failedItems: 0,
        outcome: 'success',
        thirdPartyDurationMs: 0,
        workItems: await expirePendingAuthEmailWork(db, new Date()),
      }))
    } catch {
      failed = true
    }

    if (failed) throw new Error('Scheduled authentication email maintenance failed')
  },
}

async function runAuthEmailMaintenance(
  operation: 'auth_email.dispatch_pending' | 'auth_email.expire_pending',
  environment: ReturnType<typeof getRuntimeEnvironment>,
  action: (db: Awaited<ReturnType<typeof connectDatabase>>['db']) => Promise<{
    failedItems: number
    outcome: 'partial_failure' | 'success'
    thirdPartyDurationMs: number
    workItems: number
  }>,
) {
  const startedAt = performance.now()
  const databaseMetrics = createDatabaseMetrics()
  let result: Awaited<ReturnType<typeof action>> | undefined
  let connectionCloseFailed = false

  try {
    const connection = await connectDatabase(databaseMetrics)
    try {
      result = await action(connection.db)
    } catch (error) {
      try {
        await connection.close()
      } catch {
        connectionCloseFailed = true
      }
      throw error
    }
    try {
      await connection.close()
    } catch {
      connectionCloseFailed = true
    }
  } catch {
    emitMaintenanceRecord({
      connectionCloseFailed,
      databaseDurationMs: databaseMetrics.durationMs,
      databaseRoundTrips: databaseMetrics.roundTrips,
      deploymentVersion: environment.version,
      failedItems: 0,
      operation,
      outcome: 'failure',
      status: 500,
      thirdPartyDurationMs: 0,
      totalDurationMs: performance.now() - startedAt,
      workItems: 0,
    })
    throw new Error('Scheduled authentication email maintenance failed')
  }

  emitMaintenanceRecord({
    connectionCloseFailed,
    databaseDurationMs: databaseMetrics.durationMs,
    databaseRoundTrips: databaseMetrics.roundTrips,
    deploymentVersion: environment.version,
    ...result,
    operation,
    status: result.outcome === 'partial_failure' ? 500 : 200,
    totalDurationMs: performance.now() - startedAt,
  })
}

function emitMaintenanceRecord(record: {
  connectionCloseFailed: boolean
  databaseDurationMs: number
  databaseRoundTrips: number
  deploymentVersion: string
  failedItems: number
  operation: string
  outcome: string
  status: number
  thirdPartyDurationMs: number
  totalDurationMs: number
  workItems: number
}) {
  const safeRecord = {
    coldStart: false,
    conflict: false,
    connectionCloseFailed: record.connectionCloseFailed,
    databaseDurationMs: record.databaseDurationMs,
    databaseRoundTrips: record.databaseRoundTrips,
    deploymentVersion: record.deploymentVersion,
    failedItems: record.failedItems,
    operation: record.operation,
    outcome: record.outcome,
    rateLimited: false,
    region: 'unknown',
    requestId: crypto.randomUUID(),
    responseBytes: 0,
    status: record.status,
    thirdPartyDurationMs: record.thirdPartyDurationMs,
    totalDurationMs: record.totalDurationMs,
    workItems: record.workItems,
  }

  if (record.outcome === 'failure' || record.outcome === 'partial_failure') {
    console.error(safeRecord)
    return
  }

  console.info(safeRecord)
}
