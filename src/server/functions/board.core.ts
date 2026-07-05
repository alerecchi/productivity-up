import { derivePeriodKeys, getEnabledBucketTypes, getTodayLocalDate } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { BucketDb, UserDb } from '@/server/db/types'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const

export type BoardRepository = {
  createBucket: (bucket: Omit<BucketDb, 'id'>) => Promise<BucketDb>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
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

  const planningDate = user.planningDate ?? getTodayLocalDate(now(), timeZone)

  if (user.timeZone === null || user.planningDate === null) {
    await repository.updateUserPlanning(userId, {
      planningDate,
      timeZone,
    })
  }

  const periodKeys = derivePeriodKeys(planningDate)
  const createdAt = now()

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

  return {
    buckets: await repository.getActiveBuckets(userId),
    planningDate,
    status: 'ready',
    timeZone,
  }
}
