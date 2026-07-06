import { describe, expect, test } from 'vitest'

import type { BucketType } from '@/lib/types/Bucket'
import type { TodoDbSelect, UserDb } from '@/server/db/types'
import {
  completeDayForUser,
  confirmMigrationStepForUser,
  getMigrationStepForUser,
  loadBoardForUser,
} from '@/server/functions/board.core'
import type { BoardRepository } from '@/server/functions/board.core'

describe('loadBoardForUser', () => {
  test('first board visit stores User Timezone and Planning Date and creates active Buckets', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: {
        planningDate: null,
        timeZone: null,
      },
    })

    await expect(repository.getActiveBuckets('user-1')).resolves.toEqual([])

    const result = await loadBoardForUser({
      browserTimeZone: 'Europe/Berlin',
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toEqual({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W27', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-03', status: 'active', type: 'daily' }),
      ],
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getUser('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-03',
      timeZone: 'Europe/Berlin',
    })
  })

  test('later board visits keep the stored User Timezone when the browser timezone differs', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await loadBoardForUser({
      browserTimeZone: 'America/New_York',
      now: () => new Date('2026-07-03T15:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getUser('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-03',
      timeZone: 'Europe/Berlin',
    })
  })

  test('later board visits reuse existing active Buckets for the Planning Date', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-03', type: 'daily' }),
      ],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await loadBoardForUser({
      browserTimeZone: 'Europe/Berlin',
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result.buckets).toHaveLength(5)
    expect(result.buckets.map((bucket) => bucket.id)).toEqual([1, 2, 3, 4, 5])
  })

  test('later board visits normalize a past Planning Date to today and archive stale completed-only Buckets', async () => {
    const createdAt = new Date('2026-07-02T08:00:00.000Z')
    const now = new Date('2026-07-03T15:30:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-02', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 5, completed: true, id: 1, title: 'Closed yesterday' })],
      user: {
        planningDate: '2026-07-02',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await loadBoardForUser({
      browserTimeZone: 'Europe/Berlin',
      now: () => now,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W27', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-03', status: 'active', type: 'daily' }),
      ],
      planningDate: '2026-07-03',
      status: 'ready',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-02')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
  })

  test('creates current destination Buckets and marks expired incomplete Buckets as pending migration after a weekend gap', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-03', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 5, completed: false, id: 1, title: 'Carry this forward' })],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await loadBoardForUser({
      now: () => new Date('2026-07-06T07:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W28', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-06', status: 'active', type: 'daily' }),
      ],
      planningDate: '2026-07-06',
      pendingMigrationBuckets: [
        expect.objectContaining({ period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      status: 'migration_required',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: null,
      status: 'pending_migration',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-04')).resolves.toBeUndefined()
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-05')).resolves.toBeUndefined()
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'weekly', '2026-W27')).resolves.toMatchObject({
      status: 'archived',
    })
  })

  test('never marks inbox pending migration or archives it during lifecycle reconciliation', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' })],
      todos: [createTodo({ bucketId: 1, completed: false, id: 1, title: 'Keep in inbox' })],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await loadBoardForUser({
      now: () => new Date('2026-07-06T07:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      planningDate: '2026-07-06',
      status: 'ready',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'inbox', 'inbox')).resolves.toMatchObject({
      archivedAt: null,
      status: 'active',
    })
    await expect(repository.getPendingMigrationBuckets('user-1')).resolves.toEqual([])
  })

  test('expires Buckets at the exclusive period end in the User Timezone', async () => {
    const createdAt = new Date('2026-06-29T08:00:00.000Z')
    const beforeEndRepository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-05', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 4, completed: true, id: 1, title: 'Wrap the week' })],
      user: {
        planningDate: '2026-07-05',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      loadBoardForUser({
        now: () => new Date('2026-07-05T21:59:59.999Z'),
        repository: beforeEndRepository,
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        expect.objectContaining({ period: '2026-W27', status: 'active', type: 'weekly' }),
      ]),
      planningDate: '2026-07-05',
      status: 'ready',
    })
    await expect(
      beforeEndRepository.findBucketByUserTypeAndPeriod('user-1', 'weekly', '2026-W27'),
    ).resolves.toMatchObject({
      archivedAt: null,
      status: 'active',
    })

    const atEndRepository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-05', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 4, completed: true, id: 1, title: 'Wrap the week' })],
      user: {
        planningDate: '2026-07-05',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      loadBoardForUser({
        now: () => new Date('2026-07-05T22:00:00.000Z'),
        repository: atEndRepository,
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        expect.objectContaining({ period: '2026-W28', status: 'active', type: 'weekly' }),
      ]),
      planningDate: '2026-07-06',
      status: 'ready',
    })
    await expect(atEndRepository.findBucketByUserTypeAndPeriod('user-1', 'weekly', '2026-W27')).resolves.toMatchObject({
      archivedAt: new Date('2026-07-05T22:00:00.000Z'),
      status: 'archived',
    })
  })

  test('repeated and concurrent lifecycle reconciliation converges without duplicate Buckets', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const now = new Date('2026-07-06T07:30:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-03', type: 'daily' }),
      ],
      todos: [
        createTodo({ bucketId: 4, completed: true, id: 1, title: 'Closed weekly review' }),
        createTodo({ bucketId: 5, completed: false, id: 2, title: 'Carry this forward' }),
      ],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const firstResult = await loadBoardForUser({
      now: () => now,
      repository,
      userId: 'user-1',
    })
    const secondResult = await loadBoardForUser({
      now: () => now,
      repository,
      userId: 'user-1',
    })
    const concurrentResults = await Promise.all([
      loadBoardForUser({ now: () => now, repository, userId: 'user-1' }),
      loadBoardForUser({ now: () => now, repository, userId: 'user-1' }),
    ])

    expect([firstResult, secondResult, ...concurrentResults]).toEqual([
      expect.objectContaining({ status: 'migration_required' }),
      expect.objectContaining({ status: 'migration_required' }),
      expect.objectContaining({ status: 'migration_required' }),
      expect.objectContaining({ status: 'migration_required' }),
    ])

    const activeBuckets = await repository.getActiveBuckets('user-1')
    expect(activeBuckets.map(toBucketKey).sort()).toEqual([
      'daily:2026-07-06',
      'inbox:inbox',
      'monthly:2026-07',
      'weekly:2026-W28',
      'yearly:2026',
    ])

    const pendingMigrationBuckets = await repository.getPendingMigrationBuckets('user-1')
    expect(pendingMigrationBuckets.map(toBucketKey)).toEqual(['daily:2026-07-03'])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'weekly', '2026-W27')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
  })
})

describe('completeDayForUser', () => {
  test('archives an all-done daily Bucket and advances Planning Date to tomorrow', async () => {
    const now = new Date('2026-07-03T15:30:00.000Z')
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-03', type: 'daily' }),
      ],
      todos: [
        createTodo({ bucketId: 5, completed: true, id: 1, title: 'Ship lifecycle slice' }),
        createTodo({ bucketId: 5, completed: true, id: 2, title: 'Tidy desk' }),
      ],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await completeDayForUser({
      now: () => now,
      repository,
      userId: 'user-1',
    })

    expect(result).toEqual({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W27', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-04', status: 'active', type: 'daily' }),
      ],
      planningDate: '2026-07-04',
      recap: {
        completedCount: 2,
        incompleteCount: 0,
        kind: 'all_complete',
      },
      status: 'completed',
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.getUser('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-04',
      timeZone: 'Europe/Berlin',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
  })

  test('manual completion with incomplete Todos advances Planning Date and gates the board for migration', async () => {
    const now = new Date('2026-07-03T15:30:00.000Z')
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W27', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-03', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 5, completed: false, id: 1, title: 'Review tomorrow' })],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await completeDayForUser({
      now: () => now,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2026-07', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2026-W27', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2026-07-04', status: 'active', type: 'daily' }),
      ],
      pendingMigrationBuckets: [
        expect.objectContaining({ period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      planningDate: '2026-07-04',
      status: 'migration_required',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: null,
      status: 'pending_migration',
    })
  })

  test('rejects completion while Planning Date is ahead of today', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [createBucket({ createdAt, id: 1, period: '2026-07-04', type: 'daily' })],
      user: {
        planningDate: '2026-07-04',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      completeDayForUser({
        now: () => new Date('2026-07-03T15:30:00.000Z'),
        repository,
        userId: 'user-1',
      }),
    ).rejects.toThrow('Cannot complete a future Bucket')
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-04')).resolves.toMatchObject({
      archivedAt: null,
      status: 'active',
    })
    await expect(repository.getUser('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-04',
    })
  })

  test('rejects completion while a Bucket is pending migration', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026-W27', status: 'pending_migration', type: 'weekly' }),
        createBucket({ createdAt, id: 3, period: '2026-07-03', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 3, completed: true, id: 1, title: 'Close today' })],
      user: {
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      completeDayForUser({
        now: () => new Date('2026-07-03T15:30:00.000Z'),
        repository,
        userId: 'user-1',
      }),
    ).rejects.toThrow('Migration is required before completing this day')
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: null,
      status: 'active',
    })
    await expect(repository.getUser('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-03',
    })
  })

  test('archives stale completed-only Buckets when completion crosses period boundaries', async () => {
    const now = new Date('2026-12-31T15:30:00.000Z')
    const createdAt = new Date('2026-12-31T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-12', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W53', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-12-31', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 5, completed: true, id: 1, title: 'Finish the year' })],
      user: {
        planningDate: '2026-12-31',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await completeDayForUser({
      now: () => now,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      buckets: [
        expect.objectContaining({ period: 'inbox', status: 'active', type: 'inbox' }),
        expect.objectContaining({ period: '2026-W53', status: 'active', type: 'weekly' }),
        expect.objectContaining({ period: '2027', status: 'active', type: 'yearly' }),
        expect.objectContaining({ period: '2027-01', status: 'active', type: 'monthly' }),
        expect.objectContaining({ period: '2027-01-01', status: 'active', type: 'daily' }),
      ],
      planningDate: '2027-01-01',
      status: 'completed',
    })
    expect(result.buckets.map((bucket) => `${bucket.type}:${bucket.period}`)).toEqual([
      'inbox:inbox',
      'weekly:2026-W53',
      'yearly:2027',
      'monthly:2027-01',
      'daily:2027-01-01',
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'yearly', '2026')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'monthly', '2026-12')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-12-31')).resolves.toMatchObject({
      archivedAt: now,
      status: 'archived',
    })
  })
})

describe('confirmMigrationStepForUser', () => {
  test('moves every incomplete Todo to its chosen destination, appends by source order, and archives the source Bucket', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const confirmedAt = new Date('2026-07-06T09:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-06', type: 'daily' }),
        createBucket({ createdAt, id: 6, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      todos: [
        createTodo({ bucketId: 4, completed: false, id: 10, position: 1024, title: 'Existing week Todo' }),
        createTodo({ bucketId: 5, completed: false, id: 11, position: 1024, title: 'Existing day Todo' }),
        createTodo({ bucketId: 6, completed: false, id: 12, position: 2048, title: 'Move back first' }),
        createTodo({ bucketId: 6, completed: true, id: 13, position: 3072, title: 'Completed stays put' }),
        createTodo({ bucketId: 6, completed: false, id: 14, position: 4096, title: 'Carry forward second' }),
      ],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await confirmMigrationStepForUser({
      data: {
        decisions: {
          12: 'move_back',
          14: 'carry_forward',
        },
        sourceBucketId: 6,
      },
      now: () => confirmedAt,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      board: {
        planningDate: '2026-07-06',
        status: 'ready',
      },
      migratedTodoPositions: [
        { bucketId: 4, id: 12, position: 2048 },
        { bucketId: 5, id: 14, position: 2048 },
      ],
      status: 'confirmed',
    })
    await expect(repository.getTodosByBucket(4)).resolves.toEqual([
      expect.objectContaining({ id: 10, position: 1024 }),
      expect.objectContaining({ bucketId: 4, id: 12, position: 2048, title: 'Move back first' }),
    ])
    await expect(repository.getTodosByBucket(5)).resolves.toEqual([
      expect.objectContaining({ id: 11, position: 1024 }),
      expect.objectContaining({ bucketId: 5, id: 14, position: 2048, title: 'Carry forward second' }),
    ])
    await expect(repository.getTodosByBucket(6)).resolves.toEqual([
      expect.objectContaining({ bucketId: 6, completed: true, id: 13, title: 'Completed stays put' }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: confirmedAt,
      status: 'archived',
    })
  })

  test('retries the same decision map after a partial migration write failure', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const confirmedAt = new Date('2026-07-06T09:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-06', type: 'daily' }),
        createBucket({ createdAt, id: 6, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      todos: [
        createTodo({ bucketId: 6, completed: false, id: 12, position: 2048, title: 'Already moved before failure' }),
        createTodo({ bucketId: 6, completed: false, id: 14, position: 4096, title: 'Retry moves this' }),
      ],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })
    const originalMoveTodoForMigration = repository.moveTodoForMigration
    let moveCount = 0
    repository.moveTodoForMigration = async (...args) => {
      moveCount += 1

      if (moveCount === 2) {
        return undefined
      }

      return originalMoveTodoForMigration(...args)
    }
    const data = {
      decisions: {
        12: 'move_back' as const,
        14: 'carry_forward' as const,
      },
      sourceBucketId: 6,
    }

    await expect(
      confirmMigrationStepForUser({
        data,
        now: () => confirmedAt,
        repository,
        userId: 'user-1',
      }),
    ).rejects.toThrow('Migration Step conflict; refresh and retry')

    repository.moveTodoForMigration = originalMoveTodoForMigration
    const result = await confirmMigrationStepForUser({
      data,
      now: () => confirmedAt,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      board: {
        status: 'ready',
      },
      migratedTodoPositions: [{ bucketId: 5, id: 14, position: 1024 }],
      status: 'confirmed',
    })
    await expect(repository.getTodosByBucket(4)).resolves.toEqual([
      expect.objectContaining({ bucketId: 4, id: 12, position: 1024 }),
    ])
    await expect(repository.getTodosByBucket(5)).resolves.toEqual([
      expect.objectContaining({ bucketId: 5, id: 14, position: 1024 }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: confirmedAt,
      status: 'archived',
    })
  })

  test('moves yearly Todos back to inbox when no broader time-based Bucket exists', async () => {
    const createdAt = new Date('2026-01-01T08:00:00.000Z')
    const confirmedAt = new Date('2027-01-01T09:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2027', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026', status: 'pending_migration', type: 'yearly' }),
      ],
      todos: [
        createTodo({ bucketId: 1, completed: false, id: 10, position: 1024, title: 'Existing inbox Todo' }),
        createTodo({ bucketId: 3, completed: false, id: 11, position: 1024, title: 'Move back to inbox' }),
      ],
      user: {
        planningDate: '2027-01-01',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await confirmMigrationStepForUser({
      data: {
        decisions: {
          11: 'move_back',
        },
        sourceBucketId: 3,
      },
      now: () => confirmedAt,
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      migratedTodoPositions: [{ bucketId: 1, id: 11, position: 2048 }],
      status: 'confirmed',
    })
    await expect(repository.getTodosByBucket(1)).resolves.toEqual([
      expect.objectContaining({ id: 10, position: 1024 }),
      expect.objectContaining({ bucketId: 1, id: 11, position: 2048, title: 'Move back to inbox' }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'yearly', '2026')).resolves.toMatchObject({
      archivedAt: confirmedAt,
      status: 'archived',
    })
  })

  test('keeps Migration Step reads as disposable draft state with no persisted choices', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 3, period: '2026-07-06', type: 'daily' }),
        createBucket({ createdAt, id: 4, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 4, completed: false, id: 12, position: 1024, title: 'Draft only' })],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })

    const firstRead = await getMigrationStepForUser({
      repository,
      userId: 'user-1',
    })
    const secondRead = await getMigrationStepForUser({
      repository,
      userId: 'user-1',
    })

    expect(firstRead.todos).toEqual(secondRead.todos)
    await expect(repository.getTodosByBucket(4)).resolves.toEqual([
      expect.objectContaining({ bucketId: 4, id: 12, position: 1024 }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: null,
      status: 'pending_migration',
    })
  })
})

describe('getMigrationStepForUser', () => {
  test('orders pending source Buckets daily, weekly, monthly, yearly and returns an aggregate flow recap', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const yearlyBucket = createBucket({ createdAt, id: 6, period: '2025', status: 'pending_migration', type: 'yearly' })
    const monthlyBucket = createBucket({
      createdAt,
      id: 7,
      period: '2026-06',
      status: 'pending_migration',
      type: 'monthly',
    })
    const weeklyBucket = createBucket({
      createdAt,
      id: 8,
      period: '2026-W27',
      status: 'pending_migration',
      type: 'weekly',
    })
    const dailyBucket = createBucket({
      createdAt,
      id: 9,
      period: '2026-07-03',
      status: 'pending_migration',
      type: 'daily',
    })
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026', type: 'yearly' }),
        createBucket({ createdAt, id: 3, period: '2026-07', type: 'monthly' }),
        createBucket({ createdAt, id: 4, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 5, period: '2026-07-06', type: 'daily' }),
        yearlyBucket,
        monthlyBucket,
        weeklyBucket,
        dailyBucket,
      ],
      todos: [
        createTodo({ bucketId: 6, completed: true, id: 60, title: 'Finished old year' }),
        createTodo({ bucketId: 6, completed: false, id: 61, title: 'Plan year again' }),
        createTodo({ bucketId: 7, completed: false, id: 70, title: 'Plan month again' }),
        createTodo({ bucketId: 8, completed: true, id: 80, title: 'Finished old week' }),
        createTodo({ bucketId: 8, completed: true, id: 81, title: 'Also finished old week' }),
        createTodo({ bucketId: 8, completed: false, id: 82, title: 'Plan week again' }),
        createTodo({ bucketId: 9, completed: false, id: 90, title: 'Plan day again' }),
        createTodo({ bucketId: 9, completed: false, id: 91, title: 'Also plan day again' }),
      ],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })

    const result = await getMigrationStepForUser({
      repository,
      userId: 'user-1',
    })

    expect(result.sourceBucket).toMatchObject({ id: 9, type: 'daily' })
    expect(result.pendingMigrationBuckets.map((bucket) => `${bucket.type}:${bucket.period}`)).toEqual([
      'daily:2026-07-03',
      'weekly:2026-W27',
      'monthly:2026-06',
      'yearly:2025',
    ])
    expect(result.flowRecap).toMatchObject({
      bucketBreakdown: [
        { bucket: expect.objectContaining({ id: 9 }), completedCount: 0, incompleteCount: 2 },
        { bucket: expect.objectContaining({ id: 8 }), completedCount: 2, incompleteCount: 1 },
        { bucket: expect.objectContaining({ id: 7 }), completedCount: 0, incompleteCount: 1 },
        { bucket: expect.objectContaining({ id: 6 }), completedCount: 1, incompleteCount: 1 },
      ],
      completedCount: 3,
      incompleteCount: 5,
    })
    expect(result.todos.map((todo) => todo.title)).toEqual(['Plan day again', 'Also plan day again'])
  })
})

type InMemoryBucket = {
  archivedAt: Date | null
  createdAt: Date
  id: number
  period: string
  status: 'active' | 'archived' | 'pending_migration'
  type: BucketType
  userId: string
}

function createInMemoryBoardRepository({
  buckets,
  todos = [],
  user,
}: {
  buckets: Array<InMemoryBucket>
  todos?: Array<TodoDbSelect>
  user: Partial<UserDb>
}): BoardRepository {
  let nextBucketId = buckets.length + 1
  const storedBuckets = [...buckets]
  const storedTodos = [...todos]
  const storedUser = createUser(user)

  return {
    archiveBucket(bucketId, archivedAt) {
      const bucket = storedBuckets.find((storedBucket) => storedBucket.id === bucketId)

      if (!bucket) {
        return Promise.resolve(undefined)
      }

      bucket.status = 'archived'
      bucket.archivedAt = archivedAt

      return Promise.resolve(bucket)
    },
    createBucket(input) {
      const existingBucket = storedBuckets.find(
        (bucket) => bucket.userId === input.userId && bucket.type === input.type && bucket.period === input.period,
      )

      if (existingBucket) {
        return Promise.resolve(existingBucket)
      }

      const bucket = {
        ...input,
        id: nextBucketId,
      }
      nextBucketId += 1
      storedBuckets.push(bucket)

      return Promise.resolve(bucket)
    },
    findBucketById(userId, bucketId) {
      return Promise.resolve(storedBuckets.find((bucket) => bucket.userId === userId && bucket.id === bucketId))
    },
    findBucketByUserTypeAndPeriod(userId, type, period) {
      return Promise.resolve(
        storedBuckets.find((bucket) => bucket.userId === userId && bucket.type === type && bucket.period === period),
      )
    },
    getActiveBuckets(userId) {
      return Promise.resolve(storedBuckets.filter((bucket) => bucket.userId === userId && bucket.status === 'active'))
    },
    getMaxTodoPosition(userId, bucketId) {
      const bucketTodos = storedTodos.filter((todo) => todo.userId === userId && todo.bucketId === bucketId)

      if (bucketTodos.length === 0) {
        return Promise.resolve(null)
      }

      return Promise.resolve(Math.max(...bucketTodos.map((todo) => todo.position)))
    },
    getPendingMigrationBuckets(userId) {
      return Promise.resolve(
        storedBuckets.filter((bucket) => bucket.userId === userId && bucket.status === 'pending_migration'),
      )
    },
    getTodosByBucket(bucketId) {
      return Promise.resolve(storedTodos.filter((todo) => todo.bucketId === bucketId))
    },
    getTodosByBucketWithDisplay(bucketId) {
      return Promise.resolve(
        storedTodos.filter((todo) => todo.bucketId === bucketId).map((todo) => ({ ...todo, category: null, tags: [] })),
      )
    },
    getUser(userId) {
      return Promise.resolve(storedUser.id === userId ? storedUser : undefined)
    },
    markBucketPendingMigration(bucketId) {
      const bucket = storedBuckets.find((storedBucket) => storedBucket.id === bucketId)

      if (!bucket) {
        return Promise.resolve(undefined)
      }

      bucket.status = 'pending_migration'
      bucket.archivedAt = null

      return Promise.resolve(bucket)
    },
    moveTodoForMigration(todoId, userId, move) {
      const todo = storedTodos.find(
        (storedTodo) =>
          storedTodo.id === todoId &&
          storedTodo.userId === userId &&
          storedTodo.bucketId === move.expectedSourceBucketId,
      )

      if (!todo) {
        return Promise.resolve(undefined)
      }

      todo.bucketId = move.bucketId
      todo.position = move.position

      return Promise.resolve(todo)
    },
    updateUserPlanning(userId, updates) {
      if (storedUser.id !== userId) {
        return Promise.resolve(undefined)
      }

      storedUser.planningDate = updates.planningDate
      storedUser.timeZone = updates.timeZone

      return Promise.resolve(storedUser)
    },
  }
}

function toBucketKey(bucket: Pick<InMemoryBucket, 'period' | 'type'>): string {
  return `${bucket.type}:${bucket.period}`
}

function createUser(overrides: Partial<UserDb>): UserDb {
  return {
    createdAt: new Date('2026-07-01T08:00:00.000Z'),
    email: 'user@example.com',
    emailVerified: true,
    id: 'user-1',
    image: null,
    name: 'User One',
    planningDate: null,
    timeZone: null,
    updatedAt: new Date('2026-07-01T08:00:00.000Z'),
    ...overrides,
  }
}

function createBucket({
  createdAt,
  id,
  period,
  status = 'active',
  type,
}: {
  createdAt: Date
  id: number
  period: string
  status?: InMemoryBucket['status']
  type: BucketType
}): InMemoryBucket {
  return {
    archivedAt: null,
    createdAt,
    id,
    period,
    status,
    type,
    userId: 'user-1',
  }
}

function createTodo({
  bucketId,
  completed,
  id,
  position = id * 1024,
  title,
}: {
  bucketId: number
  completed: boolean
  id: number
  position?: number
  title: string
}): TodoDbSelect {
  return {
    bucketId,
    categoryId: null,
    completed,
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    description: '',
    id,
    position,
    title,
    userId: 'user-1',
  }
}
