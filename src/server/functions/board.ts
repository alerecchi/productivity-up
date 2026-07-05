import { createServerFn } from '@tanstack/react-start'
import { and, eq, max } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets, todos } from '@/server/db/schema/schema'
import {
  completeDayForUser,
  confirmMigrationStepForUser,
  getMigrationStepForUser,
  loadBoardForUser,
} from '@/server/functions/board.core'
import type { BoardRepository } from '@/server/functions/board.core'
import { authRequiredMiddleware } from '@/server/middlewares/auth-middleware'

const GetBoardInput = z
  .object({
    browserTimeZone: z.string().min(1).optional(),
  })
  .strict()

const ConfirmMigrationStepInput = z
  .object({
    decisions: z.record(z.coerce.number(), z.enum(['carry_forward', 'move_back'])),
    sourceBucketId: z.int(),
  })
  .strict()

const GetMigrationStepInput = z
  .object({
    sourceBucketId: z.int().optional(),
  })
  .strict()

export const getBoard = createServerFn()
  .middleware([authRequiredMiddleware])
  .inputValidator(GetBoardInput)
  .handler(async ({ data, context }) => {
    return loadBoardForUser({
      browserTimeZone: data.browserTimeZone,
      repository: boardRepository,
      userId: context.session.user.id,
    })
  })

export const completeDay = createServerFn()
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return completeDayForUser({
      repository: boardRepository,
      userId: context.session.user.id,
    })
  })

export const getMigrationStep = createServerFn()
  .middleware([authRequiredMiddleware])
  .inputValidator(GetMigrationStepInput)
  .handler(async ({ data, context }) => {
    return getMigrationStepForUser({
      data,
      repository: boardRepository,
      userId: context.session.user.id,
    })
  })

export const confirmMigrationStep = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(ConfirmMigrationStepInput)
  .handler(async ({ data, context }) => {
    return confirmMigrationStepForUser({
      data,
      repository: boardRepository,
      userId: context.session.user.id,
    })
  })

export const getBuckets = createServerFn()
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return db
      .select()
      .from(buckets)
      .where(and(eq(buckets.userId, context.session.user.id), eq(buckets.status, 'active')))
  })

// TODO: think if the parent folder should be called functions / fn / api / apis

const boardRepository: BoardRepository = {
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
    const bucketRows = await db
      .select()
      .from(buckets)
      .where(and(eq(buckets.userId, userId), eq(buckets.status, 'active')))

    return bucketRows
  },
  async getMaxTodoPosition(userId, bucketId) {
    const [row] = await db
      .select({ position: max(todos.position) })
      .from(todos)
      .where(and(eq(todos.userId, userId), eq(todos.bucketId, bucketId)))

    return row.position ?? null
  },
  async getPendingMigrationBuckets(userId) {
    const bucketRows = await db
      .select()
      .from(buckets)
      .where(and(eq(buckets.userId, userId), eq(buckets.status, 'pending_migration')))

    return bucketRows
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
