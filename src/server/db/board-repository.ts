import { and, asc, count, eq, inArray, isNull, max, ne, or } from 'drizzle-orm'
import { TransactionRollbackError } from 'drizzle-orm/errors'

import { TIME_BASED_BUCKET_TYPES, getEnabledBucketTypes } from '@/lib/periods'
import type { Database } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets, todos } from '@/server/db/schema/schema'
import type { BoardBucket, BoardSnapshot, RetiredBucket } from '@/server/functions/board/lifecycle'
import type { BoardRepository } from '@/server/functions/board/operations'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export function createBoardRepository(db: Database): BoardRepository {
  return {
    async archiveBucket(userId, bucketId, archivedAt) {
      const [bucket] = await db
        .update(buckets)
        .set({
          archivedAt,
          status: 'archived',
        })
        .where(and(eq(buckets.id, bucketId), eq(buckets.userId, userId)))
        .returning()

      return bucket
    },
    async commitInitialBoardState(state) {
      await db.transaction(async (tx) => {
        const user = (
          await tx
            .select({ planningDate: users.planningDate, timeZone: users.timeZone })
            .from(users)
            .where(eq(users.id, state.userId))
            .for('update')
        ).at(0)

        if (!user || (user.timeZone !== null && user.timeZone !== state.timeZone)) {
          return
        }

        if (user.planningDate === null) {
          await tx
            .update(users)
            .set({ planningDate: state.planningDate, timeZone: state.timeZone, updatedAt: state.createdAt })
            .where(eq(users.id, state.userId))
        } else if (user.planningDate !== state.planningDate) {
          return
        } else if (user.timeZone === null) {
          await tx
            .update(users)
            .set({ timeZone: state.timeZone, updatedAt: state.createdAt })
            .where(eq(users.id, state.userId))
        }

        // A retry with the same initial state recreates only the Buckets a previous attempt did not commit.
        await tx
          .insert(buckets)
          .values(
            state.buckets.map((bucket) => ({
              ...bucket,
              archivedAt: null,
              createdAt: state.createdAt,
              status: 'active' as const,
              userId: state.userId,
            })),
          )
          .onConflictDoNothing({ target: [buckets.userId, buckets.type, buckets.period] })
      })
    },
    async commitLifecycleTransition(transition) {
      const { at, currentPeriods, userId } = transition

      try {
        return await db.transaction(async (tx) => {
          // Guarding the User row first serializes concurrent lifecycle commands for the same User.
          const guardedUsers = await tx
            .update(users)
            .set({ planningDate: transition.nextPlanningDate, timeZone: transition.timeZone, updatedAt: at })
            .where(
              and(
                eq(users.id, userId),
                eq(users.planningDate, transition.expectedPlanningDate),
                transition.expectedTimeZone === null
                  ? isNull(users.timeZone)
                  : eq(users.timeZone, transition.expectedTimeZone),
              ),
            )
            .returning({ id: users.id })

          if (guardedUsers.length === 0) {
            tx.rollback()
          }

          if (transition.completedDailyPeriod !== undefined) {
            const guardBuckets = await tx
              .select({ period: buckets.period, status: buckets.status, type: buckets.type })
              .from(buckets)
              .where(
                and(
                  eq(buckets.userId, userId),
                  or(
                    eq(buckets.status, 'pending_migration'),
                    and(eq(buckets.type, 'daily'), eq(buckets.period, transition.completedDailyPeriod)),
                  ),
                ),
              )
            const canCompleteDay =
              guardBuckets.some((bucket) => bucket.type === 'daily' && bucket.status === 'active') &&
              !guardBuckets.some((bucket) => bucket.status === 'pending_migration')

            if (!canCompleteDay) {
              tx.rollback()
            }
          }

          // Locking stale Buckets before counting their Todos makes the counts include every committed Todo.
          const staleBuckets = await tx
            .select({ id: buckets.id, period: buckets.period, type: buckets.type })
            .from(buckets)
            .where(
              and(
                eq(buckets.userId, userId),
                eq(buckets.status, 'active'),
                or(
                  ...TIME_BASED_BUCKET_TYPES.map((type) =>
                    and(eq(buckets.type, type), ne(buckets.period, currentPeriods[type])),
                  ),
                ),
              ),
            )
            .orderBy(asc(buckets.id))
            .for('update')
          const retiredBuckets = await retireBuckets(tx, { at, staleBuckets, userId })

          await tx
            .insert(buckets)
            .values(
              getEnabledBucketTypes([...TIME_BASED_BUCKET_TYPES]).map((type) => ({
                archivedAt: null,
                createdAt: at,
                period: currentPeriods[type],
                status: 'active' as const,
                type,
                userId,
              })),
            )
            .onConflictDoUpdate({
              target: [buckets.userId, buckets.type, buckets.period],
              set: { archivedAt: null, status: 'active' },
            })

          const board = await readBoardSnapshot(tx, userId)

          if (!board) {
            throw new Error('User not found')
          }

          return { board, retiredBuckets }
        })
      } catch (error) {
        if (error instanceof TransactionRollbackError) {
          return undefined
        }

        throw error
      }
    },
    findBucketById(userId, bucketId) {
      return db.query.buckets.findFirst({
        where: and(eq(buckets.id, bucketId), eq(buckets.userId, userId)),
      })
    },
    findBucketByUserTypeAndPeriod(userId, type, period) {
      return db.query.buckets.findFirst({
        where: and(eq(buckets.userId, userId), eq(buckets.type, type), eq(buckets.period, period)),
      })
    },
    async getActiveBuckets(userId) {
      return db
        .select()
        .from(buckets)
        .where(and(eq(buckets.userId, userId), eq(buckets.status, 'active')))
    },
    async getMaxTodoPosition(userId, bucketId) {
      const [row] = await db
        .select({ position: max(todos.position) })
        .from(todos)
        .where(and(eq(todos.userId, userId), eq(todos.bucketId, bucketId)))

      return row.position ?? null
    },
    async getPendingMigrationBuckets(userId) {
      return db
        .select()
        .from(buckets)
        .where(and(eq(buckets.userId, userId), eq(buckets.status, 'pending_migration')))
    },
    getTodosByBucket(userId, bucketId) {
      return db
        .select()
        .from(todos)
        .where(and(eq(todos.bucketId, bucketId), eq(todos.userId, userId)))
    },
    async getTodosByBucketWithDisplay(userId, bucketId) {
      const bucketTodos = await db.query.todos.findMany({
        where: and(eq(todos.bucketId, bucketId), eq(todos.userId, userId)),
        with: {
          category: {
            columns: {
              colorKey: true,
              id: true,
              name: true,
            },
          },
          todoTags: {
            with: {
              tag: {
                columns: {
                  colorKey: true,
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })

      return bucketTodos.map((todo) => ({
        ...todo,
        tags: todo.todoTags.map(({ tag }) => tag),
      }))
    },
    readBoard(userId) {
      return readBoardSnapshot(db, userId)
    },
    getUser(userId) {
      return db.query.users.findFirst({
        where: eq(users.id, userId),
      })
    },
    async moveTodoForMigration(todoId, userId, move) {
      const [todo] = await db
        .update(todos)
        .set({
          bucketId: move.bucketId,
          position: move.position,
        })
        .where(and(eq(todos.id, todoId), eq(todos.userId, userId), eq(todos.bucketId, move.expectedSourceBucketId)))
        .returning()

      return todo
    },
  }
}

async function readBoardSnapshot(
  executor: Pick<Database, 'select'>,
  userId: string,
): Promise<BoardSnapshot | undefined> {
  const rows = await executor
    .select({
      bucket: { id: buckets.id, period: buckets.period, status: buckets.status, type: buckets.type },
      planningDate: users.planningDate,
      timeZone: users.timeZone,
    })
    .from(users)
    .leftJoin(buckets, and(eq(buckets.userId, users.id), inArray(buckets.status, ['active', 'pending_migration'])))
    .where(eq(users.id, userId))
    .orderBy(asc(buckets.id))
  const user = rows.at(0)

  if (!user) {
    return undefined
  }

  const boardBuckets = rows.flatMap(({ bucket }) => (bucket ? [bucket] : []))
  const toBoardBucket = ({ id, period, type }: BoardBucket): BoardBucket => ({ id, period, type })

  return {
    activeBuckets: boardBuckets.filter((bucket) => bucket.status === 'active').map(toBoardBucket),
    pendingMigrationBuckets: boardBuckets.filter((bucket) => bucket.status === 'pending_migration').map(toBoardBucket),
    planningDate: user.planningDate,
    timeZone: user.timeZone,
  }
}

/** Retires locked stale Buckets: those with an incomplete Todo await migration, the rest are archived. */
async function retireBuckets(
  tx: Transaction,
  { at, staleBuckets, userId }: { at: Date; staleBuckets: Array<BoardBucket>; userId: string },
): Promise<Array<RetiredBucket>> {
  if (staleBuckets.length === 0) {
    return []
  }

  const todoCounts = await tx
    .select({ bucketId: todos.bucketId, completed: todos.completed, todoCount: count() })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        inArray(
          todos.bucketId,
          staleBuckets.map((bucket) => bucket.id),
        ),
      ),
    )
    .groupBy(todos.bucketId, todos.completed)
  const countTodos = (bucketId: number, completed: boolean) =>
    todoCounts.find((row) => row.bucketId === bucketId && row.completed === completed)?.todoCount ?? 0
  const retiredBuckets = staleBuckets.map((bucket) => {
    const incompleteCount = countTodos(bucket.id, false)

    return {
      bucket,
      completedCount: countTodos(bucket.id, true),
      incompleteCount,
      status: incompleteCount > 0 ? ('pending_migration' as const) : ('archived' as const),
    }
  })
  const idsWithStatus = (status: RetiredBucket['status']) =>
    retiredBuckets.filter((retired) => retired.status === status).map((retired) => retired.bucket.id)
  const pendingMigrationIds = idsWithStatus('pending_migration')
  const archivedIds = idsWithStatus('archived')

  if (pendingMigrationIds.length > 0) {
    await tx
      .update(buckets)
      .set({ archivedAt: null, status: 'pending_migration' })
      .where(and(eq(buckets.userId, userId), inArray(buckets.id, pendingMigrationIds)))
  }

  if (archivedIds.length > 0) {
    await tx
      .update(buckets)
      .set({ archivedAt: at, status: 'archived' })
      .where(and(eq(buckets.userId, userId), inArray(buckets.id, archivedIds)))
  }

  return retiredBuckets
}
