import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { createVerifiedUserMiddleware, validateInput } from '@/server/core'
import { createBoardRepository } from '@/server/db/board-repository'
import { finishTodayForUser, getBoardForUser, reconcileLifecycleForUser } from '@/server/functions/board/lifecycle'
import { confirmMigrationStepForUser, getMigrationStepForUser } from '@/server/functions/board/operations'
import { boardChangedHint } from '@/server/functions/board/realtime-hints'
import {
  BoardResponse,
  ConfirmMigrationStepInput,
  ConfirmMigrationStepResponse,
  FinishTodayInput,
  FinishTodayResponse,
  GetBoardInput,
  GetMigrationStepInput,
  MigrationStepResponse,
  ReconcileLifecycleInput,
  ReconcileLifecycleResponse,
} from '@/server/functions/board/schemas'

export const getBoard = createServerFn({ method: 'GET' })
  .middleware([createVerifiedUserMiddleware({ operation: 'board.get', response: BoardResponse })])
  .validator(validateInput(GetBoardInput))
  .handler(async ({ context }): Promise<z.output<typeof BoardResponse>> => {
    return getBoardForUser({
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const reconcileLifecycle = createServerFn({ method: 'POST' })
  .middleware([
    createVerifiedUserMiddleware({
      hints: boardChangedHint,
      operation: 'board.reconcileLifecycle',
      response: ReconcileLifecycleResponse,
    }),
  ])
  .validator(validateInput(ReconcileLifecycleInput))
  .handler(async ({ context, data }): Promise<z.output<typeof ReconcileLifecycleResponse>> => {
    return reconcileLifecycleForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const finishToday = createServerFn({ method: 'POST' })
  .middleware([
    createVerifiedUserMiddleware({
      hints: boardChangedHint,
      operation: 'board.finishToday',
      response: FinishTodayResponse,
    }),
  ])
  .validator(validateInput(FinishTodayInput))
  .handler(async ({ data, context }): Promise<z.output<typeof FinishTodayResponse>> => {
    return finishTodayForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })

export const getMigrationStep = createServerFn({ method: 'GET' })
  .middleware([createVerifiedUserMiddleware({ operation: 'board.getMigrationStep', response: MigrationStepResponse })])
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
    createVerifiedUserMiddleware({
      hints: boardChangedHint,
      operation: 'board.confirmMigrationStep',
      response: ConfirmMigrationStepResponse,
    }),
  ])
  .validator(validateInput(ConfirmMigrationStepInput))
  .handler(async ({ data, context }): Promise<z.output<typeof ConfirmMigrationStepResponse>> => {
    return confirmMigrationStepForUser({
      data,
      repository: createBoardRepository(context.db),
      userId: context.user.id,
    })
  })
