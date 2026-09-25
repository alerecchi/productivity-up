import { describe, expect, test } from 'vitest'

import {
  completeDayForUser,
  getBoardForUser,
  provisionInitialBoard,
  reconcileLifecycleForUser,
} from '@/server/functions/board/lifecycle'
import { getMigrationStepForUser } from '@/server/functions/board/operations'
import { createBucket, createInMemoryBoardRepository, createTodo, readOnly } from '@/test/in-memory-board-repository'

const BERLIN = 'Europe/Berlin'

function createCurrentBoard(planningDate = '2026-07-03') {
  return [
    createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
    createBucket({ id: 2, period: '2026', type: 'yearly' }),
    createBucket({ id: 3, period: '2026-07', type: 'monthly' }),
    createBucket({ id: 4, period: '2026-W27', type: 'weekly' }),
    createBucket({ id: 5, period: planningDate, type: 'daily' }),
  ]
}

describe('provisionInitialBoard', () => {
  test('commits the User Planning Date, User Timezone, and canonical active Buckets', async () => {
    const commits: Array<
      Parameters<Parameters<typeof provisionInitialBoard>[0]['repository']['commitInitialBoardState']>[0]
    > = []

    const result = await provisionInitialBoard({
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository: {
        commitInitialBoardState(state) {
          commits.push(state)
          return Promise.resolve()
        },
      },
      timeZone: 'Europe/Berlin',
      userId: 'user-1',
    })

    expect(result).toEqual({
      planningDate: '2026-07-03',
      timeZone: 'Europe/Berlin',
    })
    expect(commits).toEqual([
      {
        buckets: [
          { period: 'inbox', type: 'inbox' },
          { period: '2026', type: 'yearly' },
          { period: '2026-07', type: 'monthly' },
          { period: '2026-W27', type: 'weekly' },
          { period: '2026-07-03', type: 'daily' },
        ],
        createdAt: new Date('2026-07-03T21:30:00.000Z'),
        planningDate: '2026-07-03',
        timeZone: 'Europe/Berlin',
        userId: 'user-1',
      },
    ])
  })
})

describe('getBoardForUser', () => {
  test('asks for Lifecycle Reconciliation without writing when the Planning Date is behind today', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      todos: [createTodo({ bucketId: 5, completed: false, id: 1, title: 'Still open' })],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    const result = await getBoardForUser({
      now: () => new Date('2026-07-06T07:30:00.000Z'),
      repository: readOnly(repository),
      userId: 'user-1',
    })

    expect(result).toEqual({ status: 'reconciliation_required' })
  })

  test('asks for Lifecycle Reconciliation when the board was never initialized', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: { planningDate: null, timeZone: BERLIN },
    })

    await expect(
      getBoardForUser({ now: () => new Date('2026-07-03T08:00:00.000Z'), repository, userId: 'user-1' }),
    ).resolves.toEqual({ status: 'reconciliation_required' })
  })

  test('asks for reconciliation without writing when a current Bucket is missing', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard().filter((bucket) => bucket.type !== 'daily'),
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    await expect(
      getBoardForUser({
        now: () => new Date('2026-07-03T08:00:00.000Z'),
        repository: readOnly(repository),
        userId: 'user-1',
      }),
    ).resolves.toEqual({ status: 'reconciliation_required' })
  })

  test('asks for reconciliation without writing when the stored Timezone is missing', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard(),
      user: { planningDate: '2026-07-03', timeZone: null },
    })

    await expect(
      getBoardForUser({
        now: () => new Date('2026-07-03T08:00:00.000Z'),
        repository: readOnly(repository),
        userId: 'user-1',
      }),
    ).resolves.toEqual({ status: 'reconciliation_required' })
  })

  test('returns the current board, including a Future Bucket planned ahead', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-04'),
      user: { planningDate: '2026-07-04', timeZone: BERLIN },
    })

    const result = await getBoardForUser({
      now: () => new Date('2026-07-03T15:30:00.000Z'),
      repository: readOnly(repository),
      userId: 'user-1',
    })

    expect(result).toEqual({
      buckets: [
        { id: 1, period: 'inbox', type: 'inbox' },
        { id: 2, period: '2026', type: 'yearly' },
        { id: 3, period: '2026-07', type: 'monthly' },
        { id: 4, period: '2026-W27', type: 'weekly' },
        { id: 5, period: '2026-07-04', type: 'daily' },
      ],
      planningDate: '2026-07-04',
      status: 'ready',
      timeZone: BERLIN,
    })
  })

  test('gates the board while a Bucket is pending migration', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [
        ...createCurrentBoard('2026-07-06').map((bucket) =>
          bucket.type === 'weekly' ? { ...bucket, period: '2026-W28' } : bucket,
        ),
        createBucket({ id: 6, period: '2026-07-03', status: 'pending_migration', type: 'daily' }),
      ],
      user: { planningDate: '2026-07-06', timeZone: BERLIN },
    })

    const result = await getBoardForUser({
      now: () => new Date('2026-07-06T07:30:00.000Z'),
      repository: readOnly(repository),
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      pendingMigrationBuckets: [{ id: 6, period: '2026-07-03', type: 'daily' }],
      planningDate: '2026-07-06',
      status: 'migration_required',
    })
  })
})

describe('reconcileLifecycleForUser', () => {
  test('returns a 400 when no stored or supplied Timezone is available', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: { planningDate: null, timeZone: null },
    })

    await expect(
      reconcileLifecycleForUser({
        now: () => new Date('2026-07-03T08:00:00.000Z'),
        repository: readOnly(repository),
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('initializes a board with a supplied Timezone when both stored values are missing', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: { planningDate: null, timeZone: null },
    })

    const result = await reconcileLifecycleForUser({
      data: { timeZone: BERLIN },
      now: () => new Date('2026-07-03T08:00:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({ planningDate: '2026-07-03', status: 'ready', timeZone: BERLIN })
    expect(result.buckets).toHaveLength(5)
  })

  test('persists a supplied Timezone with an existing Planning Date', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard(),
      user: { planningDate: '2026-07-03', timeZone: null },
    })

    const result = await reconcileLifecycleForUser({
      data: { timeZone: BERLIN },
      now: () => new Date('2026-07-03T08:00:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({ planningDate: '2026-07-03', status: 'ready', timeZone: BERLIN })
    await expect(repository.readBoard('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-03',
      timeZone: BERLIN,
    })
  })

  test('uses the stored Timezone even when a different fallback is supplied', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard(),
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      data: { timeZone: 'Asia/Tokyo' },
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository: readOnly(repository),
      userId: 'user-1',
    })

    expect(result).toMatchObject({ planningDate: '2026-07-03', status: 'ready', timeZone: BERLIN })
  })

  test('concurrent fallback Timezones converge on the first stored value', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-02'),
      user: { planningDate: '2026-07-02', timeZone: null },
    })
    const now = () => new Date('2026-07-03T21:30:00.000Z')

    const results = await Promise.all([
      reconcileLifecycleForUser({ data: { timeZone: BERLIN }, now, repository, userId: 'user-1' }),
      reconcileLifecycleForUser({ data: { timeZone: 'Asia/Tokyo' }, now, repository, userId: 'user-1' }),
    ])

    expect(results[0]).toEqual(results[1])
    expect(results[0].timeZone).toBe(BERLIN)
    await expect(repository.readBoard('user-1')).resolves.toMatchObject({ timeZone: BERLIN })
  })

  test('repairs missing and archived Buckets for a current Planning Date in one guarded transition', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [
        ...createCurrentBoard().filter((bucket) => bucket.type !== 'inbox' && bucket.type !== 'daily'),
        createBucket({ id: 5, period: '2026-07-03', status: 'archived', type: 'daily' }),
      ],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      now: () => new Date('2026-07-03T08:00:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result.status).toBe('ready')
    expect(result.planningDate).toBe('2026-07-03')
    expect(result.buckets).toEqual(
      expect.arrayContaining([
        { id: 5, period: '2026-07-03', type: 'daily' },
        { id: 6, period: 'inbox', type: 'inbox' },
      ]),
    )
    await expect(repository.readBoard('user-1')).resolves.toMatchObject({
      planningDate: '2026-07-03',
      pendingMigrationBuckets: [],
    })
  })

  test('repairs a missing Future Bucket without changing the planned date', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-04').filter((bucket) => bucket.type !== 'daily'),
      user: { planningDate: '2026-07-04', timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      now: () => new Date('2026-07-03T08:00:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({ planningDate: '2026-07-04', status: 'ready' })
    expect(result.buckets).toContainEqual({ id: 5, period: '2026-07-04', type: 'daily' })
  })

  test('moves the Planning Date to today, retires past Buckets, and never backfills Skipped Periods', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      todos: [
        createTodo({ bucketId: 4, completed: true, id: 1, title: 'Closed weekly review' }),
        createTodo({ bucketId: 5, completed: false, id: 2, title: 'Carry this forward' }),
      ],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })
    const now = () => new Date('2026-07-06T07:30:00.000Z')

    const result = await reconcileLifecycleForUser({ now, repository, userId: 'user-1' })

    expect(result).toEqual({
      buckets: [
        { id: 1, period: 'inbox', type: 'inbox' },
        { id: 2, period: '2026', type: 'yearly' },
        { id: 3, period: '2026-07', type: 'monthly' },
        { id: 6, period: '2026-W28', type: 'weekly' },
        { id: 7, period: '2026-07-06', type: 'daily' },
      ],
      pendingMigrationBuckets: [{ id: 5, period: '2026-07-03', type: 'daily' }],
      planningDate: '2026-07-06',
      status: 'migration_required',
      timeZone: BERLIN,
    })
    await expect(getBoardForUser({ now, repository, userId: 'user-1' })).resolves.toEqual(result)
  })

  test('leaves a current board untouched, including a Future Bucket planned ahead', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-04'),
      user: { planningDate: '2026-07-04', timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      now: () => new Date('2026-07-03T15:30:00.000Z'),
      repository: readOnly(repository),
      userId: 'user-1',
    })

    expect(result).toMatchObject({ planningDate: '2026-07-04', status: 'ready' })
  })

  test('provisions an uninitialized board from the stored User Timezone', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [],
      user: { planningDate: null, timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      now: () => new Date('2026-07-03T21:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toEqual({
      buckets: [
        { id: 1, period: 'inbox', type: 'inbox' },
        { id: 2, period: '2026', type: 'yearly' },
        { id: 3, period: '2026-07', type: 'monthly' },
        { id: 4, period: '2026-W27', type: 'weekly' },
        { id: 5, period: '2026-07-03', type: 'daily' },
      ],
      planningDate: '2026-07-03',
      status: 'ready',
      timeZone: BERLIN,
    })
  })

  test('turns an expired Future Bucket into the Migration Step source after a gap', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-04'),
      todos: [createTodo({ bucketId: 5, completed: false, id: 1, title: 'Planned ahead Todo' })],
      user: { planningDate: '2026-07-04', timeZone: BERLIN },
    })

    await reconcileLifecycleForUser({ now: () => new Date('2026-07-06T07:30:00.000Z'), repository, userId: 'user-1' })

    await expect(getMigrationStepForUser({ repository, userId: 'user-1' })).resolves.toMatchObject({
      carryForwardDestination: expect.objectContaining({ period: '2026-07-06', type: 'daily' }),
      moveBackDestination: expect.objectContaining({ period: '2026-W28', type: 'weekly' }),
      sourceBucket: expect.objectContaining({ period: '2026-07-04', type: 'daily' }),
      todos: [expect.objectContaining({ id: 1, title: 'Planned ahead Todo' })],
    })
  })

  test('concurrent and repeated reconciliation converge on one board without duplicate Buckets', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      todos: [createTodo({ bucketId: 5, completed: false, id: 1, title: 'Carry this forward' })],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })
    const now = () => new Date('2026-07-06T07:30:00.000Z')

    const concurrentResults = await Promise.all([
      reconcileLifecycleForUser({ now, repository, userId: 'user-1' }),
      reconcileLifecycleForUser({ now, repository, userId: 'user-1' }),
    ])
    const repeatedResult = await reconcileLifecycleForUser({ now, repository: readOnly(repository), userId: 'user-1' })

    const expectedBoard = {
      buckets: [
        { id: 1, period: 'inbox', type: 'inbox' },
        { id: 2, period: '2026', type: 'yearly' },
        { id: 3, period: '2026-07', type: 'monthly' },
        { id: 6, period: '2026-W28', type: 'weekly' },
        { id: 7, period: '2026-07-06', type: 'daily' },
      ],
      pendingMigrationBuckets: [{ id: 5, period: '2026-07-03', type: 'daily' }],
      planningDate: '2026-07-06',
      status: 'migration_required',
      timeZone: BERLIN,
    }
    expect([...concurrentResults, repeatedResult]).toEqual([expectedBoard, expectedBoard, expectedBoard])
  })

  test('starts the next Planning Date at midnight in the stored User Timezone', async () => {
    const createRepository = () =>
      createInMemoryBoardRepository({
        buckets: createCurrentBoard('2026-07-05'),
        todos: [createTodo({ bucketId: 4, completed: true, id: 1, title: 'Wrap the week' })],
        user: { planningDate: '2026-07-05', timeZone: BERLIN },
      })

    await expect(
      reconcileLifecycleForUser({
        now: () => new Date('2026-07-05T21:59:59.999Z'),
        repository: createRepository(),
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ planningDate: '2026-07-05' })
    await expect(
      reconcileLifecycleForUser({
        now: () => new Date('2026-07-05T22:00:00.000Z'),
        repository: createRepository(),
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      buckets: expect.arrayContaining([{ id: 6, period: '2026-W28', type: 'weekly' }]),
      planningDate: '2026-07-06',
      status: 'ready',
    })
  })

  test('never retires the Inbox', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [createBucket({ id: 1, period: 'inbox', type: 'inbox' })],
      todos: [createTodo({ bucketId: 1, completed: false, id: 1, title: 'Keep in inbox' })],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    const result = await reconcileLifecycleForUser({
      now: () => new Date('2026-07-06T07:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      buckets: expect.arrayContaining([{ id: 1, period: 'inbox', type: 'inbox' }]),
      status: 'ready',
    })
  })
})

describe('completeDayForUser', () => {
  test('archives an all-done daily Bucket and plans tomorrow', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      todos: [
        createTodo({ bucketId: 5, completed: true, id: 1, title: 'Ship lifecycle slice' }),
        createTodo({ bucketId: 5, completed: true, id: 2, title: 'Tidy desk' }),
      ],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })
    const now = () => new Date('2026-07-03T15:30:00.000Z')

    const result = await completeDayForUser({ data: { planningDate: '2026-07-03' }, now, repository, userId: 'user-1' })

    expect(result).toEqual({
      buckets: [
        { id: 1, period: 'inbox', type: 'inbox' },
        { id: 2, period: '2026', type: 'yearly' },
        { id: 3, period: '2026-07', type: 'monthly' },
        { id: 4, period: '2026-W27', type: 'weekly' },
        { id: 6, period: '2026-07-04', type: 'daily' },
      ],
      planningDate: '2026-07-04',
      recap: { completedCount: 2, incompleteCount: 0, kind: 'all_complete' },
      status: 'completed',
      timeZone: BERLIN,
    })
    await expect(getBoardForUser({ now, repository, userId: 'user-1' })).resolves.toMatchObject({
      planningDate: '2026-07-04',
      status: 'ready',
    })
  })

  test('gates the board for migration and returns the Completion Recap when Todos are unfinished', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      todos: [
        createTodo({ bucketId: 5, completed: true, id: 1, title: 'Done today' }),
        createTodo({ bucketId: 5, completed: false, id: 2, title: 'Review tomorrow' }),
      ],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    const result = await completeDayForUser({
      data: { planningDate: '2026-07-03' },
      now: () => new Date('2026-07-03T15:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result).toMatchObject({
      migrationRecap: {
        bucketBreakdown: [
          { bucket: { id: 5, period: '2026-07-03', type: 'daily' }, completedCount: 1, incompleteCount: 1 },
        ],
        completedCount: 1,
        incompleteCount: 1,
      },
      pendingMigrationBuckets: [{ id: 5, period: '2026-07-03', type: 'daily' }],
      planningDate: '2026-07-04',
      status: 'migration_required',
    })
  })

  test.each([
    {
      case: 'the client shows an older Planning Date',
      planningDate: '2026-07-03',
      requested: '2026-07-02',
      now: '2026-07-03T15:30:00.000Z',
    },
    {
      case: 'the Planning Date is a Future Bucket',
      planningDate: '2026-07-04',
      requested: '2026-07-04',
      now: '2026-07-03T15:30:00.000Z',
    },
    {
      case: 'the board needs Lifecycle Reconciliation first',
      planningDate: '2026-07-03',
      requested: '2026-07-03',
      now: '2026-07-04T08:00:00.000Z',
    },
  ])('returns 409 without changes when $case', async ({ now, planningDate, requested }) => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard(planningDate),
      todos: [createTodo({ bucketId: 5, completed: true, id: 1, title: 'Done' })],
      user: { planningDate, timeZone: BERLIN },
    })

    await expect(
      completeDayForUser({ data: { planningDate: requested }, now: () => new Date(now), repository, userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    await expect(repository.readBoard('user-1')).resolves.toMatchObject({
      activeBuckets: createCurrentBoard(planningDate).map(({ id, period, type }) => ({ id, period, type })),
      planningDate,
    })
  })

  test('returns 409 without changes while a Bucket is pending migration', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [
        ...createCurrentBoard('2026-07-03'),
        createBucket({ id: 6, period: '2026-07-02', status: 'pending_migration', type: 'daily' }),
      ],
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })

    await expect(
      completeDayForUser({
        data: { planningDate: '2026-07-03' },
        now: () => new Date('2026-07-03T15:30:00.000Z'),
        repository,
        userId: 'user-1',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    await expect(repository.readBoard('user-1')).resolves.toMatchObject({ planningDate: '2026-07-03' })
  })

  test('completes a day once when two requests race and rejects the stale one with 409', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: createCurrentBoard('2026-07-03'),
      user: { planningDate: '2026-07-03', timeZone: BERLIN },
    })
    const request = () =>
      completeDayForUser({
        data: { planningDate: '2026-07-03' },
        now: () => new Date('2026-07-03T15:30:00.000Z'),
        repository,
        userId: 'user-1',
      })

    const results = await Promise.allSettled([request(), request()])

    expect(results).toEqual([
      { status: 'fulfilled', value: expect.objectContaining({ planningDate: '2026-07-04', status: 'completed' }) },
      { reason: expect.objectContaining({ code: 'CONFLICT', status: 409 }), status: 'rejected' },
    ])
  })

  test('retires every Bucket whose period ends when completion crosses a year boundary', async () => {
    const repository = createInMemoryBoardRepository({
      buckets: [
        createBucket({ id: 1, period: 'inbox', type: 'inbox' }),
        createBucket({ id: 2, period: '2026', type: 'yearly' }),
        createBucket({ id: 3, period: '2026-12', type: 'monthly' }),
        createBucket({ id: 4, period: '2026-W53', type: 'weekly' }),
        createBucket({ id: 5, period: '2026-12-31', type: 'daily' }),
      ],
      todos: [createTodo({ bucketId: 5, completed: true, id: 1, title: 'Finish the year' })],
      user: { planningDate: '2026-12-31', timeZone: BERLIN },
    })

    const result = await completeDayForUser({
      data: { planningDate: '2026-12-31' },
      now: () => new Date('2026-12-31T15:30:00.000Z'),
      repository,
      userId: 'user-1',
    })

    expect(result.buckets.map((bucket) => `${bucket.type}:${bucket.period}`)).toEqual([
      'inbox:inbox',
      'weekly:2026-W53',
      'yearly:2027',
      'monthly:2027-01',
      'daily:2027-01-01',
    ])
    expect(result).toMatchObject({ planningDate: '2027-01-01', status: 'completed' })
  })
})
