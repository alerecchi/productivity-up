// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { createDatabaseMetrics } from '@/server/core/telemetry'
import {
  AuthEmailEnqueueError,
  dispatchPendingAuthEmailWork,
  emitAuthEmailBatchConnectionFailure,
  enqueueAuthEmail,
  handleAuthEmailBatch,
} from '@/server/email/queue'
import type { AuthEmailDelivery, AuthEmailSender, AuthEmailStore } from '@/server/email/queue'
import { EmailDeliveryError } from '@/server/email/sender'

const NOW = new Date('2026-09-26T12:00:00.000Z')
const CREATED_AT = new Date('2026-09-26T11:00:00.000Z')
const WORK_ID = '0b9f1f3e-6a4f-4a53-9d8e-3c0f2f8f5d11'
const RECIPIENT = 'person@example.test'
const ACTION_URL = 'https://example.test/verify-email?token=verification-secret'

describe('authentication email connection failure telemetry', () => {
  it('emits one sanitized retry record for each Queue message', () => {
    const emit = vi.fn()
    const messages = [
      { ack: vi.fn(), attempts: 1, body: { workId: WORK_ID }, id: 'message-1', retry: vi.fn() },
      { ack: vi.fn(), attempts: 2, body: { workId: 'another-secret-work-id' }, id: 'message-2', retry: vi.fn() },
    ]

    emitAuthEmailBatchConnectionFailure(
      { messages },
      {
        databaseMetrics: { durationMs: 12.5, roundTrips: 0 },
        deploymentVersion: 'deployment-version',
        emit,
        totalDurationMs: 15,
      },
    )

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenNthCalledWith(1, {
      attempt: 1,
      databaseDurationMs: 12.5,
      databaseRoundTrips: 0,
      deploymentVersion: 'deployment-version',
      operation: 'auth_email.deliver',
      outcome: 'retry',
      requestId: 'message-1',
      thirdPartyDurationMs: 0,
      totalDurationMs: 15,
    })
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(
      /another-secret-work-id|verification-secret|person@example\.test/,
    )
  })
})

function pendingDelivery(overrides: Partial<AuthEmailDelivery> = {}): AuthEmailDelivery {
  return {
    actionUrl: ACTION_URL,
    createdAt: CREATED_AT,
    expiresAt: new Date('2026-09-26T13:00:00.000Z'),
    id: WORK_ID,
    kind: 'email_verification',
    queuedAt: null,
    recipient: RECIPIENT,
    recipientName: 'Person',
    status: 'pending',
    ...overrides,
  }
}

/** In-memory stand-in for the outbox table: final states clear the recipient and action URL. */
function createFakeStore(deliveries: Array<AuthEmailDelivery>) {
  const rows = new Map(
    deliveries.map((delivery) => [delivery.id, { ...delivery, attempts: 0, providerMessageId: null as string | null }]),
  )

  const store: AuthEmailStore = {
    create: (work) => {
      const id = crypto.randomUUID()
      rows.set(id, {
        actionUrl: work.actionUrl,
        attempts: 0,
        createdAt: NOW,
        expiresAt: work.expiresAt,
        id,
        kind: work.kind,
        providerMessageId: null,
        queuedAt: null,
        recipient: work.recipient,
        recipientName: work.recipientName ?? null,
        status: 'pending',
      })
      return Promise.resolve(id)
    },
    find: (id) => {
      const row = rows.get(id)
      return Promise.resolve(row ? { ...row } : undefined)
    },
    listPendingForDispatch: (now, limit, after) =>
      Promise.resolve(
        [...rows.values()]
          .filter((row) => row.status === 'pending' && row.queuedAt === null && row.expiresAt > now)
          .filter(
            (row) =>
              !after ||
              row.createdAt > after.createdAt ||
              (row.createdAt.getTime() === after.createdAt.getTime() && row.id > after.id),
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
          .slice(0, limit)
          .map(({ createdAt, id }) => ({ createdAt, id })),
      ),
    markQueued: (id, queuedAt) => {
      const row = rows.get(id)
      if (row?.status === 'pending' && row.queuedAt === null) rows.set(id, { ...row, queuedAt })
      return Promise.resolve()
    },
    finish: (id, result) => {
      const row = rows.get(id)
      if (row?.status === 'pending') {
        rows.set(id, {
          ...row,
          actionUrl: null,
          attempts: result.attempts,
          providerMessageId: result.providerMessageId ?? null,
          recipient: null,
          recipientName: null,
          status: result.status,
        })
      }
      return Promise.resolve()
    },
  }

  return { rows, store }
}

function queueMessage(body: unknown, attempts = 1) {
  return { ack: vi.fn(), attempts, body, id: `message-${attempts}`, retry: vi.fn() }
}

function createDependencies(store: AuthEmailStore, send: AuthEmailSender = vi.fn(() => sentResult())) {
  return {
    databaseMetrics: createDatabaseMetrics(),
    deadLetterQueue: { send: vi.fn(() => Promise.resolve()) },
    deploymentVersion: 'test-version',
    emit: vi.fn(),
    now: () => NOW,
    send,
    store,
  }
}

function sentResult() {
  return Promise.resolve({ providerMessageId: 'provider-message-id' })
}

describe('authentication email queue producer', () => {
  const work = {
    actionUrl: ACTION_URL,
    kind: 'email_verification' as const,
    recipient: RECIPIENT,
    recipientName: 'Person',
    userId: 'user-id',
  }

  it('stores the work and queues only its opaque ID', async () => {
    const { rows, store } = createFakeStore([])
    const dispatch = vi.fn(() => Promise.resolve())

    await enqueueAuthEmail(work, { dispatch, now: () => NOW, store })

    const [[workId, row]] = [...rows.entries()]
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ workId })
    expect(row).toMatchObject({
      actionUrl: ACTION_URL,
      expiresAt: new Date('2026-09-26T13:00:00.000Z'),
      kind: 'email_verification',
      queuedAt: NOW,
      recipient: RECIPIENT,
      status: 'pending',
    })
  })

  it('completes only after the queue write succeeds', async () => {
    const { store } = createFakeStore([])
    let resolveWrite = () => {}
    const dispatch = vi.fn(() => new Promise<void>((resolve) => (resolveWrite = resolve)))
    let completed = false

    const enqueued = enqueueAuthEmail(work, { dispatch, now: () => NOW, store }).then(() => (completed = true))
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalled())
    expect(completed).toBe(false)

    resolveWrite()
    await enqueued
    expect(completed).toBe(true)
  })

  it('keeps failed Queue publications recoverable for scheduled retry', async () => {
    const { rows, store } = createFakeStore([])
    const dispatch = vi.fn(() => Promise.reject(new Error('Queue unavailable')))

    await expect(enqueueAuthEmail(work, { dispatch, now: () => NOW, store })).rejects.toMatchObject({
      message: 'Authentication email could not be queued',
      name: AuthEmailEnqueueError.name,
    })
    expect([...rows.values()][0]).toMatchObject({
      actionUrl: ACTION_URL,
      queuedAt: null,
      recipient: RECIPIENT,
      recipientName: 'Person',
      status: 'pending',
    })
  })

  it('retries unpublished work from the outbox and records a successful Queue write', async () => {
    const { rows, store } = createFakeStore([])
    await enqueueAuthEmail(work, {
      dispatch: vi.fn(() => Promise.reject(new Error('Queue unavailable'))),
      now: () => NOW,
      store,
    }).catch(() => undefined)
    const dispatch = vi.fn(() => Promise.resolve())

    const result = await dispatchPendingAuthEmailWork({ dispatch, now: () => NOW, store })

    expect(result).toMatchObject({ failed: 0, published: 1 })
    expect(result.thirdPartyDurationMs).toBeGreaterThanOrEqual(0)
    const row = [...rows.values()][0]
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ workId: row.id })
    expect(row.queuedAt).toEqual(NOW)
  })

  it('catches up more than 300 pending rows in one maintenance run', async () => {
    const deliveries = Array.from({ length: 350 }, (_, index) =>
      pendingDelivery({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    )
    const { rows, store } = createFakeStore(deliveries)
    const dispatch = vi.fn(() => Promise.resolve())

    const result = await dispatchPendingAuthEmailWork({ dispatch, now: () => NOW, store })

    expect(result).toMatchObject({ failed: 0, published: 350 })
    expect(dispatch).toHaveBeenCalledTimes(350)
    expect([...rows.values()].every((row) => row.queuedAt?.getTime() === NOW.getTime())).toBe(true)
  })

  it('limits one maintenance run to 1000 publications and continues on the next run', async () => {
    const deliveries = Array.from({ length: 1050 }, (_, index) =>
      pendingDelivery({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    )
    const { store } = createFakeStore(deliveries)
    const dispatch = vi.fn(() => Promise.resolve())

    const first = await dispatchPendingAuthEmailWork({ dispatch, now: () => NOW, store })
    const second = await dispatchPendingAuthEmailWork({ dispatch, now: () => NOW, store })

    expect(first).toMatchObject({ failed: 0, published: 1000 })
    expect(second).toMatchObject({ failed: 0, published: 50 })
    expect(dispatch).toHaveBeenCalledTimes(1050)
  })

  it('continues beyond a full page of failed publications without retrying them in the same run', async () => {
    const deliveries = Array.from({ length: 125 }, (_, index) =>
      pendingDelivery({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    )
    const { rows, store } = createFakeStore(deliveries)
    const dispatch = vi.fn(({ workId }: { workId: string }) =>
      workId.endsWith('000000000000') ? Promise.reject(new Error('Queue unavailable')) : Promise.resolve(),
    )

    const result = await dispatchPendingAuthEmailWork({ dispatch, now: () => NOW, store })

    expect(result).toMatchObject({ failed: 1, published: 124 })
    expect(dispatch).toHaveBeenCalledTimes(125)
    expect(rows.get(deliveries[0].id)?.queuedAt).toBeNull()
    expect(rows.get(deliveries[124].id)?.queuedAt).toEqual(NOW)
  })

  it('sanitizes database errors before they reach Better Auth logging', async () => {
    const { store } = createFakeStore([])
    store.create = () => Promise.reject(new Error(`failed to insert ${ACTION_URL} for ${RECIPIENT}`))
    const dispatch = vi.fn()
    const emitOutboxInsertFailure = vi.fn()

    await expect(
      enqueueAuthEmail(work, {
        deploymentVersion: 'test-version',
        dispatch,
        emitOutboxInsertFailure,
        now: () => NOW,
        store,
      }),
    ).rejects.toMatchObject({ message: 'Authentication email could not be queued', name: AuthEmailEnqueueError.name })
    expect(dispatch).not.toHaveBeenCalled()
    expect(emitOutboxInsertFailure).toHaveBeenCalledExactlyOnceWith({
      deploymentVersion: 'test-version',
      kind: 'email_verification',
      operation: 'auth_email.outbox_insert',
      outcome: 'failure',
      requestId: expect.any(String),
    })
    expect(JSON.stringify(emitOutboxInsertFailure.mock.calls)).not.toMatch(/verification-secret|person@example\.test/)
  })
})

describe('authentication email queue consumer', () => {
  it('sends pending work to its recipient, records it as sent, and acknowledges the message', async () => {
    const { rows, store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(store)
    const message = queueMessage({ workId: WORK_ID })

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(dependencies.send).toHaveBeenCalledWith(
      { actionUrl: ACTION_URL, kind: 'email_verification', recipient: RECIPIENT, recipientName: 'Person' },
      { idempotencyKey: `auth-email/${WORK_ID}` },
    )
    expect(rows.get(WORK_ID)).toMatchObject({
      actionUrl: null,
      attempts: 1,
      providerMessageId: 'provider-message-id',
      recipient: null,
      status: 'sent',
    })
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it.each([
    { attempts: 1, delaySeconds: 10 },
    { attempts: 2, delaySeconds: 30 },
    { attempts: 3, delaySeconds: 60 },
    { attempts: 4, delaySeconds: 120 },
  ])('retries failed attempt $attempts after $delaySeconds seconds', async ({ attempts, delaySeconds }) => {
    const { rows, store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(
      store,
      vi.fn(() => Promise.reject(new Error('Email delivery failed'))),
    )
    const message = queueMessage({ workId: WORK_ID }, attempts)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds })
    expect(message.ack).not.toHaveBeenCalled()
    expect(dependencies.deadLetterQueue.send).not.toHaveBeenCalled()
    expect(rows.get(WORK_ID)).toMatchObject({ recipient: RECIPIENT, status: 'pending' })
  })

  it('dead-letters work whose fifth attempt fails and acknowledges the message', async () => {
    const { rows, store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(
      store,
      vi.fn(() => Promise.reject(new Error('Email delivery failed'))),
    )
    const message = queueMessage({ workId: WORK_ID }, 5)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(dependencies.deadLetterQueue.send).toHaveBeenCalledWith({ workId: WORK_ID })
    expect(rows.get(WORK_ID)).toMatchObject({
      actionUrl: null,
      attempts: 5,
      recipient: null,
      recipientName: null,
      status: 'dead_lettered',
    })
    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('retries the fifth attempt when the dead-letter write fails', async () => {
    const { rows, store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(
      store,
      vi.fn(() => Promise.reject(new Error('Email delivery failed'))),
    )
    dependencies.deadLetterQueue.send.mockRejectedValueOnce(new Error('Queue unavailable'))
    const message = queueMessage({ workId: WORK_ID }, 5)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(message.retry).toHaveBeenCalledOnce()
    expect(message.ack).not.toHaveBeenCalled()
    expect(rows.get(WORK_ID)).toMatchObject({ status: 'pending' })
  })

  it('sends every attempt of the same work with the same idempotency key', async () => {
    const { store } = createFakeStore([pendingDelivery()])
    const send = vi.fn<AuthEmailSender>().mockRejectedValueOnce(new Error('Email delivery failed'))
    send.mockImplementation(() => sentResult())
    const dependencies = createDependencies(store, send)

    await handleAuthEmailBatch({ messages: [queueMessage({ workId: WORK_ID }, 1)] }, dependencies)
    await handleAuthEmailBatch({ messages: [queueMessage({ workId: WORK_ID }, 2)] }, dependencies)

    expect(send.mock.calls.map(([, options]) => options.idempotencyKey)).toEqual([
      `auth-email/${WORK_ID}`,
      `auth-email/${WORK_ID}`,
    ])
  })

  it('expires work whose action link has expired without sending it', async () => {
    const { rows, store } = createFakeStore([pendingDelivery({ expiresAt: NOW })])
    const dependencies = createDependencies(store)
    const message = queueMessage({ workId: WORK_ID }, 3)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(dependencies.send).not.toHaveBeenCalled()
    expect(rows.get(WORK_ID)).toMatchObject({ actionUrl: null, attempts: 3, recipient: null, status: 'expired' })
    expect(message.ack).toHaveBeenCalledOnce()
  })

  it('acknowledges messages whose work no longer exists', async () => {
    const { store } = createFakeStore([])
    const dependencies = createDependencies(store)
    const message = queueMessage({ workId: WORK_ID })

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(dependencies.send).not.toHaveBeenCalled()
    expect(message.ack).toHaveBeenCalledOnce()
  })

  it.each([
    { body: { to: RECIPIENT, type: 'verification', url: ACTION_URL }, name: 'a legacy message' },
    { body: { workId: 'not-a-work-id' }, name: 'an invalid work ID' },
    { body: 'text', name: 'a non-object body' },
  ])('acknowledges $name without reading or sending work', async ({ body }) => {
    const { store } = createFakeStore([pendingDelivery()])
    const find = vi.spyOn(store, 'find')
    const dependencies = createDependencies(store)
    const message = queueMessage(body)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(find).not.toHaveBeenCalled()
    expect(dependencies.send).not.toHaveBeenCalled()
    expect(dependencies.deadLetterQueue.send).not.toHaveBeenCalled()
    expect(message.ack).toHaveBeenCalledOnce()
  })

  it('emits one completion record for each message', async () => {
    const { store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(store)

    await handleAuthEmailBatch(
      { messages: [queueMessage({ workId: WORK_ID }), queueMessage({ workId: 'not-a-work-id' }, 2)] },
      dependencies,
    )

    expect(dependencies.emit.mock.calls).toEqual([
      [
        {
          attempt: 1,
          databaseDurationMs: expect.any(Number),
          databaseRoundTrips: 0,
          deploymentVersion: 'test-version',
          operation: 'auth_email.deliver',
          outcome: 'sent',
          requestId: 'message-1',
          thirdPartyDurationMs: expect.any(Number),
          totalDurationMs: expect.any(Number),
          workId: WORK_ID,
        },
      ],
      [
        {
          attempt: 2,
          databaseDurationMs: expect.any(Number),
          databaseRoundTrips: 0,
          deploymentVersion: 'test-version',
          operation: 'auth_email.deliver',
          outcome: 'malformed',
          requestId: 'message-2',
          thirdPartyDurationMs: 0,
          totalDurationMs: expect.any(Number),
        },
      ],
    ])
  })

  it('records the safe provider error code of a failed attempt without sensitive values', async () => {
    const { store } = createFakeStore([pendingDelivery()])
    const dependencies = createDependencies(
      store,
      vi.fn(() => Promise.reject(new EmailDeliveryError('rate_limit_exceeded'))),
    )
    const consoleSpies = (['debug', 'error', 'info', 'log', 'warn'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    )

    await handleAuthEmailBatch({ messages: [queueMessage({ workId: WORK_ID }, 5)] }, dependencies)

    expect(dependencies.emit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'dead_lettered', providerErrorCode: 'rate_limit_exceeded' }),
    )
    const serialized = JSON.stringify(dependencies.emit.mock.calls)
    for (const sensitive of [RECIPIENT, ACTION_URL, 'verification-secret', 'Person']) {
      expect(serialized).not.toContain(sensitive)
    }
    for (const consoleSpy of consoleSpies) {
      expect(consoleSpy).not.toHaveBeenCalled()
    }
  })

  it('does not send work again once it has been sent', async () => {
    const { store } = createFakeStore([pendingDelivery({ actionUrl: null, recipient: null, status: 'sent' })])
    const dependencies = createDependencies(store)
    const message = queueMessage({ workId: WORK_ID }, 2)

    await handleAuthEmailBatch({ messages: [message] }, dependencies)

    expect(dependencies.send).not.toHaveBeenCalled()
    expect(message.ack).toHaveBeenCalledOnce()
  })
})
