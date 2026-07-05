import { derivePeriodKeys, getEnabledBucketTypes, getPeriodBoundaries, getTodayLocalDate } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import type { BucketDb, TodoDbSelect, UserDb } from '@/server/db/types'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const
const TODO_POSITION_GAP = 1024

export type BoardRepository = {
  archiveBucket: (bucketId: number, archivedAt: Date) => Promise<BucketDb | undefined>
  createBucket: (bucket: Omit<BucketDb, 'id'>) => Promise<BucketDb>
  findBucketById: (userId: string, bucketId: number) => Promise<BucketDb | undefined>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
  getMaxTodoPosition: (userId: string, bucketId: number) => Promise<number | null>
  getPendingMigrationBuckets: (userId: string) => Promise<Array<BucketDb>>
  getTodosByBucket: (bucketId: number) => Promise<Array<TodoDbSelect>>
  getTodosByBucketWithDisplay: (bucketId: number) => Promise<Array<MigrationTodo>>
  getUser: (userId: string) => Promise<UserDb | undefined>
  markBucketPendingMigration: (bucketId: number) => Promise<BucketDb | undefined>
  moveTodoForMigration: (
    todoId: number,
    userId: string,
    move: {
      bucketId: number
      expectedSourceBucketId: number
      position: number
    },
  ) => Promise<TodoDbSelect | undefined>
  updateUserPlanning: (
    userId: string,
    updates: Pick<UserDb, 'planningDate' | 'timeZone'>,
  ) => Promise<UserDb | undefined>
}

export type MigrationTodo = TodoDbSelect & {
  category: CategoryDisplay | null
  tags: Array<TagDisplay>
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

type MigrationDecision = 'carry_forward' | 'move_back'

export type ConfirmMigrationStepData = {
  decisions: Partial<Record<number, MigrationDecision>>
  sourceBucketId: number
}

type ConfirmMigrationStepDependencies = {
  data: ConfirmMigrationStepData
  now?: () => Date
  repository: BoardRepository
  userId: string
}

type GetMigrationStepDependencies = {
  data?: {
    sourceBucketId?: number
  }
  repository: BoardRepository
  userId: string
}

export async function completeDayForUser({
  now = () => new Date(),
  repository,
  userId,
}: CompleteDayDependencies): Promise<CompletedBoardState | MigrationRequiredBoardState> {
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

  const completedAt = now()
  const nextPlanningDate = addDaysToDateKey(user.planningDate, 1)

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
  await reconcileStaleBucketsAfterManualCompletion({
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

  if (readyState.status === 'migration_required') {
    return readyState
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

export async function confirmMigrationStepForUser({
  data,
  now = () => new Date(),
  repository,
  userId,
}: ConfirmMigrationStepDependencies) {
  const user = await repository.getUser(userId)

  if (!user) {
    throw new Error('User not found')
  }

  if (!user.timeZone || !user.planningDate) {
    throw new Error('Board lifecycle has not been initialized')
  }

  const sourceBucket = await repository.findBucketById(userId, data.sourceBucketId)

  if (!sourceBucket || sourceBucket.status !== 'pending_migration' || sourceBucket.type === 'inbox') {
    throw new Error('Pending Migration Bucket not found')
  }

  const sourceTodos = (await repository.getTodosByBucket(sourceBucket.id)).toSorted(
    (a, b) => a.position - b.position || a.id - b.id,
  )
  const incompleteTodos = sourceTodos.filter((todo) => !todo.completed)

  assertDecisionMapCoversIncompleteTodos(data.decisions, incompleteTodos)

  const migratedTodoPositions: Array<Pick<TodoDbSelect, 'bucketId' | 'id' | 'position'>> = []
  const nextPositionsByBucketId = new Map<number, number>()

  for (const todo of incompleteTodos) {
    const decision = data.decisions[todo.id]

    if (!decision) {
      throw new Error('Migration Step requires decisions for all current incomplete Todos')
    }

    const destinationBucket = await getMigrationDestinationBucket({
      decision,
      planningDate: user.planningDate,
      repository,
      sourceBucket,
      userId,
    })
    const currentMaxPosition =
      nextPositionsByBucketId.get(destinationBucket.id) ??
      (await repository.getMaxTodoPosition(userId, destinationBucket.id)) ??
      0
    const position = currentMaxPosition + TODO_POSITION_GAP
    nextPositionsByBucketId.set(destinationBucket.id, position)

    const movedTodo = await repository.moveTodoForMigration(todo.id, userId, {
      bucketId: destinationBucket.id,
      expectedSourceBucketId: sourceBucket.id,
      position,
    })

    if (!movedTodo) {
      throw new Error('Migration Step conflict; refresh and retry')
    }

    migratedTodoPositions.push({
      bucketId: movedTodo.bucketId,
      id: movedTodo.id,
      position: movedTodo.position,
    })
  }

  const remainingIncompleteTodos = (await repository.getTodosByBucket(sourceBucket.id)).filter(
    (todo) => !todo.completed,
  )

  if (remainingIncompleteTodos.length === 0) {
    await repository.archiveBucket(sourceBucket.id, now())
  }

  return {
    board: await loadBoardForUser({
      now,
      repository,
      userId,
    }),
    migratedTodoPositions,
    status: 'confirmed' as const,
  }
}

export async function getMigrationStepForUser({ data, repository, userId }: GetMigrationStepDependencies) {
  const user = await repository.getUser(userId)

  if (!user) {
    throw new Error('User not found')
  }

  if (!user.planningDate) {
    throw new Error('Board lifecycle has not been initialized')
  }

  const pendingMigrationBuckets = sortMigrationBuckets(await repository.getPendingMigrationBuckets(userId))
  const sourceBucket =
    data?.sourceBucketId === undefined
      ? pendingMigrationBuckets[0]
      : pendingMigrationBuckets.find((bucket) => bucket.id === data.sourceBucketId)

  if (!sourceBucket || sourceBucket.type === 'inbox') {
    throw new Error('Pending Migration Bucket not found')
  }

  const todos = (await repository.getTodosByBucketWithDisplay(sourceBucket.id)).toSorted(
    (a, b) => a.position - b.position || a.id - b.id,
  )
  const incompleteTodos = todos.filter((todo) => !todo.completed)
  const carryForwardDestination = await getMigrationDestinationBucket({
    decision: 'carry_forward',
    planningDate: user.planningDate,
    repository,
    sourceBucket,
    userId,
  })
  const moveBackDestination = await getMigrationDestinationBucket({
    decision: 'move_back',
    planningDate: user.planningDate,
    repository,
    sourceBucket,
    userId,
  })

  return {
    carryForwardDestination,
    completedCount: todos.length - incompleteTodos.length,
    incompleteCount: incompleteTodos.length,
    moveBackDestination,
    pendingMigrationBuckets,
    sourceBucket,
    todos: incompleteTodos,
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

function assertDecisionMapCoversIncompleteTodos(
  decisions: Partial<Record<number, MigrationDecision>>,
  incompleteTodos: Array<TodoDbSelect>,
) {
  if (incompleteTodos.some((todo) => decisions[todo.id] === undefined)) {
    throw new Error('Migration Step requires decisions for all current incomplete Todos')
  }
}

async function getMigrationDestinationBucket({
  decision,
  planningDate,
  repository,
  sourceBucket,
  userId,
}: {
  decision: MigrationDecision
  planningDate: string
  repository: BoardRepository
  sourceBucket: BucketDb
  userId: string
}) {
  const destinationType =
    decision === 'carry_forward' ? sourceBucket.type : getNearestBroaderBucketType(sourceBucket.type)
  const destinationPeriod = destinationType === 'inbox' ? 'inbox' : derivePeriodKeys(planningDate)[destinationType]
  const bucket = await repository.findBucketByUserTypeAndPeriod(userId, destinationType, destinationPeriod)

  if (!bucket || bucket.status !== 'active') {
    throw new Error('Active migration destination Bucket not found')
  }

  return bucket
}

function getNearestBroaderBucketType(sourceType: BucketType): BucketType {
  const sourceIndex = ENABLED_BUCKET_HORIZONS.indexOf(sourceType as (typeof ENABLED_BUCKET_HORIZONS)[number])

  if (sourceIndex <= 0) {
    return 'inbox'
  }

  return ENABLED_BUCKET_HORIZONS[sourceIndex - 1]
}

function sortMigrationBuckets(buckets: Array<BucketDb>) {
  const priority: Record<BucketType, number> = {
    daily: 0,
    inbox: 5,
    monthly: 2,
    weekly: 1,
    yearly: 3,
  }

  return buckets.toSorted((a, b) => priority[a.type] - priority[b.type] || a.id - b.id)
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

async function reconcileStaleBucketsAfterManualCompletion({
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
      await repository.markBucketPendingMigration(bucket.id)
      continue
    }

    await repository.archiveBucket(bucket.id, archivedAt)
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
