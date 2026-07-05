import { describe, expect, test } from 'vitest'

import type { BucketType } from '@/lib/types/Bucket'
import type { UserDb } from '@/server/db/types'
import { loadBoardForUser } from '@/server/functions/board.core'
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
      now: () => new Date('2026-07-04T04:30:00.000Z'),
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
  user,
}: {
  buckets: Array<InMemoryBucket>
  user: Partial<UserDb>
}): BoardRepository {
  let nextBucketId = buckets.length + 1
  const storedBuckets = [...buckets]
  const storedUser = createUser(user)

  return {
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
