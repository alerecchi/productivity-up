import { describe, expect, test } from 'vitest'

import type { BucketType } from '@/lib/types/Bucket'
import type { TodoDbSelect, UserDb } from '@/server/db/types'
import { completeDayForUser, loadBoardForUser } from '@/server/functions/board.core'
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
      const bucket = {
        ...input,
        id: nextBucketId,
      }
      nextBucketId += 1
      storedBuckets.push(bucket)

      return Promise.resolve(bucket)
    },
    findBucketByUserTypeAndPeriod(userId, type, period) {
      return Promise.resolve(
        storedBuckets.find((bucket) => bucket.userId === userId && bucket.type === type && bucket.period === period),
      )
    },
    getActiveBuckets(userId) {
      return Promise.resolve(storedBuckets.filter((bucket) => bucket.userId === userId && bucket.status === 'active'))
    },
    getTodosByBucket(bucketId) {
      return Promise.resolve(storedTodos.filter((todo) => todo.bucketId === bucketId))
    },
    getUser(userId) {
      return Promise.resolve(storedUser.id === userId ? storedUser : undefined)
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
  type,
}: {
  createdAt: Date
  id: number
  period: string
  type: BucketType
}): InMemoryBucket {
  return {
    archivedAt: null,
    createdAt,
    id,
    period,
    status: 'active',
    type,
    userId: 'user-1',
  }
}

function createTodo({
  bucketId,
  completed,
  id,
  title,
}: {
  bucketId: number
  completed: boolean
  id: number
  title: string
}): TodoDbSelect {
  return {
    bucketId,
    categoryId: null,
    completed,
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    description: '',
    id,
    position: id * 1024,
    title,
    userId: 'user-1',
  }
}
