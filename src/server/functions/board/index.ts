import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createPrivateOperation, validateInput } from '@/server/core'
import { createBoardRepository } from '@/server/db/board-repository'
import { completeDayForUser, getBoardForUser, reconcileLifecycleForUser } from '@/server/functions/board/lifecycle'
import { confirmMigrationStepForUser, getMigrationStepForUser } from '@/server/functions/board/operations'
import {
  BoardResponse,
  BucketsResponse,
  CompleteDayInput,
  CompleteDayResponse,
  ConfirmMigrationStepInput,
  ConfirmMigrationStepResponse,
  GetBoardInput,
  GetBucketsInput,
  GetMigrationStepInput,
  MigrationStepResponse,
  ReconcileLifecycleInput,
  ReconcileLifecycleResponse,
} from '@/server/functions/board/schemas'

export const getBoard = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'board.get', response: BoardResponse })])
  .validator(validateInput(GetBoardInput))
  .handler(async ({ context }): Promise<z.output<typeof BoardResponse>> => {
    return getBoardForUser({
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const reconcileLifecycle = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'board.reconcileLifecycle', response: ReconcileLifecycleResponse })])
  .validator(validateInput(ReconcileLifecycleInput))
  .handler(async ({ context, data }): Promise<z.output<typeof ReconcileLifecycleResponse>> => {
    return reconcileLifecycleForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const completeDay = createServerFn({ method: 'POST' })
  .middleware([createPrivateOperation({ operation: 'board.completeDay', response: CompleteDayResponse })])
  .validator(validateInput(CompleteDayInput))
  .handler(async ({ data, context }): Promise<z.output<typeof CompleteDayResponse>> => {
    return completeDayForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const getMigrationStep = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'board.getMigrationStep', response: MigrationStepResponse })])
  .validator(validateInput(GetMigrationStepInput))
  .handler(async ({ data, context }): Promise<z.output<typeof MigrationStepResponse>> => {
    return getMigrationStepForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const confirmMigrationStep = createServerFn({ method: 'POST' })
  .middleware([
    createPrivateOperation({ operation: 'board.confirmMigrationStep', response: ConfirmMigrationStepResponse }),
  ])
  .validator(validateInput(ConfirmMigrationStepInput))
  .handler(async ({ data, context }): Promise<z.output<typeof ConfirmMigrationStepResponse>> => {
    return confirmMigrationStepForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

// Temporary #98 exception: standalone Bucket access is removed when board consequences replace it.
export const getBuckets = createServerFn({ method: 'GET' })
  .middleware([createPrivateOperation({ operation: 'board.getBuckets', response: BucketsResponse })])
  .validator(validateInput(GetBucketsInput))
  .handler(async ({ context }): Promise<z.output<typeof BucketsResponse>> => {
    return createBoardRepository(context.db).getActiveBuckets(context.user.id)
  })
