import { derivePeriodKeys, getEnabledBucketTypes, getPeriodBoundaries, getTodayLocalDate } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { BucketDb, TodoDbSelect, UserDb } from '@/server/db/types'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const

export type BoardRepository = {
  archiveBucket: (bucketId: number, archivedAt: Date) => Promise<BucketDb | undefined>
  createBucket: (bucket: Omit<BucketDb, 'id'>) => Promise<BucketDb>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
  getPendingMigrationBuckets: (userId: string) => Promise<Array<BucketDb>>
  getTodosByBucket: (bucketId: number) => Promise<Array<TodoDbSelect>>
  getUser: (userId: string) => Promise<UserDb | undefined>
  markBucketPendingMigration: (bucketId: number) => Promise<BucketDb | undefined>
  updateUserPlanning: (
    userId: string,
    updates: Pick<UserDb, 'planningDate' | 'timeZone'>,
  ) => Promise<UserDb | undefined>
}

export type ReadyBoardState = {
  buckets: Array<BucketDb>
  planningDate: string
  status: 'ready'
  timeZone: string
}

export type CompletedBoardState = Omit<ReadyBoardState, 'status'> & {
  recap: {
    completedCount: number
    incompleteCount: 0
    kind: 'all_complete'
  }
  status: 'completed'
}

export type MigrationRequiredBoardState = Omit<ReadyBoardState, 'status'> & {
  pendingMigrationBuckets: Array<BucketDb>
  status: 'migration_required'
}

type LoadBoardDependencies = {
  browserTimeZone?: string
  now?: () => Date
  repository: BoardRepository
  userId: string
}

export async function loadBoardForUser({
  browserTimeZone,
  now = () => new Date(),
  repository,
  userId,
}: LoadBoardDependencies): Promise<MigrationRequiredBoardState | ReadyBoardState> {
  const user = await repository.getUser(userId)

  if (!user) {
    throw new Error('User not found')
  }

  const timeZone = user.timeZone ?? browserTimeZone

  if (!timeZone) {
    throw new Error('Browser timezone is required for first board visit')
  }

  const today = getTodayLocalDate(now(), timeZone)
  const planningDate = normalizePlanningDate(user.planningDate, today)

  if (user.timeZone === null || user.planningDate !== planningDate) {
    await repository.updateUserPlanning(userId, {
      planningDate,
      timeZone,
    })
  }

  const createdAt = now()

  await ensureActiveBucketsForPlanningDate({ createdAt, planningDate, repository, userId })
  await reconcileExpiredBucketsForBoardLoad({
    archivedAt: createdAt,
    now: createdAt,
    repository,
    timeZone,
    userId,
  })

  const buckets = await repository.getActiveBuckets(userId)
  const pendingMigrationBuckets = await repository.getPendingMigrationBuckets(userId)

  if (pendingMigrationBuckets.length > 0) {
    return {
      buckets,
      pendingMigrationBuckets,
      planningDate,
      status: 'migration_required',
      timeZone,
    }
  }

  return {
    buckets,
    planningDate,
    status: 'ready',
    timeZone,
  }
}

type CompleteDayDependencies = {
  now?: () => Date
  repository: BoardRepository
  userId: string
}

export async function completeDayForUser({
  now = () => new Date(),
  repository,
  userId,
}: CompleteDayDependencies): Promise<CompletedBoardState> {
  const user = await repository.getUser(userId)

  if (!user) {
    throw new Error('User not found')
  }

  if (!user.timeZone || !user.planningDate) {
    throw new Error('Board lifecycle has not been initialized')
  }

  const pendingMigrationBuckets = await repository.getPendingMigrationBuckets(userId)

  if (pendingMigrationBuckets.length > 0) {
    throw new Error('Migration is required before completing this day')
  }

  const today = getTodayLocalDate(now(), user.timeZone)

  if (user.planningDate > today) {
    throw new Error('Cannot complete a future Bucket')
  }

  const periodKeys = derivePeriodKeys(user.planningDate)
  const dailyBucket = await repository.findBucketByUserTypeAndPeriod(userId, 'daily', periodKeys.daily)

  if (!dailyBucket || dailyBucket.status !== 'active') {
    throw new Error('Active daily Bucket not found')
  }

  const dailyTodos = await repository.getTodosByBucket(dailyBucket.id)
  const completedCount = dailyTodos.filter((todo) => todo.completed).length
  const incompleteCount = dailyTodos.length - completedCount

  if (incompleteCount > 0) {
    throw new Error('Cannot complete day while Todos are incomplete')
  }

  const completedAt = now()
  const nextPlanningDate = addDaysToDateKey(user.planningDate, 1)

  await assertStaleBucketsCanArchive({
    planningDate: nextPlanningDate,
    repository,
    userId,
  })
  await ensureActiveBucketsForPlanningDate({
    createdAt: completedAt,
    planningDate: nextPlanningDate,
    repository,
    userId,
  })
  await repository.updateUserPlanning(userId, {
    planningDate: nextPlanningDate,
    timeZone: user.timeZone,
  })
  await archiveStaleCompletedBuckets({
    archivedAt: completedAt,
    planningDate: nextPlanningDate,
    repository,
    userId,
  })

  const readyState = await loadBoardForUser({
    now,
    repository,
    userId,
  })

  if (readyState.status !== 'ready') {
    throw new Error('Migration is required before completing this day')
  }

  return {
    ...readyState,
    recap: {
      completedCount,
      incompleteCount: 0,
      kind: 'all_complete',
    },
    status: 'completed',
  }
}

async function reconcileExpiredBucketsForBoardLoad({
  archivedAt,
  now,
  repository,
  timeZone,
  userId,
}: {
  archivedAt: Date
  now: Date
  repository: BoardRepository
  timeZone: string
  userId: string
}) {
  const expiredBuckets = await getExpiredActiveBuckets({ now, repository, timeZone, userId })

  for (const bucket of expiredBuckets) {
    const todos = await repository.getTodosByBucket(bucket.id)
    const hasIncompleteTodos = todos.some((todo) => !todo.completed)

    if (hasIncompleteTodos) {
      await repository.markBucketPendingMigration(bucket.id)
      continue
    }

    await repository.archiveBucket(bucket.id, archivedAt)
  }
}

async function ensureActiveBucketsForPlanningDate({
  createdAt,
  planningDate,
  repository,
  userId,
}: {
  createdAt: Date
  planningDate: string
  repository: BoardRepository
  userId: string
}) {
  const periodKeys = derivePeriodKeys(planningDate)

  for (const type of getEnabledBucketTypes([...ENABLED_BUCKET_HORIZONS])) {
    const period = periodKeys[type]
    const existingBucket = await repository.findBucketByUserTypeAndPeriod(userId, type, period)

    if (!existingBucket) {
      await repository.createBucket({
        archivedAt: null,
        createdAt,
        period,
        status: 'active',
        type,
        userId,
      })
    }
  }
}

async function getExpiredActiveBuckets({
  now,
  repository,
  timeZone,
  userId,
}: {
  now: Date
  repository: BoardRepository
  timeZone: string
  userId: string
}) {
  const activeBuckets = await repository.getActiveBuckets(userId)

  return activeBuckets.filter((bucket) => {
    if (bucket.type === 'inbox') {
      return false
    }

    return getPeriodBoundaries({ periodKey: bucket.period, timeZone, type: bucket.type }).end <= now
  })
}

async function archiveStaleCompletedBuckets({
  archivedAt,
  planningDate,
  repository,
  userId,
}: {
  archivedAt: Date
  planningDate: string
  repository: BoardRepository
  userId: string
}) {
  const staleBuckets = await getStaleActiveBuckets({ planningDate, repository, userId })

  for (const bucket of staleBuckets) {
    const todos = await repository.getTodosByBucket(bucket.id)
    const hasIncompleteTodos = todos.some((todo) => !todo.completed)

    if (hasIncompleteTodos) {
      throw new Error('Migration is required before the board can be loaded')
    }

    await repository.archiveBucket(bucket.id, archivedAt)
  }
}

async function assertStaleBucketsCanArchive({
  planningDate,
  repository,
  userId,
}: {
  planningDate: string
  repository: BoardRepository
  userId: string
}) {
  const staleBuckets = await getStaleActiveBuckets({ planningDate, repository, userId })

  for (const bucket of staleBuckets) {
    const todos = await repository.getTodosByBucket(bucket.id)

    if (todos.some((todo) => !todo.completed)) {
      throw new Error('Migration is required before completing this day')
    }
  }
}

async function getStaleActiveBuckets({
  planningDate,
  repository,
  userId,
}: {
  planningDate: string
  repository: BoardRepository
  userId: string
}) {
  const periodKeys = derivePeriodKeys(planningDate)
  const activeBuckets = await repository.getActiveBuckets(userId)

  return activeBuckets.filter((bucket) => bucket.type !== 'inbox' && bucket.period !== periodKeys[bucket.type])
}

function normalizePlanningDate(planningDate: string | null, today: string): string {
  if (!planningDate || planningDate < today) {
    return today
  }

  return planningDate
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}
