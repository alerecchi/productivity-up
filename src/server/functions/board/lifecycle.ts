import { derivePeriodKeys, getEnabledBucketTypes, getTodayLocalDate } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import { errorResponse } from '@/server/core/errors'
import type { BucketDb } from '@/server/db/types'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const

export type InitialBoardState = {
  buckets: Array<Pick<BucketDb, 'period' | 'type'>>
  createdAt: Date
  planningDate: string
  timeZone: string
  userId: string
}

export type InitialBoardRepository = {
  commitInitialBoardState: (state: InitialBoardState) => Promise<void>
}

export type BoardBucket = Pick<BucketDb, 'id' | 'period' | 'type'>

/** The User's lifecycle state as persisted: Planning Date, User Timezone, and board-visible Buckets. */
export type BoardSnapshot = {
  activeBuckets: Array<BoardBucket>
  pendingMigrationBuckets: Array<BoardBucket>
  planningDate: string | null
  timeZone: string | null
}

export type RetiredBucket = {
  bucket: BoardBucket
  completedCount: number
  incompleteCount: number
  status: 'archived' | 'pending_migration'
}

export type LifecycleTransition = {
  at: Date
  /** Complete Day only: this daily Bucket must still be active and no Pending Migration Bucket may exist. */
  completedDailyPeriod?: string
  currentPeriods: Record<BucketType, string>
  expectedPlanningDate: string
  expectedTimeZone: string | null
  nextPlanningDate: string
  timeZone: string
  userId: string
}

export type LifecycleRepository = InitialBoardRepository & {
  /**
   * Atomically moves the Planning Date from `expectedPlanningDate` to `nextPlanningDate`, creates missing Buckets for
   * `currentPeriods`, and retires every other active time-based Bucket. Returns `undefined` without writing when the
   * stored state no longer satisfies the guard.
   */
  commitLifecycleTransition: (
    transition: LifecycleTransition,
  ) => Promise<{ board: BoardSnapshot; retiredBuckets: Array<RetiredBucket> } | undefined>
  readBoard: (userId: string) => Promise<BoardSnapshot | undefined>
}

export type ReadyBoardState = {
  buckets: Array<BoardBucket>
  planningDate: string
  status: 'ready'
  timeZone: string
}

export type MigrationRequiredBoardState = Omit<ReadyBoardState, 'status'> & {
  pendingMigrationBuckets: Array<BoardBucket>
  status: 'migration_required'
}

export type BoardState = MigrationRequiredBoardState | ReadyBoardState

export type CompletedBoardState = Omit<ReadyBoardState, 'status'> & {
  recap: {
    completedCount: number
    incompleteCount: 0
    kind: 'all_complete'
  }
  status: 'completed'
}

export type MigrationFlowRecap = {
  bucketBreakdown: Array<Omit<RetiredBucket, 'status'>>
  completedCount: number
  incompleteCount: number
}

export type CompletedDayMigrationState = MigrationRequiredBoardState & {
  migrationRecap: MigrationFlowRecap
}

export type ReconciliationRequiredBoardState = {
  status: 'reconciliation_required'
}

type ProvisionInitialBoardDependencies = {
  now?: () => Date
  repository: InitialBoardRepository
  timeZone: string
  userId: string
}

type CompleteDayDependencies = {
  data: {
    planningDate: string
  }
  now?: () => Date
  repository: LifecycleRepository
  userId: string
}

type GetBoardDependencies = {
  now?: () => Date
  repository: Pick<LifecycleRepository, 'readBoard'>
  userId: string
}

type ReconcileLifecycleDependencies = {
  data?: {
    timeZone?: string
  }
  now?: () => Date
  repository: LifecycleRepository
  userId: string
}

/** Idempotently commits the initial Planning Date, User Timezone, Inbox, and current Buckets for a new User. */
export async function provisionInitialBoard({
  now = () => new Date(),
  repository,
  timeZone,
  userId,
}: ProvisionInitialBoardDependencies) {
  const createdAt = now()
  const planningDate = getTodayLocalDate(createdAt, timeZone)
  const periodKeys = derivePeriodKeys(planningDate)
  const buckets = getEnabledBucketTypes([...ENABLED_BUCKET_HORIZONS]).map((type) => ({
    period: periodKeys[type],
    type,
  }))

  await repository.commitInitialBoardState({
    buckets,
    createdAt,
    planningDate,
    timeZone,
    userId,
  })

  return { planningDate, timeZone }
}

/** Reads the canonical board without writing; asks the client to reconcile missing or stale lifecycle state. */
export async function getBoardForUser({
  now = () => new Date(),
  repository,
  userId,
}: GetBoardDependencies): Promise<BoardState | ReconciliationRequiredBoardState> {
  const snapshot = await requireSnapshot(repository, userId)

  if (
    !snapshot.planningDate ||
    !snapshot.timeZone ||
    snapshot.planningDate < getTodayLocalDate(now(), snapshot.timeZone) ||
    !hasCurrentBuckets(snapshot)
  ) {
    return { status: 'reconciliation_required' }
  }

  return toBoardState(snapshot)
}

/** Aligns the User's Buckets with today's Planning Date in the stored User Timezone, skipping any Skipped Periods. */
export async function reconcileLifecycleForUser({
  data,
  now = () => new Date(),
  repository,
  userId,
}: ReconcileLifecycleDependencies): Promise<BoardState> {
  const snapshot = await requireSnapshot(repository, userId)
  const { planningDate } = snapshot
  const timeZone = snapshot.timeZone ?? data?.timeZone

  if (!timeZone) {
    throw errorResponse(400, 'Timezone is required to reconcile this board')
  }

  const reconciledAt = now()

  if (!planningDate) {
    await provisionInitialBoard({ now: () => reconciledAt, repository, timeZone, userId })
    return toBoardState(await requireSnapshot(repository, userId))
  }

  const today = getTodayLocalDate(reconciledAt, timeZone)

  if (snapshot.timeZone && planningDate >= today && hasCurrentBuckets(snapshot)) {
    return toBoardState(snapshot)
  }

  const nextPlanningDate = planningDate >= today ? planningDate : today

  const result = await repository.commitLifecycleTransition({
    at: reconciledAt,
    currentPeriods: derivePeriodKeys(nextPlanningDate),
    expectedPlanningDate: planningDate,
    expectedTimeZone: snapshot.timeZone,
    nextPlanningDate,
    timeZone,
    userId,
  })

  // A concurrent lifecycle command already moved the Planning Date; its committed board is the canonical result.
  return toBoardState(result ? result.board : await requireSnapshot(repository, userId))
}

/** Completes the Planning Date the client showed and plans the next day. */
export async function completeDayForUser({
  data,
  now = () => new Date(),
  repository,
  userId,
}: CompleteDayDependencies): Promise<CompletedBoardState | CompletedDayMigrationState> {
  const snapshot = await requireSnapshot(repository, userId)
  const completedAt = now()

  if (!snapshot.planningDate || !snapshot.timeZone || snapshot.planningDate !== data.planningDate) {
    throw staleBoardConflict()
  }

  const today = getTodayLocalDate(completedAt, snapshot.timeZone)

  if (data.planningDate > today) {
    throw errorResponse(409, 'Cannot complete a future Bucket')
  }

  if (data.planningDate < today || snapshot.pendingMigrationBuckets.length > 0) {
    throw staleBoardConflict()
  }

  const nextPlanningDate = addDaysToDateKey(data.planningDate, 1)
  const result = await repository.commitLifecycleTransition({
    at: completedAt,
    completedDailyPeriod: data.planningDate,
    currentPeriods: derivePeriodKeys(nextPlanningDate),
    expectedPlanningDate: data.planningDate,
    expectedTimeZone: snapshot.timeZone,
    nextPlanningDate,
    timeZone: snapshot.timeZone,
    userId,
  })

  if (!result) {
    throw staleBoardConflict()
  }

  const board = toBoardState(result.board)

  if (board.status === 'migration_required') {
    const bucketBreakdown = result.retiredBuckets
      .filter((retired) => retired.status === 'pending_migration')
      .map(({ bucket, completedCount, incompleteCount }) => ({ bucket, completedCount, incompleteCount }))

    return {
      ...board,
      migrationRecap: {
        bucketBreakdown,
        completedCount: bucketBreakdown.reduce((total, row) => total + row.completedCount, 0),
        incompleteCount: bucketBreakdown.reduce((total, row) => total + row.incompleteCount, 0),
      },
    }
  }

  const completedDaily = result.retiredBuckets.find((retired) => retired.bucket.type === 'daily')

  return {
    buckets: board.buckets,
    planningDate: board.planningDate,
    recap: { completedCount: completedDaily?.completedCount ?? 0, incompleteCount: 0, kind: 'all_complete' },
    status: 'completed',
    timeZone: board.timeZone,
  }
}

/** Maps a reconciled snapshot to the canonical board state. */
function toBoardState(snapshot: BoardSnapshot): BoardState {
  if (!snapshot.planningDate || !snapshot.timeZone) {
    throw new Error('Board lifecycle has not been initialized')
  }

  const board = {
    buckets: snapshot.activeBuckets,
    planningDate: snapshot.planningDate,
    timeZone: snapshot.timeZone,
  }

  if (snapshot.pendingMigrationBuckets.length > 0) {
    return { ...board, pendingMigrationBuckets: snapshot.pendingMigrationBuckets, status: 'migration_required' }
  }

  return { ...board, status: 'ready' }
}

function hasCurrentBuckets(snapshot: BoardSnapshot): boolean {
  if (!snapshot.planningDate) {
    return false
  }

  const periods = derivePeriodKeys(snapshot.planningDate)
  return getEnabledBucketTypes([...ENABLED_BUCKET_HORIZONS]).every((type) =>
    snapshot.activeBuckets.some((bucket) => bucket.type === type && bucket.period === periods[type]),
  )
}

function staleBoardConflict() {
  return errorResponse(409, 'The board changed; refresh and try again')
}

async function requireSnapshot(repository: Pick<LifecycleRepository, 'readBoard'>, userId: string) {
  const snapshot = await repository.readBoard(userId)

  if (!snapshot) {
    throw new Error('User not found')
  }

  return snapshot
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
