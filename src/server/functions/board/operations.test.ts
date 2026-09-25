import { describe, expect, test } from 'vitest'

import { confirmMigrationStepForUser, getMigrationStepForUser } from '@/server/functions/board/operations'
import { createBucket, createInMemoryBoardRepository, createTodo } from '@/test/in-memory-board-repository'

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
    await expect(repository.getTodosByBucket('user-1', 4)).resolves.toEqual([
      expect.objectContaining({ id: 10, position: 1024 }),
      expect.objectContaining({ bucketId: 4, id: 12, position: 2048, title: 'Move back first' }),
    ])
    await expect(repository.getTodosByBucket('user-1', 5)).resolves.toEqual([
      expect.objectContaining({ id: 11, position: 1024 }),
      expect.objectContaining({ bucketId: 5, id: 14, position: 2048, title: 'Carry forward second' }),
    ])
    await expect(repository.getTodosByBucket('user-1', 6)).resolves.toEqual([
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
    ).rejects.toHaveProperty('status', 409)

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
    await expect(repository.getTodosByBucket('user-1', 4)).resolves.toEqual([
      expect.objectContaining({ bucketId: 4, id: 12, position: 1024 }),
    ])
    await expect(repository.getTodosByBucket('user-1', 5)).resolves.toEqual([
      expect.objectContaining({ bucketId: 5, id: 14, position: 1024 }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: confirmedAt,
      status: 'archived',
    })
  })

  test('rejects submitted Todos that are no longer incomplete in the expected source Bucket', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 3, period: '2026-07-06', type: 'daily' }),
        createBucket({ createdAt, id: 4, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      todos: [
        createTodo({ bucketId: 4, completed: true, id: 12, position: 1024, title: 'Completed in another tab' }),
        createTodo({ bucketId: 3, completed: false, id: 13, position: 1024, title: 'Moved in another tab' }),
        createTodo({ bucketId: 4, completed: false, id: 14, position: 2048, title: 'Still pending' }),
      ],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      confirmMigrationStepForUser({
        data: {
          decisions: {
            12: 'carry_forward',
            13: 'carry_forward',
            14: 'move_back',
          },
          sourceBucketId: 4,
        },
        repository,
        userId: 'user-1',
      }),
    ).rejects.toHaveProperty('status', 409)

    await expect(repository.getTodosByBucket('user-1', 2)).resolves.toEqual([])
    await expect(repository.getTodosByBucket('user-1', 3)).resolves.toEqual([
      expect.objectContaining({ bucketId: 3, id: 13, position: 1024 }),
    ])
    await expect(repository.getTodosByBucket('user-1', 4)).resolves.toEqual([
      expect.objectContaining({ bucketId: 4, completed: true, id: 12 }),
      expect.objectContaining({ bucketId: 4, completed: false, id: 14 }),
    ])
  })

  test('returns a refreshable conflict when another tab already resolved the source Bucket', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const archivedAt = new Date('2026-07-06T09:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026-W28', type: 'weekly' }),
        createBucket({ createdAt, id: 3, period: '2026-07-06', type: 'daily' }),
        createBucket({
          archivedAt,
          createdAt,
          id: 4,
          period: '2026-07-03',
          status: 'archived',
          type: 'daily',
        }),
      ],
      todos: [createTodo({ bucketId: 3, completed: false, id: 12, position: 1024, title: 'Already carried' })],
      user: {
        planningDate: '2026-07-06',
        timeZone: 'Europe/Berlin',
      },
    })

    await expect(
      confirmMigrationStepForUser({
        data: {
          decisions: {
            12: 'carry_forward',
          },
          sourceBucketId: 4,
        },
        repository,
        userId: 'user-1',
      }),
    ).rejects.toHaveProperty('status', 409)

    await expect(repository.getTodosByBucket('user-1', 3)).resolves.toEqual([
      expect.objectContaining({ bucketId: 3, id: 12, position: 1024 }),
    ])
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
    await expect(repository.getTodosByBucket('user-1', 1)).resolves.toEqual([
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
    await expect(repository.getTodosByBucket('user-1', 4)).resolves.toEqual([
      expect.objectContaining({ bucketId: 4, id: 12, position: 1024 }),
    ])
    await expect(repository.findBucketByUserTypeAndPeriod('user-1', 'daily', '2026-07-03')).resolves.toMatchObject({
      archivedAt: null,
      status: 'pending_migration',
    })
  })
})

describe('getMigrationStepForUser', () => {
  test('returns not found for a stale migration source', async () => {
    const createdAt = new Date('2026-07-03T08:00:00.000Z')
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ createdAt, id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ createdAt, id: 2, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      user: { planningDate: '2026-07-04', timeZone: 'Europe/Berlin' },
    })

    await expect(
      getMigrationStepForUser({ data: { sourceBucketId: 999 }, repository, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 })
  })

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
