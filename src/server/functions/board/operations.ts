import { derivePeriodKeys } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { CategoryDisplay } from '@/lib/types/Category'
import type { TagDisplay } from '@/lib/types/Tag'
import { errorResponse } from '@/server/core/errors'
import type { BucketDb, TodoDbSelect, UserDb } from '@/server/db/types'
import { sortMigrationBuckets, toBoardState } from '@/server/functions/board/lifecycle'
import type { BoardBucket, BoardSnapshot, LifecycleRepository } from '@/server/functions/board/lifecycle'

const ENABLED_BUCKET_HORIZONS = ['yearly', 'monthly', 'weekly', 'daily'] as const
const TODO_POSITION_GAP = 1024

export type BoardRepository = LifecycleRepository & {
  /**
   * In one transaction: locks the User row, reads the {@link MigrationStepState}, and asks `plan` what to do. On
   * `commit` it applies every move and archives the source Bucket; otherwise it writes nothing. Returns the plan.
   */
  commitMigrationStep: (
    step: { at: Date; sourceBucketId: number; userId: string },
    plan: (state: MigrationStepState) => MigrationStepPlan,
  ) => Promise<MigrationStepPlan>
  findBucketByUserTypeAndPeriod: (userId: string, type: BucketType, period: string) => Promise<BucketDb | undefined>
  getActiveBuckets: (userId: string) => Promise<Array<BucketDb>>
  getPendingMigrationBuckets: (userId: string) => Promise<Array<BucketDb>>
  getTodosByBucket: (userId: string, bucketId: number) => Promise<Array<TodoDbSelect>>
  getTodosByBucketWithDisplay: (userId: string, bucketId: number) => Promise<Array<MigrationTodo>>
  getUser: (userId: string) => Promise<UserDb | undefined>
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

/** Authoritative Migration Step inputs, read inside the confirmation transaction after the User row is locked. */
export type MigrationStepState = {
  /** The User's active and pending Buckets, plus the requested source Bucket whatever its status, ordered by ID. */
  buckets: Array<Pick<BucketDb, 'id' | 'period' | 'status' | 'type'>>
  /** Highest Todo Position per active Bucket; absent for empty Buckets. */
  lastPositions: Map<number, number>
  planningDate: string | null
  /** IDs of incomplete Todos currently in the source Bucket, in board order. */
  sourceTodoIds: Array<number>
  timeZone: string | null
}

export type MigrationStepPlan =
  | {
      board: BoardSnapshot
      destinationBucketIds: Array<number>
      kind: 'commit'
      moves: Array<Pick<TodoDbSelect, 'bucketId' | 'id' | 'position'>>
    }
  | { kind: 'not_found' }
  | { kind: 'stale' }

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

/** Commits every Todo choice and the source Bucket's archive together, or fails without writing. */
export async function confirmMigrationStepForUser({
  data,
  now = () => new Date(),
  repository,
  userId,
}: ConfirmMigrationStepDependencies) {
  const plan = await repository.commitMigrationStep(
    { at: now(), sourceBucketId: data.sourceBucketId, userId },
    (state) => planMigrationStep(state, data),
  )

  if (plan.kind === 'not_found') {
    throw errorResponse(404, 'Pending Migration Bucket not found')
  }

  if (plan.kind === 'stale') {
    throw errorResponse(409, 'Migration Step conflict; refresh and retry')
  }

  return {
    board: toBoardState(plan.board),
    destinationBucketIds: plan.destinationBucketIds,
    sourceBucketId: data.sourceBucketId,
    status: 'confirmed' as const,
  }
}

/**
 * Decides a Migration Step against authoritative state. The decisions must cover exactly the source Bucket's current
 * incomplete Todos, which are appended to their destinations in board order.
 */
function planMigrationStep(state: MigrationStepState, data: ConfirmMigrationStepData): MigrationStepPlan {
  const { planningDate, timeZone } = state
  const sourceBucket = state.buckets.find((bucket) => bucket.id === data.sourceBucketId)

  if (!sourceBucket) {
    return { kind: 'not_found' }
  }

  if (sourceBucket.status !== 'pending_migration' || sourceBucket.type === 'inbox' || !planningDate || !timeZone) {
    return { kind: 'stale' }
  }

  // With equal counts, a decision for every current Todo means the decided set is exactly the current set.
  if (Object.keys(data.decisions).length !== state.sourceTodoIds.length) {
    return { kind: 'stale' }
  }

  const findActiveDestination = (decision: MigrationDecision) => {
    const { period, type } = getMigrationDestination(sourceBucket.type, decision, planningDate)

    return state.buckets.find(
      (bucket) => bucket.status === 'active' && bucket.type === type && bucket.period === period,
    )
  }
  const destinations = {
    carry_forward: findActiveDestination('carry_forward'),
    move_back: findActiveDestination('move_back'),
  }
  const lastPositions = new Map(state.lastPositions)
  const moves = []

  for (const todoId of state.sourceTodoIds) {
    const decision = data.decisions[todoId]
    const destination = decision && destinations[decision]

    if (!destination) {
      return { kind: 'stale' }
    }

    const position = (lastPositions.get(destination.id) ?? 0) + TODO_POSITION_GAP
    lastPositions.set(destination.id, position)
    moves.push({ bucketId: destination.id, id: todoId, position })
  }

  const toBoardBucket = ({ id, period, type }: BoardBucket): BoardBucket => ({ id, period, type })

  return {
    board: {
      activeBuckets: state.buckets.filter((bucket) => bucket.status === 'active').map(toBoardBucket),
      pendingMigrationBuckets: state.buckets
        .filter((bucket) => bucket.status === 'pending_migration' && bucket.id !== sourceBucket.id)
        .map(toBoardBucket),
      planningDate,
      timeZone,
    },
    destinationBucketIds: [...new Set(moves.map((move) => move.bucketId))].toSorted((a, b) => a - b),
    kind: 'commit',
    moves,
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
  const { period, type } = getMigrationDestination(sourceBucket.type, decision, planningDate)
  const bucket = await repository.findBucketByUserTypeAndPeriod(userId, type, period)

  if (!bucket || bucket.status !== 'active') {
    throw new Error('Active migration destination Bucket not found')
  }

  return bucket
}

/** The Bucket a decision sends a Todo to: the source's current period, or the nearest broader horizon. */
function getMigrationDestination(
  sourceType: BucketType,
  decision: MigrationDecision,
  planningDate: string,
): { period: string; type: BucketType } {
  const type = decision === 'carry_forward' ? sourceType : getNearestBroaderBucketType(sourceType)

  return { period: type === 'inbox' ? 'inbox' : derivePeriodKeys(planningDate)[type], type }
}

function getNearestBroaderBucketType(sourceType: BucketType): BucketType {
  const sourceIndex = ENABLED_BUCKET_HORIZONS.indexOf(sourceType as (typeof ENABLED_BUCKET_HORIZONS)[number])

  if (sourceIndex <= 0) {
    return 'inbox'
  }

  return ENABLED_BUCKET_HORIZONS[sourceIndex - 1]
}
