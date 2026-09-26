import { TIME_BASED_BUCKET_TYPES, getEnabledBucketTypes } from '@/lib/periods'
import type { BucketType } from '@/lib/types/Bucket'
import type { TodoDbSelect, UserDb } from '@/server/db/types'
import type { BoardSnapshot, LifecycleRepository, RetiredBucket } from '@/server/functions/board/lifecycle'
import type { BoardRepository } from '@/server/functions/board/operations'

export type InMemoryBucket = {
  archivedAt: Date | null
  createdAt: Date
  id: number
  period: string
  status: 'active' | 'archived' | 'pending_migration'
  type: BucketType
  userId: string
}

/** In-memory stand-in for the production board repository, modelling its guarded lifecycle and migration transactions. */
export function createInMemoryBoardRepository({
  buckets,
  todos = [],
  user,
}: {
  buckets: Array<InMemoryBucket>
  todos?: Array<TodoDbSelect>
  user: Partial<UserDb>
}): BoardRepository & LifecycleRepository {
  let nextBucketId = Math.max(0, ...buckets.map((bucket) => bucket.id)) + 1
  const storedBuckets = [...buckets]
  const storedTodos = [...todos]
  const storedUser = createUser(user)

  const readSnapshot = (): BoardSnapshot => {
    const userBuckets = storedBuckets
      .filter((bucket) => bucket.userId === storedUser.id)
      .toSorted((a, b) => a.id - b.id)
      .map(({ id, period, status, type }) => ({ id, period, status, type }))

    return {
      activeBuckets: userBuckets
        .filter((bucket) => bucket.status === 'active')
        .map(({ id, period, type }) => ({ id, period, type })),
      pendingMigrationBuckets: userBuckets
        .filter((bucket) => bucket.status === 'pending_migration')
        .map(({ id, period, type }) => ({ id, period, type })),
      planningDate: storedUser.planningDate,
      timeZone: storedUser.timeZone,
    }
  }

  return {
    commitInitialBoardState(state) {
      if (
        storedUser.id !== state.userId ||
        (storedUser.planningDate !== null && storedUser.planningDate !== state.planningDate) ||
        (storedUser.timeZone !== null && storedUser.timeZone !== state.timeZone)
      ) {
        return Promise.resolve()
      }

      storedUser.planningDate = state.planningDate
      storedUser.timeZone = state.timeZone

      for (const bucketToCreate of state.buckets) {
        const existingBucket = storedBuckets.find(
          (bucket) =>
            bucket.userId === state.userId &&
            bucket.type === bucketToCreate.type &&
            bucket.period === bucketToCreate.period,
        )

        if (!existingBucket) {
          storedBuckets.push({
            ...bucketToCreate,
            archivedAt: null,
            createdAt: state.createdAt,
            id: nextBucketId,
            status: 'active',
            userId: state.userId,
          })
          nextBucketId += 1
        }
      }

      return Promise.resolve()
    },
    commitLifecycleTransition(transition) {
      const userBuckets = storedBuckets.filter((bucket) => bucket.userId === transition.userId)
      const isGuardSatisfied =
        storedUser.id === transition.userId &&
        storedUser.planningDate === transition.expectedPlanningDate &&
        storedUser.timeZone === transition.expectedTimeZone &&
        (transition.completedDailyPeriod === undefined ||
          (userBuckets.some(
            (bucket) =>
              bucket.type === 'daily' &&
              bucket.period === transition.completedDailyPeriod &&
              bucket.status === 'active',
          ) &&
            !userBuckets.some((bucket) => bucket.status === 'pending_migration')))

      if (!isGuardSatisfied) {
        return Promise.resolve(undefined)
      }

      storedUser.planningDate = transition.nextPlanningDate
      storedUser.timeZone = transition.timeZone
      const retiredBuckets: Array<RetiredBucket> = []

      for (const bucket of userBuckets) {
        if (
          bucket.type === 'inbox' ||
          bucket.status !== 'active' ||
          bucket.period === transition.currentPeriods[bucket.type]
        ) {
          continue
        }

        const bucketTodos = storedTodos.filter((todo) => todo.userId === bucket.userId && todo.bucketId === bucket.id)
        const completedCount = bucketTodos.filter((todo) => todo.completed).length
        const incompleteCount = bucketTodos.length - completedCount

        bucket.status = incompleteCount > 0 ? 'pending_migration' : 'archived'
        bucket.archivedAt = incompleteCount > 0 ? null : transition.at
        retiredBuckets.push({
          bucket: { id: bucket.id, period: bucket.period, type: bucket.type },
          completedCount,
          incompleteCount,
          status: bucket.status,
        })
      }

      for (const type of getEnabledBucketTypes([...TIME_BASED_BUCKET_TYPES])) {
        const period = transition.currentPeriods[type]
        const existingBucket = userBuckets.find((bucket) => bucket.type === type && bucket.period === period)

        if (existingBucket) {
          existingBucket.status = 'active'
          existingBucket.archivedAt = null
        } else {
          storedBuckets.push({
            archivedAt: null,
            createdAt: transition.at,
            id: nextBucketId,
            period,
            status: 'active',
            type,
            userId: transition.userId,
          })
          nextBucketId += 1
        }
      }

      return Promise.resolve({ board: readSnapshot(), retiredBuckets })
    },
    commitMigrationStep(step, plan) {
      if (storedUser.id !== step.userId) {
        return Promise.reject(new Error('User not found'))
      }

      const userBuckets = storedBuckets
        .filter(
          (bucket) =>
            bucket.userId === step.userId && (bucket.status !== 'archived' || bucket.id === step.sourceBucketId),
        )
        .toSorted((a, b) => a.id - b.id)
      const userTodos = storedTodos.filter((todo) => todo.userId === step.userId)
      const lastPositions = new Map<number, number>()

      for (const todo of userTodos) {
        if (userBuckets.some((bucket) => bucket.id === todo.bucketId && bucket.status === 'active')) {
          lastPositions.set(todo.bucketId, Math.max(lastPositions.get(todo.bucketId) ?? todo.position, todo.position))
        }
      }

      const result = plan({
        buckets: userBuckets.map(({ id, period, status, type }) => ({ id, period, status, type })),
        lastPositions,
        planningDate: storedUser.planningDate,
        sourceTodoIds: userTodos
          .filter((todo) => todo.bucketId === step.sourceBucketId && !todo.completed)
          .toSorted((a, b) => a.position - b.position || a.id - b.id)
          .map((todo) => todo.id),
        timeZone: storedUser.timeZone,
      })

      if (result.kind === 'commit') {
        for (const move of result.moves) {
          const todo = userTodos.find((storedTodo) => storedTodo.id === move.id)

          if (todo) {
            todo.bucketId = move.bucketId
            todo.position = move.position
          }
        }

        const sourceBucket = userBuckets.find((bucket) => bucket.id === step.sourceBucketId)

        if (sourceBucket) {
          sourceBucket.status = 'archived'
          sourceBucket.archivedAt = step.at
        }
      }

      return Promise.resolve(result)
    },
    findBucketByUserTypeAndPeriod(userId, type, period) {
      return Promise.resolve(
        storedBuckets.find((bucket) => bucket.userId === userId && bucket.type === type && bucket.period === period),
      )
    },
    getActiveBuckets(userId) {
      return Promise.resolve(storedBuckets.filter((bucket) => bucket.userId === userId && bucket.status === 'active'))
    },
    getPendingMigrationBuckets(userId) {
      return Promise.resolve(
        storedBuckets.filter((bucket) => bucket.userId === userId && bucket.status === 'pending_migration'),
      )
    },
    getTodosByBucket(userId, bucketId) {
      return Promise.resolve(storedTodos.filter((todo) => todo.bucketId === bucketId && todo.userId === userId))
    },
    getTodosByBucketWithDisplay(userId, bucketId) {
      return Promise.resolve(
        storedTodos
          .filter((todo) => todo.bucketId === bucketId && todo.userId === userId)
          .map((todo) => ({ ...todo, category: null, tags: [] })),
      )
    },
    getUser(userId) {
      return Promise.resolve(storedUser.id === userId ? storedUser : undefined)
    },
    readBoard(userId) {
      return Promise.resolve(storedUser.id === userId ? readSnapshot() : undefined)
    },
  }
}

/** Wraps a repository so any durable write fails, proving that a caller only reads. */
export function readOnly<TRepository extends object>(repository: TRepository): TRepository {
  return new Proxy(repository, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target)

      if (typeof property === 'string' && /^(archive|commit|create|mark|move|update)/.test(property)) {
        return () => Promise.reject(new Error(`Unexpected durable write: ${property}`))
      }

      return value
    },
  })
}

export function createUser(overrides: Partial<UserDb>): UserDb {
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

export function createBucket({
  archivedAt = null,
  createdAt = new Date('2026-07-03T08:00:00.000Z'),
  id,
  period,
  status = 'active',
  type,
}: {
  archivedAt?: Date | null
  createdAt?: Date
  id: number
  period: string
  status?: InMemoryBucket['status']
  type: BucketType
}): InMemoryBucket {
  return {
    archivedAt,
    createdAt,
    id,
    period,
    status,
    type,
    userId: 'user-1',
  }
}

export function createTodo({
  bucketId,
  completed,
  id,
  position = id * 1024,
  title,
}: {
  bucketId: number
  completed: boolean
  id: number
  position?: number
  title: string
}): TodoDbSelect {
  return {
    bucketId,
    categoryId: null,
    completed,
    createdAt: new Date('2026-07-03T09:00:00.000Z'),
    description: '',
    id,
    position,
    title,
    userId: 'user-1',
  }
}
