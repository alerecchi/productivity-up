import { derivePeriodKeys } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import { errorResponse } from '@/server/core/errors'
import type { BucketDb, TodoDbSelect, UserDb } from '@/server/db/types'
import { getBoardForUser } from '@/server/functions/board/lifecycle'
import type { LifecycleRepository } from '@/server/functions/board/lifecycle'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const
const TODO_POSITION_GAP = 1024

export type BoardRepository = LifecycleRepository & {
  archiveBucket: (userId: string, bucketId: number, archivedAt: Date) => Promise<BucketDb | undefined>
  findBucketById: (userId: string, bucketId: number) => Promise<BucketDb | undefined>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
  getMaxTodoPosition: (userId: string, bucketId: number) => Promise<number | null>
  getPendingMigrationBuckets: (userId: string) => Promise<Array<BucketDb>>
  getTodosByBucket: (userId: string, bucketId: number) => Promise<Array<TodoDbSelect>>
  getTodosByBucketWithDisplay: (userId: string, bucketId: number) => Promise<Array<MigrationTodo>>
  getUser: (userId: string) => Promise<UserDb | undefined>
  moveTodoForMigration: (
    todoId: number,
    userId: string,
    move: {
      bucketId: number
      expectedSourceBucketId: number
      position: number
    },
  ) => Promise<TodoDbSelect | undefined>
}

export type MigrationTodo = TodoDbSelect & {
  category: CategoryDisplay | null
  tags: Array<TagDisplay>
}

export type MigrationFlowRecap = {
  bucketBreakdown: Array<{
    bucket: BucketDb
    completedCount: number
    incompleteCount: number
  }>
  completedCount: number
  incompleteCount: number
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

  if (!sourceBucket) {
    throw errorResponse(404, 'Pending Migration Bucket not found')
  }

  if (sourceBucket.status !== 'pending_migration' || sourceBucket.type === 'inbox') {
    throw errorResponse(409, 'Migration Step conflict; refresh and retry')
  }

  const sourceTodos = (await repository.getTodosByBucket(userId, sourceBucket.id)).toSorted(
    (a, b) => a.position - b.position || a.id - b.id,
  )
  const incompleteTodos = sourceTodos.filter((todo) => !todo.completed)

  await assertDecisionMapMatchesMigrationState({
    decisions: data.decisions,
    incompleteTodos,
    planningDate: user.planningDate,
    repository,
    sourceBucket,
    userId,
  })

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
      throw errorResponse(409, 'Migration Step conflict; refresh and retry')
    }

    migratedTodoPositions.push({
      bucketId: movedTodo.bucketId,
      id: movedTodo.id,
      position: movedTodo.position,
    })
  }

  const remainingIncompleteTodos = (await repository.getTodosByBucket(userId, sourceBucket.id)).filter(
    (todo) => !todo.completed,
  )

  if (remainingIncompleteTodos.length === 0) {
    await repository.archiveBucket(userId, sourceBucket.id, now())
  }

  return {
    board: await getBoardForUser({
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
    throw errorResponse(404, 'Pending Migration Bucket not found')
  }

  const todos = (await repository.getTodosByBucketWithDisplay(userId, sourceBucket.id)).toSorted(
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
    flowRecap: await getMigrationFlowRecap({ pendingMigrationBuckets, repository, userId }),
    incompleteCount: incompleteTodos.length,
    moveBackDestination,
    pendingMigrationBuckets,
    sourceBucket,
    todos: incompleteTodos,
  }
}

async function getMigrationFlowRecap({
  pendingMigrationBuckets,
  repository,
  userId,
}: {
  pendingMigrationBuckets: Array<BucketDb>
  repository: BoardRepository
  userId: string
}): Promise<MigrationFlowRecap> {
  const bucketBreakdown = []

  for (const bucket of pendingMigrationBuckets) {
    const todos = await repository.getTodosByBucket(userId, bucket.id)
    const completedCount = todos.filter((todo) => todo.completed).length
    const incompleteCount = todos.length - completedCount

    bucketBreakdown.push({
      bucket,
      completedCount,
      incompleteCount,
    })
  }

  return {
    bucketBreakdown,
    completedCount: bucketBreakdown.reduce((total, row) => total + row.completedCount, 0),
    incompleteCount: bucketBreakdown.reduce((total, row) => total + row.incompleteCount, 0),
  }
}

async function assertDecisionMapMatchesMigrationState({
  decisions,
  incompleteTodos,
  planningDate,
  repository,
  sourceBucket,
  userId,
}: {
  decisions: Partial<Record<number, MigrationDecision>>
  incompleteTodos: Array<TodoDbSelect>
  planningDate: string
  repository: BoardRepository
  sourceBucket: BucketDb
  userId: string
}) {
  const incompleteTodoIds = new Set(incompleteTodos.map((todo) => todo.id))
  const submittedTodoIds = Object.keys(decisions).map(Number)
  const hasMissingDecision = incompleteTodos.some((todo) => decisions[todo.id] === undefined)

  if (hasMissingDecision) {
    throw errorResponse(409, 'Migration Step requires decisions for all current incomplete Todos')
  }

  for (const todoId of submittedTodoIds) {
    if (incompleteTodoIds.has(todoId)) {
      continue
    }

    const decision = decisions[todoId]

    if (!decision) {
      throw errorResponse(409, 'Migration Step conflict; refresh and retry')
    }

    const destinationBucket = await getMigrationDestinationBucket({
      decision,
      planningDate,
      repository,
      sourceBucket,
      userId,
    })
    const destinationTodos = await repository.getTodosByBucket(userId, destinationBucket.id)
    const alreadyAppliedTodo = destinationTodos.find((todo) => todo.id === todoId && !todo.completed)

    if (!alreadyAppliedTodo) {
      throw errorResponse(409, 'Migration Step conflict; refresh and retry')
    }
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
