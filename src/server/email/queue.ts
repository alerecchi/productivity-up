import { z } from 'zod'

import { getRuntimeEnvironment } from '@/config/runtime-env'
import type { RuntimeQueue } from '@/config/runtime-environment'
import { createDatabaseMetrics } from '@/server/core/telemetry'
import type { DatabaseMetrics } from '@/server/core/telemetry'
import { createAuthEmailRepository } from '@/server/db/auth-email-repository'
import { connectDatabase } from '@/server/db/client'
import type { Database } from '@/server/db/client'
import { EmailDeliveryError, sendAuthEmail } from '@/server/email/sender'
import type { EmailProviderErrorCode } from '@/server/email/sender'

export type AuthEmailKind = 'email_verification' | 'password_reset'

/** The email content copied at request time; kept only until the work reaches a final state. */
export type AuthEmail = {
  actionUrl: string
  kind: AuthEmailKind
  recipient: string
  recipientName?: string | null
}

export type AuthEmailDelivery = {
  actionUrl: string | null
  createdAt: Date
  expiresAt: Date
  id: string
  kind: AuthEmailKind
  queuedAt: Date | null
  recipient: string | null
  recipientName: string | null
  status: 'pending' | 'sent' | 'dead_lettered' | 'expired'
}

/** Outbox persistence for authentication email work. */
export type AuthEmailStore = {
  create: (work: AuthEmailWork & { expiresAt: Date }) => Promise<string>
  find: (id: string) => Promise<AuthEmailDelivery | undefined>
  listPendingForDispatch: (
    now: Date,
    limit: number,
    after?: { createdAt: Date; id: string },
  ) => Promise<Array<{ createdAt: Date; id: string }>>
  markQueued: (id: string, queuedAt: Date) => Promise<void>
  /** Moves pending work to a final state and clears its recipient, name, and action URL. */
  finish: (
    id: string,
    result: { attempts: number; providerMessageId?: string; status: 'sent' | 'dead_lettered' | 'expired' },
  ) => Promise<void>
}

/** Sends one authentication email; the provider deduplicates calls sharing an idempotency key. */
export type AuthEmailSender = (
  email: AuthEmail,
  options: { idempotencyKey: string },
) => Promise<{ providerMessageId: string }>

/** The only queue payload: an opaque reference to outbox work, never its content. */
export type AuthEmailMessage = { workId: string }

const AuthEmailMessageSchema = z.strictObject({ workId: z.uuid() })

export type AuthEmailQueueMessage = {
  ack: () => void
  attempts: number
  body: unknown
  id: string
  retry: (options?: { delaySeconds?: number }) => void
}

export type AuthEmailBatch = {
  messages: ReadonlyArray<AuthEmailQueueMessage>
}

export type AuthEmailConsumerDependencies = {
  databaseMetrics: DatabaseMetrics
  deadLetterQueue: RuntimeQueue
  deploymentVersion: string
  emit: (record: AuthEmailDeliveryRecord) => void
  now: () => Date
  send: AuthEmailSender
  store: AuthEmailStore
}

/** Lifetime of verification and password-reset links; queued work is not sent after its link expires. */
export const AUTH_EMAIL_LINK_EXPIRES_IN_SECONDS = 60 * 60

export type AuthEmailWork = AuthEmail & { userId: string }

export type AuthEmailProducerDependencies = {
  deploymentVersion?: string
  /** Durably publishes the message; resolves only after the write succeeds. */
  dispatch: (message: AuthEmailMessage) => Promise<void>
  emitOutboxInsertFailure?: (record: AuthEmailOutboxInsertFailureRecord) => void
  now: () => Date
  store: AuthEmailStore
}

export type AuthEmailOutboxInsertFailureRecord = {
  deploymentVersion: string
  kind: AuthEmailKind
  operation: 'auth_email.outbox_insert'
  outcome: 'failure'
  requestId: string
}

export type AuthEmailDispatcherDependencies = Pick<AuthEmailProducerDependencies, 'dispatch' | 'now' | 'store'>

const AUTH_EMAIL_DISPATCH_BATCH_SIZE = 100
const AUTH_EMAIL_DISPATCH_MAX_ITEMS = 1000
const AUTH_EMAIL_DISPATCH_MAX_DURATION_MS = 30_000

/** Safe error for Better Auth's background-task logger; provider and database errors may contain email secrets. */
export class AuthEmailEnqueueError extends Error {
  constructor() {
    super('Authentication email could not be queued')
    this.name = 'AuthEmailEnqueueError'
  }
}

/** Persists the work, then awaits its queue write; the message carries only `{ workId }`. */
export async function enqueueAuthEmail(work: AuthEmailWork, dependencies: AuthEmailProducerDependencies) {
  const expiresAt = new Date(dependencies.now().getTime() + AUTH_EMAIL_LINK_EXPIRES_IN_SECONDS * 1000)
  let workId: string

  try {
    workId = await dependencies.store.create({ ...work, expiresAt })
  } catch {
    // Database errors can include the recipient or link. Emit only fields selected here.
    dependencies.emitOutboxInsertFailure?.({
      deploymentVersion: dependencies.deploymentVersion ?? 'unknown',
      kind: work.kind,
      operation: 'auth_email.outbox_insert',
      outcome: 'failure',
      requestId: crypto.randomUUID(),
    })
    throw new AuthEmailEnqueueError()
  }

  try {
    await dependencies.dispatch({ workId })
    await dependencies.store.markQueued(workId, dependencies.now())
  } catch {
    // Keep failed publications in the outbox for scheduled retry; errors can contain the URL or recipient.
    throw new AuthEmailEnqueueError()
  }
}

/** Republishes unexpired pending outbox rows that have not been confirmed in the Queue. */
export async function dispatchPendingAuthEmailWork(dependencies: AuthEmailDispatcherDependencies) {
  const startedAt = performance.now()
  let cursor: { createdAt: Date; id: string } | undefined
  let published = 0
  let failed = 0
  let thirdPartyDurationMs = 0

  // Advance by the creation cursor even when a publication fails. Otherwise the same failed rows can
  // occupy every page, preventing younger links from being queued before they expire.
  while (
    published + failed < AUTH_EMAIL_DISPATCH_MAX_ITEMS &&
    performance.now() - startedAt < AUTH_EMAIL_DISPATCH_MAX_DURATION_MS
  ) {
    const limit = Math.min(AUTH_EMAIL_DISPATCH_BATCH_SIZE, AUTH_EMAIL_DISPATCH_MAX_ITEMS - published - failed)
    const pending = await dependencies.store.listPendingForDispatch(dependencies.now(), limit, cursor)
    if (pending.length === 0) break

    for (const { createdAt, id: workId } of pending) {
      cursor = { createdAt, id: workId }
      try {
        const dispatchStartedAt = performance.now()
        try {
          await dependencies.dispatch({ workId })
        } finally {
          thirdPartyDurationMs += performance.now() - dispatchStartedAt
        }
        await dependencies.store.markQueued(workId, dependencies.now())
        published += 1
      } catch {
        // Keep this row eligible for the next scheduled attempt and never log message contents or provider errors.
        failed += 1
      }
    }

    if (pending.length < limit) break
  }

  return { failed, published, thirdPartyDurationMs }
}

export type AuthEmailDeliveryRecord = {
  attempt: number
  databaseDurationMs: number
  databaseRoundTrips: number
  deploymentVersion: string
  operation: 'auth_email.deliver'
  outcome: 'already_completed' | 'dead_lettered' | 'expired' | 'malformed' | 'missing' | 'retry' | 'sent'
  providerErrorCode?: EmailProviderErrorCode
  /** The Cloudflare Queue message ID. */
  requestId: string
  thirdPartyDurationMs: number
  totalDurationMs: number
  workId?: string
}

type MessageResult = Pick<AuthEmailDeliveryRecord, 'outcome' | 'providerErrorCode' | 'workId'>

/**
 * Resolves each message's outbox work and sends it with a stable idempotency key. Failed attempts retry with backoff
 * until the last one, which dead-letters the work. Emits one sanitized completion record per message.
 */
export async function handleAuthEmailBatch(batch: AuthEmailBatch, dependencies: AuthEmailConsumerDependencies) {
  for (const message of batch.messages) {
    const startedAt = performance.now()
    const database = { ...dependencies.databaseMetrics }
    const provider = { durationMs: 0 }
    const result = await processMessage(message, dependencies, provider)

    dependencies.emit({
      attempt: message.attempts,
      databaseDurationMs: dependencies.databaseMetrics.durationMs - database.durationMs,
      databaseRoundTrips: dependencies.databaseMetrics.roundTrips - database.roundTrips,
      deploymentVersion: dependencies.deploymentVersion,
      operation: 'auth_email.deliver',
      requestId: message.id,
      thirdPartyDurationMs: provider.durationMs,
      totalDurationMs: performance.now() - startedAt,
      ...result,
    })
  }
}

/** Emits one retry record per Queue message when the consumer cannot open its database connection. */
export function emitAuthEmailBatchConnectionFailure(
  batch: AuthEmailBatch,
  details: {
    databaseMetrics: Pick<DatabaseMetrics, 'durationMs' | 'roundTrips'>
    deploymentVersion: string
    emit: (record: AuthEmailDeliveryRecord) => void
    totalDurationMs: number
  },
) {
  for (const message of batch.messages) {
    details.emit({
      attempt: message.attempts,
      databaseDurationMs: details.databaseMetrics.durationMs,
      databaseRoundTrips: details.databaseMetrics.roundTrips,
      deploymentVersion: details.deploymentVersion,
      operation: 'auth_email.deliver',
      outcome: 'retry',
      requestId: message.id,
      thirdPartyDurationMs: 0,
      totalDurationMs: details.totalDurationMs,
    })
  }
}

async function processMessage(
  message: AuthEmailQueueMessage,
  dependencies: AuthEmailConsumerDependencies,
  provider: { durationMs: number },
): Promise<MessageResult> {
  const parsed = AuthEmailMessageSchema.safeParse(message.body)

  if (!parsed.success) {
    message.ack()
    return { outcome: 'malformed' }
  }

  const { workId } = parsed.data

  try {
    const outcome = await deliver(workId, message.attempts, dependencies, provider)
    message.ack()
    return { outcome, workId }
  } catch (error) {
    const providerErrorCode = error instanceof EmailDeliveryError ? error.providerErrorCode : undefined

    if (message.attempts < AUTH_EMAIL_MAX_ATTEMPTS) {
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts) })
      return { outcome: 'retry', providerErrorCode, workId }
    }

    try {
      // Dead-letter before recording the final state, so a failed queue write retries instead of losing the work.
      await dependencies.deadLetterQueue.send({ workId } satisfies AuthEmailMessage)
      await dependencies.store.finish(workId, { attempts: message.attempts, status: 'dead_lettered' })
      message.ack()
      return { outcome: 'dead_lettered', providerErrorCode, workId }
    } catch {
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts) })
      return { outcome: 'retry', providerErrorCode, workId }
    }
  }
}

async function deliver(
  workId: string,
  attempts: number,
  dependencies: Pick<AuthEmailConsumerDependencies, 'now' | 'send' | 'store'>,
  provider: { durationMs: number },
): Promise<AuthEmailDeliveryRecord['outcome']> {
  const delivery = await dependencies.store.find(workId)

  if (!delivery) {
    return 'missing'
  }

  if (delivery.status !== 'pending' || !delivery.recipient || !delivery.actionUrl) {
    return 'already_completed'
  }

  if (delivery.expiresAt <= dependencies.now()) {
    await dependencies.store.finish(workId, { attempts, status: 'expired' })
    return 'expired'
  }

  const startedAt = performance.now()
  let result

  try {
    result = await dependencies.send(
      {
        actionUrl: delivery.actionUrl,
        kind: delivery.kind,
        recipient: delivery.recipient,
        recipientName: delivery.recipientName,
      },
      { idempotencyKey: `auth-email/${workId}` },
    )
  } finally {
    provider.durationMs = performance.now() - startedAt
  }

  await dependencies.store.finish(workId, { attempts, providerMessageId: result.providerMessageId, status: 'sent' })
  return 'sent'
}

/** Delivery attempts before work is dead-lettered; the consumer's Wrangler `max_retries` matches it as a backstop. */
export const AUTH_EMAIL_MAX_ATTEMPTS = 5

// Seconds to wait after failed attempts 1, 2, 3, and 4.
const RETRY_DELAYS_SECONDS = [10, 30, 60, 120]

function retryDelaySeconds(attempts: number) {
  return RETRY_DELAYS_SECONDS[Math.min(attempts, RETRY_DELAYS_SECONDS.length) - 1]
}

/** Creates the producer for one invocation's database connection; development sends inline instead of queueing. */
export function createAuthEmailProducer(db: Database) {
  const environment = getRuntimeEnvironment()
  const store = createAuthEmailRepository(db)
  const now = () => new Date()
  const dispatch =
    environment.deployment === 'development'
      ? async ({ workId }: AuthEmailMessage) => {
          await deliver(workId, 1, { now, send: sendAuthEmail, store }, { durationMs: 0 })
        }
      : (message: AuthEmailMessage) => environment.bindings.authEmailQueue.send(message)

  return (work: AuthEmailWork) =>
    enqueueAuthEmail(work, {
      deploymentVersion: environment.version,
      dispatch,
      emitOutboxInsertFailure: (record) => console.error(record),
      now,
      store,
    })
}

/** Consumes one Queue batch over its own database connection, dead-lettering through the runtime binding. */
export async function consumeAuthEmailBatch(batch: AuthEmailBatch) {
  const environment = getRuntimeEnvironment()

  if (environment.deployment === 'development') {
    throw new Error('Authentication email Queues are not bound in development')
  }

  const startedAt = performance.now()
  const databaseMetrics = createDatabaseMetrics()
  let connection: Awaited<ReturnType<typeof connectDatabase>>
  try {
    connection = await connectDatabase(databaseMetrics)
  } catch (error) {
    emitAuthEmailBatchConnectionFailure(batch, {
      databaseMetrics,
      deploymentVersion: environment.version,
      emit: (record) => console.info(record),
      totalDurationMs: performance.now() - startedAt,
    })
    throw error
  }

  try {
    await handleAuthEmailBatch(batch, {
      databaseMetrics,
      deadLetterQueue: environment.bindings.authEmailDeadLetterQueue,
      deploymentVersion: environment.version,
      emit: (record) => console.info(record),
      now: () => new Date(),
      send: sendAuthEmail,
      store: createAuthEmailRepository(connection.db),
    })
  } finally {
    await connection.close()
  }
}
