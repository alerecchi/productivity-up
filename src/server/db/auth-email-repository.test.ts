// @vitest-environment node
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import { createAuthEmailRepository, expirePendingAuthEmailWork } from '@/server/db/auth-email-repository'
import type { Database } from '@/server/db/client'

describe('expired authentication email cleanup', () => {
  it('clears secrets only from pending rows whose links have expired', async () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const returning = vi.fn().mockResolvedValue([{ id: 'first' }, { id: 'second' }])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const db = { update } as unknown as Database

    const count = await expirePendingAuthEmailWork(db, now)

    expect(count).toBe(2)
    expect(set).toHaveBeenCalledWith({
      actionUrl: null,
      completedAt: now,
      recipient: null,
      recipientName: null,
      status: 'expired',
    })
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0])
    expect(predicate.sql).toContain('"status" =')
    expect(predicate.sql).toContain('"expires_at" <=')
    expect(predicate.params).toEqual(['pending', now.toISOString()])
  })
})

describe('pending authentication email dispatch', () => {
  it('selects only unqueued, pending work whose links are still valid', async () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const createdAt = new Date('2026-09-26T11:00:00.000Z')
    const limit = vi.fn().mockResolvedValue([{ createdAt, id: 'first' }])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const db = { select } as unknown as Database
    const store = createAuthEmailRepository(db)

    await expect(store.listPendingForDispatch(now, 100)).resolves.toEqual([{ createdAt, id: 'first' }])
    expect(limit).toHaveBeenCalledWith(100)
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0])
    expect(predicate.sql).toContain('"status" =')
    expect(predicate.sql).toContain('"queued_at" is null')
    expect(predicate.sql).toContain('"expires_at" >')
    expect(predicate.params).toEqual(['pending', now.toISOString()])
  })

  it('continues after a creation-time and ID cursor', async () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const createdAt = new Date('2026-09-26T11:00:00.000Z')
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const store = createAuthEmailRepository({ select } as unknown as Database)

    await store.listPendingForDispatch(now, 100, { createdAt, id: 'last-id' })

    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0])
    expect(predicate.sql.match(/date_trunc\('milliseconds'/g)).toHaveLength(2)
    expect(predicate.sql).toContain('"id" >')
    expect(predicate.params).toEqual(['pending', now.toISOString(), createdAt, createdAt, 'last-id'])

    const [createdAtOrder] = orderBy.mock.calls[0]
    expect(new PgDialect().sqlToQuery(createdAtOrder).sql).toContain("date_trunc('milliseconds'")
  })

  it('marks only pending rows without a prior successful Queue write', async () => {
    const now = new Date('2026-09-26T12:00:00.000Z')
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    const db = { update } as unknown as Database
    const store = createAuthEmailRepository(db)

    await store.markQueued('work-id', now)

    expect(set).toHaveBeenCalledWith({ queuedAt: now })
    const predicate = new PgDialect().sqlToQuery(where.mock.calls[0][0])
    expect(predicate.sql).toContain('"id" =')
    expect(predicate.sql).toContain('"status" =')
    expect(predicate.sql).toContain('"queued_at" is null')
    expect(predicate.params).toEqual(['work-id', 'pending'])
  })
})
