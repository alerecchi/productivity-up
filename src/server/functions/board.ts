import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { buckets } from '@/server/db/schema/schema'
import {
  completeDayForUser,
  confirmMigrationStepForUser,
  getMigrationStepForUser,
  loadBoardForUser,
} from '@/server/functions/board.core'
import { createBoardRepository } from '@/server/functions/board.repository'
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
      repository: createBoardRepository(context.db),
      userId: context.session.user.id,
    })
  })

export const completeDay = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return completeDayForUser({
      repository: createBoardRepository(context.db),
      userId: context.session.user.id,
    })
  })

export const getMigrationStep = createServerFn()
  .middleware([authRequiredMiddleware])
  .inputValidator(GetMigrationStepInput)
  .handler(async ({ data, context }) => {
    return getMigrationStepForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.session.user.id,
    })
  })

export const confirmMigrationStep = createServerFn({ method: 'POST' })
  .middleware([authRequiredMiddleware])
  .inputValidator(ConfirmMigrationStepInput)
  .handler(async ({ data, context }) => {
    return confirmMigrationStepForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.session.user.id,
    })
  })

export const getBuckets = createServerFn()
  .middleware([authRequiredMiddleware])
  .handler(async ({ context }) => {
    return context.db
      .select()
      .from(buckets)
      .where(and(eq(buckets.userId, context.session.user.id), eq(buckets.status, 'active')))
  })

// TODO: think if the parent folder should be called functions / fn / api / apis
