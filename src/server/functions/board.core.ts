import { derivePeriodKeys, getEnabledBucketTypes, getTodayLocalDate } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { BucketDb, TodoDbSelect, UserDb } from '@/server/db/types'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const

export type BoardRepository = {
  archiveBucket: (bucketId: number, archivedAt: Date) => Promise<BucketDb | undefined>
  createBucket: (bucket: Omit<BucketDb, 'id'>) => Promise<BucketDb>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
  getTodosByBucket: (bucketId: number) => Promise<Array<TodoDbSelect>>
  getUser: (userId: string) => Promise<UserDb | undefined>
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
}: LoadBoardDependencies): Promise<ReadyBoardState> {
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

  await archiveStaleCompletedBuckets({ archivedAt: createdAt, planningDate, repository, userId })
  await ensureActiveBucketsForPlanningDate({ createdAt, planningDate, repository, userId })

  return {
    buckets: await repository.getActiveBuckets(userId),
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
