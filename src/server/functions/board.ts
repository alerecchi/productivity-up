import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/server/db/client'
import { users } from '@/server/db/schema/auth-schema'
import { buckets } from '@/server/db/schema/schema'
import { loadBoardForUser } from '@/server/functions/board.core'
import type { BoardRepository } from '@/server/functions/board.core'
import { authRequiredMiddleware } from '@/server/middlewares/auth-middleware'

const GetBoardInput = z
  .object({
    browserTimeZone: z.string().min(1).optional(),
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
  getUser(userId) {
    return db.query.users.findFirst({
      where: eq(users.id, userId),
    })
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
