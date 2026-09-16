import { and, eq, max, sql } from 'drizzle-orm'

import type { Database } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets, todos } from '@/server/db/schema/schema'
import type { BoardRepository } from '@/server/functions/board.core'

export function createBoardRepository(db: Database): BoardRepository {
  return {
    async archiveBucket(bucketId, archivedAt) {
      const [bucket] = await db
        .update(buckets)
        .set({
          archivedAt,
          status: 'archived',
        })
        .where(eq(buckets.id, bucketId))
        .returning()

      return bucket
    },
    async commitInitialBoardState(state) {
      const bucketValues = sql.join(
        state.buckets.map((bucket) => sql`(${bucket.type}::bucket_type, ${bucket.period})`),
        sql`, `,
      )

      await db.execute(sql`
        WITH initial_state (user_id, time_zone, planning_date, created_at) AS (
          VALUES (${state.userId}, ${state.timeZone}, ${state.planningDate}::date, ${state.createdAt}::timestamptz)
        ),
        initialized_user AS (
          UPDATE users
          SET
            time_zone = COALESCE(users.time_zone, initial_state.time_zone),
            planning_date = initial_state.planning_date,
            updated_at = initial_state.created_at
          FROM initial_state
          WHERE
            users.id = initial_state.user_id
            AND users.planning_date IS NULL
            AND (users.time_zone IS NULL OR users.time_zone = initial_state.time_zone)
          RETURNING users.id
        ),
        provisionable_user AS (
          SELECT id FROM initialized_user
          UNION ALL
          SELECT users.id
          FROM users
          CROSS JOIN initial_state
          WHERE
            users.id = initial_state.user_id
            AND users.planning_date = initial_state.planning_date
            AND users.time_zone = initial_state.time_zone
            AND NOT EXISTS (SELECT 1 FROM initialized_user)
        )
        INSERT INTO buckets (period, type, status, created_at, archived_at, user_id)
        SELECT initial_bucket.period, initial_bucket.type, 'active', initial_state.created_at, NULL, provisionable_user.id
        FROM provisionable_user
        CROSS JOIN initial_state
        CROSS JOIN (VALUES ${bucketValues}) AS initial_bucket(type, period)
        ON CONFLICT (user_id, type, period) DO NOTHING
      `)
    },
    async createBucket(bucketToCreate) {
      const insertedBuckets = await db
        .insert(buckets)
        .values(bucketToCreate)
        .onConflictDoNothing({
          target: [buckets.userId, buckets.type, buckets.period],
        })
        .returning()

      if (insertedBuckets.length > 0) {
        return insertedBuckets[0]
      }

      const existingBucket = await db.query.buckets.findFirst({
        where: and(
          eq(buckets.userId, bucketToCreate.userId),
          eq(buckets.type, bucketToCreate.type),
          eq(buckets.period, bucketToCreate.period),
        ),
      })

      if (!existingBucket) {
        throw new Error('Bucket creation conflict could not be recovered')
      }

      return existingBucket
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
    getTodosByBucket(bucketId) {
      return db.select().from(todos).where(eq(todos.bucketId, bucketId))
    },
    async getTodosByBucketWithDisplay(bucketId) {
      const bucketTodos = await db.query.todos.findMany({
        where: eq(todos.bucketId, bucketId),
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
    getUser(userId) {
      return db.query.users.findFirst({
        where: eq(users.id, userId),
      })
    },
    async markBucketPendingMigration(bucketId) {
      const [bucket] = await db
        .update(buckets)
        .set({
          archivedAt: null,
          status: 'pending_migration',
        })
        .where(eq(buckets.id, bucketId))
        .returning()

      return bucket
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
    async updateUserPlanning(userId, updates) {
      const [user] = await db
        .update(users)
        .set({
          planningDate: updates.planningDate,
          timeZone: updates.timeZone,
        })
        .where(eq(users.id, userId))
        .returning()

      return user
    },
  }
}
